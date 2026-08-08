import EmployerAuthShell from '@/components/auth/employer/EmployerAuthShell';
import RoleLoginForm from '@/components/auth/RoleLoginForm';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema, graph, webPageSchema } from '@/lib/json-ld';

const loginJsonLd = graph(
  webPageSchema({
    url: '/auth/login/employer',
    name: 'Employer Sign In — Hire Adda',
    description:
      'Sign in as an employer to post jobs, search CVs and manage your hiring on Hire Adda.',
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Sign In', url: '/auth/login' },
    { name: 'Employer', url: '/auth/login/employer' },
  ]),
);

export const metadata = {
  title: 'Employer Sign In',
  description:
    'Sign in as an employer to post jobs, search CVs and manage your hiring on Hire Adda.',
};

export default function EmployerLoginPage() {
  return (
    <EmployerAuthShell mode="login">
      <JsonLd id="jsonld-login-employer" data={loginJsonLd} />
      {/* Role tabs, cross-links and the support footer are turned off here —
          the enhanced employer shell renders that chrome (Our Offerings,
          helpline, Contact, candidate cross-link) in its own header. The
          form's auth logic is untouched. */}
      <RoleLoginForm
        role="employer"
        showRoleTabs={false}
        showCrossLinks={false}
        showSupportFooter={false}
      />
    </EmployerAuthShell>
  );
}
