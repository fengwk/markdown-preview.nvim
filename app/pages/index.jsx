import React from 'react'
import Head from 'next/head'
import io from 'socket.io-client'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import emoji from 'markdown-it-emoji'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import markdownItAnchor from 'markdown-it-anchor'
import markdownItToc from 'markdown-it-toc-done-right'
import markdownDeflist from 'markdown-it-deflist'

import mk from './katex'
import chart from './chart'
import mkitMermaid from './mermaid'
import linenumbers from './linenumbers'
import image from './image'
import diagram, { renderDiagram } from './diagram'
import flowchart, { renderFlowchart } from './flowchart'
import dot, { renderDot } from './dot'
import blockUml from './blockPlantuml'
import codeUml from './plantuml'
import scrollToLine from './scroll'
import { renderReviewComments } from './review-comments'
import { meta } from './meta';
import markdownImSize from './markdown-it-imsize'
import { escape} from './utils';

function rerenderMermaid(theme, options = {}) {
  const mermaidNodes = Array.from(document.querySelectorAll('.mermaid'))
  mermaidNodes.forEach((node) => {
    const source = node.getAttribute('data-mermaid-source')
    if (!source) {
      return
    }

    node.removeAttribute('data-processed')
    node.innerHTML = escape(decodeURIComponent(source))
  })

  try {
    // eslint-disable-next-line
    mermaid.initialize({ theme: (theme || 'light'), ...options })
    // eslint-disable-next-line
    mermaid.init(undefined, mermaidNodes)
  } catch (e) { }
}

const anchorSymbol = '<svg class="octicon octicon-link" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M4 9h1v1H4c-1.5 0-3-1.69-3-3.5S2.55 3 4 3h4c1.45 0 3 1.69 3 3.5 0 1.41-.91 2.72-2 3.25V8.59c.58-.45 1-1.27 1-2.09C10 5.22 8.98 4 8 4H4c-.98 0-2 1.22-2 2.5S3 9 4 9zm9-3h-1v1h1c1 0 2 1.22 2 2.5S13.98 12 13 12H9c-.98 0-2-1.22-2-2.5 0-.83.42-1.64 1-2.09V6.25c-1.09.53-2 1.84-2 3.25C6 11.31 7.55 13 9 13h4c1.45 0 3-1.69 3-3.5S14.5 6 13 6z"></path></svg>'

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

function shouldHandleLocalMarkdownHref (href = '') {
  if (!href || href[0] === '#' || isExternalHref(href)) {
    return false
  }

  const { pathname } = splitHrefTarget(href)
  return Boolean(pathname) && MARKDOWN_FILE_REGEXP.test(pathname)
}

function getClosestAnchorElement (target) {
  const element = target && target.nodeType === Node.TEXT_NODE ? target.parentElement : target
  if (!element || typeof element.closest !== 'function') {
    return null
  }
  return element.closest('a')
}

function buildPreviewUrl (bufnr, hash = '') {
  const normalizedHash = hash || ''
  return `/page/${bufnr}${normalizedHash}`
}

function buildOutlineItemsFromHtml (html = '') {
  if (typeof window === 'undefined' || !html) {
    return []
  }

  const parser = new window.DOMParser()
  const doc = parser.parseFromString(`<div id="preview-outline-root">${html}</div>`, 'text/html')
  const root = doc.getElementById('preview-outline-root')
  if (!root) {
    return []
  }

  return Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .map((heading) => {
      const id = heading.getAttribute('id') || ''
      const level = Number(heading.tagName.slice(1))
      const clone = heading.cloneNode(true)
      clone.querySelectorAll('.anchor').forEach((anchor) => anchor.remove())
      const text = (clone.textContent || '').replace(/\s+/g, ' ').trim()

      return {
        id,
        level,
        text
      }
    })
    .filter((item) => item.id && item.text)
}

const DEFAULT_OPTIONS = {
  mkit: {
    // Enable HTML tags in source
    html: true,
    // Use '/' to close single tags (<br />).
    // This is only for full CommonMark compatibility.
    xhtmlOut: true,
    // Convert '\n' in paragraphs into <br>
    breaks: false,
    // CSS language prefix for fenced blocks. Can be
    // useful for external highlighters.
    langPrefix: 'language-',
    // Autoconvert URL-like text to links
    linkify: true,
    // Enable some language-neutral replacement + quotes beautification
    typographer: true,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: '“”‘’',
    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externally.
    // If result starts with <pre... internal wrapper is skipped.
      highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return `<pre class="hljs"><code>${
             hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
           }</code></pre>`;
          } catch (__) {}
        }

      return `<pre class="hljs"><code>${escape(str)}</code></pre>`;
    },
  },
  katex: {
    'throwOnError': false,
    'errorColor': ' #cc0000'
  },
  uml: {},
  toc: {
    listType: 'ul'
  }
}

export default class PreviewPage extends React.Component {
  constructor(props) {
    super(props)

    this.preContent = ''
    this.preReviewCommentsSignature = ''
    this.timer = undefined
    this.bufnr = -1;
    this.reviewComments = { comments: [] }
    this.lastMaidOptions = {}
    this.suppressInitialScroll = true
    this.lastScrollCursorKey = null
    this.currentFilePath = ''
    this.pendingAnchorHash = ''
    this.pendingNavigation = false

    this.state = {
      name: '',
      cursor: '',
      content: '',
      pageTitle: '',
      theme: '',
      renderNonce: 0,
      themeModeIsVisible: false,
      contentEditable: false,
      disableFilename: 1,
      outlineItems: [],
      activeOutlineId: ''
    }
    this.outlinePanelRef = React.createRef()
    this.outlineScrollerRef = React.createRef()
    this.outlineSyncFrameId = null
    this.showThemeButton = this.showThemeButton.bind(this)
    this.hideThemeButton = this.hideThemeButton.bind(this)
    this.handleThemeChange = this.handleThemeChange.bind(this)
    this.applyReviewComment = this.applyReviewComment.bind(this)
    this.applyDocumentTheme = this.applyDocumentTheme.bind(this)
    this.captureViewportState = this.captureViewportState.bind(this)
    this.restoreViewportState = this.restoreViewportState.bind(this)
    this.restorePendingAnchor = this.restorePendingAnchor.bind(this)
    this.shouldSyncScroll = this.shouldSyncScroll.bind(this)
    this.openMarkdownLink = this.openMarkdownLink.bind(this)
    this.handleDocumentClick = this.handleDocumentClick.bind(this)
    this.handlePopState = this.handlePopState.bind(this)
    this.handleOutlineClick = this.handleOutlineClick.bind(this)
    this.syncActiveOutline = this.syncActiveOutline.bind(this)
    this.scheduleActiveOutlineSync = this.scheduleActiveOutlineSync.bind(this)
  }

  handleThemeChange() {
    const currentTheme = this.state.theme || (
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    )
    const theme = currentTheme === 'dark' ? 'light' : 'dark'
    const viewportState = this.captureViewportState()
    this.setState({
      theme,
      renderNonce: this.state.renderNonce + 1,
      ...(this.md && this.preContent
        ? { content: this.md.render(this.preContent) }
        : {})
    }, () => {
      this.applyDocumentTheme(theme)
      if (this.md && this.preContent) {
        rerenderMermaid(this.state.theme || 'light', this.lastMaidOptions)

        chart.render()
        renderDiagram()
        renderFlowchart()
        renderDot()
        renderReviewComments({
          snapshot: this.reviewComments,
          sourceLineCount: this.preContent.split('\n').length,
          onApplyComment: this.applyReviewComment
        })
        this.restoreViewportState(viewportState)
      }
    })
  }

  showThemeButton() {
    this.setState({ themeModeIsVisible: true })
  }

  hideThemeButton() {
    this.setState({ themeModeIsVisible: false })
  }

  applyReviewComment(action, payload) {
    const socket = window.socket
    if (!socket) {
      return Promise.resolve({
        ok: false,
        error: 'Preview socket is disconnected'
      })
    }

    return new Promise((resolve) => {
      socket.once('review_comment_apply_result', resolve)
      socket.emit('review_comment_apply', {
        action,
        payload: {
          ...payload,
          revision: this.reviewComments && this.reviewComments.revision
        }
      })
    })
  }

  applyDocumentTheme(theme) {
    if (typeof document === 'undefined' || !theme) {
      return
    }

    document.documentElement.setAttribute('data-theme', theme)
    document.body.setAttribute('data-theme', theme)
    const main = document.querySelector('main')
    if (main) {
      main.setAttribute('data-theme', theme)
    }
  }

  captureViewportState() {
    return {
      top: window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0,
      left: window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0
    }
  }

  restoreViewportState({ top = 0, left = 0 } = {}) {
    window.scrollTo(left, top)
  }

  restorePendingAnchor() {
    const hash = this.pendingAnchorHash
    if (!hash) {
      return false
    }

    this.pendingAnchorHash = ''
    window.requestAnimationFrame(() => {
      const targetId = decodeURIComponent(hash.replace(/^#/, ''))
      const target = targetId ? document.getElementById(targetId) : null
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView()
      } else {
        const previousHash = window.location.hash
        if (previousHash === hash) {
          window.location.hash = ''
        }
        window.location.hash = hash
      }
    })
    return true
  }

  shouldSyncScroll({ cursor, winline, winheight, options }) {
    const cursorKey = `${this.bufnr}:${cursor[1]}:${winline}:${winheight}:${options.sync_scroll_type || 'middle'}`

    if (this.suppressInitialScroll) {
      this.suppressInitialScroll = false
      this.lastScrollCursorKey = cursorKey
      return false
    }

    const cursorMoved = this.lastScrollCursorKey !== cursorKey
    this.lastScrollCursorKey = cursorKey
    return cursorMoved
  }

  startSocket(bufnr, options = {}) {
    const {
      historyMode = 'replace',
      hash = window.location.hash || ''
    } = options

    if (this.bufnr === bufnr) {
      return;
    }
    this.bufnr = bufnr;

    // Close the previous socket
    const tmpSocket = window.socket

    if (historyMode === 'push') {
      window.history.pushState({ bufnr }, '', buildPreviewUrl(bufnr, hash))
    } else if (historyMode === 'replace') {
      window.history.replaceState({ bufnr }, '', buildPreviewUrl(bufnr, hash))
    }

    const socket = io({
      query: {
        bufnr
      }
    })

    window.socket = socket

    socket.on('connect', this.onConnect.bind(this))

    socket.on('disconnect', this.onDisconnect.bind(this))

    socket.on('close', this.onClose.bind(this))

    socket.on('refresh_content', this.onRefreshContent.bind(this))

    socket.on('close_page', this.onClose.bind(this))

    socket.on('change_bufnr', this.onChangeBufnr.bind(this))

    if (tmpSocket) {
      tmpSocket.close()
    }
  }

  getBufnrFromPathname() {
    const pathname = window.location.pathname.replace(/\/+$/, '')
    return parseFloat(pathname.split('/').pop())
  }

  componentDidMount() {
    this.suppressInitialScroll = true
    document.addEventListener('click', this.handleDocumentClick)
    window.addEventListener('popstate', this.handlePopState)
    window.addEventListener('scroll', this.scheduleActiveOutlineSync, { passive: true })
    window.addEventListener('resize', this.scheduleActiveOutlineSync)
    this.pendingAnchorHash = window.location.hash || ''
    this.startSocket(this.getBufnrFromPathname(), {
      historyMode: 'replace',
      hash: window.location.hash || ''
    })
  }

  componentWillUnmount() {
    document.removeEventListener('click', this.handleDocumentClick)
    window.removeEventListener('popstate', this.handlePopState)
    window.removeEventListener('scroll', this.scheduleActiveOutlineSync)
    window.removeEventListener('resize', this.scheduleActiveOutlineSync)
    if (this.outlineSyncFrameId !== null) {
      window.cancelAnimationFrame(this.outlineSyncFrameId)
      this.outlineSyncFrameId = null
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.theme !== this.state.theme) {
      this.applyDocumentTheme(this.state.theme)
    }

    if (prevState.activeOutlineId !== this.state.activeOutlineId) {
      const scroller = this.outlineScrollerRef.current
      const activeButton = scroller && scroller.querySelector('.preview-outline-link.is-active')
      if (activeButton && typeof activeButton.scrollIntoView === 'function') {
        activeButton.scrollIntoView({ block: 'nearest' })
      }
    }
  }

  onConnect() {
    console.log('connect success')
  }

  onDisconnect() {
    console.log('disconnect')
  }

  onClose() {
    console.log('close')
    window.close()
  }

  onChangeBufnr(bufnr) {
    this.startSocket(bufnr, {
      historyMode: 'replace'
    })
  }

  handlePopState() {
    const nextBufnr = this.getBufnrFromPathname()
    this.pendingAnchorHash = window.location.hash || ''

    if (Number(nextBufnr) === Number(this.bufnr)) {
      if (!this.restorePendingAnchor()) {
        this.restoreViewportState({ top: 0, left: 0 })
      }
      return
    }

    this.pendingNavigation = true
    this.startSocket(nextBufnr, {
      historyMode: 'none'
    })
  }

  handleOutlineClick(item) {
    if (!item || !item.id) {
      return
    }

    const hash = `#${encodeURIComponent(item.id)}`
    const target = document.getElementById(item.id)
    if (window.location.hash === hash) {
      window.history.replaceState({ bufnr: this.bufnr }, '', buildPreviewUrl(this.bufnr, hash))
    } else {
      window.history.pushState({ bufnr: this.bufnr }, '', buildPreviewUrl(this.bufnr, hash))
    }

    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView()
    }

    if (this.state.activeOutlineId !== item.id) {
      this.setState({ activeOutlineId: item.id })
    }
  }

  syncActiveOutline() {
    this.outlineSyncFrameId = null

    const { outlineItems = [], activeOutlineId = '' } = this.state
    if (!outlineItems.length) {
      if (activeOutlineId) {
        this.setState({ activeOutlineId: '' })
      }
      return
    }

    const headings = outlineItems
      .map((item) => ({ item, element: document.getElementById(item.id) }))
      .filter(({ element }) => element)

    if (!headings.length) {
      if (activeOutlineId) {
        this.setState({ activeOutlineId: '' })
      }
      return
    }

    const activationOffset = 120
    let nextActiveId = headings[0].item.id
    headings.forEach(({ item, element }) => {
      if (element.getBoundingClientRect().top <= activationOffset) {
        nextActiveId = item.id
      }
    })

    if (nextActiveId !== activeOutlineId) {
      this.setState({ activeOutlineId: nextActiveId })
    }
  }

  scheduleActiveOutlineSync() {
    if (this.outlineSyncFrameId !== null) {
      return
    }

    this.outlineSyncFrameId = window.requestAnimationFrame(() => {
      this.syncActiveOutline()
    })
  }

  async openMarkdownLink(href) {
    const socket = window.socket
    if (!socket) {
      window.alert('Preview socket is disconnected')
      return
    }

    const result = await new Promise((resolve) => {
      socket.once('open_markdown_link_result', resolve)
      socket.emit('open_markdown_link', {
        currentFilePath: this.currentFilePath,
        href
      })
    })

    if (!result || !result.ok) {
      if (result && result.kind === 'external' && result.href) {
        window.location.assign(result.href)
        return
      }

      window.alert(result && result.error ? result.error : `Failed to open markdown link: ${href}`)
      return
    }

    this.pendingAnchorHash = result.hash || ''
    this.pendingNavigation = true

    if (Number(result.bufnr) === Number(this.bufnr)) {
      window.history.pushState({ bufnr: this.bufnr }, '', buildPreviewUrl(this.bufnr, this.pendingAnchorHash))
      this.pendingNavigation = false
      if (!this.restorePendingAnchor()) {
        this.restoreViewportState({ top: 0, left: 0 })
      }
      return
    }

    this.startSocket(result.bufnr, {
      historyMode: 'push',
      hash: result.hash || ''
    })
  }

  handleDocumentClick(event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    const link = getClosestAnchorElement(event.target)
    if (!link || link.target === '_blank' || link.hasAttribute('download')) {
      return
    }

    const markdownRoot = document.querySelector('.markdown-body')
    if (!markdownRoot || !markdownRoot.contains(link)) {
      return
    }

    const href = link.getAttribute('href') || ''
    if (!shouldHandleLocalMarkdownHref(href)) {
      return
    }

    event.preventDefault()
    this.openMarkdownLink(href)
  }

  onRefreshContent({
    options = {},
    isActive,
    winline,
    winheight,
    cursor,
    pageTitle = '',
    theme,
    name = '',
    content,
    reviewComments = { comments: [] }
  }) {
    if (!this.md) {
      const {
        mkit = {},
        katex = {},
        uml = {},
        hide_yaml_meta: hideYamlMeta = 1,
        sequence_diagrams: sequenceDiagrams = {},
        flowchart_diagrams: flowchartDiagrams = {},
        toc = {}
      } = options
      this.lastMaidOptions = options.maid || {}
      // markdown-it
      this.md = new MarkdownIt({
        ...DEFAULT_OPTIONS.mkit,
        ...mkit
      })
      if (hideYamlMeta === 1) {
        this.md.use(meta([['---', '\\.\\.\\.'], ['---', '\\.\\.\\.']]))
      }
      // katex
      this.md
        .use(mk, {
          ...DEFAULT_OPTIONS.katex,
          ...katex
        })
        .use(blockUml, {
          ...DEFAULT_OPTIONS.uml,
          ...uml
        })
        .use(codeUml, {
          ...DEFAULT_OPTIONS.uml,
          ...uml
        })
        .use(emoji)
        .use(taskLists)
        .use(markdownDeflist)
        .use(footnote)
        .use(image)
        .use(markdownImSize)
        .use(mkitMermaid)
        .use(chart.chartPlugin)
        .use(diagram, {
          ...sequenceDiagrams
        })
        .use(flowchart, flowchartDiagrams)
        .use(dot)
        .use(markdownItAnchor, {
          permalink: true,
          permalinkBefore: true,
          permalinkSymbol: anchorSymbol,
          permalinkClass: 'anchor'
        })
        .use(markdownItToc, {
          ...DEFAULT_OPTIONS.toc,
          ...toc
        })
        .use(linenumbers)
    }

    // Theme already applied
    if (this.state.theme) {
      theme = this.state.theme
    }
    // Define the theme according to the preferences of the system
    else if (!theme || !['light', 'dark'].includes(theme)) {
      if (
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        theme = 'dark'
      }
    }

    const newContent = content.join('\n')
    const refreshContent = this.preContent !== newContent
    const refreshTheme = Boolean(this.state.theme) && this.state.theme !== theme
    const renderedContent = (refreshContent || refreshTheme)
      ? this.md.render(newContent)
      : this.state.content
    const nextOutlineItems = buildOutlineItemsFromHtml(renderedContent)
    const reviewCommentsSignature = JSON.stringify(reviewComments || { comments: [] })
    const refreshComments = this.preReviewCommentsSignature !== reviewCommentsSignature
    this.preContent = newContent
    this.preReviewCommentsSignature = reviewCommentsSignature
    this.reviewComments = reviewComments || { comments: [] }
    this.currentFilePath = name

    const shouldSyncScroll = this.shouldSyncScroll({ cursor, winline, winheight, options })
    const navigationPending = this.pendingNavigation
    const viewportState = navigationPending ? { top: 0, left: 0 } : this.captureViewportState()

    const refreshScroll = () => {
      if (navigationPending) {
        this.pendingNavigation = false
        if (!this.restorePendingAnchor()) {
          this.restoreViewportState({ top: 0, left: 0 })
        }
        return
      }

      if (isActive && !options.disable_sync_scroll && shouldSyncScroll) {
        scrollToLine[options.sync_scroll_type || 'middle']({
          cursor: cursor[1],
          winline,
          winheight,
          len: content.length
        })
      } else {
        this.restoreViewportState(viewportState)
      }
    }

    const refreshRender = () => {
      this.setState({
        cursor,
        name: ((name) => {
          let tokens = name.split(/\\|\//).pop().split('.');
          return tokens.length > 1 ? tokens.slice(0, -1).join('.') : tokens[0];
        })(name),
        ...(
          (refreshContent || refreshTheme)
          ? { content: renderedContent }
          : {}
        ),
        pageTitle,
        theme,
        renderNonce: this.state.renderNonce,
        contentEditable: options.content_editable,
        disableFilename: options.disable_filename,
        outlineItems: nextOutlineItems,
        activeOutlineId: nextOutlineItems.length ? (nextOutlineItems.some((item) => item.id === this.state.activeOutlineId) ? this.state.activeOutlineId : nextOutlineItems[0].id) : ''
      }, () => {
        this.applyDocumentTheme(theme)
        if (refreshContent || refreshTheme) {
          rerenderMermaid(this.state.theme || 'light', options.maid || {})

          chart.render()
          renderDiagram()
          renderFlowchart()
          renderDot()
        }
        renderReviewComments({
          snapshot: this.reviewComments,
          sourceLineCount: content.length,
          onApplyComment: this.applyReviewComment
        })
        this.scheduleActiveOutlineSync()
        refreshScroll()
      })
    }

    if (!this.preContent) {
      refreshRender()
    } else {
      if (!refreshContent && !refreshComments && !refreshTheme) {
        refreshScroll()
      } else {
        if (this.timer) {
          clearTimeout(this.timer)
        }
        this.timer = setTimeout(() => {
          refreshRender()
        }, 16);
      }
    }
  }

  render() {
    const {
      theme,
      content,
      name,
      pageTitle,
      themeModeIsVisible,
      contentEditable,
      disableFilename,
      renderNonce,
      outlineItems,
      activeOutlineId,
    } = this.state

    const outlineBaseLevel = outlineItems.length
      ? Math.min(...outlineItems.map((item) => item.level))
      : 1

    return (
      <React.Fragment>
        <Head>
          <title>{(pageTitle || '').replace(/\$\{name\}/, name)}</title>
          <link rel="shortcut icon" type="image/ico" href="/_static/favicon.ico" />
          <link rel="stylesheet" href="/_static/page.css" />
          <link rel="stylesheet" href="/_static/markdown.css" />
          <link rel="stylesheet" href="/_static/highlight.css" />
          <link rel="stylesheet" href="/_static/katex@0.15.3.css" />
          <link rel="stylesheet" href="/_static/sequence-diagram-min.css" />
          <script type="text/javascript" src="/_static/underscore-min.js"></script>
          <script type="text/javascript" src="/_static/webfont.js"></script>
          <script type="text/javascript" src="/_static/snap.svg.min.js"></script>
          <script type="text/javascript" src="/_static/tweenlite.min.js"></script>
          <script type="text/javascript" src="/_static/mermaid.min.js"></script>
          <script type="text/javascript" src="/_static/sequence-diagram-min.js"></script>
          <script type="text/javascript" src="/_static/katex@0.15.3.js"></script>
          <script type="text/javascript" src="/_static/mhchem.min.js"></script>
          <script type="text/javascript" src="/_static/raphael@2.3.0.min.js"></script>
          <script type="text/javascript" src="/_static/flowchart@1.13.0.min.js"></script>
          <script type="text/javascript" src="/_static/viz.js"></script>
          <script type="text/javascript" src="/_static/full.render.js"></script>
        </Head>
        <main data-theme={this.state.theme}>
          <aside
            ref={this.outlinePanelRef}
            className={`preview-outline-panel${outlineItems.length ? '' : ' preview-outline-panel-hidden'}`}
            aria-label="Document outline"
          >
            <div className="preview-outline-header">Outline</div>
            <div ref={this.outlineScrollerRef} className="preview-outline-scroller">
              <ol className="preview-outline-list">
                {outlineItems.map((item) => (
                  <li key={item.id} className="preview-outline-item">
                    <button
                      type="button"
                      className={`preview-outline-link${activeOutlineId === item.id ? ' is-active' : ''}`}
                      style={{ '--outline-depth': `${Math.max(item.level - outlineBaseLevel, 0) * 14}px` }}
                      onClick={() => this.handleOutlineClick(item)}
                      title={item.text}
                    >
                      <span className="preview-outline-link-text">{item.text}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
          <div id="page-scroll">
            <div id="page-ctn" contentEditable={contentEditable ? 'true' : 'false'}>
              { disableFilename == 0 &&
                <header
                  id="page-header"
                  onMouseEnter={this.showThemeButton}
                  onMouseLeave={this.hideThemeButton}
                >
                  <h3>
                    <svg
                      viewBox="0 0 16 16"
                      version="1.1"
                      width="16"
                      height="16"
                      aria-hidden="true"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M3 5h4v1H3V5zm0 3h4V7H3v1zm0 2h4V9H3v1zm11-5h-4v1h4V5zm0 2h-4v1h4V7zm0 2h-4v1h4V9zm2-6v9c0 .55-.45 1-1 1H9.5l-1 1-1-1H2c-.55 0-1-.45-1-1V3c0-.55.45-1 1-1h5.5l1 1 1-1H15c.55 0 1 .45 1 1zm-8 .5L7.5 3H2v9h6V3.5zm7-.5H9.5l-.5.5V12h6V3z"
                      >
                      </path>
                    </svg>
                    {name}
                  </h3>
                  {themeModeIsVisible && (
                    <label id="toggle-theme" htmlFor="theme">
                      <input
                        id="theme"
                        type="checkbox"
                        checked={theme === "dark"}
                        onChange={this.handleThemeChange}
                      />
                      <span>Dark Mode</span>
                    </label>
                 )}
                </header>
              }
              <section
                key={`markdown-${renderNonce}`}
                className="markdown-body"
                dangerouslySetInnerHTML={{
                  __html: content
                }}
              />
            </div>
          </div>
        </main>
      </React.Fragment>
    )
  }
}
