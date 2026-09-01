'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Crosshair } from 'lucide-react';
import DialogShell from '@/components/ui/DialogShell';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { whatsappService as svc } from '@/services/whatsapp.service';

/**
 * Compose + send a WhatsApp location pin into an open conversation.
 *
 * The backend route, controller, service, audit entry and rate limiter for
 * location sends have all existed since the fork, and the client service exposed
 * `sendLocation()` — with ZERO call sites. Inbound pins rendered fine, so an
 * agent asked "where are you?" could see the customer's location and had no way
 * to send back the shop's. Mirrors ContactComposeModal's chrome.
 */
export default function LocationComposeModal({
  conversationId,
  contextWamid,
  onClose,
  onSent,
}: {
  conversationId: string;
  /** WAMID this pin quotes, when the reply banner was up. */
  contextWamid?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const qc = useQueryClient();
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [locating, setLocating] = useState(false);

  const lat = Number(latitude);
  const lng = Number(longitude);
  const latValid = latitude.trim() !== '' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const lngValid = longitude.trim() !== '' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
  const canSend = latValid && lngValid;

  const useCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showToast.error('This browser cannot report a location');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        showToast.error(err.message || 'Could not read your location');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const mutation = useMutation({
    mutationFn: () =>
      svc.sendLocation(conversationId, {
        latitude: lat,
        longitude: lng,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(contextWamid ? { contextWamid } : {}),
      }),
    onSuccess: () => {
      showToast.success('Location sent');
      qc.invalidateQueries({ queryKey: ['wa-messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      onSent();
      onClose();
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to send location')),
  });

  const submit = () => {
    if (!latValid) return showToast.error('Latitude must be between -90 and 90');
    if (!lngValid) return showToast.error('Longitude must be between -180 and 180');
    mutation.mutate();
  };

  return (
    <DialogShell onClose={onClose} label="Send a location">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] p-6 pb-4">
          <h2 className="text-lg font-bold text-[var(--text)]">Send a location</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Latitude"
              required
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="19.076090"
              error={latitude.trim() && !latValid ? 'Between -90 and 90' : undefined}
            />
            <Input
              label="Longitude"
              required
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="72.877426"
              error={longitude.trim() && !lngValid ? 'Between -180 and 180' : undefined}
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            leftIcon={<Crosshair className="h-4 w-4" />}
            onClick={useCurrentLocation}
            isLoading={locating}
            disabled={locating}
          >
            Use my current location
          </Button>

          <Input
            label="Place name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Our store"
            helperText="Shown as the pin's title in WhatsApp."
          />
          <Input
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="221B Baker Street"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] p-6 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={mutation.isPending} disabled={!canSend}>
            Send location
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
