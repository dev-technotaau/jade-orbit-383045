import { Mp3Encoder } from '@breezystack/lamejs';
import type { EncodeRequest, EncodeResponse } from './audio-to-mp3.worker';

/**
 * Transcode a recorded audio Blob into MP3 (`audio/mpeg`).
 *
 * Why: browser `MediaRecorder` produces different containers per engine —
 * `audio/webm;codecs=opus` on Chrome, `audio/ogg;codecs=opus` on Firefox,
 * `audio/mp4` on Safari. The WhatsApp Cloud API does NOT accept `webm`, so a
 * raw Chrome recording can't be sent as-is. MP3 (`audio/mpeg`) is accepted on
 * every browser and plays as a normal audio message, so we normalise to it.
 *
 * This is the FALLBACK path, not the default one: OGG/Opus is the only container
 * WhatsApp renders as a push-to-talk bubble, so `VoiceRecorder` sends such a
 * recording untouched and reaches for this only on the engines that cannot
 * produce one. An MP3 arrives as an ordinary audio attachment instead.
 *
 * The input is decoded via the Web Audio API (which can decode webm/ogg/mp4),
 * down-mixed to mono (voice is mono — smaller payload), and re-encoded to MP3
 * with lamejs. Decoding stays on this thread because `decodeAudioData` is the
 * only thing that reads those containers and Web Audio is not exposed to
 * workers; the encode itself — the part that takes seconds — runs in
 * ./audio-to-mp3.worker.
 */

/**
 * Encode bitrate. This is speech, not music: 48 kbps mono is ample for a voice
 * note and puts the recorder's five-minute maximum at ~1.8 MB.
 *
 * It used to encode at 128 kbps — ~960 KB per minute, so a full-length note came
 * out around 4.7 MB. That is past the proxy body limit (`MAX_UPLOAD_BYTES`), so
 * the clip an operator had just spent five minutes recording was the one clip
 * that could not take the simple one-request upload path.
 */
const VOICE_BITRATE_KBPS = 48;

/** LAME's preferred frame size — mirrors BLOCK_SIZE in the worker. */
const BLOCK_SIZE = 1152;

/**
 * How long to wait for the worker's `ready` handshake before falling back to a
 * main-thread encode. Generous: it only covers module load, not the encode.
 */
const WORKER_READY_TIMEOUT_MS = 3000;

export interface Mp3Options {
  /**
   * Fraction of the clip encoded so far, 0…1. Only fires on the worker path —
   * the main-thread fallback cannot report progress, because nothing else runs
   * while it encodes.
   */
  onProgress?: (ratio: number) => void;
}

export async function blobToMp3(blob: Blob, opts: Mp3Options = {}): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio API is not supported in this browser');

  const ctx = new AudioCtx();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close().catch(() => {});
  }

  const { sampleRate } = audioBuffer;
  const mono = toMono(audioBuffer);

  const worker = await spawnEncoder();
  if (!worker) return encodeOnThisThread(mono, sampleRate);
  try {
    return await encodeInWorker(worker, mono, sampleRate, opts.onProgress);
  } finally {
    worker.terminate();
  }
}

/** Collapse every channel into one — voice is mono, and it halves the samples. */
function toMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / numberOfChannels;
  }
  return mono;
}

/**
 * Start the encode worker and wait for the `ready` message it posts at module
 * load.
 *
 * The handshake is the point: the samples are TRANSFERRED to the worker rather
 * than copied, so once they are posted this thread no longer has them and there
 * is nothing left to fall back with. Confirming the worker exists first means a
 * browser that refuses it — or a bundler that never emitted it — degrades to a
 * slow encode instead of a failed send.
 */
function spawnEncoder(): Promise<Worker | null> {
  return new Promise<Worker | null>((resolve) => {
    let worker: Worker;
    try {
      // `new URL(…, import.meta.url)` is the form the bundler recognises: it
      // emits the worker (lamejs included) as its own chunk, rather than leaving
      // a .ts path to be fetched at runtime.
      worker = new Worker(new URL('./audio-to-mp3.worker.ts', import.meta.url));
    } catch {
      resolve(null);
      return;
    }

    let timer = 0;
    const settle = (value: Worker | null) => {
      window.clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      if (!value) worker.terminate();
      resolve(value);
    };
    timer = window.setTimeout(() => settle(null), WORKER_READY_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<EncodeResponse>) => {
      if (event.data?.type === 'ready') settle(worker);
    };
    worker.onerror = () => settle(null);
  });
}

/** Hand the samples to the worker and resolve with the MP3 it sends back. */
function encodeInWorker(
  worker: Worker,
  mono: Float32Array,
  sampleRate: number,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<EncodeResponse>) => {
      const msg = event.data;
      if (msg.type === 'progress') onProgress?.(msg.ratio);
      else if (msg.type === 'done') resolve(new Blob([msg.mp3], { type: 'audio/mpeg' }));
      else if (msg.type === 'error') reject(new Error(msg.message));
    };
    worker.onerror = () => reject(new Error('MP3 encoding failed'));

    const request: EncodeRequest = { mono, sampleRate, bitrateKbps: VOICE_BITRATE_KBPS };
    worker.postMessage(request, [mono.buffer as ArrayBuffer]);
  });
}

/**
 * Fallback for an environment with no usable Worker. Identical encode, on the
 * calling thread — which freezes it for the length of the clip, and is exactly
 * why this is the fallback rather than the path.
 */
function encodeOnThisThread(mono: Float32Array, sampleRate: number): Blob {
  // Float32 [-1, 1] → signed 16-bit PCM.
  const samples = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const encoder = new Mp3Encoder(1, sampleRate, VOICE_BITRATE_KBPS);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += BLOCK_SIZE) {
    const mp3 = encoder.encodeBuffer(samples.subarray(i, i + BLOCK_SIZE));
    if (mp3.length > 0) chunks.push(mp3);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}
