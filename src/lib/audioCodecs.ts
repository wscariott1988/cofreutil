export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

const SUPPORTED_RATES = new Set([16000, 32000, 44100, 48000]);

export async function decodeAudio(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const OfflineCtx = window.OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
  const ctx = new OfflineCtx(1, 1, 44100);
  if (typeof (ctx as any).decodeAudioData === 'function' && (ctx.decodeAudioData as any).length >= 1) {
    return await ctx.decodeAudioData(arrayBuffer);
  }
  return new Promise((resolve, reject) => {
    (ctx as any).decodeAudioData(arrayBuffer, resolve, reject);
  });
}

export async function resample(buffer: AudioBuffer, targetRate: number, channels: number): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetRate && buffer.numberOfChannels === channels) return buffer;
  const OfflineCtx = window.OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
  const ctx = new OfflineCtx(channels, Math.ceil(buffer.duration * targetRate), targetRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
  return await ctx.startRendering();
}

export function cropBuffer(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const start = Math.max(0, Math.floor(startSec * buffer.sampleRate));
  const end = Math.min(buffer.length, Math.ceil(endSec * buffer.sampleRate));
  const length = Math.max(1, end - start);
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const result = new AudioBuffer({ length, sampleRate: buffer.sampleRate, numberOfChannels: channels });
  for (let ch = 0; ch < channels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = result.getChannelData(ch);
    dst.set(src.subarray(start, start + length));
  }
  return result;
}

export function wavFromBuffer(buffer: AudioBuffer): Blob {
  const numChannels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const dataSize = frames * numChannels * bytesPerSample;
  const bufferOut = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bufferOut);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  const offset = 44;
  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch);
    let idx = ch * bytesPerSample;
    for (let i = 0; i < frames; i++) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset + idx, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      idx += numChannels * bytesPerSample;
    }
  }
  return new Blob([bufferOut], { type: 'audio/wav' });
}

function floatTo16(data: Float32Array): Int16Array {
  const out = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export async function encodeMp3(buffer: AudioBuffer, kbps: number): Promise<Blob> {
  const rate = SUPPORTED_RATES.has(buffer.sampleRate) ? buffer.sampleRate : 44100;
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const source = await resample(buffer, rate, channels);
  const lamejs = await import('@breezystack/lamejs');
  const encoder = new lamejs.Mp3Encoder(channels, rate, kbps);
  const left = floatTo16(source.getChannelData(0));
  const right = channels === 2 ? floatTo16(source.getChannelData(1)) : undefined;
  const block = 1152;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block);
    const r = right ? right.subarray(i, i + block) : undefined;
    const data = encoder.encodeBuffer(l, r);
    if (data.length > 0) parts.push(data);
  }
  const tail = encoder.flush();
  if (tail.length > 0) parts.push(tail);
  return new Blob(parts, { type: 'audio/mpeg' });
}

export async function encodeOgg(buffer: AudioBuffer, quality: number): Promise<Blob> {
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const source = await resample(buffer, buffer.sampleRate, channels);
  const mod: any = await import('vorbis-encoder-js');
  const OggEncoder = mod.encoder ?? mod.default?.encoder;
  if (typeof OggEncoder !== 'function') {
    throw new Error('Encoder OGG indisponível no navegador');
  }
  const encoder = new OggEncoder(source.sampleRate, channels, Math.min(1, Math.max(-0.1, quality)));
  try {
    encoder.encodeFrom(source);
    return encoder.finish('audio/ogg');
  } finally {
    try {
      encoder.cancel();
    } catch {
      // encoder já finalizado
    }
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatSeconds(total: number): string {
  const secs = Math.max(0, Math.floor(total));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${pad(s)}`;
}