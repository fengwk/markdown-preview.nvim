import { NeovimClient } from '@chemzqm/neovim'

const logger = require('./logger')('review-comments') // tslint:disable-line

type ReviewComment = {
  id: string
  line: number
  col: number
  end_line: number
  end_col: number
  origin_text: string
  selected_text: string
  comment: string
}

type ReviewCommentSnapshot = {
  revision: number | null
  comments: ReviewComment[]
}

const EMPTY_SNAPSHOT: ReviewCommentSnapshot = {
  revision: null,
  comments: []
}

function toFunctionName(value: any): string {
  return typeof value === 'string' ? value : ''
}

function toPositiveInteger(value: any): number | null {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 1) {
    return null
  }
  return Math.floor(number)
}

function normalizeComment(item: any): ReviewComment | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const line = toPositiveInteger(item.line)
  const col = toPositiveInteger(item.col)
  if (!line || !col) {
    return null
  }

  let endLine = toPositiveInteger(item.end_line) || line
  if (endLine < line) {
    endLine = line
  }

  let endCol = toPositiveInteger(item.end_col) || col
  if (endLine === line && endCol < col) {
    endCol = col
  }

  return {
    id: String(item.id || `${line}:${col}:${item.comment || ''}`),
    line,
    col,
    end_line: endLine,
    end_col: endCol,
    origin_text: String(item.origin_text || ''),
    selected_text: String(item.selected_text || item.origin_text || ''),
    comment: String(item.comment || '')
  }
}

async function getHookFunctionName(nvim: NeovimClient, variableName: string): Promise<string> {
  try {
    return toFunctionName(await nvim.getVar(variableName))
  } catch (error) {
    logger.error(`getVar(${variableName})`, error)
    return ''
  }
}

export async function getReviewCommentsSnapshot(
  nvim: NeovimClient,
  bufnr: number | string
): Promise<ReviewCommentSnapshot> {
  const snapshotFn = await getHookFunctionName(nvim, 'mkdp_review_comments_snapshot_fn')
  if (!snapshotFn) {
    return EMPTY_SNAPSHOT
  }

  try {
    const snapshot = await nvim.call(snapshotFn, [Number(bufnr)]) as any
    const revision = toPositiveInteger(snapshot && snapshot.revision)
    const comments = Array.isArray(snapshot && snapshot.comments)
      ? snapshot.comments.map(normalizeComment).filter(Boolean) as ReviewComment[]
      : []

    return {
      revision,
      comments
    }
  } catch (error) {
    logger.error(`call snapshot hook(${snapshotFn})`, error)
    return EMPTY_SNAPSHOT
  }
}

export async function applyReviewCommentsAction(
  nvim: NeovimClient,
  bufnr: number | string,
  action: string,
  payload: any
): Promise<any> {
  const applyFn = await getHookFunctionName(nvim, 'mkdp_review_comments_apply_fn')
  if (!applyFn) {
    return {
      ok: false,
      error: 'Review comment apply hook is not configured'
    }
  }

  try {
    const result = await nvim.call(applyFn, [Number(bufnr), action, payload || {}])
    if (result && typeof result === 'object') {
      return result
    }
    return {
      ok: Boolean(result)
    }
  } catch (error) {
    logger.error(`call apply hook(${applyFn})`, error)
    return {
      ok: false,
      error: error && error.message ? error.message : String(error)
    }
  }
}
