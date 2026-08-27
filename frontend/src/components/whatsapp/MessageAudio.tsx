'use client';

import { useMemo, useRef, useState } from 'react';
import { Play, Pause, Mic, Music2, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API } from '@/constants/api';
import type { WaMessage } from '@/types/whatsapp';

interface MessageAudioProps {
  message: WaMessage;
  outbound: boolean;
}

const WAVEFORM_BARS = 32;

/** Defensive read of a string field off an `unknown` payload. */
function payloadString(payload: unknown, key: string): string | null {
  if (payload && typeof payload === 'object' && key in payload) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

/** True when the payload marks this audio as a WhatsApp voice note. */
function isVoiceNote(payload: unknown): boolean {
  return (
    !!payload && typeof payload === 'object' && (payload as Record<string, unknown>).voice === true
  );
}

/** Format seconds as m:ss; falls back to 0:00 for non-finite input. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MessageAudio({ message, outbound }: MessageAudioProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const voice = isVoiceNote(message.payload);
  const filename = payloadString(message.payload, 'filename') || 'Audio';
  const caption = message.text && message.text.trim() ? message.text : null;

  const src = message.mediaId ? `/api/proxy${API.SUPER_ADMIN.WA_MEDIA(message.mediaId)}` : '';

  // Deterministic waveform heights (percent) — stable across renders, no RNG.
  const waveform = useMemo(
    () =>
      Array.from(
        { length: WAVEFORM_BARS },
        (_, i) => 30 + Math.round(Math.abs(Math.sin((i + 1) * 1.7)) * 70),
      ),
    [],
  );

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  // ── Playback engine (imperative; driven from event handlers) ───────────────
  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  const seekFromPointer = (clientX: number, target: HTMLElement) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(duration) || duration <= 0) return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const next = ratio * duration;
    el.currentTime = next;
    setCurrentTime(next);
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    seekFromPointer(e.clientX, e.currentTarget);
  };

  const handleTrackDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    // Primary button held down → scrub.
    if (e.buttons === 1) seekFromPointer(e.clientX, e.currentTarget);
  };

  // Colors: light controls on emerald bubble (outbound) vs dark on light (inbound).
  const accent = outbound ? 'text-white' : 'text-[var(--primary)]';
  const muted = outbound ? 'text-emerald-100/80' : 'text-[var(--text-muted)]';
  const btnBase = outbound
    ? 'bg-white/20 text-white hover:bg-white/30'
    : 'bg-[var(--primary)] text-white hover:opacity-90';
  const dlBtn = outbound
    ? 'text-emerald-100/80 hover:bg-white/15 hover:text-white'
    : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]';
  const barFilled = outbound ? 'bg-white' : 'bg-[var(--primary)]';
  const barMuted = outbound ? 'bg-white/35' : 'bg-[var(--border)]';

  // Hidden engine shared by both variants.
  const engine = (
    <audio
      ref={audioRef}
      src={src}
      preload="metadata"
      className="hidden"
      onLoadedMetadata={(e) => {
        const d = e.currentTarget.duration;
        if (Number.isFinite(d)) setDuration(d);
      }}
      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      onEnded={() => {
        setIsPlaying(false);
        setCurrentTime(0);
        const el = audioRef.current;
        if (el) el.currentTime = 0;
      }}
      onPause={() => setIsPlaying(false)}
      onPlay={() => setIsPlaying(true)}
    />
  );

  const PlayPauseButton = (
    <button
      type="button"
      onClick={togglePlay}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      title={isPlaying ? 'Pause' : 'Play'}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
        btnBase,
      )}
    >
      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
    </button>
  );

  const DownloadButton = (
    <a
      href={src}
      download={filename}
      aria-label="Download"
      title="Download"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
        dlBtn,
      )}
    >
      <Download className="h-3.5 w-3.5" />
    </a>
  );

  // ── VOICE NOTE VARIANT ─────────────────────────────────────────────────────
  if (voice) {
    const elapsed = isPlaying || currentTime > 0 ? currentTime : duration;
    return (
      <div className="flex flex-col">
        {engine}
        <div className="flex max-w-[17rem] items-center gap-2.5">
          {PlayPauseButton}
          <div className="min-w-0 flex-1">
            {/* Waveform doubles as the seek track. */}
            <div
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.floor(duration) || 0}
              aria-valuenow={Math.floor(currentTime)}
              tabIndex={0}
              onClick={handleTrackClick}
              onMouseMove={handleTrackDrag}
              className="flex h-8 cursor-pointer items-center gap-[2px]"
            >
              {waveform.map((h, i) => {
                const filled = (i + 0.5) / WAVEFORM_BARS <= progress;
                return (
                  <span
                    key={i}
                    style={{ height: `${h}%` }}
                    className={cn(
                      'w-[3px] shrink-0 rounded-full transition-colors',
                      filled ? barFilled : barMuted,
                    )}
                  />
                );
              })}
            </div>
            <div className={cn('mt-0.5 flex items-center gap-1 text-[11px]', muted)}>
              <Mic className="h-3 w-3 shrink-0" />
              <span className="tabular-nums">{formatTime(elapsed)}</span>
              <span aria-hidden>/</span>
              <span className="tabular-nums">{formatTime(duration)}</span>
            </div>
          </div>
          {DownloadButton}
        </div>
        {caption && (
          <p
            className={cn(
              'mt-1.5 text-sm break-words whitespace-pre-wrap',
              // The caption sits OUTSIDE the file card, directly on the bubble —
              // which is emerald-600 with white text when outbound. Hard-coding
              // --text (#0f172a, defined unconditionally) rendered it near-black
              // on dark green. MessageImage and MessageVideo already branch here.
              outbound ? 'text-white' : 'text-[var(--text)]',
            )}
            dir="auto"
          >
            {caption}
          </p>
        )}
      </div>
    );
  }

  // ── AUDIO FILE VARIANT ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      {engine}
      <div className="flex max-w-xs items-center gap-3">
        {PlayPauseButton}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Music2 className={cn('h-3.5 w-3.5 shrink-0', accent)} />
            <p
              className={cn(
                'truncate text-sm font-medium',
                outbound ? 'text-white' : 'text-[var(--text)]',
              )}
              title={filename}
            >
              {filename}
            </p>
          </div>
          {/* Thin linear progress / seek bar. */}
          <div
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration) || 0}
            aria-valuenow={Math.floor(currentTime)}
            tabIndex={0}
            onClick={handleTrackClick}
            onMouseMove={handleTrackDrag}
            className="mt-1.5 cursor-pointer py-1.5"
          >
            <div className={cn('h-1 w-full overflow-hidden rounded-full', barMuted)}>
              <div
                className={cn('h-full rounded-full', barFilled)}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
          <div className={cn('mt-0.5 flex items-center gap-1 text-[11px]', muted)}>
            <span className="tabular-nums">{formatTime(currentTime)}</span>
            <span aria-hidden>/</span>
            <span className="tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>
        {DownloadButton}
      </div>
      {caption && (
        <p
          className={cn(
            'mt-1.5 text-sm break-words whitespace-pre-wrap',
            // The caption sits OUTSIDE the file card, directly on the bubble —
            // which is emerald-600 with white text when outbound. Hard-coding
            // --text (#0f172a, defined unconditionally) rendered it near-black
            // on dark green. MessageImage and MessageVideo already branch here.
            outbound ? 'text-white' : 'text-[var(--text)]',
          )}
          dir="auto"
        >
          {caption}
        </p>
      )}
    </div>
  );
}
