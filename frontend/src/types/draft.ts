export type FormDraftType =
  | 'CANDIDATE_PROFILE'
  | 'JOB_SEARCH_PREFERENCES'
  | 'CANDIDATE_SEARCH'
  | 'JOB_POSTING'
  | 'EMPLOYER_PROFILE';

export interface FormDraft {
  id: string;
  userId: string;
  formType: FormDraftType;
  name?: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
