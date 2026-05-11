/*
 * https://github.com/digitalmoksha/markdown-it-inject-linenumbers/blob/master/index.js
*/
export default function injectLinenumbersPlugin (md) {
  function getTokenLineMap (token) {
    if (!token || !token.map) {
      return null
    }

    return {
      start: token.map[0],
      end: token.map[1]
    }
  }

  function injectTokenAttributes (token) {
    const map = getTokenLineMap(token)
    if (!map) {
      return token
    }

    token.attrJoin('class', 'source-line')
    token.attrSet('data-source-line', String(map.start))
    token.attrSet('data-source-line-end', String(map.end))
    return token
  }

  function injectHtmlAttributes (html, token) {
    const map = getTokenLineMap(token)
    if (!map || typeof html !== 'string') {
      return html
    }

    return html.replace(/^<([a-zA-Z0-9-]+)([^>]*)>/, (match, tagName, attrs = '') => {
      let nextAttrs = attrs || ''
      if (/\bclass\s*=/.test(nextAttrs)) {
        nextAttrs = nextAttrs.replace(/\bclass\s*=\s*(["'])(.*?)\1/, (classMatch, quote, className) => {
          return ` class=${quote}${className} source-line${quote}`
        })
      } else {
        nextAttrs += ' class="source-line"'
      }

      if (!/\bdata-source-line\s*=/.test(nextAttrs)) {
        nextAttrs += ` data-source-line="${map.start}"`
      }
      if (!/\bdata-source-line-end\s*=/.test(nextAttrs)) {
        nextAttrs += ` data-source-line-end="${map.end}"`
      }

      return `<${tagName}${nextAttrs}>`
    })
  }

  //
  // Inject line numbers for sync scroll. Notes:
  //
  // - We track only headings and paragraphs, at any level.
  // - TODO Footnotes content causes jumps. Level limit filters it automatically.
  function injectLineNumbers (tokens, idx, options, env, slf) {
    injectTokenAttributes(tokens[idx])
    return slf.renderToken(tokens, idx, options, env, slf)
  }

  function wrapBlockRule (ruleName) {
    const original = md.renderer.rules[ruleName] || md.renderer.renderToken.bind(md.renderer)
    md.renderer.rules[ruleName] = (tokens, idx, options, env, slf) => {
      injectTokenAttributes(tokens[idx])
      return injectHtmlAttributes(original(tokens, idx, options, env, slf), tokens[idx])
    }
  }

  md.renderer.rules.paragraph_open = injectLineNumbers
  md.renderer.rules.heading_open = injectLineNumbers
  md.renderer.rules.list_item_open = injectLineNumbers
  md.renderer.rules.table_open = injectLineNumbers
  md.renderer.rules.blockquote_open = injectLineNumbers
  md.renderer.rules.ordered_list_open = injectLineNumbers
  md.renderer.rules.bullet_list_open = injectLineNumbers
  md.renderer.rules.hr = injectLineNumbers

  wrapBlockRule('fence')
  wrapBlockRule('code_block')
  wrapBlockRule('math_block')
  wrapBlockRule('uml_diagram')
}
