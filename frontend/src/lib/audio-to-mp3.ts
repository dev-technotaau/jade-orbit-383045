import { Mp3Encoder } from '@breezystack/lamejs';

/**
 * Transcode a recorded audio Blob into MP3 (`audio/mpeg`).
 *
 * Why: browser `MediaRecorder` produces different containers per engine —
 * `audio/webm;codecs=opus` on Chrome, `audio/ogg;codecs=opus` on Firefox,
 * `audio/mp4` on Safari. The WhatsApp Cloud API does NOT accept `webm`, so a
 * raw Chrome recording can't be sent as-is. MP3 (`audio/mpeg`) is accepted on
 * every browser and plays as a normal audio message, so we normalise to it.
 *
 * The input is decoded via the Web Audio API (which can decode webm/ogg/mp4),
 * down-mixed to mono (voice is mono — smaller payload), and re-encoded to MP3
 * with lamejs (pure JS, no wasm/worker assets needed).
 */
export async function blobToMp3(blob: Blob): Promise<Blob> {
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

  const { sampleRate, numberOfChannels, length } = audioBuffer;

  // Down-mix all channels to a single mono track.
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / numberOfChannels;
  }

  // Float32 [-1, 1] → signed 16-bit PCM.
  const samples = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const encoder = new Mp3Encoder(1, sampleRate, 128);
  const blockSize = 1152; // LAME's preferred frame size
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += blockSize) {
    const block = samples.subarray(i, i + blockSize);
    const mp3 = encoder.encodeBuffer(block);
    if (mp3.length > 0) chunks.push(mp3);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}
