import type { FaqEntry } from './types';
import { FAQS_EN } from './faqs.en';

/**
 * Hindi translations. Mirror the English `id` set exactly so locale
 * fallback works. Categories, audiences, pageContexts, keywords are
 * inherited from English (only question + answer are per-locale).
 */
const HI_TRANSLATIONS: Record<string, { question: string; answer: string }> = {
  'create-account': {
    question: 'Hire Adda पर खाता कैसे बनाएँ?',
    answer:
      'खाता बनाना सरल और मुफ़्त है। होमपेज पर "Get Started" या "Sign Up" बटन पर क्लिक करें। आप अपने ईमेल और पासवर्ड से रजिस्टर कर सकते हैं या Google/LinkedIn से तुरंत साइन अप कर सकते हैं। रजिस्टर होने के बाद, आपकी प्रोफ़ाइल — कौशल, अनुभव और जॉब प्राथमिकताओं — को पूरा करने के लिए चरण-दर-चरण मार्गदर्शन मिलेगा।',
  },
  'forgot-password': {
    question: 'अपना पासवर्ड कैसे रीसेट करें?',
    answer:
      'यदि आप पासवर्ड भूल गए हैं, तो लॉगिन पेज पर "Forgot Password" क्लिक करें। अपने खाते से जुड़ा ईमेल दर्ज करें — हम आपको पासवर्ड रीसेट लिंक भेजेंगे (1 घंटे तक मान्य)। लिंक पर क्लिक करके नया पासवर्ड सेट करें। यदि ईमेल नहीं मिले तो स्पैम फ़ोल्डर देखें या सहायता टीम से संपर्क करें।',
  },
  'delete-account': {
    question: 'मैं अपना खाता कैसे हटाऊँ?',
    answer:
      'खाता हटाने के लिए Settings → "Danger Zone" → "Delete Account" पर जाएँ और पुष्टि करें। ध्यान दें: खाता हटाना स्थायी है — आपकी सभी जानकारी (एप्लिकेशन, सहेजी गई जॉब, मैसेज) 30 दिनों के भीतर पूरी तरह हटा दी जाएगी।',
  },
  'contact-support': {
    question: 'सहायता टीम से कैसे संपर्क करें?',
    answer:
      'आप कई माध्यमों से हमसे संपर्क कर सकते हैं — ईमेल: support@hireadda.in, टोल-फ्री फोन: +91 1762469136 (सोम–शुक्र, 9 AM – 6 PM IST), या Contact पेज पर सीधा संदेश भेजें। लॉगिन किए गए उपयोगकर्ताओं के लिए इन-ऐप चैट भी उपलब्ध है। हम आम तौर पर 24 घंटे के भीतर जवाब देते हैं।',
  },
  'mobile-app': {
    question: 'क्या Hire Adda का मोबाइल ऐप है?',
    answer:
      'हम Android और iOS दोनों के लिए नेटिव ऐप पर काम कर रहे हैं — Q3 2026 में लॉन्च की उम्मीद है। फ़िलहाल वेबसाइट पूरी तरह मोबाइल-रेस्पॉन्सिव है और मोबाइल ब्राउज़र पर बेहतरीन काम करती है। होम स्क्रीन पर ऐप-जैसे अनुभव के लिए "Add to Home Screen" का इस्तेमाल कर सकते हैं। ब्राउज़र पुश नोटिफ़िकेशन भी समर्थित हैं।',
  },
  'languages-supported': {
    question: 'Hire Adda कौन-कौन सी भाषाओं का समर्थन करता है?',
    answer:
      'Hire Adda अभी अंग्रेज़ी में पूर्ण रूप से उपलब्ध है। हिन्दी, तमिल, तेलुगु, बंगाली और मराठी UI अनुवाद 2026 में रोल-आउट हो रहे हैं। जॉब विवरण, एप्लिकेशन और सर्च किसी भी भाषा में काम करते हैं — हमारा मैचिंग इंजन सभी प्रमुख भारतीय भाषाओं की क्वेरी समझता है। FAQ अपनी पसंदीदा भाषा में पढ़ने के लिए हेल्प सेंटर के भाषा-चयनकर्ता का उपयोग करें।',
  },
  'who-is-it-for': {
    question: 'Hire Adda किसके लिए बना है?',
    answer:
      'Hire Adda तीन समुदायों की सेवा करता है — (1) नौकरी ढूँढ़ने वाले उम्मीदवार (फ्रेशर से सीनियर लीडर तक, हर इंडस्ट्री में), (2) नियोक्ता और भर्ती टीमें (पहली नौकरी पोस्ट करने वाले स्टार्टअप से लेकर सैकड़ों रिक्तियाँ संभालने वाले एंटरप्राइज़ तक), और (3) रिक्रूटमेंट-वेंडर एजेंसियाँ जो क्लाइंट के लिए उम्मीदवार खोजती हैं। हर समुदाय के लिए अलग डैशबोर्ड, प्लान और सहायता प्रवाह है।',
  },
  'two-factor-auth': {
    question: 'Two-Factor Authentication (2FA) कैसे चालू करें?',
    answer:
      'Settings → Security → Two-Factor Authentication खोलें। किसी भी authenticator ऐप (Google Authenticator, Authy, 1Password, Microsoft Authenticator) से QR कोड स्कैन करें और 6-अंकीय कोड दर्ज करें। हम backup codes भी जनरेट करेंगे — डिवाइस खोने की स्थिति के लिए सुरक्षित जगह सहेजें। पासवर्डलेस साइन-इन के लिए passkey (Face ID, Touch ID, Windows Hello) भी रजिस्टर कर सकते हैं।',
  },
  'trust-device': {
    question: '"Trust this device for 30 days" विकल्प क्या करता है?',
    answer:
      '2FA सत्यापन के बाद इसे चुनने पर वर्तमान ब्राउज़र पर एक सुरक्षित कुकी सेट हो जाती है। उसी ब्राउज़र से 30 दिनों तक होने वाले अगले साइन-इन में 2FA प्रॉम्प्ट छूट जाता है। यह कुकी केवल उसी ब्राउज़र पर मान्य है — अलग डिवाइस, incognito विंडो या नए ब्राउज़र पर 2FA फिर पूछा जाएगा। Settings → Security से ट्रस्ट किए गए डिवाइसेज़ रिवोक किए जा सकते हैं।',
  },
  'sessions-revoke': {
    question: 'सक्रिय सत्र (active sessions) कैसे देखें और रद्द करें?',
    answer:
      'Settings → Security → Active Sessions में आपके खाते में लॉगिन किए गए हर डिवाइस/ब्राउज़र की लिस्ट IP, स्थान (शहर-स्तर) और अंतिम-सक्रिय समय के साथ दिखती है। किसी भी सत्र के पास "Revoke" क्लिक करके उसे तुरंत साइन-आउट करें, या "Revoke all other sessions" से वर्तमान ब्राउज़र को छोड़कर बाकी सब रद्द करें। फ़ोन गुम होने जैसी स्थितियाँ यहीं संभाली जाती हैं।',
  },
  'lost-mfa-device': {
    question: 'मेरा authenticator डिवाइस खो गया — खाता कैसे रिकवर करें?',
    answer:
      '2FA प्रॉम्प्ट पर "Can\'t access authenticator?" → "Send Recovery Code" क्लिक करें। हम आपके खाते के ईमेल पर 6-अंकीय कोड भेजेंगे। उसे दर्ज करने पर 2FA अक्षम हो जाएगा और आप साइन-इन कर सकेंगे। तुरंत 2FA फिर से सक्षम करें। शुरू में 2FA सक्षम करते समय सहेजे गए backup codes में से किसी एक का भी उपयोग किया जा सकता है — हर backup code केवल एक बार चलता है।',
  },
  'data-privacy': {
    question: 'Hire Adda मेरी व्यक्तिगत जानकारी की सुरक्षा कैसे करता है?',
    answer:
      'हम भारत के Digital Personal Data Protection (DPDP) अधिनियम का पालन करते हैं और OWASP Top 10 सर्वोत्तम प्रथाओं का अनुसरण करते हैं। डेटा transit (TLS 1.3) और rest दोनों में encrypted है। संवेदनशील फ़ील्ड (मोबाइल नंबर, सैलरी, संपर्क विवरण) कभी सार्वजनिक API में नहीं लौटाए जाते — नियोक्ताओं को देखने के लिए विशेष entitlement (जैसे CV unlock) चाहिए। Settings से कभी भी अपना डेटा निर्यात या डिलीट कर सकते हैं।',
  },
  'candidate-apply-job': {
    question: 'प्लेटफ़ॉर्म पर जॉब के लिए आवेदन कैसे करें?',
    answer:
      'प्रोफ़ाइल बनाने के बाद, सर्च बार से जॉब्स ब्राउज़ करें या डैशबोर्ड पर क्यूरेट की गई लिस्टिंग देखें। पसंदीदा जॉब मिले तो विवरण पेज पर "Apply" क्लिक करें — आपकी प्रोफ़ाइल और रिज़्यूमे नियोक्ता को साझा किया जाएगा। "Quick Apply" चालू करके सहेजी गई प्रोफ़ाइल से एक क्लिक में कई पदों पर आवेदन कर सकते हैं।',
  },
  'candidate-update-profile': {
    question: 'अपनी प्रोफ़ाइल कैसे अपडेट करें?',
    answer:
      'खाते में लॉगिन करें और डैशबोर्ड से प्रोफ़ाइल पेज पर जाएँ। आप किसी भी समय व्यक्तिगत जानकारी, अनुभव, शिक्षा, कौशल और प्राथमिकताएँ संपादित कर सकते हैं। "Edit Profile" क्लिक करके बदलाव करें — सहेजना न भूलें। अद्यतन प्रोफ़ाइल हमारे मैचिंग इंजन को आपके लिए बेहतर अवसर खोजने में मदद करती है।',
  },
  'candidate-resume-upload': {
    question: 'मैं कौन-से रिज़्यूमे फ़ॉर्मैट अपलोड कर सकता हूँ?',
    answer:
      'अपना CV PDF या DOCX (अधिकतम 10 MB) में अपलोड करें। हमारा Document AI parser आपकी कार्य-सूची, शिक्षा और कौशल स्वतः निकालता है — सहेजने से पहले सुझाए गए फ़ील्ड समीक्षा करें। प्रोफ़ाइल पर एक से अधिक रिज़्यूमे संस्करण रख सकते हैं और हर एप्लिकेशन के साथ चुन सकते हैं कि कौन-सा भेजना है। टिप: स्पष्ट सेक्शन हेडिंग वाला structured PDF सबसे सटीक parse होता है।',
  },
  'candidate-premium-benefits': {
    question: 'Candidate Premium (₹199) में क्या-क्या शामिल है?',
    answer:
      '₹199 (एक-बार) में Candidate Premium पाँच ठोस लाभ देता है: AI Resume Premium (4 paid templates ऑटो-formatting के साथ), प्रोफ़ाइल पर Verified Badge, 7 दिन का Profile Boost (recruiter searches में सबसे ऊपर), Priority WhatsApp सहायता (+91 80540 50551 पर chat, आम तौर पर 30 मिनट के भीतर जवाब), और आपके कौशल से संबंधित candidate searches में Top Visibility रैंकिंग। प्लान 30 दिन के लिए मान्य है।',
  },
  'whatsapp-support-channel': {
    question: 'WhatsApp सहायता से कैसे संपर्क करें?',
    answer:
      'WhatsApp Support शामिल करने वाले plans — Candidate Premium (₹199), Employer Standard (₹499), Employer Premium (₹999), CV Pro (₹3999), Assisted Hiring (₹1499), और Vendor Connect (₹199/महीना) — को हमारे dedicated WhatsApp support नंबर का एक्सेस मिलता है: +91 80540 50551 (https://wa.me/918054050551)। उपलब्धता: सोम-शनि, 9 AM – 9 PM IST। Premium / Priority tiers को तेज़ जवाब मिलते हैं (आम तौर पर 30 मिनट के भीतर); standard tier कुछ घंटों में जवाब देता है। सदस्यता लेने के बाद नंबर आपके dashboard पर दिखाया जाता है।',
  },
  'candidate-applications-track': {
    question: 'मैं अपनी एप्लिकेशन को कैसे ट्रैक करूँ?',
    answer:
      'Dashboard → Applications खोलें। हर पंक्ति में रोल, कंपनी, वर्तमान स्थिति (Applied / Reviewed / Shortlisted / Interview / Hired / Rejected) और नवीनतम अपडेट का समय दिखाई देता है। किसी भी एप्लिकेशन पर क्लिक करके पूरी timeline देखें — नियोक्ता-side notes (जब साझा हों) और आपके screening प्रश्नों के उत्तर भी। हर स्थिति बदलाव पर ईमेल + पुश नोटिफ़िकेशन भेजे जाते हैं।',
  },
  'candidate-profile-visibility': {
    question: 'क्या मैं अपनी मौजूदा कंपनी से प्रोफ़ाइल छिपा सकता हूँ?',
    answer:
      'हाँ — Settings → Privacy → "Hide profile from selected employers" से विशिष्ट कंपनी खातों (और उस कंपनी के डोमेन के किसी भी उपयोगकर्ता) को CV-database searches में आपकी प्रोफ़ाइल देखने से रोक सकते हैं। "Make profile private" से प्रोफ़ाइल पूरी तरह छिपाई जा सकती है — केवल उन जॉब्स में दिखेगी जिनके लिए आप स्वयं आवेदन करेंगे। उस नियोक्ता के साथ आपका एप्लिकेशन इतिहास प्रभावित नहीं होता।',
  },
  'candidate-job-alerts': {
    question: 'जॉब अलर्ट कैसे काम करते हैं?',
    answer:
      'जॉब्स पेज पर चलाई गई किसी भी सर्च को Job Alert के रूप में सहेजें — हम मेल पर रोज़, साप्ताहिक या तत्काल नए मैचिंग रोल्स भेजेंगे (आप चुनें)। अलर्ट आपके फ़िल्टर का सटीक पालन करते हैं: कौशल, स्थान, अनुभव, work mode, salary range। Dashboard → Job Alerts से कभी भी पॉज़/मैनेज करें। यदि 30 दिनों तक किसी अलर्ट पर क्लिक नहीं किया, तो वे स्वतः रुक जाते हैं।',
  },
  'candidate-recommendations': {
    question: 'जॉब सिफ़ारिशें कैसे जनरेट होती हैं?',
    answer:
      'सिफ़ारिशें तीन संकेतों को मिलाती हैं: (1) आपकी प्रोफ़ाइल और जॉब के आवश्यक कौशल का overlap (recency-weighted), (2) Google Cloud Talent का AI मैचिंग जो लाखों hires पर प्रशिक्षित है, और (3) आपके पिछले इंटरैक्शन (apply, save, dismiss) से सीखी गई पसंद। सिफ़ारिशें हर 4 घंटे में रिफ़्रेश होती हैं — Recommendations पेज से मैनुअली भी रिफ़्रेश कर सकते हैं।',
  },
  'candidate-interview-prep': {
    question: 'क्या Hire Adda इंटरव्यू तैयारी में मदद करता है?',
    answer:
      'जब कोई नियोक्ता Hire Adda के माध्यम से इंटरव्यू शेड्यूल करता है, तो एप्लिकेशन विवरण पेज पर एक तैयार पैनल दिखता है — नियोक्ता ने ऐतिहासिक रूप से जिन कौशलों पर पूछा है, सफल hires ने औसतन कितना तैयारी समय बताया, और साथ लाने योग्य चीज़ों की चेकलिस्ट (रिज़्यूमे, ID, सर्टिफ़िकेट)। यदि उस रोल + शहर पर कम-से-कम 3 hires पूरे हो चुके हैं, तो salary-range डेटा भी दिखाते हैं।',
  },
  'employer-post-job': {
    question: 'नियोक्ता के रूप में जॉब कैसे पोस्ट करें?',
    answer:
      'नियोक्ता के रूप में रजिस्टर करें और कंपनी प्रोफ़ाइल पूरी करें — कंपनी का नाम, विवरण, उद्योग और स्थान। verify होने के बाद Employer Dashboard पर "Post a Job" क्लिक करें। शीर्षक, विवरण, आवश्यक कौशल, salary range आदि भरें। गुणवत्ता सुनिश्चित करने के लिए संक्षिप्त मॉडरेशन समीक्षा के बाद आपकी listing लाइव हो जाएगी।',
  },
  'employer-free-plan': {
    question: 'Free Job Post प्लान (₹0) में क्या मिलता है?',
    answer:
      'Free प्लान में 1 जॉब पोस्ट 7 दिनों तक लाइव, अधिकतम 50 एप्लिकेशन, 1 स्थान, बेसिक कैंडिडेट डैशबोर्ड एक्सेस और स्टैंडर्ड लिस्टिंग विज़िबिलिटी मिलती है। employer onboarding पूरा होने पर यह स्वतः मिलता है — कार्ड की ज़रूरत नहीं। नवीनीकरण भुगतान के साथ है; validity बढ़ाने, application cap बढ़ाने और CV-database access पाने के लिए कभी भी Standard (₹499) या Premium (₹999) में अपग्रेड कर सकते हैं।',
  },
  'employer-cv-database': {
    question: 'CV Database (Talent Vault) क्या है और कैसे काम करता है?',
    answer:
      'CV Database हर candidate प्रोफ़ाइल की searchable index है। कौशल, स्थान, अनुभव, salary, last-active, education आदि से फ़िल्टर करें। हर प्लान निश्चित संख्या में "CV unlocks" देता है — किसी candidate के संपर्क विवरण (ईमेल + फ़ोन) देखने पर एक unlock खर्च होता है। सर्च मुफ़्त है; केवल contact जानकारी रिवील करने पर खर्च। CV Lite = 200 unlocks, CV Pro = 500, CV Enterprise = 1000+ (कस्टम)।',
  },
  'employer-applications-cap': {
    question: 'मेरी जॉब का applications cap पूरा होने पर क्या होता है?',
    answer:
      'नई एप्लिकेशन ब्लॉक हो जाती हैं — candidates को "Job is full" संदेश दिखता है। आप प्राप्त सभी एप्लिकेशन देख और shortlist कर सकते हैं। Free = 50, Standard = 250, Premium = unlimited cap। mid-cycle अपग्रेड पर उस listing का cap तुरंत हटा दिया जाता है। Cap हर-जॉब-पर है (खाता-स्तर पर नहीं) और जॉब को re-post करने पर रीसेट होता है।',
  },
  'employer-team-multi-seat': {
    question: 'क्या मेरी कंपनी के कई recruiter एक ही खाता साझा कर सकते हैं?',
    answer:
      'हाँ — Dashboard → Team से teammates आमंत्रित करें। CV Enterprise प्लान multi-seat sharing शामिल करते हैं: आमंत्रित लोग RECRUITER या ADMIN सदस्य बनते हैं और कंपनी के साझा CV-unlock + search-result quota pool से उपयोग करते हैं। निचले प्लान (Standard, Premium, CV Lite, CV Pro) एकल-seat ही हैं। मालिक कभी भी ownership ट्रांसफ़र या seat revoke कर सकते हैं।',
  },
  'employer-assisted-hiring': {
    question: 'Assisted Hiring (₹1499) कैसे काम करता है?',
    answer:
      '₹1499 भुगतान करें → हमारा specialist एक कार्यदिवस के भीतर आपको कॉल करके रोल scope करता है → हम 4–5 मैचिंग CV स्रोत करते हैं और 7 दिनों के भीतर ईमेल पर भेजते हैं। आप स्वयं candidates से संपर्क और इंटरव्यू करते हैं; matching legwork हम करते हैं। हर प्लान एक रोल कवर करता है। प्रगति Dashboard → Assisted Hiring में Pending → Call Scheduled → Sourcing → Delivered स्थितियों के साथ ट्रैक करें।',
  },
  'employer-urgent-badge': {
    question: 'Urgent Hiring Badge कैसे काम करता है?',
    answer:
      'Premium ₹999 प्लान में उपलब्ध। पोस्ट करते समय जॉब को URGENT या IMMEDIATE मार्क करने पर listing कार्ड पर लाल Urgent बैज लगता है, candidate searches में +20 ranking boost मिलता है, और candidate dashboards के Urgent jobs widget में दिखता है। पहली hire पर या जॉब की validity समाप्त होने पर बैज स्वतः हट जाता है।',
  },
  'employer-verification': {
    question: 'अपनी कंपनी कैसे verify कराएँ?',
    answer:
      'Settings → Verification → GST सर्टिफ़िकेट, PAN और कंपनी-डोमेन ईमेल प्रमाण जमा करें। हमारी टीम 1–2 कार्यदिवस में समीक्षा करती है। Verified कंपनियों को हर जॉब listing, कंपनी प्रोफ़ाइल पेज और recruiter outreach पर हरा checkmark मिलता है — हमारे डेटा में verified listings पर candidate विश्वास ~40% अधिक application rate देता है।',
  },
  'employer-screening-questions': {
    question: 'क्या मैं अपनी जॉब में screening प्रश्न जोड़ सकता हूँ?',
    answer:
      'हाँ — जॉब पोस्ट या edit करते समय "Screening Questions" तक scroll करें और 10 तक custom प्रश्न (text, multiple choice, yes/no) जोड़ें। किसी को required (आवेदन करने के लिए ज़रूरी) या deal-breaker (गलत उत्तर पर auto-reject) मार्क करें। candidates apply form पर आपके प्रश्न देखते हैं; उत्तर एप्लिकेशन विवरण पेज पर आते हैं ताकि आप पूरी CV देखने से पहले pre-qualify कर सकें।',
  },
  'employer-analytics': {
    question: 'कौन-से analytics उपलब्ध हैं?',
    answer:
      'Employer Analytics आपकी हायरिंग funnel (Views → Applies → Shortlists → Interviews → Hires) हर जॉब पर और कुल मिलाकर दिखाता है, time-to-hire और time-to-fill मेट्रिक्स, स्रोत-वार breakdown (organic search, recommendations, applications, CV unlocks), और multi-seat प्लान पर team-member productivity। CSV export उपलब्ध है। Premium और CV Enterprise प्लान अतिरिक्त cohort + benchmark views देते हैं।',
  },
  'vendor-what-is': {
    question: 'Vendor Connect क्या है और किसके लिए है?',
    answer:
      'Vendor Connect recruitment agencies, staffing partners और स्वतंत्र recruiters के लिए है जो कई client कंपनियों के लिए candidates खोजते हैं। ₹199/महीना (auto-renewed) में आप हमारी public Vendor Directory में listed होते हैं, अपने specialisations से मेल खाने वाली कंपनियों से routed hiring leads प्राप्त करते हैं, और नियोक्ताओं को referral विकल्प के रूप में दिखाई देते हैं। Plan मासिक है और कभी भी रद्द किया जा सकता है।',
  },
  'vendor-receive-leads': {
    question: 'मुझे hiring leads कैसे मिलते हैं?',
    answer:
      'सब्सक्राइब करने के बाद अपने "Specialisations" (जैसे IT, BFSI, healthcare), service स्थान और उद्योग कॉन्फ़िगर करें। जब कंपनियाँ "Find Recruitment Partners" से आपके मेल खाते मानदंडों के साथ खोजती हैं, तो आप directory में दिखते हैं। फिर वे आपको सीधे hiring requirement भेज सकती हैं — Dashboard → Lead Inbox में पूरे रोल विवरण और संपर्क जानकारी के साथ दिखाई देगी।',
  },
  'vendor-priority-leads': {
    question: 'Priority Access to New Leads कैसे काम करता है?',
    answer:
      'Vendor Connect सब्सक्राइबर्स को कंपनी द्वारा देखे जाने वाले matching score में +5 ranking बोनस मिलता है, तो आप उनकी candidate vendors की preview list में ऊपर दिखते हैं। प्राथमिकता overlap quality (कौशल + स्थान + उद्योग) के अनुसार होती है तो एक perfect-match basic vendor एक unrelated priority vendor से ऊपर रहेगा। Leads exclusive नहीं हैं — एक रोल के लिए कई vendors से संपर्क किया जा सकता है।',
  },
  'vendor-public-listing': {
    question: 'मेरी agency प्रोफ़ाइल सार्वजनिक रूप से कहाँ दिखती है?',
    answer:
      'Active subscribers public /vendors directory में दिखाई देते हैं (कोई भी ब्राउज़ कर सकता है, Google पर index होती है) और /vendors/{slug} पर dedicated profile पेज होती है — आपकी specialisations, स्थान, team size और (वैकल्पिक) testimonials दिखाते हुए। Employer Dashboard → Vendor → Business Profile से public profile संपादित करें — content moderation समीक्षा के बाद कुछ ही मिनटों में बदलाव लाइव हो जाते हैं।',
  },
  'vendor-cancel': {
    question: 'Vendor Connect कैसे रद्द करें?',
    answer:
      'Billing → Subscriptions → Vendor Connect → "Cancel auto-renew" खोलें। आपकी access वर्तमान billing अवधि समाप्त होने तक (खरीद से 30 दिन) जारी रहती है, फिर समाप्त — नए leads मिलना बंद, ऐतिहासिक डेटा सुरक्षित। आप कभी भी फिर से सब्सक्राइब कर सकते हैं; subscriptions के बीच मौजूदा प्रोफ़ाइल डेटा बना रहता है।',
  },
  'billing-gst': {
    question: 'क्या GST मूल्य में शामिल है?',
    answer:
      'हाँ — सभी सूचीबद्ध प्लान 18% GST सहित हैं। भुगतान के बाद HSN code 998314 के साथ tax invoice स्वतः जनरेट होकर आपको ईमेल हो जाता है। Invoices Billing → Invoices से कभी भी PDF में डाउनलोड कर सकते हैं। B2B GSTIN दावों के लिए checkout से पहले Billing → Tax Details में अपनी कंपनी GSTIN जोड़ें — हर बाद के invoice पर दिखाई देगी।',
  },
  'billing-payment-methods': {
    question: 'आप कौन-से भुगतान माध्यम स्वीकार करते हैं?',
    answer:
      'UPI (Google Pay / PhonePe / Paytm / BHIM / कोई भी UPI ऐप), सभी प्रमुख क्रेडिट/डेबिट कार्ड (Visa, Mastercard, RuPay, Amex), 50+ भारतीय बैंकों से netbanking, मोबाइल वॉलेट (Paytm, MobiKwik, Freecharge), और ₹3,000 से ऊपर कार्ड पर EMI। Non-INR मुद्राओं के लिए international cards भी (auto-FX)। भुगतान Razorpay द्वारा process होते हैं — हम कार्ड विवरण store नहीं करते।',
  },
  'billing-cancel-refund': {
    question: 'क्या खरीद के बाद प्लान रद्द करके refund पा सकते हैं?',
    answer:
      'खरीद के 2 दिनों के भीतर refund अनुरोध कर सकते हैं — बशर्ते कोई quota उपयोग न किया हो (कोई CV unlock, paid plan पर कोई job post, कोई Assisted Hiring कॉल scheduled नहीं)। 2 दिनों के बाद या उपयोग के बाद plans non-refundable हैं, लेकिन भविष्य के charges रोकने के लिए कभी भी auto-renew रद्द कर सकते हैं और validity समाप्त होने तक प्लान का उपयोग जारी रख सकते हैं। पूर्ण शर्तों के लिए Refund Policy देखें।',
  },
  'billing-recurring': {
    question: 'क्या आप recurring payments का समर्थन करते हैं?',
    answer:
      'हाँ — Vendor Connect (₹199/महीना) Razorpay eMandate (cards) या UPI AutoPay (UPI) के माध्यम से मासिक auto-renewed होता है। अन्य plans उसी विंडो पर वैकल्पिक auto-renew समर्थन करते हैं। Billing → Subscriptions से कभी भी auto-renew रद्द करें; रद्दीकरण भविष्य के charges तुरंत रोकता है और access वर्तमान चक्र समाप्त होने तक जारी रहता है।',
  },
  'billing-upgrade-mid-cycle': {
    question: 'mid-cycle upgrade कैसे काम करता है?',
    answer:
      'हम आपके वर्तमान प्लान से शेष validity और unused quota के आधार पर pro-rated credits गणना करते हैं और नए प्लान की कीमत से घटाते हैं — आप केवल अंतर भुगतान करते हैं। बिना उपयोग किए CV unlocks नए प्लान में carry forward होते हैं (per-plan cap के अनुसार)। चालू job posts अपनी मूल validity पर जारी रहती हैं; नई posts upgraded plan की settings उपयोग करती हैं। Upgrade तुरंत active होते हैं; downgrade पर refund नहीं हैं।',
  },
  'billing-quote-enterprise': {
    question: 'CV Enterprise के लिए custom quote कैसे लें?',
    answer:
      'CV Enterprise card पर "Contact Sales" पर क्लिक करें या /billing/quote पर जाएँ। team size, expected CV unlock volume और कोई compliance आवश्यकताएँ (DPDP, custom MSA, on-prem deployment) भरें। हमारी sales टीम 1 कार्यदिवस के भीतर tailored प्रस्ताव के साथ उत्तर देती है। Custom plans में आम तौर पर unlimited search results, multi-seat sharing, bulk CV download, dedicated CSM और SLA-backed dedicated support शामिल हैं।',
  },
  'billing-currency-fx': {
    question: 'क्या मैं INR के अलावा किसी अन्य मुद्रा में भुगतान कर सकता हूँ?',
    answer:
      'हाँ — international cards Razorpay की FX engine के माध्यम से auto-converted हैं। Page पर default INR pricing दिखती है; checkout पर visualisation के लिए दिखाई गई मुद्रा (USD / EUR / GBP / SGD / AED) बदल सकते हैं, लेकिन charge हमेशा INR में होता है और bank की standard FX दर लागू होती है। GST केवल भारतीय ग्राहकों पर लगता है; international invoices zero-GST हैं।',
  },
  'billing-failed-payment': {
    question: 'मेरा भुगतान विफल हो गया — आगे क्या होता है?',
    answer:
      'One-time plans के लिए, Billing → Orders → "Resume Payment" से तुरंत retry कर सकते हैं (link 24 घंटे मान्य)। Auto-renewed subscriptions के लिए, हम स्वतः 7 दिनों में 4 बार retry करते हैं; हर failed प्रयास के बाद retry link के साथ आपको ईमेल मिलता है। 4 failures के बाद subscription grace mode में जाती है (3 अधिक दिन access) और अंत में समाप्त। पुनः शुरू करने के लिए कभी भी payment method अपडेट करें।',
  },
  'billing-invoice-gstin': {
    question: 'क्या मैं input tax credit के लिए invoices पर अपनी कंपनी GSTIN जोड़ सकता हूँ?',
    answer:
      'हाँ — Billing → Tax Details → checkout से पहले अपनी 15-अंकीय GSTIN दर्ज करें। पिछली invoices को GSTIN के साथ reissue करने के लिए invoice तारीख से 30 दिनों के भीतर support@hireadda.in से संपर्क करें। reissue पर मूल invoice हमारे रिकॉर्ड में void कर दी जाती है और नई (समान संख्या, GSTIN जोड़ी हुई) भेजी जाती है। मानक ITC नियम लागू होते हैं — पात्रता के लिए अपने CA से परामर्श करें।',
  },
  'about-hire-adda': {
    question: 'Hire Adda क्या है?',
    answer:
      'Hire Adda एक भारत-केंद्रित हायरिंग प्लेटफ़ॉर्म है जो नौकरी ढूँढ़ने वालों, नियोक्ताओं और recruitment वेंडरों को एक ही स्टैक पर लाता है। हम पारंपरिक job-posting को searchable CV database, AI-powered जॉब मैचिंग, assisted hiring (हमारी टीम आपके लिए CV स्रोत करती है) और vendor मार्केटप्लेस के साथ जोड़ते हैं — सभी INR में, GST-अनुपालन और भारतीय हायरिंग बाज़ार के लिए बना।',
  },
  'regions-served': {
    question: 'Hire Adda कौन-कौन से क्षेत्र और शहर सेवा करता है?',
    answer:
      'Hire Adda सम्पूर्ण-भारत है — हर राज्य और केंद्र-शासित प्रदेश में जॉब्स और candidates listed हैं। हमारा सबसे मज़बूत कवरेज महानगरों (बेंगलुरु, मुंबई, दिल्ली-NCR, हैदराबाद, पुणे, चेन्नई, कोलकाता, अहमदाबाद) में है, टियर-2 और टियर-3 शहरों में volume तेज़ी से बढ़ रहा है। Remote और hybrid नौकरियाँ सीमाओं के पार चलती हैं, और हमारा matching engine अंग्रेज़ी सहित 5 क्षेत्रीय भाषाओं में queries समर्थन करता है।',
  },
  'safety-trust': {
    question: 'आप कैसे सुनिश्चित करते हैं कि नौकरियाँ और candidates असली हैं?',
    answer:
      'हर नियोक्ता पोस्ट करने से पहले कंपनी सत्यापन (GST + PAN + domain ईमेल प्रमाण) से गुज़रता है। जॉब posts content moderation से पास होती हैं जो scammy patterns ("apply करने के लिए भुगतान", "MLM", असंभव सैलरी) flag करती है। Candidate profiles ईमेल + मोबाइल OTP सत्यापन पाते हैं, और हम वैकल्पिक नियोक्ता / शिक्षा / अनुभव सत्यापन badges प्रदान करते हैं। संदिग्ध गतिविधि की समीक्षा हमारी Trust & Safety टीम 24 घंटे के भीतर करती है।',
  },
  'report-fraudulent': {
    question: 'मैं संदिग्ध या धोखाधड़ी वाली जॉब पोस्टिंग की रिपोर्ट कैसे करूँ?',
    answer:
      'यदि आप ऐसी जॉब listing देखते हैं जो धोखाधड़ी, भ्रामक या संदिग्ध लगती है, तो जॉब विवरण पेज पर "Report" बटन क्लिक करें। रिपोर्टिंग का कारण चुनें और कोई भी अतिरिक्त विवरण प्रदान करें। हमारी moderation टीम सभी रिपोर्ट 24-48 घंटों के भीतर समीक्षा करती है। तत्काल चिंताओं के लिए सीधे safety@hireadda.in पर भी रिपोर्ट भेज सकते हैं। पुष्ट scams पर तुरंत takedown और employer के लिए account suspension होता है।',
  },
  'platform-stats': {
    question: 'Hire Adda पर कितनी नौकरियाँ और कंपनियाँ हैं?',
    answer:
      'लाइव संख्याएँ homepage और /about पेज पर अपडेट होती हैं। Q2 2026 तक: 50,000+ candidates, 5,000+ verified नियोक्ता, 200+ शहरों में 12,000+ खुले रोल्स, और directory में 800+ recruitment vendors। साप्ताहिक एप्लिकेशन मात्रा उच्च लाखों में है। हम blog के माध्यम से तिमाही aggregate platform analytics साझा करते हैं।',
  },
  'email-change': {
    question: 'मैं अपना ईमेल पता कैसे बदलूँ?',
    answer:
      'Settings → Account → Email → "Change" खोलें। नया ईमेल और अपना वर्तमान पासवर्ड दर्ज करें। हम नए ईमेल पर एक verification link भेजते हैं — उस पर क्लिक करने से आपका account ईमेल बदल जाता है और पुराने ईमेल पर पुष्टि भेजी जाती है। पुराना ईमेल recovery channel के रूप में 7 दिनों तक काम करता रहता है। यदि आप पुराने ईमेल का access खो देते हैं, तो पहचान प्रमाण के साथ support@hireadda.in से संपर्क करें।',
  },
  'password-strength': {
    question: 'पासवर्ड की आवश्यकताएँ क्या हैं?',
    answer:
      'पासवर्ड कम से कम एक uppercase अक्षर, एक lowercase अक्षर, एक संख्या और एक विशेष character के साथ 8+ अक्षरों के होने चाहिए। हम 10,000 सबसे सामान्य breached पासवर्ड block करते हैं (HaveIBeenPwned की public list के विरुद्ध मेल खाते हैं)। registration form पर strength meter real time में entropy दिखाता है — "Strong" या "Very Strong" का लक्ष्य रखें। अधिकतम सुरक्षा के लिए, sign-up के बाद 2FA सक्षम करें और password-less login के लिए passkey रजिस्टर करने पर विचार करें।',
  },
  'multiple-accounts': {
    question: 'क्या मेरे अलग-अलग candidate और employer accounts हो सकते हैं?',
    answer:
      'हाँ — accounts role-locked हैं, इसलिए एक ईमेल एक role धारण कर सकता है। candidate और employer दोनों फ़ीचर्स का उपयोग करने के लिए, अलग ईमेल के साथ दूसरा account रजिस्टर करें। कई छोटे-व्यवसाय मालिक यह करते हैं: जॉब applications के लिए उनका व्यक्तिगत ईमेल + hiring के लिए कंपनी ईमेल। multi-seat employer plans (CV Enterprise) के साथ team-member invites भी काम करते हैं तो एक recruiter अपना personal candidate account खोए बिना आपकी कंपनी में शामिल हो सकता है।',
  },
  'export-data': {
    question: 'मैं अपना डेटा कैसे export करूँ?',
    answer:
      'Settings → Privacy → "Export my data" आपकी प्रोफ़ाइल, applications, संदेश और audit log को JSON + PDF के रूप में युक्त एक ZIP जनरेट करता है। निर्माण में कुछ मिनट लगते हैं; हम 24 घंटे के लिए मान्य download link ईमेल करते हैं। दुरुपयोग रोकने के लिए exports प्रत्येक 7 दिनों में एक तक सीमित हैं। यह DPDP Act के data portability अधिकार को पूरा करता है — आप चाहें तो दूसरे प्लेटफ़ॉर्म पर migrate करने के लिए export का उपयोग कर सकते हैं।',
  },
  'account-suspended': {
    question: 'मेरा account suspend किया गया था — मैं कैसे appeal करूँ?',
    answer:
      'Suspensions आम तौर पर बार-बार content violations, धोखाधड़ी गतिविधि, या chargebacks के कारण होते हैं। लॉगिन पेज कारण और "Submit an appeal" link दिखाएगा। अपील की समीक्षा 3-5 कार्यदिवसों के भीतर एक अलग moderator द्वारा की जाती है। यदि आपका account गलत तरीके से suspend हुआ है, तो आप पुनः बहाल हो जाएँगे और कोई भी consumed quota पुनर्स्थापित होगा। गंभीर उल्लंघन (नकली नौकरियाँ, scam ऑपरेशन) appeal के लिए पात्र नहीं हैं।',
  },
  'candidate-resume-templates': {
    question: 'Candidate Premium में कौन-से resume templates शामिल हैं?',
    answer:
      'Premium डिफ़ॉल्ट free के अलावा 4 paid templates unlock करता है: Modern Minimal (साफ़ two-column), Executive Classic (single-column पारंपरिक), Creative Bold (design / marketing roles के लिए colour accents), और ATS Pro (applicant-tracking-system parsing के लिए optimized)। प्रत्येक template आपके मौजूदा प्रोफ़ाइल डेटा को auto-format करता है — कोई re-typing नहीं। खरीदने से पहले सभी 5 (1 free + 4 premium) देख सकते हैं; non-premium users paid previews पर watermark देखते हैं।',
  },
  'candidate-saved-jobs': {
    question: 'Saved jobs कैसे काम करते हैं?',
    answer:
      'किसी भी जॉब पर bookmark आइकन क्लिक करके बाद के लिए सहेजें। Saved jobs Dashboard → Saved Jobs के तहत दिखाई देते हैं। सहेजना निजी है — नियोक्ता नहीं देख सकते कि किसने उनकी जॉब सहेजी। भरे या समाप्त हुए saved jobs auto-archive होते हैं लेकिन "अब applications स्वीकार नहीं कर रहे" note के साथ आपकी सूची में दिखाई देते रहते हैं। आप कितनी जॉब सहेज सकते हैं इसकी कोई सीमा नहीं है।',
  },
  'candidate-apply-without-account': {
    question: 'क्या मैं account बनाए बिना apply कर सकता हूँ?',
    answer:
      'नहीं — आवेदनों के लिए account आवश्यक है ताकि हम आपका application + resume विश्वसनीय रूप से नियोक्ता तक पहुँचा सकें, follow-ups का समर्थन कर सकें और आपको status track करने दे सकें। Account बनाना मुफ़्त है और ~60 सेकंड लगते हैं (ईमेल + पासवर्ड, या Google / LinkedIn के माध्यम से 1-click)। आपको रुचि वाले रोल्स के लिए, registering आपको जॉब सहेजने, समान रोल्स के लिए alerts सेट करने और भविष्य में एक click से apply करने देता है।',
  },
  'candidate-mock-interview': {
    question: 'क्या Hire Adda mock interviews प्रदान करता है?',
    answer:
      'AI-powered mock interviews चयनित रोल्स (software engineering, sales, customer support) के लिए beta में हैं। सिस्टम role-specific प्रश्न पूछता है, आपकी audio प्रतिक्रिया रिकॉर्ड करता है, और answer structure, filler words और उल्लिखित मुख्य कौशलों पर feedback देता है। Premium candidates के लिए मुफ़्त उपलब्ध, प्रति माह 3 mock sessions तक सीमित। जब आपका role दायरे में है तो Dashboard → Mock Interview से खोलें।',
  },
  'candidate-salary-research': {
    question: 'क्या मैं apply करने से पहले salaries research कर सकता हूँ?',
    answer:
      'हाँ — हर जॉब listing employer-disclosed salary range दिखाती है जब set हो। undisclosed रोल्स के लिए, listing अभी भी समान hires (role + location + experience) से प्राप्त अनुमानित range दिखाती है जब हमारे पास ≥10 data points हों। Dashboard → Salary Insights पर Salary Insights व्यापक market data देता है: role, शहर और अनुभव के वर्षों के अनुसार median + range, साथ ही आपकी वर्तमान/अपेक्षित CTC से तुलना यदि आपने इसे प्रोफ़ाइल पर भरा है।',
  },
  'candidate-fake-job-detection': {
    question: 'आप candidates को नकली नौकरियों से कैसे बचाते हैं?',
    answer:
      'तीन परतें: (1) पोस्ट करने से पहले हर नियोक्ता verify होता है (GST + PAN + domain ईमेल); (2) जॉब posts स्वचालित moderation से गुज़रती हैं जो scammy patterns ("apply के लिए pay", "registration fee", "investment opportunity") block करती है; (3) हर जॉब पर in-app Trust Score (0-5 stars) नियोक्ता के पिछले hires + verifications + report rate को factor करता है। 3 stars से नीचे की जॉब्स से बचें और upfront पैसे माँगने वाले किसी भी role को रिपोर्ट करें — Hire Adda कभी आपसे apply करने के लिए charge नहीं करेगा।',
  },
  'candidate-skill-test': {
    question: 'क्या Hire Adda पर skill assessments हैं?',
    answer:
      'हाँ — नियोक्ता jobs में skill assessments attach कर सकते हैं (multiple-choice, coding, video answers)। आप apply form पर assessment आवश्यकता देखते हैं और तब या बाद में (apply करने के 48 घंटों के भीतर) इसे ले सकते हैं। Scores आपको और नियोक्ता दोनों को दिखाई देते हैं। हम top in-demand कौशलों (JavaScript, Python, English communication, Excel) के लिए आपकी प्रोफ़ाइल पर self-administered skill tests भी समर्थन करते हैं — pass करने पर एक verified badge जुड़ता है जो recruiter visibility में सुधार करता है।',
  },
  'employer-edit-job': {
    question: 'पोस्ट करने के बाद मैं जॉब को कैसे edit करूँ?',
    answer:
      'Dashboard → My Jobs खोलें → जॉब पर click करें → "Edit"। आप वर्णन, आवश्यकताएँ, screening प्रश्न और salary range कभी भी अपडेट कर सकते हैं। Changes तेज़ moderation re-check (आम तौर पर एक घंटे से कम) के बाद लाइव होते हैं। पहली application प्राप्त होने के बाद critical fields (job title, type, work mode) edit नहीं किए जा सकते — इसके बजाय, application history clarity बनाए रखने के लिए role बंद करें और नया पोस्ट करें।',
  },
  'employer-close-job': {
    question: 'मैं जॉब listing को जल्दी कैसे बंद करूँ?',
    answer:
      'Dashboard → My Jobs → जॉब पर click करें → "Close listing"। एक कारण चुनें (Filled / Cancelled / Reposting) — आपके hiring analytics को प्रभावित करता है। बंद की गई jobs तुरंत नई applications स्वीकार करना बंद कर देती हैं और 5 मिनट के भीतर public search से गायब हो जाती हैं (ES reindex)। मौजूदा applications समीक्षा और outreach के लिए access योग्य रहती हैं। जॉब बंद करना आपकी शेष validity refund नहीं करता — यही कारण है कि cap per-listing है, per-day नहीं।',
  },
  'employer-bulk-cv-download': {
    question: 'Bulk CV download कैसे काम करता है?',
    answer:
      'CV Enterprise plans bulk download unlock करते हैं। अपने filters से CV database search करें → candidates check करें (max 100 per export) → "Download CVs as ZIP" क्लिक करें। ZIP में हर PDF candidate का सबसे-recent resume + एक structured profile summary है। प्रत्येक downloaded CV आपके quota से एक CV-unlock consume करता है (Enterprise plans में unlimited unlocks हैं)। Downloads audit के लिए logged हैं; candidate को एक notification दिखता है "आपका CV Acme Corp द्वारा download किया गया"।',
  },
  'employer-application-export': {
    question: 'क्या मैं अपनी applications को Excel / CSV में export कर सकता हूँ?',
    answer:
      'हाँ — Dashboard → Applications → अपने scope पर Filter करें (job, status, date range के अनुसार) → "Export as CSV"। Export में candidate name, contact (केवल unlocked candidates के लिए), application status, applied-on date, screening answers और shortlist notes शामिल हैं। PII मास्क की गई है जब तक contact unlock नहीं किया गया हो। quota abuse रोकने के लिए exports प्रति दिन 5 तक सीमित हैं।',
  },
  'employer-team-roles': {
    question: 'Team roles के पास क्या permissions हैं?',
    answer:
      'तीन roles: OWNER (पूर्ण access — billing + ownership transferring सहित), ADMIN (jobs, applications, team invites manage करें, लेकिन billing बदल नहीं सकते या company account बंद नहीं कर सकते), RECRUITER (CVs search करें, applicants shortlist करें, company account के लिए jobs पोस्ट करें, लेकिन team members invite नहीं कर सकते)। सभी roles कंपनी का CV-unlock + search-result quota pool साझा करते हैं। Team & roles Dashboard → Team से प्रबंधित होते हैं।',
  },
  'employer-vendor-find': {
    question: 'मैं recruitment partner / vendor कैसे ढूँढूँ?',
    answer:
      '/vendors (public directory) पर जाएँ और specialisation, location, industry, team size और verification status से filter करें। पूर्ण profile + पिछली placements के लिए किसी भी vendor पर click करें। role विवरण साझा करने के लिए "Send hiring requirement" का उपयोग करें — vendor को यह उनके lead inbox में दिखाई देता है और आम तौर पर 24 घंटों के भीतर आपसे संपर्क करते हैं। requirement साझा करना मुफ़्त है; आप केवल तब pay करते हैं जब vendor के साथ सीधे contract sign करते हैं (कोई platform fee नहीं)।',
  },
  'employer-multi-location': {
    question: 'क्या मैं multiple locations में जॉब पोस्ट कर सकता हूँ?',
    answer:
      'हाँ, केवल paid plans पर — Free plan प्रति जॉब 1 location पर capped है। Standard, Premium और CV Enterprise एक ही listing पर अतिरिक्त locations की अनुमति देते हैं (कोई per-location cap नहीं), तो बेंगलुरु, मुंबई और पुणे में offices वाला single role 3 अलग posts की आवश्यकता के बिना तीनों शहर searches में दिखाई देता है। Location-specific applicants flagged हैं तो आप जानते हैं कि वे किस office के लिए apply कर रहे हैं। post-job form पर "Job locations" के तहत additional locations जोड़ें।',
  },
  'vendor-onboarding': {
    question: 'Vendor onboarding प्रक्रिया कैसी दिखती है?',
    answer:
      'नियोक्ता (employer) के रूप में अपनी company name + GST + PAN के साथ register करें → employer dashboard से Vendor Connect plan subscribe करें → vendor profile पूरा करें (specialisations, service locations, industries, team size, sample placements) → verification के लिए submit करें → Vendor Connect plan एक बार आप approved होने पर charging शुरू करता है (आम तौर पर 1-2 कार्यदिवस)। Approval के बाद, आप public directory में दिखाई देते हैं और routed leads मिलना शुरू होते हैं। Subscription cancel किए बिना आप dashboard से कभी भी अपनी listing pause कर सकते हैं।',
  },
  'vendor-multiple-clients': {
    question: 'क्या मैं multiple client companies की सेवा कर सकता हूँ?',
    answer:
      'हाँ — Vendor Connect कोई exclusivity restrictions नहीं रखता। (अनुमति के साथ) अपने public profile में जितनी चाहें client companies सूचीबद्ध करें; जितना अधिक showcase कर सकते हैं, directory searches में आपका trust signal उतना अधिक है। हम जो leads आपको route करते हैं वे भी exclusive नहीं हैं — एक ही role के लिए कई vendors से contact किया जा सकता है, और कंपनी चुनती है कि किसके साथ engage करना है।',
  },
  'vendor-share-candidates': {
    question: 'क्या मुझे अपने candidates के contact details Hire Adda के साथ साझा करना है?',
    answer:
      'नहीं — Vendor Connect lead-gen + listing service है, candidate-data marketplace नहीं। आपका candidate database आपका रहता है। एक बार जब कोई कंपनी आपको lead भेजती है, तो आप उन्हें off-platform (ईमेल, फ़ोन, अपने CRM) से contact करते हैं और अपने pool से candidates place करते हैं। Hire Adda हमारे माध्यम से किए गए सफल hires से placement fee या commission नहीं लेता।',
  },
  'vendor-rating': {
    question: 'क्या vendors को clients द्वारा rated किया जाता है?',
    answer:
      'हाँ — एक lead के समाप्त होने के बाद (hire सफल, role रद्द, या 90 दिन बीत गए), कंपनी निजी 1-5 rating + वैकल्पिक लिखित feedback छोड़ सकती है। आपकी average rating + total reviews 5+ ratings होने के बाद आपके public profile पर दिखाई देती हैं (noisy single-review averages से बचने के लिए)। 3-स्टार से नीचे की ratings आपको एक निजी स्पष्टीकरण देती हैं; आप support के माध्यम से तथ्यात्मक रूप से गलत reviews पर dispute कर सकते हैं।',
  },
  'billing-promo-coupon': {
    question: 'मैं promo / coupon code कैसे apply करूँ?',
    answer:
      'Checkout पेज पर, "Have a coupon code?" क्लिक करें और code दर्ज करें। हम इसे plan और आपके account के विरुद्ध validate करते हैं (कुछ codes केवल पहली-बार या audience-specific हैं) और payment से पहले discounted total दिखाते हैं। Referrals या partner offers से codes उनके link पर click करते समय auto-apply होते हैं। आप coupon को carry-forward credits के साथ stack कर सकते हैं लेकिन दूसरे coupon के साथ नहीं।',
  },
  'billing-tax-invoice-download': {
    question: 'मैं tax invoice कैसे download करूँ?',
    answer:
      'Billing → Invoices खोलें → किसी भी invoice पर click करें → "Download PDF"। Invoices GST-compliant हैं, HSN code 998314 शामिल हैं, आपका billing address (और GSTIN यदि जोड़ा गया है), और आपके records के लिए एक unique invoice number। वही invoice payment के समय auto-emailed भी होता है। PDFs digitally signed हैं तो वे tamper-evident हैं और accounting के प्रमाण के रूप में स्वीकार्य हैं।',
  },
  'billing-payment-history': {
    question: 'मैं अपना payment इतिहास कहाँ देख सकता हूँ?',
    answer:
      'Billing → Orders timestamp, amount, plan, payment method और invoice + ledger entry के link के साथ हर transaction (paid / failed / refunded) दिखाता है। आप status, date range, या plan द्वारा filter कर सकते हैं। Refunds अलग negative-amount entries के रूप में दिखाई देते हैं जो मूल order से वापस linked हैं। Accounting reconciliation के लिए उसी पेज से पूरा इतिहास CSV में export करें।',
  },
  'billing-receipt-vs-invoice': {
    question: 'Receipt और tax invoice में क्या अंतर है?',
    answer:
      'Receipt पुष्टि करता है कि payment प्राप्त हो गया (Razorpay द्वारा सफलता पर तुरंत जारी)। Tax invoice tax उद्देश्यों के लिए बिक्री दिखाने वाला GST-compliant document है — input tax credit claims और accounting के लिए आवश्यक। Hire Adda हर paid order के लिए दोनों generate करता है: receipt Razorpay confirmation ईमेल में है, tax invoice server-side जनरेट होता है और कुछ ही मिनटों में emailed होता है + हमेशा Billing → Invoices में उपलब्ध।',
  },
  'billing-checkout-time': {
    question: 'Checkout कभी-कभी इतना समय क्यों लेता है?',
    answer:
      'Checkout एक Razorpay order बनाता है, आपके account history के विरुद्ध fraud check चलाता है (नए accounts अतिरिक्त scrutiny पाते हैं), और entitlement quota reserve करता है — आम तौर पर <2 सेकंड। यदि अधिक समय लगता है, तो bank या UPI app redirect पर slow हो सकता है। यदि checkout >30 सेकंड के लिए stuck है, page refresh करें (आपका order preserved है) और Billing → Orders से "Resume payment" क्लिक करें। बार-बार failures एक bank flag का संकेत दे सकती हैं — एक अलग payment method आज़माएँ या अपने bank से contact करें।',
  },
};

export const FAQS_HI: FaqEntry[] = FAQS_EN.map((entry) => {
  const t = HI_TRANSLATIONS[entry.id];
  return t ? { ...entry, question: t.question, answer: t.answer } : entry; // Fall back to English if a translation is missing.
});
