"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyReviewCommentsAction = exports.getReviewCommentsSnapshot = void 0;
const tslib_1 = require("tslib");
const logger = require('./logger')('review-comments'); // tslint:disable-line
const EMPTY_SNAPSHOT = {
    revision: null,
    comments: []
};
function toFunctionName(value) {
    return typeof value === 'string' ? value : '';
}
function toPositiveInteger(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 1) {
        return null;
    }
    return Math.floor(number);
}
function normalizeComment(item) {
    if (!item || typeof item !== 'object') {
        return null;
    }
    const line = toPositiveInteger(item.line);
    const col = toPositiveInteger(item.col);
    if (!line || !col) {
        return null;
    }
    let endLine = toPositiveInteger(item.end_line) || line;
    if (endLine < line) {
        endLine = line;
    }
    let endCol = toPositiveInteger(item.end_col) || col;
    if (endLine === line && endCol < col) {
        endCol = col;
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
    };
}
function getHookFunctionName(nvim, variableName) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        try {
            return toFunctionName(yield nvim.getVar(variableName));
        }
        catch (error) {
            logger.error(`getVar(${variableName})`, error);
            return '';
        }
    });
}
function getReviewCommentsSnapshot(nvim, bufnr) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const snapshotFn = yield getHookFunctionName(nvim, 'mkdp_review_comments_snapshot_fn');
        if (!snapshotFn) {
            return EMPTY_SNAPSHOT;
        }
        try {
            const snapshot = yield nvim.call(snapshotFn, [Number(bufnr)]);
            const revision = toPositiveInteger(snapshot && snapshot.revision);
            const comments = Array.isArray(snapshot && snapshot.comments)
                ? snapshot.comments.map(normalizeComment).filter(Boolean)
                : [];
            return {
                revision,
                comments
            };
        }
        catch (error) {
            logger.error(`call snapshot hook(${snapshotFn})`, error);
            return EMPTY_SNAPSHOT;
        }
    });
}
exports.getReviewCommentsSnapshot = getReviewCommentsSnapshot;
function applyReviewCommentsAction(nvim, bufnr, action, payload) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const applyFn = yield getHookFunctionName(nvim, 'mkdp_review_comments_apply_fn');
        if (!applyFn) {
            return {
                ok: false,
                error: 'Review comment apply hook is not configured'
            };
        }
        try {
            const result = yield nvim.call(applyFn, [Number(bufnr), action, payload || {}]);
            if (result && typeof result === 'object') {
                return result;
            }
            return {
                ok: Boolean(result)
            };
        }
        catch (error) {
            logger.error(`call apply hook(${applyFn})`, error);
            return {
                ok: false,
                error: error && error.message ? error.message : String(error)
            };
        }
    });
}
exports.applyReviewCommentsAction = applyReviewCommentsAction;
