'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Trash2, Send, Square, Loader2 } from 'lucide-react';
import { showToast } from '@/components/ui/Toast';
import { blobToMp3 } from '@/lib/audio-to-mp3';

type Status = 'idle' | 'recording' | 'processing' | 'preview';

/** Pick the first MediaRecorder container the browser can actually record. */
function pickRecordingMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const MAX_SECONDS = 5 * 60; // cap like WhatsApp

/**
 * Record + send a voice message. Records via MediaRecorder, then normalises the
 * clip to MP3 (`audio/mpeg`) — the only audio format the WhatsApp Cloud API
 * accepts across every browser — and hands the File back to the composer to
 * upload through the existing media-send flow. Renders a mic button when idle
 * and an overlay bar (covering the composer) while recording/previewing.
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

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mp3Ref = useRef<Blob | null>(null);
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
    mp3Ref.current = null;
    recorderRef.current = null;
    elapsedRef.current = 0;
    setPreviewUrl(null);
    setSeconds(0);
    setStatus('idle');
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
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size === 0) {
          showToast.error('Nothing was recorded');
          reset();
          return;
        }
        setStatus('processing');
        try {
          const mp3 = await blobToMp3(blob);
          mp3Ref.current = mp3;
          const url = URL.createObjectURL(mp3);
          previewUrlRef.current = url;
          setPreviewUrl(url);
          setStatus('preview');
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
    if (!mp3Ref.current) return;
    const file = new File([mp3Ref.current], `voice-message-${seconds}s.mp3`, {
      type: 'audio/mpeg',
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
