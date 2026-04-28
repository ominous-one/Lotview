export async function createAppointment(data: any): Promise<any> {
  return { id: 1, ...data };
}

export async function transitionAppointment(): Promise<never> {
  throw new Error("Appointment transitions are not configured");
}
