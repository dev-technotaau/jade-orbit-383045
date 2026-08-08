'use client';

/**
 * Super-admin editorial CMS for CuratedListing.
 *
 * Drives the public mega-menu, footer mega-section, and SEO landing
 * pages (/jobs/category/<x>, /jobs/in/<city>, etc.). Edits invalidate
 * the public Redis cache server-side, so changes appear within seconds.
 *
 * Features:
 *   - List with type / public / featured filter and slug+label search
 *   - Inline drag-to-reorder per type group (HTML5 DnD)
 *   - Public/featured toggles
 *   - Create/edit modal with the full editorial fields
 *   - Delete with confirmation
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search as SearchIcon,
  Edit2,
  Trash2,
  GripVertical,
  RefreshCw,
  Eye,
  EyeOff,
  Star,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import {
  curatedAdminService,
  type CuratedListing,
  type CuratedType,
  type CuratedUpsertInput,
} from '@/services/curated.service';
import { showToast } from '@/components/ui/Toast';

const TYPE_OPTIONS: Array<{ value: CuratedType | ''; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'JOB_CATEGORY', label: 'Job category' },
  { value: 'JOB_DEMAND', label: 'Job demand' },
  { value: 'JOB_LOCATION', label: 'Job location' },
  { value: 'JOB_QUALIFICATION', label: 'Job qualification' },
  { value: 'JOB_DEPARTMENT', label: 'Job department' },
  { value: 'JOB_COLLECTION', label: 'Job collection' },
  { value: 'COMPANY_CATEGORY', label: 'Company category' },
  { value: 'COMPANY_COLLECTION', label: 'Company collection' },
];

const VISIBILITY_OPTIONS = [
  { value: '', label: 'Public + private' },
  { value: 'true', label: 'Public only' },
  { value: 'false', label: 'Private only' },
];

const FEATURED_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'true', label: 'Featured only' },
  { value: 'false', label: 'Non-featured' },
];

function defaultDraft(): CuratedUpsertInput {
  return {
    slug: '',
    type: 'JOB_CATEGORY',
    label: '',
    filterPreset: {},
    iconKey: null,
    displayOrder: 0,
    isFeatured: false,
    metaTitle: null,
    metaDescription: null,
    heroH1: null,
    heroSubtitle: null,
    isPublic: true,
  };
}

export default function CuratedListingsAdminPage() {
  const qc = useQueryClient();

  const [type, setType] = useState<CuratedType | ''>('');
  const [isPublic, setIsPublic] = useState<'' | 'true' | 'false'>('');
  const [isFeatured, setIsFeatured] = useState<'' | 'true' | 'false'>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [editing, setEditing] = useState<CuratedListing | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const queryKey = useMemo(
    () => ['admin-curated', { type, isPublic, isFeatured, q, page, pageSize }],
    [type, isPublic, isFeatured, q, page, pageSize],
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      curatedAdminService.list({
        type: type || undefined,
        isPublic: isPublic === '' ? undefined : isPublic === 'true',
        isFeatured: isFeatured === '' ? undefined : isFeatured === 'true',
        q: q || undefined,
        page,
        pageSize,
      }),
    staleTime: 30 * 1000,
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  const createMut = useMutation({
    mutationFn: (input: CuratedUpsertInput) => curatedAdminService.create(input),
    onSuccess: () => {
      showToast.success('Curated listing created');
      setCreating(false);
      qc.invalidateQueries({ queryKey: ['admin-curated'] });
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to create';
      showToast.error(message);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CuratedUpsertInput> }) =>
      curatedAdminService.update(id, input),
    onSuccess: () => {
      showToast.success('Curated listing updated');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin-curated'] });
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to update';
      showToast.error(message);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => curatedAdminService.remove(id),
    onSuccess: () => {
      showToast.success('Curated listing deleted');
      setDeletingId(null);
      qc.invalidateQueries({ queryKey: ['admin-curated'] });
    },
    onError: () => {
      showToast.error('Failed to delete');
    },
  });

  const reorderMut = useMutation({
    mutationFn: (payload: Array<{ id: string; displayOrder: number }>) =>
      curatedAdminService.reorder(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-curated'] });
    },
  });

  const togglePublic = (row: CuratedListing) =>
    updateMut.mutate({ id: row.id, input: { isPublic: !row.isPublic } });

  const toggleFeatured = (row: CuratedListing) =>
    updateMut.mutate({ id: row.id, input: { isFeatured: !row.isFeatured } });

  // ── Drag-to-reorder ───────────────────────────────────────
  // Reorder happens within a single `type`. Cross-type drags are
  // ignored (the displayOrder field is per-type by design).
  const [dragId, setDragId] = useState<string | null>(null);

  const onDragStart = (id: string) => () => setDragId(id);
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const onDrop = (target: CuratedListing) => () => {
    if (!dragId || dragId === target.id) {
      setDragId(null);
      return;
    }
    const sourceIdx = items.findIndex((i) => i.id === dragId);
    const targetIdx = items.findIndex((i) => i.id === target.id);
    if (sourceIdx === -1 || targetIdx === -1) {
      setDragId(null);
      return;
    }
    const source = items[sourceIdx];
    if (source.type !== target.type) {
      showToast.error('Cannot reorder across different types');
      setDragId(null);
      return;
    }
    // Pull only items of the same type, splice, reassign 10-step offsets.
    const sameType = items.filter((i) => i.type === source.type);
    const fromInGroup = sameType.findIndex((i) => i.id === source.id);
    const toInGroup = sameType.findIndex((i) => i.id === target.id);
    const next = sameType.slice();
    next.splice(fromInGroup, 1);
    next.splice(toInGroup, 0, source);
    const payload = next.map((row, idx) => ({ id: row.id, displayOrder: idx * 10 }));
    reorderMut.mutate(payload);
    setDragId(null);
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="curated_listings.view"
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Editorial — Curated Listings</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Manage the menu, footer, and SEO landing entries that drive the public mega-menu and
              curated landing pages.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />}
              onClick={() => refetch()}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setCreating(true)}
            >
              New listing
            </Button>
          </div>
        </header>

        <Card padding="md">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                type="search"
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                placeholder="Search slug, label, meta…"
                className="pl-9"
              />
            </div>
            <Select
              value={type}
              onChange={(v) => {
                setPage(1);
                setType(v as CuratedType | '');
              }}
              options={TYPE_OPTIONS as unknown as Array<{ value: string; label: string }>}
            />
            <Select
              value={isPublic}
              onChange={(v) => {
                setPage(1);
                setIsPublic(v as '' | 'true' | 'false');
              }}
              options={VISIBILITY_OPTIONS}
            />
            <Select
              value={isFeatured}
              onChange={(v) => {
                setPage(1);
                setIsFeatured(v as '' | 'true' | 'false');
              }}
              options={FEATURED_OPTIONS}
            />
          </div>
        </Card>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} variant="rect" height={56} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No curated listings"
            description="Adjust your filters or create a new listing to drive a public landing page."
          />
        ) : (
          <Card padding="sm" className="!p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-xs tracking-wider text-[var(--text-muted)] uppercase">
                  <tr>
                    <th className="w-8 px-2 py-3" />
                    <th className="w-12 px-2 py-3">#</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Label</th>
                    <th className="px-3 py-3">Slug</th>
                    <th className="px-3 py-3">Visibility</th>
                    <th className="px-3 py-3">Featured</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      draggable
                      onDragStart={onDragStart(row.id)}
                      onDragOver={onDragOver}
                      onDrop={onDrop(row)}
                      className={`border-b border-[var(--border)] transition-colors ${
                        dragId === row.id
                          ? 'bg-[var(--primary-50)] opacity-60'
                          : 'hover:bg-[var(--bg-secondary)]'
                      }`}
                    >
                      <td className="px-2 py-2 text-[var(--text-muted)]">
                        <GripVertical className="h-4 w-4 cursor-grab" />
                      </td>
                      <td className="px-2 py-2 font-mono text-xs text-[var(--text-muted)]">
                        {row.displayOrder}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="neutral" size="sm">
                          {row.type}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-medium text-[var(--text)]">{row.label}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                        {row.slug}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => togglePublic(row)}
                          className="inline-flex items-center gap-1 text-xs"
                          aria-label={row.isPublic ? 'Disable public visibility' : 'Make public'}
                        >
                          {row.isPublic ? (
                            <Eye className="h-4 w-4 text-green-600" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-[var(--text-muted)]" />
                          )}
                          {row.isPublic ? 'Public' : 'Private'}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleFeatured(row)}
                          className="inline-flex items-center gap-1 text-xs"
                          aria-label={row.isFeatured ? 'Unfeature' : 'Feature'}
                        >
                          <Star
                            className={`h-4 w-4 ${
                              row.isFeatured
                                ? 'fill-amber-500 text-amber-500'
                                : 'text-[var(--text-muted)]'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Edit2 className="h-3 w-3" />}
                            onClick={() => setEditing(row)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            leftIcon={<Trash2 className="h-3 w-3" />}
                            onClick={() => setDeletingId(row.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && (
              <div className="border-t border-[var(--border)] px-4 py-3">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={setPage}
                  totalItems={pagination.total}
                  pageSize={pagination.pageSize}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                  }}
                />
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Create / edit modal */}
      {(creating || editing) && (
        <CuratedFormModal
          initial={editing ?? defaultDraft()}
          isEdit={!!editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(input) => {
            if (editing) {
              updateMut.mutate({ id: editing.id, input });
            } else {
              createMut.mutate(input);
            }
          }}
          submitting={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <Modal isOpen onClose={() => setDeletingId(null)} title="Delete curated listing?">
          <p className="text-sm text-[var(--text-secondary)]">
            This permanently removes the listing from the menu, footer, and any SEO landing page
            that references it. This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMut.mutate(deletingId)}
              isLoading={deleteMut.isPending}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}

// ──────────────────────────────────────────────────────────
//   Create / edit modal
// ──────────────────────────────────────────────────────────

interface FormProps {
  initial: CuratedListing | CuratedUpsertInput;
  isEdit: boolean;
  onClose: () => void;
  onSubmit: (input: CuratedUpsertInput) => void;
  submitting: boolean;
}

function CuratedFormModal({ initial, isEdit, onClose, onSubmit, submitting }: FormProps) {
  const [form, setForm] = useState<CuratedUpsertInput>(() => ({
    slug: initial.slug,
    type: initial.type,
    label: initial.label,
    filterPreset: initial.filterPreset ?? {},
    iconKey: initial.iconKey ?? null,
    displayOrder: initial.displayOrder ?? 0,
    isFeatured: initial.isFeatured ?? false,
    metaTitle: initial.metaTitle ?? null,
    metaDescription: initial.metaDescription ?? null,
    heroH1: initial.heroH1 ?? null,
    heroSubtitle: initial.heroSubtitle ?? null,
    isPublic: initial.isPublic ?? true,
  }));

  const [presetText, setPresetText] = useState(() =>
    JSON.stringify(initial.filterPreset ?? {}, null, 2),
  );
  const [presetError, setPresetError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(presetText || '{}');
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Filter preset must be a JSON object');
      }
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : 'Invalid JSON');
      return;
    }
    onSubmit({ ...form, filterPreset: parsed });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? 'Edit curated listing' : 'New curated listing'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Slug *
            </span>
            <Input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="e.g. it-software-jobs"
              required
              pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
              title="kebab-case lowercase letters, digits, and hyphens"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Type *
            </span>
            <Select
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v as CuratedType })}
              options={
                TYPE_OPTIONS.filter((o) => o.value !== '') as Array<{
                  value: string;
                  label: string;
                }>
              }
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
            Label * (shown in menu / footer)
          </span>
          <Input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="e.g. IT / Software"
            required
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Display order
            </span>
            <Input
              type="number"
              value={String(form.displayOrder ?? 0)}
              onChange={(e) =>
                setForm({ ...form, displayOrder: Math.max(0, Number(e.target.value) || 0) })
              }
              min={0}
              max={99999}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Icon key
            </span>
            <Input
              value={form.iconKey ?? ''}
              onChange={(e) => setForm({ ...form, iconKey: e.target.value.trim() || null })}
              placeholder="optional — lucide icon name"
            />
          </label>
          <div className="flex items-end gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isPublic ?? true}
                onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
              />
              Public
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFeatured ?? false}
                onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
              />
              Featured
            </label>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
            Filter preset (JSON object)
          </span>
          <textarea
            className="block w-full rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:outline-none"
            rows={6}
            value={presetText}
            onChange={(e) => {
              setPresetText(e.target.value);
              setPresetError(null);
            }}
            placeholder='{ "category": "it-software" }'
          />
          {presetError && <p className="mt-1 text-xs text-[var(--error)]">{presetError}</p>}
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Drop-in shape for the search-API filter blob (e.g. `{`{ "category": "it-software" }`}`).
          </p>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Hero H1 (override)
            </span>
            <Input
              value={form.heroH1 ?? ''}
              onChange={(e) => setForm({ ...form, heroH1: e.target.value || null })}
              placeholder="optional — page H1 override"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Hero subtitle
            </span>
            <Input
              value={form.heroSubtitle ?? ''}
              onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value || null })}
              placeholder="optional — page sub-headline"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              SEO meta title
            </span>
            <Input
              value={form.metaTitle ?? ''}
              onChange={(e) => setForm({ ...form, metaTitle: e.target.value || null })}
              placeholder="optional — appears in <title>"
              maxLength={160}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              SEO meta description
            </span>
            <Input
              value={form.metaDescription ?? ''}
              onChange={(e) => setForm({ ...form, metaDescription: e.target.value || null })}
              placeholder="optional — appears in meta description"
              maxLength={320}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={submitting}>
            {isEdit ? 'Save changes' : 'Create listing'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
