declare module 'vorbis-encoder-js' {
  export class encoder {
    constructor(sampleRate: number, numChannels: number, quality: number, tags?: Record<string, string>);
    encodeFrom(buffer: AudioBuffer): void;
    finish(mimeType?: string): Blob;
    cancel(): void;
  }
}