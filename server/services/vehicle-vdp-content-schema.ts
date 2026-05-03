import { z } from "zod";

const manualHeadlineSchema = optionalTrimmedString(180);
const manualSubheadlineSchema = optionalTrimmedString(280);
const descriptionSchema = optionalTrimmedString(8000);
const videoUrlSchema = z.preprocess(
  trimString,
  z.union([httpUrlStringSchema(), z.literal(""), z.null()]).optional(),
);
const videoProviderSchema = optionalTrimmedString(80);

function trimString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function optionalTrimmedString(maxLength: number) {
  return z.preprocess(trimString, z.union([z.string().max(maxLength), z.null()]).optional());
}

function httpUrlStringSchema() {
  return z.string().max(2048).url().refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Video URL must use http or https");
}

function requireAtLeastOneField(fields: string[]) {
  return (value: Record<string, unknown>, context: z.RefinementCtx): void => {
    if (fields.some((field) => value[field] !== undefined)) return;

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `At least one field (${fields.join(", ")}) is required`,
    });
  };
}

export const legacyVehicleVdpContentUpdateSchema = z
  .object({
    manualHeadline: manualHeadlineSchema,
    manualSubheadline: manualSubheadlineSchema,
    manualDescription: descriptionSchema,
  })
  .strict()
  .superRefine(requireAtLeastOneField(["manualHeadline", "manualSubheadline", "manualDescription"]));

export const vehicleVdpContentUpdateSchema = z
  .object({
    description: descriptionSchema,
    videoUrl: videoUrlSchema,
    videoProvider: videoProviderSchema,
  })
  .strict()
  .superRefine(requireAtLeastOneField(["description", "videoUrl", "videoProvider"]));

export type LegacyVehicleVdpContentUpdateInput = z.infer<typeof legacyVehicleVdpContentUpdateSchema>;
export type VehicleVdpContentUpdateInput = z.infer<typeof vehicleVdpContentUpdateSchema>;
