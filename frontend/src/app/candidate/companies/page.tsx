'use client';

import DashboardLayout from '@/components/layout/DashboardLayout';
import PublicCompanyListingShell from '@/components/company-search/PublicCompanyListingShell';

/**
 * Find Companies inside the candidate panel — uses the same shared
 * PublicCompanyListingShell as the public /companies page, just
 * wrapped in DashboardLayout so the user stays in their dashboard
 * chrome and the soft-wall doesn't trigger (auth users see all
 * results without the guest cap).
 */
export default function CandidateFindCompaniesPage() {
  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <PublicCompanyListingShell
        heroH1="Find Companies"
        heroSubtitle="Discover top employers across India — view jobs, culture, benefits, and follow companies you love"
      />
    </DashboardLayout>
  );
}
