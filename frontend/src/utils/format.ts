/**
 * Format salary range as LPA (Lakhs Per Annum) for Indian CTC display.
 * Assumes salaryMin/salaryMax are annual values in INR.
 */
export function formatSalaryAsLPA(min?: number | null, max?: number | null): string {
  const toLPA = (val: number) => {
    const lpa = val / 100000;
    return lpa % 1 === 0 ? lpa.toFixed(0) : lpa.toFixed(1);
  };

  if (min != null && max != null) {
    return `${toLPA(min)} - ${toLPA(max)} LPA`;
  }
  if (min != null) {
    return `${toLPA(min)}+ LPA`;
  }
  if (max != null) {
    return `Up to ${toLPA(max)} LPA`;
  }
  return 'Not Disclosed';
}

/**
 * Returns a display label and Tailwind color classes for a resume file type,
 * derived from MIME type or file extension.
 */
export function getFileTypeBadge(
  file?: File | null,
  mimeType?: string | null,
  fileName?: string | null,
): { label: string; color: string } {
  const mime = file?.type || mimeType || '';
  const name = (file?.name || fileName || '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf'))
    return { label: 'PDF', color: 'bg-red-50 text-red-700 border-red-200' };
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  )
    return { label: 'DOCX', color: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (mime === 'application/msword' || name.endsWith('.doc'))
    return { label: 'DOC', color: 'bg-blue-50 text-blue-700 border-blue-200' };
  return { label: 'File', color: 'bg-gray-50 text-gray-700 border-gray-200' };
}

/**
 * Haversine distance between two lat/lng points in kilometres.
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
