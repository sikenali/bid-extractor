declare module 'pizzip' {
  export default class PizZip {
    constructor(input?: Uint8Array | ArrayBuffer | string);
    file(name: string, data: unknown): void;
    generate(opts?: { type?: 'blob'; mimeType?: string }): Blob;
    generate(opts?: Record<string, unknown>): Uint8Array;
  }
}

declare module 'docxtemplater' {
  import type PizZip from 'pizzip';

  export default class Docxtemplater {
    constructor(zip: PizZip, options?: { paragraphLoop?: boolean; linebreaks?: boolean });
    render(data: Record<string, unknown>): void;
    getZip(): PizZip;
  }
}

declare module 'jszip-utils' {
  function getText(url: string, callback: (err: Error | null, text: string) => void): void;
  function getBinaryContent(url: string, callback: (err: Error | null, data: ArrayBuffer) => void): void;
  export default { getText, getBinaryContent };
}
