import type { FaqEntry } from './types';
import { FAQS_EN } from './faqs.en';

/**
 * Tamil translations covering the full FAQ corpus. Untranslated entries
 * (if any) fall back to English at runtime.
 */
const TA_TRANSLATIONS: Record<string, { question: string; answer: string }> = {
  'create-account': {
    question: 'Hire Adda-வில் கணக்கை எப்படி உருவாக்குவது?',
    answer:
      'கணக்கு உருவாக்குவது எளிமையானது மற்றும் இலவசம். முகப்புப்பக்கத்தில் "Get Started" அல்லது "Sign Up" பொத்தானை அழுத்தவும். மின்னஞ்சல் மற்றும் கடவுச்சொல் கொண்டு பதிவு செய்யலாம், அல்லது Google/LinkedIn மூலம் விரைவாக பதிவுசெய்யலாம். பதிவு முடிந்த பிறகு, உங்கள் திறன்கள், அனுபவம் மற்றும் வேலை விருப்பங்களுடன் சுயவிவரத்தை முடிக்க வழிகாட்டப்படுவீர்கள்.',
  },
  'forgot-password': {
    question: 'கடவுச்சொல்லை எப்படி மீட்டமைப்பது?',
    answer:
      'கடவுச்சொல் மறந்துவிட்டால், உள்நுழைவு பக்கத்தில் "Forgot Password" அழுத்தவும். உங்கள் கணக்கின் மின்னஞ்சலை உள்ளிடவும் — மீட்டமைப்பு இணைப்பை அனுப்புவோம் (1 மணி நேரம் வரை செல்லுபடியாகும்). இணைப்பை அழுத்தி புதிய கடவுச்சொல்லை அமைக்கவும். மின்னஞ்சல் கிடைக்கவில்லை என்றால் spam folder-ஐ சரிபார்க்கவும் அல்லது ஆதரவு குழுவைத் தொடர்புகொள்ளவும்.',
  },
  'delete-account': {
    question: 'எனது கணக்கை எப்படி நீக்குவது?',
    answer:
      'கணக்கு நீக்க Settings → "Danger Zone" → "Delete Account" சென்று உறுதிப்படுத்தவும். கவனிக்கவும்: கணக்கு நீக்கல் நிரந்தரமானது — உங்கள் அனைத்து தரவும் (applications, சேமித்த jobs, செய்திகள்) 30 நாட்களுக்குள் முழுமையாக நீக்கப்படும்.',
  },
  'contact-support': {
    question: 'வாடிக்கையாளர் ஆதரவை எப்படி தொடர்புகொள்ள வேண்டும்?',
    answer:
      'பல வழிகளில் எங்களைத் தொடர்புகொள்ளலாம் — மின்னஞ்சல்: support@hireadda.in, இலவச எண்: +91 1762469136 (திங்கள்–வெள்ளி, காலை 9 – மாலை 6 IST), அல்லது Contact பக்கத்தின் மூலம் நேரடியாக செய்தி அனுப்பவும். உள்நுழைந்த பயனர்களுக்கு in-app chat ஆதரவும் உள்ளது. பொதுவாக 24 மணி நேரத்தில் பதிலளிப்போம்.',
  },
  'mobile-app': {
    question: 'Hire Adda-விற்கு mobile app உள்ளதா?',
    answer:
      'Android மற்றும் iOS-க்கான native apps தற்போது உருவாக்கம் செய்யப்படுகிறது — Q3 2026-இல் வெளியிட எதிர்பார்க்கப்படுகிறது. அதுவரை, இணையதளம் முழுமையாக mobile-responsive ஆகும் மற்றும் mobile browsers-இல் சிறப்பாக வேலை செய்யும். app-போன்ற அனுபவத்திற்கு "Add to Home Screen" உபயோகப்படுத்தலாம். Browser push notifications-ம் ஆதரிக்கப்படுகின்றன.',
  },
  'languages-supported': {
    question: 'Hire Adda எந்த மொழிகளை ஆதரிக்கிறது?',
    answer:
      'Hire Adda தற்போது ஆங்கிலத்தில் முழுமையாக கிடைக்கிறது. ஹிந்தி, தமிழ், தெலுங்கு, பெங்காலி மற்றும் மராத்தி UI மொழிபெயர்ப்புகள் 2026-இல் வெளிவருகின்றன. Job descriptions, applications மற்றும் search எந்த மொழியிலும் வேலை செய்யும் — எங்கள் matching engine அனைத்து முக்கிய இந்திய மொழிகளின் queries-ஐ புரிந்துகொள்கிறது. உங்கள் விருப்ப மொழியில் FAQ-ஐ படிக்க help center-இல் language picker-ஐ பயன்படுத்தவும்.',
  },
  'who-is-it-for': {
    question: 'Hire Adda யாருக்காக கட்டமைக்கப்பட்டது?',
    answer:
      'Hire Adda மூன்று audiences-ஐ முழுமையாக சேவை செய்கிறது — (1) வேலை தேடும் வேட்பாளர்கள் (புதியவர்கள் முதல் senior leaders வரை, ஒவ்வொரு துறையிலும்), (2) நியோக்தாக்கள் மற்றும் recruitment teams (முதல் வேலை post செய்யும் startup முதல் நூற்றுக்கணக்கான openings நிர்வகிக்கும் enterprises வரை), மற்றும் (3) clients-க்காக candidates-ஐ தேடும் recruitment-vendor agencies. ஒவ்வொரு audience-க்கும் பிரத்யேக dashboard, plan family மற்றும் ஆதரவு flow உள்ளது.',
  },
  'about-hire-adda': {
    question: 'Hire Adda என்றால் என்ன?',
    answer:
      'Hire Adda ஒரு India-first hiring platform — வேலை தேடுபவர்கள், நியோக்தாக்கள், மற்றும் recruitment vendors-ஐ ஒரே stack-இல் இணைக்கிறது. பாரம்பரிய job-posting-ஐ searchable CV database, AI-powered job matching, assisted hiring (எங்கள் team உங்களுக்காக CVs தேடும்), மற்றும் vendor marketplace-உடன் இணைக்கிறோம் — அனைத்தும் INR-இல், GST-compliant, மற்றும் இந்திய hiring market-க்காக கட்டமைக்கப்பட்டவை.',
  },
  'regions-served': {
    question: 'Hire Adda எந்த பகுதிகள் மற்றும் நகரங்களில் சேவை செய்கிறது?',
    answer:
      'Hire Adda பான்-இந்தியா — ஒவ்வொரு மாநிலம் மற்றும் ஒன்றியப் பகுதியிலும் jobs மற்றும் candidates பட்டியலிடப்பட்டுள்ளனர். எங்களுக்கு metros-இல் (பெங்களூரு, மும்பை, டெல்லி-NCR, ஹைதராபாத், புனே, சென்னை, கொல்கத்தா, அஹமதாபாத்) வலுவான கவரேஜ் உள்ளது, tier-2 மற்றும் tier-3 நகரங்களிலும் volumes வேகமாக வளர்கின்றன. Remote மற்றும் hybrid jobs எல்லைகளைத் தாண்டி வேலை செய்கின்றன.',
  },
  'safety-trust': {
    question: 'Jobs மற்றும் candidates genuine என்று எப்படி உறுதிப்படுத்துகிறீர்கள்?',
    answer:
      'ஒவ்வொரு employer-ம் company verification-க்கு (GST + PAN + domain email) உட்படுத்தப்படுகிறார். Job posts content moderation மூலம் scam patterns ("apply செய்ய pay", "MLM", impossible salaries) flag செய்யப்படுகின்றன. Candidate profiles email + mobile OTP verification பெறுகின்றன, மற்றும் employer/education/experience verification badges வழங்குகிறோம். சந்தேகத்திற்கிடமான activity-ஐ Trust & Safety team 24 மணி நேரத்திற்குள் மதிப்பாய்வு செய்கிறது.',
  },
  'report-fraudulent': {
    question: 'சந்தேகத்திற்கிடமான அல்லது மோசடி job posting-ஐ எப்படி report செய்வது?',
    answer:
      'மோசடி, தவறான வழிகாட்டும் அல்லது சந்தேகத்திற்கிடமான job listing கண்டால், job விவர பக்கத்தில் "Report" பொத்தானை அழுத்தவும். காரணத்தை தேர்ந்தெடுத்து கூடுதல் விவரங்களை வழங்கவும். எங்கள் moderation team அனைத்து reports-ஐயும் 24-48 மணி நேரத்திற்குள் மதிப்பாய்வு செய்கிறது. அவசர கவலைகளுக்கு safety@hireadda.in-க்கும் நேரடியாக reports அனுப்பலாம். உறுதிப்படுத்தப்பட்ட scams-க்கு உடனடி takedown மற்றும் employer-க்கு account suspension நடைபெறும்.',
  },
  'platform-stats': {
    question: 'Hire Adda-வில் எத்தனை jobs மற்றும் companies உள்ளன?',
    answer:
      'நேரடி எண்கள் homepage மற்றும் /about பக்கத்தில் update ஆகும். Q2 2026 வரை: 50,000+ candidates, 5,000+ verified employers, 200+ நகரங்களில் 12,000+ open roles, மற்றும் directory-இல் 800+ recruitment vendors. வாராந்திர application volume லட்சக்கணக்கானது. Blog மூலம் காலாண்டு aggregate platform analytics பகிர்கிறோம்.',
  },
  'two-factor-auth': {
    question: 'Two-Factor Authentication (2FA)-ஐ எப்படி enable செய்வது?',
    answer:
      'Settings → Security → Two-Factor Authentication திறக்கவும். எந்த authenticator app (Google Authenticator, Authy, 1Password) மூலமாகவும் QR code scan செய்து 6-digit code-ஐ உள்ளிடவும். Backup codes-ஐயும் generate செய்வோம் — device தொலைந்தால் பாதுகாப்பான இடத்தில் சேமித்து வையுங்கள். Password-less sign-in-க்கு passkey (Face ID, Touch ID) register செய்யலாம்.',
  },
  'trust-device': {
    question: '"Trust this device for 30 days" option என்ன செய்கிறது?',
    answer:
      '2FA verification வெற்றிகரமாக முடிந்த பிறகு இந்த option-ஐ தேர்ந்தெடுத்தால், தற்போதைய browser-இல் ஒரு secure cookie set ஆகும். அதே browser-இலிருந்து 30 நாட்களுக்குள் நடைபெறும் subsequent sign-ins 2FA prompt-ஐ skip செய்யும். Trust cookie அந்த browser-க்கு மட்டுமே bind ஆகி இருக்கும் — வேறு device, incognito window அல்லது புதிய browser-இலிருந்து sign-in செய்தால் 2FA தேவைப்படும். Settings → Security-இலிருந்து trusted devices-ஐ எப்போதும் revoke செய்யலாம்.',
  },
  'sessions-revoke': {
    question: 'Active sessions-ஐ எப்படி பார்க்கவும் revoke செய்யவும்?',
    answer:
      'Settings → Security → Active Sessions-இல் உங்கள் கணக்கில் sign-in செய்யப்பட்ட ஒவ்வொரு device/browser-ம் IP, location (city-level), மற்றும் last-active timestamp-உடன் பட்டியலிடப்படுகிறது. session-க்கு அருகே "Revoke" அழுத்தி அதை உடனடியாக sign-out செய்யவும், அல்லது "Revoke all other sessions" மூலம் தற்போதைய browser-ஐ மட்டும் வைக்கவும். Lost-phone scenarios இங்கே கையாளப்படுகின்றன.',
  },
  'lost-mfa-device': {
    question: 'Authenticator device தொலைந்துவிட்டது — கணக்கை எப்படி recover செய்வது?',
    answer:
      '2FA prompt-இல் "Can\'t access authenticator?" → "Send Recovery Code" அழுத்தவும். உங்கள் account email-க்கு 6-digit code அனுப்புவோம். அதை உள்ளிட்டால் 2FA disable ஆகி sign-in முடியும். உடனே 2FA மீண்டும் enable செய்யவும். ஆரம்பத்தில் 2FA enable செய்தபோது சேமித்த backup codes-ல் ஏதேனும் ஒன்றையும் பயன்படுத்தலாம் — ஒவ்வொரு backup code-ம் ஒருமுறை மட்டுமே வேலை செய்யும்.',
  },
  'data-privacy': {
    question: 'Hire Adda எனது தனிப்பட்ட தரவை எப்படி பாதுகாக்கிறது?',
    answer:
      'நாங்கள் இந்தியாவின் Digital Personal Data Protection (DPDP) Act-க்கு இணங்குகிறோம் மற்றும் OWASP Top 10 best practices-ஐ பின்பற்றுகிறோம். Data transit (TLS 1.3) மற்றும் rest இரண்டிலும் encrypted ஆக உள்ளது. Sensitive fields (mobile numbers, salaries, contact details) public APIs-இல் திருப்பித் தரப்படுவதில்லை — employers-க்கு பார்க்க CV unlock போன்ற specific entitlements தேவை. Settings-இலிருந்து உங்கள் தரவை எப்போதும் export அல்லது delete செய்யலாம்.',
  },
  'email-change': {
    question: 'எனது email address-ஐ எப்படி மாற்றுவது?',
    answer:
      'Settings → Account → Email → "Change" திறக்கவும். புதிய email மற்றும் தற்போதைய password உள்ளிடவும். புதிய email-க்கு verification link அனுப்புவோம் — அதை click செய்தால் account email மாறி, பழைய email-க்கு confirmation அனுப்பப்படுகிறது. பழைய email recovery channel-ஆக 7 நாட்கள் வேலை செய்து கொண்டே இருக்கும். பழைய email access இழந்தால், identity proof-உடன் support@hireadda.in-ஐ தொடர்புகொள்ளவும்.',
  },
  'password-strength': {
    question: 'Password requirements என்ன?',
    answer:
      'Passwords குறைந்தது ஒரு uppercase, ஒரு lowercase, ஒரு number, ஒரு special character உடன் 8+ characters இருக்க வேண்டும். மிகவும் பொதுவான 10,000 breached passwords-ஐ block செய்கிறோம் (HaveIBeenPwned-இன் public list-உடன் பொருத்தப்படுகிறது). Registration form-இல் strength meter real-time-ல் entropy காட்டுகிறது — "Strong" அல்லது "Very Strong" இலக்காக கொள்ளவும். அதிகபட்ச security-க்கு sign-up பின் 2FA enable செய்து password-less login-க்கு passkey register செய்யவும்.',
  },
  'multiple-accounts': {
    question: 'என்னுடைய candidate மற்றும் employer accounts தனித்தனியாக இருக்க முடியுமா?',
    answer:
      'ஆம் — accounts role-locked, ஒரு email ஒரு role மட்டுமே வைத்திருக்கும். Candidate மற்றும் employer features இரண்டும் பயன்படுத்த, வேறு email-உடன் இரண்டாவது account register செய்யவும். பல சிறு வணிக உரிமையாளர்கள் இதை செய்கிறார்கள்: job applications-க்கு personal email + hiring-க்கு company email. Multi-seat employer plans (CV Enterprise) team-member invites-ஐயும் ஆதரிக்கின்றன.',
  },
  'export-data': {
    question: 'எனது தரவை எப்படி export செய்வது?',
    answer:
      'Settings → Privacy → "Export my data" உங்கள் profile, applications, messages மற்றும் audit log-ஐ JSON + PDF-ஆக ஒரு ZIP-இல் generate செய்கிறது. Generation சில நிமிடங்கள் ஆகும்; 24 மணி நேரம் valid download link email செய்கிறோம். Abuse தடுக்க exports 7 நாட்களுக்கு ஒன்று என்று வரம்புக்குட்பட்டவை. இது DPDP Act-இன் data portability உரிமையை திருப்திப்படுத்துகிறது.',
  },
  'account-suspended': {
    question: 'எனது account suspend செய்யப்பட்டது — appeal எப்படி செய்வது?',
    answer:
      'Suspensions பொதுவாக மீண்டும் மீண்டும் content violations, மோசடி activity, அல்லது chargebacks-ஆல் ஏற்படுகின்றன. Login page காரணத்தையும் "Submit an appeal" link-ஐயும் காண்பிக்கும். Appeals 3-5 working days-க்குள் வேறு moderator-ஆல் மதிப்பாய்வு செய்யப்படுகின்றன. தவறாக suspend செய்யப்பட்டால், மீண்டும் reinstate செய்யப்படுவீர்கள் மற்றும் consumed quota restore செய்யப்படும். கடுமையான violations (fake jobs, scam operations) appeal-க்கு eligible அல்ல.',
  },
  'candidate-apply-job': {
    question: 'வேலைகளுக்கு எப்படி விண்ணப்பிப்பது?',
    answer:
      'சுயவிவரம் உருவாக்கிய பிறகு, தேடல் பட்டியின் மூலம் வேலைகளைப் பார்வையிடவும் அல்லது டாஷ்போர்டில் பரிந்துரைக்கப்பட்ட பட்டியல்களைப் பாருங்கள். விரும்பிய வேலையின் விவர பக்கத்தில் "Apply" அழுத்தவும் — உங்கள் சுயவிவரம் மற்றும் ரெசுயூமே வழங்குநருக்கு பகிரப்படும். "Quick Apply" மூலம் பல பதவிகளுக்கு ஒரே கிளிக்கில் விண்ணப்பிக்கலாம்.',
  },
  'candidate-update-profile': {
    question: 'எனது profile-ஐ எப்படி update செய்வது?',
    answer:
      'Account-இல் login செய்து dashboard-இலிருந்து profile page-க்கு செல்லவும். உங்கள் personal info, work experience, education, skills மற்றும் preferences எந்த நேரத்திலும் edit செய்யலாம். "Edit Profile" அழுத்தி changes செய்யுங்கள் — சேமிக்க மறக்க வேண்டாம். Updated profile எங்கள் matching engine-க்கு உங்களுக்கு சிறந்த opportunities கண்டுபிடிக்க உதவுகிறது.',
  },
  'candidate-resume-upload': {
    question: 'நான் என்ன resume formats upload செய்யலாம்?',
    answer:
      'CV-ஐ PDF அல்லது DOCX-ஆக upload செய்யவும் (max 10 MB). எங்கள் Document AI parser உங்கள் work history, education மற்றும் skills-ஐ தானாகவே extract செய்கிறது — சேமிக்கும் முன் suggested fields மதிப்பாய்வு செய்யவும். Profile-இல் பல resume versions வைக்கலாம் மற்றும் ஒவ்வொரு application-உடன் எது அனுப்ப வேண்டும் என்று தேர்வு செய்யலாம். Tip: தெளிவான section headings உள்ள structured PDF மிகவும் accurately parse ஆகிறது.',
  },
  'candidate-premium-benefits': {
    question: 'Candidate Premium (₹199) என்ன அளிக்கிறது?',
    answer:
      '₹199-க்கு (ஒரு முறை) Candidate Premium ஐந்து பலன்களை அளிக்கிறது: AI Resume Premium (4 கட்டண templates), சுயவிவரத்தில் Verified Badge, 7 நாட்கள் Profile Boost (recruiter searches-இல் முதலில்), Priority WhatsApp ஆதரவு, மற்றும் உங்கள் திறன்களுக்கு Top Visibility தரவரிசை. திட்டம் 30 நாட்களுக்கு செல்லுபடியாகும்.',
  },
  'candidate-applications-track': {
    question: 'எனது applications-ஐ எப்படி track செய்வது?',
    answer:
      'Dashboard → Applications திறக்கவும். ஒவ்வொரு வரிசையும் role, company, தற்போதைய status (Applied / Reviewed / Shortlisted / Interview / Hired / Rejected) மற்றும் சமீபத்திய update timestamp காண்பிக்கிறது. முழு timeline-க்கு எந்த application-மீதும் click செய்யவும் — employer-side notes (பகிரப்பட்டால்) மற்றும் screening question பதில்களும் தெரியும். ஒவ்வொரு status மாற்றத்தில் email + push notifications அனுப்புகிறோம்.',
  },
  'candidate-profile-visibility': {
    question: 'என் தற்போதைய employer-இடமிருந்து profile-ஐ மறைக்க முடியுமா?',
    answer:
      'ஆம் — Settings → Privacy → "Hide profile from selected employers" குறிப்பிட்ட company accounts-ஐ (மற்றும் அந்த company-இன் domain-ல் இருந்து எந்த user-ஐயும்) CV-database searches-இல் உங்கள் profile பார்ப்பதிலிருந்து block செய்ய அனுமதிக்கிறது. "Make profile private" மூலம் profile முற்றிலுமாக மறைக்கப்படும் — நீங்கள் actively apply செய்யும் jobs-இல் மட்டுமே தோன்றும். அந்த employer-உடனான application history பாதிக்கப்படாது.',
  },
  'candidate-job-alerts': {
    question: 'Job alerts எப்படி வேலை செய்கின்றன?',
    answer:
      'Jobs page-இல் ஓட்டிய எந்த search-ஐயும் Job Alert-ஆக சேமிக்கவும் — புதிய matching roles-ஐ daily, weekly அல்லது instantly (நீங்கள் தேர்வு செய்யுங்கள்) email செய்வோம். Alerts உங்கள் filters-ஐ துல்லியமாக மதிக்கின்றன: skills, location, experience, work mode, salary range. Dashboard → Job Alerts-இலிருந்து எப்போதும் pause/manage செய்யவும். 30 நாட்களில் எந்த alert-ஐயும் click செய்யவில்லை எனில், அவை தானாகவே நிறுத்தப்படும்.',
  },
  'candidate-recommendations': {
    question: 'Job recommendations எப்படி generate செய்யப்படுகின்றன?',
    answer:
      'Recommendations மூன்று signals-ஐ ஒருங்கிணைக்கின்றன: (1) உங்கள் profile மற்றும் job-இன் required skills இடையே overlap (recency-weighted), (2) Google Cloud Talent-இன் AI matching, (3) உங்கள் historical interaction (applies, saves, dismissals)-இலிருந்து கற்ற preferences. Recommendations ஒவ்வொரு 4 மணி நேரத்திற்கும் refresh ஆகின்றன — Recommendations page-இலிருந்து manually-ம் refresh செய்யலாம்.',
  },
  'candidate-interview-prep': {
    question: 'Hire Adda interview preparation-க்கு உதவுகிறதா?',
    answer:
      'Hire Adda மூலம் employer interview schedule செய்யும் போது, application விவர பக்கம் ஒரு tailored prep panel காண்பிக்கிறது: employer ஐ historically கேட்ட top skills, அவர்களின் successful hires சராசரியாக preparation time, மற்றும் கொண்டுவர வேண்டிய artefacts checklist (resume, ID, certificates). Role + city-க்கு குறைந்தது 3 hires முடிந்தால் salary-range data-வையும் காண்பிக்கிறோம்.',
  },
  'candidate-resume-templates': {
    question: 'Candidate Premium-இல் என்ன resume templates உள்ளன?',
    answer:
      'Premium 4 paid templates-ஐ unlock செய்கிறது (default free-க்கு கூடுதலாக): Modern Minimal (clean two-column), Executive Classic (single-column traditional), Creative Bold (design / marketing roles-க்கு color accents), மற்றும் ATS Pro (applicant-tracking-system parsing-க்கு optimised). ஒவ்வொரு template-ம் உங்கள் existing profile data-ஐ auto-format செய்கிறது — re-typing இல்லை. வாங்கும் முன் அனைத்து 5-ம் (1 free + 4 premium) preview செய்யலாம்.',
  },
  'candidate-saved-jobs': {
    question: 'Saved jobs எப்படி வேலை செய்கின்றன?',
    answer:
      'எந்த job-மீதும் bookmark icon click செய்து பிறகு பயன்படுத்த சேமிக்கவும். Saved jobs Dashboard → Saved Jobs-இல் தோன்றும். சேமிப்பு private — employers யார் சேமித்தனர் என்று பார்க்க முடியாது. Filled அல்லது expired ஆன saved jobs auto-archived ஆகின்றன ஆனால் "இனி applications ஏற்க இல்லை" note-உடன் உங்கள் list-இல் visible-ஆகவே இருக்கும். எத்தனை jobs சேமிக்கலாம் என்பதற்கு வரம்பு இல்லை.',
  },
  'candidate-apply-without-account': {
    question: 'Account உருவாக்காமல் apply செய்ய முடியுமா?',
    answer:
      'இல்லை — applications-க்கு account தேவை, ஏனெனில் உங்கள் application + resume-ஐ employer-க்கு நம்பகமாக deliver செய்ய, follow-ups ஆதரிக்க மற்றும் status track செய்ய அனுமதிக்க. Account உருவாக்கம் இலவசம் மற்றும் ~60 விநாடிகள் ஆகும். Registration உங்களை job சேமிக்க, similar roles-க்கு alerts set செய்ய மற்றும் எதிர்காலத்தில் single click-ஐ apply செய்ய அனுமதிக்கிறது.',
  },
  'candidate-mock-interview': {
    question: 'Hire Adda mock interviews வழங்குகிறதா?',
    answer:
      'AI-powered mock interviews தேர்ந்தெடுக்கப்பட்ட roles-க்கு (software engineering, sales, customer support) beta-இல் உள்ளன. System role-specific கேள்விகள் கேட்கிறது, உங்கள் audio பதிலை record செய்து answer structure, filler words மற்றும் குறிப்பிடப்பட்ட key skills-ஐ feedback கொடுக்கிறது. Premium candidates-க்கு இலவசம், மாதம் 3 mock sessions-வரை. உங்கள் role scope-இல் இருக்கும்போது Dashboard → Mock Interview-இலிருந்து திறக்கவும்.',
  },
  'candidate-salary-research': {
    question: 'Apply செய்வதற்கு முன்பு salaries research செய்ய முடியுமா?',
    answer:
      'ஆம் — ஒவ்வொரு job listing-ம் set ஆகும் போது employer-disclosed salary range காண்பிக்கிறது. Undisclosed roles-க்கு, listing அதே போல similar hires-இலிருந்து derived estimated range காண்பிக்கிறது (≥10 data points இருக்கும் போது). Dashboard → Salary Insights-இல் broader market data கிடைக்கிறது: role, city மற்றும் years of experience-க்கு median + range, மற்றும் profile-ல் நிரப்பப்பட்டிருந்தால் current/expected CTC ஒப்பீடு.',
  },
  'candidate-fake-job-detection': {
    question: 'Candidates-ஐ fake jobs-இலிருந்து எப்படி பாதுகாக்கிறீர்கள்?',
    answer:
      'மூன்று layers: (1) post செய்வதற்கு முன் ஒவ்வொரு employer verify ஆகிறார் (GST + PAN + domain email); (2) job posts automated moderation மூலம் scammy patterns ("apply-க்கு pay", "registration fee", "investment opportunity") block செய்யப்படுகின்றன; (3) ஒவ்வொரு job-மீதான in-app Trust Score (0-5 stars) employer-இன் past hires + verifications + report rate-ஐ factor செய்கிறது. 3 stars-க்கு கீழ் scoring jobs தவிர்த்து upfront பணம் கேட்கும் எந்த role-ஐயும் report செய்யவும்.',
  },
  'candidate-skill-test': {
    question: 'Hire Adda-இல் skill assessments உள்ளனவா?',
    answer:
      'ஆம் — employers jobs-உடன் skill assessments attach செய்யலாம் (multiple-choice, coding, video answers). Apply form-இல் assessment requirement தெரியும் மற்றும் apply செய்த 48 மணி நேரத்திற்குள் எடுக்கலாம். Scores உங்களுக்கும் employer-க்கும் visible. Top in-demand skills-க்கு (JavaScript, Python, English communication, Excel) profile-இல் self-administered skill tests-ஐயும் ஆதரிக்கிறோம் — pass ஆனால் verified badge சேர்க்கப்படுகிறது.',
  },
  'employer-post-job': {
    question: 'வேலைவாய்ப்பு வழங்குநராக வேலையை எப்படி பதிவிடுவது?',
    answer:
      'வேலைவாய்ப்பு வழங்குநராக பதிவு செய்து உங்கள் நிறுவன சுயவிவரத்தை முடிக்கவும். சரிபார்ப்புக்குப் பிறகு Employer Dashboard-இல் "Post a Job" அழுத்தவும். தலைப்பு, விவரம், தேவையான திறன்கள், சம்பள வரம்பு போன்றவற்றை நிரப்பவும். குணமை உறுதிப்படுத்த ஒரு குறுகிய மிதப்பு மறுஆய்வுக்குப் பிறகு உங்கள் பட்டியல் நேரடியாக ஏற்றப்படும்.',
  },
  'employer-free-plan': {
    question: 'Free Job Post திட்டம் (₹0) என்ன கொண்டுள்ளது?',
    answer:
      'Free திட்டத்தில் 1 வேலை பதிவு 7 நாட்களுக்கு நேரடியாக, அதிகபட்சம் 50 விண்ணப்பங்கள், 1 இடம், அடிப்படை candidate dashboard அணுகல் மற்றும் standard listing visibility கிடைக்கின்றன. Validity நீட்டிக்க, application cap உயர்த்த மற்றும் CV-database அணுகல் பெற Standard (₹499) அல்லது Premium (₹999) ஆக மேம்படுத்தலாம்.',
  },
  'employer-cv-database': {
    question: 'CV Database (Talent Vault) என்றால் என்ன?',
    answer:
      'CV Database ஒவ்வொரு candidate profile-ம் searchable index. Skills, location, experience, salary, last-active, education போன்றவற்றால் filter செய்யவும். ஒவ்வொரு plan-ம் நிலையான எண்ணிக்கை "CV unlocks" அளிக்கிறது — candidate-இன் contact details (email + phone) பார்த்தால் ஒரு unlock quota-இலிருந்து consume ஆகிறது. Search இலவசம்; contact info reveal செய்வதற்கு மட்டுமே cost. CV Lite = 200, CV Pro = 500, CV Enterprise = 1000+.',
  },
  'employer-applications-cap': {
    question: 'Job-ன் applications cap முடிந்தால் என்ன நடக்கும்?',
    answer:
      'புதிய applications block ஆகும் — candidates-க்கு "Job is full" message தெரியும். நீங்கள் பெறப்பட்ட அனைத்து applications-ஐயும் பார்த்து shortlist செய்ய முடியும். Free = 50, Standard = 250, Premium = unlimited. Mid-cycle upgrade-ல் அந்த listing-இன் cap உடனடியாக நீக்கப்படும். Cap per-job (account-level அல்ல) மற்றும் re-post செய்தால் reset ஆகிறது.',
  },
  'employer-team-multi-seat': {
    question: 'என் கம்பெனியின் பல recruiters ஒரே account share செய்ய முடியுமா?',
    answer:
      'ஆம் — Dashboard → Team-இலிருந்து teammates-ஐ invite செய்யவும். CV Enterprise plans multi-seat sharing-ஐ உள்ளடக்கியவை: invitees RECRUITER அல்லது ADMIN team members ஆகி, company-இன் shared CV-unlock + search-result quota pool-இலிருந்து consume செய்கின்றனர். Lower-tier plans (Standard, Premium, CV Lite, CV Pro) single-seat மட்டுமே. Owner எப்போதும் ownership transfer செய்ய அல்லது seats revoke செய்ய முடியும்.',
  },
  'employer-assisted-hiring': {
    question: 'Assisted Hiring (₹1499) எப்படி வேலை செய்கிறது?',
    answer:
      '₹1499 செலுத்துங்கள் → எங்கள் specialist ஒரு working day-க்குள் call செய்து role scope செய்வார் → 7 நாட்களுக்குள் 4–5 matching CVs source செய்து உங்களுக்கு email செய்வோம். நீங்கள் candidates-உடன் சொந்தமாக contact + interview செய்வீர்கள்; matching legwork நாங்கள் செய்கிறோம். ஒவ்வொரு plan ஒரு role-ஐ cover செய்கிறது. Dashboard → Assisted Hiring-இல் progress track செய்யவும்.',
  },
  'employer-urgent-badge': {
    question: 'Urgent Hiring Badge எப்படி வேலை செய்கிறது?',
    answer:
      'Premium ₹999 plan-இல் கிடைக்கும். Job-ஐ posting-போது URGENT அல்லது IMMEDIATE-ஆக mark செய்தால், listing cards-இல் சிவப்பு Urgent badge + candidate searches-இல் +20 ranking boost + candidate dashboards-இன் Urgent jobs widget-இல் காண்பிக்கப்படும். முதல் hire ஆனாலோ அல்லது job-இன் validity முடிந்தாலோ badge தானாகவே நீக்கப்படும்.',
  },
  'employer-verification': {
    question: 'என் company-ஐ எப்படி verify செய்வது?',
    answer:
      'Settings → Verification → GST certificate, PAN மற்றும் company-domain email proof submit செய்யவும். எங்கள் team 1–2 working days-இல் review செய்யும். Verified companies-க்கு ஒவ்வொரு job listing, company profile page மற்றும் recruiter outreach-இல் பச்சை checkmark தெரியும் — verified listings-இல் candidates நம்பிக்கை ~40% அதிக application rate கொடுக்கிறது.',
  },
  'employer-screening-questions': {
    question: 'என் job-இல் screening questions சேர்க்க முடியுமா?',
    answer:
      'ஆம் — job post அல்லது edit செய்யும்போது "Screening Questions" வரை scroll செய்து 10 custom questions (text, multiple choice, yes/no) சேர்க்கலாம். Required (apply செய்ய பதில் கொடுக்க வேண்டியவை) அல்லது deal-breaker (தவறான பதில் auto-rejects)-ஆக mark செய்யுங்கள். Candidates apply form-இல் questions பார்க்கின்றனர்; பதில்கள் application விவர பக்கத்தில் தோன்றும்.',
  },
  'employer-analytics': {
    question: 'என்ன analytics கிடைக்கின்றன?',
    answer:
      'Employer Analytics உங்கள் hiring funnel (Views → Applies → Shortlists → Interviews → Hires)-ஐ ஒவ்வொரு job-மீதும் மற்றும் ஒட்டுமொத்தமாக காண்பிக்கிறது, time-to-hire மற்றும் time-to-fill metrics, source breakdown (organic search, recommendations, applications, CV unlocks), மற்றும் multi-seat plan-ல் இருந்தால் team-member productivity. CSV export கிடைக்கிறது. Premium மற்றும் CV Enterprise plans கூடுதல் cohort + benchmark views கொடுக்கின்றன.',
  },
  'employer-edit-job': {
    question: 'Posting பின் job-ஐ எப்படி edit செய்வது?',
    answer:
      'Dashboard → My Jobs → job-மீது click → "Edit". Description, requirements, screening questions மற்றும் salary range-ஐ எப்போதும் update செய்யலாம். Changes ஒரு quick moderation re-check பின் (வழக்கமாக ஒரு மணி நேரத்திற்குள்) live ஆகின்றன. முதல் application கிடைத்த பின் critical fields (job title, type, work mode) edit செய்ய முடியாது — அதற்கு பதிலாக role-ஐ close செய்து புதியது post செய்யவும்.',
  },
  'employer-close-job': {
    question: 'Job listing-ஐ எப்படி early-ஆக close செய்வது?',
    answer:
      'Dashboard → My Jobs → job-மீது click → "Close listing". காரணம் ஒன்றை தேர்வு செய்யுங்கள் (Filled / Cancelled / Reposting) — hiring analytics-ஐ பாதிக்கிறது. Closed jobs உடனடியாக நாயற்ற applications ஏற்கிறதை நிறுத்துகின்றன மற்றும் 5 நிமிடங்களுக்குள் public search-இலிருந்து மறைகின்றன. Existing applications review மற்றும் outreach-க்கு accessible-ஆக இருக்கின்றன. Job close செய்வது remaining validity-ஐ refund செய்யவில்லை.',
  },
  'employer-bulk-cv-download': {
    question: 'Bulk CV download எப்படி வேலை செய்கிறது?',
    answer:
      'CV Enterprise plans bulk download-ஐ unlock செய்கின்றன. Filters-உடன் CV database search செய்து → candidates check செய்யுங்கள் (max 100 per export) → "Download CVs as ZIP" click செய்யுங்கள். ZIP-ல் ஒவ்வொரு PDF candidate-இன் சமீபத்திய resume + structured profile summary. ஒவ்வொரு downloaded CV ஒரு CV-unlock quota-இலிருந்து consume செய்கிறது (Enterprise plans-ல் unlimited unlocks). Downloads audit-க்கு logged.',
  },
  'employer-application-export': {
    question: 'என் applications-ஐ Excel / CSV-க்கு export செய்ய முடியுமா?',
    answer:
      'ஆம் — Dashboard → Applications → உங்கள் scope-க்கு Filter (job, status, date range-ஆல்) → "Export as CSV". Export-இல் candidate name, contact (unlocked candidates-க்கு மட்டுமே), application status, applied-on date, screening answers மற்றும் shortlist notes உள்ளன. Contact unlock செய்யவில்லை எனில் PII mask செய்யப்படுகிறது. Quota abuse தடுக்க exports per day 5 வரை மட்டும்.',
  },
  'employer-team-roles': {
    question: 'Team roles-க்கு என்ன permissions உள்ளன?',
    answer:
      'மூன்று roles: OWNER (full access — billing + ownership transferring உட்பட), ADMIN (jobs, applications, team invites manage செய்யவும், ஆனால் billing மாற்ற முடியாது அல்லது company account close செய்ய முடியாது), RECRUITER (CVs search செய்யவும், applicants shortlist செய்யவும், company account-க்கு jobs post செய்யவும், ஆனால் team members invite செய்ய முடியாது). அனைத்து roles-ம் company-இன் CV-unlock + search-result quota pool-ஐ share செய்கின்றன. Team & roles Dashboard → Team-இலிருந்து manage செய்யப்படுகின்றன.',
  },
  'employer-vendor-find': {
    question: 'Recruitment partner / vendor-ஐ எப்படி கண்டுபிடிப்பது?',
    answer:
      '/vendors (public directory)-ஐ பார்க்கவும் மற்றும் specialisation, location, industry, team size மற்றும் verification status-ஆல் filter செய்யவும். முழு profile + past placements-க்கு எந்த vendor-மீதும் click செய்யவும். Role விவரங்களை share செய்ய "Send hiring requirement" பயன்படுத்தவும் — vendor தங்கள் lead inbox-இல் இதை பார்க்கிறார்கள் மற்றும் வழக்கமாக 24 மணி நேரத்திற்குள் உங்களை contact செய்வார்கள். Requirement share செய்வது இலவசம்; vendor-உடன் நேரடியாக contract sign செய்தால் மட்டுமே நீங்கள் pay செய்கிறீர்கள் (platform fee இல்லை).',
  },
  'employer-multi-location': {
    question: 'Multiple locations-ல் job post செய்ய முடியுமா?',
    answer:
      'ஆம், paid plans-ல் மட்டும் — Free plan per job 1 location-ல் cap. Standard, Premium மற்றும் CV Enterprise அதே listing-ல் additional locations அனுமதிக்கின்றன (per-location cap இல்லை), Bengaluru, Mumbai மற்றும் Pune offices உள்ள single role 3 separate posts தேவையில்லாமல் மூன்று city searches-இல் தோன்றுகிறது. Location-specific applicants flag செய்யப்படுகிறார்கள். Post-job form-ல் "Job locations"-கீழ் additional locations சேர்க்கவும்.',
  },
  'vendor-what-is': {
    question: 'Vendor Connect என்றால் என்ன, யாருக்கு?',
    answer:
      'Vendor Connect recruitment agencies, staffing partners மற்றும் independent recruiters-க்கு — பல client companies-க்காக candidates-ஐ source செய்பவர்களுக்கு. ₹199/மாதம் (auto-renewed)-க்கு, எங்கள் public Vendor Directory-இல் listed ஆகிறீர்கள், specialisations-உடன் match ஆகும் companies-இலிருந்து routed hiring leads பெறுகிறீர்கள், மற்றும் employers-க்கு referral option-ஆக surface ஆகிறீர்கள். Plan மாதாந்தரம், எப்போதும் cancel செய்யலாம்.',
  },
  'vendor-receive-leads': {
    question: 'Hiring leads எப்படி பெறுவது?',
    answer:
      'Subscribe செய்த பின் "Specialisations" (IT, BFSI, healthcare போன்றவை), service locations மற்றும் industries configure செய்யவும். உங்கள் criteria-உடன் match ஆகும் "Find Recruitment Partners" search செய்யும் companies-க்கு directory-இல் தோன்றுகிறீர்கள். அவர்கள் hiring requirement நேரடியாக அனுப்பலாம் — Dashboard → Lead Inbox-இல் முழு role விவரங்கள் மற்றும் contact info-உடன் பார்க்கலாம்.',
  },
  'vendor-priority-leads': {
    question: 'Priority Access to New Leads எப்படி வேலை செய்கிறது?',
    answer:
      'Vendor Connect subscribers company பார்க்கும் matching score-ல் +5 ranking bonus பெறுகின்றனர், candidate vendors-இன் preview list-ல் நீங்கள் higher தோன்றுகிறீர்கள். Priority overlap quality (skills + location + industry)-ஆல் ordered, perfect-match basic vendor unrelated priority vendor-க்கு மேல் rank ஆவார். Leads exclusive அல்ல — ஒரே role-க்கு பல vendors contact செய்யப்படலாம்.',
  },
  'vendor-public-listing': {
    question: 'என் agency profile public-ஆக எங்கே காண்பிக்கப்படுகிறது?',
    answer:
      'Active subscribers public /vendors directory-இல் தோன்றுகிறார்கள் (யாரும் browse செய்யலாம், Google indexed) மற்றும் /vendors/{slug}-இல் dedicated profile page உள்ளது — specialisations, locations, team size மற்றும் (optional) testimonials காண்பிக்கின்றன. Employer Dashboard → Vendor → Business Profile-இலிருந்து public profile edit செய்யவும் — content moderation review பின் சில நிமிடங்களில் changes live ஆகின்றன.',
  },
  'vendor-cancel': {
    question: 'Vendor Connect-ஐ எப்படி cancel செய்வது?',
    answer:
      'Billing → Subscriptions → Vendor Connect → "Cancel auto-renew" திறக்கவும். உங்கள் access current billing period-இன் முடிவு வரை (வாங்கிய 30 நாட்கள்) தொடர்கிறது மற்றும் பின்னர் lapse ஆகும் — புதிய leads பெறுவதை நிறுத்துகிறீர்கள் ஆனால் historical data retain ஆகிறது. எப்போதும் resubscribe செய்யலாம்; existing profile data subscriptions இடையே preserve ஆகிறது.',
  },
  'vendor-onboarding': {
    question: 'Vendor onboarding process எப்படி தோன்றுகிறது?',
    answer:
      'Employer-ஆக உங்கள் company name + GST + PAN-உடன் register செய்யுங்கள் → employer dashboard-இலிருந்து Vendor Connect plan-ஐ subscribe செய்யுங்கள் → vendor profile complete செய்யுங்கள் (specialisations, service locations, industries, team size, sample placements) → verification-க்கு submit செய்யுங்கள் → approve ஆனால் Vendor Connect plan charge ஆரம்பிக்கிறது (வழக்கமாக 1-2 working days). Approval பின், public directory-இல் தோன்றுகிறீர்கள் மற்றும் routed leads ஆரம்பிக்கின்றன.',
  },
  'vendor-multiple-clients': {
    question: 'பல client companies-க்கு serve செய்ய முடியுமா?',
    answer:
      'ஆம் — Vendor Connect எந்த exclusivity restrictions-ம் வைக்கவில்லை. தற்போது serve செய்யும் எத்தனை client companies-ஐயும் public profile-ல் (அனுமதியுடன்) list செய்யுங்கள்; எவ்வளவு showcase செய்ய முடியுமோ, directory searches-ல் trust signal அவ்வளவு higher. Leads exclusive அல்ல — பல vendors ஒரே role-க்கு contact செய்யப்படலாம்.',
  },
  'vendor-share-candidates': {
    question: 'என் candidates-இன் contact details Hire Adda-உடன் share செய்ய வேண்டுமா?',
    answer:
      'இல்லை — Vendor Connect lead-gen + listing service, candidate-data marketplace அல்ல. உங்கள் candidate database உங்களுடையதாகவே இருக்கிறது. ஒரு company உங்களுக்கு lead அனுப்பினால், off-platform-ல் (email, phone, உங்கள் CRM) அவர்களை contact செய்து உங்கள் pool-இலிருந்து candidates place செய்கிறீர்கள். எங்கள் மூலம் வெற்றிகரமான hires-க்கு placement fee அல்லது commission எடுக்கவில்லை.',
  },
  'vendor-rating': {
    question: 'Vendors-ஐ clients rate செய்கிறார்களா?',
    answer:
      'ஆம் — lead conclude ஆனபின் (hire successful, role cancelled, அல்லது 90 days), company private 1-5 rating + optional written feedback வைக்கலாம். உங்கள் average rating + total reviews 5+ ratings-க்கு பின் public profile-ல் தோன்றும் (noisy single-review averages தவிர்க்க). 3-star-க்கு கீழ் ratings உங்களுக்கு private explanation கொடுக்கின்றன; factually wrong reviews support-மூலம் dispute செய்யலாம்.',
  },
  'billing-gst': {
    question: 'விலையில் GST சேர்க்கப்பட்டுள்ளதா?',
    answer:
      'ஆம் — பட்டியலிடப்பட்ட அனைத்து திட்டங்களும் 18% GST உள்ளடங்கியவை. கட்டணம் செலுத்திய பிறகு HSN code 998314-உடன் வரி invoice தானாக உருவாக்கப்பட்டு உங்களுக்கு மின்னஞ்சல் செய்யப்படும். Invoices Billing → Invoices-இல் PDF-ஆக எப்போது வேண்டுமானாலும் பதிவிறக்கம் செய்யலாம். B2B GSTIN உரிமைகோரல்களுக்கு checkout-க்கு முன் Billing → Tax Details-இல் உங்கள் நிறுவன GSTIN சேர்க்கவும்.',
  },
  'billing-payment-methods': {
    question: 'என்ன கட்டண முறைகளை ஏற்றுக்கொள்கிறீர்கள்?',
    answer:
      'UPI (Google Pay / PhonePe / Paytm / BHIM / எந்த UPI app-உம்), அனைத்து முக்கிய credit/debit கார்டுகள் (Visa, Mastercard, RuPay, Amex), 50+ இந்திய வங்கிகளில் netbanking, mobile wallets (Paytm, MobiKwik, Freecharge), மற்றும் ₹3,000-க்கு மேலான கார்டுகளுக்கு EMI. Non-INR நாணயங்களுக்கு international cards-உம் (auto-FX). கட்டணங்கள் Razorpay மூலம் செயலாக்கப்படுகின்றன — நாங்கள் கார்டு விவரங்களை சேமிக்கவில்லை.',
  },
  'billing-cancel-refund': {
    question: 'வாங்கிய பிறகு திட்டத்தை ரத்துசெய்து திரும்பப் பெறலாமா?',
    answer:
      'வாங்கிய 2 நாட்களுக்குள் refund கோரலாம் — quota உபயோகிக்கப்படவில்லை என்றால் மட்டும் (CV unlock இல்லை, paid plan-இல் job post இல்லை, Assisted Hiring call scheduled இல்லை). 2 நாட்கள் கடந்த பிறகு அல்லது நுகர்வுக்கு பிறகு திட்டங்கள் non-refundable, ஆனால் எதிர்கால charges நிறுத்த auto-renew எப்போது வேண்டுமானாலும் ரத்துசெய்யலாம். முழு விவரங்களுக்கு Refund Policy பார்க்கவும்.',
  },
  'billing-recurring': {
    question: 'Recurring payments-ஐ ஆதரிக்கிறீர்களா?',
    answer:
      'ஆம் — Vendor Connect (₹199/மாதம்) Razorpay eMandate (cards) அல்லது UPI AutoPay (UPI) மூலம் மாதாந்திரம் auto-renewed. மற்ற plans அதே window-ல் optional auto-renew ஆதரிக்கின்றன. Billing → Subscriptions-இலிருந்து எப்போதும் auto-renew cancel செய்யுங்கள்; cancellation எதிர்கால charges உடனடியாக நிறுத்துகிறது மற்றும் current cycle முடியும் வரை access தொடர்கிறது.',
  },
  'billing-upgrade-mid-cycle': {
    question: 'Mid-cycle upgrades எப்படி வேலை செய்கின்றன?',
    answer:
      'Current plan-இல் remaining validity மற்றும் unused quota-இலிருந்து pro-rated credits compute செய்து புதிய plan price-இலிருந்து deduct செய்கிறோம் — நீங்கள் வேறுபாடு மட்டுமே pay செய்கிறீர்கள். Unused CV unlocks புதிய plan-க்கு carry forward ஆகின்றன (per-plan cap). Job posts in flight original validity-ல் தொடர்கின்றன; புதிய posts upgraded plan settings பயன்படுத்துகின்றன. Upgrades உடனடியாக active; downgrades-க்கு refund இல்லை.',
  },
  'billing-quote-enterprise': {
    question: 'CV Enterprise-க்கு custom quote எப்படி பெறுவது?',
    answer:
      'CV Enterprise card-ல் "Contact Sales" click செய்யுங்கள் அல்லது /billing/quote-க்கு செல்லுங்கள். Team size, expected CV unlock volume மற்றும் compliance requirements (DPDP, custom MSA, on-prem deployment) நிரப்புங்கள். எங்கள் sales team 1 working day-க்குள் tailored proposal-உடன் response செய்யும். Custom plans வழக்கமாக unlimited search results, multi-seat sharing, bulk CV download, dedicated CSM மற்றும் SLA-backed dedicated support உள்ளடக்கியவை.',
  },
  'billing-currency-fx': {
    question: 'INR அல்லாத currency-ல் pay செய்ய முடியுமா?',
    answer:
      'ஆம் — international cards Razorpay-இன் FX engine மூலம் auto-converted. Page-ல் default INR pricing தோன்றுகிறது; checkout-ல் visualisation-க்கு displayed currency (USD / EUR / GBP / SGD / AED) switch செய்யலாம், ஆனால் card-க்கு charge எப்போதும் INR-ல், bank-இன் standard FX rate apply செய்யப்படுகிறது. GST இந்திய customers-க்கு மட்டுமே; international invoices zero-GST.',
  },
  'billing-failed-payment': {
    question: 'Payment fail ஆனது — என்ன நடக்கும்?',
    answer:
      'One-time plans-க்கு, Billing → Orders → "Resume Payment" உடனடியாக retry செய்யலாம் (link 24 hours valid). Auto-renewed subscriptions-க்கு, 7 நாட்களில் 4 முறை வரை auto retry செய்கிறோம்; ஒவ்வொரு failed attempt பின் retry link-உடன் email கிடைக்கிறது. 4 failures-க்கு பின் subscription grace mode-ல் (3 கூடுதல் நாட்கள் access) நுழைகிறது மற்றும் இறுதியில் lapse ஆகிறது. Resume செய்ய எப்போதும் payment method update செய்யுங்கள்.',
  },
  'billing-invoice-gstin': {
    question: 'Input tax credit-க்கு invoices-ல் என் company GSTIN சேர்க்க முடியுமா?',
    answer:
      'ஆம் — Billing → Tax Details → checkout-க்கு முன் 15-digit GSTIN உள்ளிடுங்கள். Past invoices-ஐ GSTIN-உடன் reissue செய்ய invoice date-இலிருந்து 30 நாட்களுக்குள் support@hireadda.in-ஐ contact செய்யுங்கள். Reissue-ல் original invoice எங்கள் records-ல் void ஆகி புதியது (same number, GSTIN added) அனுப்பப்படுகிறது. Standard ITC rules apply — eligibility-க்கு உங்கள் CA-ஐ consult செய்யுங்கள்.',
  },
  'billing-promo-coupon': {
    question: 'Promo / coupon code எப்படி apply செய்வது?',
    answer:
      'Checkout page-ல் "Have a coupon code?" click செய்து code உள்ளிடுங்கள். Plan மற்றும் account-க்கு எதிராக validate செய்து (சில codes first-time-only அல்லது audience-specific) payment-க்கு முன் discounted total காண்பிக்கிறோம். Referrals அல்லது partner offers-ல் இருந்து codes அவர்களது link click செய்யும்போது auto-apply ஆகின்றன. Coupon-ஐ carry-forward credits-உடன் stack செய்யலாம் ஆனால் வேறு coupon-உடன் இல்லை.',
  },
  'billing-tax-invoice-download': {
    question: 'Tax invoice எப்படி download செய்வது?',
    answer:
      'Billing → Invoices திறந்து → எந்த invoice-மீதும் click → "Download PDF". Invoices GST-compliant, HSN code 998314 உள்ளடங்கிய, billing address (மற்றும் சேர்த்திருந்தால் GSTIN), மற்றும் records-க்கு unique invoice number கொண்டவை. Same invoice payment time-ல் auto-emailed-ஆகவும். PDFs digitally signed, tamper-evident மற்றும் accounting proof-ஆக ஏற்றுக்கொள்ளப்படுகின்றன.',
  },
  'billing-payment-history': {
    question: 'Payment history எங்கே பார்ப்பது?',
    answer:
      'Billing → Orders ஒவ்வொரு transaction (paid / failed / refunded)-ஐயும் timestamp, amount, plan, payment method மற்றும் invoice + ledger entry link-உடன் காண்பிக்கிறது. Status, date range அல்லது plan-ஆல் filter செய்யலாம். Refunds separate negative-amount entries-ஆக தோன்றுகின்றன, original order-உடன் linked. Accounting reconciliation-க்கு same page-இலிருந்து full history CSV-ஆக export செய்யுங்கள்.',
  },
  'billing-receipt-vs-invoice': {
    question: 'Receipt மற்றும் tax invoice இடையே வேறுபாடு என்ன?',
    answer:
      'Receipt payment received-ஐ confirm செய்கிறது (success-ல் Razorpay உடனடியாக issue செய்கிறது). Tax invoice tax purposes-க்கான GST-compliant document — input tax credit claims மற்றும் accounting-க்கு தேவை. Hire Adda ஒவ்வொரு paid order-க்கும் இரண்டையும் generate செய்கிறது: receipt Razorpay confirmation email-ல், tax invoice server-side generated மற்றும் சில நிமிடங்களில் emailed + எப்போதும் Billing → Invoices-ல் கிடைக்கும்.',
  },
  'billing-checkout-time': {
    question: 'Checkout சில சமயம் ஏன் long-ஆக ஆகிறது?',
    answer:
      'Checkout Razorpay order உருவாக்குகிறது, account history-க்கு எதிராக fraud check ஓட்டுகிறது (புதிய accounts extra scrutiny பெறுகின்றன), மற்றும் entitlement quota reserve செய்கிறது — வழக்கமாக <2 seconds. அதிக நேரம் ஆனால், bank அல்லது UPI app redirect-ல் slow ஆக இருக்கலாம். Checkout >30 seconds stuck ஆனால், page refresh செய்யுங்கள் (உங்கள் order preserved) மற்றும் Billing → Orders-இலிருந்து "Resume payment" click செய்யுங்கள். Recurring failures bank flag-ஐ குறிக்கலாம்.',
  },
};

export const FAQS_TA: FaqEntry[] = FAQS_EN.map((entry) => {
  const t = TA_TRANSLATIONS[entry.id];
  return t ? { ...entry, question: t.question, answer: t.answer } : entry;
});
