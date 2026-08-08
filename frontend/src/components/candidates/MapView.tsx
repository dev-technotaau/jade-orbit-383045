'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import Link from 'next/link';
import { Bookmark, BookmarkCheck, User as UserIcon } from 'lucide-react';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { ROUTES } from '@/constants/routes';
import type { CandidateProfile } from '@/types/candidate';

/* ─── Types ─── */

interface CandidateMapViewProps {
  candidates: CandidateProfile[];
  selectedCandidateId?: string;
  savedCandidateIds: Set<string>;
  onSaveCandidate: (candidateId: string) => void;
  onSelectCandidate?: (candidateId: string) => void;
  onSearchArea: (lat: number, lng: number, radiusKm: number) => void;
  userLat?: number;
  userLng?: number;
}

/* ─── Marker icons ─── */

function createCandidateMarkerIcon(workStatus: string | null | undefined, isSelected: boolean) {
  const color = isSelected
    ? '#7C3AED' // purple for selected
    : workStatus === 'ACTIVELY_LOOKING'
      ? '#10B981' // green for actively looking
      : workStatus === 'OPEN_TO_OFFERS'
        ? '#3B82F6' // blue for open to offers
        : '#6B7280'; // gray for not looking
  const size = isSelected ? 28 : 22;
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);transition:all 0.15s"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

/* ─── FitBounds helper ─── */

function FitBoundsHelper({ candidates }: { candidates: CandidateProfile[] }) {
  const map = useMap();
  const prevCountRef = useRef(0);

  useEffect(() => {
    // Only refit when candidate count changes
    if (candidates.length === prevCountRef.current) return;
    prevCountRef.current = candidates.length;

    const geoCandidates = candidates.filter((c) => c.latitude && c.longitude);
    if (geoCandidates.length > 0) {
      const bounds = L.latLngBounds(
        geoCandidates.map((c) => [c.latitude!, c.longitude!] as [number, number]),
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    } else {
      // Default: India center
      map.setView([20.5937, 78.9629], 5);
    }
  }, [candidates, map]);

  return null;
}

/* ─── Search this area button ─── */

function SearchAreaButton({
  onSearchArea,
}: {
  onSearchArea: (lat: number, lng: number, radiusKm: number) => void;
}) {
  const [moved, setMoved] = useState(false);
  const map = useMapEvents({
    moveend: () => setMoved(true),
  });

  if (!moved) return null;

  return (
    <div className="absolute top-4 left-1/2 z-[1000] -translate-x-1/2">
      <Button
        size="sm"
        onClick={() => {
          const center = map.getCenter();
          const bounds = map.getBounds();
          const radiusKm = Math.round(center.distanceTo(bounds.getNorthEast()) / 1000);
          onSearchArea(center.lat, center.lng, Math.min(radiusKm, 200));
          setMoved(false);
        }}
        className="shadow-lg"
        tooltip="Search for candidates in the visible map area"
      >
        Search this area
      </Button>
    </div>
  );
}

/* ─── Selected candidate panner ─── */

function PanToSelected({
  selectedCandidateId,
  candidates,
}: {
  selectedCandidateId?: string;
  candidates: CandidateProfile[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedCandidateId) return;
    const candidate = candidates.find((c) => c.id === selectedCandidateId);
    if (candidate?.latitude && candidate?.longitude) {
      map.panTo([candidate.latitude, candidate.longitude], { animate: true });
    }
  }, [selectedCandidateId, candidates, map]);

  return null;
}

/* ─── Main component ─── */

export default function CandidateMapView({
  candidates,
  selectedCandidateId,
  savedCandidateIds,
  onSaveCandidate,
  onSelectCandidate,
  onSearchArea,
}: CandidateMapViewProps) {
  const geoCandidates = useMemo(
    () => candidates.filter((c) => c.latitude && c.longitude),
    [candidates],
  );

  return (
    <MapContainer
      center={[20.5937, 78.9629]}
      zoom={5}
      className="h-full w-full rounded-xl"
      scrollWheelZoom
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBoundsHelper candidates={geoCandidates} />
      <SearchAreaButton onSearchArea={onSearchArea} />
      <PanToSelected selectedCandidateId={selectedCandidateId} candidates={geoCandidates} />

      {geoCandidates.map((candidate) => {
        const isSelected = candidate.id === selectedCandidateId;
        const isSaved = savedCandidateIds.has(candidate.userId);
        const name = candidate.user
          ? `${candidate.user.firstName || ''} ${candidate.user.lastName || ''}`.trim()
          : 'Anonymous';

        return (
          <Marker
            key={candidate.id}
            position={[candidate.latitude!, candidate.longitude!]}
            icon={createCandidateMarkerIcon(candidate.workStatus, isSelected)}
            eventHandlers={{ click: () => onSelectCandidate?.(candidate.id) }}
          >
            <Popup maxWidth={280} minWidth={220}>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <div className="bg-primary-light flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                    {candidate.user?.avatar ? (
                      <img
                        src={candidate.user.avatar}
                        alt={name}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <UserIcon className="text-primary h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Tooltip content="View candidate profile">
                      <Link
                        href={ROUTES.EMPLOYER.CANDIDATE_DETAIL(candidate.id)}
                        className="hover:text-primary block cursor-pointer text-sm leading-tight font-semibold text-[var(--text)] transition-colors"
                      >
                        {name}
                      </Link>
                    </Tooltip>
                    {candidate.headline && (
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {candidate.headline}
                      </p>
                    )}
                  </div>
                </div>
                {candidate.currentRole && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    {candidate.currentRole}
                    {candidate.currentCompany && ` at ${candidate.currentCompany}`}
                  </p>
                )}
                {candidate.experienceYears !== undefined && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {candidate.experienceYears} years exp
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 pt-1">
                  {candidate.currentLocation && (
                    <span className="truncate text-xs text-[var(--text-muted)]">
                      📍 {candidate.currentLocation}
                    </span>
                  )}
                  <Tooltip
                    content={isSaved ? 'Remove from saved candidates' : 'Save this candidate'}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSaveCandidate(candidate.userId);
                      }}
                      className={`cursor-pointer ${
                        isSaved
                          ? 'text-primary'
                          : 'hover:text-primary text-[var(--text-muted)] transition-colors'
                      }`}
                      aria-label={isSaved ? 'Unsave candidate' : 'Save candidate'}
                    >
                      {isSaved ? (
                        <BookmarkCheck className="h-4 w-4" />
                      ) : (
                        <Bookmark className="h-4 w-4" />
                      )}
                    </button>
                  </Tooltip>
                </div>
                {candidate.skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {candidate.skills.slice(0, 3).map((s, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                      >
                        {s}
                      </span>
                    ))}
                    {candidate.skills.length > 3 && (
                      <span className="text-[10px] text-[var(--text-muted)]">
                        +{candidate.skills.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
