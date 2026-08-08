'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobService } from '@/services/job.service';
import { QUERY_KEYS } from '@/constants/config';
import type { JobSearchFilters } from '@/types/job';

export function useJobSearch(filters: JobSearchFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.JOBS.SEARCH(filters as unknown as Record<string, unknown>),
    queryFn: () => jobService.searchJobs(filters),
    enabled: true,
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.JOBS.DETAIL(id),
    queryFn: () => jobService.getJob(id),
    enabled: !!id,
  });
}

export function useAppliedJobs(page?: number, limit?: number, status?: string) {
  return useQuery({
    queryKey: [...QUERY_KEYS.JOBS.APPLIED, page, limit, status],
    queryFn: () => jobService.getAppliedJobs(page, limit, status),
  });
}

export function useSavedJobs(page?: number, limit?: number) {
  return useQuery({
    queryKey: [...QUERY_KEYS.JOBS.SAVED, page, limit],
    queryFn: () => jobService.getSavedJobs(page, limit),
  });
}

export function useMyJobs(page?: number, limit?: number, status?: string) {
  return useQuery({
    queryKey: [...QUERY_KEYS.JOBS.MY_JOBS, page, limit, status],
    queryFn: () => jobService.getMyJobs(page, limit, status),
  });
}

export function useJobApplications(jobId: string, page?: number, limit?: number, status?: string) {
  return useQuery({
    queryKey: [...QUERY_KEYS.JOBS.APPLICATIONS(jobId), page, limit, status],
    queryFn: () => jobService.getJobApplications(jobId, page, limit, status),
    enabled: !!jobId,
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.JOBS.APPLICATION_DETAIL(id),
    queryFn: () => jobService.getApplication(id),
    enabled: !!id,
  });
}

export function useApplyJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      coverLetter,
      screeningAnswers,
    }: {
      jobId: string;
      coverLetter?: string;
      screeningAnswers?: { questionId: string; answer: string }[];
    }) => jobService.applyToJob(jobId, { coverLetter, screeningAnswers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.APPLIED });
    },
  });
}

export function useToggleSaveJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => jobService.toggleSaveJob(jobId),
    onSuccess: (_data, jobId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.SAVED });
      queryClient.invalidateQueries({ queryKey: ['jobs', 'search'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.DETAIL(jobId) });
    },
  });
}

export function useWithdrawApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) => jobService.withdrawApplication(applicationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.APPLIED });
    },
  });
}

export function useUpdateApplicationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      status,
      rejectionReason,
    }: {
      applicationId: string;
      status: string;
      rejectionReason?: string;
    }) => jobService.updateApplicationStatus(applicationId, { status, rejectionReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.JOBS.LIST });
    },
  });
}
