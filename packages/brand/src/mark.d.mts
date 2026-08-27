export declare const VIEW_BOX: string;
export declare const STROKE_WIDTH: number;
export declare const FRAME_PATH: string;
export declare const PAGE_RIGHT_PATH: string;
export declare const PAGE_LEFT_PATH: string;
export declare function markMarkup(opts?: {
  frame?: string;
  book?: string;
  filled?: boolean;
  strokeWidth?: number;
}): string;
export declare function markSvg(opts?: {
  size?: number;
  frame?: string;
  book?: string;
  filled?: boolean;
  strokeWidth?: number;
}): string;
