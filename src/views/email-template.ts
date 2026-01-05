import { IChannelPartner } from "../partner/partner.types";
import { readFileSync } from "fs";
import path from "path";
// <div class="company-info">
//   CyberDemia is an online learning platform dedicated to helping students master cybersecurity skills through comprehensive courses, exams, and certifications, all curated and taught by industry experts.
// </div>
// Function to convert the logo to base64
const getLogoBase64 = () => {
  try {
    const logoPath = path.join(__dirname, "../asset/logo.png");
    const logoBuffer = readFileSync(logoPath);
    return `data:image/png;base64,${logoBuffer.toString("base64")}`;
  } catch (error) {
    console.error("Error reading logo:", error);
    // Fallback to a CDN URL if file reading fails
    return "https://cdn.skyid.ng/logo.png";
  }
};

export const emailWrapper = (content: string) => {
  const logoBase64 = getLogoBase64();

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; }
        .logo-section { 
          background-color: #FFF1F1; 
          padding: 30px 20px; 
          text-align: center; 
        }
        .logo { 
          height: 40px;
          width: auto;
        }
        .content { 
          background: white; 
          padding: 40px 20px;
          line-height: 1.6;
          color: #333;
        }
        .content h2 { 
          font-size: 24px;
          margin-bottom: 20px;
          color: #000;
        }
        .verification-code {
          font-size: 24px;
          margin: 20px 0;
          font-weight: bold;
          color: #000;
          text-align: center;
        }
        .footer { 
          background-color: #DC3545; 
          color: white; 
          padding: 30px 20px; 
        }
        .social-links { 
          margin-bottom: 20px;
          text-align: center;
        }
        .social-links a { 
          color: white; 
          margin: 0 15px;
          text-decoration: none;
          font-size: 16px;
          display: inline-block;
        }
        .company-info { 
          font-size: 14px;
          line-height: 1.6;
          text-align: center;
          margin: 20px 0;
          padding: 0 20px;
        }
        .visit-website { 
          color: white;
          text-decoration: underline;
          margin: 15px 0;
          display: block;
          text-align: center;
        }
        .copyright { 
          text-align: center;
          font-size: 12px;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-section">
          <img src="${logoBase64}" alt="SkyID" class="logo" />
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <div class="social-links">
            <a href="https://twitter.com/skyid" target="_blank">𝕏</a>
            <a href="https://instagram.com/skyid" target="_blank">Instagram</a>
            <a href="https://linkedin.com/company/skyid" target="_blank">LinkedIn</a>
            <a href="https://facebook.com/skyid" target="_blank">Facebook</a>
          </div>
          
          <a href="https://skyid.ng" class="visit-website">SKYID.NG</a>
          <div class="copyright">© 2024 SKY ID</div>
        </div>
      </div>
    </body>
  </html>
  `;
};

export const registration = (name: string, otp: string) => {
  const content = `
    <h2>Welcome to SKYID – We're Excited to Have You Onboard!</h2>
    <p>Dear ${name},</p>
    <p>Welcome to SKYID! We're thrilled to have you as part of the SKYID family.</p>
    <p>To complete your registration, please verify your email address by entering the code below:</p>
    <div class="verification-code">${otp}</div>
    <p>Our team is here to support you every step of the way. If you have any questions or need assistance, don't hesitate to reach out to our dedicated support team at support@skyid.ng or Call 07003100000.</p>
    <p>Additionally, your assigned Sales Executive will be in touch shortly to ensure you get the most out of your SKYID experience and provide any further assistance you may need.</p>
    <p>Thank you for choosing SKYID. We look forward to helping you achieve your goals!</p>
    <p>Best regards,<br/>The SKYID Team<br/>skyid.ng, @skyid_ng</p>
  `;
  return emailWrapper(content);
};

export const channelPartner = (name: string, partnerDetails: IChannelPartner) => {
  const content = `
    <h2>Channel Partner Registration</h2>
    <p>Hi ${name},</p>
    <p>Thank you for your interest in becoming a SKY ID channel partner. We have received your application with the following details:</p>
    <ul>
      <li><strong>Company Name:</strong> ${partnerDetails.businessName}</li>
      <li><strong>Region:</strong> ${partnerDetails.region}</li>
      <li><strong>Email Address:</strong> ${partnerDetails.email}</li>
      <li><strong>Phone Number:</strong> ${partnerDetails.phoneNumber}</li>
      <li><strong>Account Type:</strong> ${partnerDetails.accountType}</li>
    </ul>
    <p>Our team will review your application and get back to you shortly.</p>
    <p>Best regards,<br/>SKY ID Team</p>
  `;
  return emailWrapper(content);
};

export const vsoRegistration = (businessName: string, name: string, password: string) => {
  const content = `
    <h2>Welcome to SKY ID</h2>
    <p>Hi ${name},</p>
    <p>Your VSO account for ${businessName} has been successfully created. You can now log in using your email address and the following temporary password:</p>
    <h3 style="font-size: 24px; margin: 20px 0;">${password}</h3>
    <p>Please change your password after your first login for security purposes.</p>
     <p>
      You can access your account here: 
      <a href="https://skyid.ng" style="color: #DC3545; text-decoration: underline;">skyid.ng</a>
    </p>
    <p>Best regards,<br/>SKY ID Team</p>
  `;
  return emailWrapper(content);
};

export const forgotPasswordTemplate = (name: string, otp: string) => {
  const content = `
    <h2>Password Reset Code</h2>
    <p>Hi ${name},</p>
    <p>We received a request to reset your password. Please use the verification code below to proceed:</p>
    <h3 style="font-size: 24px; margin: 20px 0;">${otp}</h3>
    <p>This code will expire in 10 minutes. If you didn't request this reset, please ignore this email or contact our support team at support@skyid.ng</p>
    <p>Best regards,<br/>SKY ID Team</p>
  `;
  return emailWrapper(content);
};

export const resetPasswordTemplate = (name: string) => {
  const content = `
    <h2>Password Reset Successful</h2>
    <p>Hi ${name},</p>
    <p>Your password has been successfully reset. You can now log in to your account using your new password.</p>
    <p>If you did not make this change, please contact our support team immediately at support@skyid.ng</p>
    <p>Best regards,<br/>SKY ID Team</p>
  `;
  return emailWrapper(content);
};

export const verifyEmailTemplate = (name: string, otp: string) => {
  const content = `
    <h2>Email Verification Code</h2>
    <p>Hi ${name},</p>
    <p>Please use the verification code below to verify your email address:</p>
    <h3 style="font-size: 24px; margin: 20px 0;">${otp}</h3>
    <p>This code will expire in 10 minutes. If you didn't request this verification, please ignore this email.</p>
    <p>Best regards,<br/>SKY ID Team</p>
  `;
  return emailWrapper(content);
};

export const kycHTML = (name: string) => {
  const content = `
    <h2>KYC Verification Complete</h2>
    <p>Hi ${name},</p>
    <p>Congratulations! Your KYC verification has been successfully completed. You now have full access to all SKY ID services and features.</p>
    <p>If you have any questions, please don't hesitate to contact our support team.</p>
    <p>Best regards,<br/>SKY ID Team</p>
  `;
  return emailWrapper(content);
};

export const depositMoneyTemplate = (name: string, amount: string) => {
  const content = `
    <h2>Deposit Confirmation</h2>
    <p>Hi ${name},</p>
    <p>Your deposit of ${amount} has been successfully processed and credited to your wallet.</p>
    <p>If you have any questions about this transaction, please contact our support team.</p>
    <p>Best regards,<br/>SKY ID Team</p>
  `;
  return emailWrapper(content);
};

export const channelPartnerApproved = (name: string, link: string) => {
  const content = `
    <h2>Channel Partner Application Approved</h2>
    <p>Hi ${name},</p>
    <p>Congratulations! Your application to become a SKY ID channel partner has been approved.</p>
    <p>Please <a href="${link}" style="color: #DC3545;">click here</a> to complete your account setup.</p>
    <p>If you have any questions, please don't hesitate to contact our support team.</p>
    <p>Best regards,<br/>SKY ID Team</p>
  `;
  return emailWrapper(content);
};

export const channelPartnerCreation = (name: string, password: string) => {
  const content = `
    <h2>Welcome to SKY ID</h2>
    <p>Hi ${name},</p>
    <p>Your Channel Partner account has been successfully created. You can now log in using your email address and the following temporary password:</p>
    <h3 style="font-size: 24px; margin: 20px 0;">${password}</h3>
    <p>Please change your password after your first login for security purposes.</p>
     <p>
      You can access your account here: 
      <a href="https://skyid.ng" style="color: #DC3545; text-decoration: underline;">skyid.ng</a>
    </p>
    <p>Best regards,<br/>SKY ID Team</p>
  `;
  return emailWrapper(content);
};

export const publicSignupCredentials = (businessName: string, password: string, skyId: string) => {
  const content = `
    <h2>Welcome to SKY ID - Your Account is Ready!</h2>
    <p>Hi ${businessName},</p>
    <p>Congratulations! Your SKY ID account has been successfully created and your number purchase is being processed.</p>
    <p><strong>Your Sky ID:</strong> ${skyId}</p>
    <p>You can now log in to your account using your email address and the following password:</p>
    <div style="background-color: #f9fafb; border: 2px solid #DC3545; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;">Your Password:</p>
      <h3 style="font-size: 24px; margin: 10px 0; color: #111827; font-family: monospace; letter-spacing: 2px;">${password}</h3>
    </div>
    <p><strong>Important:</strong> Please save this password securely. We recommend changing it after your first login for security purposes.</p>
    <p>
      You can access your account here: 
      <a href="https://skyid.ng/login" style="color: #DC3545; text-decoration: underline; font-weight: bold;">Login to SkyID</a>
    </p>
    <p>Once your payment is confirmed, your number will be activated and ready to use.</p>
    <p>If you have any questions, please don't hesitate to contact our support team.</p>
    <p>Best regards,<br/>SKY ID Team</p>
  `;
  return emailWrapper(content);
};
