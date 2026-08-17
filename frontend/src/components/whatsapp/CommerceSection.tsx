'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, ShoppingBag } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Switch from '@/components/ui/Switch';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaCommerceSettings } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const errText = (e: unknown, fallback: string) => (e as unknown as ApiError)?.message || fallback;

/** Seeded from a prop — the parent gates on load, so this only mounts with data. */
function CommerceForm({ initial }: { initial: WaCommerceSettings }) {
  const qc = useQueryClient();
  const [cartEnabled, setCartEnabled] = useState(initial.isCartEnabled);
  const [catalogVisible, setCatalogVisible] = useState(initial.isCatalogVisible);
  const [catalogId, setCatalogId] = useState(initial.catalogId ?? '');

  const saveMut = useMutation({
    mutationFn: () =>
      svc.updateCommerceSettings({
        isCartEnabled: cartEnabled,
        isCatalogVisible: catalogVisible,
        catalogId: catalogId.trim() || null,
      }),
    onSuccess: () => {
      showToast.success('Commerce settings saved');
      qc.invalidateQueries({ queryKey: ['wa-commerce-settings'] });
      // The bound catalog lives on the channel row, so the channels card is
      // reading a value this just changed.
      qc.invalidateQueries({ queryKey: ['wa-channels'] });
    },
    onError: (e) => showToast.error(errText(e, 'Could not save the commerce settings')),
  });

  return (
    <div className="space-y-3">
      {initial.catalogs.length > 0 ? (
        <Select
          label="Catalog"
          options={[
            { value: '', label: 'Not bound' },
            ...initial.catalogs.map((c) => ({ value: c.id, label: `${c.name} (${c.id})` })),
          ]}
          value={catalogId}
          onChange={setCatalogId}
          clearable={false}
        />
      ) : (
        // Meta only lists catalogs once Commerce Manager is connected to the
        // WABA, and that read needs a permission this token may not hold — so a
        // free-text id is the fallback rather than a dead end.
        <Input
          label="Catalog ID"
          value={catalogId}
          onChange={(e) => setCatalogId(e.target.value)}
          placeholder="e.g. 1234567890123456"
          helperText="From Commerce Manager. No catalogs were listed for this account, so enter the id directly."
        />
      )}
      <Switch
        label="Customers can add to a cart and place orders"
        checked={cartEnabled}
        onChange={(e) => setCartEnabled(e.target.checked)}
      />
      <Switch
        label="Catalog is visible from the business profile"
        checked={catalogVisible}
        onChange={(e) => setCatalogVisible(e.target.checked)}
      />
      <div className="flex justify-end">
        <Button
          onClick={() => saveMut.mutate()}
          isLoading={saveMut.isPending}
          leftIcon={<Save className="h-4 w-4" />}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

/**
 * Catalog binding and cart visibility for the sending number.
 *
 * The template wizard has always been able to attach a CATALOG button, and
 * nothing in the console could bind the catalog that button opens — so an
 * operator could get a catalog template approved and then had no way to make it
 * point anywhere, and the cart the customer submitted came back as an
 * unrenderable message. The catalog id set here is also what a single- or
 * multi-product message is addressed against.
 */
export default function CommerceSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-commerce-settings'],
    queryFn: () => svc.getCommerceSettings(),
  });
  const settings = data?.data;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <ShoppingBag className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Catalog and cart
      </h2>
      <p className="text-xs text-[var(--text-muted)]">
        Bind the catalog that catalog buttons and product messages use, and choose whether customers
        can browse it and build a cart.
      </p>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        {isLoading && (
          <p className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        {isError && (
          <p className="text-center text-sm text-red-600">Failed to load the commerce settings.</p>
        )}
        {settings && <CommerceForm initial={settings} />}
      </div>
    </section>
  );
}
