export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface SmsTemplate {
  text: string;
}

export interface WhatsappTemplate {
  templateName: string;
  languageCode: string; // e.g., 'en'
  components?: any[]; // WhatsApp specific component structure
  text?: string; // Fallback or direct message
}
