'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Search, CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { adminService } from '@/services/admin.service';
import { QUERY_KEYS, PAGINATION } from '@/constants/config';
import { formatDate } from '@/lib/utils';
import type { AuditLog, AuditLogFilters } from '@/types/admin';

const actionOptions = [
  { value: '', label: 'All Actions' },
  { value: 'CREATE_USER', label: 'Create User' },
  { value: 'DELETE_USER', label: 'Delete User' },
  { value: 'SUSPEND_USER', label: 'Suspend User' },
  { value: 'ACTIVATE_USER', label: 'Activate User' },
  { value: 'DEACTIVATE_USER', label: 'Deactivate User' },
  { value: 'UPDATE_USER_ROLE', label: 'Update User Role' },
  { value: 'UPDATE_USER_PROFILE', label: 'Update User Profile' },
  { value: 'ADMIN_RESET_PASSWORD', label: 'Admin Reset Password' },
  { value: 'PASSWORD_CHANGE', label: 'Password Change' },
  { value: 'UPLOAD_USER_AVATAR', label: 'Upload Avatar' },
  { value: 'REMOVE_USER_AVATAR', label: 'Remove Avatar' },
  { value: 'REVOKE_USER_SESSIONS', label: 'Revoke Sessions' },
  { value: 'PROFILE_UPDATE', label: 'Profile Update' },
  { value: 'RESUME_UPLOAD', label: 'Resume Upload' },
  { value: 'JOB_CREATE', label: 'Job Create' },
  { value: 'JOB_UPDATE', label: 'Job Update' },
  { value: 'JOB_CLOSE', label: 'Job Close' },
  { value: 'DELETE_JOB', label: 'Delete Job' },
  { value: 'MODERATE_JOB', label: 'Moderate Job' },
  { value: 'FLAG_JOB', label: 'Flag Job' },
  { value: 'APPLICATION_SHORTLIST', label: 'Application Shortlist' },
  { value: 'APPLICATION_SELECT', label: 'Application Select' },
  { value: 'VERIFICATION_APPROVE', label: 'Verification Approve' },
  { value: 'VERIFICATION_REJECT', label: 'Verification Reject' },
  { value: 'VERIFICATION_REQUEST_CHANGES', label: 'Verification Request Changes' },
  { value: 'VERIFICATION_ESCALATE', label: 'Verification Escalate' },
  { value: 'VERIFICATION_LEVEL_APPROVE', label: 'Verification Level Approve' },
  { value: 'TICKET_ASSIGN', label: 'Ticket Assign' },
  { value: 'TICKET_STATUS_CHANGE', label: 'Ticket Status Change' },
];

const entityOptions = [
  { value: '', label: 'All Entity Types' },
  { value: 'User', label: 'User' },
  { value: 'CandidateProfile', label: 'Candidate Profile' },
  { value: 'CompanyProfile', label: 'Company Profile' },
  { value: 'JobPost', label: 'Job Post' },
  { value: 'JobApplication', label: 'Job Application' },
  { value: 'Verification', label: 'Verification' },
  { value: 'SupportTicket', label: 'Support Ticket' },
];

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.AUDIT_LOGS_PER_PAGE);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [detailsModal, setDetailsModal] = useState<AuditLog | null>(null);

  const filters: AuditLogFilters = {
    page,
    limit: pageSize,
    ...(action && { action }),
    ...(entity && { entity }),
    ...(performedBy && { performedBy }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  };

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.AUDIT_LOGS(filters as unknown as Record<string, unknown>),
    queryFn: () => adminService.getAuditLogs(filters),
  });

  const logs = data?.data?.items || [];
  const pagination = data?.data;

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="platform.audit_logs.view"
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Audit Logs</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Track all admin actions and platform events.
          </p>
        </div>

        {/* Filters */}
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              options={actionOptions}
              value={action}
              onChange={(val) => {
                setAction(val);
                setPage(1);
              }}
              placeholder="All Actions"
              searchable
            />
            <Select
              options={entityOptions}
              value={entity}
              onChange={(val) => {
                setEntity(val);
                setPage(1);
              }}
              placeholder="All Entity Types"
            />
            <Input
              placeholder="Filter by user ID..."
              value={performedBy}
              onChange={(e) => {
                setPerformedBy(e.target.value);
                setPage(1);
              }}
              leftIcon={<Search className="h-4 w-4" />}
            />
            <DatePicker
              label="Start Date"
              value={startDate}
              onChange={(val) => {
                setStartDate(val);
                setPage(1);
              }}
              leftIcon={<CalendarDays className="h-4 w-4" />}
            />
            <DatePicker
              label="End Date"
              value={endDate}
              onChange={(val) => {
                setEndDate(val);
                setPage(1);
              }}
              leftIcon={<CalendarDays className="h-4 w-4" />}
            />
          </div>
        </Card>

        {/* Logs Table */}
        <Card padding="sm">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} variant="rect" height={40} />
              ))}
            </div>
          ) : logs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Entity Type
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Entity ID
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      User
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      IP Address
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-[var(--text-secondary)]">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {logs.map((log) => (
                    <>
                      <tr key={log.id} className="transition-colors hover:bg-[var(--bg-secondary)]">
                        <td className="px-4 py-3 whitespace-nowrap text-[var(--text-muted)]">
                          {formatDate(log.createdAt, 'MMM dd, yyyy HH:mm')}
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--text)]">{log.action}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{log.entity}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
                          {log.entityId ? (
                            <Tooltip content={log.entityId}>
                              <span>
                                {log.entityId.length > 12
                                  ? `${log.entityId.substring(0, 12)}...`
                                  : log.entityId}
                              </span>
                            </Tooltip>
                          ) : (
                            <span className="text-[var(--text-muted)]">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {log.user?.email || '-'}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">
                          {log.ipAddress || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {log.details ? (
                            <Tooltip
                              content={
                                expandedRow === log.id ? 'Hide log details' : 'View log details'
                              }
                            >
                              <button
                                type="button"
                                onClick={() => toggleRow(log.id)}
                                className="text-primary inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--bg-secondary)]"
                              >
                                {expandedRow === log.id ? (
                                  <>
                                    Hide <ChevronUp className="h-3 w-3" />
                                  </>
                                ) : (
                                  <>
                                    View <ChevronDown className="h-3 w-3" />
                                  </>
                                )}
                              </button>
                            </Tooltip>
                          ) : (
                            <span className="text-[var(--text-muted)]">-</span>
                          )}
                        </td>
                      </tr>
                      {expandedRow === log.id && log.details && (
                        <tr key={`${log.id}-details`}>
                          <td colSpan={7} className="bg-[var(--bg-secondary)] px-4 py-3">
                            <div className="flex items-start justify-between gap-4">
                              <pre className="flex-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-white p-3 font-mono text-xs text-[var(--text-secondary)]">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                              <Button
                                variant="ghost"
                                size="sm"
                                tooltip="View full log details in modal"
                                onClick={() => setDetailsModal(log)}
                              >
                                Full View
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Shield}
              title="No audit logs found"
              description="Try adjusting your filters or check back later."
            />
          )}
        </Card>

        {/* Pagination */}
        {pagination && (
          <Pagination
            currentPage={page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            totalItems={pagination.total}
            pageSize={pageSize}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        )}

        {/* Details Modal */}
        <Modal
          isOpen={!!detailsModal}
          onClose={() => setDetailsModal(null)}
          title="Audit Log Details"
          size="lg"
        >
          {detailsModal && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="Action" value={detailsModal.action} />
                <DetailField label="Entity Type" value={detailsModal.entity} />
                <DetailField label="Entity ID" value={detailsModal.entityId || '-'} />
                <DetailField label="User Email" value={detailsModal.user?.email || '-'} />
                <DetailField label="Performed By" value={detailsModal.performedBy || '-'} />
                <DetailField label="IP Address" value={detailsModal.ipAddress || '-'} />
                <DetailField
                  label="Timestamp"
                  value={formatDate(detailsModal.createdAt, 'MMM dd, yyyy HH:mm:ss')}
                />
                <DetailField label="User Agent" value={detailsModal.userAgent || '-'} />
              </div>
              {detailsModal.details && (
                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--text)]">Details</p>
                  <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4 font-mono text-xs text-[var(--text-secondary)]">
                    {JSON.stringify(detailsModal.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-medium break-all text-[var(--text)]">{value}</p>
    </div>
  );
}
