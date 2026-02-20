import { VehicleSummary, Template, PostingLimits, ExtensionAuthState } from "./types";

export function isVehicleSummary(obj: unknown): obj is VehicleSummary {
  if (!obj || typeof obj !== "object") return false;
  const v = obj as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    (typeof v.year === "number" || v.year === undefined || v.year === null) &&
    (typeof v.make === "string" || v.make === undefined || v.make === null) &&
    (typeof v.model === "string" || v.model === undefined || v.model === null) &&
    Array.isArray(v.images)
  );
}

export function isVehicleSummaryArray(arr: unknown): arr is VehicleSummary[] {
  return Array.isArray(arr) && arr.every(isVehicleSummary);
}

export function isTemplate(obj: unknown): obj is Template {
  if (!obj || typeof obj !== "object") return false;
  const t = obj as Record<string, unknown>;
  return (
    typeof t.id === "number" &&
    typeof t.templateName === "string" &&
    typeof t.titleTemplate === "string" &&
    typeof t.descriptionTemplate === "string"
  );
}

export function isTemplateArray(arr: unknown): arr is Template[] {
  return Array.isArray(arr) && arr.every(isTemplate);
}

export function isPostingLimits(obj: unknown): obj is PostingLimits {
  if (!obj || typeof obj !== "object") return false;
  const l = obj as Record<string, unknown>;
  return (
    typeof l.dailyLimit === "number" &&
    typeof l.postsToday === "number" &&
    typeof l.remaining === "number" &&
    typeof l.postedVehicles === "object" &&
    l.postedVehicles !== null
  );
}

export function isExtensionAuthState(obj: unknown): obj is ExtensionAuthState {
  if (!obj || typeof obj !== "object") return false;
  const a = obj as Record<string, unknown>;
  return (
    typeof a.token === "string" &&
    a.token.length > 0 &&
    typeof a.userId === "number" &&
    typeof a.dealershipId === "number"
  );
}

export function isValidFillPayload(payload: unknown): payload is {
  platform: string;
  vehicleId: number;
  formData: Record<string, unknown>;
  imageUrls?: string[];
  templateId?: number;
} {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.platform === "string" &&
    typeof p.vehicleId === "number" &&
    typeof p.formData === "object" &&
    p.formData !== null
  );
}

export function isValidSaveTemplatePayload(payload: unknown): payload is {
  templateName: string;
  titleTemplate: string;
  descriptionTemplate: string;
  isShared?: boolean;
} {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.templateName === "string" &&
    p.templateName.trim().length > 0 &&
    typeof p.titleTemplate === "string" &&
    p.titleTemplate.trim().length > 0 &&
    typeof p.descriptionTemplate === "string" &&
    p.descriptionTemplate.trim().length > 0
  );
}
