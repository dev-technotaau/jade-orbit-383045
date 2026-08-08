import type { EducationEntry } from '@/types/candidate';

/**
 * Returns a fresh `EducationEntry` with the given level and all other fields reset.
 *
 * Why: when a candidate changes the education level on an entry (e.g. Bachelor → 12th),
 * the downstream fields (institution, degree, field, grade, etc.) carry over from the
 * previous level and no longer match the new context. Resetting avoids mixed state
 * (e.g. a 12th Standard entry still showing a college name or a specialization).
 *
 * Degree is auto-filled for TENTH/TWELFTH since those are fixed values.
 * The top-level `highestEducationLevel` and `highestDegree` fields are unaffected —
 * those live outside entry-level state and are preserved by the caller.
 */
export function resetEducationEntryForLevel(level: string): EducationEntry {
  return {
    educationLevel: level,
    institution: '',
    degree: level === 'TENTH' ? '10th Standard' : level === 'TWELFTH' ? '12th Standard' : '',
    boardState: '',
    field: '',
    fieldOfStudy: '',
    startDate: '',
    endDate: '',
    grade: '',
    gradeType: undefined,
    courseType: undefined,
    specialization: '',
    description: '',
    activities: '',
  };
}
