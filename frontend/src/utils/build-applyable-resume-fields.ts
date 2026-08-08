/**
 * Single source of truth for "ParsedResumeData → ApplyableResumeFields".
 *
 * The candidate-onboarding wizard and the profile-edit page both apply
 * resume-parse output to their local form state. Without this helper
 * they were each maintaining a parallel mapping that diverged over
 * time (the old onboarding handler only applied 6 fields; the profile
 * page applied 8). Centralising means new fields surface in every
 * consumer with one edit.
 *
 * The helper produces a `Partial<ApplyableResumeFields>` (only keys
 * with a real value are present), so callers can spread it into their
 * form state without overwriting fields the user already filled.
 *
 * Field-mapping rules:
 *   - Scalar candidate-profile columns (city, currentCompany, dob...)
 *     map 1:1 from the parsed shape.
 *   - `summary` (resume-side name for "Professional Summary") maps to
 *     `bio` (candidate-profile column name).
 *   - Rich arrays (experience, education, certifications, ...) flatten
 *     nullable parsed fields into the non-nullable
 *     `Entry`-shaped objects expected by the form. Where the parsed
 *     value is null/missing we drop down to a sensible empty default
 *     ("" for strings, undefined for optional dates).
 *   - Empty arrays are omitted entirely rather than written as `[]`,
 *     so applying a parse that has no projects doesn't clobber the
 *     existing projects the user manually entered.
 */

import type {
  CertificationEntry,
  EducationEntry,
  ExperienceEntry,
  AwardEntry,
  ProjectEntry,
  PublicationEntry,
  PatentEntry,
  VolunteerEntry,
  MembershipEntry,
  CourseCompletionEntry,
  TestScoreEntry,
  ReferenceEntry,
  LanguageEntry,
  SkillWithProficiency,
  ITSkillEntry,
} from '@/types/candidate';
import type { ApplyableResumeFields, ParsedResumeData } from '@/types/resume-parse';

function isTruthyString(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Split a parsed full name into firstName / lastName on the first space.
 * Common Indian names have multi-word last names ("Naveen Kumar Mahawar")
 * — keeping everything after the first space as lastName is the
 * conventional approach used elsewhere in this codebase. A single-word
 * name returns just firstName; both null/empty returns an empty object
 * so callers can spread without writing keys.
 */
function splitFullName(full: string | null | undefined): { firstName?: string; lastName?: string } {
  if (!isTruthyString(full)) return {};
  const trimmed = full.trim().replace(/\s+/g, ' ');
  const idx = trimmed.indexOf(' ');
  if (idx < 0) return { firstName: trimmed };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1).trim() };
}

function takeStringArray(arr: readonly string[] | null | undefined): string[] | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

function mapExperience(rows: ParsedResumeData['experience']): ExperienceEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.company) || isTruthyString(r.role))
    .map((r) => ({
      company: r.company ?? '',
      role: r.role ?? '',
      location: r.location ?? undefined,
      industry: r.industry ?? undefined,
      department: r.department ?? undefined,
      employmentType: r.employmentType ?? undefined,
      startDate: r.startDate ?? '',
      endDate: r.endDate ?? undefined,
      isCurrent: r.isCurrent ?? !r.endDate,
      description: r.description ?? undefined,
      keyAchievements: r.keyAchievements ?? undefined,
      teamSize: r.teamSize ?? undefined,
      reportingTo: r.reportingTo ?? undefined,
      annualCtc: r.annualCtc ?? undefined,
    }));
}

function mapEducation(rows: ParsedResumeData['education']): EducationEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.institution) || isTruthyString(r.degree))
    .map((r) => ({
      educationLevel: r.educationLevel ?? undefined,
      institution: r.institution ?? '',
      degree: r.degree ?? '',
      boardState: r.boardState ?? undefined,
      field: r.field ?? '',
      fieldOfStudy: r.fieldOfStudy ?? undefined,
      startDate: r.startDate ?? '',
      endDate: r.endDate ?? undefined,
      grade: r.grade ?? undefined,
      gradeType: r.gradeType ?? undefined,
      courseType: r.courseType ?? undefined,
      specialization: r.specialization ?? undefined,
      description: r.description ?? undefined,
      activities: r.activities ?? undefined,
    }));
}

function mapCertifications(
  rows: ParsedResumeData['certifications'],
): CertificationEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.name))
    .map((r) => ({
      name: r.name ?? '',
      issuer: r.issuer ?? '',
      issueDate: r.issueDate ?? undefined,
      expiryDate: r.expiryDate ?? undefined,
      credentialId: r.credentialId ?? undefined,
      url: r.url ?? undefined,
      doesNotExpire: r.doesNotExpire ?? undefined,
    }));
}

function mapProjects(rows: ParsedResumeData['projects']): ProjectEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.name))
    .map((r) => ({
      name: r.name ?? '',
      description: r.description ?? undefined,
      url: r.url ?? undefined,
      startDate: r.startDate ?? undefined,
      endDate: r.endDate ?? undefined,
      technologies: r.technologies ?? undefined,
      role: r.role ?? undefined,
      teamSize: r.teamSize ?? undefined,
      client: r.client ?? undefined,
      isCurrent: r.isCurrent ?? undefined,
    }));
}

function mapAwards(rows: ParsedResumeData['awards']): AwardEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.title))
    .map((r) => ({
      title: r.title ?? '',
      issuer: r.issuer ?? undefined,
      date: r.date ?? undefined,
      description: r.description ?? undefined,
    }));
}

function mapPublications(rows: ParsedResumeData['publications']): PublicationEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.title))
    .map((r) => ({
      title: r.title ?? '',
      publisher: r.publisher ?? undefined,
      publicationDate: r.publicationDate ?? undefined,
      url: r.url ?? undefined,
      description: r.description ?? undefined,
      authors: r.authors ?? undefined,
    }));
}

function mapPatents(rows: ParsedResumeData['patents']): PatentEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.title))
    .map((r) => ({
      title: r.title ?? '',
      patentOffice: r.patentOffice ?? undefined,
      patentNumber: r.patentNumber ?? undefined,
      status: r.status ?? undefined,
      filingDate: r.filingDate ?? undefined,
      issueDate: r.issueDate ?? undefined,
      url: r.url ?? undefined,
      description: r.description ?? undefined,
      inventors: r.inventors ?? undefined,
    }));
}

function mapVolunteer(rows: ParsedResumeData['volunteerExperience']): VolunteerEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.organization) || isTruthyString(r.role))
    .map((r) => ({
      organization: r.organization ?? '',
      role: r.role ?? '',
      cause: r.cause ?? undefined,
      startDate: r.startDate ?? undefined,
      endDate: r.endDate ?? undefined,
      isCurrent: r.isCurrent ?? undefined,
      description: r.description ?? undefined,
    }));
}

function mapMemberships(
  rows: ParsedResumeData['professionalMemberships'],
): MembershipEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.organization))
    .map((r) => ({
      organization: r.organization ?? '',
      role: r.role ?? undefined,
      startDate: r.startDate ?? undefined,
      endDate: r.endDate ?? undefined,
      membershipId: r.membershipId ?? undefined,
      description: r.description ?? undefined,
    }));
}

function mapCourses(rows: ParsedResumeData['courses']): CourseCompletionEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.name))
    .map((r) => ({
      name: r.name ?? '',
      provider: r.provider ?? undefined,
      completionDate: r.completionDate ?? undefined,
      url: r.url ?? undefined,
      associatedWith: r.associatedWith ?? undefined,
    }));
}

function mapTestScores(rows: ParsedResumeData['testScores']): TestScoreEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.testName) && isTruthyString(r.score))
    .map((r) => ({
      testName: r.testName ?? '',
      score: r.score ?? '',
      dateOfExam: r.dateOfExam ?? undefined,
      associatedWith: r.associatedWith ?? undefined,
      description: r.description ?? undefined,
    }));
}

function mapReferences(rows: ParsedResumeData['references']): ReferenceEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.name))
    .map((r) => ({
      name: r.name ?? '',
      designation: r.designation ?? undefined,
      organization: r.organization ?? undefined,
      email: r.email ?? undefined,
      phone: r.phone ?? undefined,
      relationship: r.relationship ?? undefined,
    }));
}

function mapLanguageProficiency(
  rows: ParsedResumeData['languageProficiency'],
): LanguageEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.language))
    .map((r) => ({
      language: r.language ?? '',
      proficiency: r.proficiency ?? 'INTERMEDIATE',
    }));
}

function mapSkillsWithProficiency(
  rows: ParsedResumeData['skillsWithProficiency'],
): SkillWithProficiency[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.skill))
    .map((r) => ({
      skill: r.skill ?? '',
      proficiency: r.proficiency ?? 'INTERMEDIATE',
      yearsOfExperience: r.yearsOfExperience ?? undefined,
    }));
}

function mapITSkills(rows: ParsedResumeData['itSkills']): ITSkillEntry[] | undefined {
  if (!rows.length) return undefined;
  return rows
    .filter((r) => isTruthyString(r.technology))
    .map((r) => ({
      technology: r.technology ?? '',
      version: r.version ?? undefined,
      lastUsed: r.lastUsed ?? undefined,
      experienceYears: r.experienceYears ?? undefined,
      proficiency: r.proficiency ?? undefined,
    }));
}

/**
 * Build the complete apply-payload from a parsed resume.
 *
 * Every present field is included. Empty arrays / null scalars are
 * omitted entirely so applying never clobbers existing user input.
 */
export function buildApplyableFields(parsed: ParsedResumeData): Partial<ApplyableResumeFields> {
  const out: Partial<ApplyableResumeFields> = {};

  // Identity — name lives on the User record (not CandidateProfile), so
  // these two keys are dispatched by the apply handler to
  // authService.updateProfile rather than to the candidate-profile form.
  const { firstName, lastName } = splitFullName(parsed.name);
  if (firstName) out.firstName = firstName;
  if (lastName) out.lastName = lastName;

  if (isTruthyString(parsed.summary)) out.bio = parsed.summary;
  if (isTruthyString(parsed.headline)) out.headline = parsed.headline;
  if (isTruthyString(parsed.pronouns)) out.pronouns = parsed.pronouns;
  // Route resume contacts to the *alternate* slots, never to the primary
  // phone / email — those are auth identifiers (OTP login, account
  // recovery, billing receipts) and a resume parse must never overwrite
  // them. Prefer the resume's primary contact (parsed.phone /
  // parsed.email) over an explicit alternate the parser may have also
  // surfaced; the explicit alternate fields are only used as a fallback
  // when the primary isn't present (rare).
  const altPhone = isTruthyString(parsed.phone) ? parsed.phone : parsed.alternatePhone;
  const altEmail = isTruthyString(parsed.email) ? parsed.email : parsed.alternateEmail;
  if (isTruthyString(altPhone)) out.alternatePhone = altPhone;
  if (isTruthyString(altEmail)) out.alternateEmail = altEmail;
  if (isTruthyString(parsed.dob)) out.dob = parsed.dob;
  if (parsed.gender) out.gender = parsed.gender;
  if (parsed.maritalStatus) out.maritalStatus = parsed.maritalStatus;
  if (isTruthyString(parsed.nationality)) out.nationality = parsed.nationality;
  if (isTruthyString(parsed.hometown)) out.hometown = parsed.hometown;
  if (parsed.category) out.category = parsed.category;

  // Address
  if (isTruthyString(parsed.addressLine1)) out.addressLine1 = parsed.addressLine1;
  if (isTruthyString(parsed.addressLine2)) out.addressLine2 = parsed.addressLine2;
  if (isTruthyString(parsed.city)) out.city = parsed.city;
  if (isTruthyString(parsed.state)) out.state = parsed.state;
  if (isTruthyString(parsed.pincode)) out.pincode = parsed.pincode;
  if (isTruthyString(parsed.country)) out.country = parsed.country;
  if (isTruthyString(parsed.currentLocation)) out.currentLocation = parsed.currentLocation;

  // Professional
  if (typeof parsed.experienceYears === 'number') out.experienceYears = parsed.experienceYears;
  if (typeof parsed.totalExperienceMonths === 'number') {
    out.totalExperienceMonths = parsed.totalExperienceMonths;
  }
  if (parsed.experienceLevel) out.experienceLevel = parsed.experienceLevel;
  if (isTruthyString(parsed.currentCompany)) out.currentCompany = parsed.currentCompany;
  if (isTruthyString(parsed.currentRole)) out.currentRole = parsed.currentRole;
  if (isTruthyString(parsed.currentIndustry)) out.currentIndustry = parsed.currentIndustry;
  if (isTruthyString(parsed.currentDepartment)) out.currentDepartment = parsed.currentDepartment;
  if (isTruthyString(parsed.functionalArea)) out.functionalArea = parsed.functionalArea;
  if (parsed.workStatus) out.workStatus = parsed.workStatus;
  if (parsed.openToWork) out.openToWork = parsed.openToWork;
  if (parsed.noticePeriod) out.noticePeriod = parsed.noticePeriod;
  if (typeof parsed.servingNoticePeriod === 'boolean') {
    out.servingNoticePeriod = parsed.servingNoticePeriod;
  }
  if (typeof parsed.hasCareerBreak === 'boolean') out.hasCareerBreak = parsed.hasCareerBreak;
  if (parsed.careerBreakType) out.careerBreakType = parsed.careerBreakType;
  if (isTruthyString(parsed.careerBreakReason)) out.careerBreakReason = parsed.careerBreakReason;
  if (typeof parsed.currSalary === 'number') out.currSalary = parsed.currSalary;
  if (typeof parsed.expectedSalaryMin === 'number')
    out.expectedSalaryMin = parsed.expectedSalaryMin;
  if (typeof parsed.expectedSalaryMax === 'number')
    out.expectedSalaryMax = parsed.expectedSalaryMax;
  if (isTruthyString(parsed.salaryCurrency)) out.salaryCurrency = parsed.salaryCurrency;

  // Career preferences
  const jobTypes = parsed.preferredJobType?.filter(Boolean);
  if (jobTypes && jobTypes.length > 0) out.preferredJobType = jobTypes;
  const workModes = parsed.preferredWorkMode?.filter(Boolean);
  if (workModes && workModes.length > 0) out.preferredWorkMode = workModes;
  if (parsed.preferredShift) out.preferredShift = parsed.preferredShift;
  const prefLocs = takeStringArray(parsed.preferredLocations);
  if (prefLocs) out.preferredLocations = prefLocs;
  const prefInd = takeStringArray(parsed.preferredIndustries);
  if (prefInd) out.preferredIndustries = prefInd;
  const prefRoles = takeStringArray(parsed.preferredRoleCategories);
  if (prefRoles) out.preferredRoleCategories = prefRoles;
  if (typeof parsed.willingToRelocate === 'boolean') {
    out.willingToRelocate = parsed.willingToRelocate;
  }
  if (typeof parsed.travelWillingnessPercent === 'number') {
    out.travelWillingnessPercent = parsed.travelWillingnessPercent;
  }
  if (isTruthyString(parsed.dateOfAvailability)) {
    out.dateOfAvailability = parsed.dateOfAvailability;
  }

  // Education summary
  if (parsed.highestEducationLevel) out.highestEducationLevel = parsed.highestEducationLevel;
  if (parsed.highestDegree) out.highestDegree = parsed.highestDegree;

  // Visa / docs
  if (isTruthyString(parsed.visaStatus)) out.visaStatus = parsed.visaStatus;
  if (isTruthyString(parsed.workPermitStatus)) out.workPermitStatus = parsed.workPermitStatus;
  if (isTruthyString(parsed.passportNumber)) out.passportNumber = parsed.passportNumber;
  if (isTruthyString(parsed.passportExpiryDate)) {
    out.passportExpiryDate = parsed.passportExpiryDate;
  }
  if (typeof parsed.hasDrivingLicense === 'boolean') {
    out.hasDrivingLicense = parsed.hasDrivingLicense;
  }
  if (parsed.drivingLicenseType) out.drivingLicenseType = parsed.drivingLicenseType;
  if (typeof parsed.ownVehicle === 'boolean') out.ownVehicle = parsed.ownVehicle;
  if (parsed.vehicleTypes && parsed.vehicleTypes.length > 0) {
    out.vehicleTypes = parsed.vehicleTypes.filter(Boolean);
  }
  if (typeof parsed.isVeteran === 'boolean') out.isVeteran = parsed.isVeteran;

  // Disability
  if (typeof parsed.isPhysicallyChallenged === 'boolean') {
    out.isPhysicallyChallenged = parsed.isPhysicallyChallenged;
  }
  if (parsed.disabilityType) out.disabilityType = parsed.disabilityType;
  if (typeof parsed.disabilityPercentage === 'number') {
    out.disabilityPercentage = parsed.disabilityPercentage;
  }

  // Lists / scalars
  if (parsed.skills.length > 0) out.skills = parsed.skills;
  if (parsed.languages.length > 0) out.languages = parsed.languages;
  if (parsed.interests.length > 0) out.interests = parsed.interests;
  if (parsed.hobbies.length > 0) out.hobbies = parsed.hobbies;
  if (parsed.blockedCompanies.length > 0) out.blockedCompanies = parsed.blockedCompanies;

  // Rich arrays
  const exp = mapExperience(parsed.experience);
  if (exp) out.experience = exp;
  const edu = mapEducation(parsed.education);
  if (edu) out.education = edu;
  const certs = mapCertifications(parsed.certifications);
  if (certs) out.certifications = certs;
  const proj = mapProjects(parsed.projects);
  if (proj) out.projects = proj;
  const aw = mapAwards(parsed.awards);
  if (aw) out.awards = aw;
  const pub = mapPublications(parsed.publications);
  if (pub) out.publications = pub;
  const pat = mapPatents(parsed.patents);
  if (pat) out.patents = pat;
  const vol = mapVolunteer(parsed.volunteerExperience);
  if (vol) out.volunteerExperience = vol;
  const mem = mapMemberships(parsed.professionalMemberships);
  if (mem) out.professionalMemberships = mem;
  const cou = mapCourses(parsed.courses);
  if (cou) out.courses = cou;
  const ts = mapTestScores(parsed.testScores);
  if (ts) out.testScores = ts;
  const refs = mapReferences(parsed.references);
  if (refs) out.references = refs;
  const langP = mapLanguageProficiency(parsed.languageProficiency);
  if (langP) out.languageProficiency = langP;
  const skP = mapSkillsWithProficiency(parsed.skillsWithProficiency);
  if (skP) out.skillsWithProficiency = skP;
  const itS = mapITSkills(parsed.itSkills);
  if (itS) out.itSkills = itS;

  // Social
  if (isTruthyString(parsed.linkedinProfile)) out.linkedinProfile = parsed.linkedinProfile;
  if (isTruthyString(parsed.githubProfile)) out.githubProfile = parsed.githubProfile;
  if (isTruthyString(parsed.portfolioUrl)) out.portfolioUrl = parsed.portfolioUrl;
  if (isTruthyString(parsed.stackOverflowProfile)) {
    out.stackOverflowProfile = parsed.stackOverflowProfile;
  }
  if (isTruthyString(parsed.twitterProfile)) out.twitterProfile = parsed.twitterProfile;
  if (isTruthyString(parsed.personalBlogUrl)) out.personalBlogUrl = parsed.personalBlogUrl;
  if (isTruthyString(parsed.dribbbleProfile)) out.dribbbleProfile = parsed.dribbbleProfile;
  if (isTruthyString(parsed.behanceProfile)) out.behanceProfile = parsed.behanceProfile;
  if (isTruthyString(parsed.mediumProfile)) out.mediumProfile = parsed.mediumProfile;
  if (isTruthyString(parsed.youtubeChannel)) out.youtubeChannel = parsed.youtubeChannel;

  return out;
}
