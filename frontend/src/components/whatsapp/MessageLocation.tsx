'use client';

import { ExternalLink, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageLocationProps {
  payload: unknown;
}

interface ParsedLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function parseLocation(payload: unknown): ParsedLocation | null {
  if (!isRecord(payload)) return null;

  const { latitude, longitude } = payload;
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    name: optionalString(payload.name),
    address: optionalString(payload.address),
  };
}

export default function MessageLocation({ payload }: MessageLocationProps) {
  const location = parseLocation(payload);

  if (!location) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden />
        <span>Shared a location</span>
      </div>
    );
  }

  const { latitude, longitude, name, address } = location;
  const coords = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

  return (
    <div
      className={cn(
        'flex max-w-xs flex-col gap-2 rounded-lg border border-[var(--border)]',
        'bg-[var(--bg-secondary)] p-3',
      )}
    >
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        <div className="min-w-0 flex-1">
          {name ? (
            <p className="truncate text-sm font-semibold text-[var(--text)]">{name}</p>
          ) : (
            <p className="text-sm font-semibold text-[var(--text)]">{coords}</p>
          )}
          {address ? (
            <p className="mt-0.5 text-xs break-words text-[var(--text-muted)]">{address}</p>
          ) : name ? (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{coords}</p>
          ) : null}
        </div>
      </div>

      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center justify-center gap-1.5 self-start rounded-md',
          'border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-medium',
          'text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]',
        )}
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        View on map
      </a>
    </div>
  );
}
