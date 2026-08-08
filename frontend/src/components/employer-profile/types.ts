import type { UpdateCompanyRequest } from '@/types/employer';

export type ArrayKey =
  | 'benefits'
  | 'techStack'
  | 'locations'
  | 'specialties'
  | 'coreValues'
  | 'investors'
  | 'productsServices'
  | 'employeeResourceGroups';

export interface EmployerProfileSectionProps {
  form: UpdateCompanyRequest;
  updateField: <K extends keyof UpdateCompanyRequest>(
    key: K,
    value: UpdateCompanyRequest[K],
  ) => void;
  addToArray: (key: ArrayKey, value: string, clearFn: (v: string) => void) => void;
  removeFromArray: (key: ArrayKey, value: string) => void;
  isIndividual?: boolean;
}
