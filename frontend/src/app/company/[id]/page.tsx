'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  MapPin,
  Users,
  Globe,
  Calendar,
  ShieldCheck,
  Linkedin,
  ExternalLink,
  Heart,
  Trophy,
  Cpu,
  Quote,
  Camera,
  Rocket,
  Eye,
  Target,
  Gem,
  Handshake,
  Youtube,
  Instagram,
  Facebook,
  Play,
  TrendingUp,
  DollarSign,
  Briefcase,
  BookOpen,
  Home,
  User,
  AlertCircle,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Tooltip from '@/components/ui/Tooltip';
import Logo from '@/components/common/Logo';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/use-auth';
import { employerService } from '@/services/employer.service';
import { QUERY_KEYS } from '@/constants/config';
import { FUNDING_STAGE_LABELS } from '@/constants/enums';
import type { CompanyProfile } from '@/types/employer';

function PublicPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Tooltip content="Go to the home page">
            <Link href="/">
              <Logo />
            </Link>
          </Tooltip>
          <Tooltip content="Return to the home page">
            <Link href="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
              Back to Home
            </Link>
          </Tooltip>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();

  if (isAuthenticated && user?.role) {
    return (
      <DashboardLayout requiredRole={[user.role]}>
        <div className="mx-auto max-w-5xl">{children}</div>
      </DashboardLayout>
    );
  }

  return <PublicPageShell>{children}</PublicPageShell>;
}

export default function PublicCompanyProfilePage() {
  const params = useParams();
  const id = params.id as string;

  const {
    data: companyData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.PUBLIC_PROFILE(id),
    queryFn: () => employerService.getCompanyById(id),
    enabled: !!id,
  });

  const company = companyData?.data as CompanyProfile | undefined;

  if (isLoading) {
    return (
      <PageShell>
        <div className="space-y-6">
          <Card>
            <Skeleton variant="rect" height={200} />
          </Card>
          <Card>
            <Skeleton variant="rect" height={150} />
          </Card>
          <Card>
            <Skeleton variant="rect" height={200} />
          </Card>
        </div>
      </PageShell>
    );
  }

  if (isError || !company) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="h-12 w-12 text-[var(--text-muted)]" />
          <h2 className="mt-4 text-lg font-semibold text-[var(--text)]">Company Not Found</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            This company profile may have been removed or does not exist.
          </p>
          <Tooltip content="Go to the home page">
            <Link href="/" className="text-primary mt-4 text-sm hover:underline">
              Go to Home
            </Link>
          </Tooltip>
        </div>
      </PageShell>
    );
  }

  const isIndividual = company.accountType === 'INDIVIDUAL';
  const isConsultancy = company.hiringType === 'CONSULTANCY';

  return (
    <PageShell>
      <div className="space-y-6">
        {/* Company Header */}
        <Card>
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="flex shrink-0 items-start">
              {company.logo ? (
                <img
                  src={company.logo}
                  alt={`${company.companyName} logo`}
                  className="h-28 w-28 rounded-xl border-2 border-[var(--bg-secondary)] object-contain"
                />
              ) : (
                <div className="bg-primary-light flex h-28 w-28 items-center justify-center rounded-xl">
                  <Building2 className="text-primary h-12 w-12" />
                </div>
              )}
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-[var(--text)]">{company.companyName}</h1>
                  {company.isVerified ? (
                    <Badge variant="success" size="sm">
                      <ShieldCheck className="mr-1 h-3 w-3" /> Verified
                    </Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">
                      Not Verified
                    </Badge>
                  )}
                </div>
                {company.tagline && (
                  <p className="mt-0.5 text-base text-[var(--text-secondary)]">{company.tagline}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-3 text-sm text-[var(--text-secondary)]">
                {company.industry && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" /> {company.industry}
                    {company.subIndustry ? ` · ${company.subIndustry}` : ''}
                  </span>
                )}
                {!isIndividual && company.companySize && (
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" /> {company.companySize}
                    {company.employeeCount ? ` (${company.employeeCount.toLocaleString()})` : ''}
                  </span>
                )}
                {(company.headquarters || company.city) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />{' '}
                    {company.headquarters ||
                      [company.city, company.state].filter(Boolean).join(', ')}
                  </span>
                )}
                {company.foundedYear && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" /> Founded {company.foundedYear}
                  </span>
                )}
                {!isIndividual && company.numberOfOffices && (
                  <span className="flex items-center gap-1">
                    <Home className="h-4 w-4" /> {company.numberOfOffices}{' '}
                    {company.numberOfOffices === 1 ? 'office' : 'offices'}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {isIndividual && (
                  <Badge variant="info" size="sm">
                    Individual
                  </Badge>
                )}
                {isConsultancy && (
                  <Badge variant="info" size="sm">
                    Staffing Agency
                  </Badge>
                )}
                {!isIndividual && company.companyType && (
                  <Badge variant="neutral" size="sm">
                    {company.companyType.replace(/_/g, ' ')}
                  </Badge>
                )}
                {!isIndividual && company.parentCompany && (
                  <Badge variant="neutral" size="sm">
                    Subsidiary of {company.parentCompany}
                  </Badge>
                )}
                {company.stockTicker && (
                  <Badge variant="neutral" size="sm">
                    <TrendingUp className="mr-1 h-3 w-3" /> {company.stockTicker}
                  </Badge>
                )}
              </div>

              {company.website && (
                <Tooltip content="Visit company website">
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" /> {company.website.replace(/^https?:\/\//, '')}
                  </a>
                </Tooltip>
              )}
            </div>
          </div>
        </Card>

        {/* About */}
        {(company.description || company.whyWorkForUs) && (
          <Card header={<h2 className="text-lg font-semibold text-[var(--text)]">About</h2>}>
            <div className="space-y-4">
              {company.description && (
                <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                  {company.description}
                </p>
              )}
              {company.whyWorkForUs && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-[var(--text)]">
                    Why Work With Us
                  </h3>
                  <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                    {company.whyWorkForUs}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Company Video */}
        {company.companyVideoUrl && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Play className="h-5 w-5 text-[var(--error)]" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Company Video</h2>
              </div>
            }
          >
            <Tooltip content="Open company video in a new tab">
              <a
                href={company.companyVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-2 text-sm hover:underline"
              >
                <Play className="h-4 w-4" /> Watch our company video
                <ExternalLink className="h-3 w-3" />
              </a>
            </Tooltip>
          </Card>
        )}

        {/* Mission & Vision */}
        {(company.missionStatement || company.visionStatement) && (
          <div className="grid gap-6 sm:grid-cols-2">
            {company.missionStatement && (
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Target className="text-primary h-5 w-5" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">Mission</h2>
                  </div>
                }
              >
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  {company.missionStatement}
                </p>
              </Card>
            )}
            {company.visionStatement && (
              <Card
                header={
                  <div className="flex items-center gap-2">
                    <Eye className="text-accent h-5 w-5" />
                    <h2 className="text-lg font-semibold text-[var(--text)]">Vision</h2>
                  </div>
                }
              >
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  {company.visionStatement}
                </p>
              </Card>
            )}
          </div>
        )}

        {/* Culture & Values */}
        {(company.companyCulture ||
          (company.coreValues && company.coreValues.length > 0) ||
          company.diversityStatement) && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-[var(--error)]" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Culture & Values</h2>
              </div>
            }
          >
            <div className="space-y-4">
              {company.companyCulture && (
                <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
                  {company.companyCulture}
                </p>
              )}
              {company.coreValues && company.coreValues.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Core Values</h3>
                  <div className="flex flex-wrap gap-2">
                    {company.coreValues.map((value) => (
                      <span
                        key={value}
                        className="bg-primary-light text-primary inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium"
                      >
                        <Gem className="mr-1.5 h-3.5 w-3.5" /> {value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {company.diversityStatement && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-[var(--text)]">
                    Diversity & Inclusion
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {company.diversityStatement}
                  </p>
                </div>
              )}
              {company.employeeResourceGroups && company.employeeResourceGroups.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
                    Employee Resource Groups
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {company.employeeResourceGroups.map((erg) => (
                      <Badge key={erg} variant="neutral" size="sm">
                        {erg}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Benefits & Perks */}
        {company.benefits && company.benefits.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Handshake className="h-5 w-5 text-[var(--success)]" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Benefits & Perks</h2>
              </div>
            }
          >
            <div className="space-y-6">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {company.benefits.map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)]" />
                    {benefit}
                  </div>
                ))}
              </div>

              {company.structuredPerks && company.structuredPerks.length > 0 && (
                <div className="space-y-4">
                  {company.structuredPerks.map((cat) => (
                    <div key={cat.category}>
                      <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
                        {cat.category}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {cat.perks.map((perk) => (
                          <span
                            key={perk}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)]" />
                            {perk}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Structured Perks standalone */}
        {(!company.benefits || company.benefits.length === 0) &&
          company.structuredPerks &&
          company.structuredPerks.length > 0 && (
            <Card
              header={
                <div className="flex items-center gap-2">
                  <Handshake className="h-5 w-5 text-[var(--success)]" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">Perks</h2>
                </div>
              }
            >
              <div className="space-y-4">
                {company.structuredPerks.map((cat) => (
                  <div key={cat.category}>
                    <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
                      {cat.category}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {cat.perks.map((perk) => (
                        <span
                          key={perk}
                          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)]" />
                          {perk}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

        {/* Products & Services */}
        {company.productsServices && company.productsServices.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Rocket className="text-secondary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Products & Services</h2>
              </div>
            }
          >
            <div className="flex flex-wrap gap-2">
              {company.productsServices.map((ps) => (
                <Badge key={ps} variant="neutral" size="sm">
                  {ps}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Tech Stack */}
        {company.techStack && company.techStack.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Cpu className="text-primary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Tech Stack</h2>
              </div>
            }
          >
            <div className="flex flex-wrap gap-2">
              {company.techStack.map((tech) => (
                <span
                  key={tech}
                  className="bg-primary-light text-primary inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium"
                >
                  {tech}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Interview Process */}
        {company.interviewProcess && (
          <Card
            header={<h2 className="text-lg font-semibold text-[var(--text)]">Interview Process</h2>}
          >
            <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
              {company.interviewProcess}
            </p>
          </Card>
        )}

        {/* Leadership Team — Company only */}
        {!isIndividual && company.leadershipTeam && company.leadershipTeam.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Users className="text-accent h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Leadership Team</h2>
              </div>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {company.leadershipTeam.map((leader, i) => (
                <div key={i} className="flex gap-3 rounded-lg border border-[var(--border)] p-4">
                  {leader.imageUrl ? (
                    <img
                      src={leader.imageUrl}
                      alt={leader.name}
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                      <User className="h-6 w-6 text-[var(--text-muted)]" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <h3 className="truncate font-semibold text-[var(--text)]">{leader.name}</h3>
                      {leader.linkedinUrl && (
                        <Tooltip content="View LinkedIn profile">
                          <a href={leader.linkedinUrl} target="_blank" rel="noopener noreferrer">
                            <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" />
                          </a>
                        </Tooltip>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">{leader.designation}</p>
                    {leader.bio && (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                        {leader.bio}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Employee Testimonials — Company only */}
        {!isIndividual &&
          company.employeeTestimonials &&
          company.employeeTestimonials.length > 0 && (
            <Card
              header={
                <div className="flex items-center gap-2">
                  <Quote className="h-5 w-5 text-[#8B5CF6]" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">
                    Employee Testimonials
                  </h2>
                </div>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {company.employeeTestimonials.map((testimonial, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] p-4">
                    <p className="text-sm text-[var(--text-secondary)] italic">
                      &ldquo;{testimonial.quote}&rdquo;
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      {testimonial.imageUrl ? (
                        <img
                          src={testimonial.imageUrl}
                          alt={testimonial.name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                          <User className="h-4 w-4 text-[var(--text-muted)]" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-[var(--text)]">{testimonial.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {[testimonial.designation, testimonial.department]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

        {/* Awards & Recognitions */}
        {company.awardsRecognitions && company.awardsRecognitions.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Trophy className="text-secondary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Awards & Recognitions</h2>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {company.awardsRecognitions.map((award, i) => (
                <div key={i} className="rounded-lg border border-[var(--border)] p-3">
                  <h3 className="font-medium text-[var(--text)]">{award.title}</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {[award.issuer, award.year].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Funding & Investors — Company only */}
        {!isIndividual &&
          (company.fundingStage ||
            company.totalFundingRaised ||
            company.annualRevenueRange ||
            (company.investors && company.investors.length > 0)) && (
            <Card
              header={
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-[var(--success)]" />
                  <h2 className="text-lg font-semibold text-[var(--text)]">Funding & Investors</h2>
                </div>
              }
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
                  {company.fundingStage && (
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-[var(--text)]">Stage:</span>{' '}
                      {FUNDING_STAGE_LABELS[company.fundingStage] || company.fundingStage}
                    </span>
                  )}
                  {company.totalFundingRaised && (
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-[var(--text)]">Total Raised:</span>{' '}
                      {company.totalFundingRaised}
                    </span>
                  )}
                  {company.annualRevenueRange && (
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-[var(--text)]">Annual Revenue:</span>{' '}
                      {company.annualRevenueRange}
                    </span>
                  )}
                </div>
                {company.investors && company.investors.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Investors</h3>
                    <div className="flex flex-wrap gap-2">
                      {company.investors.map((investor) => (
                        <Badge key={investor} variant="neutral" size="sm">
                          {investor}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

        {/* Workplace Policies */}
        {company.workplacePolicies && Object.keys(company.workplacePolicies).length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Briefcase className="text-primary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Workplace Policies</h2>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(company.workplacePolicies).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-[var(--border)] px-3 py-2">
                  <span className="text-sm font-medium text-[var(--text)]">
                    {key
                      .replace(/([A-Z])/g, ' $1')
                      .replace(/^./, (s) => s.toUpperCase())
                      .trim()}
                  </span>
                  <p className="text-sm text-[var(--text-secondary)]">{value}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Office Photos */}
        {company.officePhotos && company.officePhotos.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Camera className="text-accent h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Office Photos</h2>
              </div>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {company.officePhotos.map((photo, i) => (
                <div key={i} className="overflow-hidden rounded-lg border border-[var(--border)]">
                  <img
                    src={photo.url}
                    alt={photo.caption || 'Office photo'}
                    className="aspect-video w-full object-cover"
                  />
                  {(photo.caption || photo.location) && (
                    <div className="px-3 py-2">
                      {photo.caption && (
                        <p className="text-sm text-[var(--text)]">{photo.caption}</p>
                      )}
                      {photo.location && (
                        <p className="text-xs text-[var(--text-muted)]">
                          <MapPin className="mr-0.5 inline h-3 w-3" />
                          {photo.location}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Locations */}
        {company.locations && company.locations.length > 0 && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-[var(--error)]" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Office Locations</h2>
              </div>
            }
          >
            <div className="space-y-4">
              {(company.city || company.state || company.country) && (
                <div className="text-sm text-[var(--text-secondary)]">
                  <h3 className="mb-1 text-sm font-semibold text-[var(--text)]">
                    Primary Location
                  </h3>
                  <p>{[company.city, company.state, company.country].filter(Boolean).join(', ')}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {company.locations.map((loc) => (
                  <span
                    key={loc}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
                  >
                    <MapPin className="h-3.5 w-3.5" /> {loc}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Social Links */}
        {company.socialLinks && Object.values(company.socialLinks).some(Boolean) && (
          <Card
            header={
              <div className="flex items-center gap-2">
                <Globe className="text-primary h-5 w-5" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Social Links</h2>
              </div>
            }
          >
            <div className="flex flex-wrap gap-3">
              {company.socialLinks?.linkedin && (
                <Tooltip content="Visit LinkedIn page">
                  <a
                    href={company.socialLinks.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    <Linkedin className="h-4 w-4 text-[#0A66C2]" /> LinkedIn
                  </a>
                </Tooltip>
              )}
              {company.socialLinks?.twitter && (
                <Tooltip content="Visit Twitter/X page">
                  <a
                    href={company.socialLinks.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    <ExternalLink className="h-4 w-4" /> Twitter/X
                  </a>
                </Tooltip>
              )}
              {company.socialLinks?.facebook && (
                <Tooltip content="Visit Facebook page">
                  <a
                    href={company.socialLinks.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    <Facebook className="h-4 w-4 text-[#1877F2]" /> Facebook
                  </a>
                </Tooltip>
              )}
              {company.socialLinks?.instagram && (
                <Tooltip content="Visit Instagram page">
                  <a
                    href={company.socialLinks.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    <Instagram className="h-4 w-4 text-[#E1306C]" /> Instagram
                  </a>
                </Tooltip>
              )}
              {company.socialLinks?.youtube && (
                <Tooltip content="Visit YouTube channel">
                  <a
                    href={company.socialLinks.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    <Youtube className="h-4 w-4 text-[#FF0000]" /> YouTube
                  </a>
                </Tooltip>
              )}
              {company.socialLinks?.glassdoor && (
                <Tooltip content="View Glassdoor reviews">
                  <a
                    href={company.socialLinks.glassdoor}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    <ExternalLink className="h-4 w-4 text-[#0CAA41]" /> Glassdoor
                  </a>
                </Tooltip>
              )}
              {company.careersPageUrl && (
                <Tooltip content="Browse open positions on company careers page">
                  <a
                    href={company.careersPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    <ExternalLink className="text-primary h-4 w-4" /> Careers Page
                  </a>
                </Tooltip>
              )}
              {company.blogUrl && (
                <Tooltip content="Read the company blog">
                  <a
                    href={company.blogUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                  >
                    <BookOpen className="text-secondary h-4 w-4" /> Blog
                  </a>
                </Tooltip>
              )}
            </div>
          </Card>
        )}

        {/* CSR Initiatives */}
        {company.csrInitiatives && (
          <Card
            header={<h2 className="text-lg font-semibold text-[var(--text)]">CSR Initiatives</h2>}
          >
            <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
              {company.csrInitiatives}
            </p>
          </Card>
        )}

        {/* Specialties */}
        {company.specialties && company.specialties.length > 0 && (
          <Card header={<h2 className="text-lg font-semibold text-[var(--text)]">Specialties</h2>}>
            <div className="flex flex-wrap gap-2">
              {company.specialties.map((spec) => (
                <Badge key={spec} variant="neutral" size="sm">
                  {spec}
                </Badge>
              ))}
            </div>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
