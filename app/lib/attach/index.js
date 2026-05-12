"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const neovim_1 = require("@chemzqm/neovim");
const reviewComments_1 = require("../util/reviewComments");
const logger = require('../util/logger')('attach'); // tslint:disable-line
const MARKDOWN_FILE_REGEXP = /\.(md|markdown|mdown|mkdn|mkd)$/i;
let app;
function normalizeMarkdownFiletypes(value) {
    if (!Array.isArray(value)) {
        return ['markdown'];
    }
    const filetypes = value
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    return filetypes.length ? filetypes : ['markdown'];
}
function shouldRenderAsMarkdown(filetype, markdownFiletypes) {
    return markdownFiletypes.includes(String(filetype || '').trim());
}
function getFenceMarker(content) {
    const matches = content.match(/`+/g) || [];
    const longest = matches.reduce((max, marker) => Math.max(max, marker.length), 0);
    return '`'.repeat(Math.max(3, longest + 1));
}
function toCodeFenceLanguage(filetype) {
    const language = String(filetype || '').trim().replace(/[\s`]+/g, '');
    return language || 'text';
}
function buildPreviewContent(lines, filetype, markdownFiletypes) {
    if (shouldRenderAsMarkdown(filetype, markdownFiletypes)) {
        return {
            lines,
            wrappedInCodeFence: false
        };
    }
    const content = lines.join('\n');
    const fence = getFenceMarker(content);
    const language = toCodeFenceLanguage(filetype);
    return {
        lines: [`${fence}${language}`, ...lines, fence],
        wrappedInCodeFence: true
    };
}
function detectPreviewFiletype(nvim, bufnr, name) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const currentFiletype = String((yield nvim.call('getbufvar', [bufnr, '&filetype'])) || '').trim();
        if (currentFiletype) {
            return currentFiletype;
        }
        try {
            const supportsLuaeval = Number(yield nvim.call('exists', ['*luaeval'])) === 1;
            if (supportsLuaeval) {
                const matchedFiletype = String((yield nvim.call('luaeval', ['vim.filetype.match({ buf = _A }) or ""', bufnr])) || '').trim();
                if (matchedFiletype) {
                    try {
                        yield nvim.call('setbufvar', [bufnr, '&filetype', matchedFiletype]);
                    }
                    catch (e) { }
                    return matchedFiletype;
                }
            }
        }
        catch (e) { }
        return MARKDOWN_FILE_REGEXP.test(String(name || '')) ? 'markdown' : '';
    });
}
function default_1(options) {
    const nvim = (0, neovim_1.attach)(options);
    nvim.on('notification', (method, args) => tslib_1.__awaiter(this, void 0, void 0, function* () {
        const opts = args[0] || args;
        const bufnr = opts.bufnr;
        const buffers = yield nvim.buffers;
        const buffer = buffers.find(b => b.id === bufnr);
        if (!buffer && method === 'refresh_content') {
            logger.info('skip refresh_content: buffer not found', bufnr);
            return;
        }
        if (method === 'refresh_content') {
            const winline = yield nvim.call('winline');
            const currentWindow = yield nvim.window;
            const winheight = yield nvim.call('winheight', currentWindow.id);
            const cursor = yield nvim.call('getpos', '.');
            const renderOpts = yield nvim.getVar('mkdp_preview_options');
            const markdownFiletypes = normalizeMarkdownFiletypes(yield nvim.getVar('mkdp_filetypes'));
            const pageTitle = yield nvim.getVar('mkdp_page_title');
            const theme = yield nvim.getVar('mkdp_theme');
            const name = yield buffer.name;
            const filetype = yield detectPreviewFiletype(nvim, bufnr, name);
            const previewContent = buildPreviewContent(yield buffer.getLines(), filetype, markdownFiletypes);
            const currentBuffer = yield nvim.buffer;
            const reviewComments = yield (0, reviewComments_1.getReviewCommentsSnapshot)(nvim, bufnr);
            app.refreshPage({
                bufnr,
                data: {
                    options: renderOpts,
                    isActive: currentBuffer.id === buffer.id,
                    winline,
                    winheight,
                    cursor,
                    pageTitle,
                    theme,
                    name,
                    content: previewContent.lines,
                    wrappedInCodeFence: previewContent.wrappedInCodeFence,
                    reviewComments
                }
            });
        }
        else if (method === 'close_page') {
            app.closePage({
                bufnr
            });
        }
        else if (method === 'open_browser') {
            app.openBrowser({
                bufnr
            });
        }
    }));
    nvim.on('request', (method, args, resp) => {
        if (method === 'close_all_pages') {
            app.closeAllPages();
        }
        resp.send();
    });
    nvim.channelId
        .then((channelId) => tslib_1.__awaiter(this, void 0, void 0, function* () {
        yield nvim.setVar('mkdp_node_channel_id', channelId);
    }))
        .catch(e => {
        logger.error('channelId: ', e);
    });
    return {
        nvim,
        init: (param) => {
            app = param;
        }
    };
}
exports.default = default_1;
