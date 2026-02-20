import { Resend } from 'resend';

async function getCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings || !connectionSettings.settings?.api_key) {
    throw new Error('Resend not connected');
  }
  
  return {
    apiKey: connectionSettings.settings.api_key, 
    fromEmail: connectionSettings.settings.from_email || 'noreply@lotview.ai'
  };
}

async function getResendClient(): Promise<{ client: Resend; fromEmail: string }> {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export function getDashboardUrl(): string {
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  return process.env.APP_URL || 'https://lotview.ai';
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const result = await client.emails.send({
      from: fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo
    });

    if (result.error) {
      console.error('[EmailService] Send error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log(`[EmailService] Email sent successfully: ${result.data?.id}`);
    return { success: true, id: result.data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[EmailService] Failed to send email:', message);
    return { success: false, error: message };
  }
}

export async function sendCallScoringAlert(params: {
  managerEmail: string;
  managerName: string;
  salespersonName: string;
  callDate: Date;
  overallScore: number;
  maxScore: number;
  department: string;
  callId: number;
  needsReview: boolean;
  dashboardUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const scorePercentage = Math.round((params.overallScore / params.maxScore) * 100);
  const scoreColor = scorePercentage >= 80 ? '#22c55e' : scorePercentage >= 60 ? '#eab308' : '#ef4444';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Call Scoring Alert</h1>
    </div>
    
    <div style="padding: 24px;">
      <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">
        Hi ${params.managerName},
      </p>
      
      <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">
        A new call has been scored and ${params.needsReview ? '<strong>requires your review</strong>' : 'is ready for your review'}.
      </p>
      
      <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Salesperson</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 500;">${params.salespersonName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Department</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 500;">${params.department}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Call Date</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 500;">${params.callDate.toLocaleDateString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">AI Score</td>
            <td style="padding: 8px 0; text-align: right;">
              <span style="background: ${scoreColor}; color: white; padding: 4px 12px; border-radius: 16px; font-size: 14px; font-weight: 600;">
                ${scorePercentage}%
              </span>
            </td>
          </tr>
        </table>
      </div>
      
      <div style="text-align: center;">
        <a href="${params.dashboardUrl}/call-analysis?callId=${params.callId}" 
           style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 16px;">
          Review Call
        </a>
      </div>
    </div>
    
    <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Lotview.ai - AI-Powered Dealership Platform
      </p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
Call Scoring Alert

Hi ${params.managerName},

A new call has been scored and ${params.needsReview ? 'requires your review' : 'is ready for your review'}.

Details:
- Salesperson: ${params.salespersonName}
- Department: ${params.department}
- Call Date: ${params.callDate.toLocaleDateString()}
- AI Score: ${scorePercentage}%

Review the call: ${params.dashboardUrl}/call-analysis?callId=${params.callId}

Lotview.ai - AI-Powered Dealership Platform
  `;

  return sendEmail({
    to: params.managerEmail,
    subject: `${params.needsReview ? '⚠️ ' : ''}Call Scoring: ${params.salespersonName} - ${scorePercentage}%`,
    html,
    text
  });
}

export async function sendLeadNotification(params: {
  salesEmail: string;
  salesName: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  vehicleInterest?: string;
  source: string;
  dashboardUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">🔔 New Lead Alert</h1>
    </div>
    
    <div style="padding: 24px;">
      <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">
        Hi ${params.salesName},
      </p>
      
      <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">
        You have a new lead from <strong>${params.source}</strong>!
      </p>
      
      <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Customer</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 500;">${params.customerName}</td>
          </tr>
          ${params.customerPhone ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Phone</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 500;">
              <a href="tel:${params.customerPhone}" style="color: #3b82f6; text-decoration: none;">${params.customerPhone}</a>
            </td>
          </tr>
          ` : ''}
          ${params.customerEmail ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 500;">
              <a href="mailto:${params.customerEmail}" style="color: #3b82f6; text-decoration: none;">${params.customerEmail}</a>
            </td>
          </tr>
          ` : ''}
          ${params.vehicleInterest ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Vehicle Interest</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 500;">${params.vehicleInterest}</td>
          </tr>
          ` : ''}
        </table>
      </div>
      
      <div style="text-align: center;">
        <a href="${params.dashboardUrl}/leads" 
           style="display: inline-block; background: #10b981; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 16px;">
          View Lead
        </a>
      </div>
    </div>
    
    <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Lotview.ai - AI-Powered Dealership Platform
      </p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
New Lead Alert

Hi ${params.salesName},

You have a new lead from ${params.source}!

Customer: ${params.customerName}
${params.customerPhone ? `Phone: ${params.customerPhone}` : ''}
${params.customerEmail ? `Email: ${params.customerEmail}` : ''}
${params.vehicleInterest ? `Vehicle Interest: ${params.vehicleInterest}` : ''}

View lead: ${params.dashboardUrl}/leads

Lotview.ai - AI-Powered Dealership Platform
  `;

  return sendEmail({
    to: params.salesEmail,
    subject: `🔔 New Lead: ${params.customerName}`,
    html,
    text
  });
}

export async function sendPasswordResetEmail(params: {
  email: string;
  name: string;
  resetToken: string;
  expiresIn: string;
}): Promise<{ success: boolean; error?: string }> {
  const resetUrl = `${getDashboardUrl()}/reset-password?token=${params.resetToken}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">🔐 Password Reset Request</h1>
    </div>
    
    <div style="padding: 24px;">
      <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">
        Hi ${params.name},
      </p>
      
      <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">
        We received a request to reset your password. Click the button below to create a new password.
      </p>
      
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${resetUrl}" 
           style="display: inline-block; background: #3b82f6; color: white; padding: 14px 36px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Reset Password
        </a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px;">
        This link will expire in <strong>${params.expiresIn}</strong>.
      </p>
      
      <p style="color: #6b7280; font-size: 14px; margin: 0;">
        If you didn't request a password reset, you can safely ignore this email. Your password won't be changed.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        If the button doesn't work, copy and paste this link into your browser:
        <br />
        <a href="${resetUrl}" style="color: #3b82f6; word-break: break-all;">${resetUrl}</a>
      </p>
    </div>
    
    <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Lotview.ai - AI-Powered Dealership Platform
      </p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
Password Reset Request

Hi ${params.name},

We received a request to reset your password.

Reset your password: ${resetUrl}

This link will expire in ${params.expiresIn}.

If you didn't request a password reset, you can safely ignore this email.

Lotview.ai - AI-Powered Dealership Platform
  `;

  return sendEmail({
    to: params.email,
    subject: '🔐 Reset Your Password - Lotview.ai',
    html,
    text
  });
}

export async function sendDailyDigest(params: {
  managerEmail: string;
  managerName: string;
  date: Date;
  stats: {
    totalCalls: number;
    callsScored: number;
    averageScore: number;
    leadsGenerated: number;
    appointmentsBooked: number;
  };
  topPerformers: Array<{ name: string; score: number }>;
  needsAttention: Array<{ name: string; issue: string }>;
  dashboardUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const formattedDate = params.date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">📊 Daily Performance Digest</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">${formattedDate}</p>
    </div>
    
    <div style="padding: 24px;">
      <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">
        Hi ${params.managerName}, here's your daily summary:
      </p>
      
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 24px;">
        <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="color: #16a34a; font-size: 28px; font-weight: 700;">${params.stats.totalCalls}</div>
          <div style="color: #6b7280; font-size: 12px; text-transform: uppercase;">Total Calls</div>
        </div>
        <div style="background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="color: #2563eb; font-size: 28px; font-weight: 700;">${params.stats.callsScored}</div>
          <div style="color: #6b7280; font-size: 12px; text-transform: uppercase;">Calls Scored</div>
        </div>
        <div style="background: #fef3c7; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="color: #d97706; font-size: 28px; font-weight: 700;">${params.stats.averageScore}%</div>
          <div style="color: #6b7280; font-size: 12px; text-transform: uppercase;">Avg Score</div>
        </div>
        <div style="background: #fce7f3; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="color: #db2777; font-size: 28px; font-weight: 700;">${params.stats.leadsGenerated}</div>
          <div style="color: #6b7280; font-size: 12px; text-transform: uppercase;">New Leads</div>
        </div>
      </div>
      
      ${params.topPerformers.length > 0 ? `
      <div style="margin-bottom: 24px;">
        <h3 style="color: #111827; font-size: 16px; margin: 0 0 12px;">🏆 Top Performers</h3>
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px;">
          ${params.topPerformers.map((p, i) => `
          <div style="display: flex; justify-content: space-between; padding: 8px 0; ${i < params.topPerformers.length - 1 ? 'border-bottom: 1px solid #e5e7eb;' : ''}">
            <span style="color: #374151;">${i + 1}. ${p.name}</span>
            <span style="color: #22c55e; font-weight: 600;">${p.score}%</span>
          </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
      
      ${params.needsAttention.length > 0 ? `
      <div style="margin-bottom: 24px;">
        <h3 style="color: #111827; font-size: 16px; margin: 0 0 12px;">⚠️ Needs Attention</h3>
        <div style="background: #fef2f2; border-radius: 8px; padding: 16px;">
          ${params.needsAttention.map((p, i) => `
          <div style="padding: 8px 0; ${i < params.needsAttention.length - 1 ? 'border-bottom: 1px solid #fecaca;' : ''}">
            <div style="color: #991b1b; font-weight: 500;">${p.name}</div>
            <div style="color: #7f1d1d; font-size: 13px;">${p.issue}</div>
          </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
      
      <div style="text-align: center;">
        <a href="${params.dashboardUrl}/dashboard" 
           style="display: inline-block; background: #8b5cf6; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 16px;">
          View Full Dashboard
        </a>
      </div>
    </div>
    
    <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Lotview.ai - AI-Powered Dealership Platform
      </p>
    </div>
  </div>
</body>
</html>
  `;

  return sendEmail({
    to: params.managerEmail,
    subject: `📊 Daily Digest: ${params.stats.callsScored} calls scored, ${params.stats.averageScore}% avg - ${formattedDate}`,
    html
  });
}
