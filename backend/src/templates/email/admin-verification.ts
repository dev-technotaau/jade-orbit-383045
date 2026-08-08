/**
 * Email template for admin notification when new verification request is submitted
 */
export function verificationRequestReceivedEmailTemplate(
  verificationType: string,
  userName: string,
  userRole: string,
  companyInfo: string
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';
  const logoUrl = `${appUrl}/icons/logo.png`;

  return {
    subject: `New ${verificationType} Verification Request - Action Required`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #2563EB 0%, #0EA5E9 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h2 { margin: 0; font-size: 24px; font-weight: 600; }
        .header p { margin: 5px 0 0; font-size: 14px; opacity: 0.9; }
        .content { padding: 30px 20px; }
        .info-box { background: #F3F4F6; padding: 20px; margin: 20px 0; border-left: 4px solid #2563EB; border-radius: 6px; }
        .info-box p { margin: 8px 0; }
        .info-box strong { color: #1F2937; }
        .button { display: inline-block; background: #2563EB; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; transition: background 0.3s; }
        .button:hover { background: #1D4ED8; }
        .alert { background: #fff7ed; border-left: 4px solid #F5880A; padding: 15px; margin: 20px 0; border-radius: 6px; }
        .alert p { margin: 0; color: #92400E; font-size: 14px; }
        .footer { background: #F9FAFB; padding: 20px; text-align: center; color: #6B7280; font-size: 12px; border-top: 1px solid #E5E7EB; }
        .footer p { margin: 5px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${logoUrl}" alt="Hire Adda" width="150" height="43" style="display:block;margin:0 auto 12px;border:0;height:auto;max-width:150px;" />
            <h2>🔔 New Verification Request</h2>
            <p>Admin Action Required</p>
        </div>
        <div class="content">
            <p>Hello Admin,</p>
            <p>A new <strong>${verificationType}</strong> verification request has been submitted and requires your review.</p>

            <div class="info-box">
                <p><strong>User:</strong> ${userName} (${userRole})</p>
                ${companyInfo ? `<p><strong>Company:</strong> ${companyInfo.replace(' from ', '')}</p>` : ''}
                <p><strong>Verification Type:</strong> ${verificationType}</p>
                <p><strong>Status:</strong> <span style="color:#F5880A;font-weight:600;">Pending Review</span></p>
                <p><strong>Submitted:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            </div>

            <p>Please review this request at your earliest convenience to ensure timely processing and maintain SLA compliance.</p>

            <center>
                <a href="${appUrl}/admin/verifications" class="button">Review Verification Request</a>
            </center>

            <div class="alert">
                <p>⚡ <strong>Action Required:</strong> Please review within 24 hours to meet SLA requirements.</p>
            </div>
        </div>
        <div class="footer">
            <p><strong>Hire Adda</strong> - Admin Notifications</p>
            <p>This is an automated notification. Do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
        `.trim(),
    text: `
New ${verificationType} Verification Request - Action Required

A new verification request has been submitted and requires admin review.

User: ${userName} (${userRole})
${companyInfo ? `Company: ${companyInfo.replace(' from ', '')}\n` : ''}Verification Type: ${verificationType}
Status: Pending Review
Submitted: ${new Date().toLocaleString()}

Please review this request at your earliest convenience to ensure timely processing.

Review at: ${appUrl}/admin/verifications

⚡ Action Required: Please review within 24 hours to meet SLA requirements.

---
Hire Adda - Admin Notifications
This is an automated notification. Do not reply to this email.
        `.trim(),
  };
}
