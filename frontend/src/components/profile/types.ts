import type { UpdateCandidateRequest } from '@/types/candidate';

export interface ProfileSectionProps {
  form: UpdateCandidateRequest;
  updateField: <K extends keyof UpdateCandidateRequest>(
    key: K,
    value: UpdateCandidateRequest[K],
  ) => void;
}
