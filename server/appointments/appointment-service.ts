export async function createAppointment(data: any, ..._args: unknown[]): Promise<any> {
  return { id: 1, ...data };
}

export async function transitionAppointment(..._args: unknown[]): Promise<any> {
  throw new Error("Appointment transitions are not configured");
}
