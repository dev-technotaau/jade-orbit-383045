'use client';

import { useState, useCallback, useRef } from 'react';
import { Navigation, Loader2, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface RadiusSliderProps {
  latitude?: string;
  longitude?: string;
  radiusKm?: string;
  onLocationChange: (lat: string, lng: string, cityName?: string) => void;
  onRadiusChange: (radiusKm: string) => void;
  onClear: () => void;
}

export default function RadiusSlider({
  latitude,
  longitude,
  radiusKm,
  onLocationChange,
  onRadiusChange,
  onClear,
}: RadiusSliderProps) {
  const [isLocating, setIsLocating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hasGeo = Boolean(latitude && longitude);

  const handleUseMyLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      showToast.error('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Reverse-geocode via Nominatim (free, no API key)
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
            { headers: { 'Accept-Language': 'en' } },
          );
          const data = await resp.json();
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.county ||
            data.display_name?.split(',')[0] ||
            'Your location';
          onLocationChange(String(lat), String(lng), city);
        } catch {
          // Geocode failed — still use coordinates
          onLocationChange(String(lat), String(lng));
        }
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          showToast.error('Location access denied. You can type your location instead.');
        } else {
          showToast.error('Could not determine your location. Please try again.');
        }
      },
      { timeout: 10000, enableHighAccuracy: false },
    );
  }, [onLocationChange]);

  const handleRadiusInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onRadiusChange(value), 300);
    },
    [onRadiusChange],
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!hasGeo ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUseMyLocation}
          isLoading={isLocating}
          className="text-xs"
          tooltip="Detect your current location"
        >
          {!isLocating && <Navigation className="mr-1.5 h-3.5 w-3.5" />}
          Use my location
        </Button>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <label
              htmlFor="radius-slider"
              className="text-xs whitespace-nowrap text-[var(--text-muted)]"
            >
              Within
            </label>
            <input
              id="radius-slider"
              type="range"
              min={5}
              max={100}
              step={5}
              defaultValue={radiusKm || '25'}
              onChange={handleRadiusInput}
              className="accent-primary h-1.5 w-24 cursor-pointer"
            />
            <span className="min-w-[3.5rem] text-xs font-medium text-[var(--text)] tabular-nums">
              {radiusKm || '25'} km
            </span>
          </div>
          <Tooltip content="Clear location filter">
            <button
              type="button"
              onClick={onClear}
              className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
              aria-label="Clear location"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </Tooltip>
        </>
      )}
    </div>
  );
}
