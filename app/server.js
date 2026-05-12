exports.run = function () {
  // attach nvim
  const { plugin } = require('./nvim')
  const fs = require('fs')
  const http = require('http')
  const path = require('path')
  const websocket = require('socket.io')

  const opener = require('./lib/util/opener')
  const logger = require('./lib/util/logger')('app/server')
  const { getIP } = require('./lib/util/getIP')
  const {
    getReviewCommentsSnapshot,
    applyReviewCommentsAction
  } = require('./lib/util/reviewComments')
  const routes = require('./routes')

  let clients = {}

  const MARKDOWN_FILE_REGEXP = /\.(md|markdown|mdown|mkdn|mkd)$/i

  function splitHrefTarget (href = '') {
    const hashIndex = href.indexOf('#')
    const hash = hashIndex >= 0 ? href.slice(hashIndex) : ''
    const hrefWithoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href
    const queryIndex = hrefWithoutHash.indexOf('?')

    return {
      pathname: queryIndex >= 0 ? hrefWithoutHash.slice(0, queryIndex) : hrefWithoutHash,
      hash
    }
  }

  function isExternalHref (href = '') {
    if (/^[a-zA-Z]:[\\/]/.test(href)) {
      return false
    }
    return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)
  }

  function isMarkdownFilePath (filePath = '') {
    return MARKDOWN_FILE_REGEXP.test(filePath)
  }

  function resolveMarkdownLinkPath (currentFilePath, href = '') {
    if (!href || href[0] === '#' || isExternalHref(href)) {
      return null
    }

    const { pathname, hash } = splitHrefTarget(href)
    if (!pathname) {
      return null
    }

    let decodedPathname = pathname
    try {
      decodedPathname = decodeURIComponent(pathname)
    } catch (e) {}

    if (!isMarkdownFilePath(decodedPathname)) {
      return null
    }

    const baseDir = currentFilePath ? path.dirname(currentFilePath) : process.cwd()
    const resolvedPath = path.normalize(path.isAbsolute(decodedPathname)
      ? decodedPathname
      : path.resolve(baseDir, decodedPathname))

    return {
      resolvedPath,
      hash
    }
  }

  async function ensureBufferLoadedForPath (filePath) {
    let bufnr = Number(await plugin.nvim.call('bufnr', [filePath]))
    if (!bufnr || bufnr < 0) {
      bufnr = Number(await plugin.nvim.call('bufadd', [filePath]))
    }

    if (!bufnr || bufnr < 0) {
      return null
    }

    await plugin.nvim.call('bufload', [bufnr])
    await plugin.nvim.call('mkdp#autocmd#init_buf', [bufnr])
    return bufnr
  }

  async function openMarkdownLinkTarget ({ currentFilePath, href }) {
    if (isExternalHref(href)) {
      return {
        ok: false,
        kind: 'external',
        href,
        error: 'External links should be opened by the browser'
      }
    }

    const resolved = resolveMarkdownLinkPath(currentFilePath, href)
    if (!resolved) {
      return {
        ok: false,
        error: 'Only local markdown file links are supported in preview navigation'
      }
    }

    const { resolvedPath, hash } = resolved
    if (!fs.existsSync(resolvedPath)) {
      return {
        ok: false,
        error: `Markdown file not found: ${resolvedPath}`
      }
    }

    if (fs.statSync(resolvedPath).isDirectory()) {
      return {
        ok: false,
        error: `Target is a directory, not a markdown file: ${resolvedPath}`
      }
    }

    const bufnr = await ensureBufferLoadedForPath(resolvedPath)
    if (!bufnr) {
      return {
        ok: false,
        error: `Failed to open markdown buffer: ${resolvedPath}`
      }
    }

    return {
      ok: true,
      bufnr,
      path: resolvedPath,
      hash
    }
  }

  const openUrl = (url, browser) => {
    const handler = opener(url, browser)
    handler.on('error', (err) => {
      const message = err.message || ''
      const match = message.match(/\s*spawn\s+(.+)\s+ENOENT\s*/)
      if (match) {
        plugin.nvim.call('mkdp#util#echo_messages', ['Error', [`[markdown-preview.nvim]: Can not open browser by using ${match[1]} command`]])
      } else {
        plugin.nvim.call('mkdp#util#echo_messages', ['Error', [err.name, err.message]])
      }
    })
  }

  const update_clients_active_var = () => {
    if (Object.values(clients).some(cs => cs.some(c => c.connected))) {
      plugin.nvim.setVar('mkdp_clients_active', 1)
    } else {
      plugin.nvim.setVar('mkdp_clients_active', 0)
    }
  }

  // http server
  const server = http.createServer(async (req, res) => {
    // plugin
    req.plugin = plugin
    // bufnr
    req.bufnr = (req.headers.referer || req.url)
      .replace(/[?#].*$/, '').split('/').pop()
    // request path
    req.asPath = req.url.replace(/[?#].*$/, '')
    req.mkcss = await plugin.nvim.getVar('mkdp_markdown_css')
    req.hicss = await plugin.nvim.getVar('mkdp_highlight_css')
    req.custImgPath = await plugin.nvim.getVar('mkdp_images_path')
    // routes
    routes(req, res)
  })

  // websocket server
  const io = websocket(server)

  async function buildClientData (bufnr) {
    const buffers = await plugin.nvim.buffers
    const buffer = buffers.find(b => b.id === Number(bufnr))
    if (!buffer) {
      return null
    }

    const winline = await plugin.nvim.call('winline')
    const currentWindow = await plugin.nvim.window
    const winheight = await plugin.nvim.call('winheight', currentWindow.id)
    const cursor = await plugin.nvim.call('getpos', '.')
    const options = await plugin.nvim.getVar('mkdp_preview_options')
    const pageTitle = await plugin.nvim.getVar('mkdp_page_title')
    const theme = await plugin.nvim.getVar('mkdp_theme')
    const name = await buffer.name
    const content = await buffer.getLines()
    const currentBuffer = await plugin.nvim.buffer
    const reviewComments = await getReviewCommentsSnapshot(plugin.nvim, bufnr)

    return {
      options,
      isActive: currentBuffer.id === buffer.id,
      winline,
      winheight,
      cursor,
      pageTitle,
      theme,
      name,
      content,
      reviewComments
    }
  }

  io.on('connection', async (client) => {
    const { handshake = { query: {} } } = client
    const bufnr = handshake.query.bufnr

    logger.info('client connect: ', client.id, bufnr)

    clients[bufnr] = clients[bufnr] || []
    clients[bufnr].push(client)
    // update vim variable
    update_clients_active_var();

    const data = await buildClientData(bufnr)
    if (data) {
      client.emit('refresh_content', data)
    }

    client.on('review_comment_apply', async function ({ action, payload } = {}) {
      const result = await applyReviewCommentsAction(plugin.nvim, bufnr, action, payload)
      client.emit('review_comment_apply_result', result)

      if (result && result.ok) {
        const nextData = await buildClientData(bufnr)
        if (nextData) {
          ;(clients[bufnr] || []).forEach(c => {
            if (c.connected) {
              c.emit('refresh_content', nextData)
            }
          })
        }
      }
    })

    client.on('open_markdown_link', async function ({ currentFilePath, href } = {}) {
      const result = await openMarkdownLinkTarget({ currentFilePath, href })
      client.emit('open_markdown_link_result', result)
    })

    client.on('disconnect', function () {
      logger.info('disconnect: ', client.id)
      clients[bufnr] = (clients[bufnr] || []).filter(c => c.id !== client.id)
      // update vim variable
      update_clients_active_var();
    })
  })

  async function startServer () {
    const openToTheWord = await plugin.nvim.getVar('mkdp_open_to_the_world')
    const host = openToTheWord ? '0.0.0.0' : '127.0.0.1'
    let port = await plugin.nvim.getVar('mkdp_port')
    port = port || (8080 + Number(`${Date.now()}`.slice(-3)))
    server.listen({
      host,
      port
    }, function () {
      logger.info('server run: ', port)
      function refreshPage ({ bufnr, data }) {
        logger.info('refresh page: ', bufnr)
        ;(clients[bufnr] || []).forEach(c => {
          if (c.connected) {
            c.emit('refresh_content', data)
          }
        })
      }
      function closePage ({ bufnr }) {
        logger.info('close page: ', bufnr)
        clients[bufnr] = (clients[bufnr] || []).filter(c => {
          if (c.connected) {
            c.emit('close_page')
            return false
          }
          return true
        })
      }
      function closeAllPages () {
        logger.info('close all pages')
        Object.keys(clients).forEach(bufnr => {
          ;(clients[bufnr] || []).forEach(c => {
            if (c.connected) {
              c.emit('close_page')
            }
          })
        })
        clients = {}
      }
      async function openBrowser ({ bufnr }) {
        const combinePreview = await plugin.nvim.getVar('mkdp_combine_preview')
        if (combinePreview && Object.values(clients).some(cs => cs.some(c => c.connected))) {
          logger.info(`combine preview page: `, bufnr)
          Object.values(clients).forEach(cs => {
            cs.forEach(c => {
              if (c.connected) {
                c.emit('change_bufnr', bufnr)
              }
            })
          })
        } else {
          const openIp = await plugin.nvim.getVar('mkdp_open_ip')
          const openHost = openIp !== '' ? openIp : (openToTheWord ? getIP() : 'localhost')
          const url = `http://${openHost}:${port}/page/${bufnr}`
          const browserfunc = await plugin.nvim.getVar('mkdp_browserfunc')
          if (browserfunc !== '') {
            logger.info(`open page [${browserfunc}]: `, url)
            plugin.nvim.call(browserfunc, [url])
          } else {
            const browser = await plugin.nvim.getVar('mkdp_browser')
            logger.info(`open page [${browser || 'default'}]: `, url)
            if (browser !== '') {
              openUrl(url, browser)
            } else {
              openUrl(url)
            }
          }
          const isEchoUrl = await plugin.nvim.getVar('mkdp_echo_preview_url')
          if (isEchoUrl) {
            plugin.nvim.call('mkdp#util#echo_url', [url])
          }
        }
      }
      plugin.init({
        refreshPage,
        closePage,
        closeAllPages,
        openBrowser
      })

      plugin.nvim.call('mkdp#util#open_browser')
    })
  }

  startServer()
}
