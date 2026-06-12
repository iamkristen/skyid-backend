import { CreateEmailOptions, Resend } from "resend";
import dotenv from "dotenv";
import {
  registration,
  channelPartner,
  vsoRegistration,
  forgotPasswordTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
  kycHTML,
  depositMoneyTemplate,
  channelPartnerApproved,
  channelPartnerCreation,
  adminAccountCreated,
  adminLoginOtpTemplate,
  adminLoginSecurityAlert,
  individualSignupSuccess,
  individualMappingWelcome,
  smartNumberPurchaseConfirmation,
} from "../views/email-template";
import { mappingRequestApproved, mappingRequestRejected } from "../views/mapping-notifications";
import { IChannelPartner } from "../partner/partner.types";

dotenv.config();

const emailType: EmailType = {
  WELCOME_EMAIL: ["Welcome to SKYID", "registration_template"],
  OTP_EMAIL: ["Email Verification - SKYID", "verifyEmailTemplate"],
  FORGOT_PASSWORD: ["Password Reset - SKYID", "forgotPasswordTemplate"],
  RESET_PASSWORD: ["Password Reset Successful - SKYID", "resetPasswordTemplate"],
  KYC_COMPLETE: ["KYC Verification Complete - SKYID", "kycHTML"],
  DEPOSIT_CONFIRMATION: ["Deposit Confirmation - SKYID", "depositMoneyTemplate"],
  CHANNEL_PARTNER_REG: ["Channel Partner Registration - SKYID", "channelPartner"],
  CHANNEL_PARTNER_ACC: ["Channel Partner Registration - SKYID", "channelPartnerCreation"],
  CHANNEL_PARTNER_APPROVED: ["Channel Partner Application Approved - SKYID", "channelPartnerApproved"],
  VSO_REGISTRATION: ["Welcome to SKYID VSO - Account Created", "vsoRegistration"],
  MAPPING_REQUEST_APPROVED: ["Mapping Request Approved - SkyID", "mappingRequestApproved"],
  MAPPING_REQUEST_REJECTED: ["Mapping Request Update - SkyID", "mappingRequestRejected"],
  FINANCE_REQUEST_APPROVED: ["Wallet Request Approved - SKYID", "financeApproved"],
  FINANCE_REQUEST_REJECTED: ["Wallet Request Rejected - SKYID", "financeRejected"],
  VSO_TOPUP_APPROVED: ["Top-Up Request Approved - SKYID", "vsoTopUpApproved"],
  VSO_TOPUP_REJECTED: ["Top-Up Request Rejected - SKYID", "vsoTopUpRejected"],
  VSO_TOPUP_REQUESTED: ["New VSO Top-Up Request - SKYID", "vsoTopUpRequested"],
  ADMIN_ACCOUNT_CREATED: ["Your SkyID Admin Account - Login Details", "adminAccountCreated"],
  ADMIN_LOGIN_OTP: ["Your SkyID Admin login code", "adminLoginOtpTemplate"],
  ADMIN_LOGIN_SECURITY_ALERT: ["Security alert: new sign-in to your SkyID admin", "adminLoginSecurityAlert"],
};

// Initialize Resend only if EMAIL_SECRET_KEY is provided (optional for development)
const resend = process.env.EMAIL_SECRET_KEY
  ? new Resend(process.env.EMAIL_SECRET_KEY as string)
  : null;

if (!resend && process.env.NODE_ENV !== "test") {
  console.warn("⚠️  EMAIL_SECRET_KEY not set - Email service disabled. Emails will not be sent.");
}

type Data = {
  [T: string]: string | { [key: string]: string }[];
};

type EmailType = {
  [k: string]: string[];
};

export default class EmailService {
  static async _sendMail(
    type: string,
    email: string,
    name?: string,
    data?: Data,
    amount?: string,
    otp?: string,
    businessName?: string,
    password?: string,
    partnerDetails?: IChannelPartner
  ) {
    const mailOptions: CreateEmailOptions = {
      from: "no-reply@skyid.ng",
      to: [email],
      subject: "",
      html: "",
    };

    const [subject, templatePath] = emailType[type] || [];
    if (!subject || !templatePath) return;

    switch (templatePath) {
      case "registration_template":
        mailOptions.html = registration(name || "", otp || "");
        mailOptions.subject = subject;
        break;
      case "channelPartnerCreation":
        if (!name || !password) {
          throw new Error("Partner details are required for channel partner registration");
        }
        mailOptions.html = channelPartnerCreation(name || "", password);
        mailOptions.subject = subject;
        break;
      case "adminAccountCreated": {
        const adminData = data as { email: string; loginUrl?: string };
        if (!name || !password || !adminData?.email) {
          throw new Error("Name, email and password are required for admin account created email");
        }
        const loginUrl = adminData.loginUrl || "https://admin.dev.skyid.ng";
        mailOptions.html = adminAccountCreated(name || "", adminData.email, password, loginUrl);
        mailOptions.subject = subject;
        break;
      }
      case "adminLoginOtpTemplate": {
        if (!otp) throw new Error("OTP is required for admin login OTP email");
        mailOptions.html = adminLoginOtpTemplate(name || "", otp);
        mailOptions.subject = subject;
        break;
      }
      case "adminLoginSecurityAlert": {
        const d = data as { location?: string; browser?: string; loginTime?: string };
        if (!name || d?.location == null || d?.browser == null || d?.loginTime == null) {
          throw new Error("Name, location, browser and loginTime are required for admin login security alert");
        }
        mailOptions.html = adminLoginSecurityAlert(name || "", d.location, d.browser, d.loginTime);
        mailOptions.subject = subject;
        break;
      }

      case "channelPartner":
        if (!partnerDetails) {
          throw new Error("Partner details are required for channel partner registration");
        }
        mailOptions.html = channelPartner(name || "", partnerDetails);
        mailOptions.subject = subject;
        break;
      case "vsoRegistration":
        if (!businessName || !password) {
          throw new Error("Business name and password are required for VSO registration");
        }
        mailOptions.html = vsoRegistration(businessName, name || "", password);
        mailOptions.subject = subject;
        break;
      case "forgotPasswordTemplate":
        if (!otp) {
          throw new Error("OTP is required for forgot password email");
        }
        mailOptions.html = forgotPasswordTemplate(name || "", otp);
        mailOptions.subject = subject;
        break;
      case "resetPasswordTemplate":
        mailOptions.html = resetPasswordTemplate(name || "");
        mailOptions.subject = subject;
        break;
      case "verifyEmailTemplate":
        if (!otp) {
          throw new Error("OTP is required for email verification");
        }
        mailOptions.html = verifyEmailTemplate(name || "", otp);
        mailOptions.subject = subject;
        break;
      case "kycHTML":
        mailOptions.html = kycHTML(name || "");
        mailOptions.subject = subject;
        break;
      case "depositMoneyTemplate":
        if (!amount) {
          throw new Error("Amount is required for deposit confirmation");
        }
        mailOptions.html = depositMoneyTemplate(name || "", amount);
        mailOptions.subject = subject;
        break;
      case "channelPartnerApproved":
        mailOptions.html = channelPartnerApproved(name || "", (data?.link as string) || "");
        mailOptions.subject = subject;
        break;
      case "mappingRequestApproved":
        if (!data?.skyId || !data?.requestType) {
          throw new Error("Sky ID and request type are required for mapping request approval");
        }
        mailOptions.html = mappingRequestApproved(
          name || "",
          data.skyId as string,
          data.requestType as string
        );
        mailOptions.subject = subject;
        break;
      case "mappingRequestRejected":
        if (!data?.skyId || !data?.requestType || !data?.reason) {
          throw new Error("Sky ID, request type, and reason are required for mapping request rejection");
        }
        mailOptions.html = mappingRequestRejected(
          name || "",
          data.skyId as string,
          data.requestType as string,
          data.reason as string
        );
        mailOptions.subject = subject;
        break;
      case "financeApproved": {
        const requestType = (data?.requestType as string) || "";
        const amt = amount || "0";
        mailOptions.html = `
          <div style="margin:0;padding:0;background:#f6f7f9;width:100%;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7f9;padding:24px 0;">
              <tr>
                <td align="center">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:12px;box-shadow:0 8px 24px rgba(16,24,40,0.08);overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                    <tr>
                      <td style="background:#dc2626;padding:20px 24px;color:#ffffff;">
                        <h1 style="margin:0;font-size:20px;line-height:28px;font-weight:700;">Wallet Request Approved</h1>
                        <p style="margin:4px 0 0;font-size:12px;opacity:.9;">SkyID Notifications</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:24px;">
                        <p style="margin:0 0 12px;font-size:14px;">Hello ${name || "User"},</p>
                        <p style="margin:0 0 16px;font-size:14px;">Your <strong>${requestType}</strong> request has been <strong style="color:#059669;">approved</strong>.</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:8px 0 16px;">
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;">Amount</td>
                            <td align="right" style="padding:12px 16px;font-size:13px;font-weight:700;">₦${(Number(amt) / 100).toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;">Status</td>
                            <td align="right" style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;font-weight:700;color:#059669;">Approved</td>
                          </tr>
                        </table>
                        <p style="margin:0;font-size:12px;color:#6b7280;">If you did not initiate this request, please contact support immediately.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f3f4f6;padding:16px 24px;text-align:center;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} SkyID. All rights reserved.</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>`;
        mailOptions.subject = subject;
        break;
      }
      case "financeRejected": {
        const requestType = (data?.requestType as string) || "";
        const reason = (data?.reason as string) || "";
        const amt = amount || "0";
        mailOptions.html = `
          <div style="margin:0;padding:0;background:#f6f7f9;width:100%;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7f9;padding:24px 0;">
              <tr>
                <td align="center">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:12px;box-shadow:0 8px 24px rgba(16,24,40,0.08);overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                    <tr>
                      <td style="background:#dc2626;padding:20px 24px;color:#ffffff;">
                        <h1 style="margin:0;font-size:20px;line-height:28px;font-weight:700;">Wallet Request Rejected</h1>
                        <p style="margin:4px 0 0;font-size:12px;opacity:.9;">SkyID Notifications</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:24px;">
                        <p style="margin:0 0 12px;font-size:14px;">Hello ${name || "User"},</p>
                        <p style="margin:0 0 16px;font-size:14px;">Your <strong>${requestType}</strong> request has been <strong style="color:#dc2626;">rejected</strong>.</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:8px 0 16px;">
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;">Amount</td>
                            <td align="right" style="padding:12px 16px;font-size:13px;font-weight:700;">₦${(Number(amt) / 100).toLocaleString()}</td>
                          </tr>
                          ${reason ? `<tr><td style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;">Reason</td><td align=\"right\" style=\"padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;font-weight:700;\">${reason}</td></tr>` : ""}
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;">Status</td>
                            <td align="right" style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;font-weight:700;color:#dc2626;">Rejected</td>
                          </tr>
                        </table>
                        <p style="margin:0;font-size:12px;color:#6b7280;">If you have questions, please reply to this email or contact support.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f3f4f6;padding:16px 24px;text-align:center;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} SkyID. All rights reserved.</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>`;
        mailOptions.subject = subject;
        break;
      }
      case "vsoTopUpApproved": {
        const amt = amount || "0";
        mailOptions.html = `
          <div style="margin:0;padding:0;background:#f6f7f9;width:100%;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7f9;padding:24px 0;">
              <tr>
                <td align="center">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:12px;box-shadow:0 8px 24px rgba(16,24,40,0.08);overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                    <tr>
                      <td style="background:#dc2626;padding:20px 24px;color:#ffffff;">
                        <h1 style="margin:0;font-size:20px;line-height:28px;font-weight:700;">Top-Up Request Approved</h1>
                        <p style="margin:4px 0 0;font-size:12px;opacity:.9;">SkyID Notifications</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:24px;">
                        <p style="margin:0 0 12px;font-size:14px;">Hello ${name || "User"},</p>
                        <p style="margin:0 0 16px;font-size:14px;">Your <strong>wallet top-up</strong> request has been <strong style="color:#059669;">approved</strong> by your Channel Partner.</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:8px 0 16px;">
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;">Amount</td>
                            <td align="right" style="padding:12px 16px;font-size:13px;font-weight:700;">₦${(Number(amt) / 100).toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;">Status</td>
                            <td align="right" style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;font-weight:700;color:#059669;">Approved</td>
                          </tr>
                        </table>
                        <p style="margin:0;font-size:12px;color:#6b7280;">The funds have been added to your wallet. You can now use them for your business activities.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f3f4f6;padding:16px 24px;text-align:center;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} SkyID. All rights reserved.</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>`;
        mailOptions.subject = subject;
        break;
      }
      case "vsoTopUpRejected": {
        const reason = (data?.reason as string) || "";
        const amt = amount || "0";
        mailOptions.html = `
          <div style="margin:0;padding:0;background:#f6f7f9;width:100%;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7f9;padding:24px 0;">
              <tr>
                <td align="center">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:12px;box-shadow:0 8px 24px rgba(16,24,40,0.08);overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                    <tr>
                      <td style="background:#dc2626;padding:20px 24px;color:#ffffff;">
                        <h1 style="margin:0;font-size:20px;line-height:28px;font-weight:700;">Top-Up Request Rejected</h1>
                        <p style="margin:4px 0 0;font-size:12px;opacity:.9;">SkyID Notifications</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:24px;">
                        <p style="margin:0 0 12px;font-size:14px;">Hello ${name || "User"},</p>
                        <p style="margin:0 0 16px;font-size:14px;">Your <strong>wallet top-up</strong> request has been <strong style="color:#dc2626;">rejected</strong> by your Channel Partner.</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:8px 0 16px;">
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;">Amount</td>
                            <td align="right" style="padding:12px 16px;font-size:13px;font-weight:700;">₦${(Number(amt) / 100).toLocaleString()}</td>
                          </tr>
                          ${reason ? `<tr><td style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;">Reason</td><td align=\"right\" style=\"padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;font-weight:700;\">${reason}</td></tr>` : ""}
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;">Status</td>
                            <td align="right" style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;font-weight:700;color:#dc2626;">Rejected</td>
                          </tr>
                        </table>
                        <p style="margin:0;font-size:12px;color:#6b7280;">If you have questions, please contact your Channel Partner or reach out to support.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f3f4f6;padding:16px 24px;text-align:center;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} SkyID. All rights reserved.</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>`;
        mailOptions.subject = subject;
        break;
      }
      case "vsoTopUpRequested": {
        const vsoName = (data?.vsoName as string) || "VSO";
        const amt = amount || "0";
        mailOptions.html = `
          <div style="margin:0;padding:0;background:#f6f7f9;width:100%;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7f9;padding:24px 0;">
              <tr>
                <td align="center">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:12px;box-shadow:0 8px 24px rgba(16,24,40,0.08);overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                    <tr>
                      <td style="background:#dc2626;padding:20px 24px;color:#ffffff;">
                        <h1 style="margin:0;font-size:20px;line-height:28px;font-weight:700;">New VSO Top-Up Request</h1>
                        <p style="margin:4px 0 0;font-size:12px;opacity:.9;">SkyID Notifications</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:24px;">
                        <p style="margin:0 0 12px;font-size:14px;">Hello ${name || "Channel Partner"},</p>
                        <p style="margin:0 0 16px;font-size:14px;">Your <strong>VSO ${vsoName}</strong> has requested a <strong>wallet top-up</strong>.</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:8px 0 16px;">
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;">VSO Name</td>
                            <td align="right" style="padding:12px 16px;font-size:13px;font-weight:700;">${vsoName}</td>
                          </tr>
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;">Requested Amount</td>
                            <td align="right" style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;font-weight:700;">₦${(Number(amt) / 100).toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;">Status</td>
                            <td align="right" style="padding:12px 16px;font-size:13px;border-top:1px solid #e5e7eb;font-weight:700;color:#f59e0b;">Pending</td>
                          </tr>
                        </table>
                        <p style="margin:0;font-size:12px;color:#6b7280;">Please review and respond to this request in your dashboard. You can approve or reject the request.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f3f4f6;padding:16px 24px;text-align:center;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} SkyID. All rights reserved.</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>`;
        mailOptions.subject = subject;
        break;
      }
    }

    // Skip email sending if Resend is not configured (development mode)
    if (!resend) {
      console.warn(`📧 [DEV MODE] Email would be sent to ${email} - Subject: ${mailOptions.subject}`);
      if (otp && (type === "OTP_EMAIL" || type === "FORGOT_PASSWORD")) {
        console.warn(`🔑 [DEV MODE] OTP Code: ${otp}`);
        console.warn(`📧 [DEV MODE] Email Type: ${type === "OTP_EMAIL" ? "Email Verification" : "Password Reset"}`);
      }
      return { id: "dev-mode-skip", message: "Email skipped in development mode" };
    }

    console.info(`Email on it's way to ${email}`);
    const response = await resend?.emails.send(mailOptions);
    console.info(response, "response");

    return response;
  }

  static async sendWelcomeEmail(to: string, fullName: string) {
    return await this._sendMail("WELCOME_EMAIL", to, fullName);
  }

  static async sendAdminAccountCreated(to: string, fullName: string, loginEmail: string, password: string, loginUrl: string = "https://admin.dev.skyid.ng") {
    return await this._sendMail("ADMIN_ACCOUNT_CREATED", to, fullName, { email: loginEmail, loginUrl }, undefined, undefined, undefined, password);
  }

  static async sendAdminLoginOtp(to: string, fullName: string, otp: string) {
    return await this._sendMail("ADMIN_LOGIN_OTP", to, fullName, undefined, undefined, otp);
  }

  static async sendAdminLoginSecurityAlert(
    to: string,
    fullName: string,
    location: string,
    browser: string,
    loginTime: string
  ) {
    return await this._sendMail("ADMIN_LOGIN_SECURITY_ALERT", to, fullName, {
      location,
      browser,
      loginTime,
    });
  }

  static async sendOTPEmail(to: string, fullName: string, otp: string) {
    return await this._sendMail("OTP_EMAIL", to, fullName, undefined, undefined, otp);
  }

  static async sendForgotPasswordEmail(to: string, fullName: string, otp: string) {
    return await this._sendMail("FORGOT_PASSWORD", to, fullName, undefined, undefined, otp);
  }

  static async sendResetPasswordConfirmation(to: string, fullName: string) {
    return await this._sendMail("RESET_PASSWORD", to, fullName);
  }

  static async sendKYCCompletionEmail(to: string, fullName: string) {
    return await this._sendMail("KYC_COMPLETE", to, fullName);
  }

  static async sendDepositConfirmation(to: string, fullName: string, amount: string) {
    return await this._sendMail("DEPOSIT_CONFIRMATION", to, fullName, undefined, amount);
  }

  static async sendChannelPartnerRegistration(to: string, fullName: string, partnerDetails: IChannelPartner) {
    return await this._sendMail(
      "CHANNEL_PARTNER_REG",
      to,
      fullName,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      partnerDetails
    );
  }

  static async sendChannelPartnerApproval(to: string, fullName: string, link: string) {
    return await this._sendMail("CHANNEL_PARTNER_APPROVED", to, fullName, { link });
  }

  static async sendVSORegistration(to: string, fullName: string, businessName: string, password: string) {
    return await this._sendMail(
      "VSO_REGISTRATION",
      to,
      fullName,
      undefined,
      undefined,
      undefined,
      businessName,
      password
    );
  }
  static async sendChannelPartnerCreation(to: string, fullName: string, businessName: string, password: string) {
    return await this._sendMail(
      "CHANNEL_PARTNER_ACC",
      to,
      fullName,
      undefined,
      undefined,
      undefined,
      businessName,
      password
    );
  }

  static async sendMappingRequestApproved(to: string, fullName: string, skyId: string, requestType: string) {
    return await this._sendMail(
      "MAPPING_REQUEST_APPROVED",
      to,
      fullName,
      { skyId, requestType }
    );
  }

  static async sendMappingRequestRejected(to: string, fullName: string, skyId: string, requestType: string, reason: string) {
    return await this._sendMail(
      "MAPPING_REQUEST_REJECTED",
      to,
      fullName,
      { skyId, requestType, reason }
    );
  }

  static async sendFinanceRequestApproved(to: string, fullName: string, requestType: string, amount: number) {
    return await this._sendMail("FINANCE_REQUEST_APPROVED", to, fullName, { requestType }, String(amount));
  }

  static async sendFinanceRequestRejected(
    to: string,
    fullName: string,
    requestType: string,
    amount: number,
    reason?: string
  ) {
    return await this._sendMail("FINANCE_REQUEST_REJECTED", to, fullName, { requestType, reason: reason || "" }, String(amount));
  }

  static async sendVSOTopUpApproved(to: string, fullName: string, amount: number) {
    return await this._sendMail("VSO_TOPUP_APPROVED", to, fullName, {}, String(amount));
  }

  static async sendVSOTopUpRejected(to: string, fullName: string, amount: number, reason?: string) {
    return await this._sendMail("VSO_TOPUP_REJECTED", to, fullName, { reason: reason || "" }, String(amount));
  }

  static async sendVSOTopUpRequested(to: string, fullName: string, vsoName: string, amount: number) {
    return await this._sendMail("VSO_TOPUP_REQUESTED", to, fullName, { vsoName }, String(amount));
  }

  /** Migration email for create-individual-mapping (short, no "account created" wording). */
  static async sendIndividualMappingWelcome(
    to: string,
    firstName: string,
    loginUrl: string,
    email: string,
    password: string,
    companyName: string = "SkyID"
  ) {
    const mailOptions: CreateEmailOptions = {
      from: "no-reply@skyid.ng",
      to: [to],
      subject: "Your SkyID – login details",
      html: individualMappingWelcome(firstName, loginUrl, email, password, companyName),
    };
    console.info(`Sending migration welcome email to ${to}`);
    return await resend?.emails.send(mailOptions);
  }

  static async sendIndividualSignupSuccess(
    to: string,
    firstName: string,
    loginUrl: string,
    email: string,
    password: string,
    companyName: string = "SKY ID"
  ) {
    const mailOptions: CreateEmailOptions = {
      from: "no-reply@skyid.ng",
      to: [to],
      subject: "Smart Number Purchase Successful - Your Account is Ready",
      html: individualSignupSuccess(firstName, loginUrl, email, password, companyName),
    };

    console.info(`Sending signup success email to ${to}`);
    const response = await resend?.emails.send(mailOptions);
    console.info(response, "response");

    return response;
  }

  static async sendSmartNumberPurchaseConfirmation(
    to: string,
    firstName: string,
    skyId: string,
    companyName: string = "SKY ID"
  ) {
    const mailOptions: CreateEmailOptions = {
      from: "no-reply@skyid.ng",
      to: [to],
      subject: "Smart Number Purchase Successful",
      html: smartNumberPurchaseConfirmation(firstName, skyId, companyName),
    };

    console.info(`Sending smart number purchase confirmation email to ${to}`);
    const response = await resend?.emails.send(mailOptions);
    console.info(response, "response");

    return response;
  }

  /** Notifies the Switch team inbox when a create-individual request reaches Level 3 (after L2 approval). */
  static async notifySwitchTeamCreateIndividualPendingLevel3(params: {
    requestId: string;
    skyId: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    submissionSource?: string;
  }): Promise<void> {
    const esc = (s: string) =>
      (s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const to = process.env.SWITCH_TEAM_L3_NOTIFY_EMAIL || "switch@itskysolutions.com";
    const sourceLabel =
      params.submissionSource === "mapping_page" ? "New manual activation" : "Preloaded / claim & assign";
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
      <h1 style="font-size:18px;margin:0 0 16px;">Create Individual — ready for Level 3</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">A request has been approved at Level 2 and is now pending <strong>Level 3</strong> review in the admin dashboard.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;">
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">Type</td><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-weight:600;">${sourceLabel}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">Sky ID</td><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-weight:600;font-family:ui-monospace,monospace;">${esc(params.skyId)}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">Owner name</td><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">${esc(params.firstName)} ${esc(params.lastName)}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">Email</td><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">${esc(params.email)}</td></tr>
        <tr><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">Phone</td><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">${esc(params.phoneNumber)}</td></tr>
        <tr><td style="padding:10px 14px;">Request ID</td><td style="padding:10px 14px;font-family:ui-monospace,monospace;font-size:12px;">${esc(params.requestId)}</td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">This is an automated message from SkyID.</p>
    </div>`;

    await resend?.emails.send({
      from: "no-reply@skyid.ng",
      to: [to],
      subject: `SkyID Switch — Level 3 review: ${params.skyId}`,
      html,
    });
    console.info(`Switch L3 pending notification sent to ${to} for request ${params.requestId}`);
  }
}
