export async function runFbAutoReply(): Promise<{ sent: false; reason: string }> {
  return { sent: false, reason: "fb_auto_reply_not_configured" };
}
