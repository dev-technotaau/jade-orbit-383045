import CandidateAuthShell from '@/components/auth/candidate/CandidateAuthShell';
import RoleLoginForm from '@/components/auth/RoleLoginForm';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema, graph, webPageSchema } from '@/lib/json-ld';

const loginJsonLd = graph(
  webPageSchema({
    url: '/auth/login/candidate',
    name: 'Candidate Sign In — Hire Adda',
    description: 'Sign in as a candidate to find jobs and manage your profile on Hire Adda.',
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Sign In', url: '/auth/login' },
    { name: 'Candidate', url: '/auth/login/candidate' },
  ]),
);

export const metadata = {
  title: 'Candidate Sign In',
  description: 'Sign in as a candidate to find jobs and manage your profile on Hire Adda.',
};

export default function CandidateLoginPage() {
  return (
    <CandidateAuthShell mode="login">
      <JsonLd id="jsonld-login-candidate" data={loginJsonLd} />
      {/* Role tabs, cross-links and the support footer are turned off here —
          the enhanced candidate shell renders that chrome in its own header.
          The form's auth logic is untouched. */}
      <RoleLoginForm
        role="candidate"
        showRoleTabs={false}
        showCrossLinks={false}
        showSupportFooter={false}
      />
    </CandidateAuthShell>
  );
}
