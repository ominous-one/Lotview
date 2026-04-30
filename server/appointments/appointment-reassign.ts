export async function reassignAppointment(id: number, _userId: number): Promise<any> {
  return { id };
}

export async function reassignAppointmentOwner(..._args: unknown[]): Promise<any> {
  throw new Error("Appointment reassignment is not configured");
}
