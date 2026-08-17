'use client';

import { useRef, useState } from 'react';
import { Download, Loader2, Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API } from '@/constants/api';
import type { WaMessage } from '@/types/whatsapp';

interface MessageVideoProps {
  message: WaMessage;
  outbound: boolean;
}

/** Defensive read of a string field off an `unknown` payload. */
function payloadString(payload: unknown, key: string): string | null {
  if (payload && typeof payload === 'object' && key in payload) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

/** Guess a sensible file extension from a video MIME type. */
function extFromMime(mime: string | null): string {
  if (!mime) return 'mp4';
  const map: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
  };
  if (map[mime]) return map[mime];
  const sub = mime.split('/')[1];
  return sub ? sub.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'mp4' : 'mp4';
}

/** Format seconds as m:ss (deterministic; safe during render). */
function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MessageVideo({ message, outbound }: MessageVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [hovering, setHovering] = useState(false);

  if (!message.mediaId) return null;

  const src = `/api/proxy${API.SUPER_ADMIN.WA_MEDIA(message.mediaId)}`;

  const payloadName = payloadString(message.payload, 'filename');
  const filename = payloadName || `video.${extFromMime(message.mediaMime)}`;

  const caption = message.text && message.text.trim() ? message.text : null;

  // Controls are visible while hovering OR whenever the video is not playing.
  const controlsVisible = hovering || !isPlaying;

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  const goFullscreen = () => {
    const el = videoRef.current;
    if (el && el.requestFullscreen) void el.requestFullscreen();
  };

  // Click anywhere on the seek track → seek proportionally.
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = videoRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    el.currentTime = ratio * duration;
    setCurrentTime(el.currentTime);
  };

  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  // Tone the controls to the bubble: inbound uses dark-on-light, outbound on
  // emerald already reads white well; both sit over a translucent scrim so we
  // keep them white throughout for contrast against the video frame.
  const iconBtn =
    'inline-flex items-center justify-center rounded-full text-white transition-colors hover:bg-white/20';

  return (
    <div className="flex flex-col">
      <div
        className="relative inline-block overflow-hidden rounded-lg"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <video
          ref={videoRef}
          // `#t=0.1` asks the browser to seek to the first tenth of a second, so
          // it paints a real frame instead of a black rectangle behind the blur.
          // There is no server-side poster: extracting one needs a video decoder
          // the backend deliberately does not carry, and Meta supplies none.
          src={`${src}#t=0.1`}
          preload="metadata"
          playsInline
          onClick={togglePlay}
          onLoadedData={() => setReady(true)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          className={cn(
            'block max-h-72 max-w-full cursor-pointer rounded-lg transition-[filter] duration-300',
            !ready && 'blur-sm',
          )}
        />

        {/* Loading overlay: animated shimmer + centered spinner, fades on ready. */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg',
            'animate-pulse bg-[var(--bg-secondary)] transition-opacity duration-300',
            ready ? 'opacity-0' : 'opacity-100',
          )}
        >
          <Loader2 className="h-7 w-7 animate-spin text-[var(--text-muted)]" />
        </div>

        {/* Download affordance (top-right). */}
        <a
          href={src}
          download={filename}
          aria-label="Download video"
          title="Download"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-1.5 right-1.5 z-10 inline-flex items-center justify-center rounded-md bg-black/45 p-1.5 text-white opacity-80 transition-opacity hover:opacity-100"
        >
          <Download className="h-4 w-4" />
        </a>

        {/* Controls overlay (visible on hover or while paused). */}
        <div
          className={cn(
            'pointer-events-none absolute inset-0 flex flex-col justify-between rounded-lg',
            'transition-opacity duration-200',
            ready && controlsVisible ? 'opacity-100' : 'opacity-0',
          )}
        >
          {/* Center play / pause. */}
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={isPlaying ? 'Pause' : 'Play'}
              className={cn(iconBtn, 'pointer-events-auto h-12 w-12 bg-black/45 hover:bg-black/60')}
            >
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
            </button>
          </div>

          {/* Bottom bar: seek + time + mute + fullscreen. */}
          <div className="pointer-events-auto flex flex-col gap-1 bg-gradient-to-t from-black/60 to-transparent px-2.5 pt-4 pb-1.5">
            {/* Seek track (click to seek). */}
            <div
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.floor(duration) || 0}
              aria-valuenow={Math.floor(currentTime)}
              tabIndex={0}
              onClick={handleSeek}
              className="group h-2.5 cursor-pointer py-1"
            >
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-white">
              <span className="tabular-nums">
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  title={muted ? 'Unmute' : 'Mute'}
                  className={cn(iconBtn, 'h-7 w-7')}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={goFullscreen}
                  aria-label="Fullscreen"
                  title="Fullscreen"
                  className={cn(iconBtn, 'h-7 w-7')}
                >
                  <Maximize className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {caption && (
        <p
          className={cn(
            'mt-1.5 text-sm break-words whitespace-pre-wrap',
            outbound ? 'text-white' : 'text-[var(--text)]',
          )}
        >
          {caption}
        </p>
      )}
    </div>
  );
}
