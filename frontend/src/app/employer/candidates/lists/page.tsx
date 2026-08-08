'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen,
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  User,
  MapPin,
  Briefcase,
  Mail,
  Phone,
  X,
  Loader2,
  Search,
  StickyNote,
  Building2,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import {
  candidateListService,
  type CandidateList,
  type CandidateListMember,
} from '@/services/candidate-list.service';
import { WORK_STATUS_LABELS, NOTICE_PERIOD_LABELS } from '@/constants/enums';
import { cn, formatRelativeDate } from '@/lib/utils';
import type { ApiError } from '@/types/api';

const DEFAULT_COLORS = [
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#06B6D4', // Cyan
];

const DEFAULT_ICONS = ['📁', '⭐', '🎯', '🔥', '💼', '👥', '📌', '🏆'];

export default function CandidateListsPage() {
  const queryClient = useQueryClient();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [listToEdit, setListToEdit] = useState<CandidateList | null>(null);
  const [listToDelete, setListToDelete] = useState<CandidateList | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{
    listId: string;
    candidateId: string;
  } | null>(null);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesEdit, setNotesEdit] = useState<{
    listId: string;
    candidateId: string;
    notes: string;
  }>({ listId: '', candidateId: '', notes: '' });

  const { data: listsData, isLoading: isLoadingLists } = useQuery({
    queryKey: ['candidate-lists'],
    queryFn: () => candidateListService.getLists(),
  });

  const lists = listsData?.data || [];
  const selectedList =
    lists.find((l) => l.id === selectedListId) || (lists.length > 0 ? lists[0] : null);

  const { data: listDetailsData, isLoading: isLoadingMembers } = useQuery({
    queryKey: ['candidate-list-members', selectedList?.id, page, pageSize],
    queryFn: () => candidateListService.getList(selectedList!.id, page, pageSize),
    enabled: !!selectedList,
  });

  const members = listDetailsData?.data?.members || [];
  const pagination = listDetailsData?.data?.pagination;

  const createListMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; color?: string; icon?: string }) =>
      candidateListService.createList(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-lists'] });
      showToast.success('List created successfully');
      setCreateDialogOpen(false);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to create list');
    },
  });

  const updateListMutation = useMutation({
    mutationFn: ({
      listId,
      data,
    }: {
      listId: string;
      data: { name?: string; description?: string | null; color?: string; icon?: string | null };
    }) => candidateListService.updateList(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-lists'] });
      showToast.success('List updated successfully');
      setEditDialogOpen(false);
      setListToEdit(null);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update list');
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: (listId: string) => candidateListService.deleteList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-lists'] });
      showToast.success('List deleted successfully');
      setDeleteDialogOpen(false);
      setListToDelete(null);
      if (selectedListId === listToDelete?.id) {
        setSelectedListId(null);
      }
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to delete list');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ listId, candidateId }: { listId: string; candidateId: string }) =>
      candidateListService.removeCandidateFromList(listId, candidateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-list-members'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-lists'] });
      showToast.success('Candidate removed from list');
      setMemberToRemove(null);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to remove candidate');
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: ({
      listId,
      candidateId,
      notes,
    }: {
      listId: string;
      candidateId: string;
      notes: string;
    }) => candidateListService.updateMemberNotes(listId, candidateId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-list-members'] });
      showToast.success('Notes updated successfully');
      setNotesDialogOpen(false);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update notes');
    },
  });

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Candidate Lists</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Organize candidates into custom lists for better management
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} tooltip="Create new list">
            <Plus className="mr-1.5 h-4 w-4" />
            New List
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Sidebar - Lists */}
          <div className="lg:col-span-1">
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Your Lists</h3>
              {isLoadingLists ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : lists.length > 0 ? (
                <div className="space-y-1">
                  {lists.map((list) => (
                    <Tooltip key={list.id} content={`View ${list.name}`}>
                      <button
                        onClick={() => {
                          setSelectedListId(list.id);
                          setPage(1);
                        }}
                        className={cn(
                          'flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors',
                          selectedList?.id === list.id
                            ? 'bg-primary-light text-primary'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-lg">{list.icon || '📁'}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{list.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {list._count?.members || 0} candidates
                            </p>
                          </div>
                        </div>
                        {!list.isDefault && (
                          <div className="flex items-center gap-1">
                            <Tooltip content="Edit list">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setListToEdit(list);
                                  setEditDialogOpen(true);
                                }}
                                className="rounded p-1 hover:bg-[var(--bg-tertiary)]"
                                aria-label="Edit list"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            </Tooltip>
                            <Tooltip content="Delete list">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setListToDelete(list);
                                  setDeleteDialogOpen(true);
                                }}
                                className="rounded p-1 text-[var(--error)] hover:bg-[var(--bg-tertiary)]"
                                aria-label="Delete list"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </Tooltip>
                          </div>
                        )}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={FolderOpen}
                  title="No lists yet"
                  description="Create your first list to get started"
                  action={
                    <Button
                      size="sm"
                      onClick={() => setCreateDialogOpen(true)}
                      tooltip="Create new list"
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      Create List
                    </Button>
                  }
                />
              )}
            </Card>
          </div>

          {/* Main Area - List Members */}
          <div className="lg:col-span-3">
            {selectedList ? (
              <Card>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{selectedList.icon || '📁'}</span>
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--text)]">
                          {selectedList.name}
                        </h2>
                        {selectedList.description && (
                          <p className="text-sm text-[var(--text-muted)]">
                            {selectedList.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge variant="info">{selectedList._count?.members || 0} candidates</Badge>
                </div>

                {isLoadingMembers ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-24" />
                    ))}
                  </div>
                ) : members.length > 0 ? (
                  <>
                    <div className="space-y-3">
                      {members.map((member) => {
                        const name = member.candidate
                          ? `${member.candidate.firstName || ''} ${member.candidate.lastName || ''}`.trim()
                          : 'Anonymous';
                        const profile = member.candidate?.candidateProfile;

                        return (
                          <div
                            key={member.id}
                            className="hover:border-primary/20 rounded-lg border border-[var(--border)] bg-white p-4 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex min-w-0 flex-1 gap-3">
                                <div className="bg-primary-light flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
                                  {member.candidate?.avatar ? (
                                    <img
                                      src={member.candidate.avatar}
                                      alt={name}
                                      className="h-12 w-12 rounded-full object-cover"
                                    />
                                  ) : (
                                    <User className="text-primary h-6 w-6" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-[var(--text)]">{name}</p>
                                  {profile?.headline && (
                                    <p className="text-sm text-[var(--text-secondary)]">
                                      {profile.headline}
                                    </p>
                                  )}
                                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                                    {profile?.currentLocation && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5" /> {profile.currentLocation}
                                      </span>
                                    )}
                                    {profile?.experienceYears !== undefined && (
                                      <span className="flex items-center gap-1">
                                        <Briefcase className="h-3.5 w-3.5" />{' '}
                                        {profile.experienceYears} yrs exp
                                      </span>
                                    )}
                                    {profile?.currentCompany && (
                                      <span className="flex items-center gap-1">
                                        <Building2 className="h-3.5 w-3.5" />{' '}
                                        {profile.currentCompany}
                                      </span>
                                    )}
                                  </div>
                                  {member.notes && (
                                    <div className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-stone-900">
                                      <span className="font-medium">Note:</span> {member.notes}
                                    </div>
                                  )}
                                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                                    Added {formatRelativeDate(member.addedAt)}
                                    {member.addedBy &&
                                      ` by ${member.addedBy.firstName} ${member.addedBy.lastName}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  tooltip="Edit notes"
                                  onClick={() => {
                                    setNotesEdit({
                                      listId: selectedList.id,
                                      candidateId: member.candidateId,
                                      notes: member.notes || '',
                                    });
                                    setNotesDialogOpen(true);
                                  }}
                                >
                                  <StickyNote className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  tooltip="Remove candidate"
                                  onClick={() =>
                                    setMemberToRemove({
                                      listId: selectedList.id,
                                      candidateId: member.candidateId,
                                    })
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {pagination && pagination.total > 0 && (
                      <div className="mt-4">
                        <Pagination
                          currentPage={pagination.page}
                          totalPages={pagination.totalPages}
                          onPageChange={setPage}
                          totalItems={pagination.total}
                          pageSize={pageSize}
                          onPageSizeChange={(s) => {
                            setPageSize(s);
                            setPage(1);
                          }}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState
                    icon={User}
                    title="No candidates in this list"
                    description="Add candidates from the search page to populate this list"
                  />
                )}
              </Card>
            ) : (
              <Card>
                <EmptyState
                  icon={FolderOpen}
                  title="Select a list"
                  description="Choose a list from the sidebar to view its candidates"
                />
              </Card>
            )}
          </div>
        </div>

        {/* Create List Dialog */}
        {createDialogOpen && (
          <CreateListDialog
            onClose={() => setCreateDialogOpen(false)}
            onSubmit={(data) => createListMutation.mutate(data)}
            isLoading={createListMutation.isPending}
          />
        )}

        {/* Edit List Dialog */}
        {editDialogOpen && listToEdit && (
          <EditListDialog
            list={listToEdit}
            onClose={() => {
              setEditDialogOpen(false);
              setListToEdit(null);
            }}
            onSubmit={(data) => updateListMutation.mutate({ listId: listToEdit.id, data })}
            isLoading={updateListMutation.isPending}
          />
        )}

        {/* Delete Confirmation Dialog */}
        {deleteDialogOpen && listToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-[var(--bg)] p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-[var(--text)]">Delete List</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Are you sure you want to delete &ldquo;{listToDelete.name}&rdquo;? This action
                cannot be undone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setListToDelete(null);
                  }}
                  disabled={deleteListMutation.isPending}
                  tooltip="Cancel delete"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteListMutation.mutate(listToDelete.id)}
                  isLoading={deleteListMutation.isPending}
                  tooltip="Confirm delete"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Remove Member Confirmation */}
        {memberToRemove && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-[var(--bg)] p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-[var(--text)]">Remove Candidate</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Are you sure you want to remove this candidate from the list?
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setMemberToRemove(null)}
                  tooltip="Cancel removal"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => removeMemberMutation.mutate(memberToRemove)}
                  isLoading={removeMemberMutation.isPending}
                  tooltip="Confirm removal"
                >
                  Remove
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Notes Dialog */}
        {notesDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-[var(--bg)] p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">Edit Notes</h3>
              <textarea
                value={notesEdit.notes}
                onChange={(e) => setNotesEdit({ ...notesEdit, notes: e.target.value })}
                placeholder="Add notes about this candidate..."
                rows={4}
                className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
              />
              <div className="mt-4 flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setNotesDialogOpen(false)}
                  tooltip="Cancel edit"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => updateNotesMutation.mutate(notesEdit)}
                  isLoading={updateNotesMutation.isPending}
                  tooltip="Save notes"
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function CreateListDialog({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (data: { name: string; description?: string; color?: string; icon?: string }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [icon, setIcon] = useState(DEFAULT_ICONS[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--bg)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">Create New List</h3>
          <Tooltip content="Close">
            <button
              onClick={onClose}
              aria-label="Close"
              className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X className="h-5 w-5" />
            </button>
          </Tooltip>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              List Name <span className="text-[var(--error)]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Senior React Developers"
              className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
              className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Icon</label>
            <div className="flex gap-2">
              {DEFAULT_ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition-colors',
                    icon === ic
                      ? 'border-primary bg-primary-light'
                      : 'hover:border-primary border-[var(--border)]',
                  )}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Color</label>
            <div className="flex gap-2">
              {DEFAULT_COLORS.map((c) => (
                <Tooltip key={c} content={c}>
                  <button
                    onClick={() => setColor(c)}
                    className={cn(
                      'h-8 w-8 rounded-lg border-2 transition-all',
                      color === c ? 'scale-110 border-gray-900' : 'border-transparent',
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                </Tooltip>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isLoading} tooltip="Cancel creation">
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ name, description: description || undefined, color, icon })}
            disabled={!name.trim()}
            isLoading={isLoading}
            tooltip="Create list"
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditListDialog({
  list,
  onClose,
  onSubmit,
  isLoading,
}: {
  list: CandidateList;
  onClose: () => void;
  onSubmit: (data: {
    name?: string;
    description?: string | null;
    color?: string;
    icon?: string | null;
  }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description || '');
  const [color, setColor] = useState(list.color || DEFAULT_COLORS[0]);
  const [icon, setIcon] = useState(list.icon || DEFAULT_ICONS[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--bg)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">Edit List</h3>
          <Tooltip content="Close">
            <button
              onClick={onClose}
              aria-label="Close"
              className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X className="h-5 w-5" />
            </button>
          </Tooltip>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              List Name <span className="text-[var(--error)]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] focus:ring-2 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text)] focus:ring-2 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Icon</label>
            <div className="flex gap-2">
              {DEFAULT_ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition-colors',
                    icon === ic
                      ? 'border-primary bg-primary-light'
                      : 'hover:border-primary border-[var(--border)]',
                  )}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Color</label>
            <div className="flex gap-2">
              {DEFAULT_COLORS.map((c) => (
                <Tooltip key={c} content={c}>
                  <button
                    onClick={() => setColor(c)}
                    className={cn(
                      'h-8 w-8 cursor-pointer rounded-lg border-2 transition-all',
                      color === c ? 'scale-110 border-gray-900' : 'border-transparent',
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                </Tooltip>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isLoading} tooltip="Cancel edit">
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                name: name !== list.name ? name : undefined,
                description: description !== list.description ? description || null : undefined,
                color: color !== list.color ? color : undefined,
                icon: icon !== list.icon ? icon : undefined,
              })
            }
            disabled={!name.trim()}
            isLoading={isLoading}
            tooltip="Save changes"
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
