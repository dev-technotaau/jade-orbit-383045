'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  BadgeCheck,
  MessageSquare,
  MessagesSquare,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import TemplateComposeModal from '@/components/super-admin/whatsapp/TemplateComposeModal';
import { cn } from '@/lib/utils';
import { setOpenConv } from '@/lib/wa-open-conv';
import { ROUTES } from '@/constants/routes';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import Pagination from '@/components/ui/Pagination';
import type { WaPlatformUser } from '@/types/whatsapp';

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'CANDIDATE', label: 'Candidates' },
  { value: 'EMPLOYER', label: 'Employers' },
  { value: 'ADMIN', label: 'Admins' },
  { value: 'SUPER_ADMIN', label: 'Super admins' },
];

const ROLE_STYLE: Record<string, string> = {
  CANDIDATE: 'bg-blue-100 text-blue-700',
  EMPLOYER: 'bg-purple-100 text-purple-700',
  ADMIN: 'bg-amber-100 text-amber-700',
  SUPER_ADMIN: 'bg-emerald-100 text-emerald-700',
};

function displayName(u: WaPlatformUser): string {
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
}

export default function SuperAdminWhatsappPlatformUsersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [messaging, setMessaging] = useState<WaPlatformUser | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['wa-platform-users', { search, role, page, limit }],
    queryFn: () =>
      svc.listPlatformUsers({ q: search || undefined, role: role || undefined, page, limit }),
  });
  const users = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? 1;

  const openChat = (conversationId: string) => {
    setOpenConv(conversationId);
    router.push(ROUTES.SUPER_ADMIN.WHATSAPP);
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.contacts.platform_users"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
              <MessagesSquare className="h-6 w-6 text-emerald-600" /> Platform Users on WhatsApp
            </h1>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Hire Adda accounts reachable on WhatsApp — uses the profile WhatsApp number when set,
              otherwise the account mobile number.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, email or number…"
              className="pl-9"
            />
          </div>
          <div className="min-w-[180px]">
            <Select
              options={ROLE_OPTIONS}
              value={role}
              onChange={(v) => {
                setRole(v);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {isLoading && (
            <p className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {!isLoading && users.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">
              No platform users with a WhatsApp or mobile number found.
            </p>
          )}
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3 last:border-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  firstName={u.firstName ?? ''}
                  lastName={u.lastName ?? ''}
                  alt={displayName(u)}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-[var(--text)]">
                      {displayName(u)}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        ROLE_STYLE[u.role],
                      )}
                    >
                      {u.role.replace('_', ' ')}
                    </span>
                    {u.contactId && (
                      <BadgeCheck
                        className="h-3.5 w-3.5 text-[var(--primary)]"
                        aria-label="Already a WhatsApp contact"
                      />
                    )}
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <span className="truncate">{u.email}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                    <span className="font-mono font-medium text-[var(--text)]">
                      {u.resolvedNumber}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        u.numberSource === 'whatsapp'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {u.numberSource === 'whatsapp' ? (
                        <>
                          <MessageSquare className="h-3 w-3" /> WhatsApp
                        </>
                      ) : (
                        <>
                          <Smartphone className="h-3 w-3" /> Mobile
                        </>
                      )}
                    </span>
                    {u.numberSource === 'whatsapp' && u.isWhatsappVerified && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                        <ShieldCheck className="h-3 w-3" /> Verified
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {u.conversationId ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<MessagesSquare className="h-4 w-4" />}
                    onClick={() => openChat(u.conversationId as string)}
                  >
                    Open chat
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    leftIcon={<MessageSquare className="h-4 w-4" />}
                    onClick={() => setMessaging(u)}
                  >
                    Message
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={total}
          pageSize={limit}
          onPageSizeChange={(s) => {
            setLimit(s);
            setPage(1);
          }}
        />
      </div>

      {messaging && (
        <TemplateComposeModal
          mode="new"
          initialPhone={messaging.resolvedNumber}
          onClose={() => setMessaging(null)}
          onSent={(conversationId) => {
            setMessaging(null);
            if (conversationId) openChat(conversationId);
          }}
        />
      )}
    </DashboardLayout>
  );
}
