import EmployerAuthShell from '@/components/auth/employer/EmployerAuthShell';
import RoleRegisterForm from '@/components/auth/RoleRegisterForm';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema, graph, webPageSchema } from '@/lib/json-ld';

const registerJsonLd = graph(
  webPageSchema({
    url: '/auth/register/employer',
    name: 'Employer Registration — Hire Adda',
    description: 'Create your employer account on Hire Adda to post jobs and find candidates.',
  }),
  breadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Register', url: '/auth/register' },
    { name: 'Employer', url: '/auth/register/employer' },
  ]),
);

export const metadata = {
  title: 'Employer Registration',
  description: 'Create your employer account on Hire Adda to post jobs and find candidates.',
};

export default function EmployerRegisterPage() {
  return (
    <EmployerAuthShell mode="register">
      <JsonLd id="jsonld-register-employer" data={registerJsonLd} />
      {/* Role tabs, cross-links and the support footer are turned off here —
          the enhanced employer shell renders that chrome in its own header.
          The form's registration logic is untouched. */}
      <RoleRegisterForm
        role="EMPLOYER"
        showRoleTabs={false}
        showCrossLinks={false}
        showSupportFooter={false}
      />
    </EmployerAuthShell>
  );
}
