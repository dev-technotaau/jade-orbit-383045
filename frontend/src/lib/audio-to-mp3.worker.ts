import { Mp3Encoder } from '@breezystack/lamejs';

/**
 * Worker half of {@link ./audio-to-mp3}: the MP3 encode itself.
 *
 * lamejs is pure JS, so encoding runs at whatever speed the calling thread can
 * give it — and a five-minute voice note is ~14 million samples. On the main
 * thread that froze the tab behind a "Processing…" label for the entire encode:
 * no scrolling the inbox, no cancelling, no typing. Here it costs the operator
 * nothing but a progress number.
 *
 * Only the encode moved. Decoding stays on the main thread because the Web
 * Audio API (`decodeAudioData`, the only thing that can read the webm/ogg/mp4
 * containers `MediaRecorder` produces) is not exposed to workers.
 */

/** Request posted by the main thread. `mono` arrives transferred, not copied. */
export type EncodeRequest = {
  /** Mono PCM, Float32 in [-1, 1]. */
  mono: Float32Array;
  sampleRate: number;
  bitrateKbps: number;
};

/** Everything this worker posts back. */
export type EncodeResponse =
  /** Sent once at module load — see the handshake note in audio-to-mp3.ts. */
  | { type: 'ready' }
  /** Fraction of the clip encoded so far, 0…1. */
  | { type: 'progress'; ratio: number }
  /** The finished MP3, transferred back. */
  | { type: 'done'; mp3: ArrayBuffer }
  | { type: 'error'; message: string };

/** LAME's preferred frame size — `encodeBuffer` is fed exactly this many samples. */
const BLOCK_SIZE = 1152;

/** Post progress at most every 2% of the clip, so the UI updates ~50 times. */
const PROGRESS_STEP = 0.02;

/**
 * `self` is typed as a `Window` here because the app's tsconfig ships the `dom`
 * lib (a `webworker` reference would collide with it), so the worker globals are
 * narrowed by hand instead.
 */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<EncodeRequest>) => void) | null;
  postMessage(message: EncodeResponse, transfer?: Transferable[]): void;
};

function encode({ mono, sampleRate, bitrateKbps }: EncodeRequest): ArrayBuffer {
  // Float32 [-1, 1] → signed 16-bit PCM.
  const samples = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const encoder = new Mp3Encoder(1, sampleRate, bitrateKbps);
  const chunks: Uint8Array[] = [];
  let total = 0;
  let nextReport = PROGRESS_STEP;

  for (let i = 0; i < samples.length; i += BLOCK_SIZE) {
    const mp3 = encoder.encodeBuffer(samples.subarray(i, i + BLOCK_SIZE));
    if (mp3.length > 0) {
      chunks.push(mp3);
      total += mp3.length;
    }
    const ratio = Math.min((i + BLOCK_SIZE) / samples.length, 1);
    if (ratio >= nextReport) {
      scope.postMessage({ type: 'progress', ratio });
      nextReport = ratio + PROGRESS_STEP;
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) {
    chunks.push(tail);
    total += tail.length;
  }

  // One buffer rather than an array of chunks: it transfers back with no copy.
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}

scope.onmessage = (event) => {
  try {
    const mp3 = encode(event.data);
    scope.postMessage({ type: 'done', mp3 }, [mp3]);
  } catch (err) {
    scope.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'MP3 encoding failed',
    });
  }
};

scope.postMessage({ type: 'ready' });
