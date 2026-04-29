export async function scheduleMessage(_dealershipId: number, _message: any): Promise<any> {
  return { scheduled: false, reason: "scheduled_messages_not_configured" };
}

export async function processScheduledMessages(): Promise<{ processed: 0; sent: 0; failed: 0; disabled: true }> {
  return { processed: 0, sent: 0, failed: 0, disabled: true };
}
