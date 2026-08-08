import CandidateAuthShell from '@/components/auth/candidate/CandidateAuthShell';
import RoleRegisterForm from '@/components/auth/RoleRegisterForm';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema, graph, webPageSchema } from '@/lib/json-ld';

const registerJsonLd = graph(
  webPageSchema({
    url: '/auth/register/candidate',
    name: 'Candidate Registration — Hire Adda',
    description: 'Create your candidate account on Hire Adda to apply for jobs. Free to join.',
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Register', url: '/auth/register' },
    { name: 'Candidate', url: '/auth/register/candidate' },
  ]),
);

export const metadata = {
  title: 'Candidate Registration',
  description: 'Create your candidate account on Hire Adda to apply for jobs. Free to join.',
};

export default function CandidateRegisterPage() {
  return (
    <CandidateAuthShell mode="register">
      <JsonLd id="jsonld-register-candidate" data={registerJsonLd} />
      {/* Role tabs, cross-links and the support footer are turned off here —
          the enhanced candidate shell renders that chrome in its own header.
          The form's registration logic is untouched. */}
      <RoleRegisterForm
        role="CANDIDATE"
        showRoleTabs={false}
        showCrossLinks={false}
        showSupportFooter={false}
      />
    </CandidateAuthShell>
  );
}
