declare module 'docxtemplater' {
  export default class Docxtemplater {}
}
declare module 'pizzip' {
  export default class PIZip {}
}
declare module 'file-saver' {
  export function saveAs(blob: Blob, name: string): void;
}
declare module 'jszip-utils' {
  export function getText(url: string, callback: (err: Error, text: string) => void): void;
}

export type AlignmentType = { CENTER: string };
export type WidthType = { PERCENTAGE: string };
export type Document = any;
export type Paragraph = any;
export type TextRun = any;
export type Table = any;
export type TableRow = any;
export type TableCell = any;
export type Packer = any;
