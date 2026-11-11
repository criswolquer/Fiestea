export type PenKind =
  | "pen"
  | "pencil"
  | "fountain"
  | "brush"
  | "highlighter"
  | "dashed"
  | "dotted"
  | "wavy";

export type ShapeKind = "line" | "arrow" | "rect" | "ellipse" | "triangle";

export type Point = [x: number, y: number, pressure: number];

export interface Stroke {
  id: string;
  type: "stroke";
  pen: PenKind;
  color: string;
  width: number;
  points: Point[];
}

export interface Shape {
  id: string;
  type: "shape";
  shape: ShapeKind;
  color: string;
  width: number;
  dashed?: boolean;
  /** Bounding points: start and end of the drag (line/arrow), or two corners. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextBox {
  id: string;
  type: "text";
  x: number;
  y: number;
  w: number;
  text: string;
  color: string;
  size: number;
}

export interface ImageItem {
  id: string;
  type: "image";
  blobId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Item = Stroke | Shape | TextBox | ImageItem;

/** Rectangle that covers content until tapped (memorisation tool). */
export interface Mask {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface Layer {
  visible: boolean;
  items: Item[];
}

export type TemplateId =
  | "blank"
  | "lined"
  | "narrow"
  | "grid"
  | "dotted"
  | "cornell"
  | "music"
  | "todo"
  | "weekly";

export type PaperColor = "white" | "cream" | "dark" | "green";

export interface Page {
  id: string;
  notebookId: string;
  width: number;
  height: number;
  template: TemplateId;
  paper: PaperColor;
  /** Image rendered from an imported PDF page or picture. */
  backgroundBlobId?: string;
  /** Size the background is drawn at; set when the page was enlarged beyond its imported size. */
  bgW?: number;
  bgH?: number;
  layers: Layer[];
  masks: Mask[];
  updatedAt: number;
}

export interface LockInfo {
  salt: string;
  hash: string;
}

export type CoverPattern = "plain" | "linen" | "stripes" | "dots" | "grid" | "waves" | "geo" | "gradient" | "terrazzo" | "spine";

export interface Notebook {
  id: string;
  title: string;
  cover: string;
  coverPattern?: CoverPattern;
  /** Blob id of a photo used as the cover. */
  coverImage?: string;
  folderId: string | null;
  favorite: boolean;
  template: TemplateId;
  paper: PaperColor;
  pageSize: PageSizeId;
  pageIds: string[];
  linkedIds: string[];
  lock: LockInfo | null;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Recording {
  id: string;
  notebookId: string;
  blobId: string;
  duration: number;
  transcript: string;
  createdAt: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export type AiResult =
  | { id: string; notebookId: string; createdAt: number; kind: "summary"; title: string; text: string }
  | { id: string; notebookId: string; createdAt: number; kind: "quiz"; title: string; questions: QuizQuestion[] }
  | { id: string; notebookId: string; createdAt: number; kind: "flashcards"; title: string; cards: Flashcard[] };

export type PageSizeId = "a4" | "letter" | "square" | "long" | "phone";

export const PAGE_SIZES: Record<PageSizeId, { label: string; w: number; h: number }> = {
  a4: { label: "A4", w: 794, h: 1123 },
  letter: { label: "Carta", w: 816, h: 1056 },
  square: { label: "Cuadrado", w: 900, h: 900 },
  long: { label: "Nota grande", w: 794, h: 2400 },
  phone: { label: "Móvil", w: 600, h: 1067 },
};

export const LAYER_COUNT = 3;
