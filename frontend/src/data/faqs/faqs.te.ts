import type { FaqEntry } from './types';
import { FAQS_EN } from './faqs.en';

/**
 * Telugu translations covering the full FAQ corpus. Untranslated entries
 * (if any) fall back to English at runtime.
 */
const TE_TRANSLATIONS: Record<string, { question: string; answer: string }> = {
  'create-account': {
    question: 'Hire Adda-లో ఖాతాను ఎలా సృష్టించాలి?',
    answer:
      'ఖాతా సృష్టించడం సులభం మరియు ఉచితం. హోమ్‌పేజీలో "Get Started" లేదా "Sign Up" బటన్‌ను క్లిక్ చేయండి. మీ ఇమెయిల్ మరియు పాస్‌వర్డ్‌తో రిజిస్టర్ చేయవచ్చు, లేదా Google/LinkedIn ద్వారా త్వరగా సైన్ అప్ చేయవచ్చు. రిజిస్ట్రేషన్ తర్వాత, నైపుణ్యాలు, అనుభవం మరియు ఉద్యోగ ప్రాధాన్యతలతో మీ ప్రొఫైల్‌ను పూర్తి చేయడానికి మార్గనిర్దేశం చేయబడతారు.',
  },
  'forgot-password': {
    question: 'నా పాస్‌వర్డ్‌ను ఎలా రీసెట్ చేయాలి?',
    answer:
      'మీరు పాస్‌వర్డ్ మర్చిపోతే, లాగిన్ పేజీలో "Forgot Password" క్లిక్ చేయండి. మీ ఖాతాకు అనుబంధించబడిన ఇమెయిల్ చిరునామాను నమోదు చేయండి, మేము మీకు పాస్‌వర్డ్ రీసెట్ లింక్‌ను పంపుతాము (1 గంట వరకు చెల్లుతుంది). కొత్త పాస్‌వర్డ్‌ను సెట్ చేయడానికి దాన్ని క్లిక్ చేయండి. మీకు ఇమెయిల్ రాకపోతే, స్పామ్ ఫోల్డర్‌ను తనిఖీ చేయండి లేదా మా సపోర్ట్ టీమ్‌ను సంప్రదించండి.',
  },
  'delete-account': {
    question: 'నా ఖాతాను ఎలా తొలగించాలి?',
    answer:
      'ఖాతా తొలగించడానికి Settings → "Danger Zone" → "Delete Account" కు వెళ్లి నిర్ధారించండి. గమనించండి: ఖాతా తొలగింపు శాశ్వతం — మీ మొత్తం డేటా (applications, సేవ్ చేసిన jobs, మెసేజ్‌లు) 30 రోజుల్లో పూర్తిగా తొలగించబడుతుంది.',
  },
  'contact-support': {
    question: 'కస్టమర్ సపోర్ట్‌ను ఎలా సంప్రదించాలి?',
    answer:
      'మీరు మా సపోర్ట్ టీమ్‌ను అనేక ఛానెల్‌ల ద్వారా చేరుకోవచ్చు. support@hireadda.in కి ఇమెయిల్ పంపండి, +91 1762469136 (సోమ-శుక్ర, ఉదయం 9 - సాయంత్రం 6 IST) కి కాల్ చేయండి, లేదా నేరుగా సందేశం పంపడానికి Contact పేజీని సందర్శించండి. లాగిన్ చేసిన వినియోగదారులకు ఇన్-యాప్ చాట్ సపోర్ట్ కూడా అందిస్తాము. మా టీమ్ సాధారణంగా 24 గంటలలోపు ప్రతిస్పందిస్తుంది.',
  },
  'mobile-app': {
    question: 'Hire Adda mobile app అందుబాటులో ఉందా?',
    answer:
      'మేము Android మరియు iOS రెండింటికీ native apps అభివృద్ధి చేస్తున్నాము — Q3 2026లో విడుదల కావచ్చు. ప్రస్తుతం, వెబ్‌సైట్ పూర్తిగా mobile-responsive మరియు mobile browsers పై చక్కగా పనిచేస్తుంది. App-వంటి అనుభవం కోసం "Add to Home Screen" ఉపయోగించండి. Browser push notifications కూడా మద్దతిస్తాయి.',
  },
  'languages-supported': {
    question: 'Hire Adda ఏ భాషలను మద్దతిస్తుంది?',
    answer:
      'Hire Adda ప్రస్తుతం ఆంగ్లంలో పూర్తిగా అందుబాటులో ఉంది. హిందీ, తమిళం, తెలుగు, బెంగాలీ మరియు మరాఠీ UI అనువాదాలు 2026లో రోల్-అవుట్ అవుతున్నాయి. Job descriptions, applications మరియు search ఏ భాషలోనైనా పనిచేస్తాయి — మా matching engine అన్ని ప్రధాన భారతీయ భాషల queries అర్థం చేసుకుంటుంది. మీ ఇష్టమైన భాషలో FAQs చదవడానికి help center లో language picker ఉపయోగించండి.',
  },
  'who-is-it-for': {
    question: 'Hire Adda ఎవరి కోసం?',
    answer:
      'Hire Adda మూడు audiences-కు పూర్తిగా సేవ చేస్తుంది — (1) ఉద్యోగాన్వేషకులు (కొత్తవారు నుండి senior leaders వరకు, ప్రతి పరిశ్రమలో), (2) యజమానులు మరియు recruitment teams (మొదటి రోల్ post చేస్తున్న startup నుండి వందల openings నిర్వహించే enterprises వరకు), మరియు (3) clients కోసం candidates source చేసే recruitment-vendor agencies. ప్రతి audience కు dedicated dashboard, plan family మరియు సపోర్ట్ flow ఉంది.',
  },
  'about-hire-adda': {
    question: 'Hire Adda అంటే ఏమిటి?',
    answer:
      'Hire Adda ఒక India-first hiring platform — ఉద్యోగాన్వేషకులు, యజమానులు మరియు recruitment vendors-ను ఒకే stack-లో కలుపుతుంది. మేము సాంప్రదాయ job-posting-ను searchable CV database, AI-powered job matching, assisted hiring (మా team మీ కోసం CVs source చేస్తుంది), మరియు vendor marketplace తో జతచేస్తాము — అన్నీ INR-లో, GST-compliant, మరియు భారతీయ hiring market కోసం నిర్మించబడ్డాయి.',
  },
  'regions-served': {
    question: 'Hire Adda ఏ ప్రాంతాలు మరియు నగరాలకు సేవలు అందిస్తుంది?',
    answer:
      'Hire Adda పాన్-ఇండియా — ప్రతి రాష్ట్రం మరియు కేంద్రపాలిత ప్రాంతంలో jobs మరియు candidates జాబితా చేయబడ్డారు. మాకు metros (బెంగళూరు, ముంబై, ఢిల్లీ-NCR, హైదరాబాద్, పూణె, చెన్నై, కోల్‌కతా, అహ్మదాబాద్) లో బలమైన coverage ఉంది, tier-2 మరియు tier-3 నగరాలలో కూడా volumes వేగంగా పెరుగుతున్నాయి. Remote మరియు hybrid jobs సరిహద్దుల అంతటా పనిచేస్తాయి.',
  },
  'safety-trust': {
    question: 'Jobs మరియు candidates నిజమైనవి అని ఎలా నిర్ధారిస్తారు?',
    answer:
      'ప్రతి యజమాని post చేయడానికి ముందు company verification (GST + PAN + domain email proof) ద్వారా వెళతారు. Job posts content moderation ద్వారా scammy patterns ("apply చేయడానికి pay", "MLM", impossible salaries) flag చేయబడతాయి. Candidate profiles email + mobile OTP verification పొందుతాయి, మరియు మేము optional employer/education/experience verification badges అందిస్తాము. అనుమానాస్పద activity ను Trust & Safety team 24 గంటల్లో సమీక్షిస్తుంది.',
  },
  'report-fraudulent': {
    question: 'అనుమానాస్పద లేదా మోసపూరిత job posting ను ఎలా report చేయాలి?',
    answer:
      'మోసపూరిత, తప్పుదారి పట్టించే లేదా అనుమానాస్పద job listing కనిపిస్తే, job వివరాల పేజీలో "Report" బటన్ క్లిక్ చేయండి. కారణాన్ని ఎంచుకుని ఏదైనా అదనపు వివరాలను అందించండి. మా moderation team అన్ని reports ను 24-48 గంటల్లో సమీక్షిస్తుంది. తక్షణ ఆందోళనల కోసం safety@hireadda.in కి నేరుగా reports పంపవచ్చు. ధృవీకరించబడిన scams immediate takedown మరియు employer కు account suspension లో ఫలిస్తాయి.',
  },
  'platform-stats': {
    question: 'Hire Adda లో ఎన్ని jobs మరియు companies ఉన్నాయి?',
    answer:
      'Live numbers homepage మరియు /about page లో update అవుతాయి. Q2 2026 నాటికి: 50,000+ candidates, 5,000+ verified employers, 200+ నగరాల్లో 12,000+ open roles, మరియు directory లో 800+ recruitment vendors. Weekly application volume లక్షలలో. Blog ద్వారా త్రైమాసిక aggregate platform analytics share చేస్తాము.',
  },
  'two-factor-auth': {
    question: 'Two-Factor Authentication (2FA) ను ఎలా enable చేయాలి?',
    answer:
      'Settings → Security → Two-Factor Authentication తెరవండి. ఏదైనా authenticator app (Google Authenticator, Authy, 1Password) తో QR code scan చేసి 6-digit code నమోదు చేయండి. మేము backup codes కూడా generate చేస్తాము — device పోతే safe place లో store చేయండి. Password-less sign-in కోసం passkey (Face ID, Touch ID) register చేయవచ్చు.',
  },
  'trust-device': {
    question: '"Trust this device for 30 days" option ఏమి చేస్తుంది?',
    answer:
      '2FA verification విజయవంతం అయిన తర్వాత ఈ option ఎంచుకుంటే, ప్రస్తుత browser లో secure cookie set అవుతుంది. అదే browser నుండి 30 రోజుల్లో జరిగే subsequent sign-ins 2FA prompt skip చేస్తాయి. Trust cookie ఆ browser కు మాత్రమే bound — వేరే device, incognito window లేదా fresh browser నుండి sign-in చేస్తే 2FA అవసరం. Settings → Security నుండి trusted devices ఎప్పుడైనా revoke చేయవచ్చు.',
  },
  'sessions-revoke': {
    question: 'Active sessions ను ఎలా చూడాలి మరియు revoke చేయాలి?',
    answer:
      'Settings → Security → Active Sessions మీ ఖాతాలో sign-in చేయబడిన ప్రతి device మరియు browser ను IP, location (city-level) మరియు last-active timestamp తో జాబితా చేస్తుంది. ఏదైనా session పక్కన "Revoke" క్లిక్ చేసి దాన్ని తక్షణమే sign out చేయండి, లేదా "Revoke all other sessions" తో ప్రస్తుత browser ను మాత్రమే signed in గా ఉంచండి. Lost-phone scenarios ఇక్కడ నిర్వహించబడతాయి.',
  },
  'lost-mfa-device': {
    question: 'నా authenticator device పోయింది — ఖాతా ను ఎలా recover చేయాలి?',
    answer:
      '2FA prompt లో "Can\'t access authenticator?" → "Send Recovery Code" క్లిక్ చేయండి. మీ ఖాతా email కు 6-digit code email చేస్తాము. దాన్ని నమోదు చేయడం 2FA disable చేస్తుంది మరియు sign in చేయవచ్చు. వెంటనే 2FA మళ్లీ enable చేయండి. ప్రారంభంలో 2FA enable చేసేటప్పుడు saved backup codes లో ఏదైనా ఒకదాన్ని కూడా ఉపయోగించవచ్చు — ప్రతి backup code ఒకసారి మాత్రమే పనిచేస్తుంది.',
  },
  'data-privacy': {
    question: 'Hire Adda నా వ్యక్తిగత డేటాను ఎలా రక్షిస్తుంది?',
    answer:
      'మేము భారతదేశ Digital Personal Data Protection (DPDP) Act కు అనుగుణంగా ఉన్నాము మరియు OWASP Top 10 best practices ను అనుసరిస్తాము. Data transit (TLS 1.3) మరియు rest రెండింటిలోనూ encrypted. Sensitive fields (mobile numbers, salaries, contact details) public APIs లో ఎప్పుడూ తిరిగి ఇవ్వబడవు మరియు యజమానులు చూడటానికి CV unlock వంటి specific entitlements అవసరం. Settings నుండి మీ డేటాను ఎప్పుడైనా export లేదా delete చేయవచ్చు.',
  },
  'email-change': {
    question: 'నా email address ను ఎలా మార్చాలి?',
    answer:
      'Settings → Account → Email → "Change" తెరవండి. కొత్త email మరియు ప్రస్తుత password నమోదు చేయండి. మేము కొత్త email కు verification link పంపుతాము — క్లిక్ చేస్తే account email switch అవుతుంది మరియు పాత email కు confirmation పంపబడుతుంది. పాత email recovery channel గా 7 రోజులు పనిచేస్తుంది. పాత email access కోల్పోతే, identity proof తో support@hireadda.in ను సంప్రదించండి.',
  },
  'password-strength': {
    question: 'Password requirements ఏమిటి?',
    answer:
      'Passwords కనీసం ఒక uppercase letter, ఒక lowercase letter, ఒక number మరియు ఒక special character తో 8+ characters ఉండాలి. మేము 10,000 అత్యంత సాధారణ breached passwords ను block చేస్తాము (HaveIBeenPwned\'s public list తో match చేయబడుతుంది). Registration form లో strength meter real time లో entropy చూపుతుంది — "Strong" లేదా "Very Strong" లక్ష్యంగా ఉంచండి. గరిష్ట భద్రత కోసం, sign-up తర్వాత 2FA enable చేయండి మరియు password-less login కోసం passkey register చేయడం పరిగణించండి.',
  },
  'multiple-accounts': {
    question: 'నేను separate candidate మరియు employer accounts కలిగి ఉండగలనా?',
    answer:
      'అవును — accounts role-locked, కాబట్టి ఒక email ఒక role ను ఉంచుతుంది. Candidate మరియు employer features రెండింటినీ ఉపయోగించడానికి, వేరే email తో రెండవ ఖాతాను register చేయండి. చాలా చిన్న వ్యాపార యజమానులు ఇలా చేస్తారు: job applications కోసం వారి personal email + hiring కోసం వారి company email. Multi-seat employer plans (CV Enterprise) team-member invites తో కూడా పని చేస్తాయి.',
  },
  'export-data': {
    question: 'నా డేటాను ఎలా export చేయాలి?',
    answer:
      'Settings → Privacy → "Export my data" మీ profile, applications, messages మరియు audit log ను JSON + PDF గా కలిగిన ZIP generate చేస్తుంది. Generation కొన్ని నిమిషాలు పడుతుంది; మేము 24 గంటల valid download link email చేస్తాము. Abuse నివారించడానికి exports ప్రతి 7 రోజులకు ఒకటిగా rate-limited. ఇది DPDP Act\'s data portability right ను సంతృప్తి పరుస్తుంది.',
  },
  'account-suspended': {
    question: 'నా ఖాతా suspend చేయబడింది — ఎలా appeal చేయాలి?',
    answer:
      'Suspensions సాధారణంగా repeated content violations, మోసపూరిత activity లేదా chargebacks వల్ల జరుగుతాయి. Login page reason ను ప్రదర్శిస్తుంది మరియు "Submit an appeal" link. Appeals 3-5 business days లో వేరే moderator చేత సమీక్షించబడతాయి. మీ ఖాతా తప్పుగా suspend చేయబడితే, మీరు reinstate చేయబడతారు మరియు consumed quota restore చేయబడుతుంది. తీవ్ర violations (fake jobs, scam operations) appeal కు eligible కావు.',
  },
  'candidate-apply-job': {
    question: 'ప్లాట్‌ఫారమ్‌లో ఉద్యోగాలకు ఎలా దరఖాస్తు చేయాలి?',
    answer:
      'మీరు మీ ప్రొఫైల్‌ను సృష్టించిన తర్వాత, శోధన బార్ ఉపయోగించి ఉద్యోగాలను బ్రౌజ్ చేయండి లేదా మీ డ్యాష్‌బోర్డ్‌లో సూచించబడిన జాబితాలను అన్వేషించండి. మీకు ఆసక్తి ఉన్న ఉద్యోగం కనుగొన్నప్పుడు, ఉద్యోగ వివరాల పేజీలో "Apply" బటన్‌ను క్లిక్ చేయండి. మీ ప్రొఫైల్ మరియు రెజ్యూమ్ యజమానికి భాగస్వామ్యం చేయబడతాయి. మీరు మీ సేవ్ చేసిన ప్రొఫైల్ ఉపయోగించి ఒకే క్లిక్‌తో అనేక స్థానాలకు దరఖాస్తు చేయడానికి "Quick Apply"ని కూడా ప్రారంభించవచ్చు.',
  },
  'candidate-update-profile': {
    question: 'నా profile information ను ఎలా update చేయాలి?',
    answer:
      'మీ ఖాతాలోకి log in చేయండి మరియు dashboard నుండి profile page కు వెళ్లండి. మీరు మీ personal information, work experience, education, skills మరియు preferences ను ఎప్పుడైనా edit చేయవచ్చు. మార్పులు చేయడానికి "Edit Profile" క్లిక్ చేయండి, మరియు పూర్తయిన తర్వాత save చేయడం గుర్తుంచుకోండి. మీ profile ను up-to-date గా ఉంచడం మా matching engine కు మీ కోసం మెరుగైన అవకాశాలు కనుగొనడంలో సహాయపడుతుంది.',
  },
  'candidate-resume-upload': {
    question: 'నేను ఏ resume formats upload చేయగలను?',
    answer:
      'మీ CV ను PDF లేదా DOCX (10 MB max) గా upload చేయండి. మా Document AI parser మీ work history, education మరియు skills ను స్వయంచాలకంగా extract చేస్తుంది — saving ముందు suggested fields review చేయండి. మీరు profile లో multiple resume versions ఉంచవచ్చు మరియు ప్రతి application కు ఏది attach చేయాలో ఎంచుకోవచ్చు. Tip: clear section headings తో structured PDF అత్యంత accurately parse అవుతుంది.',
  },
  'candidate-premium-benefits': {
    question: 'Candidate Premium (₹199)లో ఏమి ఉంది?',
    answer:
      'Candidate Premium ₹199 (ఒకసారి) లో ఐదు ప్రయోజనాలు ఇస్తుంది: AI Resume Premium (4 paid templates ఆటో-ఫార్మాటింగ్‌తో), మీ ప్రొఫైల్‌లో Verified Badge, 7 రోజుల Profile Boost (recruiter searches-లో అగ్రస్థానం), Priority WhatsApp సపోర్ట్, మరియు మీ నైపుణ్యాలకు సంబంధించిన candidate searches-లో Top Visibility ర్యాంకింగ్. ప్లాన్ 30 రోజులకు చెల్లుతుంది.',
  },
  'candidate-applications-track': {
    question: 'నా applications ను ఎలా track చేయాలి?',
    answer:
      'Dashboard → Applications తెరవండి. ప్రతి row role, company, current status (Applied / Reviewed / Shortlisted / Interview / Hired / Rejected) మరియు latest update timestamp చూపుతుంది. ఏదైనా application లోకి click చేస్తే full timeline including employer-side notes (share చేసినప్పుడు) మరియు మీరు submit చేసిన screening-question answers. మేము ప్రతి status change పై email + push notifications పంపుతాము.',
  },
  'candidate-profile-visibility': {
    question: 'నా ప్రస్తుత యజమాని నుండి profile దాచగలనా?',
    answer:
      'అవును — Settings → Privacy → "Hide profile from selected employers" specific company accounts (మరియు ఆ company\'s domain నుండి ఏ user) ను CV-database searches లో మీ profile చూడకుండా block చేస్తుంది. "Make profile private" తో profile పూర్తిగా దాచవచ్చు — మీరు actively apply చేసే jobs లో మాత్రమే కనిపిస్తుంది. ఆ యజమానితో మీ application history ప్రభావితం కాదు.',
  },
  'candidate-job-alerts': {
    question: 'Job alerts ఎలా పనిచేస్తాయి?',
    answer:
      'Jobs page లో మీరు run చేసిన ఏదైనా search ను Job Alert గా save చేయండి — మేము కొత్త matching roles ను daily, weekly లేదా instantly (మీరు ఎంచుకుంటారు) email చేస్తాము. Alerts మీ filters ను ఖచ్చితంగా respect చేస్తాయి: skills, location, experience, work mode, salary range. Dashboard → Job Alerts నుండి ఎప్పుడైనా pause/manage చేయండి. మీరు 30 రోజుల్లో ఏదీ click చేయకపోతే alerts స్వయంచాలకంగా ఆగిపోతాయి.',
  },
  'candidate-recommendations': {
    question: 'Job recommendations ఎలా generate చేయబడతాయి?',
    answer:
      "Recommendations మూడు signals కలుపుతాయి: (1) మీ profile మరియు job's required skills మధ్య skills overlap (recency-weighted), (2) Google Cloud Talent's AI matching, (3) మీ historical interaction (applies, saves, dismissals) నుండి మీ preferences నేర్చుకోవడం. Recommendations ప్రతి 4 గంటలకు refresh అవుతాయి — Recommendations page నుండి manually కూడా refresh చేయవచ్చు.",
  },
  'candidate-interview-prep': {
    question: 'Hire Adda interview preparation తో సహాయపడుతుందా?',
    answer:
      'Hire Adda ద్వారా యజమాని interview schedule చేస్తే, application detail page tailored prep panel చూపుతుంది: యజమాని historically అడిగిన top skills, వారి successful hires reported average preparation time, మరియు తీసుకురావాల్సిన artefacts checklist (resume, ID, certificates). Role + city కు 3+ hires complete అయితే salary-range data కూడా చూపుతాము.',
  },
  'candidate-resume-templates': {
    question: 'Candidate Premium లో ఏ resume templates ఉన్నాయి?',
    answer:
      'Premium 4 paid templates ను unlock చేస్తుంది (default free కాకుండా): Modern Minimal (clean two-column), Executive Classic (single-column traditional), Creative Bold (design / marketing roles కోసం colour accents), మరియు ATS Pro (applicant-tracking-system parsing కోసం optimised). ప్రతి template మీ existing profile data ను auto-format చేస్తుంది — re-typing లేదు. కొనుగోలు ముందు అన్ని 5 (1 free + 4 premium) preview చేయవచ్చు.',
  },
  'candidate-saved-jobs': {
    question: 'Saved jobs ఎలా పనిచేస్తాయి?',
    answer:
      'తరువాత కోసం save చేయడానికి ఏదైనా job పై bookmark icon click చేయండి. Saved jobs Dashboard → Saved Jobs క్రింద కనిపిస్తాయి. Saving private — యజమానులు ఎవరు వారి job save చేశారో చూడలేరు. Filled లేదా expire అయిన saved jobs auto-archived అవుతాయి కానీ "ఇక applications అంగీకరించడం లేదు" note తో మీ list లో visible గా ఉంటాయి. ఎన్ని jobs save చేయవచ్చు అనే limit లేదు.',
  },
  'candidate-apply-without-account': {
    question: 'ఖాతా సృష్టించకుండా apply చేయగలనా?',
    answer:
      'లేదు — applications కు ఖాతా అవసరం, తద్వారా మేము మీ application + resume ను employer కు reliably deliver చేయగలము, follow-ups కు మద్దతు ఇవ్వగలము మరియు మీరు status track చేయగలరు. ఖాతా సృష్టి ఉచితం మరియు ~60 సెకన్లు పడుతుంది. Registering మీకు job save చేయడానికి, similar roles కు alerts set చేయడానికి మరియు భవిష్యత్తులో single click తో apply చేయడానికి అనుమతిస్తుంది.',
  },
  'candidate-mock-interview': {
    question: 'Hire Adda mock interviews అందిస్తుందా?',
    answer:
      'AI-powered mock interviews selected roles (software engineering, sales, customer support) కోసం beta లో ఉన్నాయి. System role-specific questions అడుగుతుంది, మీ audio response record చేస్తుంది, మరియు answer structure, filler words మరియు key skills mentioned పై feedback ఇస్తుంది. Premium candidates కు ఉచితం, నెలకు 3 mock sessions వరకు. మీ role scope లో ఉన్నప్పుడు Dashboard → Mock Interview నుండి open చేయండి.',
  },
  'candidate-salary-research': {
    question: 'Apply చేయడానికి ముందు salaries research చేయగలనా?',
    answer:
      'అవును — ప్రతి job listing employer-disclosed salary range చూపుతుంది set అయితే. Undisclosed roles కోసం, listing ఇంకా similar hires (role + location + experience) నుండి derived estimated range చూపుతుంది మాకు ≥10 data points ఉన్నప్పుడు. Dashboard → Salary Insights broader market data ఇస్తుంది: role, city మరియు years of experience ద్వారా median + range, మరియు మీరు profile లో నింపితే current/expected CTC కు పోలిక.',
  },
  'candidate-fake-job-detection': {
    question: 'Candidates ను fake jobs నుండి ఎలా రక్షిస్తారు?',
    answer:
      'మూడు layers: (1) post చేయడానికి ముందు ప్రతి యజమాని verified (GST + PAN + domain email); (2) job posts automated moderation ద్వారా scammy patterns ("apply కోసం pay", "registration fee", "investment opportunity") block చేస్తుంది; (3) ప్రతి job పై in-app Trust Score (0-5 stars) employer\'s past hires + verifications + report rate ను factor చేస్తుంది. 3 stars క్రింద scoring jobs తప్పించండి మరియు upfront డబ్బు అడిగే ఏదైనా role report చేయండి.',
  },
  'candidate-skill-test': {
    question: 'Hire Adda లో skill assessments ఉన్నాయా?',
    answer:
      'అవును — యజమానులు jobs కు skill assessments attach చేయగలరు (multiple-choice, coding, video answers). మీరు apply form లో assessment requirement చూస్తారు మరియు అప్పుడే లేదా తర్వాత (apply చేసిన 48 గంటల్లో) తీసుకోవచ్చు. Scores మీకు మరియు యజమానికి ఇద్దరికీ visible. Top in-demand skills (JavaScript, Python, English communication, Excel) కోసం profile లో self-administered skill tests కూడా మద్దతిస్తాము — pass అవ్వడం verified badge జోడిస్తుంది.',
  },
  'employer-post-job': {
    question: 'యజమానిగా ఉద్యోగాన్ని ఎలా పోస్ట్ చేయాలి?',
    answer:
      'యజమానిగా రిజిస్టర్ చేయండి మరియు కంపెనీ పేరు, వివరణ, పరిశ్రమ మరియు స్థానం వంటి వివరాలతో మీ కంపెనీ ప్రొఫైల్‌ను పూర్తి చేయండి. ధృవీకరణ తర్వాత, మీ Employer Dashboard-కు వెళ్లి "Post a Job" క్లిక్ చేయండి. ఉద్యోగ శీర్షిక, వివరణ, అవసరమైన నైపుణ్యాలు, జీతం పరిధి మరియు ఇతర వివరాలను పూరించండి. నాణ్యత నిర్ధారించడానికి సంక్షిప్త మోడరేషన్ సమీక్ష తర్వాత మీ లిస్టింగ్ ప్రత్యక్షంగా వెళ్తుంది.',
  },
  'employer-free-plan': {
    question: 'Free Job Post ప్లాన్ (₹0) లో ఏమి ఉంది?',
    answer:
      'Free ప్లాన్ 7 రోజుల పాటు 1 ఉద్యోగ పోస్ట్, గరిష్టంగా 50 దరఖాస్తులు, 1 స్థానం, ప్రాథమిక candidate dashboard యాక్సెస్ మరియు ప్రామాణిక లిస్టింగ్ విజిబిలిటీని ఇస్తుంది. employer onboarding పూర్తి చేసినప్పుడు ఇది స్వయంచాలకంగా అందించబడుతుంది — కార్డ్ అవసరం లేదు. వ్యవధిని పొడిగించడానికి, దరఖాస్తు పరిమితిని పెంచడానికి మరియు CV-డేటాబేస్ యాక్సెస్‌ని జోడించడానికి ఎప్పుడైనా Standard (₹499) లేదా Premium (₹999)కి అప్‌గ్రేడ్ చేయండి.',
  },
  'employer-cv-database': {
    question: 'CV Database (Talent Vault) అంటే ఏమిటి?',
    answer:
      'CV Database ప్రతి candidate profile యొక్క searchable index. Skills, location, experience, salary, last-active, education ద్వారా filter చేయండి. ప్రతి plan నిర్ణీత సంఖ్య "CV unlocks" ఇస్తుంది — candidate\'s contact details (email + phone) చూడటం మీ quota నుండి ఒక unlock consume చేస్తుంది. Search ఉచితం; contact info reveal చేయడం మాత్రమే unlock costs. CV Lite = 200, CV Pro = 500, CV Enterprise = 1000+ (custom).',
  },
  'employer-applications-cap': {
    question: "నా job's applications cap reached అయితే ఏమి జరుగుతుంది?",
    answer:
      'New applications block అవుతాయి — candidates కు "Job is full" message తో. మీరు పొందిన అన్ని applications చూడవచ్చు మరియు shortlist చేయవచ్చు. Free = 50, Standard = 250, Premium = unlimited. Mid-cycle upgrade ఆ listing కు cap తక్షణమే తొలగిస్తుంది. Cap per-job (account-wide కాదు) మరియు మీరు role re-post చేస్తే resets అవుతుంది.',
  },
  'employer-team-multi-seat': {
    question: 'నా company నుండి multiple recruiters ఒక account share చేయగలరా?',
    answer:
      "అవును — Dashboard → Team నుండి teammates ను invite చేయండి. CV Enterprise plans multi-seat sharing కలిగి ఉంటాయి: invitees RECRUITER లేదా ADMIN team members అవుతారు మరియు company's shared CV-unlock + search-result quota pool నుండి consume చేస్తారు. Lower-tier plans (Standard, Premium, CV Lite, CV Pro) single-seat మాత్రమే. Owner ownership transfer చేయవచ్చు లేదా seats revoke చేయవచ్చు ఎప్పుడైనా.",
  },
  'employer-assisted-hiring': {
    question: 'Assisted Hiring (₹1499) ఎలా పనిచేస్తుంది?',
    answer:
      '₹1499 pay → మా specialist ఒక business day లో మిమ్మల్ని call చేస్తారు role scope చేయడానికి → మేము 4-5 matching CVs source చేస్తాము మరియు 7 రోజుల్లో email చేస్తాము. మీరు candidates తో సంప్రదించి interview చేస్తారు; మేము matching legwork చేస్తాము. ప్రతి plan ఒక job role cover చేస్తుంది. Dashboard → Assisted Hiring లో Pending → Call Scheduled → Sourcing → Delivered status updates తో progress track చేయండి.',
  },
  'employer-urgent-badge': {
    question: 'Urgent Hiring Badge ఎలా పనిచేస్తుంది?',
    answer:
      "Premium ₹999 plan లో అందుబాటులో. Posting సమయంలో job ను URGENT లేదా IMMEDIATE గా mark చేస్తే, listing cards పై red Urgent badge + candidate searches లో +20 ranking boost + candidate dashboards పై Urgent jobs widget లో కనిపిస్తుంది. Job's మొదటి hire అయినప్పుడు లేదా job's validity ముగిసినప్పుడు badge automatically తొలగించబడుతుంది.",
  },
  'employer-verification': {
    question: 'నా company ను ఎలా verify చేయాలి?',
    answer:
      'Settings → Verification → మీ GST certificate, PAN మరియు company-domain email proof submit చేయండి. మా team 1-2 business days లో review చేస్తుంది. Verified companies ప్రతి job listing, company profile page మరియు recruiter outreach పై green checkmark పొందుతాయి — verified listings లో candidates trust ~40% అధిక application rate మా data లో.',
  },
  'employer-screening-questions': {
    question: 'నా job కు screening questions add చేయగలనా?',
    answer:
      'అవును — job post లేదా edit చేస్తున్నప్పుడు, "Screening Questions" కు scroll చేసి up to 10 custom questions (text, multiple choice, yes/no) add చేయండి. ఏదైనా required (apply చేయడానికి సమాధానం ఇవ్వాలి) లేదా deal-breaker (తప్పు సమాధానం auto-rejects) గా mark చేయండి. Candidates apply form పై మీ questions చూస్తారు; వారి answers application detail page పై కనిపిస్తాయి.',
  },
  'employer-analytics': {
    question: 'ఏ analytics అందుబాటులో ఉన్నాయి?',
    answer:
      'Employer Analytics మీ hiring funnel (Views → Applies → Shortlists → Interviews → Hires) ను per job మరియు aggregated, time-to-hire మరియు time-to-fill metrics, source breakdown (organic search, recommendations, applications, CV unlocks), మరియు multi-seat plan లో ఉంటే team-member productivity చూపుతుంది. CSV export అందుబాటులో. Premium మరియు CV Enterprise plans additional cohort + benchmark views పొందుతాయి.',
  },
  'employer-edit-job': {
    question: 'Posting తర్వాత job ను ఎలా edit చేయాలి?',
    answer:
      'Dashboard → My Jobs → job క్లిక్ → "Edit". మీరు ఎప్పుడైనా description, requirements, screening questions మరియు salary range update చేయవచ్చు. Changes quick moderation re-check తర్వాత live అవుతాయి (సాధారణంగా ఒక గంట లోపు). మొదటి application received తర్వాత critical fields (job title, type, work mode) edit చేయలేరు — బదులుగా role close చేసి కొత్తది post చేయండి application history clarity preserve చేయడానికి.',
  },
  'employer-close-job': {
    question: 'Job listing ను early ఎలా close చేయాలి?',
    answer:
      'Dashboard → My Jobs → job క్లిక్ → "Close listing". కారణం ఎంచుకోండి (Filled / Cancelled / Reposting) — మీ hiring analytics ను affect చేస్తుంది. Closed jobs తక్షణమే new applications అంగీకరించడం ఆపేస్తాయి మరియు 5 నిమిషాల్లో public search నుండి అదృశ్యమవుతాయి. Existing applications review మరియు outreach కు accessible గా ఉంటాయి. Job close చేయడం remaining validity refund చేయదు.',
  },
  'employer-bulk-cv-download': {
    question: 'Bulk CV download ఎలా పనిచేస్తుంది?',
    answer:
      'CV Enterprise plans bulk download unlock చేస్తాయి. మీ filters తో CV database search చేయండి → candidates check చేయండి (max 100 per export) → "Download CVs as ZIP" క్లిక్ చేయండి. ZIP లో ప్రతి PDF candidate\'s most-recent resume + structured profile summary. ప్రతి downloaded CV మీ quota నుండి ఒక CV-unlock consume చేస్తుంది (Enterprise plans లో unlimited unlocks). Downloads audit కోసం logged.',
  },
  'employer-application-export': {
    question: 'నా applications ను Excel / CSV కు export చేయగలనా?',
    answer:
      'అవును — Dashboard → Applications → మీ scope కు Filter (job, status, date range ద్వారా) → "Export as CSV". Export లో candidate name, contact (unlocked candidates కోసం మాత్రమే), application status, applied-on date, screening answers మరియు shortlist notes ఉంటాయి. Contact unlock చేయకపోతే PII masked. Quota abuse నివారించడానికి exports per day 5 కు rate-limited.',
  },
  'employer-team-roles': {
    question: 'Team roles కు ఏ permissions ఉన్నాయి?',
    answer:
      "మూడు roles: OWNER (full access including billing + transferring ownership), ADMIN (jobs, applications, team invites manage చేయవచ్చు, కానీ billing change చేయలేరు లేదా company account close చేయలేరు), RECRUITER (CVs search, applicants shortlist, company account కు jobs post చేయవచ్చు, కానీ team members invite చేయలేరు). అన్ని roles company's CV-unlock + search-result quota pool share చేస్తాయి. Team & roles Dashboard → Team నుండి manage.",
  },
  'employer-vendor-find': {
    question: 'Recruitment partner / vendor ను ఎలా కనుగొనాలి?',
    answer:
      '/vendors (public directory) visit చేయండి మరియు specialisation, location, industry, team size, మరియు verification status ద్వారా filter చేయండి. ఏదైనా vendor పై click చేస్తే full profile + past placements కనిపిస్తాయి. Role details share చేయడానికి "Send hiring requirement" ఉపయోగించండి — vendor దానిని వారి lead inbox లో చూస్తారు మరియు సాధారణంగా 24 గంటల్లో మిమ్మల్ని contact చేస్తారు. Requirement share చేయడం ఉచితం; vendor తో directly contract sign చేస్తే మాత్రమే మీరు pay చేస్తారు.',
  },
  'employer-multi-location': {
    question: 'Multiple locations లో job post చేయగలనా?',
    answer:
      'అవును, paid plans మాత్రమే — Free plan per job 1 location కు caps. Standard, Premium మరియు CV Enterprise అదే listing పై additional locations అనుమతిస్తాయి (per-location cap లేదు), Bengaluru, Mumbai మరియు Pune offices తో single role 3 separate posts అవసరం లేకుండా మూడు city searches లో కనిపిస్తుంది. Location-specific applicants flagged. Post-job form పై "Job locations" క్రింద additional locations add చేయండి.',
  },
  'vendor-what-is': {
    question: 'Vendor Connect అంటే ఏమిటి, ఎవరికి?',
    answer:
      'Vendor Connect recruitment agencies, staffing partners మరియు independent recruiters కోసం — multiple client companies కోసం candidates source చేసేవారికి. ₹199/month (auto-renewed) కోసం, మీరు మా public Vendor Directory లో listed అవుతారు, మీ specialisations తో match అయ్యే companies నుండి routed hiring leads పొందుతారు, మరియు యజమానులకు referral option గా surface అవుతారు. Plan monthly మరియు ఎప్పుడైనా cancel చేయవచ్చు.',
  },
  'vendor-receive-leads': {
    question: 'Hiring leads ను ఎలా receive చేయాలి?',
    answer:
      'Subscribe అయిన తర్వాత మీ "Specialisations" (IT, BFSI, healthcare వంటివి), service locations మరియు industries configure చేయండి. మీతో match అయ్యే criteria తో "Find Recruitment Partners" search చేసే companies మిమ్మల్ని directory లో చూస్తాయి. వారు మీకు hiring requirement directly పంపగలరు — Dashboard → Lead Inbox లో full role details మరియు contact info తో చూడండి.',
  },
  'vendor-priority-leads': {
    question: 'Priority Access to New Leads ఎలా పనిచేస్తుంది?',
    answer:
      'Vendor Connect subscribers company చూసే matching score లో +5 ranking bonus పొందుతారు, candidate vendors preview list లో మీరు higher కనిపిస్తారు. Priority overlap quality (skills + location + industry) ద్వారా ordered, perfect-match basic vendor unrelated priority vendor పైన rank అవుతుంది. Leads exclusive కావు — multiple vendors ఒకే role కు contact చేయబడతారు.',
  },
  'vendor-public-listing': {
    question: 'నా agency profile public గా ఎక్కడ చూపించబడుతుంది?',
    answer:
      'Active subscribers public /vendors directory లో కనిపిస్తారు (ఎవరైనా browse చేయవచ్చు, Google indexed) /vendors/{slug} వద్ద dedicated profile page తో — మీ specialisations, locations, team size, మరియు (optional) testimonials చూపుతుంది. Employer Dashboard → Vendor → Business Profile నుండి public profile edit చేయండి — content moderation review తర్వాత minutes లో changes live.',
  },
  'vendor-cancel': {
    question: 'Vendor Connect ను ఎలా cancel చేయాలి?',
    answer:
      'Billing → Subscriptions → Vendor Connect → "Cancel auto-renew" తెరవండి. Current billing period (purchase నుండి 30 days) చివరి వరకు access కొనసాగుతుంది మరియు lapses అవుతుంది — new leads receive చేయడం ఆపేస్తారు కానీ historical data retain. ఎప్పుడైనా resubscribe చేయవచ్చు; existing profile data subscriptions మధ్య preserved.',
  },
  'vendor-onboarding': {
    question: 'Vendor onboarding process ఎలా ఉంటుంది?',
    answer:
      'Employer గా మీ company name + GST + PAN తో register అవ్వండి → employer dashboard నుండి Vendor Connect plan subscribe చేయండి → vendor profile complete (specialisations, service locations, industries, team size, sample placements) → verification కు submit → approved అయితే Vendor Connect plan charging start అవుతుంది (సాధారణంగా 1-2 business days). Approval తర్వాత, public directory లో కనిపిస్తారు మరియు routed leads start. Subscription cancel చేయకుండా dashboard నుండి listing pause చేయవచ్చు ఎప్పుడైనా.',
  },
  'vendor-multiple-clients': {
    question: 'Multiple client companies కు serve చేయగలనా?',
    answer:
      'అవును — Vendor Connect ఎలాంటి exclusivity restrictions లేవు. Public profile లో మీరు ప్రస్తుతం serve చేస్తున్న multiple client companies (permission తో) list చేయండి; ఎక్కువ showcase చేయగలిగితే directory searches లో trust signal అంత higher. మేము route చేసే leads exclusive కూడా కావు — multiple vendors ఒకే role కు contact చేయబడతారు.',
  },
  'vendor-share-candidates': {
    question: 'నా candidates contact details Hire Adda తో share చేయాలా?',
    answer:
      'లేదు — Vendor Connect lead-gen + listing service, candidate-data marketplace కాదు. మీ candidate database మీదే. ఒక company మీకు lead పంపిన తర్వాత, మీరు off-platform (email, phone, మీ CRM) వారిని contact చేస్తారు మరియు మీ pool నుండి candidates place చేస్తారు. Hire Adda మా ద్వారా చేసిన successful hires నుండి placement fee లేదా commission తీసుకోదు.',
  },
  'vendor-rating': {
    question: 'Vendors clients ద్వారా rated చేయబడతారా?',
    answer:
      'అవును — lead concludes అయిన తర్వాత (hire successful, role cancelled, లేదా 90 days elapsed), company private 1-5 rating + optional written feedback ఇవ్వగలదు. మీ average rating + total reviews 5+ ratings తర్వాత public profile లో కనిపిస్తాయి (noisy single-review averages avoid చేయడానికి). Below-3-star ratings మీకు private explanation ఇస్తాయి; factually wrong reviews support ద్వారా dispute చేయవచ్చు.',
  },
  'billing-gst': {
    question: 'ధరలో GST చేర్చబడిందా?',
    answer:
      'అవును — జాబితా చేయబడిన అన్ని ప్లాన్‌లు 18% GSTతో సహా. చెల్లింపు తర్వాత HSN కోడ్ 998314 తో పన్ను ఇన్‌వాయిస్ స్వయంచాలకంగా రూపొందించబడుతుంది మరియు మీకు ఇమెయిల్ చేయబడుతుంది. ఇన్‌వాయిస్‌లు Billing → Invoices నుండి ఎప్పుడైనా PDF గా డౌన్‌లోడ్ చేసుకోవచ్చు. B2B GSTIN క్లెయిమ్‌ల కోసం, చెక్‌అవుట్‌కు ముందు Billing → Tax Details లో మీ కంపెనీ GSTIN ను జోడించండి — ఇది ప్రతి తదుపరి ఇన్‌వాయిస్‌లో కనిపిస్తుంది.',
  },
  'billing-payment-methods': {
    question: 'మీరు ఏ చెల్లింపు పద్ధతులను అంగీకరిస్తారు?',
    answer:
      'UPI (Google Pay / PhonePe / Paytm / BHIM / ఏదైనా UPI యాప్), అన్ని ప్రధాన క్రెడిట్/డెబిట్ కార్డ్‌లు (Visa, Mastercard, RuPay, Amex), 50+ భారతీయ బ్యాంకుల నుండి నెట్‌బ్యాంకింగ్, మొబైల్ వాలెట్‌లు (Paytm, MobiKwik, Freecharge), మరియు ₹3,000 పైన కార్డ్‌లపై EMI. INR కాని కరెన్సీలకు అంతర్జాతీయ కార్డ్‌లు పనిచేస్తాయి (auto-FX). చెల్లింపులు Razorpay ద్వారా ప్రాసెస్ చేయబడతాయి — మేము కార్డ్ వివరాలను నిల్వ చేయము.',
  },
  'billing-cancel-refund': {
    question: 'కొనుగోలు తర్వాత ప్లాన్‌ను రద్దు చేసి రీఫండ్ పొందవచ్చా?',
    answer:
      'మీరు ఏ కోటాను వినియోగించలేదనే షరతుపై కొనుగోలు చేసిన 2 రోజులలోపు రీఫండ్‌ను అభ్యర్థించవచ్చు (CV unlocks లేవు, paid plan-లో ఉద్యోగ పోస్ట్‌లు లేవు, Assisted Hiring కాల్‌లు షెడ్యూల్ చేయబడలేదు). 2 రోజుల తర్వాత లేదా వినియోగం తర్వాత ప్లాన్‌లు తిరిగి చెల్లించబడవు, కానీ భవిష్యత్తు ఛార్జీలను ఆపడానికి ఎప్పుడైనా ఆటో-రెన్యూని రద్దు చేయవచ్చు మరియు చెల్లుబాటు ముగిసే వరకు ప్లాన్‌ను ఉపయోగించడం కొనసాగించవచ్చు. పూర్తి నిబంధనల కోసం Refund Policy చూడండి.',
  },
  'billing-recurring': {
    question: 'Recurring payments ను support చేస్తారా?',
    answer:
      'అవును — Vendor Connect (₹199/month) Razorpay eMandate (cards) లేదా UPI AutoPay (UPI) ద్వారా monthly auto-renewed. Other plans optional auto-renew same window లో support చేస్తాయి. Billing → Subscriptions నుండి ఎప్పుడైనా auto-renew cancel చేయండి; cancellation భవిష్యత్తు charges immediately ఆపేస్తుంది మరియు access current cycle ముగిసే వరకు continues.',
  },
  'billing-upgrade-mid-cycle': {
    question: 'Mid-cycle upgrades ఎలా పనిచేస్తాయి?',
    answer:
      'మేము మీ current plan నుండి remaining validity మరియు unused quota ఆధారంగా pro-rated credits compute చేస్తాము, తర్వాత new plan price నుండి deduct చేస్తాము — మీరు తేడా మాత్రమే pay చేస్తారు. Unused CV unlocks new plan కు carry forward (per-plan cap). In flight job posts original validity పై continue, new posts upgraded plan settings ఉపయోగిస్తాయి. Upgrades immediately activate; downgrades కు refunds కావు.',
  },
  'billing-quote-enterprise': {
    question: 'CV Enterprise కోసం custom quote ఎలా పొందాలి?',
    answer:
      'CV Enterprise card పై "Contact Sales" click చేయండి లేదా /billing/quote visit చేయండి. మీ team size, expected CV unlock volume మరియు ఏదైనా compliance requirements (DPDP, custom MSA, on-prem deployment) నింపండి. మా sales team 1 business day లో tailored proposal తో respond చేస్తుంది. Custom plans సాధారణంగా unlimited search results, multi-seat sharing, bulk CV download, dedicated CSM మరియు SLA-backed dedicated support include చేస్తాయి.',
  },
  'billing-currency-fx': {
    question: 'INR కాకుండా వేరే currency లో pay చేయగలనా?',
    answer:
      "అవును — international cards Razorpay's FX engine ద్వారా auto-converted. Page default గా INR pricing చూపుతుంది; checkout పై visualisation కోసం displayed currency (USD / EUR / GBP / SGD / AED) switch చేయవచ్చు, కానీ మీ card కు charge ఎప్పుడూ INR లో, bank's standard FX rate applied. GST Indian customers కు మాత్రమే; international invoices zero-GST.",
  },
  'billing-failed-payment': {
    question: 'నా payment fail అయింది — తర్వాత ఏమి జరుగుతుంది?',
    answer:
      'One-time plans కోసం, మీరు Billing → Orders → "Resume Payment" నుండి immediately retry చేయవచ్చు (link 24 hours valid). Auto-renewed subscriptions కోసం, మేము 7 days లో 4 సార్లు automatically retry చేస్తాము; ప్రతి failed attempt తర్వాత retry link తో మీకు email వస్తుంది. 4 failures తర్వాత subscription grace mode (3 more days access) కు enters మరియు finally lapses. Resume చేయడానికి payment method update చేయండి ఎప్పుడైనా.',
  },
  'billing-invoice-gstin': {
    question: 'Input tax credit కోసం invoices కు company GSTIN add చేయగలనా?',
    answer:
      'అవును — Billing → Tax Details → checkout ముందు మీ 15-digit GSTIN enter చేయండి. Past invoices ను GSTIN తో reissue చేయడానికి invoice date నుండి 30 days లో support@hireadda.in ను contact చేయండి. Reissue చేస్తే original invoice మా records లో void అవుతుంది మరియు new invoice (same number, GSTIN added) పంపబడుతుంది. Standard ITC rules apply — eligibility కోసం మీ CA ను consult చేయండి.',
  },
  'billing-promo-coupon': {
    question: 'Promo / coupon code ఎలా apply చేయాలి?',
    answer:
      'Checkout page పై "Have a coupon code?" click చేసి code enter చేయండి. Plan మరియు account కు validate (కొన్ని codes first-time-only లేదా audience-specific) మరియు payment ముందు discounted total చూపుతాము. Referrals లేదా partner offers నుండి codes వాటి link click చేస్తే auto-apply. Coupon ను carry-forward credits తో stack చేయవచ్చు కానీ వేరే coupon తో కాదు.',
  },
  'billing-tax-invoice-download': {
    question: 'Tax invoice ఎలా download చేయాలి?',
    answer:
      'Billing → Invoices తెరవండి → ఏదైనా invoice click → "Download PDF". Invoices GST-compliant, HSN code 998314 include, మీ billing address (మరియు GSTIN add చేస్తే), మరియు మీ records కోసం unique invoice number. Same invoice payment time లో auto-emailed కూడా. PDFs digitally signed కాబట్టి tamper-evident మరియు accounting proof గా acceptable.',
  },
  'billing-payment-history': {
    question: 'Payment history ఎక్కడ చూడవచ్చు?',
    answer:
      'Billing → Orders ప్రతి transaction (paid / failed / refunded) ను timestamp, amount, plan, payment method మరియు invoice + ledger entry link తో చూపుతుంది. Status, date range లేదా plan ద్వారా filter చేయవచ్చు. Refunds separate negative-amount entries గా కనిపిస్తాయి, original order కు linked back. Accounting reconciliation కోసం same page నుండి full history CSV గా export చేయండి.',
  },
  'billing-receipt-vs-invoice': {
    question: 'Receipt మరియు tax invoice మధ్య తేడా ఏమిటి?',
    answer:
      'Receipt payment received అని confirm చేస్తుంది (Razorpay success పై immediately issue). Tax invoice tax purposes కోసం sale చూపే GST-compliant document — input tax credit claims మరియు accounting కోసం required. Hire Adda ప్రతి paid order కోసం రెండూ generate: receipt Razorpay confirmation email లో, tax invoice server-side generated మరియు minutes లో emailed + ఎప్పుడూ Billing → Invoices లో available.',
  },
  'billing-checkout-time': {
    question: 'Checkout కొన్నిసార్లు ఎందుకు long time తీసుకుంటుంది?',
    answer:
      'Checkout Razorpay order create చేస్తుంది, మీ account history కు fraud check run చేస్తుంది (new accounts extra scrutiny), మరియు entitlement quota reserve చేస్తుంది — usually <2 seconds. ఎక్కువ time తీసుకుంటే, bank లేదా UPI app redirect పై slow గా ఉండవచ్చు. Checkout >30 seconds stuck అయితే, page refresh (మీ order preserved) మరియు Billing → Orders నుండి "Resume payment" click. Recurring failures bank flag indicate చేయవచ్చు.',
  },
};

export const FAQS_TE: FaqEntry[] = FAQS_EN.map((entry) => {
  const t = TE_TRANSLATIONS[entry.id];
  return t ? { ...entry, question: t.question, answer: t.answer } : entry;
});
