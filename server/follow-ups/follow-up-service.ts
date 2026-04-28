export async function generateFollowUp(_dealershipId: number, _conversationId: number): Promise<string> {
  return "";
}

export async function createFollowUpTasksForAppointmentEvent(): Promise<never> {
  throw new Error("Appointment follow-up tasks are not configured");
}
