import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const APP_NAME = process.env.APP_NAME || "FinWise";

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Gửi email
const sendEmail = async (mailOptions) => {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return info;
  } catch (error) {
    console.error("Email sending error:", error);
    throw error;
  }
};

// Template email xác thực (branding Personal Finance)
const verificationEmailTemplate = (name, verificationLink) => {
  return {
    subject: `Xác thực tài khoản ${APP_NAME}`,
    html: `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Xác thực tài khoản ${APP_NAME}</title>
        <style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');</style>
      </head>
      <body style="margin:0;padding:0;font-family:'Inter',Arial,sans-serif;background:#f8fafc;line-height:1.6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.05);overflow:hidden;">
              <tr>
                <td style="background:linear-gradient(135deg,#0ea5e9 0%,#22d3ee 100%);padding:40px 30px;text-align:center;">
                  <div style="font-size:54px;margin-bottom:12px;">💸</div>
                  <h1 style="color:#fff;font-size:26px;font-weight:700;margin:0 0 6px 0;">${APP_NAME}</h1>
                  <p style="color:rgba(255,255,255,.95);font-size:15px;margin:0;font-weight:500;">Trợ lý quản lý chi tiêu cá nhân thông minh</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 28px;">
                  <h2 style="color:#0f172a;font-size:22px;font-weight:600;margin:0 0 16px 0;text-align:center;">Chào ${name || "bạn"}! 👋</h2>
                  <p style="color:#334155;margin:0 0 16px 0;">Cảm ơn bạn đã đăng ký ${APP_NAME}. Nhấp nút dưới đây để xác thực tài khoản và bắt đầu theo dõi chi tiêu, đặt ngân sách, và nhận gợi ý tiết kiệm từ AI.</p>
                  <div style="text-align:center;margin:28px 0;">
                    <a href="${verificationLink}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;">Xác thực tài khoản</a>
                  </div>
                  <div style="background:#f1f5f9;padding:16px;border-radius:12px;border-left:4px solid #0ea5e9;color:#334155;font-size:14px;">
                    Liên kết sẽ hết hạn sau 24 giờ. Nếu bạn không yêu cầu, hãy bỏ qua email này.
                  </div>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc;padding:22px;text-align:center;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">© ${new Date().getFullYear()} ${APP_NAME}. Quản lý chi tiêu thông minh.</td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `,
  };
};

// Template email reset password (branding Personal Finance)
const resetPasswordEmailTemplate = (name, resetLink) => {
  return {
    subject: `Đặt lại mật khẩu ${APP_NAME}`,
    html: `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Đặt lại mật khẩu ${APP_NAME}</title>
        <style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');</style>
      </head>
      <body style="margin:0;padding:0;font-family:'Inter',Arial,sans-serif;background:#f8fafc;line-height:1.6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.05);overflow:hidden;">
              <tr>
                <td style="background:linear-gradient(135deg,#ef4444 0%,#f59e0b 100%);padding:40px 30px;text-align:center;">
                  <div style="font-size:54px;margin-bottom:12px;">🔐</div>
                  <h1 style="color:#fff;font-size:26px;font-weight:700;margin:0 0 6px 0;">${APP_NAME}</h1>
                  <p style="color:rgba(255,255,255,.95);font-size:15px;margin:0;font-weight:500;">Yêu cầu đặt lại mật khẩu</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 28px;">
                  <h2 style="color:#0f172a;font-size:22px;font-weight:600;margin:0 0 16px 0;text-align:center;">Chào ${name || "bạn"}! 👋</h2>
                  <p style="color:#334155;margin:0 0 16px 0;">Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản ${APP_NAME}. Nhấp nút bên dưới để tạo mật khẩu mới.</p>
                  <div style="text-align:center;margin:28px 0;">
                    <a href="${resetLink}" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;">Đặt lại mật khẩu</a>
                  </div>
                  <div style="background:#fff7ed;padding:16px;border-radius:12px;border-left:4px solid #fb923c;color:#9a3412;font-size:14px;">
                    Liên kết sẽ hết hạn sau 60 phút. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.
                  </div>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc;padding:22px;text-align:center;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">© ${new Date().getFullYear()} ${APP_NAME}. Bảo mật tài khoản của bạn.</td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `,
  };
};

export { sendEmail, verificationEmailTemplate, resetPasswordEmailTemplate };