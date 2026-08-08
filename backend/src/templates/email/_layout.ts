// ============================================================
// Shared Email Layout & Design System
// Enterprise-grade, email-client-compatible HTML email templates
// ============================================================

const BRAND = {
  name: 'Hire Adda',
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  secondary: '#F5880A',
  secondaryDark: '#D97706',
  accent: '#0EA5E9',
  accentDark: '#0284C7',
  success: '#059669',
  successLight: '#ecfdf5',
  warning: '#F5880A',
  warningLight: '#fff7ed',
  error: '#DC2626',
  errorLight: '#fef2f2',
  text: '#1f2937',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  bgPage: '#f3f4f6',
  bgCard: '#ffffff',
  bgMuted: '#f9fafb',
  url: process.env.FRONTEND_URL || 'https://hireadda.in',
  get logoUrl() {
    return `${this.url}/icons/logo.png`;
  },
  supportEmail: 'support@hireadda.in',
  year: new Date().getFullYear(),
};

// ---- Core Layout ----

export const emailLayout = (content: string, preheader?: string): string => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${BRAND.name}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <style>table{border-collapse:collapse;}td,th{mso-line-height-rule:exactly;}</style>
  <![endif]-->
  <style>
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .email-content { padding: 24px 20px !important; }
      .stack-column { display: block !important; width: 100% !important; }
      .otp-code { font-size: 28px !important; letter-spacing: 6px !important; }
    }
    a { color: ${BRAND.primary}; }
    a:hover { color: ${BRAND.primaryDark}; }
  </style>
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:${BRAND.bgPage};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  ${preheader ? `<div style="display:none;font-size:1px;color:${BRAND.bgPage};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}${'&zwnj;&nbsp;'.repeat(30)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.bgPage};">
    <tr>
      <td align="center" valign="top" style="padding:48px 16px;">
        <!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <!-- Logo Header -->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="text-align:center;padding:0 0 32px 0;">
              <a href="${BRAND.url}" style="text-decoration:none;display:inline-block;">
                <img src="${BRAND.logoUrl}" alt="${BRAND.name}" width="180" height="52" style="display:block;border:0;outline:none;height:auto;max-width:180px;" />
              </a>
            </td>
          </tr>
        </table>
        <!-- Content Card -->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${BRAND.bgCard};border-radius:16px;overflow:hidden;border:1px solid ${BRAND.border};">
          <tr>
            <td class="email-content" style="padding:44px 48px 36px 48px;">
              ${content}
            </td>
          </tr>
        </table>
        <!-- Footer -->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:28px 48px;text-align:center;">
              <p style="margin:0 0 12px 0;font-size:13px;line-height:1.5;color:${BRAND.textMuted};">
                &copy; ${BRAND.year} ${BRAND.name}. All rights reserved.
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.textMuted};">
                <a href="${BRAND.url}/help" style="color:${BRAND.textSecondary};text-decoration:underline;">Help Center</a>
                &nbsp;&middot;&nbsp;
                <a href="${BRAND.url}/privacy" style="color:${BRAND.textSecondary};text-decoration:underline;">Privacy Policy</a>
                &nbsp;&middot;&nbsp;
                <a href="${BRAND.url}/terms" style="color:${BRAND.textSecondary};text-decoration:underline;">Terms of Service</a>
              </p>
              <p style="margin:12px 0 0 0;font-size:12px;line-height:1.5;color:${BRAND.textMuted};">
                Need help? Contact us at <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.textSecondary};text-decoration:underline;">${BRAND.supportEmail}</a>
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

// ---- Reusable Components ----

export const heading = (text: string): string =>
  `<h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:${BRAND.text};line-height:1.35;">${text}</h1>`;

export const subheading = (text: string): string =>
  `<h2 style="margin:0 0 6px 0;font-size:18px;font-weight:600;color:${BRAND.text};line-height:1.4;">${text}</h2>`;

export const subtitle = (text: string): string =>
  `<p style="margin:0 0 28px 0;font-size:15px;color:${BRAND.textSecondary};line-height:1.6;">${text}</p>`;

export const paragraph = (text: string): string =>
  `<p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.7;">${text}</p>`;

export const greeting = (name: string): string =>
  `<p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>${name}</strong>,</p>`;

export const signature = (): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding-top:28px;">
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">
        Best regards,<br>
        <strong style="color:${BRAND.text};">The Hire Adda Team</strong>
      </p>
    </td>
  </tr>
</table>`;

export const button = (text: string, href: string, color: string = BRAND.primary): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:28px 0 12px 0;">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="17%" fillcolor="${color}"><center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">${text}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-->
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 36px;background-color:${color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;line-height:1.2;text-align:center;mso-hide:all;">
        ${text}
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;

export const buttonRow = (
  buttons: Array<{ text: string; href: string; color?: string; variant?: 'solid' | 'outline' }>
): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:28px 0 12px 0;">
      ${buttons
        .map((b) => {
          if (b.variant === 'outline') {
            return `<a href="${b.href}" target="_blank" style="display:inline-block;padding:12px 28px;background-color:transparent;color:${b.color || BRAND.primary};font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;border:2px solid ${b.color || BRAND.primary};line-height:1.2;text-align:center;margin:0 6px;">${b.text}</a>`;
          }
          return `<a href="${b.href}" target="_blank" style="display:inline-block;padding:14px 28px;background-color:${b.color || BRAND.primary};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;line-height:1.2;text-align:center;margin:0 6px;">${b.text}</a>`;
        })
        .join('\n      ')}
    </td>
  </tr>
</table>`;

export const otpBlock = (otp: string): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:28px 0;">
      <div style="display:inline-block;padding:20px 48px;background-color:${BRAND.bgMuted};border-radius:12px;border:2px dashed ${BRAND.border};">
        <span class="otp-code" style="font-size:36px;font-weight:700;letter-spacing:10px;color:${BRAND.text};font-family:'Courier New',Courier,monospace;">${otp}</span>
      </div>
    </td>
  </tr>
</table>`;

export const divider = (): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td style="padding:20px 0;">
      <div style="height:1px;background-color:${BRAND.border};font-size:1px;line-height:1px;">&nbsp;</div>
    </td>
  </tr>
</table>`;

export const infoBox = (items: Array<{ label: string; value: string }>): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border-radius:10px;border:1px solid ${BRAND.border};overflow:hidden;">
  ${items
    .map(
      (item, i) => `<tr>
    <td style="padding:14px 20px;${i < items.length - 1 ? `border-bottom:1px solid ${BRAND.border};` : ''}background-color:${BRAND.bgMuted};">
      <span style="display:block;font-size:12px;font-weight:500;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${item.label}</span>
      <span style="display:block;font-size:15px;font-weight:600;color:${BRAND.text};">${item.value}</span>
    </td>
  </tr>`
    )
    .join('\n  ')}
</table>`;

export const successBox = (text: string): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td style="padding:16px 20px;background-color:${BRAND.successLight};border-radius:10px;border-left:4px solid ${BRAND.success};">
      <p style="margin:0;font-size:14px;color:#065f46;line-height:1.6;">${text}</p>
    </td>
  </tr>
</table>`;

export const warningBox = (text: string): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td style="padding:16px 20px;background-color:${BRAND.warningLight};border-radius:10px;border-left:4px solid ${BRAND.warning};">
      <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6;">${text}</p>
    </td>
  </tr>
</table>`;

export const dangerBox = (text: string): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td style="padding:16px 20px;background-color:${BRAND.errorLight};border-radius:10px;border-left:4px solid ${BRAND.error};">
      <p style="margin:0;font-size:14px;color:#991b1b;line-height:1.6;">${text}</p>
    </td>
  </tr>
</table>`;

export const iconCircle = (emoji: string, bgColor: string): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:0 0 20px 0;">
      <div style="display:inline-block;width:64px;height:64px;line-height:64px;text-align:center;background-color:${bgColor};border-radius:50%;font-size:28px;">${emoji}</div>
    </td>
  </tr>
</table>`;

export const badge = (text: string, color: string, bgColor: string): string =>
  `<span style="display:inline-block;padding:4px 12px;background-color:${bgColor};color:${color};font-size:12px;font-weight:600;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">${text}</span>`;

export const smallText = (text: string): string =>
  `<p style="margin:0;font-size:13px;color:${BRAND.textMuted};line-height:1.6;">${text}</p>`;

export const linkText = (text: string, href: string): string =>
  `<a href="${href}" style="color:${BRAND.primary};font-weight:500;text-decoration:underline;">${text}</a>`;

export { BRAND };
