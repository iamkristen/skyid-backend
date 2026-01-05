// Email wrapper function
const emailWrapper = (content: string) => {
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
        .footer { 
          background-color: #f8f9fa; 
          padding: 20px; 
          text-align: center; 
          font-size: 12px; 
          color: #666; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-section">
          <img src="https://cdn.skyid.ng/logo.png" alt="SkyID Logo" class="logo">
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>© 2024 SkyID. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    </body>
  </html>
  `;
};

export const mappingRequestApproved = (name: string, skyId: string, requestType: string) => {
  const content = `
    <h2>Mapping Request Approved</h2>
    <p>Dear ${name},</p>
    <p>Great news! Your mapping request has been approved and processed successfully.</p>
    <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #0369a1;">Request Details</h3>
      <p><strong>Sky ID:</strong> ${skyId}</p>
      <p><strong>Request Type:</strong> ${requestType}</p>
      <p><strong>Status:</strong> <span style="color: #16a34a; font-weight: bold;">Approved</span></p>
    </div>
    <p>Your mapping request has been completed and your Sky ID is now active. You can start using your services immediately.</p>
    <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
    <p>Best regards,<br/>SkyID Team</p>
  `;
  return emailWrapper(content);
};

export const mappingRequestRejected = (name: string, skyId: string, requestType: string, reason: string) => {
  const content = `
    <h2>Mapping Request Update</h2>
    <p>Dear ${name},</p>
    <p>We regret to inform you that your mapping request could not be approved at this time.</p>
    <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #dc2626;">Request Details</h3>
      <p><strong>Sky ID:</strong> ${skyId}</p>
      <p><strong>Request Type:</strong> ${requestType}</p>
      <p><strong>Status:</strong> <span style="color: #dc2626; font-weight: bold;">Rejected</span></p>
    </div>
    <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #374151;">Reason for Rejection</h3>
      <p style="margin-bottom: 0;">${reason}</p>
    </div>
    <p>Please review the reason provided above and feel free to submit a new request with the necessary corrections.</p>
    <p>If you have any questions or need clarification, please don't hesitate to contact our support team.</p>
    <p>Best regards,<br/>SkyID Team</p>
  `;
  return emailWrapper(content);
};
