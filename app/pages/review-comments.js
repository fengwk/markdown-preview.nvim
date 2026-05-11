const PANEL_ID = 'review-comments-panel'
const ACTION_BUTTON_ID = 'review-comments-selection-action'
const MODAL_ID = 'review-comments-modal'
const CONFIRM_MODAL_ID = 'review-comments-confirm-modal'

let latestSnapshot = { comments: [] }
let latestSourceLineCount = 0
let applyCommentHandler = null
let listenersBound = false
let submitInFlight = false
let currentSelectionContext = null

function toPositiveInteger (value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 1) {
    return null
  }
  return Math.floor(number)
}

function normalizeComments (snapshot) {
  const comments = Array.isArray(snapshot && snapshot.comments) ? snapshot.comments : []

  return comments
    .map((comment) => {
      const line = toPositiveInteger(comment.line)
      if (!line) {
        return null
      }

      return {
        id: String(comment.id || `${line}:${comment.comment || ''}`),
        line,
        col: toPositiveInteger(comment.col) || 1,
        endLine: Math.max(toPositiveInteger(comment.end_line) || line, line),
        endCol: toPositiveInteger(comment.end_col) || 1,
        originText: String(comment.origin_text || ''),
        selectedText: String(comment.selected_text || comment.origin_text || ''),
        comment: String(comment.comment || '')
      }
    })
    .filter(Boolean)
}

function formatLineLabel (comment) {
  if (comment.line === comment.endLine) {
    return `Line ${comment.line}`
  }
  return `Line ${comment.line}-${comment.endLine}`
}

function getMarkdownRoot () {
  return document.querySelector('.markdown-body')
}

function getPageContainer () {
  return document.getElementById('page-ctn')
}

function getThemeHost () {
  return document.querySelector('main') || getPageContainer() || document.body
}

function ensureCommentModal () {
  const host = getThemeHost()
  let modal = host.querySelector(`#${MODAL_ID}`)
  if (modal) {
    return modal
  }

  const backdrop = document.createElement('div')
  backdrop.id = MODAL_ID
  backdrop.className = 'review-comments-modal-backdrop'
  backdrop.style.display = 'none'

  const dialog = document.createElement('div')
  dialog.className = 'review-comments-modal'

  const title = document.createElement('div')
  title.className = 'review-comments-modal-title'
  title.textContent = 'Add Comment'

  const selectedTextLabel = document.createElement('div')
  selectedTextLabel.className = 'review-comments-modal-label'
  selectedTextLabel.textContent = 'Selected Text'

  const selectedTextBlock = document.createElement('pre')
  selectedTextBlock.className = 'review-comments-modal-preview'
  selectedTextBlock.setAttribute('data-role', 'selected-text')

  const commentLabel = document.createElement('label')
  commentLabel.className = 'review-comments-modal-label'
  commentLabel.textContent = 'User Comment'

  const textarea = document.createElement('textarea')
  textarea.className = 'review-comments-modal-textarea'
  textarea.setAttribute('data-role', 'textarea')
  textarea.rows = 6
  textarea.placeholder = 'Write your comment...'

  const actions = document.createElement('div')
  actions.className = 'review-comments-modal-actions'

  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.className = 'review-comments-modal-button'
  cancelButton.setAttribute('data-role', 'cancel')
  cancelButton.textContent = 'Cancel'

  const submitButton = document.createElement('button')
  submitButton.type = 'button'
  submitButton.className = 'review-comments-modal-button review-comments-modal-button-primary'
  submitButton.setAttribute('data-role', 'submit')
  submitButton.textContent = 'Submit Comment'

  actions.appendChild(cancelButton)
  actions.appendChild(submitButton)

  dialog.appendChild(title)
  dialog.appendChild(selectedTextLabel)
  dialog.appendChild(selectedTextBlock)
  dialog.appendChild(commentLabel)
  dialog.appendChild(textarea)
  dialog.appendChild(actions)
  backdrop.appendChild(dialog)
  host.appendChild(backdrop)

  return backdrop
}

function ensureConfirmModal () {
  const host = getThemeHost()
  let modal = host.querySelector(`#${CONFIRM_MODAL_ID}`)
  if (modal) {
    return modal
  }

  const backdrop = document.createElement('div')
  backdrop.id = CONFIRM_MODAL_ID
  backdrop.className = 'review-comments-modal-backdrop'
  backdrop.style.display = 'none'

  const dialog = document.createElement('div')
  dialog.className = 'review-comments-modal review-comments-confirm-modal'

  const title = document.createElement('div')
  title.className = 'review-comments-modal-title'
  title.textContent = 'Delete Comment'

  const message = document.createElement('div')
  message.className = 'review-comments-modal-message'
  message.setAttribute('data-role', 'message')

  const actions = document.createElement('div')
  actions.className = 'review-comments-modal-actions'

  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.className = 'review-comments-modal-button'
  cancelButton.setAttribute('data-role', 'cancel')
  cancelButton.textContent = 'Cancel'

  const confirmButton = document.createElement('button')
  confirmButton.type = 'button'
  confirmButton.className = 'review-comments-modal-button review-comments-modal-button-primary'
  confirmButton.setAttribute('data-role', 'confirm')
  confirmButton.textContent = 'Delete'

  actions.appendChild(cancelButton)
  actions.appendChild(confirmButton)

  dialog.appendChild(title)
  dialog.appendChild(message)
  dialog.appendChild(actions)
  backdrop.appendChild(dialog)
  host.appendChild(backdrop)

  return backdrop
}

function openCommentModal ({ title, selectedText, initialComment, submitLabel }) {
  const modal = ensureCommentModal()
  const titleElement = modal.querySelector('.review-comments-modal-title')
  const selectedTextBlock = modal.querySelector('[data-role="selected-text"]')
  const textarea = modal.querySelector('[data-role="textarea"]')
  const cancelButton = modal.querySelector('[data-role="cancel"]')
  const submitButton = modal.querySelector('[data-role="submit"]')

  titleElement.textContent = title || 'Add Comment'
  selectedTextBlock.textContent = selectedText || '(empty selection)'
  textarea.value = initialComment || ''
  submitButton.textContent = submitLabel || 'Submit Comment'
  modal.style.display = 'flex'

  return new Promise((resolve) => {
    let settled = false

    const close = (value) => {
      if (settled) {
        return
      }
      settled = true
      modal.style.display = 'none'
      modal.removeEventListener('click', handleBackdropClick)
      document.removeEventListener('keydown', handleKeydown)
      cancelButton.removeEventListener('click', handleCancel)
      submitButton.removeEventListener('click', handleSubmit)
      resolve(value)
    }

    const handleBackdropClick = (event) => {
      if (event.target === modal) {
        close(null)
      }
    }

    const handleCancel = () => close(null)

    const handleSubmit = () => {
      const value = textarea.value.trim()
      if (!value) {
        textarea.focus()
        return
      }
      close(value)
    }

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        close(null)
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        handleSubmit()
      }
    }

    modal.addEventListener('click', handleBackdropClick)
    document.addEventListener('keydown', handleKeydown)
    cancelButton.addEventListener('click', handleCancel)
    submitButton.addEventListener('click', handleSubmit)

    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    })
  })
}

function openConfirmModal ({ title, message, confirmLabel }) {
  const modal = ensureConfirmModal()
  const titleElement = modal.querySelector('.review-comments-modal-title')
  const messageElement = modal.querySelector('[data-role="message"]')
  const cancelButton = modal.querySelector('[data-role="cancel"]')
  const confirmButton = modal.querySelector('[data-role="confirm"]')

  titleElement.textContent = title || 'Confirm Action'
  messageElement.textContent = message || ''
  confirmButton.textContent = confirmLabel || 'Confirm'
  modal.style.display = 'flex'

  return new Promise((resolve) => {
    let settled = false

    const close = (value) => {
      if (settled) {
        return
      }
      settled = true
      modal.style.display = 'none'
      modal.removeEventListener('click', handleBackdropClick)
      document.removeEventListener('keydown', handleKeydown)
      cancelButton.removeEventListener('click', handleCancel)
      confirmButton.removeEventListener('click', handleConfirm)
      resolve(value)
    }

    const handleBackdropClick = (event) => {
      if (event.target === modal) {
        close(false)
      }
    }

    const handleCancel = () => close(false)
    const handleConfirm = () => close(true)

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        close(false)
      }
      if (event.key === 'Enter') {
        close(true)
      }
    }

    modal.addEventListener('click', handleBackdropClick)
    document.addEventListener('keydown', handleKeydown)
    cancelButton.addEventListener('click', handleCancel)
    confirmButton.addEventListener('click', handleConfirm)

    window.requestAnimationFrame(() => {
      confirmButton.focus()
    })
  })
}

function getSourceBlocks (root) {
  return Array.from(root.querySelectorAll('[data-source-line]')).sort((left, right) => {
    return Number(left.getAttribute('data-source-line')) - Number(right.getAttribute('data-source-line'))
  })
}

function getBlockRange (block, sourceLineCount, nextBlock) {
  const startLine = Number(block.getAttribute('data-source-line')) + 1
  const endAttr = Number(block.getAttribute('data-source-line-end'))
  let endLine = Number.isFinite(endAttr) && endAttr > 0
    ? endAttr
    : sourceLineCount

  if ((!Number.isFinite(endAttr) || endAttr <= 0) && nextBlock) {
    endLine = Number(nextBlock.getAttribute('data-source-line'))
  }

  return {
    startLine,
    endLine: Math.max(endLine, startLine)
  }
}

function intersectComments (comments, range) {
  return comments.filter((comment) => comment.line <= range.endLine && comment.endLine >= range.startLine)
}

function clearReviewCommentMarks (root) {
  getSourceBlocks(root).forEach((block) => {
    block.classList.remove('review-comment-block')
    block.removeAttribute('data-review-comment-count')
  })
}

function ensurePanel () {
  const host = getPageContainer() || document.body
  let panel = host.querySelector(`#${PANEL_ID}`)
  if (panel) {
    return panel
  }

  panel = document.createElement('aside')
  panel.id = PANEL_ID
  panel.className = 'review-comments-panel'
  host.appendChild(panel)
  return panel
}

function createToolbarButton (label, action, options = {}) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'review-comments-toolbar-button'
  button.textContent = label
  button.addEventListener('click', async () => {
    if (!applyCommentHandler || submitInFlight) {
      return
    }

    if (options.confirm) {
      const confirmed = await openConfirmModal(options.confirm)
      if (!confirmed) {
        return
      }
    }

    submitInFlight = true
    button.disabled = true
    try {
      const result = await Promise.resolve(applyCommentHandler(action, {
        revision: latestSnapshot && latestSnapshot.revision
      }))
      if (!result || !result.ok) {
        window.alert(result && result.error ? result.error : `Failed to ${label.toLowerCase()}`)
      }
    } finally {
      submitInFlight = false
      button.disabled = false
    }
  })
  return button
}

function createPanelToolbar () {
  const toolbar = document.createElement('div')
  toolbar.className = 'review-comments-panel-toolbar'
  toolbar.appendChild(createToolbarButton('Copy', 'copy'))
  toolbar.appendChild(createToolbarButton('CopyAndClear', 'copy_and_clear', {
    confirm: {
      title: 'Copy And Clear',
      message: 'Copy all comments and clear them from the current file?',
      confirmLabel: 'Copy And Clear'
    }
  }))
  return toolbar
}

function getCommentAnchor (comment) {
  const root = getMarkdownRoot()
  if (!root) {
    return null
  }

  const blocks = getSourceBlocks(root)
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    const range = getBlockRange(block, latestSourceLineCount, blocks[index + 1])
    if (comment.line > range.endLine || comment.endLine < range.startLine) {
      continue
    }

    const span = Math.max(range.endLine - range.startLine + 1, 1)
    const offsetRatio = Math.max(0, Math.min(1, (comment.line - range.startLine) / span))
    return {
      block,
      top: block.offsetTop + block.offsetHeight * offsetRatio
    }
  }

  return null
}

function createCardDeleteButton (comment) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'review-comments-card-action review-comments-card-delete'
  button.setAttribute('aria-label', 'Delete review comment')
  button.textContent = 'Delete'
  button.addEventListener('click', async (event) => {
    event.stopPropagation()
    if (!applyCommentHandler || submitInFlight) {
      return
    }

    const shouldDelete = await openConfirmModal({
      title: 'Delete Comment',
      message: 'Delete this comment? This action cannot be undone.',
      confirmLabel: 'Delete'
    })
    if (!shouldDelete) {
      return
    }

    submitInFlight = true
    button.disabled = true
    try {
      const result = await Promise.resolve(applyCommentHandler('delete', {
        id: comment.id,
        revision: latestSnapshot && latestSnapshot.revision
      }))

      if (!result || !result.ok) {
        window.alert(result && result.error ? result.error : 'Failed to delete review comment')
      }
    } finally {
      submitInFlight = false
      button.disabled = false
    }
  })
  return button
}

function createCardEditButton (comment) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'review-comments-card-action'
  button.textContent = 'Edit'
  button.addEventListener('click', async (event) => {
    event.stopPropagation()
    if (!applyCommentHandler || submitInFlight) {
      return
    }

    const updatedComment = await openCommentModal({
      title: 'Edit Comment',
      selectedText: comment.selectedText,
      initialComment: comment.comment,
      submitLabel: 'Save Changes'
    })
    if (!updatedComment || !updatedComment.trim()) {
      return
    }

    submitInFlight = true
    button.disabled = true
    try {
      const result = await Promise.resolve(applyCommentHandler('edit', {
        id: comment.id,
        comment: updatedComment.trim(),
        revision: latestSnapshot && latestSnapshot.revision
      }))

      if (!result || !result.ok) {
        window.alert(result && result.error ? result.error : 'Failed to edit review comment')
      }
    } finally {
      submitInFlight = false
      button.disabled = false
    }
  })
  return button
}

function createCommentCard (comment) {
  const card = document.createElement('article')
  card.className = 'review-comments-card'
  card.title = `${formatLineLabel(comment)}\n\n${comment.selectedText}\n\n${comment.comment}`

  const lineLabel = document.createElement('div')
  lineLabel.className = 'review-comments-card-line'
  lineLabel.textContent = formatLineLabel(comment)

  const selectedTextLabel = document.createElement('div')
  selectedTextLabel.className = 'review-comments-card-label'
  selectedTextLabel.textContent = 'Selected Text'

  const selectedTextBlock = document.createElement('pre')
  selectedTextBlock.className = 'review-comments-card-pre'
  const selectedTextCode = document.createElement('code')
  selectedTextCode.textContent = comment.selectedText
  selectedTextBlock.appendChild(selectedTextCode)

  const userCommentLabel = document.createElement('div')
  userCommentLabel.className = 'review-comments-card-label'
  userCommentLabel.textContent = 'User Comment'

  const userCommentBlock = document.createElement('pre')
  userCommentBlock.className = 'review-comments-card-pre'
  const userCommentCode = document.createElement('code')
  userCommentCode.textContent = comment.comment
  userCommentBlock.appendChild(userCommentCode)

  const body = document.createElement('div')
  body.className = 'review-comments-card-body'
  body.appendChild(lineLabel)
  body.appendChild(selectedTextLabel)
  body.appendChild(selectedTextBlock)
  body.appendChild(userCommentLabel)
  body.appendChild(userCommentBlock)

  const actions = document.createElement('div')
  actions.className = 'review-comments-card-actions'
  actions.appendChild(createCardEditButton(comment))
  actions.appendChild(createCardDeleteButton(comment))

  card.appendChild(body)
  card.appendChild(actions)
  return card
}

function renderCommentPanel (comments) {
  const panel = ensurePanel()
  panel.innerHTML = ''
  panel.style.height = '0px'

  if (comments.length === 0) {
    panel.classList.add('review-comments-panel-empty')
    return
  }

  panel.classList.remove('review-comments-panel-empty')

  const toolbar = createPanelToolbar()
  panel.appendChild(toolbar)
  const toolbarHeight = toolbar.offsetHeight + 12

  const anchoredComments = comments
    .map((comment) => ({ comment, anchor: getCommentAnchor(comment) }))
    .filter((entry) => entry.anchor)
    .sort((left, right) => {
      if (left.comment.line !== right.comment.line) {
        return left.comment.line - right.comment.line
      }
      if (left.comment.col !== right.comment.col) {
        return left.comment.col - right.comment.col
      }
      return left.anchor.top - right.anchor.top
    })

  let currentTop = toolbarHeight
  anchoredComments.forEach(({ comment, anchor }) => {
    const card = createCommentCard(comment)
    card.style.position = 'absolute'
    card.style.visibility = 'hidden'
    panel.appendChild(card)

    const desiredTop = Math.max(anchor.top - 8, toolbarHeight)
    const nextTop = Math.max(desiredTop, currentTop)
    card.style.top = `${nextTop}px`
    card.style.visibility = 'visible'
    currentTop = nextTop + card.offsetHeight + 12
  })

  const container = getPageContainer()
  const containerHeight = container ? container.offsetHeight : 0
  panel.style.height = `${Math.max(containerHeight, currentTop)}px`
}

function getElementNode (node) {
  if (!node) {
    return null
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return node.parentElement
  }
  return node
}

function isNodeWithinRoot (node, root) {
  const element = getElementNode(node)
  return Boolean(element && root && root.contains(element))
}

function getSelectionBlockRange () {
  const root = getMarkdownRoot()
  const selection = window.getSelection()
  if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!isNodeWithinRoot(range.startContainer, root) || !isNodeWithinRoot(range.endContainer, root)) {
    return null
  }

  const startBlock = getElementNode(range.startContainer).closest('[data-source-line]')
  const endBlock = getElementNode(range.endContainer).closest('[data-source-line]')
  if (!startBlock || !endBlock) {
    return null
  }

  const startRange = getBlockRange(startBlock, latestSourceLineCount)
  const endRange = getBlockRange(endBlock, latestSourceLineCount)
  return {
    startLine: Math.min(startRange.startLine, endRange.startLine),
    endLine: Math.max(startRange.endLine, endRange.endLine)
  }
}

function updateSelectionContext () {
  const selection = window.getSelection()
  const blockRange = getSelectionBlockRange()
  if (!selection || !blockRange) {
    currentSelectionContext = null
    return null
  }

  const selectedText = selection.toString().trim()
  currentSelectionContext = {
    selectedText,
    blockRange
  }
  return currentSelectionContext
}

function ensureSelectionActionButton () {
  let button = document.getElementById(ACTION_BUTTON_ID)
  if (button) {
    return button
  }

  button = document.createElement('button')
  button.id = ACTION_BUTTON_ID
  button.type = 'button'
  button.className = 'review-comments-selection-action'
  button.textContent = 'Add Comment'
  button.style.display = 'none'
  getThemeHost().appendChild(button)

  button.addEventListener('click', async () => {
    const selectionContext = currentSelectionContext || updateSelectionContext()
    if (!selectionContext || !applyCommentHandler || submitInFlight) {
      return
    }

    try {
      const { blockRange, selectedText } = selectionContext
      const input = await openCommentModal({
        title: 'Add Comment',
        selectedText,
        initialComment: '',
        submitLabel: 'Submit Comment'
      })
      if (!input || !input.trim()) {
        return
      }

      submitInFlight = true
      button.disabled = true
      const result = await Promise.resolve(applyCommentHandler('create', {
        kind: 'block',
        start_line: blockRange.startLine,
        end_line: blockRange.endLine,
        selected_text: selectedText,
        comment: input.trim(),
        revision: latestSnapshot && latestSnapshot.revision
      }))

      if (!result || !result.ok) {
        window.alert(result && result.error ? result.error : 'Failed to add review comment')
        return
      }

      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
      }
      currentSelectionContext = null
      button.style.display = 'none'
    } finally {
      submitInFlight = false
      button.disabled = false
    }
  })

  return button
}

function refreshSelectionActionButton () {
  const button = ensureSelectionActionButton()
  const selection = window.getSelection()
  const selectionContext = updateSelectionContext()
  const blockRange = selectionContext && selectionContext.blockRange

  if (!selection || !blockRange || !applyCommentHandler) {
    button.style.display = 'none'
    return
  }

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  if (!rect || (!rect.width && !rect.height)) {
    button.style.display = 'none'
    return
  }

  button.style.display = 'inline-flex'
  button.style.top = `${Math.min(window.innerHeight - 44, rect.bottom + 8)}px`
  button.style.left = `${Math.max(12, Math.min(window.innerWidth - 128, rect.right - 36))}px`
}

function bindReviewCommentListeners () {
  if (listenersBound) {
    return
  }
  listenersBound = true

  document.addEventListener('selectionchange', () => {
    window.requestAnimationFrame(refreshSelectionActionButton)
  })

  window.addEventListener('scroll', () => {
    const button = document.getElementById(ACTION_BUTTON_ID)
    if (button) {
      button.style.display = 'none'
    }
  }, true)
}

export function renderReviewComments ({ snapshot, sourceLineCount, onApplyComment }) {
  const root = getMarkdownRoot()
  if (!root) {
    return
  }

  latestSnapshot = snapshot || { comments: [] }
  latestSourceLineCount = sourceLineCount || 0
  applyCommentHandler = onApplyComment || null

  bindReviewCommentListeners()
  clearReviewCommentMarks(root)

  const comments = normalizeComments(snapshot)
  renderCommentPanel(comments)

  if (comments.length === 0) {
    return
  }

  const blockEntries = getSourceBlocks(root).map((block, index, blocks) => ({
    block,
    range: getBlockRange(block, sourceLineCount, blocks[index + 1]),
    count: 0
  }))

  comments.forEach((comment) => {
    let counted = false
    blockEntries.forEach((entry) => {
      if (!intersectComments([comment], entry.range).length) {
        return
      }

      entry.block.classList.add('review-comment-block')
      if (!counted) {
        entry.count += 1
        counted = true
      }
    })
  })

  blockEntries.forEach((entry) => {
    if (entry.count > 0) {
      entry.block.setAttribute('data-review-comment-count', String(entry.count))
    }
  })
}
