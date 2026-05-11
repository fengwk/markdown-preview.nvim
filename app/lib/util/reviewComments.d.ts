import { NeovimClient } from '@chemzqm/neovim';
type ReviewComment = {
    id: string;
    line: number;
    col: number;
    end_line: number;
    end_col: number;
    origin_text: string;
    selected_text: string;
    comment: string;
};
type ReviewCommentSnapshot = {
    revision: number | null;
    comments: ReviewComment[];
};
export declare function getReviewCommentsSnapshot(nvim: NeovimClient, bufnr: number | string): Promise<ReviewCommentSnapshot>;
export declare function applyReviewCommentsAction(nvim: NeovimClient, bufnr: number | string, action: string, payload: any): Promise<any>;
export {};
