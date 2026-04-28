export async function processFbReply(): Promise<{ processed: false; reason: string }> {
  return { processed: false, reason: "fb_reply_service_not_configured" };
}
