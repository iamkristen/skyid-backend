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

export const adminAccountCreated = (name: string, email: string, password: string, loginUrl: string = "https://admin.dev.skyid.ng") => {
  const signInUrl = loginUrl.replace(/\/?$/, "");
  const content = `
    <h2>Your SkyID Admin Account Has Been Created</h2>
    <p>Hi ${name},</p>
    <p>An admin account has been created for you on the SkyID admin dashboard. Use the login details below to sign in.</p>
    <div style="background-color: #f9fafb; border: 2px solid #DC3545; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Login URL:</p>
      <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600;"><a href="${signInUrl}" style="color: #DC3545;">${signInUrl}</a></p>
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Email:</p>
      <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">${email}</p>
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Password:</p>
      <p style="margin: 0; font-size: 16px; font-family: monospace; letter-spacing: 1px;">${password}</p>
    </div>
    <p><strong>On your first login</strong> you will be required to set up two-factor authentication (2FA) using Google Authenticator or a similar app. This keeps your account secure.</p>
    <p>
      <a href="${signInUrl}" style="display: inline-block; background-color: #DC3545; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">Sign in to Admin Dashboard</a>
    </p>
    <p>Best regards,<br/>SKY ID Team</p>
  `;
  return emailWrapper(content);
};

export const adminLoginOtpTemplate = (name: string, otp: string) => {
  const content = `
    <h2>Your SkyID Admin login code</h2>
    <p>Hi ${name},</p>
    <p>Use the code below to complete your sign-in to the SkyID admin dashboard. This code expires in 15 minutes.</p>
    <div style="background-color: #f9fafb; border: 2px solid #DC3545; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #111827;">${otp}</p>
    </div>
    <p style="font-size: 14px; color: #6b7280;">If you did not try to sign in, please secure your account and contact support.</p>
    <p>Best regards,<br/>SkyID Team</p>
  `;
  return emailWrapper(content);
};

export const adminLoginSecurityAlert = (
  name: string,
  location: string,
  browser: string,
  loginTime: string
) => {
  const secureUrl = "https://admin.skyid.ng/signin";
  const content = `
    <h2>Security alert: new sign-in</h2>
    <p>Hi ${name},</p>
    <p>Someone just signed in to your SkyID admin account. If this was you, you can ignore this email.</p>
    <p style="margin: 20px 0 12px 0; font-weight: 600; color: #111827;">Was this you?</p>
    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 12px 0;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #374151;">
        <span style="display: inline-block; width: 20px; vertical-align: middle;">📍</span> ${location}
      </p>
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #374151;">
        <span style="display: inline-block; width: 20px; vertical-align: middle;">🌐</span> ${browser}
      </p>
      <p style="margin: 0; font-size: 14px; color: #374151;">
        <span style="display: inline-block; width: 20px; vertical-align: middle;">🕐</span> ${loginTime}
      </p>
    </div>
    <p style="margin: 20px 0 12px 0;">
      <a href="${secureUrl}" style="display: inline-block; background-color: #DC3545; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">This wasn't me</a>
    </p>
    <p style="margin: 16px 0 0 0; font-size: 14px; color: #6b7280;">If this was you, you can ignore this email.</p>
    <p style="margin: 24px 0 0 0;">Thanks,<br/><strong>SkyID Security</strong></p>
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

/** Short migration email for create-individual-mapping (old switch → new platform). */
export const individualMappingWelcome = (firstName: string, loginUrl: string, email: string, password: string, companyName: string = "SkyID") => {
  const content = `
    <h2>Your SkyID – login details</h2>
    <p>Hi ${firstName},</p>
    <p>We have migrated to a new platform. Kindly use the details below to sign in.</p>
    <div style="background-color: #f9fafb; border-left: 4px solid #DC3545; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; font-weight: bold; color: #111827;">Sign in:</p>
      <p style="margin: 5px 0;"><a href="${loginUrl}" style="color: #DC3545; text-decoration: underline;">${loginUrl}</a></p>
      <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
      <p style="margin: 5px 0;"><strong>Password:</strong> <span style="font-family: monospace; font-size: 18px; letter-spacing: 2px; color: #111827;">${password}</span></p>
    </div>
    <p>Please sign in and change your password when you first log in.</p>
    <p>Best regards,<br/>${companyName} Team</p>
  `;
  return emailWrapper(content);
};

export const individualSignupSuccess = (firstName: string, loginUrl: string, email: string, password: string, companyName: string = "SKY ID") => {
  const content = `
    <h2>Smart Number Purchase Successful</h2>
    <p>Hi ${firstName},</p>
    <p>Your Smart Number purchase was successful, and your account is ready.</p>
    <div style="background-color: #f9fafb; border-left: 4px solid #DC3545; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; font-weight: bold; color: #111827;">Login details:</p>
      <p style="margin: 5px 0;"><strong>Login URL:</strong> <a href="${loginUrl}" style="color: #DC3545; text-decoration: underline;">${loginUrl}</a></p>
      <p style="margin: 5px 0;"><strong>Username:</strong> ${email}</p>
      <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <span style="font-family: monospace; font-size: 18px; letter-spacing: 2px; color: #111827;">${password}</span></p>
    </div>
    <p>Please log in and change your password right away.</p>
    <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #92400E;"><strong>⚠️ Important:</strong> You have 10 days to complete your KYC to keep your Smart Number active. KYC can be completed from your dashboard.</p>
    </div>
    <p>You can also enhance your Smart Number by adding IVR, allowing you to greet callers and route calls professionally.</p>
    <p>If you need any help, our support team is here for you.</p>
    <p>Best regards,<br/>${companyName} Team</p>
  `;
  return emailWrapper(content);
};

export const smartNumberPurchaseConfirmation = (firstName: string, skyId: string, companyName: string = "SKY ID") => {
  const content = `
    <h2>Smart Number Purchase Successful</h2>
    <p>Hi ${firstName},</p>
    <p>Your Smart Number purchase was successful!</p>
    <div style="background-color: #f9fafb; border-left: 4px solid #DC3545; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; font-weight: bold; color: #111827;">Purchase Details:</p>
      <p style="margin: 5px 0;"><strong>Smart Number:</strong> <span style="font-size: 18px; color: #111827; font-weight: 600;">${skyId}</span></p>
    </div>
    <p>Your Smart Number is now being processed and will be activated shortly. You can manage your Smart Number from your dashboard.</p>
    <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #92400E;"><strong>⚠️ Important:</strong> You have 10 days to complete your KYC to keep your Smart Number active. KYC can be completed from your dashboard.</p>
    </div>
    <p>You can also enhance your Smart Number by adding IVR, allowing you to greet callers and route calls professionally.</p>
    <p>If you need any help, our support team is here for you.</p>
    <p>Best regards,<br/>${companyName} Team</p>
  `;
  return emailWrapper(content);
};
