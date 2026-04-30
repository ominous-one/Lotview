export async function verifyEmail(_email: string): Promise<boolean> {
  return false;
}

export async function startNotificationEmailVerification(..._args: unknown[]): Promise<any> {
  throw new Error("Notification email verification is not configured");
}

export async function verifyNotificationEmailToken(..._args: unknown[]): Promise<any> {
  return { success: false, reason: "notification_email_verification_not_configured" };
}
