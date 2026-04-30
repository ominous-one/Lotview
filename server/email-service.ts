type EmailResult = {
  success: false;
  error: string;
  id?: never;
};

function emailDisabled(): EmailResult {
  return { success: false, error: "Email service is not configured" };
}

export function getDashboardUrl(): string {
  return process.env.APP_URL || process.env.PUBLIC_APP_URL || "http://localhost:5000";
}

export async function sendPasswordResetEmail(_params: {
  email: string;
  name?: string;
  resetToken: string;
  expiresIn?: string;
}): Promise<EmailResult> {
  return emailDisabled();
}

export async function sendEmail(_params: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}): Promise<EmailResult> {
  return emailDisabled();
}

export async function sendCallScoringAlert(_params: Record<string, unknown>): Promise<EmailResult> {
  return emailDisabled();
}

export async function sendLeadNotification(_params: Record<string, unknown>): Promise<EmailResult> {
  return emailDisabled();
}
