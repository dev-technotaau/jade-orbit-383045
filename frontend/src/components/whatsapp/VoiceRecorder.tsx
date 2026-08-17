'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Trash2, Send, Square, Loader2 } from 'lucide-react';
import { showToast } from '@/components/ui/Toast';
import { blobToMp3 } from '@/lib/audio-to-mp3';

type Status = 'idle' | 'recording' | 'processing' | 'preview';

/** A finished clip, plus how it should be named when handed to the composer. */
type Clip = { blob: Blob; ext: 'ogg' | 'mp3'; type: string };

/**
 * Pick the first MediaRecorder container the browser can actually record.
 *
 * OGG/Opus leads deliberately: it is the only container WhatsApp draws as a
 * push-to-talk bubble, so recording straight into it lets the clip go out
 * untouched. It used to sit behind `audio/webm;codecs=opus`, which every
 * Chromium build supports, so the OGG branch was unreachable even on the one
 * engine that can record it — every voice note left as an MP3 attachment.
 * Firefox is that engine today; Chromium wraps Opus in WebM and Safari records
 * AAC in MP4, and the Cloud API accepts neither, so those still transcode.
 */
function pickRecordingMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

/**
 * Did the recorder really produce Opus inside an OGG container?
 *
 * Asked of `recorder.mimeType` rather than of the requested type: a browser may
 * ignore the hint and fall back, and shipping a Vorbis-in-OGG clip labelled as a
 * voice note would be rejected by Meta rather than rendered.
 */
function isOggOpus(mime: string): boolean {
  const m = mime.toLowerCase();
  return m.startsWith('audio/ogg') && m.includes('opus');
}

function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const MAX_SECONDS = 5 * 60; // cap like WhatsApp

/**
 * Record + send a voice message. Records via MediaRecorder and hands the File
 * back to the composer to upload through the existing media-send flow.
 *
 * The container is the whole point. WhatsApp only renders the familiar
 * push-to-talk bubble for OGG/Opus, so a recording that already IS OGG/Opus is
 * sent verbatim; everything else is transcoded to MP3, which the Cloud API
 * accepts on every browser but delivers as a plain audio attachment with a
 * filename. Renders a mic button when idle and an overlay bar (covering the
 * composer) while recording/previewing.
 */
export default function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (file: File) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Encode progress, 0…1. The encode runs in a worker now, so there is a number
  // to report and the bar it sits in stays interactive while it climbs.
  const [progress, setProgress] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clipRef = useRef<Clip | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const elapsedRef = useRef(0);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const revokePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  // Cleanup on unmount: stop everything and release resources.
  useEffect(() => {
    return () => {
      stopTimer();
      releaseStream();
      revokePreview();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          /* already stopped */
        }
      }
    };
  }, []);

  const reset = () => {
    stopTimer();
    releaseStream();
    revokePreview();
    chunksRef.current = [];
    clipRef.current = null;
    recorderRef.current = null;
    elapsedRef.current = 0;
    setPreviewUrl(null);
    setSeconds(0);
    setProgress(0);
    setStatus('idle');
  };

  /** Park a finished clip in the preview bar, ready to send. */
  const showClip = (clip: Clip) => {
    clipRef.current = clip;
    const url = URL.createObjectURL(clip.blob);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setStatus('preview');
  };

  const start = async () => {
    if (disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cancelledRef.current = false;
      chunksRef.current = [];

      const mime = pickRecordingMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        releaseStream();
        if (cancelledRef.current) return;
        const recordedMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: recordedMime });
        if (blob.size === 0) {
          showToast.error('Nothing was recorded');
          reset();
          return;
        }
        // Already the container Meta renders as a voice note — no decode, no
        // re-encode, and no wait on the MP3 worker either.
        if (isOggOpus(recordedMime)) {
          showClip({ blob, ext: 'ogg', type: 'audio/ogg' });
          return;
        }
        setStatus('processing');
        setProgress(0);
        try {
          const mp3 = await blobToMp3(blob, { onProgress: setProgress });
          showClip({ blob: mp3, ext: 'mp3', type: 'audio/mpeg' });
        } catch {
          showToast.error('Could not process the recording');
          reset();
        }
      };

      recorder.start();
      elapsedRef.current = 0;
      setSeconds(0);
      setStatus('recording');
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setSeconds(elapsedRef.current);
        if (elapsedRef.current >= MAX_SECONDS) {
          // Auto-stop at the cap.
          stopTimer();
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
          }
        }
      }, 1000);
    } catch {
      releaseStream();
      showToast.error('Microphone access denied or unavailable');
      setStatus('idle');
    }
  };

  const stop = () => {
    stopTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const cancel = () => {
    cancelledRef.current = true;
    stopTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    reset();
  };

  const send = () => {
    const clip = clipRef.current;
    if (!clip) return;
    const file = new File([clip.blob], `voice-message-${seconds}s.${clip.ext}`, {
      type: clip.type,
    });
    onRecorded(file);
    reset();
  };

  // ── Idle: just the mic button ──────────────────────────────────────────────
  if (status === 'idle') {
    return (
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        aria-label="Record voice message"
        title="Record voice message"
        className="flex h-10 items-center rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)] disabled:opacity-60"
      >
        <Mic className="h-5 w-5" />
      </button>
    );
  }

  // ── Active states: overlay bar covering the composer ───────────────────────
  return (
    <div className="absolute inset-0 z-10 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3">
      {status === 'recording' && (
        <>
          <span className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            Recording
          </span>
          <span className="font-mono text-sm text-[var(--text-muted)] tabular-nums">
            {fmt(seconds)}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={cancel}
              aria-label="Cancel recording"
              title="Cancel"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-red-600"
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={stop}
              aria-label="Stop recording"
              title="Stop"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          </div>
        </>
      )}

      {status === 'processing' && (
        <span className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Processing…
          {progress > 0 && <span className="tabular-nums">{Math.round(progress * 100)}%</span>}
        </span>
      )}

      {status === 'preview' && previewUrl && (
        <>
          <button
            type="button"
            onClick={cancel}
            aria-label="Delete recording"
            title="Delete"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-red-600"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <audio src={previewUrl} controls className="h-9 min-w-0 flex-1" />
          <button
            type="button"
            onClick={send}
            aria-label="Send voice message"
            title="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Send className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
