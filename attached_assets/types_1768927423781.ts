export type Platform = "facebook" | "kijiji" | "craigslist";

export interface ExtensionAuthState {
  token: string;
  userId: number;
  dealershipId: number;
  dealershipName?: string;
  email?: string;
}

export interface VehicleSummary {
  id: number;
  dealershipId: number;
  stockNumber?: string | null;
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  price?: number | null;
  odometer?: number | null;
  exteriorColour?: string | null;
  interiorColour?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
  description?: string | null;
  location?: string | null;
  images: string[];
  postedPlatforms?: Record<Platform, string | null>;
}

export interface Template {
  id: number;
  templateName: string;
  titleTemplate: string;
  descriptionTemplate: string;
  platform: Platform;
  isDefault: boolean;
}

export interface PostJob {
  vehicleId: number;
  platform: Platform;
  templateId?: number;
  images: File[];
  formData: Record<string, string | number | null>;
}
