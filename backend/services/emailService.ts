import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendOtpEmail = async (to: string, otp: string, type: 'registration' | 'login') => {
  const subject = type === 'registration' ? 'Verify your email' : 'Your login OTP';
  const text = `Your OTP code is: ${otp}. It will expire in 10 minutes.`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px; margin: auto;">
      <h2 style="color: #4F46E5;">KanvaPro</h2>
      <p>Hello,</p>
      <p>Your OTP code for <strong>${type === 'registration' ? 'registration' : 'login'}</strong> is:</p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #111; margin: 20px 0;">${otp}</div>
      <p>This code will expire in 10 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"KanvaPro" <noreply@kanvapro.com>',
    to,
    subject,
    text,
    html,
  });
};
