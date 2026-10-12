declare module 'docx' {
  export class Document {
    constructor(cfg: import('docx').DocumentJson);
  }
  export class Paragraph {
    constructor(cfg: import('docx').ParagraphOptions);
  }
  export class TextRun {
    constructor(cfg: import('docx').TextRunOptions);
  }
  export class Table {
    constructor(cfg: import('docx').TableOptions);
  }
  export class TableRow {
    constructor(cfg: import('docx').TableRowOptions);
  }
  export class TableCell {
    constructor(cfg: import('docx').TableCellOptions);
  }
  export class Packer {
    static toBlob(document: Document): Promise<Blob>;
  }
  export type AlignmentType = { CENTER: string };
  export type WidthType = { PERCENTAGE: string };
}
