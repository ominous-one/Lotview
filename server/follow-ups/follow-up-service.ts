export async function generateFollowUp(_dealershipId: number, _conversationId: number): Promise<string> {
  return "";
}

export async function createFollowUpTasksForAppointmentEvent(..._args: unknown[]): Promise<any> {
  throw new Error("Appointment follow-up tasks are not configured");
}
