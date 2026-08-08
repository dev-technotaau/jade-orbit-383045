import type { FaqEntry } from './types';
import { FAQS_EN } from './faqs.en';

/**
 * Bengali translations covering the full FAQ corpus. Untranslated entries
 * (if any) fall back to English at runtime.
 */
const BN_TRANSLATIONS: Record<string, { question: string; answer: string }> = {
  'create-account': {
    question: 'Hire Adda-তে কীভাবে অ্যাকাউন্ট তৈরি করব?',
    answer:
      'অ্যাকাউন্ট তৈরি করা সহজ এবং বিনামূল্যে। হোমপেজে "Get Started" বা "Sign Up" বোতামে ক্লিক করুন। আপনি আপনার ইমেল এবং পাসওয়ার্ড ব্যবহার করে নিবন্ধন করতে পারেন, অথবা Google/LinkedIn দিয়ে দ্রুত সাইন আপ করতে পারেন। নিবন্ধনের পরে, আপনার দক্ষতা, অভিজ্ঞতা এবং চাকরির পছন্দগুলির সাথে আপনার প্রোফাইল সম্পূর্ণ করার নির্দেশ দেওয়া হবে।',
  },
  'forgot-password': {
    question: 'আমার পাসওয়ার্ড কীভাবে রিসেট করব?',
    answer:
      'যদি আপনি আপনার পাসওয়ার্ড ভুলে যান, লগইন পেজে "Forgot Password" ক্লিক করুন। আপনার অ্যাকাউন্টের সাথে যুক্ত ইমেল ঠিকানা লিখুন, এবং আমরা আপনাকে একটি পাসওয়ার্ড রিসেট লিঙ্ক পাঠাব। লিঙ্কটি 1 ঘন্টার জন্য বৈধ। নতুন পাসওয়ার্ড সেট করতে এটিতে ক্লিক করুন। যদি ইমেল না পান, স্প্যাম ফোল্ডার চেক করুন বা সাহায্যের জন্য আমাদের সাপোর্ট টিমের সাথে যোগাযোগ করুন।',
  },
  'delete-account': {
    question: 'আমি কীভাবে আমার অ্যাকাউন্ট মুছে ফেলব?',
    answer:
      'অ্যাকাউন্ট মুছে ফেলতে Settings → "Danger Zone" → "Delete Account" এ যান এবং নিশ্চিত করুন। দ্রষ্টব্য: অ্যাকাউন্ট মুছে ফেলা স্থায়ী — আপনার সমস্ত ডেটা (applications, সংরক্ষিত jobs, বার্তা) 30 দিনের মধ্যে সম্পূর্ণ মুছে ফেলা হবে।',
  },
  'contact-support': {
    question: 'কাস্টমার সাপোর্টের সাথে কীভাবে যোগাযোগ করব?',
    answer:
      'আপনি একাধিক চ্যানেলের মাধ্যমে আমাদের সাপোর্ট টিমের সাথে যোগাযোগ করতে পারেন। support@hireadda.in-এ ইমেল করুন, +91 1762469136 (সোম-শুক্র, সকাল 9 - সন্ধ্যা 6 IST) এ আমাদের টোল-ফ্রি নম্বরে কল করুন, বা সরাসরি বার্তা পাঠাতে আমাদের Contact পৃষ্ঠা দেখুন। লগইন করা ব্যবহারকারীদের জন্য আমরা ইন-অ্যাপ চ্যাট সাপোর্টও অফার করি। আমাদের টিম সাধারণত 24 ঘন্টার মধ্যে প্রতিক্রিয়া জানায়।',
  },
  'mobile-app': {
    question: 'Hire Adda mobile app আছে কি?',
    answer:
      'আমরা Android এবং iOS উভয়ের জন্য native apps তৈরি করছি — Q3 2026-এ লঞ্চ করার আশা করা হচ্ছে। এই সময়ে, আমাদের ওয়েবসাইট সম্পূর্ণরূপে mobile-responsive এবং mobile browsers-এ চমৎকারভাবে কাজ করে। App-এর মতো অভিজ্ঞতার জন্য "Add to Home Screen" ব্যবহার করুন। Browser push notifications-ও সমর্থিত।',
  },
  'languages-supported': {
    question: 'Hire Adda কোন ভাষাগুলি সমর্থন করে?',
    answer:
      'Hire Adda বর্তমানে ইংরেজিতে সম্পূর্ণরূপে উপলব্ধ। হিন্দি, তামিল, তেলুগু, বাংলা এবং মারাঠি UI অনুবাদ 2026-এ আসছে। Job descriptions, applications এবং search যেকোনো ভাষায় কাজ করে — আমাদের matching engine সমস্ত প্রধান ভারতীয় ভাষার queries বোঝে। আপনার পছন্দের ভাষায় FAQs পড়তে help center-এ language picker ব্যবহার করুন।',
  },
  'who-is-it-for': {
    question: 'Hire Adda কাদের জন্য তৈরি?',
    answer:
      'Hire Adda তিনটি audience-কে end-to-end পরিষেবা দেয় — (1) চাকরি প্রার্থী (নবীন থেকে senior leaders পর্যন্ত, প্রতিটি industry-তে), (2) employers এবং recruitment teams (প্রথম role post করা startup থেকে শত শত openings পরিচালনা করা enterprises পর্যন্ত), এবং (3) clients-এর পক্ষে candidates source করা recruitment-vendor agencies। প্রতিটি audience-এর জন্য dedicated dashboard, plan family এবং সাপোর্ট flow আছে।',
  },
  'about-hire-adda': {
    question: 'Hire Adda কি?',
    answer:
      'Hire Adda একটি India-first hiring platform — যা চাকরি প্রার্থী, employers এবং recruitment vendors-কে এক stack-এ একত্রিত করে। আমরা ঐতিহ্যবাহী job-posting-কে searchable CV database, AI-powered job matching, assisted hiring (আমাদের টিম আপনার জন্য CVs source করে), এবং vendor marketplace-এর সাথে একত্রিত করি — সবগুলি INR-এ, GST-compliant, এবং ভারতীয় hiring market-এর জন্য নির্মিত।',
  },
  'regions-served': {
    question: 'Hire Adda কোন অঞ্চল এবং শহরগুলিতে পরিষেবা দেয়?',
    answer:
      'Hire Adda সর্ব-ভারত — প্রতিটি রাজ্য এবং কেন্দ্রশাসিত অঞ্চলে jobs এবং candidates তালিকাভুক্ত। আমাদের metros-এ (বেঙ্গালুরু, মুম্বাই, দিল্লি-NCR, হায়দ্রাবাদ, পুনে, চেন্নাই, কলকাতা, আহমেদাবাদ) বিশেষ শক্তিশালী coverage আছে, tier-2 এবং tier-3 শহরগুলিতে দ্রুত বৃদ্ধি পাচ্ছে। Remote এবং hybrid jobs সীমান্ত পেরিয়ে কাজ করে।',
  },
  'safety-trust': {
    question: 'Jobs এবং candidates আসল কিনা কীভাবে নিশ্চিত করেন?',
    answer:
      'প্রতিটি employer post করার আগে company verification (GST + PAN + domain email proof) এর মাধ্যমে যান। Job posts content moderation-এর মাধ্যমে scammy patterns ("apply করতে pay", "MLM", impossible salaries) flag হয়। Candidate profiles email + mobile OTP verification পায়, এবং আমরা optional employer/education/experience verification badges অফার করি। সন্দেহজনক activity Trust & Safety team দ্বারা 24 ঘন্টার মধ্যে review করা হয়।',
  },
  'report-fraudulent': {
    question: 'সন্দেহজনক বা প্রতারণামূলক job posting কীভাবে report করব?',
    answer:
      'যদি আপনি একটি job listing দেখেন যা প্রতারণামূলক, বিভ্রান্তিকর, বা সন্দেহজনক মনে হয়, job detail page-এ "Report" বোতাম ক্লিক করুন। কারণ নির্বাচন করুন এবং কোন অতিরিক্ত বিবরণ সরবরাহ করুন। আমাদের moderation team সমস্ত reports 24-48 ঘন্টার মধ্যে review করে। জরুরী উদ্বেগের জন্য safety@hireadda.in-এ সরাসরি reports পাঠাতেও পারেন। যাচাইকৃত scams-এর ফলে immediate takedown এবং employer-এর জন্য account suspension হয়।',
  },
  'platform-stats': {
    question: 'Hire Adda-তে কতগুলি jobs এবং companies আছে?',
    answer:
      'Live numbers homepage এবং /about page-এ update হয়। Q2 2026 পর্যন্ত: 50,000+ candidates, 5,000+ verified employers, 200+ শহরে 12,000+ open roles, এবং directory-তে 800+ recruitment vendors। Weekly application volume লক্ষ লক্ষে। Blog-এর মাধ্যমে quarterly aggregate platform analytics share করি।',
  },
  'two-factor-auth': {
    question: 'Two-Factor Authentication (2FA) কীভাবে enable করব?',
    answer:
      'Settings → Security → Two-Factor Authentication খুলুন। যেকোনো authenticator app (Google Authenticator, Authy, 1Password) দিয়ে QR code scan করুন এবং 6-digit code লিখুন। Backup codes-ও generate করব — device হারিয়ে গেলে নিরাপদ স্থানে সংরক্ষণ করুন। Password-less sign-in-এর জন্য passkey (Face ID, Touch ID) register করতে পারেন।',
  },
  'trust-device': {
    question: '"Trust this device for 30 days" option কী করে?',
    answer:
      'সফল 2FA verification-এর পরে এই option বেছে নিলে, current browser-এ একটি secure cookie set হয়। একই browser থেকে 30 দিনের মধ্যে subsequent sign-ins 2FA prompt skip করে। Trust cookie শুধুমাত্র সেই browser-এ bound — একটি ভিন্ন device, incognito window, বা একটি নতুন browser থেকে sign in 2FA প্রয়োজন হবে। Settings → Security থেকে যেকোনো সময় trusted devices revoke করতে পারেন।',
  },
  'sessions-revoke': {
    question: 'Active sessions কীভাবে দেখব এবং revoke করব?',
    answer:
      'Settings → Security → Active Sessions আপনার অ্যাকাউন্টে signed in প্রতিটি device এবং browser-কে IP, location (city-level), এবং last-active timestamp সহ তালিকাভুক্ত করে। যেকোনো session-এর পাশে "Revoke" ক্লিক করে সেই device-কে অবিলম্বে sign out করুন, বা "Revoke all other sessions" দিয়ে শুধুমাত্র current browser-কে signed in রাখুন। Lost-phone scenarios এখানে handle করা হয়।',
  },
  'lost-mfa-device': {
    question: 'আমার authenticator device হারিয়ে গেছে — কীভাবে অ্যাকাউন্ট recover করব?',
    answer:
      '2FA prompt-এ "Can\'t access authenticator?" → "Send Recovery Code" ক্লিক করুন। আমরা আপনার অ্যাকাউন্ট email-এ একটি 6-digit code পাঠাব। এটি লিখলে আপনার অ্যাকাউন্টে 2FA disable হয় এবং আপনি sign in করতে পারেন। অবিলম্বে 2FA পুনরায় enable করুন। আপনি প্রথমে 2FA enable করার সময় সংরক্ষিত backup codes-গুলির একটিও ব্যবহার করতে পারেন — প্রতিটি backup code একবার এবং শুধুমাত্র একবার কাজ করে।',
  },
  'data-privacy': {
    question: 'Hire Adda আমার ব্যক্তিগত ডেটা কীভাবে রক্ষা করে?',
    answer:
      'আমরা ভারতের Digital Personal Data Protection (DPDP) Act-এর সাথে compliant এবং OWASP Top 10 best practices অনুসরণ করি। Data transit (TLS 1.3) এবং rest উভয়ে encrypted। Sensitive fields (mobile numbers, salaries, contact details) public APIs-এ কখনই ফেরত দেওয়া হয় না এবং employers-দের দেখার জন্য specific entitlements (e.g. CV unlock) প্রয়োজন। Settings থেকে আপনার ডেটা যেকোনো সময় export বা delete করতে পারেন।',
  },
  'email-change': {
    question: 'আমার email address কীভাবে পরিবর্তন করব?',
    answer:
      'Settings → Account → Email → "Change" খুলুন। নতুন email এবং আপনার current password লিখুন। আমরা নতুন email-এ একটি verification link পাঠাই — এটিতে ক্লিক করলে আপনার অ্যাকাউন্ট email switch হয় এবং পুরানো email-এ একটি confirmation পাঠানো হয়। পুরানো email recovery channel হিসাবে 7 দিনের জন্য কাজ করে। যদি আপনি পুরানো email-এর access হারান, identity proof সহ support@hireadda.in-এ যোগাযোগ করুন।',
  },
  'password-strength': {
    question: 'Password requirements কী?',
    answer:
      'Passwords কমপক্ষে একটি uppercase letter, একটি lowercase letter, একটি number, এবং একটি special character সহ 8+ characters হতে হবে। আমরা 10,000 সবচেয়ে সাধারণ breached passwords block করি (HaveIBeenPwned-এর public list-এর সাথে match)। Registration form-এ strength meter real time-এ entropy দেখায় — "Strong" বা "Very Strong" লক্ষ্য রাখুন। সর্বাধিক security-র জন্য, sign-up-এর পরে 2FA enable করুন এবং password-less login-এর জন্য একটি passkey register করার কথা বিবেচনা করুন।',
  },
  'multiple-accounts': {
    question: 'আমি কি আলাদা candidate এবং employer accounts রাখতে পারি?',
    answer:
      'হ্যাঁ — accounts role-locked, তাই একটি email একটি role ধারণ করতে পারে। Candidate এবং employer features উভয় ব্যবহার করতে, একটি ভিন্ন email দিয়ে দ্বিতীয় account register করুন। অনেক ছোট-ব্যবসায়িক মালিক এটি করেন: job applications-এর জন্য তাদের personal email + hiring-এর জন্য তাদের company email। Multi-seat employer plans (CV Enterprise) সহ team-member invites-ও কাজ করে।',
  },
  'export-data': {
    question: 'আমার ডেটা কীভাবে export করব?',
    answer:
      'Settings → Privacy → "Export my data" আপনার profile, applications, messages, এবং audit log JSON + PDF হিসাবে সম্বলিত একটি ZIP generate করে। Generation কয়েক মিনিট সময় নেয়; আমরা একটি 24 ঘন্টা valid download link email করি। অপব্যবহার রোধ করতে exports প্রতি 7 দিনে একটিতে rate-limited। এটি DPDP Act-এর data portability right সন্তুষ্ট করে।',
  },
  'account-suspended': {
    question: 'আমার অ্যাকাউন্ট suspend করা হয়েছে — কীভাবে appeal করব?',
    answer:
      'Suspensions সাধারণত repeated content violations, প্রতারণামূলক activity, বা chargebacks-এর জন্য ঘটে। Login page reason এবং একটি "Submit an appeal" link প্রদর্শন করবে। Appeals 3-5 business days-এর মধ্যে একটি ভিন্ন moderator দ্বারা review করা হয়। যদি আপনার অ্যাকাউন্ট ভুলভাবে suspend করা হয়, আপনাকে reinstate করা হবে এবং consumed quota restore করা হবে। গুরুতর violations (fake jobs, scam operations) appeal-এর জন্য eligible নয়।',
  },
  'candidate-apply-job': {
    question: 'প্ল্যাটফর্মে চাকরির জন্য কীভাবে আবেদন করব?',
    answer:
      'একবার আপনি আপনার প্রোফাইল তৈরি করার পরে, সার্চ বার ব্যবহার করে চাকরি ব্রাউজ করুন বা আপনার ড্যাশবোর্ডে কিউরেটেড তালিকাগুলি অন্বেষণ করুন। যখন আপনি একটি চাকরি খুঁজে পান যা আপনি আগ্রহী, চাকরির বিবরণ পৃষ্ঠায় "Apply" বোতামে ক্লিক করুন। আপনার প্রোফাইল এবং রেজুমে নিয়োগকর্তার সাথে শেয়ার করা হবে। আপনি আপনার সংরক্ষিত প্রোফাইল ব্যবহার করে একটি ক্লিকে একাধিক পদে আবেদন করতে "Quick Apply" সক্ষম করতে পারেন।',
  },
  'candidate-update-profile': {
    question: 'আমার profile information কীভাবে update করব?',
    answer:
      'আপনার অ্যাকাউন্টে log in করুন এবং dashboard থেকে profile page-এ navigate করুন। আপনি যেকোনো সময় আপনার personal information, work experience, education, skills, এবং preferences edit করতে পারেন। পরিবর্তন করতে "Edit Profile" ক্লিক করুন এবং সম্পন্ন হলে save করতে মনে রাখবেন। আপনার profile updated রাখা আমাদের matching engine-কে আপনার জন্য আরও ভাল opportunities খুঁজে পেতে সাহায্য করে।',
  },
  'candidate-resume-upload': {
    question: 'আমি কোন resume formats upload করতে পারি?',
    answer:
      'আপনার CV PDF বা DOCX (10 MB max) হিসাবে upload করুন। আমাদের Document AI parser আপনার work history, education, এবং skills automatically extract করে — saving-এর আগে suggested fields review করুন। আপনি profile-এ একাধিক resume versions রাখতে পারেন এবং প্রতিটি application-এর সাথে কোনটি attach করবেন তা বেছে নিতে পারেন। Tip: clear section headings সহ একটি structured PDF সবচেয়ে accurately parse হয়।',
  },
  'candidate-premium-benefits': {
    question: 'Candidate Premium (₹199) এ কী অন্তর্ভুক্ত আছে?',
    answer:
      'Candidate Premium ₹199 (এককালীন) পাঁচটি কংক্রিট সুবিধা দেয়: AI Resume Premium (অটো-ফরম্যাটিং সহ 4টি পেইড টেমপ্লেট), আপনার প্রোফাইলে Verified Badge, 7 দিনের Profile Boost (recruiter searches-এ শীর্ষ), Priority WhatsApp সাপোর্ট, এবং আপনার দক্ষতা সম্পর্কিত candidate searches-এ Top Visibility র‍্যাঙ্কিং। প্ল্যানটি 30 দিনের জন্য বৈধ।',
  },
  'candidate-applications-track': {
    question: 'আমার applications কীভাবে track করব?',
    answer:
      'Dashboard → Applications খুলুন। প্রতিটি row role, company, current status (Applied / Reviewed / Shortlisted / Interview / Hired / Rejected), এবং latest update timestamp দেখায়। যেকোনো application-এ click করলে full timeline দেখায় যা employer-side notes (যখন shared) এবং আপনি submit করা যেকোনো screening-question answers অন্তর্ভুক্ত করে। আমরা প্রতিটি status change-এ email + push notifications পাঠাই।',
  },
  'candidate-profile-visibility': {
    question: 'আমি কি আমার current employer থেকে আমার profile লুকাতে পারি?',
    answer:
      'হ্যাঁ — Settings → Privacy → "Hide profile from selected employers" আপনাকে specific company accounts (এবং সেই company\'s domain থেকে যেকোনো user) কে CV-database searches-এ আপনার profile দেখা থেকে block করতে দেয়। "Make profile private" দিয়ে আপনি profile-কে সম্পূর্ণরূপে লুকাতে পারেন — এটি শুধুমাত্র আপনি actively apply করা jobs-এ প্রদর্শিত হবে। সেই employer-এর সাথে আপনার application history প্রভাবিত হয় না।',
  },
  'candidate-job-alerts': {
    question: 'Job alerts কীভাবে কাজ করে?',
    answer:
      'Jobs page-এ run করা যেকোনো search-কে Job Alert হিসাবে save করুন — আমরা নতুন matching roles আপনাকে daily, weekly, বা instantly (আপনি চয়ন করুন) email করব। Alerts আপনার filters-কে ঠিক respect করে: skills, location, experience, work mode, salary range। Dashboard → Job Alerts থেকে যেকোনো সময় pause/manage করুন। যদি আপনি 30 দিনে কোন alert click না করেন তবে alerts স্বয়ংক্রিয়ভাবে বন্ধ হয়।',
  },
  'candidate-recommendations': {
    question: 'Job recommendations কীভাবে generate করা হয়?',
    answer:
      'Recommendations তিনটি signals একত্রিত করে: (1) আপনার profile এবং job-এর required skills-এর মধ্যে skills overlap (recency-weighted), (2) Google Cloud Talent-এর AI matching, (3) আপনার historical interaction (applies, saves, dismissals) থেকে আপনার preferences শিখা। Recommendations প্রতি 4 ঘন্টায় refresh হয় — আপনি Recommendations page থেকে manually-ও refresh করতে পারেন।',
  },
  'candidate-interview-prep': {
    question: 'Hire Adda কি interview preparation-এ সাহায্য করে?',
    answer:
      'যখন একজন employer Hire Adda-র মাধ্যমে একটি interview schedule করেন, application detail page একটি tailored prep panel দেখায়: employer ঐতিহাসিকভাবে যে top skills সম্পর্কে জিজ্ঞাসা করেছেন, তাদের successful hires-দের গড় preparation time, এবং নিয়ে আসার artefacts-এর checklist (resume, ID, certificates)। আমরা role + city-এর জন্য salary-range data-ও দেখাই যদি কমপক্ষে 3 hires complete হয়।',
  },
  'candidate-resume-templates': {
    question: 'Candidate Premium কোন resume templates অন্তর্ভুক্ত করে?',
    answer:
      'Premium 4টি paid templates unlock করে free default-এর বাইরে: Modern Minimal (clean two-column), Executive Classic (single-column traditional), Creative Bold (design / marketing roles-এর জন্য colour accents), এবং ATS Pro (applicant-tracking-system parsing-এর জন্য optimised)। প্রতিটি template আপনার existing profile data auto-format করে — কোন re-typing নেই। আপনি কেনার আগে সমস্ত 5 (1 free + 4 premium) preview করতে পারেন; non-premium users paid previews-এ একটি watermark দেখেন।',
  },
  'candidate-saved-jobs': {
    question: 'Saved jobs কীভাবে কাজ করে?',
    answer:
      'পরে save করতে যেকোনো job-এ bookmark icon click করুন। Saved jobs Dashboard → Saved Jobs-এ প্রদর্শিত হয়। Saving private — employers কে save করেছে দেখতে পায় না। Filled বা expire হওয়া saved jobs auto-archived হয় কিন্তু "আর applications গ্রহণ করছে না" note সহ আপনার list-এ visible থাকে। আপনি কতগুলি jobs save করতে পারেন তার কোন সীমা নেই।',
  },
  'candidate-apply-without-account': {
    question: 'অ্যাকাউন্ট তৈরি না করে কি apply করতে পারি?',
    answer:
      'না — applications-এর জন্য একটি অ্যাকাউন্ট প্রয়োজন যাতে আমরা আপনার application + resume employer-এর কাছে নির্ভরযোগ্যভাবে deliver করতে পারি, follow-ups সমর্থন করতে পারি, এবং আপনাকে status track করতে দিতে পারি। Account creation বিনামূল্যে এবং ~60 সেকেন্ড সময় নেয়। Registering আপনাকে job save করতে, similar roles-এর জন্য alerts set up করতে, এবং ভবিষ্যতে single click-এ apply করতে দেয়।',
  },
  'candidate-mock-interview': {
    question: 'Hire Adda কি mock interviews অফার করে?',
    answer:
      'AI-powered mock interviews নির্বাচিত roles (software engineering, sales, customer support)-এর জন্য beta-তে আছে। System role-specific questions জিজ্ঞাসা করে, আপনার audio response record করে, এবং answer structure, filler words, এবং mention করা key skills-এ feedback দেয়। Premium candidates-এর জন্য বিনামূল্যে available, প্রতি মাসে 3 mock sessions-এ capped। যখন আপনার role scope-এ থাকে তখন Dashboard → Mock Interview থেকে open করুন।',
  },
  'candidate-salary-research': {
    question: 'Apply করার আগে salaries research করতে পারি?',
    answer:
      'হ্যাঁ — প্রতিটি job listing employer-disclosed salary range দেখায় যখন set। Undisclosed roles-এর জন্য, listing এখনও similar hires (role + location + experience) থেকে derived একটি estimated range দেখায় যখন আমাদের ≥10 data points আছে। Dashboard → Salary Insights-এ Salary Insights broader market data দেয়: role, city, এবং years of experience দ্বারা median + range, এবং আপনি profile-এ পূরণ করলে current/expected CTC-এর তুলনা।',
  },
  'candidate-fake-job-detection': {
    question: 'Candidates-দের fake jobs থেকে কীভাবে রক্ষা করেন?',
    answer:
      'তিনটি layers: (1) প্রতিটি employer post করার আগে verified (GST + PAN + domain email); (2) job posts automated moderation-এর মাধ্যমে যা scammy patterns ("apply করতে pay", "registration fee", "investment opportunity") block করে; (3) প্রতিটি job-এ in-app Trust Score (0-5 stars) employer-এর past hires + verifications + report rate factor করে। 3 stars-এর নিচে scoring jobs এড়িয়ে চলুন এবং upfront money চাওয়া যেকোনো role report করুন।',
  },
  'candidate-skill-test': {
    question: 'Hire Adda-তে কি skill assessments আছে?',
    answer:
      'হ্যাঁ — employers jobs-এ skill assessments attach করতে পারেন (multiple-choice, coding, video answers)। আপনি apply form-এ assessment requirement দেখেন এবং তখনই বা পরে (apply করার 48 ঘন্টার মধ্যে) নিতে পারেন। Scores আপনার এবং employer উভয়ের কাছে visible। আমরা top in-demand skills (JavaScript, Python, English communication, Excel)-এর জন্য আপনার profile-এ self-administered skill tests-ও support করি — passing একটি verified badge যোগ করে যা recruiter visibility উন্নত করে।',
  },
  'employer-post-job': {
    question: 'নিয়োগকর্তা হিসাবে কীভাবে চাকরি পোস্ট করব?',
    answer:
      'নিয়োগকর্তা হিসাবে নিবন্ধন করুন এবং কোম্পানির নাম, বিবরণ, শিল্প এবং অবস্থানের মতো বিবরণ দিয়ে আপনার কোম্পানি প্রোফাইল সম্পূর্ণ করুন। যাচাই হয়ে গেলে, আপনার Employer Dashboard-এ যান এবং "Post a Job" ক্লিক করুন। চাকরির শিরোনাম, বিবরণ, প্রয়োজনীয় দক্ষতা, বেতনের পরিসর এবং অন্যান্য বিবরণ পূরণ করুন। গুণমান নিশ্চিত করতে একটি সংক্ষিপ্ত মডারেশন পর্যালোচনার পরে আপনার তালিকা লাইভ হয়ে যাবে।',
  },
  'employer-free-plan': {
    question: 'Free Job Post প্ল্যান (₹0) এ কী আছে?',
    answer:
      'Free প্ল্যান আপনাকে 7 দিনের জন্য 1টি চাকরি পোস্ট লাইভ দেয়, সর্বোচ্চ 50টি আবেদন সহ, 1টি অবস্থান, বেসিক candidate dashboard অ্যাক্সেস এবং standard listing visibility। আপনি যখন employer onboarding সম্পন্ন করেন তখন এটি স্বয়ংক্রিয়ভাবে দেওয়া হয় — কোনো কার্ড প্রয়োজন নেই। নবায়ন পেইড; বৈধতা বাড়াতে, অ্যাপ্লিকেশন ক্যাপ বাড়াতে এবং CV-database অ্যাক্সেস যোগ করতে যেকোনো সময় Standard (₹499) বা Premium (₹999) এ আপগ্রেড করুন।',
  },
  'employer-cv-database': {
    question: 'CV Database (Talent Vault) কী এবং কীভাবে কাজ করে?',
    answer:
      'CV Database প্রতিটি candidate profile-এর searchable index। Skills, location, experience, salary, last-active, education ইত্যাদি দ্বারা filter করুন। প্রতিটি plan একটি নির্দিষ্ট সংখ্যক "CV unlocks" দেয় — একটি candidate-এর contact details (email + phone) দেখা আপনার quota থেকে একটি unlock consume করে। Search বিনামূল্যে; শুধুমাত্র contact info reveal করা একটি unlock খরচ করে। CV Lite = 200 unlocks, CV Pro = 500, CV Enterprise = 1000+ (custom)।',
  },
  'employer-applications-cap': {
    question: 'আমার job-এর applications cap পৌঁছালে কী হয়?',
    answer:
      'New applications block হয় — candidates-দের একটি "Job is full" message দেখানো হয়। আপনি এখনও সমস্ত received applications দেখেন এবং স্বাভাবিক হিসাবে shortlist করতে পারেন। Free = 50, Standard = 250, Premium = unlimited। Mid-cycle upgrading সেই listing-এর জন্য cap অবিলম্বে remove করে। Cap per-job (account-wide নয়) এবং আপনি role re-post করলে resets হয়।',
  },
  'employer-team-multi-seat': {
    question: 'আমার company থেকে multiple recruiters একটি account share করতে পারে?',
    answer:
      'হ্যাঁ — Dashboard → Team থেকে teammates invite করুন। CV Enterprise plans multi-seat sharing অন্তর্ভুক্ত করে: invitees RECRUITER বা ADMIN team members হন এবং company-র shared CV-unlock + search-result quota pool থেকে consume করেন। Lower-tier plans (Standard, Premium, CV Lite, CV Pro) single-seat only। Owner যেকোনো সময় ownership transfer করতে পারেন বা seats revoke করতে পারেন।',
  },
  'employer-assisted-hiring': {
    question: 'Assisted Hiring (₹1499) কীভাবে কাজ করে?',
    answer:
      '₹1499 pay → আমাদের specialist এক business day-এর মধ্যে আপনাকে call করে role scope করতে → আমরা 4-5 matching CVs source করি এবং 7 দিনের মধ্যে আপনাকে email করি। আপনি নিজে candidates-দের contact এবং interview করেন; আমরা matching legwork করি। প্রতিটি plan একটি job role cover করে। Dashboard → Assisted Hiring-এ Pending → Call Scheduled → Sourcing → Delivered status updates সহ progress track করুন।',
  },
  'employer-urgent-badge': {
    question: 'Urgent Hiring Badge কীভাবে কাজ করে?',
    answer:
      'Premium ₹999 plan-এ available। Posting-এর সময় job-কে URGENT বা IMMEDIATE হিসাবে mark করলে, এটি listing cards-এ একটি red Urgent badge পায় + candidate searches-এ +20 ranking boost + candidate dashboards-এ Urgent jobs widget-এ প্রদর্শিত হয়। Job-এর প্রথম hire-এর সময় বা job-এর validity শেষ হওয়ার পরে badge স্বয়ংক্রিয়ভাবে remove হয়।',
  },
  'employer-verification': {
    question: 'আমার company কীভাবে verified করব?',
    answer:
      'Settings → Verification → আপনার GST certificate, PAN, এবং একটি company-domain email proof submit করুন। আমাদের team 1-2 business days-এর মধ্যে review করে। Verified companies প্রতিটি job listing, company profile page, এবং recruiter outreach-এ একটি green checkmark পায় — verified listings-এ candidates trust ~40% উচ্চ application rate দেয় আমাদের data-তে।',
  },
  'employer-screening-questions': {
    question: 'আমার job-এ screening questions add করতে পারি?',
    answer:
      'হ্যাঁ — যখন একটি job post বা edit করছেন, "Screening Questions" পর্যন্ত scroll করুন এবং up to 10 custom questions (text, multiple choice, yes/no) add করুন। যেকোনোটিকে required (apply করতে answer করতে হবে) বা deal-breaker (একটি wrong answer auto-rejects) হিসাবে mark করুন। Candidates apply form-এ আপনার questions দেখেন; তাদের answers application detail page-এ প্রদর্শিত হয়।',
  },
  'employer-analytics': {
    question: 'কী analytics available?',
    answer:
      'Employer Analytics আপনার hiring funnel (Views → Applies → Shortlists → Interviews → Hires) per job এবং aggregated, time-to-hire এবং time-to-fill metrics, source breakdown (organic search, recommendations, applications, CV unlocks), এবং multi-seat plan-এ থাকলে team-member productivity দেখায়। CSV export available। Premium এবং CV Enterprise plans additional cohort + benchmark views পায়।',
  },
  'employer-edit-job': {
    question: 'Posting করার পরে job কীভাবে edit করব?',
    answer:
      'Dashboard → My Jobs খুলুন → job click করুন → "Edit"। আপনি যেকোনো সময় description, requirements, screening questions, এবং salary range update করতে পারেন। Changes একটি quick moderation re-check-এর পরে live হয় (সাধারণত একটি ঘন্টার নিচে)। প্রথম application received হওয়ার পরে critical fields (job title, type, work mode) edit করা যাবে না — পরিবর্তে, role close করুন এবং application history clarity preserve করতে একটি new post করুন।',
  },
  'employer-close-job': {
    question: 'Job listing কীভাবে early close করব?',
    answer:
      'Dashboard → My Jobs → job click করুন → "Close listing"। একটি reason বেছে নিন (Filled / Cancelled / Reposting) — আপনার hiring analytics affect করে। Closed jobs অবিলম্বে new applications গ্রহণ করা বন্ধ করে এবং 5 মিনিটের মধ্যে public search থেকে অদৃশ্য হয়ে যায়। Existing applications review এবং outreach-এর জন্য accessible থাকে। Job close করা remaining validity refund করে না।',
  },
  'employer-bulk-cv-download': {
    question: 'Bulk CV download কীভাবে কাজ করে?',
    answer:
      'CV Enterprise plans bulk download unlock করে। আপনার filters সহ CV database search করুন → candidates check করুন (max 100 per export) → "Download CVs as ZIP" click করুন। ZIP-এ প্রতিটি PDF candidate-এর most-recent resume + একটি structured profile summary। প্রতিটি downloaded CV আপনার quota থেকে একটি CV-unlock consume করে (Enterprise plans-এ unlimited unlocks আছে)। Downloads audit-এর জন্য logged।',
  },
  'employer-application-export': {
    question: 'আমি কি আমার applications Excel / CSV-তে export করতে পারি?',
    answer:
      'হ্যাঁ — Dashboard → Applications → আপনার scope-এ Filter (job, status, date range দ্বারা) → "Export as CSV"। Export-এ candidate name, contact (শুধুমাত্র unlocked candidates-এর জন্য), application status, applied-on date, screening answers, এবং shortlist notes রয়েছে। PII masked যদি না contact unlock করা হয়। Quota abuse রোধ করতে exports per day 5-এ rate-limited।',
  },
  'employer-team-roles': {
    question: 'Team roles-এর কী permissions আছে?',
    answer:
      'তিনটি roles: OWNER (full access সহ billing + transferring ownership), ADMIN (jobs, applications, team invites manage করুন, কিন্তু billing change করতে পারে না বা company account close করতে পারে না), RECRUITER (CVs search, applicants shortlist, company account-এ jobs post করতে পারে, কিন্তু team members invite করতে পারে না)। সমস্ত roles company-র CV-unlock + search-result quota pool share করে। Team & roles Dashboard → Team থেকে managed।',
  },
  'employer-vendor-find': {
    question: 'আমি কীভাবে recruitment partner / vendor খুঁজব?',
    answer:
      '/vendors (public directory) ভিজিট করুন এবং specialisation, location, industry, team size, এবং verification status দ্বারা filter করুন। যেকোনো vendor-এ click করুন তাদের full profile + past placements-এর জন্য। Role details share করতে "Send hiring requirement" ব্যবহার করুন — vendor এটি তাদের lead inbox-এ দেখেন এবং সাধারণত 24 ঘন্টার মধ্যে আপনাকে contact করেন। Sharing a requirement বিনামূল্যে; আপনি vendor-এর সাথে directly একটি contract sign করলেই pay করেন (no platform fee)।',
  },
  'employer-multi-location': {
    question: 'আমি কি multiple locations-এ একটি job post করতে পারি?',
    answer:
      'হ্যাঁ, paid plans-এ only — Free plan job-প্রতি 1 location-এ caps। Standard, Premium, এবং CV Enterprise একই listing-এ additional locations অনুমতি দেয় (no per-location cap), তাই Bengaluru, Mumbai, এবং Pune-এ offices সহ একটি single role 3টি separate posts-এর প্রয়োজন ছাড়াই তিনটি city searches-এ প্রদর্শিত হয়। Location-specific applicants flagged। Post-job form-এ "Job locations" এর অধীনে additional locations যোগ করুন।',
  },
  'vendor-what-is': {
    question: 'Vendor Connect কী এবং কাদের জন্য?',
    answer:
      'Vendor Connect recruitment agencies, staffing partners, এবং independent recruiters-দের জন্য — যারা multiple client companies-এর পক্ষে candidates source করেন। ₹199/মাস (auto-renewed)-এ, আপনি আমাদের public Vendor Directory-তে listed হন, আপনার specialisations-এর সাথে match করা companies থেকে routed hiring leads পান, এবং employers-দের কাছে referral option হিসাবে surfaced হন। Plan monthly এবং আপনি যেকোনো সময় cancel করতে পারেন।',
  },
  'vendor-receive-leads': {
    question: 'আমি কীভাবে hiring leads পাব?',
    answer:
      'Subscribe করার পরে, আপনার "Specialisations" (যেমন IT, BFSI, healthcare), service locations, এবং industries configure করুন। যখন companies "Find Recruitment Partners" search করে আপনার সাথে match করা criteria দিয়ে, আপনি directory-তে প্রদর্শিত হন। Companies তখন আপনাকে directly একটি hiring requirement পাঠাতে পারে — আপনি এটি Dashboard → Lead Inbox-এ full role details এবং follow up করার জন্য contact info সহ দেখেন।',
  },
  'vendor-priority-leads': {
    question: 'Priority Access to New Leads কীভাবে কাজ করে?',
    answer:
      'Vendor Connect subscribers company দেখা matching score-এ +5 ranking bonus পান, তাই আপনি তাদের preview list-এ candidate vendors-এ higher প্রদর্শিত হন। Priority overlap quality (skills + location + industry) দ্বারা ordered, তাই একটি perfect-match basic vendor একটি unrelated priority vendor-এর উপরে rank করে। Leads exclusive নয় — multiple vendors একই role-এর জন্য contact করা যেতে পারে।',
  },
  'vendor-public-listing': {
    question: 'আমার agency profile কোথায় public-ভাবে দেখানো হয়?',
    answer:
      'Active subscribers public /vendors directory-তে প্রদর্শিত হন (যে কেউ browse করতে পারে, Google indexed) /vendors/{slug}-এ একটি dedicated profile page সহ আপনার specialisations, locations, team size, এবং (ঐচ্ছিকভাবে) testimonials দেখাচ্ছে। Employer Dashboard → Vendor → Business Profile থেকে আপনার public profile edit করুন — আমাদের content moderation review-এর পরে পরিবর্তনগুলি minutes-এর মধ্যে live হয়।',
  },
  'vendor-cancel': {
    question: 'Vendor Connect কীভাবে cancel করব?',
    answer:
      'Billing → Subscriptions → Vendor Connect → "Cancel auto-renew" খুলুন। Current billing period (purchase থেকে 30 days) শেষ হওয়া পর্যন্ত আপনার access continues এবং তারপর lapses — আপনি new leads receive করা বন্ধ করেন কিন্তু historical data retained। আপনি যেকোনো সময় resubscribe করতে পারেন; existing profile data subscriptions-এর মধ্যে preserved।',
  },
  'vendor-onboarding': {
    question: 'Vendor onboarding process দেখতে কেমন?',
    answer:
      'Employer হিসাবে আপনার company name + GST + PAN দিয়ে register করুন → employer dashboard থেকে Vendor Connect plan subscribe করুন → vendor profile complete করুন (specialisations, service locations, industries, team size, sample placements) → verification-এর জন্য submit করুন → আপনি approved হলে Vendor Connect plan charging শুরু করে (সাধারণত 1-2 business days)। Approval-এর পরে, আপনি public directory-তে appear হন এবং routed leads receive করা শুরু করেন। Subscription cancel না করেই dashboard থেকে যেকোনো সময় listing pause করতে পারেন।',
  },
  'vendor-multiple-clients': {
    question: 'আমি কি multiple client companies-কে serve করতে পারি?',
    answer:
      'হ্যাঁ — Vendor Connect কোন exclusivity restrictions দেয় না। বর্তমানে serve করা যত client companies (অনুমতি সহ) আপনার public profile-এ list করুন; আপনি যত বেশি showcase করতে পারেন, directory searches-এ আপনার trust signal তত higher। আমরা route করা leads exclusive নয় — multiple vendors একই role-এর জন্য contacted হতে পারে।',
  },
  'vendor-share-candidates': {
    question: 'আমাকে কি আমার candidates-এর contact details Hire Adda-র সাথে share করতে হবে?',
    answer:
      'না — Vendor Connect একটি lead-gen + listing service, candidate-data marketplace নয়। আপনার candidate database আপনারই থাকে। একবার একটি company আপনাকে একটি lead পাঠালে, আপনি তাদের off-platform (email, phone, আপনার CRM) contact করেন এবং নিজের pool থেকে candidates place করেন। Hire Adda আমাদের মাধ্যমে আপনি করা successful hires থেকে placement fee বা commission নেয় না।',
  },
  'vendor-rating': {
    question: 'Vendors কি clients দ্বারা rated হয়?',
    answer:
      'হ্যাঁ — একটি lead concludes হওয়ার পরে (hire successful, role cancelled, বা 90 days elapsed), company একটি private 1-5 rating + ঐচ্ছিক written feedback রাখতে পারে। আপনার average rating + total reviews 5+ ratings হওয়ার পরে আপনার public profile-এ প্রদর্শিত হয় (noisy single-review averages এড়াতে)। Below-3-star ratings আপনাকে একটি private explanation দেয়; আপনি support-এর মাধ্যমে factually wrong reviews dispute করতে পারেন।',
  },
  'billing-gst': {
    question: 'মূল্যে কি GST অন্তর্ভুক্ত?',
    answer:
      'হ্যাঁ — তালিকাভুক্ত সমস্ত প্ল্যান 18% GST অন্তর্ভুক্ত। পেমেন্টের পরে HSN কোড 998314 সহ একটি ট্যাক্স ইনভয়েস স্বয়ংক্রিয়ভাবে তৈরি হয় এবং আপনার ইমেইল করা হয়। ইনভয়েসগুলি Billing → Invoices থেকে যেকোনো সময় PDF হিসাবে ডাউনলোড করা যেতে পারে। B2B GSTIN দাবির জন্য, চেকআউটের আগে Billing → Tax Details-এ আপনার কোম্পানির GSTIN যোগ করুন — এটি প্রতিটি পরবর্তী ইনভয়েসে প্রদর্শিত হবে।',
  },
  'billing-payment-methods': {
    question: 'আপনি কোন পেমেন্ট পদ্ধতি গ্রহণ করেন?',
    answer:
      'UPI (Google Pay / PhonePe / Paytm / BHIM / যেকোনো UPI অ্যাপ), সমস্ত প্রধান ক্রেডিট এবং ডেবিট কার্ড (Visa, Mastercard, RuPay, Amex), 50+ ভারতীয় ব্যাংক থেকে নেটব্যাঙ্কিং, মোবাইল ওয়ালেট (Paytm, MobiKwik, Freecharge), এবং ₹3,000-এর উপরে কার্ডে EMI। নন-INR মুদ্রার জন্য আন্তর্জাতিক কার্ডগুলি কাজ করে (auto-FX)। পেমেন্টগুলি Razorpay দ্বারা প্রক্রিয়া করা হয় — আমরা কার্ডের বিবরণ সংরক্ষণ করি না।',
  },
  'billing-cancel-refund': {
    question: 'কেনার পরে কি আমি একটি প্ল্যান বাতিল করে রিফান্ড পেতে পারি?',
    answer:
      'আপনি যদি কোনো কোটা ব্যবহার না করে থাকেন তাহলে কেনার 2 দিনের মধ্যে রিফান্ড অনুরোধ করতে পারেন (কোনো CV unlock নেই, paid plan-এ কোনো job post নেই, Assisted Hiring call শিডিউল করা হয়নি)। 2 দিনের পরে বা ব্যবহারের পরে প্ল্যানগুলি অ-ফেরতযোগ্য কিন্তু ভবিষ্যতের চার্জ বন্ধ করতে আপনি যেকোনো সময় auto-renew বাতিল করতে পারেন এবং বৈধতা শেষ না হওয়া পর্যন্ত প্ল্যান ব্যবহার চালিয়ে যেতে পারেন। সম্পূর্ণ শর্তাবলীর জন্য Refund Policy দেখুন।',
  },
  'billing-recurring': {
    question: 'আপনি কি recurring payments support করেন?',
    answer:
      'হ্যাঁ — Vendor Connect (₹199/month) Razorpay eMandate (cards) বা UPI AutoPay (UPI)-এর মাধ্যমে monthly auto-renewed। অন্যান্য plans একই window-তে optional auto-renew support করে। Billing → Subscriptions থেকে যেকোনো সময় auto-renew cancel করুন; cancellation ভবিষ্যতের charges অবিলম্বে বন্ধ করে এবং current cycle শেষ হওয়া পর্যন্ত access continues।',
  },
  'billing-upgrade-mid-cycle': {
    question: 'Mid-cycle upgrades কীভাবে কাজ করে?',
    answer:
      'আমরা remaining validity এবং unused quota-এর উপর ভিত্তি করে আপনার current plan থেকে pro-rated credits compute করি, তারপর সেগুলি new plan price থেকে deduct করি — আপনি শুধুমাত্র difference pay করেন। Unused CV unlocks new plan-এ carry forward (per-plan cap অনুযায়ী)। In flight job posts তাদের original validity-তে continue করে; new posts upgraded plan-এর settings ব্যবহার করে। Upgrades instantly activate; downgrades-এর জন্য refunds supported নয়।',
  },
  'billing-quote-enterprise': {
    question: 'CV Enterprise-এর জন্য একটি custom quote কীভাবে পাব?',
    answer:
      'CV Enterprise card-এ "Contact Sales" click করুন বা /billing/quote ভিজিট করুন। আপনার team size, expected CV unlock volume, এবং যেকোনো compliance requirements (DPDP, custom MSA, on-prem deployment) পূরণ করুন। আমাদের sales team 1 business day-এর মধ্যে একটি tailored proposal সহ respond করে। Custom plans সাধারণত unlimited search results, multi-seat sharing, bulk CV download, dedicated CSM, এবং SLA-backed dedicated support অন্তর্ভুক্ত করে।',
  },
  'billing-currency-fx': {
    question: 'আমি কি INR ছাড়া অন্য currency-তে pay করতে পারি?',
    answer:
      'হ্যাঁ — আন্তর্জাতিক কার্ডগুলি Razorpay-এর FX engine-এর মাধ্যমে auto-converted। Page default-এ INR pricing দেখায়; checkout-এ আপনি visualisation-এর জন্য displayed currency (USD / EUR / GBP / SGD / AED) switch করতে পারেন, কিন্তু আপনার card-এ charge সর্বদা INR-এ, bank-এর standard FX rate applied। GST শুধুমাত্র Indian customers-দের জন্য প্রযোজ্য; international invoices zero-GST।',
  },
  'billing-failed-payment': {
    question: 'আমার payment fail হয়েছে — পরে কী হবে?',
    answer:
      'One-time plans-এর জন্য, আপনি Billing → Orders → "Resume Payment" থেকে অবিলম্বে retry করতে পারেন (link 24 hours valid)। Auto-renewed subscriptions-এর জন্য, আমরা 7 days-এ 4 বার automatically retry করি; প্রতিটি failed attempt-এর পরে আপনি একটি retry link সহ একটি email পান। 4 failures-এর পরে subscription grace mode-এ enters (3 more days access) এবং অবশেষে lapses। Resume করতে যেকোনো সময় payment method update করুন।',
  },
  'billing-invoice-gstin': {
    question: 'Input tax credit-এর জন্য আমি কি invoices-এ আমার company GSTIN add করতে পারি?',
    answer:
      'হ্যাঁ — Billing → Tax Details → checkout-এর আগে আপনার 15-digit GSTIN enter করুন। Past invoices-কে GSTIN সহ reissue করতে invoice date থেকে 30 days-এর মধ্যে support@hireadda.in-এ contact করুন। Reissue-এ original invoice আমাদের records-এ void হয় এবং new invoice (same number, GSTIN added) পাঠানো হয়। Standard ITC rules apply — eligibility-র জন্য আপনার CA-এর সাথে consult করুন।',
  },
  'billing-promo-coupon': {
    question: 'Promo / coupon code কীভাবে apply করব?',
    answer:
      'Checkout page-এ "Have a coupon code?" click করুন এবং code enter করুন। আমরা plan এবং আপনার account-এর জন্য validate করি (কিছু codes first-time-only বা audience-specific) এবং payment-এর আগে discounted total দেখাই। Referrals বা partner offers থেকে codes তাদের link click করার সময় auto-apply হয়। আপনি carry-forward credits-এর সাথে একটি coupon stack করতে পারেন কিন্তু অন্য coupon-এর সাথে নয়।',
  },
  'billing-tax-invoice-download': {
    question: 'একটি tax invoice কীভাবে download করব?',
    answer:
      'Billing → Invoices খুলুন → যেকোনো invoice click করুন → "Download PDF"। Invoices GST-compliant, HSN code 998314 অন্তর্ভুক্ত, আপনার billing address (এবং GSTIN যদি added), এবং আপনার records-এর জন্য একটি unique invoice number। একই invoice payment-এর সময় auto-emailed-ও। PDFs digitally signed তাই tamper-evident এবং accounting-এর জন্য proof হিসাবে গ্রহণযোগ্য।',
  },
  'billing-payment-history': {
    question: 'আমার payment history কোথায় দেখতে পাব?',
    answer:
      'Billing → Orders প্রতিটি transaction (paid / failed / refunded) timestamp, amount, plan, payment method, এবং invoice + ledger entry-এর link সহ দেখায়। Status, date range, বা plan দ্বারা filter করতে পারেন। Refunds separate negative-amount entries হিসাবে appear হয়, original order-এ linked back। Accounting reconciliation-এর জন্য একই page থেকে full history CSV হিসাবে export করুন।',
  },
  'billing-receipt-vs-invoice': {
    question: 'একটি receipt এবং একটি tax invoice-এর মধ্যে পার্থক্য কী?',
    answer:
      'একটি receipt confirm করে যে payment received হয়েছে (Razorpay দ্বারা success-এ অবিলম্বে issued)। একটি tax invoice tax purposes-এর জন্য sale দেখানো একটি GST-compliant document — input tax credit claims এবং accounting-এর জন্য required। Hire Adda প্রতিটি paid order-এর জন্য BOTH generate করে: receipt Razorpay confirmation email-এ, tax invoice server-side generated এবং minutes-এর মধ্যে emailed + সর্বদা Billing → Invoices-এ available।',
  },
  'billing-checkout-time': {
    question: 'Checkout কখনো কখনো long time নেয় কেন?',
    answer:
      'Checkout একটি Razorpay order create করে, আপনার account history-এর বিরুদ্ধে একটি fraud check run করে (new accounts extra scrutiny পায়), এবং entitlement quota reserve করে — সাধারণত <2 seconds। যদি এটি বেশি সময় নেয়, bank বা UPI app redirect-এ slow হতে পারে। Checkout >30 seconds stuck হলে, page refresh করুন (আপনার order preserved) এবং Billing → Orders থেকে "Resume payment" click করুন। Recurring failures একটি bank flag indicate করতে পারে।',
  },
};

export const FAQS_BN: FaqEntry[] = FAQS_EN.map((entry) => {
  const t = BN_TRANSLATIONS[entry.id];
  return t ? { ...entry, question: t.question, answer: t.answer } : entry;
});
