import type { FaqEntry } from './types';

/**
 * Canonical English FAQ corpus.
 *
 * IDs are stable strings — translation files (faqs.hi.ts, etc.) mirror
 * these IDs so a locale with missing entries falls back to English at
 * runtime via `getFaqsForLocale(locale)`.
 *
 * Order = display order on /help. Newer entries go at the end of their
 * category to preserve URL-fragment stability (`/help#faq-<id>`).
 */
export const FAQS_EN: FaqEntry[] = [
  // ===========================================================
  // General
  // ===========================================================
  {
    id: 'create-account',
    category: 'general',
    audiences: ['all'],
    pageContexts: ['home', 'login', 'register', 'login-candidate', 'register-candidate'],
    keywords: ['signup', 'sign up', 'register', 'new account', 'join'],
    question: 'How do I create an account on Hire Adda?',
    answer:
      'Creating an account is simple and free. Click the "Get Started" or "Sign Up" button on the homepage. You can register using your email address and password, or sign up quickly using your Google or LinkedIn account. Once registered, you will be guided through completing your profile with your skills, experience, and job preferences.',
  },
  {
    id: 'forgot-password',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['login', 'login-candidate', 'login-employer'],
    keywords: ['reset password', 'forgot password', 'lost password', 'password reset email'],
    question: 'How do I reset my password?',
    answer:
      'If you have forgotten your password, click "Forgot Password" on the login page. Enter the email address associated with your account, and we will send you a password reset link. The link is valid for 1 hour. Click it to set a new password. If you do not receive the email, check your spam folder or contact our support team for assistance.',
  },
  {
    id: 'delete-account',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['dashboard-candidate', 'dashboard-employer'],
    keywords: ['close account', 'remove account', 'delete profile', 'erase data'],
    question: 'How do I delete my account?',
    answer:
      'You can request account deletion from your account settings page. Navigate to Settings, then scroll to the "Danger Zone" section and click "Delete Account." You will be asked to confirm your decision. Please note that account deletion is permanent and all your data, including applications, saved jobs, and messages, will be permanently removed within 30 days.',
  },
  {
    id: 'contact-support',
    category: 'general',
    audiences: ['all'],
    pageContexts: ['home', 'login', 'register', 'pricing', 'pricing-employer', 'pricing-candidate'],
    keywords: ['help', 'reach support', 'phone number', 'email support', 'helpline'],
    question: 'How do I contact customer support?',
    answer:
      'You can reach our support team through multiple channels. Email us at support@hireadda.in, call our toll-free number at +91 1762469136 (Mon-Fri, 9 AM - 6 PM IST), or visit our Contact page to send a message directly. We also offer in-app chat support for logged-in users. Our team typically responds within 24 hours.',
  },
  {
    id: 'mobile-app',
    category: 'general',
    audiences: ['all'],
    pageContexts: ['home', 'login', 'register'],
    keywords: ['android app', 'ios app', 'iphone app', 'play store', 'app store'],
    question: 'Is there a Hire Adda mobile app available?',
    answer:
      'We are currently developing native mobile apps for both Android and iOS, expected to launch in Q3 2026. In the meantime, our website is fully responsive and works seamlessly on mobile browsers. You can add Hire Adda to your home screen for an app-like experience. We also support push notifications through your browser to keep you updated on new matches and application status.',
  },
  {
    id: 'languages-supported',
    category: 'general',
    audiences: ['all'],
    pageContexts: ['home'],
    keywords: ['hindi', 'tamil', 'telugu', 'bengali', 'marathi', 'regional', 'language'],
    question: 'Which languages does Hire Adda support?',
    answer:
      'Hire Adda is currently available in English with full UI translations rolling out for Hindi, Tamil, Telugu, Bengali, and Marathi through 2026. Job descriptions, applications, and search work in any language — our matching engine understands queries across all major Indian languages. Use the language picker in the help center to read FAQs in your preferred language.',
  },
  {
    id: 'who-is-it-for',
    category: 'general',
    audiences: ['all'],
    pageContexts: ['home', 'pricing'],
    keywords: ['who can use', 'eligibility', 'students', 'experienced', 'audiences'],
    question: 'Who is Hire Adda built for?',
    answer:
      'Hire Adda serves three audiences end-to-end: job-seeking candidates (freshers to senior leaders, across every industry), employers and recruitment teams (from startups posting their first role to enterprises managing hundreds of openings), and recruitment-vendor agencies that source candidates on behalf of clients (vendors run on an employer account via the Vendor Connect add-on). Each audience has a dedicated dashboard, plan family, and support flow.',
  },
  {
    id: 'about-hire-adda',
    category: 'general',
    audiences: ['all'],
    pageContexts: ['home'],
    keywords: ['about', 'company', 'mission', 'history', 'india'],
    question: 'What is Hire Adda?',
    answer:
      'Hire Adda is an India-first hiring platform that brings job seekers, employers, and recruitment vendors together on one stack. We combine traditional job-posting with a searchable CV database, AI-powered job matching, assisted hiring (where our team sources CVs for you), and a vendor marketplace — all priced in INR, GST-compliant, and built for the Indian hiring market.',
  },
  {
    id: 'regions-served',
    category: 'general',
    audiences: ['all'],
    pageContexts: ['home'],
    keywords: ['cities', 'pan india', 'metro', 'tier 2', 'tier 3', 'remote'],
    question: 'Which regions and cities does Hire Adda serve?',
    answer:
      'Hire Adda is pan-India — jobs and candidates are listed across every state and union territory. We have particularly strong coverage in metros (Bengaluru, Mumbai, Delhi-NCR, Hyderabad, Pune, Chennai, Kolkata, Ahmedabad), with rapidly growing volumes in tier-2 and tier-3 cities. Remote and hybrid jobs work across borders, and our matching engine supports queries in English plus 5 regional languages.',
  },
  {
    id: 'safety-trust',
    category: 'general',
    audiences: ['all'],
    pageContexts: ['home', 'login', 'register'],
    keywords: ['fake job', 'scam', 'genuine', 'verified', 'trust', 'safety'],
    question: 'How do you ensure jobs and candidates are genuine?',
    answer:
      'Every employer goes through company verification (GST + PAN + domain email proof) before they can access candidate contact details or post premium jobs. Job posts pass content moderation that flags scammy patterns ("pay to apply", "MLM", impossible salaries). Candidate profiles get email + mobile OTP verification, and we offer optional employer / education / experience verification badges. Suspicious activity is reviewed by our Trust & Safety team within 24 hours of being reported.',
  },
  {
    id: 'report-fraudulent',
    category: 'general',
    audiences: ['all'],
    pageContexts: ['home', 'dashboard-candidate', 'dashboard-employer'],
    keywords: ['report', 'fraud', 'fake', 'scam', 'suspicious', 'flag', 'misleading'],
    question: 'How do I report a suspicious or fraudulent job posting?',
    answer:
      'If you encounter a job listing that appears fraudulent, misleading, or suspicious, click the "Report" button on the job detail page. Select the reason for reporting and provide any additional details. Our moderation team reviews all reports within 24-48 hours. You can also email reports directly to safety@hireadda.in for urgent concerns. Verified scams result in immediate takedown and account suspension for the employer.',
  },
  {
    id: 'platform-stats',
    category: 'general',
    audiences: ['all'],
    pageContexts: ['home', 'pricing'],
    keywords: ['how many users', 'companies', 'jobs', 'candidates', 'numbers', 'stats'],
    question: 'How many jobs and companies are on Hire Adda?',
    answer:
      'Live numbers update on the homepage and /about page. As of Q2 2026: 50,000+ candidates, 5,000+ verified employers, 12,000+ open roles across 200+ cities, and 800+ recruitment vendors in the directory. Weekly application volume is in the high hundreds of thousands. We share aggregate platform analytics quarterly through our blog.',
  },

  // ===========================================================
  // Account & Security
  // ===========================================================
  {
    id: 'two-factor-auth',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['login', 'dashboard-candidate', 'dashboard-employer'],
    keywords: ['2fa', 'mfa', 'authenticator', 'totp', 'security key', 'passkey'],
    question: 'How do I enable two-factor authentication (2FA)?',
    answer:
      'Open Settings → Security → Two-Factor Authentication. Scan the QR code with any authenticator app (Google Authenticator, Authy, 1Password, Microsoft Authenticator) and enter the 6-digit code to enable. We will also generate one-time backup codes — store them somewhere safe in case you lose your device. You can additionally register a passkey (Face ID, Touch ID, Windows Hello, or hardware security key) for password-less sign-in.',
  },
  {
    id: 'trust-device',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['login'],
    keywords: ['trust device', 'remember device', '30 days', 'mfa skip'],
    question: 'What does "Trust this device for 30 days" do?',
    answer:
      'When you check this option after a successful 2FA verification, we set a secure cookie on the current browser. Subsequent sign-ins from the same browser within 30 days skip the 2FA prompt. The trust cookie is bound to that browser only — signing in from a different device, incognito window, or a fresh browser will still require 2FA. Revoke trusted devices anytime from Settings → Security.',
  },
  {
    id: 'sessions-revoke',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['dashboard-candidate', 'dashboard-employer'],
    keywords: ['active sessions', 'logout everywhere', 'revoke', 'sign out all'],
    question: 'How do I see and revoke active sessions?',
    answer:
      'Settings → Security → Active Sessions lists every device and browser currently signed into your account, with the IP, location (city-level), and last-active timestamp. Click "Revoke" next to any session to sign that device out immediately, or "Revoke all other sessions" to keep only the current browser signed in. Lost-phone scenarios are handled here.',
  },
  {
    id: 'lost-mfa-device',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['login'],
    keywords: ['lost authenticator', 'lost phone', 'cannot 2fa', 'recovery code'],
    question: 'I lost my authenticator device — how do I recover my account?',
    answer:
      'On the 2FA prompt, click "Can\'t access authenticator?" → "Send Recovery Code". We will email a 6-digit code to your account email. Entering it disables 2FA on your account so you can sign in. Re-enable 2FA immediately afterwards. You can also use one of the backup codes saved when you first enabled 2FA — each backup code works once and only once.',
  },
  {
    id: 'data-privacy',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['register', 'pricing'],
    keywords: ['privacy', 'data', 'gdpr', 'dpdp', 'personal information'],
    question: 'How does Hire Adda protect my personal data?',
    answer:
      "We are compliant with India's Digital Personal Data Protection (DPDP) Act and follow OWASP Top 10 best practices. Data is encrypted in transit (TLS 1.3) and at rest. Sensitive fields (mobile numbers, salaries, contact details) are never returned in public APIs and require specific entitlements (e.g. CV unlock) for employers to view. You can export or delete your data anytime from Settings — full details in our Privacy Policy.",
  },
  {
    id: 'email-change',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['dashboard-candidate', 'dashboard-employer'],
    keywords: ['change email', 'update email', 'new email', 'switch email'],
    question: 'How do I change my email address?',
    answer:
      'Open Settings → Account → Email → "Change". Enter the new email and your current password. We send a verification link to the new email — clicking it switches your account email and sends a confirmation to the OLD email so you know about the change. The old email continues working for 7 days as a recovery channel. If you lose access to the old email, contact support@hireadda.in with proof of identity.',
  },
  {
    id: 'password-strength',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['register', 'login'],
    keywords: ['password rules', 'strong password', 'requirements', 'minimum length'],
    question: 'What are the password requirements?',
    answer:
      'Passwords must be 8+ characters with at least one uppercase letter, one lowercase letter, one number, and one special character. We block the 10,000 most-common breached passwords (matched against HaveIBeenPwned\'s public list). The strength meter on the registration form shows entropy in real time — aim for "Strong" or "Very Strong". For maximum security, enable 2FA after sign-up and consider registering a passkey for password-less login.',
  },
  {
    id: 'multiple-accounts',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['register', 'dashboard-candidate', 'dashboard-employer'],
    keywords: ['two accounts', 'multiple accounts', 'employer and candidate', 'switch role'],
    question: 'Can I have separate candidate and employer accounts?',
    answer:
      'Yes — accounts are role-locked, so a single email can hold one role. To use both candidate and employer features, register a second account with a different email. Many small-business owners do this: their personal email for job applications + their company email for hiring. Team-member invites also work with multi-seat employer plans (CV Enterprise) so a recruiter can join your company without losing their personal candidate account.',
  },
  {
    id: 'export-data',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['dashboard-candidate', 'dashboard-employer'],
    keywords: ['export data', 'download my data', 'gdpr export', 'data portability'],
    question: 'How do I export my data?',
    answer:
      'Settings → Privacy → "Export my data" generates a ZIP containing your profile, applications, messages, and audit log as JSON + PDF. Generation takes a few minutes; we email a download link valid for 24 hours. Exports are rate-limited to one per 7 days to prevent abuse. This satisfies the DPDP Act\'s data portability right — you can use the export to migrate to another platform if you wish.',
  },
  {
    id: 'account-suspended',
    category: 'account-security',
    audiences: ['all'],
    pageContexts: ['login'],
    keywords: ['suspended', 'banned', 'locked', 'appeal', 'deactivated'],
    question: 'My account was suspended — how do I appeal?',
    answer:
      'Suspensions usually happen for repeated content violations, fraudulent activity, or chargebacks. The login page will display the reason and a link to "Submit an appeal". Appeals are reviewed by a different moderator from the one who issued the suspension within 3-5 business days. If your account is wrongly suspended, you\'ll be reinstated and any consumed quota will be restored. Egregious violations (fake jobs, scam operations) are not eligible for appeal.',
  },

  // ===========================================================
  // For Candidates
  // ===========================================================
  {
    id: 'candidate-apply-job',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: [
      'login-candidate',
      'register-candidate',
      'onboarding-candidate',
      'dashboard-candidate',
    ],
    keywords: ['apply', 'application', 'job submit', 'one click apply'],
    question: 'How do I apply for jobs on the platform?',
    answer:
      'Once you have created your profile, browse jobs using the search bar or explore curated listings on your dashboard. When you find a job you are interested in, click the "Apply" button on the job detail page. Your profile and resume will be shared with the employer. You can also enable "Quick Apply" to apply to multiple positions with a single click using your saved profile.',
  },
  {
    id: 'candidate-update-profile',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['onboarding-candidate', 'dashboard-candidate'],
    keywords: ['edit profile', 'update profile', 'change details'],
    question: 'How do I update my profile information?',
    answer:
      'Log in to your account and navigate to your profile page from the dashboard. You can edit your personal information, work experience, education, skills, and preferences at any time. Click "Edit Profile" to make changes, and remember to save once you are done. Keeping your profile updated helps our matching engine find better opportunities for you.',
  },
  {
    id: 'candidate-resume-upload',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['onboarding-candidate', 'dashboard-candidate'],
    keywords: ['upload resume', 'cv upload', 'pdf', 'docx', 'resume parser'],
    question: 'What resume formats can I upload?',
    answer:
      'Upload your CV as PDF or DOCX (10 MB max). Our Document AI parser extracts your work history, education, and skills automatically — review the suggested fields before saving. You can keep multiple resume versions on your profile and pick which one to attach to each application. Tip: a structured PDF with clear section headings parses most accurately.',
  },
  {
    id: 'candidate-premium-benefits',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['pricing-candidate', 'login-candidate', 'dashboard-candidate'],
    keywords: ['premium', 'profile boost', 'verified badge', 'top visibility', 'ai resume'],
    question: 'What does Candidate Premium (₹199) include?',
    answer:
      'Candidate Premium for ₹199 (one-time) gives you five concrete benefits: AI Resume Premium (4 paid templates with auto-formatting), a Verified Badge on your profile, 7 days of Profile Boost (top of recruiter searches), Priority WhatsApp support (chat at +91 80540 50551, replies typically within 30 minutes), and Top Visibility ranking in candidate searches relevant to your skills. The plan is valid for 30 days.',
  },
  {
    id: 'whatsapp-support-channel',
    category: 'general',
    audiences: ['all'],
    pageContexts: [
      'home',
      'pricing',
      'pricing-employer',
      'pricing-candidate',
      'dashboard-candidate',
      'dashboard-employer',
    ],
    keywords: [
      'whatsapp',
      'wa.me',
      'chat support',
      '8054050551',
      'priority whatsapp',
      'whatsapp number',
    ],
    question: 'How do I contact WhatsApp support?',
    answer:
      'Plans that include WhatsApp Support — Candidate Premium (₹199), Employer Standard (₹499), Employer Premium (₹999), CV Pro (₹3999), Assisted Hiring (₹1499), and Vendor Connect (₹199/mo) — get access to our dedicated WhatsApp support number: +91 80540 50551 (https://wa.me/918054050551). Available Mon-Sat, 9 AM – 9 PM IST. Premium / Priority tiers receive faster responses (typically within 30 minutes); standard tier replies within a few hours. The number is surfaced on your dashboard once you subscribe.',
  },
  {
    id: 'candidate-applications-track',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['dashboard-candidate'],
    keywords: ['track application', 'status', 'shortlisted', 'rejected', 'interview'],
    question: 'How do I track my applications?',
    answer:
      'Open Dashboard → Applications. Each row shows the role, company, current status (Applied / Reviewed / Shortlisted / Interview / Hired / Rejected), and the latest update timestamp. Click into any application for the full timeline including employer-side notes (when shared) and any screening-question answers you submitted. We send email + push notifications on every status change.',
  },
  {
    id: 'candidate-profile-visibility',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['dashboard-candidate', 'onboarding-candidate'],
    keywords: ['hide profile', 'private mode', 'searchable', 'visibility'],
    question: 'Can I hide my profile from my current employer?',
    answer:
      'Yes — Settings → Privacy → "Hide profile from selected employers" lets you block specific company accounts (and any user from that company\'s domain) from seeing your profile in CV-database searches. You can also toggle "Make profile private" entirely so it only appears in jobs you actively apply for. Your application history with that employer is unaffected.',
  },
  {
    id: 'candidate-job-alerts',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['dashboard-candidate'],
    keywords: ['email alerts', 'job notifications', 'matching jobs', 'subscribe'],
    question: 'How do job alerts work?',
    answer:
      'Save any search you run on the jobs page as a Job Alert — we will email you new matching roles daily, weekly, or instantly (you choose). Alerts respect your filters exactly: skills, location, experience, work mode, salary range. Manage and pause alerts anytime from Dashboard → Job Alerts. Alerts stop automatically if you do not click any in 30 days, to keep your inbox clean.',
  },
  {
    id: 'candidate-recommendations',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['dashboard-candidate'],
    keywords: ['recommended jobs', 'matched jobs', 'ai matching', 'cloud talent'],
    question: 'How are job recommendations generated?',
    answer:
      "Recommendations combine three signals: (1) skills overlap between your profile and the job's required skills, weighted by recency; (2) Google Cloud Talent's AI matching trained on millions of hires; (3) your historical interaction (applies, saves, dismissals) to learn your preferences. Recommendations refresh every 4 hours — you can manually refresh from the Recommendations page.",
  },
  {
    id: 'candidate-interview-prep',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['dashboard-candidate'],
    keywords: ['interview tips', 'preparation', 'common questions'],
    question: 'Does Hire Adda help with interview preparation?',
    answer:
      'When an employer schedules an interview through Hire Adda, the application detail page shows a tailored prep panel: top skills the employer asked about historically, average preparation time their successful hires reported, and a checklist of artefacts to bring (resume, ID, certificates). We also surface salary-range data for the role + city if at least 3 hires have completed.',
  },
  {
    id: 'candidate-resume-templates',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['pricing-candidate', 'dashboard-candidate'],
    keywords: ['resume template', 'cv template', 'paid template', 'design', 'format'],
    question: 'What resume templates does Candidate Premium include?',
    answer:
      'Premium unlocks 4 paid templates beyond the free default: Modern Minimal (clean two-column), Executive Classic (single-column traditional), Creative Bold (colour accents for design / marketing roles), and ATS Pro (optimised for applicant-tracking-system parsing). Each template auto-formats your existing profile data — no re-typing. You can preview all 5 (1 free + 4 premium) before buying; non-premium users see a watermark on paid previews.',
  },
  {
    id: 'candidate-saved-jobs',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['dashboard-candidate'],
    keywords: ['save job', 'bookmark', 'shortlist', 'saved jobs', 'wishlist'],
    question: 'How do saved jobs work?',
    answer:
      'Click the bookmark icon on any job to save it for later. Saved jobs appear under Dashboard → Saved Jobs. Saving is private — employers cannot see who saved their job. Saved jobs that get filled or expire are auto-archived but remain visible in your list with a "No longer accepting applications" note. There\'s no limit on how many jobs you can save.',
  },
  {
    id: 'candidate-apply-without-account',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['home', 'login-candidate'],
    keywords: ['apply without signup', 'guest apply', 'no account', 'one click'],
    question: 'Can I apply without creating an account?',
    answer:
      'No — applications require an account so we can deliver your application + resume reliably to the employer, support follow-ups, and let you track status. Account creation is free and takes ~60 seconds (email + password, or 1-click via Google / LinkedIn). For roles that interest you, registering also lets you save the job, set up alerts for similar roles, and apply with a single click in future.',
  },
  {
    id: 'candidate-mock-interview',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['dashboard-candidate'],
    keywords: ['mock interview', 'practice', 'rehearsal', 'ai interview'],
    question: 'Does Hire Adda offer mock interviews?',
    answer:
      'AI-powered mock interviews are in beta for selected roles (software engineering, sales, customer support). The system asks role-specific questions, records your audio response, and gives feedback on answer structure, filler words, and key skills mentioned. Available free for Premium candidates, capped at 3 mock sessions per month. Open from Dashboard → Mock Interview when your role is in scope.',
  },
  {
    id: 'candidate-salary-research',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['dashboard-candidate'],
    keywords: ['salary', 'pay', 'compensation', 'ctc', 'research'],
    question: 'Can I research salaries before applying?',
    answer:
      "Yes — every job listing shows the employer-disclosed salary range when set. For undisclosed roles, the listing still shows an estimated range derived from similar hires (role + location + experience) when we have ≥10 data points. Salary Insights on Dashboard → Salary Insights gives broader market data: median + range by role, city, and years of experience, plus comparison to your current/expected CTC if you've filled it on your profile.",
  },
  {
    id: 'candidate-fake-job-detection',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['dashboard-candidate', 'home'],
    keywords: ['fake jobs', 'scam protection', 'safe', 'verified employer'],
    question: 'How do you protect candidates from fake jobs?',
    answer:
      'Three layers: (1) every employer is verified before posting (GST + PAN + domain email); (2) job posts go through automated moderation that blocks scammy patterns ("pay to apply", "registration fee", "investment opportunity"); (3) the in-app Trust Score on each job (0-5 stars) factors in the employer\'s past hires + verifications + report rate. Avoid jobs scoring below 3 stars and report any role asking for upfront money — Hire Adda will never charge you to apply.',
  },
  {
    id: 'candidate-skill-test',
    category: 'candidates',
    audiences: ['candidate'],
    pageContexts: ['dashboard-candidate'],
    keywords: ['assessment', 'test', 'skill test', 'aptitude', 'screening'],
    question: 'Are there skill assessments on Hire Adda?',
    answer:
      'Yes — employers can attach skill assessments to jobs (multiple-choice, coding, video answers). You see the assessment requirement on the apply form and can take it then or later (within 48 hours of applying). Scores are visible to both you and the employer. We also support self-administered skill tests on your profile for top in-demand skills (JavaScript, Python, English communication, Excel) — passing adds a verified badge that improves recruiter visibility.',
  },

  // ===========================================================
  // For Employers
  // ===========================================================
  {
    id: 'employer-post-job',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: [
      'login-employer',
      'register-employer',
      'onboarding-employer',
      'dashboard-employer',
      'pricing-employer',
    ],
    keywords: ['post job', 'create listing', 'new job', 'job posting'],
    question: 'How do I post a job as an employer?',
    answer:
      'Register as an employer and complete your company profile with details like company name, description, industry, and location. Once verified, navigate to your employer dashboard and click "Post a Job." Fill in the job title, description, required skills, salary range, and other details. Your listing will go live after a brief moderation review to ensure quality.',
  },
  {
    id: 'employer-free-plan',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['pricing-employer', 'register-employer', 'onboarding-employer'],
    keywords: ['free plan', 'free post', 'trial', 'no cost'],
    question: 'What does the Free Job Post plan (₹0) include?',
    answer:
      'The Free plan gives you 1 job post live for 7 days, with up to 50 applications, 1 location, basic candidate dashboard access, and standard listing visibility. It is granted automatically when you finish employer onboarding — no card required. Renewals are paid; upgrade to Standard (₹499) or Premium (₹999) anytime to extend validity, raise application caps, and add CV-database access.',
  },
  {
    id: 'employer-cv-database',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['pricing-employer', 'dashboard-employer'],
    keywords: ['cv database', 'search candidates', 'unlock contact', 'talent vault'],
    question: 'What is the CV Database (Talent Vault) and how does it work?',
    answer:
      'The CV Database is our searchable index of every candidate profile. Filter by skills, location, experience, salary, last-active, education and more. Each plan grants a fixed number of "CV unlocks" — viewing a candidate\'s contact details (email + phone) consumes one unlock from your quota. Search itself is free; only revealing contact info costs an unlock. CV Lite = 200 unlocks, CV Pro = 500, CV Enterprise = 1000+ (custom).',
  },
  {
    id: 'employer-applications-cap',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['pricing-employer', 'dashboard-employer'],
    keywords: ['applications limit', 'cap', '50 applications', 'unlimited'],
    question: 'What happens when my job hits its applications cap?',
    answer:
      'New applications are blocked with a "Job is full" message to candidates. You still see all received applications and can shortlist as normal. Free = 50 application cap, Standard = 250, Premium = unlimited. Upgrading mid-cycle removes the cap immediately for that listing. Cap is per-job (not account-wide) and resets if you re-post the role.',
  },
  {
    id: 'employer-team-multi-seat',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['pricing-employer', 'dashboard-employer'],
    keywords: ['team', 'multiple users', 'recruiters', 'seats', 'enterprise'],
    question: 'Can multiple recruiters from my company share one account?',
    answer:
      "Yes — invite teammates from Dashboard → Team. CV Enterprise plans include multi-seat sharing: invitees become RECRUITER or ADMIN team members and consume from the company's shared CV-unlock + search-result quota pool. Lower-tier plans (Standard, Premium, CV Lite, CV Pro) are single-seat only. Owner can transfer ownership or revoke seats anytime.",
  },
  {
    id: 'employer-assisted-hiring',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['pricing-employer', 'dashboard-employer'],
    keywords: ['assisted hiring', 'sourcing', 'fully managed', 'do it for me'],
    question: 'How does Assisted Hiring (₹1499) work?',
    answer:
      'Pay ₹1499 → our specialist calls you within one business day to scope the role → we source 4–5 matching CVs and email them to you within 7 days. You contact and interview the candidates yourself; we do the matching legwork. Each plan covers one job role. Track progress on Dashboard → Assisted Hiring with status updates from Pending → Call Scheduled → Sourcing → Delivered.',
  },
  {
    id: 'employer-urgent-badge',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['pricing-employer', 'dashboard-employer'],
    keywords: ['urgent hiring', 'urgent badge', 'priority', 'immediate'],
    question: 'How does the Urgent Hiring Badge work?',
    answer:
      "Available on the Premium ₹999 plan. When you mark a job as URGENT or IMMEDIATE during posting, it gets a red Urgent badge on listing cards + a +20 ranking boost in candidate searches + appears in the Urgent jobs widget on candidate dashboards. The badge is removed automatically when the job hits its first hire or after the job's validity ends.",
  },
  {
    id: 'employer-verification',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['onboarding-employer', 'dashboard-employer'],
    keywords: ['verify company', 'gst', 'pan', 'verified badge', 'kyc'],
    question: 'How do I get my company verified?',
    answer:
      'Settings → Verification → submit your GST certificate, PAN, and a company-domain email proof. Our team reviews within 1–2 business days. Verified companies get a green checkmark on every job listing, the company profile page, and recruiter outreach — candidates trust verified listings more, leading to ~40% higher application rates in our data.',
  },
  {
    id: 'employer-screening-questions',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['dashboard-employer'],
    keywords: ['screening', 'questions', 'filter applicants', 'pre-qualify'],
    question: 'Can I add screening questions to my job?',
    answer:
      'Yes — when posting or editing a job, scroll to "Screening Questions" and add up to 10 custom questions (text, multiple choice, yes/no). Mark any as required (must answer to apply) or as a deal-breaker (a wrong answer auto-rejects). Candidates see your questions on the apply form; their answers appear on the application detail page so you can pre-qualify before reviewing the full CV.',
  },
  {
    id: 'employer-analytics',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['dashboard-employer'],
    keywords: ['analytics', 'reports', 'hiring funnel', 'time to hire'],
    question: 'What analytics are available?',
    answer:
      'Employer Analytics shows your hiring funnel (Views → Applies → Shortlists → Interviews → Hires) per job and aggregated, time-to-hire and time-to-fill metrics, source breakdown (organic search, recommendations, applications, CV unlocks), and team-member productivity if you are on a multi-seat plan. CSV export available. Premium and CV Enterprise plans get additional cohort + benchmark views.',
  },
  {
    id: 'employer-edit-job',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['dashboard-employer'],
    keywords: ['edit job', 'update listing', 'modify job', 'change description'],
    question: 'How do I edit a job after posting?',
    answer:
      'Open Dashboard → My Jobs → click the job → "Edit". You can update the description, requirements, screening questions, and salary range anytime. Changes go live after a quick moderation re-check (usually under an hour). Critical fields (job title, type, work mode) cannot be edited after the first application is received — instead, close the role and post a new one to preserve application history clarity.',
  },
  {
    id: 'employer-close-job',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['dashboard-employer'],
    keywords: ['close job', 'end posting', 'remove listing', 'fill position'],
    question: 'How do I close a job listing early?',
    answer:
      'Dashboard → My Jobs → click the job → "Close listing". Pick a reason (Filled / Cancelled / Reposting) — affects your hiring analytics. Closed jobs stop accepting new applications immediately and disappear from public search within 5 minutes (ES reindex). Existing applications remain accessible for review and outreach. Closing a job does NOT refund your remaining validity — that\'s why the cap is per-listing not per-day.',
  },
  {
    id: 'employer-bulk-cv-download',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['pricing-employer', 'dashboard-employer'],
    keywords: ['bulk download', 'download cvs', 'export cvs', 'enterprise feature'],
    question: 'How does bulk CV download work?',
    answer:
      'CV Enterprise plans unlock bulk download. Search the CV database with your filters → check candidates (max 100 per export) → click "Download CVs as ZIP". Each PDF in the ZIP is the candidate\'s most-recent resume + a structured profile summary. Each downloaded CV consumes one CV-unlock from your quota (Enterprise plans have unlimited unlocks). Downloads are logged for audit; the candidate sees a notification "Your CV was downloaded by Acme Corp".',
  },
  {
    id: 'employer-application-export',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['dashboard-employer'],
    keywords: ['export applications', 'download applications', 'csv export', 'excel'],
    question: 'Can I export my applications to Excel / CSV?',
    answer:
      'Yes — Dashboard → Applications → Filter to your scope (by job, status, date range) → "Export as CSV". The export contains candidate name, contact (only for unlocked candidates), application status, applied-on date, screening answers, and shortlist notes. PII is masked unless the contact has been unlocked. Exports are rate-limited to 5 per day to prevent quota abuse.',
  },
  {
    id: 'employer-team-roles',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['dashboard-employer'],
    keywords: ['team roles', 'permissions', 'recruiter', 'admin', 'rbac'],
    question: 'What permissions do team roles have?',
    answer:
      "Three roles: OWNER (full access including billing + transferring ownership), ADMIN (manage jobs, applications, team invites, but cannot change billing or close the company account), RECRUITER (search CVs, shortlist applicants, post jobs to the company account, but cannot invite team members). All roles share the company's CV-unlock + search-result quota pool. Team & roles are managed from Dashboard → Team.",
  },
  {
    id: 'employer-vendor-find',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['dashboard-employer'],
    keywords: ['find vendor', 'recruitment partner', 'staffing agency', 'outsource hiring'],
    question: 'How do I find a recruitment partner / vendor?',
    answer:
      'Visit /vendors (public directory) and filter by specialisation, location, industry, team size, and verification status. Click any vendor for their full profile + past placements. Use "Send hiring requirement" to share role details — the vendor sees it in their lead inbox and contacts you within 24 hours typically. Sharing a requirement is free; you only pay if you sign a contract directly with the vendor (no platform fee).',
  },
  {
    id: 'employer-multi-location',
    category: 'employers',
    audiences: ['employer'],
    pageContexts: ['pricing-employer', 'dashboard-employer'],
    keywords: ['multiple locations', 'multi city', 'job locations', 'branches'],
    question: 'Can I post a job in multiple locations?',
    answer:
      'Yes, on paid plans only — Free plan caps at 1 location per job. Standard, Premium, and CV Enterprise allow additional locations on the same listing (no per-location cap), so a single role with offices in Bengaluru, Mumbai, and Pune appears in all three city searches without needing 3 separate posts. Location-specific applicants are flagged so you know which office they\'re applying for. Add additional locations on the post-job form under "Job locations".',
  },

  // ===========================================================
  // For Vendors
  // ===========================================================
  {
    id: 'vendor-what-is',
    category: 'vendors',
    audiences: ['vendor'],
    pageContexts: ['register-employer', 'login-employer', 'pricing'],
    keywords: ['vendor', 'recruitment agency', 'staffing', 'consultant', 'agency'],
    question: 'What is Vendor Connect and who is it for?',
    answer:
      'Vendor Connect is an employer add-on for recruitment agencies, staffing partners, and independent recruiters who source candidates on behalf of multiple client companies. Register as an employer (or sign in to your existing employer account) and subscribe to Vendor Connect for ₹199/month (auto-renewed) from the employer pricing page. You get listed in our public Vendor Directory, receive routed hiring leads from companies that match your specialisations, and unlock the vendor hub at /employer/vendor. The plan is monthly and you can cancel anytime.',
  },
  {
    id: 'vendor-receive-leads',
    category: 'vendors',
    audiences: ['vendor'],
    pageContexts: ['register-employer', 'dashboard-employer'],
    keywords: ['leads', 'requirements', 'inbox', 'opportunities'],
    question: 'How do I receive hiring leads?',
    answer:
      'After subscribing to Vendor Connect on your employer account, open the vendor hub at /employer/vendor and configure your "Specialisations" (e.g. IT, BFSI, healthcare), service locations, and industries. When companies search "Find Recruitment Partners" with criteria that match yours, you appear in the directory. Companies can then send you a hiring requirement directly — it lands in your lead inbox at /employer/vendor/leads with full role details and contact info to follow up. You can also browse the hiring job board at /employer/vendor/jobs, which lists other employers\' open roles with their contact details so you can pitch candidates proactively.',
  },
  {
    id: 'vendor-priority-leads',
    category: 'vendors',
    audiences: ['vendor'],
    pageContexts: ['pricing', 'dashboard-employer'],
    keywords: ['priority access', 'first dibs', 'new leads', 'ranking'],
    question: 'How does Priority Access to New Leads work?',
    answer:
      'Vendor Connect subscribers receive a +5 ranking bonus in the matching score the company sees, so you appear higher in their preview list of candidate vendors. Priority is ordered by overlap quality (skills + location + industry) so a perfect-match basic vendor still ranks above an unrelated priority vendor. Leads are not exclusive — multiple vendors can be contacted for the same role.',
  },
  {
    id: 'vendor-public-listing',
    category: 'vendors',
    audiences: ['vendor'],
    pageContexts: ['register-employer', 'dashboard-employer'],
    keywords: ['public profile', 'directory', 'browse vendors', 'searchable'],
    question: 'Where is my agency profile shown publicly?',
    answer:
      'Active subscribers appear in the public /vendors directory (browsable by anyone, indexed by Google) with a dedicated profile page at /vendors/{slug} showing your specialisations, locations, team size, and (optionally) testimonials. Edit your public profile at /employer/vendor/profile — changes are live within minutes after our content moderation review.',
  },
  {
    id: 'vendor-cancel',
    category: 'vendors',
    audiences: ['vendor'],
    pageContexts: ['pricing', 'dashboard-employer'],
    keywords: ['cancel subscription', 'auto-renew', 'unsubscribe', 'monthly'],
    question: 'How do I cancel Vendor Connect?',
    answer:
      'Open Billing → Subscriptions → Vendor Connect → "Cancel auto-renew". Your access continues until the end of the current billing period (30 days from purchase) and then lapses — you stop receiving new leads but historical data is retained. You can resubscribe anytime; existing profile data is preserved between subscriptions.',
  },
  {
    id: 'vendor-onboarding',
    category: 'vendors',
    audiences: ['vendor'],
    pageContexts: ['register-employer', 'login-employer'],
    keywords: ['onboarding', 'setup', 'registration', 'getting started'],
    question: 'What does the vendor onboarding process look like?',
    answer:
      "Register as an employer (or sign in to your existing employer account) → subscribe to Vendor Connect (₹199/month) from the employer pricing page → complete your vendor profile at /employer/vendor/profile (specialisations, service locations, industries, team size, sample placements) → submit for verification — billing starts once you're approved (typically 1-2 business days). After approval, you appear in the public /vendors directory and start receiving routed leads at /employer/vendor/leads. You can pause your listing anytime from the vendor hub at /employer/vendor without cancelling the subscription.",
  },
  {
    id: 'vendor-multiple-clients',
    category: 'vendors',
    audiences: ['vendor'],
    pageContexts: ['register-employer', 'dashboard-employer'],
    keywords: ['multiple clients', 'companies served', 'portfolio', 'exclusive'],
    question: 'Can I serve multiple client companies?',
    answer:
      'Yes — Vendor Connect places no exclusivity restrictions. List as many client companies as you currently serve in your public profile (with permission); the more you can showcase, the higher your trust signal in directory searches. Leads we route to you are not exclusive either — multiple vendors may be contacted for the same role, and the company picks who to engage with.',
  },
  {
    id: 'vendor-share-candidates',
    category: 'vendors',
    audiences: ['vendor'],
    pageContexts: ['register-employer', 'dashboard-employer'],
    keywords: ['share candidates', 'data ownership', 'platform fee', 'commission'],
    question: "Do I need to share my candidates' contact details with Hire Adda?",
    answer:
      'No — Vendor Connect is a lead-gen + listing service, not a candidate-data marketplace. Your candidate database stays yours. Once a company sends you a lead, you contact them off-platform (email, phone, your CRM) and place candidates from your own pool. Hire Adda does not take a placement fee or commission from successful hires you make through us.',
  },
  {
    id: 'vendor-rating',
    category: 'vendors',
    audiences: ['vendor'],
    pageContexts: ['dashboard-employer'],
    keywords: ['rating', 'review', 'feedback', 'reputation'],
    question: 'Are vendors rated by clients?',
    answer:
      'Yes — after a lead concludes (hire successful, role cancelled, or 90 days elapsed), the company can leave a private 1-5 rating + optional written feedback. Your average rating + total reviews appear on your public profile after you have 5+ ratings (to avoid noisy single-review averages). Below-3-star ratings give you a private explanation; you can dispute factually wrong reviews via support.',
  },

  // ===========================================================
  // Billing & Payments
  // ===========================================================
  {
    id: 'billing-gst',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['pricing', 'pricing-employer', 'pricing-candidate', 'pricing-detail'],
    keywords: ['gst', 'tax', 'invoice', 'inclusive', 'hsn'],
    question: 'Is GST included in the price?',
    answer:
      'Yes — all plans listed are inclusive of 18% GST. A tax invoice with HSN code 998314 is generated automatically after payment and emailed to you. Invoices are also available anytime from Billing → Invoices and can be downloaded as PDF. For B2B GSTIN claims, add your company GSTIN in Billing → Tax Details before checkout — it appears on every subsequent invoice.',
  },
  {
    id: 'billing-payment-methods',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['pricing', 'pricing-employer', 'pricing-candidate', 'pricing-detail'],
    keywords: ['upi', 'card', 'netbanking', 'wallet', 'emi', 'how to pay'],
    question: 'What payment methods do you accept?',
    answer:
      'UPI (Google Pay / PhonePe / Paytm / BHIM / any UPI app), all major credit and debit cards (Visa, Mastercard, RuPay, Amex), netbanking from 50+ Indian banks, mobile wallets (Paytm, MobiKwik, Freecharge), and EMI on cards above ₹3,000. International cards work for non-INR currencies (auto-FX). Payments are processed by Razorpay — we do not store card details.',
  },
  {
    id: 'billing-cancel-refund',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['pricing', 'pricing-employer', 'pricing-candidate', 'pricing-detail'],
    keywords: ['refund', 'cancellation', 'money back', 'return policy'],
    question: 'Can I cancel a plan after purchase and get a refund?',
    answer:
      'You can request a refund within 2 days of purchase if you have not consumed any quota (no CV unlocks, no job posts on paid plans, no Assisted Hiring calls scheduled). After 2 days or after consumption, plans are non-refundable but you can cancel auto-renew anytime to stop future charges and continue using the plan till validity expires. See Refund Policy for full terms.',
  },
  {
    id: 'billing-recurring',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['pricing', 'pricing-detail'],
    keywords: ['auto-renew', 'recurring', 'mandate', 'autopay', 'subscription'],
    question: 'Do you support recurring payments?',
    answer:
      'Yes — Vendor Connect (₹199/month) is auto-renewed monthly via Razorpay eMandate (cards) or UPI AutoPay (UPI). Other plans support optional auto-renew on the same window. You can cancel auto-renew anytime from Billing → Subscriptions; cancellation stops future charges immediately and your access continues till the current cycle ends.',
  },
  {
    id: 'billing-upgrade-mid-cycle',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['pricing', 'pricing-employer', 'pricing-detail'],
    keywords: ['upgrade plan', 'change plan', 'pro-rata', 'mid-cycle', 'switch'],
    question: 'How do upgrades work mid-cycle?',
    answer:
      "We compute pro-rated credits from your current plan based on remaining validity and unused quota, then deduct them from the new plan price — you only pay the difference. Unused CV unlocks carry forward to the new plan (up to a cap defined per plan). Job posts in flight continue on their original validity; new posts use the upgraded plan's settings. Upgrades activate instantly; refunds for downgrades are not supported.",
  },
  {
    id: 'billing-quote-enterprise',
    category: 'billing-payments',
    audiences: ['employer'],
    pageContexts: ['pricing-employer', 'pricing-detail'],
    keywords: ['enterprise', 'custom quote', 'sales', 'contact sales', 'volume'],
    question: 'How do I get a custom quote for CV Enterprise?',
    answer:
      'Click "Contact Sales" on the CV Enterprise card or visit /billing/quote. Fill in your team size, expected CV unlock volume, and any compliance requirements (DPDP, custom MSA, on-prem deployment). Our sales team responds within 1 business day with a tailored proposal. Custom plans typically include unlimited search results, multi-seat sharing, bulk CV download, dedicated CSM, and SLA-backed dedicated support.',
  },
  {
    id: 'billing-currency-fx',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['pricing', 'pricing-detail'],
    keywords: ['usd', 'eur', 'foreign currency', 'fx', 'international'],
    question: 'Can I pay in a currency other than INR?',
    answer:
      "Yes — international cards are auto-converted via Razorpay's FX engine. The page shows INR pricing by default; on checkout you can switch the displayed currency (USD / EUR / GBP / SGD / AED) for visualisation, but the charge to your card is always in INR with the bank's standard FX rate applied. GST applies only to Indian customers; international invoices are zero-GST.",
  },
  {
    id: 'billing-failed-payment',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['dashboard-employer'],
    keywords: ['payment failed', 'declined', 'retry', 'card error'],
    question: 'My payment failed — what happens next?',
    answer:
      'For one-time plans, you can retry immediately from Billing → Orders → "Resume Payment" (link valid 24 hours). For auto-renewed subscriptions, we automatically retry up to 4 times over 7 days; you receive an email after each failed attempt with a retry link. After 4 failures the subscription enters grace mode (3 more days of access) and finally lapses. Update your payment method anytime to resume.',
  },
  {
    id: 'billing-invoice-gstin',
    category: 'billing-payments',
    audiences: ['employer'],
    pageContexts: ['dashboard-employer', 'pricing-employer'],
    keywords: ['gstin', 'company gst', 'b2b invoice', 'input tax credit'],
    question: 'Can I add my company GSTIN to invoices for input tax credit?',
    answer:
      'Yes — Billing → Tax Details → enter your 15-digit GSTIN before checkout. Past invoices can be reissued with the GSTIN by contacting support@hireadda.in within 30 days of the invoice date. Once reissued the original invoice is voided in our records and the new invoice (same number, GSTIN added) is sent. Standard ITC rules apply — consult your CA for eligibility.',
  },
  {
    id: 'billing-promo-coupon',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['pricing', 'pricing-employer', 'pricing-candidate', 'pricing-detail'],
    keywords: ['coupon', 'promo code', 'discount', 'voucher', 'offer'],
    question: 'How do I apply a promo / coupon code?',
    answer:
      'On the checkout page, click "Have a coupon code?" and enter the code. We validate it against the plan and your account (some codes are first-time-only or audience-specific) and show the discounted total before payment. Codes from referrals or partner offers auto-apply when you click their link. You can stack a coupon with carry-forward credits but not with another coupon.',
  },
  {
    id: 'billing-tax-invoice-download',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['dashboard-employer', 'dashboard-candidate'],
    keywords: ['download invoice', 'tax invoice', 'pdf invoice', 'invoice pdf'],
    question: 'How do I download a tax invoice?',
    answer:
      'Open Billing → Invoices → click any invoice → "Download PDF". Invoices are GST-compliant, include HSN code 998314, your billing address (and GSTIN if added), and a unique invoice number for your records. The same invoice is also auto-emailed at the time of payment. PDFs are signed digitally so they\'re tamper-evident and acceptable as proof for accounting.',
  },
  {
    id: 'billing-payment-history',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['dashboard-employer', 'dashboard-candidate'],
    keywords: ['payment history', 'transactions', 'past purchases', 'order history'],
    question: 'Where can I see my payment history?',
    answer:
      'Billing → Orders shows every transaction (paid / failed / refunded) with timestamp, amount, plan, payment method, and a link to the invoice + the ledger entry. You can filter by status, date range, or plan. Refunds appear as separate negative-amount entries linked back to the original order. Export the full history as CSV from the same page for accounting reconciliation.',
  },
  {
    id: 'billing-receipt-vs-invoice',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['dashboard-employer', 'dashboard-candidate'],
    keywords: ['receipt', 'invoice', 'difference', 'gst invoice', 'tax document'],
    question: "What's the difference between a receipt and a tax invoice?",
    answer:
      'A receipt confirms payment was received (issued by Razorpay immediately on success). A tax invoice is a GST-compliant document showing the sale for tax purposes — required for input tax credit claims and accounting. Hire Adda generates BOTH for every paid order: the receipt is in the Razorpay confirmation email, the tax invoice is generated server-side and emailed within minutes + always available in Billing → Invoices.',
  },
  {
    id: 'billing-checkout-time',
    category: 'billing-payments',
    audiences: ['all'],
    pageContexts: ['pricing', 'pricing-detail'],
    keywords: ['checkout slow', 'payment loading', 'razorpay slow', 'stuck'],
    question: 'Why does checkout take long sometimes?',
    answer:
      'Checkout creates a Razorpay order, runs a fraud check against your account history (new accounts get extra scrutiny), and reserves entitlement quota — usually <2 seconds. If it takes longer, the bank or UPI app may be slow on the redirect. If checkout is stuck >30 seconds, refresh the page (your order is preserved) and click "Resume payment" from Billing → Orders. Recurring failures may indicate a bank flag — try a different payment method or contact your bank.',
  },
];
