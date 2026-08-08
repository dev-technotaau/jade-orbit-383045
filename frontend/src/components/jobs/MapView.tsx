'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import Link from 'next/link';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { ROUTES } from '@/constants/routes';
import { formatSalaryRange } from '@/lib/utils';
import { formatSalaryAsLPA } from '@/utils/format';
import type { Job } from '@/types/job';

/* ─── Types ─── */

interface MapViewProps {
  jobs: Job[];
  selectedJobId?: string;
  savedJobIds: Set<string>;
  onSaveJob: (jobId: string) => void;
  onSelectJob?: (jobId: string) => void;
  onSearchArea: (lat: number, lng: number, radiusKm: number) => void;
  userLat?: number;
  userLng?: number;
}

/* ─── Marker icons ─── */

function createMarkerIcon(urgency: string | null | undefined, isSelected: boolean) {
  const color = isSelected
    ? '#7C3AED' // purple for selected
    : urgency === 'URGENT'
      ? '#EF4444'
      : urgency === 'IMMEDIATE'
        ? '#F97316'
        : '#1E5CAF';
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

function FitBoundsHelper({ jobs }: { jobs: Job[] }) {
  const map = useMap();
  const prevCountRef = useRef(0);

  useEffect(() => {
    // Only refit when job count changes (avoid refit on every render)
    if (jobs.length === prevCountRef.current) return;
    prevCountRef.current = jobs.length;

    const geoJobs = jobs.filter((j) => j.latitude && j.longitude);
    if (geoJobs.length > 0) {
      const bounds = L.latLngBounds(
        geoJobs.map((j) => [j.latitude!, j.longitude!] as [number, number]),
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    } else {
      // Default: India center
      map.setView([20.5937, 78.9629], 5);
    }
  }, [jobs, map]);

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
        tooltip="Search for jobs in the visible map area"
      >
        Search this area
      </Button>
    </div>
  );
}

/* ─── Selected job panner ─── */

function PanToSelected({ selectedJobId, jobs }: { selectedJobId?: string; jobs: Job[] }) {
  const map = useMap();
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!selectedJobId) return;
    const job = jobs.find((j) => j.id === selectedJobId);
    if (job?.latitude && job?.longitude) {
      map.panTo([job.latitude, job.longitude], { animate: true });
    }
  }, [selectedJobId, jobs, map]);

  return null;
}

/* ─── Main component ─── */

export default function MapView({
  jobs,
  selectedJobId,
  savedJobIds,
  onSaveJob,
  onSelectJob,
  onSearchArea,
}: MapViewProps) {
  const geoJobs = useMemo(() => jobs.filter((j) => j.latitude && j.longitude), [jobs]);

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

      <FitBoundsHelper jobs={geoJobs} />
      <SearchAreaButton onSearchArea={onSearchArea} />
      <PanToSelected selectedJobId={selectedJobId} jobs={geoJobs} />

      {geoJobs.map((job) => {
        const isSelected = job.id === selectedJobId;
        const isSaved = savedJobIds.has(job.id);
        const showLPA =
          (job.currency || 'INR').toUpperCase() === 'INR' && job.salaryType === 'ANNUAL';

        return (
          <Marker
            key={job.id}
            position={[job.latitude!, job.longitude!]}
            icon={createMarkerIcon(job.urgencyLevel, isSelected)}
            eventHandlers={{ click: () => onSelectJob?.(job.id) }}
          >
            <Popup maxWidth={280} minWidth={220}>
              <div className="space-y-1.5">
                <Tooltip content="View job details">
                  <Link
                    href={ROUTES.CANDIDATE.JOB_DETAIL(job.id)}
                    className="hover:text-primary block cursor-pointer text-sm leading-tight font-semibold text-[var(--text)] transition-colors"
                  >
                    {job.title}
                  </Link>
                </Tooltip>
                <p className="text-xs text-[var(--text-muted)]">
                  {job.isConfidential ? 'Confidential' : job.company?.companyName}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--text)]">
                    {showLPA
                      ? formatSalaryAsLPA(job.salaryMin, job.salaryMax)
                      : formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)}
                  </span>
                  <Tooltip content={isSaved ? 'Remove from saved jobs' : 'Save this job'}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSaveJob(job.id);
                      }}
                      className={`cursor-pointer ${
                        isSaved
                          ? 'text-primary'
                          : 'hover:text-primary text-[var(--text-muted)] transition-colors'
                      }`}
                      aria-label={isSaved ? 'Unsave job' : 'Save job'}
                    >
                      {isSaved ? (
                        <BookmarkCheck className="h-4 w-4" />
                      ) : (
                        <Bookmark className="h-4 w-4" />
                      )}
                    </button>
                  </Tooltip>
                </div>
                {job.skillsRequired?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {job.skillsRequired.slice(0, 3).map((s) => (
                      <span
                        key={s}
                        className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                      >
                        {s}
                      </span>
                    ))}
                    {job.skillsRequired.length > 3 && (
                      <span className="text-[10px] text-[var(--text-muted)]">
                        +{job.skillsRequired.length - 3}
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
