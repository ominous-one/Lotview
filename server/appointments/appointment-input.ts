export interface AppointmentInput { startAt: Date; endAt: Date; leadName: string; }

export function parseCancelledBy(value: unknown): "BUYER" | "DEALER" {
  if (typeof value !== "string") {
    throw new Error("cancelledBy must be a string");
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "BUYER" || normalized === "CUSTOMER") return "BUYER";
  if (normalized === "DEALER" || normalized === "STAFF" || normalized === "USER") return "DEALER";

  throw new Error(`Invalid cancelledBy: ${value}`);
}
