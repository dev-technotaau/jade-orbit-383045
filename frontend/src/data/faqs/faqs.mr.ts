import type { FaqEntry } from './types';
import { FAQS_EN } from './faqs.en';

/**
 * Marathi translations covering the full FAQ corpus. Untranslated entries
 * (if any) fall back to English at runtime.
 */
const MR_TRANSLATIONS: Record<string, { question: string; answer: string }> = {
  'create-account': {
    question: 'Hire Adda वर खाते कसे तयार करावे?',
    answer:
      'खाते तयार करणे सोपे आणि विनामूल्य आहे. होमपेजवर "Get Started" किंवा "Sign Up" बटणावर क्लिक करा. आपण आपला ईमेल आणि पासवर्ड वापरून नोंदणी करू शकता, किंवा Google/LinkedIn द्वारे लवकर साइन अप करू शकता. नोंदणीनंतर, आपली कौशल्ये, अनुभव आणि नोकरी प्राधान्यांसह आपले प्रोफाइल पूर्ण करण्यासाठी मार्गदर्शन केले जाईल.',
  },
  'forgot-password': {
    question: 'मी माझा पासवर्ड कसा रीसेट करू?',
    answer:
      'जर आपण आपला पासवर्ड विसरला असाल, लॉगिन पेजवर "Forgot Password" क्लिक करा. आपल्या खात्याशी संबंधित ईमेल पत्ता प्रविष्ट करा, आणि आम्ही आपल्याला पासवर्ड रीसेट दुवा पाठवू (1 तासासाठी वैध). नवीन पासवर्ड सेट करण्यासाठी त्यावर क्लिक करा. ईमेल मिळाला नाही तर स्पॅम फोल्डर तपासा किंवा सहाय्यासाठी आमच्या समर्थन टीमशी संपर्क साधा.',
  },
  'delete-account': {
    question: 'मी माझे खाते कसे हटवू?',
    answer:
      'खाते हटवण्यासाठी Settings → "Danger Zone" → "Delete Account" वर जा आणि पुष्टी करा. लक्षात ठेवा: खाते हटविणे कायमचे आहे — आपला सर्व डेटा (applications, सेव्ह केलेली jobs, संदेश) 30 दिवसांत पूर्णपणे काढून टाकला जाईल.',
  },
  'contact-support': {
    question: 'मी ग्राहक समर्थनाशी कसा संपर्क साधू?',
    answer:
      'आपण आमच्या समर्थन टीमशी अनेक चॅनलद्वारे पोहोचू शकता. support@hireadda.in वर ईमेल करा, +91 1762469136 (सोम-शुक्र, सकाळी 9 - संध्याकाळी 6 IST) वर आमच्या टोल-फ्री नंबरवर कॉल करा, किंवा थेट संदेश पाठवण्यासाठी आमच्या Contact पेजला भेट द्या. लॉग-इन वापरकर्त्यांसाठी आम्ही इन-अॅप चॅट सपोर्ट देखील ऑफर करतो. आमची टीम सहसा 24 तासांत प्रतिसाद देते.',
  },
  'mobile-app': {
    question: 'Hire Adda mobile app उपलब्ध आहे का?',
    answer:
      'आम्ही Android आणि iOS दोन्हीसाठी native apps विकसित करत आहोत — Q3 2026 मध्ये लाँच होण्याची अपेक्षा आहे. या दरम्यान, आमची वेबसाइट पूर्णपणे mobile-responsive आहे आणि mobile browsers वर अखंडपणे कार्य करते. App-सारख्या अनुभवासाठी "Add to Home Screen" वापरा. Browser push notifications देखील समर्थित आहेत.',
  },
  'languages-supported': {
    question: 'Hire Adda कोणत्या भाषांना समर्थन देते?',
    answer:
      'Hire Adda सध्या इंग्रजीमध्ये पूर्णपणे उपलब्ध आहे. हिंदी, तमिळ, तेलुगू, बंगाली आणि मराठी UI भाषांतरे 2026 मध्ये येत आहेत. Job descriptions, applications आणि search कोणत्याही भाषेत कार्य करतात — आमचे matching engine सर्व प्रमुख भारतीय भाषांच्या queries समजते. आपल्या आवडत्या भाषेत FAQs वाचण्यासाठी help center मध्ये language picker वापरा.',
  },
  'who-is-it-for': {
    question: 'Hire Adda कोणासाठी बनवलेले आहे?',
    answer:
      'Hire Adda तीन audiences ला सेवा देते — (1) नोकरी शोधणारे उमेदवार (नवशिक्या ते senior leaders पर्यंत, प्रत्येक उद्योगात), (2) नियोक्ते आणि recruitment teams (पहिले role post करणारे startup पासून शेकडो openings व्यवस्थापित करणाऱ्या enterprises पर्यंत), आणि (3) clients साठी candidates source करणाऱ्या recruitment-vendor agencies. प्रत्येक audience साठी dedicated dashboard, plan family आणि सपोर्ट flow आहे.',
  },
  'about-hire-adda': {
    question: 'Hire Adda म्हणजे काय?',
    answer:
      'Hire Adda एक India-first hiring platform आहे जे नोकरी शोधणारे, नियोक्ते आणि recruitment vendors यांना एकाच stack वर एकत्र आणते. आम्ही पारंपरिक job-posting ला searchable CV database, AI-powered job matching, assisted hiring (आमचे team तुमच्यासाठी CVs source करते), आणि vendor marketplace सह जोडतो — सर्व INR मध्ये, GST-compliant, आणि भारतीय hiring market साठी बांधले गेले.',
  },
  'regions-served': {
    question: 'Hire Adda कोणत्या प्रदेश आणि शहरांमध्ये सेवा देते?',
    answer:
      'Hire Adda पॅन-इंडिया आहे — प्रत्येक राज्य आणि केंद्रशासित प्रदेशात jobs आणि candidates listed आहेत. आम्हाला metros (बेंगळुरू, मुंबई, दिल्ली-NCR, हैदराबाद, पुणे, चेन्नई, कोलकाता, अहमदाबाद) मध्ये विशेषत: मजबूत coverage आहे, tier-2 आणि tier-3 शहरांमध्ये volumes वेगाने वाढत आहेत. Remote आणि hybrid jobs सीमा ओलांडून कार्य करतात.',
  },
  'safety-trust': {
    question: 'Jobs आणि candidates खरे आहेत याची खात्री कशी करता?',
    answer:
      'प्रत्येक नियोक्ता post करण्यापूर्वी company verification (GST + PAN + domain email proof) मधून जातो. Job posts content moderation मधून जातात जे scammy patterns ("apply करण्यासाठी pay", "MLM", impossible salaries) flag करतात. Candidate profiles email + mobile OTP verification मिळवतात, आणि आम्ही optional employer/education/experience verification badges देतो. संशयास्पद activity Trust & Safety team द्वारे 24 तासांत review केली जाते.',
  },
  'report-fraudulent': {
    question: 'संशयास्पद किंवा फसवणूकीच्या job posting ची तक्रार कशी करावी?',
    answer:
      'जर आपण फसवणूकीची, दिशाभूल करणारी किंवा संशयास्पद वाटणारी job listing पहाल, job detail पेजवर "Report" बटणावर क्लिक करा. कारण निवडा आणि कोणतेही अतिरिक्त तपशील द्या. आमची moderation team 24-48 तासांत सर्व reports review करते. तातडीच्या चिंतांसाठी safety@hireadda.in वर थेट reports देखील पाठवू शकता. पुष्टी झालेल्या scams चा परिणाम immediate takedown आणि नियोक्त्यासाठी account suspension होतो.',
  },
  'platform-stats': {
    question: 'Hire Adda वर किती jobs आणि companies आहेत?',
    answer:
      'Live numbers homepage आणि /about page वर update होतात. Q2 2026 पर्यंत: 50,000+ candidates, 5,000+ verified नियोक्ते, 200+ शहरांमध्ये 12,000+ open roles, आणि directory मध्ये 800+ recruitment vendors. साप्ताहिक application volume लाखोंमध्ये आहे. Blog द्वारे आम्ही quarterly aggregate platform analytics share करतो.',
  },
  'two-factor-auth': {
    question: 'Two-Factor Authentication (2FA) कसे enable करावे?',
    answer:
      'Settings → Security → Two-Factor Authentication उघडा. कोणत्याही authenticator app (Google Authenticator, Authy, 1Password) सह QR code scan करा आणि 6-digit code प्रविष्ट करा. आम्ही backup codes देखील generate करू — device हरवल्यास सुरक्षित ठिकाणी सेव्ह करा. Password-less sign-in साठी passkey (Face ID, Touch ID) register करू शकता.',
  },
  'trust-device': {
    question: '"Trust this device for 30 days" option काय करते?',
    answer:
      'यशस्वी 2FA verification नंतर हा option निवडल्यास, current browser वर एक secure cookie set होते. त्याच browser मधून 30 दिवसांत होणारे subsequent sign-ins 2FA prompt skip करतात. Trust cookie फक्त त्या browser साठी bound आहे — वेगळे device, incognito window किंवा नवीन browser वरून sign in केल्यास 2FA आवश्यक असेल. Settings → Security वरून कधीही trusted devices revoke करू शकता.',
  },
  'sessions-revoke': {
    question: 'Active sessions कसे पाहावे आणि revoke करावे?',
    answer:
      'Settings → Security → Active Sessions आपल्या खात्यात signed in असलेले प्रत्येक device आणि browser IP, location (city-level), आणि last-active timestamp सह सूचीबद्ध करते. कोणत्याही session च्या बाजूला "Revoke" क्लिक करून ते device तत्काळ sign out करा, किंवा "Revoke all other sessions" सह फक्त current browser ला signed in ठेवा. Lost-phone scenarios येथे handle केली जातात.',
  },
  'lost-mfa-device': {
    question: 'माझे authenticator device हरवले आहे — खाते कसे recover करू?',
    answer:
      '2FA prompt वर "Can\'t access authenticator?" → "Send Recovery Code" क्लिक करा. आम्ही आपल्या खाते email वर 6-digit code पाठवू. हे प्रविष्ट केल्याने आपल्या खात्यावर 2FA disable होते आणि आपण sign in करू शकता. लगेच 2FA पुन्हा enable करा. आपण प्रथम 2FA enable केल्यावर सेव्ह केलेल्या backup codes पैकी एक देखील वापरू शकता — प्रत्येक backup code एकदाच कार्य करते.',
  },
  'data-privacy': {
    question: 'Hire Adda माझ्या वैयक्तिक डेटाचे संरक्षण कसे करते?',
    answer:
      'आम्ही भारताच्या Digital Personal Data Protection (DPDP) Act चे पालन करतो आणि OWASP Top 10 best practices चे अनुसरण करतो. Data transit (TLS 1.3) आणि rest दोन्हीमध्ये encrypted आहे. Sensitive fields (mobile numbers, salaries, contact details) कधीही public APIs मध्ये परत केले जात नाहीत आणि नियोक्त्यांना पाहण्यासाठी specific entitlements (e.g. CV unlock) आवश्यक आहेत. Settings वरून आपला डेटा कधीही export किंवा delete करू शकता.',
  },
  'email-change': {
    question: 'मी माझा email address कसा बदलू?',
    answer:
      'Settings → Account → Email → "Change" उघडा. नवीन email आणि आपला current password प्रविष्ट करा. आम्ही नवीन email वर एक verification link पाठवतो — त्यावर क्लिक केल्याने आपला account email switch होतो आणि जुन्या email वर एक confirmation पाठवले जाते. जुना email recovery channel म्हणून 7 दिवस कार्यरत राहतो. आपण जुन्या email चा access गमावल्यास, identity proof सह support@hireadda.in शी संपर्क साधा.',
  },
  'password-strength': {
    question: 'Password requirements काय आहेत?',
    answer:
      'Passwords कमीतकमी एक uppercase, एक lowercase, एक number आणि एक special character सह 8+ characters असणे आवश्यक आहेत. आम्ही 10,000 सर्वात सामान्य breached passwords block करतो (HaveIBeenPwned\'s public list विरुद्ध मेळ खाणारे). Registration form वर strength meter real time मध्ये entropy दाखवतो — "Strong" किंवा "Very Strong" चे लक्ष्य ठेवा. कमाल security साठी, sign-up नंतर 2FA enable करा आणि password-less login साठी passkey register करण्याचा विचार करा.',
  },
  'multiple-accounts': {
    question: 'मी वेगळी candidate आणि employer accounts ठेवू शकतो का?',
    answer:
      'होय — accounts role-locked आहेत, म्हणून एक email एक role धारण करते. Candidate आणि employer दोन्ही features वापरण्यासाठी, वेगळ्या email सह दुसरे account register करा. बरेच लहान-व्यवसाय मालक हे करतात: job applications साठी त्यांचा personal email + hiring साठी त्यांचा company email. Multi-seat employer plans (CV Enterprise) सह team-member invites देखील कार्य करतात.',
  },
  'export-data': {
    question: 'मी माझा डेटा कसा export करू?',
    answer:
      'Settings → Privacy → "Export my data" आपले profile, applications, messages आणि audit log JSON + PDF म्हणून समाविष्ट असलेला ZIP generate करते. Generation काही मिनिटे घेते; आम्ही 24 तासांसाठी valid download link email करतो. Abuse रोखण्यासाठी exports प्रत्येक 7 दिवसांत एक पर्यंत rate-limited आहेत. हे DPDP Act च्या data portability अधिकाराचे समाधान करते.',
  },
  'account-suspended': {
    question: 'माझे account suspend केले गेले — मी appeal कसे करू?',
    answer:
      'Suspensions सहसा repeated content violations, फसवणूकीच्या activity किंवा chargebacks साठी होतात. Login page कारण आणि "Submit an appeal" link दर्शवेल. Appeals 3-5 business days च्या आत वेगळ्या moderator द्वारे review केली जातात. आपले account चुकीने suspend झाले असल्यास, आपण reinstate केले जाल आणि consumed quota restored केला जाईल. गंभीर violations (fake jobs, scam operations) appeal साठी eligible नाहीत.',
  },
  'candidate-apply-job': {
    question: 'प्लॅटफॉर्मवर नोकर्‍यांसाठी अर्ज कसा करावा?',
    answer:
      'एकदा आपण आपले प्रोफाइल तयार केल्यानंतर, सर्च बार वापरून नोकर्‍या ब्राउझ करा किंवा आपल्या डॅशबोर्डवरील क्युरेटेड लिस्टिंग एक्सप्लोर करा. जेव्हा आपल्याला आपल्याला रुचलेली नोकरी सापडते, नोकरी तपशील पेजवर "Apply" बटणावर क्लिक करा. आपले प्रोफाइल आणि रेझ्युमे नियोक्त्यासह सामायिक केले जाईल. आपण आपले सेव्ह केलेले प्रोफाइल वापरून एका क्लिकवर अनेक पदांसाठी अर्ज करण्यासाठी "Quick Apply" देखील सक्षम करू शकता.',
  },
  'candidate-update-profile': {
    question: 'मी माझी profile माहिती कशी update करू?',
    answer:
      'आपल्या account मध्ये log in करा आणि dashboard वरून profile page वर navigate करा. आपण आपली personal information, work experience, education, skills, आणि preferences कधीही edit करू शकता. बदल करण्यासाठी "Edit Profile" क्लिक करा आणि पूर्ण झाल्यावर save करण्याचे लक्षात ठेवा. आपले profile updated ठेवल्याने आमचे matching engine आपल्यासाठी चांगल्या opportunities शोधण्यास मदत करते.',
  },
  'candidate-resume-upload': {
    question: 'मी कोणत्या resume formats upload करू शकतो?',
    answer:
      'आपले CV PDF किंवा DOCX (10 MB max) म्हणून upload करा. आमचे Document AI parser आपोआप आपला work history, education आणि skills extract करतो — saving आधी suggested fields review करा. आपण profile वर एकाधिक resume versions ठेवू शकता आणि प्रत्येक application सह कोणता attach करायचा ते निवडा. Tip: clear section headings असलेला structured PDF सर्वात अचूकपणे parse होतो.',
  },
  'candidate-premium-benefits': {
    question: 'Candidate Premium (₹199) मध्ये काय समाविष्ट आहे?',
    answer:
      '₹199 (एकवेळच्या) Candidate Premium पाच ठोस फायदे देते: AI Resume Premium (ऑटो-फॉर्मेटिंगसह 4 paid templates), आपल्या प्रोफाइलवर Verified Badge, 7 दिवसांचा Profile Boost (recruiter searches-मध्ये शीर्ष), Priority WhatsApp समर्थन, आणि आपल्या कौशल्यांशी संबंधित candidate searches-मध्ये Top Visibility रँकिंग. प्लॅन 30 दिवसांसाठी वैध आहे.',
  },
  'candidate-applications-track': {
    question: 'मी माझी applications कशी track करू?',
    answer:
      'Dashboard → Applications उघडा. प्रत्येक row role, company, current status (Applied / Reviewed / Shortlisted / Interview / Hired / Rejected), आणि latest update timestamp दर्शविते. कोणत्याही application वर click केल्यास full timeline दर्शविला जातो ज्यात employer-side notes (शेअर केल्यावर) आणि आपण submit केलेल्या screening-question answers समाविष्ट आहेत. प्रत्येक status change वर आम्ही email + push notifications पाठवतो.',
  },
  'candidate-profile-visibility': {
    question: 'मी माझ्या current नियोक्त्याकडून profile लपवू शकतो का?',
    answer:
      'होय — Settings → Privacy → "Hide profile from selected employers" आपल्याला specific company accounts (आणि त्या company च्या domain मधील कोणत्याही user) ला CV-database searches मध्ये आपले profile पाहण्यापासून block करू देते. "Make profile private" सह आपण profile पूर्णपणे लपवू शकता — फक्त आपण actively apply करत असलेल्या jobs मध्ये दिसेल. त्या नियोक्त्यासह आपला application history प्रभावित होत नाही.',
  },
  'candidate-job-alerts': {
    question: 'Job alerts कसे कार्य करतात?',
    answer:
      'Jobs page वर run केलेला कोणताही search Job Alert म्हणून save करा — आम्ही आपल्याला नवीन matching roles daily, weekly, किंवा instantly (आपण निवडता) email करू. Alerts आपल्या filters चा अचूकपणे आदर करतात: skills, location, experience, work mode, salary range. Dashboard → Job Alerts वरून कधीही pause/manage करा. आपण 30 दिवसांत कोणत्याही alert वर click न केल्यास alerts आपोआप थांबतात.',
  },
  'candidate-recommendations': {
    question: 'Job recommendations कशी generate केली जातात?',
    answer:
      'Recommendations तीन signals एकत्र करतात: (1) आपले profile आणि job च्या required skills मधील skills overlap (recency-weighted), (2) Google Cloud Talent च्या AI matching, (3) आपल्या historical interaction (applies, saves, dismissals) पासून आपल्या preferences शिकणे. Recommendations प्रत्येक 4 तासांनी refresh होतात — आपण Recommendations page वरून manually देखील refresh करू शकता.',
  },
  'candidate-interview-prep': {
    question: 'Hire Adda interview preparation सह मदत करते का?',
    answer:
      'जेव्हा एक नियोक्ता Hire Adda द्वारे interview schedule करतो, application detail page एक tailored prep panel दाखवते: नियोक्त्याने historically विचारलेली top skills, त्यांच्या successful hires reported average preparation time, आणि आणण्याच्या artefacts ची checklist (resume, ID, certificates). Role + city साठी कमीतकमी 3 hires complete झाल्यास आम्ही salary-range data देखील दाखवतो.',
  },
  'candidate-resume-templates': {
    question: 'Candidate Premium मध्ये कोणते resume templates समाविष्ट आहेत?',
    answer:
      'Premium 4 paid templates unlock करते (free default च्या पलीकडे): Modern Minimal (clean two-column), Executive Classic (single-column traditional), Creative Bold (design / marketing roles साठी colour accents), आणि ATS Pro (applicant-tracking-system parsing साठी optimised). प्रत्येक template आपला existing profile data auto-format करते — re-typing नाही. आपण विकत घेण्यापूर्वी सर्व 5 (1 free + 4 premium) preview करू शकता.',
  },
  'candidate-saved-jobs': {
    question: 'Saved jobs कसे कार्य करतात?',
    answer:
      'नंतर save करण्यासाठी कोणत्याही job वर bookmark icon click करा. Saved jobs Dashboard → Saved Jobs अंतर्गत दिसतात. Saving private आहे — नियोक्ते कोणी त्यांची job save केली ते पाहू शकत नाहीत. Filled किंवा expire झालेल्या saved jobs auto-archived होतात पण "यापुढे applications स्वीकारत नाहीत" notes सह आपल्या list मध्ये visible राहतात. आपण किती jobs save करू शकता यावर मर्यादा नाही.',
  },
  'candidate-apply-without-account': {
    question: 'खाते न बनवता मी apply करू शकतो का?',
    answer:
      'नाही — applications साठी खाते आवश्यक आहे जेणेकरून आम्ही आपले application + resume नियोक्त्याला विश्वसनीयरित्या deliver करू शकू, follow-ups support करू शकू आणि आपल्याला status track करू देऊ. खाते निर्मिती विनामूल्य आहे आणि ~60 सेकंद घेते. Registering आपल्याला job save करू देते, similar roles साठी alerts set up करू देते आणि भविष्यात single click मध्ये apply करू देते.',
  },
  'candidate-mock-interview': {
    question: 'Hire Adda mock interviews ऑफर करते का?',
    answer:
      'AI-powered mock interviews निवडक roles (software engineering, sales, customer support) साठी beta मध्ये आहेत. System role-specific questions विचारते, आपला audio response record करते, आणि answer structure, filler words आणि उल्लेख केलेल्या key skills वर feedback देते. Premium candidates साठी विनामूल्य available, महिन्याला 3 mock sessions पर्यंत. आपले role scope मध्ये असताना Dashboard → Mock Interview वरून open करा.',
  },
  'candidate-salary-research': {
    question: 'Apply करण्यापूर्वी मी salaries research करू शकतो का?',
    answer:
      'होय — प्रत्येक job listing set केल्यावर employer-disclosed salary range दर्शविते. Undisclosed roles साठी, listing अजूनही similar hires (role + location + experience) पासून derived estimated range दर्शविते जेव्हा आमच्याकडे ≥10 data points असतात. Dashboard → Salary Insights वर Salary Insights broader market data देते: role, city आणि years of experience नुसार median + range, आणि आपण profile वर भरले असल्यास current/expected CTC ची तुलना.',
  },
  'candidate-fake-job-detection': {
    question: 'Candidates ला fake jobs पासून आपण कसे संरक्षण करता?',
    answer:
      'तीन layers: (1) post करण्यापूर्वी प्रत्येक नियोक्ता verified आहे (GST + PAN + domain email); (2) job posts automated moderation मधून जातात जे scammy patterns ("apply साठी pay", "registration fee", "investment opportunity") block करते; (3) प्रत्येक job वर in-app Trust Score (0-5 stars) नियोक्त्याच्या past hires + verifications + report rate factor करतो. 3 stars पेक्षा कमी scoring jobs टाळा आणि upfront पैसे मागणाऱ्या कोणत्याही role ची तक्रार करा.',
  },
  'candidate-skill-test': {
    question: 'Hire Adda वर skill assessments आहेत का?',
    answer:
      'होय — नियोक्ते jobs ला skill assessments attach करू शकतात (multiple-choice, coding, video answers). आपण apply form वर assessment requirement पाहता आणि तेव्हा किंवा नंतर (apply केल्यानंतर 48 तासांच्या आत) घेऊ शकता. Scores आपल्याला आणि नियोक्त्याला दोघांनाही visible. आम्ही top in-demand skills (JavaScript, Python, English communication, Excel) साठी आपल्या profile वर self-administered skill tests देखील support करतो — passing एक verified badge जोडते जो recruiter visibility सुधारतो.',
  },
  'employer-post-job': {
    question: 'नियोक्ता म्हणून नोकरी कशी पोस्ट करावी?',
    answer:
      'नियोक्ता म्हणून नोंदणी करा आणि कंपनीचे नाव, वर्णन, उद्योग आणि स्थान यांसारख्या तपशीलांसह आपले कंपनी प्रोफाइल पूर्ण करा. एकदा सत्यापित झाल्यावर, आपल्या Employer Dashboard वर जा आणि "Post a Job" क्लिक करा. नोकरी शीर्षक, वर्णन, आवश्यक कौशल्ये, पगार श्रेणी आणि इतर तपशील भरा. गुणवत्ता सुनिश्चित करण्यासाठी थोडक्यात मॉडरेशन पुनरावलोकनानंतर आपली लिस्टिंग लाइव्ह होईल.',
  },
  'employer-free-plan': {
    question: 'Free Job Post प्लॅन (₹0) मध्ये काय आहे?',
    answer:
      'Free प्लॅन आपल्याला 7 दिवस लाइव्ह असलेली 1 नोकरी पोस्ट देते, कमाल 50 अर्ज, 1 स्थान, बेसिक candidate dashboard अॅक्सेस आणि standard listing visibility. जेव्हा आपण employer onboarding पूर्ण करता तेव्हा हे आपोआप दिले जाते — कार्ड आवश्यक नाही. वैधता वाढविण्यासाठी, अर्ज cap वाढविण्यासाठी आणि CV-database अॅक्सेस जोडण्यासाठी कधीही Standard (₹499) किंवा Premium (₹999) वर अपग्रेड करा.',
  },
  'employer-cv-database': {
    question: 'CV Database (Talent Vault) काय आहे आणि ते कसे कार्य करते?',
    answer:
      'CV Database प्रत्येक candidate profile चा searchable index आहे. Skills, location, experience, salary, last-active, education इत्यादीनुसार filter करा. प्रत्येक plan निश्चित संख्या "CV unlocks" देते — candidate चे contact details (email + phone) पाहणे आपल्या quota मधून एक unlock consume करते. Search विनामूल्य आहे; फक्त contact info reveal करणे एक unlock खर्च करते. CV Lite = 200 unlocks, CV Pro = 500, CV Enterprise = 1000+ (custom).',
  },
  'employer-applications-cap': {
    question: 'माझ्या job चा applications cap पोहोचल्यास काय होते?',
    answer:
      'New applications block होतात — candidates ना "Job is full" message दाखवला जातो. आपण अजूनही प्राप्त झालेले सर्व applications पाहता आणि सामान्यतः shortlist करू शकता. Free = 50, Standard = 250, Premium = unlimited. Mid-cycle upgrading त्या listing साठी cap त्वरित काढून टाकते. Cap per-job (account-wide नाही) आणि आपण role re-post केल्यास resets होतो.',
  },
  'employer-team-multi-seat': {
    question: 'माझ्या company मधून multiple recruiters एक account share करू शकतात का?',
    answer:
      'होय — Dashboard → Team वरून teammates ना invite करा. CV Enterprise plans multi-seat sharing समाविष्ट करतात: invitees RECRUITER किंवा ADMIN team members होतात आणि company च्या shared CV-unlock + search-result quota pool मधून consume करतात. Lower-tier plans (Standard, Premium, CV Lite, CV Pro) single-seat only आहेत. Owner कधीही ownership transfer किंवा seats revoke करू शकतो.',
  },
  'employer-assisted-hiring': {
    question: 'Assisted Hiring (₹1499) कसे कार्य करते?',
    answer:
      '₹1499 pay → आमचा specialist एक business day मध्ये role scope करण्यासाठी आपल्याला call करतो → आम्ही 4-5 matching CVs source करतो आणि 7 दिवसांत आपल्याला email करतो. आपण स्वतः candidates शी contact आणि interview करता; आम्ही matching legwork करतो. प्रत्येक plan एक job role cover करते. Dashboard → Assisted Hiring वर Pending → Call Scheduled → Sourcing → Delivered status updates सह progress track करा.',
  },
  'employer-urgent-badge': {
    question: 'Urgent Hiring Badge कसे कार्य करते?',
    answer:
      'Premium ₹999 plan वर available. Posting दरम्यान job ला URGENT किंवा IMMEDIATE म्हणून mark केल्यास, listing cards वर red Urgent badge + candidate searches मध्ये +20 ranking boost + candidate dashboards वर Urgent jobs widget मध्ये दिसते. Job च्या पहिल्या hire वर किंवा job ची validity संपल्यावर badge आपोआप काढून टाकले जाते.',
  },
  'employer-verification': {
    question: 'माझी company verified कशी करावी?',
    answer:
      'Settings → Verification → आपले GST certificate, PAN आणि company-domain email proof submit करा. आमची team 1-2 business days मध्ये review करते. Verified companies ला प्रत्येक job listing, company profile page आणि recruiter outreach वर green checkmark मिळतो — आमच्या data मध्ये verified listings वर candidates trust ~40% जास्त application rate देतो.',
  },
  'employer-screening-questions': {
    question: 'मी माझ्या job वर screening questions add करू शकतो का?',
    answer:
      'होय — एक job posting किंवा editing करताना, "Screening Questions" वर scroll करा आणि 10 पर्यंत custom questions (text, multiple choice, yes/no) add करा. कोणतेही required (apply करण्यासाठी उत्तर देणे आवश्यक) किंवा deal-breaker (एक चुकीचे उत्तर auto-rejects) म्हणून mark करा. Candidates apply form वर आपले questions पाहतात; त्यांची उत्तरे application detail page वर दिसतात.',
  },
  'employer-analytics': {
    question: 'कोणते analytics उपलब्ध आहेत?',
    answer:
      'Employer Analytics आपला hiring funnel (Views → Applies → Shortlists → Interviews → Hires) per job आणि aggregated, time-to-hire आणि time-to-fill metrics, source breakdown (organic search, recommendations, applications, CV unlocks), आणि multi-seat plan वर असल्यास team-member productivity दर्शविते. CSV export available. Premium आणि CV Enterprise plans additional cohort + benchmark views मिळवतात.',
  },
  'employer-edit-job': {
    question: 'Posting नंतर मी job कसा edit करू?',
    answer:
      'Dashboard → My Jobs उघडा → job वर click करा → "Edit". आपण कधीही description, requirements, screening questions आणि salary range update करू शकता. Changes quick moderation re-check नंतर live होतात (सहसा एक तासापेक्षा कमी). पहिले application received झाल्यानंतर critical fields (job title, type, work mode) edit केले जाऊ शकत नाहीत — त्याऐवजी, application history clarity preserve करण्यासाठी role close करा आणि नवीन post करा.',
  },
  'employer-close-job': {
    question: 'Job listing लवकर कसे close करावे?',
    answer:
      'Dashboard → My Jobs → job वर click → "Close listing". कारण निवडा (Filled / Cancelled / Reposting) — आपले hiring analytics प्रभावित करते. Closed jobs त्वरित new applications स्वीकारणे थांबवतात आणि 5 मिनिटांत public search वरून अदृश्य होतात. Existing applications review आणि outreach साठी accessible राहतात. Job close करणे आपली remaining validity refund करत नाही.',
  },
  'employer-bulk-cv-download': {
    question: 'Bulk CV download कसे कार्य करते?',
    answer:
      'CV Enterprise plans bulk download unlock करतात. आपल्या filters सह CV database search करा → candidates check करा (max 100 per export) → "Download CVs as ZIP" click करा. ZIP मध्ये प्रत्येक PDF candidate चा most-recent resume + एक structured profile summary आहे. प्रत्येक downloaded CV आपल्या quota मधून एक CV-unlock consume करते (Enterprise plans मध्ये unlimited unlocks आहेत). Downloads audit साठी logged आहेत.',
  },
  'employer-application-export': {
    question: 'मी माझे applications Excel / CSV मध्ये export करू शकतो का?',
    answer:
      'होय — Dashboard → Applications → आपल्या scope नुसार Filter (job, status, date range) → "Export as CSV". Export मध्ये candidate name, contact (फक्त unlocked candidates साठी), application status, applied-on date, screening answers आणि shortlist notes समाविष्ट आहेत. Contact unlock केले नसल्यास PII masked. Quota abuse रोखण्यासाठी exports per day 5 पर्यंत rate-limited आहेत.',
  },
  'employer-team-roles': {
    question: 'Team roles ना कोणत्या permissions आहेत?',
    answer:
      'तीन roles: OWNER (billing + ownership transferring यांसह full access), ADMIN (jobs, applications, team invites manage करा, परंतु billing बदलू शकत नाही किंवा company account close करू शकत नाही), RECRUITER (CVs search, applicants shortlist, company account वर jobs post करू शकतात, परंतु team members invite करू शकत नाहीत). सर्व roles company च्या CV-unlock + search-result quota pool share करतात. Team & roles Dashboard → Team वरून managed आहेत.',
  },
  'employer-vendor-find': {
    question: 'मी recruitment partner / vendor कसा शोधू?',
    answer:
      '/vendors (public directory) ला भेट द्या आणि specialisation, location, industry, team size आणि verification status नुसार filter करा. कोणत्याही vendor वर click करा त्यांच्या full profile + past placements साठी. Role details share करण्यासाठी "Send hiring requirement" वापरा — vendor ते त्यांच्या lead inbox मध्ये पाहतो आणि सहसा 24 तासांत आपल्याशी संपर्क साधतो. Sharing a requirement विनामूल्य आहे; आपण vendor सह directly contract sign केल्यासच आपण pay करता (no platform fee).',
  },
  'employer-multi-location': {
    question: 'मी multiple locations मध्ये job post करू शकतो का?',
    answer:
      'होय, paid plans only — Free plan job-प्रति 1 location वर caps. Standard, Premium आणि CV Enterprise एकाच listing वर additional locations ला अनुमती देतात (no per-location cap), म्हणून Bengaluru, Mumbai आणि Pune मधील offices असलेले single role 3 separate posts ची आवश्यकता न करता तीन city searches मध्ये दिसते. Location-specific applicants flagged आहेत. Post-job form वर "Job locations" अंतर्गत additional locations add करा.',
  },
  'vendor-what-is': {
    question: 'Vendor Connect म्हणजे काय आणि कोणासाठी?',
    answer:
      'Vendor Connect recruitment agencies, staffing partners आणि independent recruiters साठी आहे जे multiple client companies च्या वतीने candidates source करतात. ₹199/महिना (auto-renewed) साठी, आपण आमच्या public Vendor Directory मध्ये listed होता, आपल्या specialisations सह match असलेल्या companies कडून routed hiring leads मिळवता आणि नियोक्त्यांना referral option म्हणून surfaced आहात. Plan मासिक आहे आणि आपण कधीही cancel करू शकता.',
  },
  'vendor-receive-leads': {
    question: 'मला hiring leads कशा मिळतील?',
    answer:
      'Subscribing नंतर, आपले "Specialisations" (उदा. IT, BFSI, healthcare), service locations आणि industries configure करा. जेव्हा companies "Find Recruitment Partners" search करतात आपल्याशी match असलेल्या criteria सह, आपण directory मध्ये दिसता. Companies नंतर आपल्याला directly hiring requirement पाठवू शकतात — आपण ते Dashboard → Lead Inbox मध्ये full role details आणि follow up करण्यासाठी contact info सह पाहता.',
  },
  'vendor-priority-leads': {
    question: 'Priority Access to New Leads कसे कार्य करते?',
    answer:
      'Vendor Connect subscribers कंपनी पाहत असलेल्या matching score मध्ये +5 ranking bonus मिळवतात, म्हणून आपण candidate vendors च्या त्यांच्या preview list मध्ये higher दिसता. Priority overlap quality (skills + location + industry) नुसार ordered, म्हणून परिपूर्ण-match basic vendor एक unrelated priority vendor च्या वर rank करतो. Leads exclusive नाहीत — multiple vendors एकाच role साठी contacted केले जाऊ शकतात.',
  },
  'vendor-public-listing': {
    question: 'माझे agency profile public कुठे दर्शविले जाते?',
    answer:
      'Active subscribers public /vendors directory मध्ये दिसतात (कोणीही browse करू शकतो, Google indexed) /vendors/{slug} वर एक dedicated profile page सह आपले specialisations, locations, team size आणि (पर्यायी) testimonials दाखवते. Employer Dashboard → Vendor → Business Profile वरून आपले public profile edit करा — आमच्या content moderation review नंतर बदल काही मिनिटांत live होतात.',
  },
  'vendor-cancel': {
    question: 'मी Vendor Connect कसे cancel करू?',
    answer:
      'Billing → Subscriptions → Vendor Connect → "Cancel auto-renew" उघडा. Current billing period (purchase पासून 30 days) च्या शेवटपर्यंत आपला access continues आणि नंतर lapses — आपण नवीन leads receive करणे थांबवता पण historical data retained आहे. आपण कधीही resubscribe करू शकता; existing profile data subscriptions दरम्यान preserved आहे.',
  },
  'vendor-onboarding': {
    question: 'Vendor onboarding प्रक्रिया कशी दिसते?',
    answer:
      'नियोक्ता (employer) म्हणून आपल्या company name + GST + PAN सह register करा → employer dashboard मधून Vendor Connect plan subscribe करा → vendor profile complete करा (specialisations, service locations, industries, team size, sample placements) → verification साठी submit करा → आपण approved झाल्यावर Vendor Connect plan charging सुरू करते (सहसा 1-2 business days). Approval नंतर, आपण public directory मध्ये appear होता आणि routed leads प्राप्त करणे सुरू करता. Subscription cancel न करता आपण dashboard वरून कधीही listing pause करू शकता.',
  },
  'vendor-multiple-clients': {
    question: 'मी multiple client companies ला serve करू शकतो का?',
    answer:
      'होय — Vendor Connect कोणतेही exclusivity restrictions ठेवत नाही. आपण सध्या serve करणाऱ्या जितक्या client companies (परवानगीसह) आपल्या public profile मध्ये list करा; आपण जितके showcase करू शकता, directory searches मध्ये आपला trust signal तितका higher. आम्ही route केलेले leads exclusive नाहीत — एकाच role साठी multiple vendors contact केले जाऊ शकतात.',
  },
  'vendor-share-candidates': {
    question: 'मला माझ्या candidates चे contact details Hire Adda सह share करावे लागतील का?',
    answer:
      'नाही — Vendor Connect एक lead-gen + listing service आहे, candidate-data marketplace नाही. आपला candidate database आपलाच राहतो. एकदा एखादी कंपनी आपल्याला lead पाठवल्यानंतर, आपण त्यांच्याशी off-platform (email, phone, आपला CRM) contact करता आणि स्वतःच्या pool मधून candidates place करता. Hire Adda आम्हाला आपण केलेल्या यशस्वी hires मधून placement fee किंवा commission घेत नाही.',
  },
  'vendor-rating': {
    question: 'Vendors clients द्वारे rated आहेत का?',
    answer:
      'होय — एक lead concludes झाल्यानंतर (hire successful, role cancelled, किंवा 90 days elapsed), कंपनी एक private 1-5 rating + पर्यायी written feedback ठेवू शकते. आपले average rating + total reviews 5+ ratings नंतर आपल्या public profile वर दिसतात (noisy single-review averages टाळण्यासाठी). Below-3-star ratings आपल्याला एक private explanation देतात; आपण support द्वारे factually wrong reviews dispute करू शकता.',
  },
  'billing-gst': {
    question: 'किंमतीमध्ये GST समाविष्ट आहे का?',
    answer:
      'होय — सूचीबद्ध केलेले सर्व प्लॅन 18% GST सह आहेत. पेमेंटनंतर HSN कोड 998314 सह कर invoice आपोआप तयार होतो आणि आपल्याला ईमेल केला जातो. Invoices Billing → Invoices वरून कधीही PDF म्हणून डाउनलोड करता येतात. B2B GSTIN दाव्यांसाठी, चेकआउटपूर्वी Billing → Tax Details मध्ये आपला कंपनी GSTIN जोडा — तो प्रत्येक त्यानंतरच्या invoice वर दिसेल.',
  },
  'billing-payment-methods': {
    question: 'आपण कोणत्या पेमेंट पद्धती स्वीकारता?',
    answer:
      'UPI (Google Pay / PhonePe / Paytm / BHIM / कोणतेही UPI अॅप), सर्व प्रमुख क्रेडिट/डेबिट कार्ड (Visa, Mastercard, RuPay, Amex), 50+ भारतीय बँकांकडून नेटबँकिंग, मोबाइल वॉलेट (Paytm, MobiKwik, Freecharge), आणि ₹3,000 वरील कार्डवर EMI. Non-INR चलनांसाठी आंतरराष्ट्रीय कार्ड कार्य करतात (auto-FX). पेमेंट Razorpay द्वारे प्रक्रिया केले जातात — आम्ही कार्ड तपशील संग्रहित करत नाही.',
  },
  'billing-cancel-refund': {
    question: 'खरेदीनंतर मी प्लॅन रद्द करून परतावा मिळवू शकतो का?',
    answer:
      'जर आपण कोणताही कोटा वापरला नसेल तर खरेदीच्या 2 दिवसांच्या आत आपण परताव्यासाठी विनंती करू शकता (CV unlock नाही, paid plan-वर job post नाही, Assisted Hiring कॉल शेड्यूल केलेला नाही). 2 दिवसांनंतर किंवा वापरानंतर प्लॅन परत न करण्यायोग्य आहेत परंतु भविष्यातील शुल्क थांबविण्यासाठी आपण कधीही auto-renew रद्द करू शकता आणि वैधता संपेपर्यंत प्लॅन वापरणे सुरू ठेवू शकता. पूर्ण अटींसाठी Refund Policy पहा.',
  },
  'billing-recurring': {
    question: 'आपण recurring payments support करता का?',
    answer:
      'होय — Vendor Connect (₹199/महिना) Razorpay eMandate (cards) किंवा UPI AutoPay (UPI) द्वारे मासिक auto-renewed आहे. इतर plans समान window वर पर्यायी auto-renew support करतात. Billing → Subscriptions वरून कधीही auto-renew cancel करा; cancellation भविष्यातील charges त्वरित थांबवते आणि current cycle संपेपर्यंत access continues.',
  },
  'billing-upgrade-mid-cycle': {
    question: 'Mid-cycle upgrades कसे कार्य करतात?',
    answer:
      'आम्ही remaining validity आणि unused quota च्या आधारे आपल्या current plan मधून pro-rated credits compute करतो, नंतर ते new plan price मधून deduct करतो — आपण फक्त difference pay करता. Unused CV unlocks new plan मध्ये carry forward होतात (per-plan cap नुसार). In flight job posts त्यांच्या original validity वर continue करतात; new posts upgraded plan च्या settings वापरतात. Upgrades त्वरित activate होतात; downgrades साठी refunds supported नाहीत.',
  },
  'billing-quote-enterprise': {
    question: 'CV Enterprise साठी custom quote कसे मिळवायचे?',
    answer:
      'CV Enterprise card वर "Contact Sales" click करा किंवा /billing/quote ला भेट द्या. आपले team size, expected CV unlock volume आणि कोणतीही compliance requirements (DPDP, custom MSA, on-prem deployment) भरा. आमची sales team 1 business day मध्ये tailored proposal सह respond करते. Custom plans सहसा unlimited search results, multi-seat sharing, bulk CV download, dedicated CSM आणि SLA-backed dedicated support समाविष्ट करतात.',
  },
  'billing-currency-fx': {
    question: 'मी INR व्यतिरिक्त इतर currency मध्ये pay करू शकतो का?',
    answer:
      'होय — international cards Razorpay च्या FX engine द्वारे auto-converted आहेत. Page default वर INR pricing दर्शविते; checkout वर visualisation साठी displayed currency (USD / EUR / GBP / SGD / AED) switch करू शकता, परंतु आपल्या card वर charge नेहमी INR मध्ये असतो, bank चा standard FX rate applied. GST फक्त Indian customers साठी लागू; international invoices zero-GST.',
  },
  'billing-failed-payment': {
    question: 'माझे payment fail झाले — पुढे काय?',
    answer:
      'One-time plans साठी, आपण Billing → Orders → "Resume Payment" वरून त्वरित retry करू शकता (link 24 hours valid). Auto-renewed subscriptions साठी, आम्ही 7 days मध्ये 4 वेळा automatically retry करतो; प्रत्येक failed attempt नंतर आपल्याला retry link सह email मिळतो. 4 failures नंतर subscription grace mode मध्ये (3 अधिक दिवस access) entries आणि शेवटी lapses. Resume करण्यासाठी कधीही payment method update करा.',
  },
  'billing-invoice-gstin': {
    question: 'Input tax credit साठी मी invoices वर माझा company GSTIN add करू शकतो का?',
    answer:
      'होय — Billing → Tax Details → checkout आधी आपला 15-digit GSTIN enter करा. Past invoices ला GSTIN सह reissue करण्यासाठी invoice date पासून 30 days मध्ये support@hireadda.in शी संपर्क साधा. Reissue केल्यावर original invoice आमच्या records मध्ये void होते आणि new invoice (समान number, GSTIN added) पाठवले जाते. Standard ITC rules apply — eligibility साठी आपल्या CA सह consult करा.',
  },
  'billing-promo-coupon': {
    question: 'Promo / coupon code कसे apply करावे?',
    answer:
      'Checkout page वर "Have a coupon code?" click करा आणि code enter करा. आम्ही plan आणि आपल्या account विरुद्ध validate करतो (काही codes first-time-only किंवा audience-specific) आणि payment आधी discounted total दर्शवतो. Referrals किंवा partner offers मधील codes त्यांच्या link वर click केल्यावर auto-apply होतात. आपण coupon ला carry-forward credits सह stack करू शकता परंतु दुसऱ्या coupon सह नाही.',
  },
  'billing-tax-invoice-download': {
    question: 'Tax invoice कसे download करावे?',
    answer:
      'Billing → Invoices उघडा → कोणत्याही invoice वर click → "Download PDF". Invoices GST-compliant आहेत, HSN code 998314 समाविष्ट, आपला billing address (आणि GSTIN add असल्यास), आणि आपल्या records साठी एक unique invoice number. समान invoice payment time वर auto-emailed देखील. PDFs digitally signed आहेत म्हणून tamper-evident आणि accounting साठी proof म्हणून acceptable.',
  },
  'billing-payment-history': {
    question: 'मी माझा payment history कुठे पाहू शकतो?',
    answer:
      'Billing → Orders प्रत्येक transaction (paid / failed / refunded) timestamp, amount, plan, payment method आणि invoice + ledger entry च्या link सह दर्शविते. आपण status, date range किंवा plan द्वारे filter करू शकता. Refunds separate negative-amount entries म्हणून दिसतात, original order ला linked back. Accounting reconciliation साठी समान page वरून full history CSV म्हणून export करा.',
  },
  'billing-receipt-vs-invoice': {
    question: 'Receipt आणि tax invoice मधील फरक काय?',
    answer:
      'Receipt पुष्टी करते की payment received झाले (Razorpay द्वारे success वर त्वरित issued). Tax invoice tax purposes साठी sale दर्शविणारे GST-compliant document — input tax credit claims आणि accounting साठी आवश्यक. Hire Adda प्रत्येक paid order साठी BOTH generate करते: receipt Razorpay confirmation email मध्ये, tax invoice server-side generated आणि minutes मध्ये emailed + नेहमी Billing → Invoices मध्ये available.',
  },
  'billing-checkout-time': {
    question: 'Checkout कधीकधी इतका वेळ का घेते?',
    answer:
      'Checkout एक Razorpay order create करते, आपल्या account history विरुद्ध fraud check चालवते (नवीन accounts अतिरिक्त scrutiny मिळवतात), आणि entitlement quota reserve करते — सहसा <2 seconds. ते जास्त वेळ घेत असल्यास, bank किंवा UPI app redirect वर slow असू शकते. Checkout >30 seconds stuck असल्यास, page refresh करा (आपला order preserved) आणि Billing → Orders वरून "Resume payment" click करा. Recurring failures bank flag दर्शवू शकतात.',
  },
};

export const FAQS_MR: FaqEntry[] = FAQS_EN.map((entry) => {
  const t = MR_TRANSLATIONS[entry.id];
  return t ? { ...entry, question: t.question, answer: t.answer } : entry;
});
