interface EmailTemplate {
  subject: string;
  html: string;
}

/**
 * Email template for new device login alerts.
 */
export const newDeviceLoginEmail = (
  name: string,
  deviceName: string,
  location: string,
  time: string
): EmailTemplate => {
  const logoUrl = `${process.env.FRONTEND_URL || 'https://hireadda.in'}/icons/logo.png`;
  return {
    subject: 'New Device Login Detected - Hire Adda',
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <a href="${process.env.FRONTEND_URL || 'https://hireadda.in'}" style="display:inline-block;text-decoration:none;margin-bottom:16px;">
              <img src="${logoUrl}" alt="Hire Adda" width="150" height="43" style="display:block;border:0;height:auto;max-width:150px;" />
            </a>
            <h2 style="color: #333;">New Device Login</h2>
            <p>Hi ${name},</p>
            <p>We noticed a login to your account from a new device:</p>
            <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Device</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${deviceName}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Location</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${location}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Time</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${time}</td>
                </tr>
            </table>
            <p>If this was you, no action is needed.</p>
            <p style="color: #DC2626;"><strong>If you don't recognize this login, please change your password immediately and enable MFA.</strong></p>
            <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
            <p style="color: #999; font-size: 12px;">Hire Adda Security Team</p>
        </div>
    `,
  };
};
