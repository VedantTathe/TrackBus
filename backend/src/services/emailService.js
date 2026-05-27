import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 587);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || `"TrackBus Transit" <${EMAIL_USER}>`;

let transporter = null;

// Initialize Transporter if credentials are configured
if (EMAIL_USER && EMAIL_PASS) {
  try {
    transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      secure: EMAIL_PORT === 465, // True for 465, false for 587/others
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });
    console.log('📧 ====================================================');
    console.log('📧 SMTP Email Transporter Successfully Initialized!');
    console.log(`📧 User: ${EMAIL_USER} via ${EMAIL_HOST}:${EMAIL_PORT}`);
    console.log('📧 ====================================================');
  } catch (err) {
    console.error('❌ Failed to construct SMTP nodemailer transporter:', err.message);
  }
} else {
  console.log('📧 ====================================================');
  console.log('⚠️  SMTP Email credentials unconfigured or missing in .env');
  console.log('⚠️  Engaging fallback stdout console logging mode.');
  console.log('📧 ====================================================');
}

/**
 * Sends a generic HTML & text email with resilient console fallback.
 * @param {string} to recipient email address
 * @param {string} subject email subject header
 * @param {string} text plain text body
 * @param {string} html html formatted body
 */
export const sendEmail = async ({ to, subject, text, html }) => {
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: EMAIL_FROM,
        to,
        subject,
        text,
        html,
      });
      console.log(`📧 Email delivered successfully. To: ${to}. Message ID: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error('❌ SMTP delivery failed, falling back to console:', error.message);
    }
  }

  // Print email mock directly to console for quick developer verification
  console.log('\n📧 ============= [CONSOLE EMAIL FALLBACK] =============');
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`📨 To:        ${to}`);
  console.log(`📌 Subject:   ${subject}`);
  console.log('📝 --- Plain Body ---');
  console.log(text);
  console.log('🌐 --- HTML Body ---');
  console.log(html);
  console.log('========================================================\n');
  return { isMockLog: true, timestamp: new Date() };
};

/**
 * Sends a pre-formatted verification OTP code.
 * @param {string} email recipient address
 * @param {string} otp 4-6 digit numeric OTP
 */
export const sendOTPEmail = async (email, otp) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📧 [DEV] OTP email -> ${email} | OTP: ${otp}`);
  }
  const subject = `${otp} is your TrackBus Verification Code`;
  const text = `Greetings!\n\nYour TrackBus verification code is: ${otp}\nThis code is valid for 10 minutes. Please do not share it with anyone.`;
  const html = `
    <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f1f5f9; border-radius: 16px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="font-weight: 900; color: #dc2626; margin: 0; font-size: 24px; letter-spacing: -0.5px;">TrackBus</h2>
        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 1.5px;">Smart Transit Verification</span>
      </div>
      
      <p style="font-size: 14px; line-height: 1.6; color: #334155; font-weight: 500;">
        Hello,
      </p>
      
      <p style="font-size: 14px; line-height: 1.6; color: #334155; font-weight: 500;">
        You are verifying your account details on the TrackBus public transport analytics platform. Use the single-use verification code below:
      </p>
      
      <div style="text-align: center; margin: 32px 0; background-color: #fcf6f5; border: 1.5px dashed #f5d0c5; border-radius: 12px; padding: 16px;">
        <span style="font-family: 'Outfit', Helvetica, Arial, sans-serif; font-size: 32px; font-weight: 950; letter-spacing: 6px; color: #dc2626;">${otp}</span>
      </div>
      
      <p style="font-size: 12px; line-height: 1.5; color: #64748b; font-weight: 600;">
        * Note: This code is valid for 10 minutes. If you did not initiate this request, please disregard this email.
      </p>
      
      <div style="border-t: 1px solid #f1f5f9; margin-top: 32px; padding-top: 16px; text-align: center; font-size: 10px; color: #94a3b8; font-weight: 700;">
        © 2026 TrackBus Transit Inc. • Seattle & Pune Flow Networks
      </div>
    </div>
  `;

  return await sendEmail({ to: email, subject, text, html });
};

/**
 * Sends a driver approval confirmation email.
 * @param {string} email recipient address
 * @param {string} driverName approved driver name
 */
export const sendDriverApprovedEmail = async (email, driverName = 'Driver') => {
  const subject = 'TrackBus Driver Verification Approved';
  const text = `Hello ${driverName},\n\nYour driver profile has been successfully verified by the TrackBus admin team. You can now log in and start your trips.\n\nRegards,\nTrackBus Team`;
  const html = `
    <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f1f5f9; border-radius: 16px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="font-weight: 900; color: #16a34a; margin: 0; font-size: 24px;">TrackBus</h2>
        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 1.5px;">Driver Verification</span>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">Hello ${driverName},</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Your driver profile has been <strong>successfully verified</strong> by the admin.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        You can now log in to TrackBus and start your trip operations.
      </p>
    </div>
  `;

  return await sendEmail({ to: email, subject, text, html });
};

/**
 * Sends an admin notification when a new driver registers and needs approval.
 * @param {string} adminEmail admin recipient address (from ADMIN_EMAIL env var)
 * @param {object} driver { name, employeeId, phone }
 */
export const sendDriverPendingApprovalEmail = async (adminEmail, driver = {}) => {
  const driverName = driver.name || 'Unknown Driver';
  const driverEmail = driver.employeeId || 'N/A';
  const driverPhone = driver.phone || 'N/A';

  const subject = `[TrackBus] New Driver Registration — Approval Required`;
  const text = `Hello Admin,\n\nA new MSRTC driver has registered on TrackBus and is awaiting your approval.\n\nDriver Details:\n  Name:   ${driverName}\n  Email:  ${driverEmail}\n  Phone:  ${driverPhone}\n\nPlease log in to the admin panel to review and approve this account.\n\nRegards,\nTrackBus System`;

  const html = `
    <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f1f5f9; border-radius: 16px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="font-weight: 900; color: #dc2626; margin: 0; font-size: 24px; letter-spacing: -0.5px;">TrackBus</h2>
        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; letter-spacing: 1.5px;">Admin — Driver Approval Request</span>
      </div>

      <div style="background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 12px; padding: 16px 18px; margin-bottom: 20px;">
        <p style="margin: 0 0 4px; font-size: 13px; font-weight: 800; color: #991b1b;">⏳ Action Required: New Driver Pending Approval</p>
        <p style="margin: 0; font-size: 13px; color: #7f1d1d;">A new driver account is waiting for your review.</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 700; width: 100px; color: #64748b;">Name</td>
          <td style="padding: 10px 0; font-weight: 800; color: #0f172a;">${driverName}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 700; color: #64748b;">Email</td>
          <td style="padding: 10px 0; font-weight: 800; color: #0f172a;">${driverEmail}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-weight: 700; color: #64748b;">Phone</td>
          <td style="padding: 10px 0; font-weight: 800; color: #0f172a;">${driverPhone}</td>
        </tr>
      </table>

      <p style="font-size: 13px; color: #334155; margin-top: 20px; line-height: 1.6;">
        Log in to the <strong>TrackBus Admin Panel</strong> and approve this driver so they can start broadcasting live trips.
      </p>

      <div style="border-t: 1px solid #f1f5f9; margin-top: 28px; padding-top: 14px; text-align: center; font-size: 10px; color: #94a3b8; font-weight: 700;">
        © 2026 TrackBus Transit • Automated System Notification
      </div>
    </div>
  `;

  return await sendEmail({ to: adminEmail, subject, text, html });
};
