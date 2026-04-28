export async function verifyEmail(_email: string): Promise<boolean> {
  return false;
}

export async function startNotificationEmailVerification(): Promise<never> {
  throw new Error("Notification email verification is not configured");
}

export async function verifyNotificationEmailToken(): Promise<{ success: false; reason: string }> {
  return { success: false, reason: "notification_email_verification_not_configured" };
}
