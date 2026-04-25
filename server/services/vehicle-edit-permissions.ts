/**
 * Vehicle Edit Permissions — Role-Based Access Control
 * 
 * Hierarchy:
 *   super_admin: Full access to everything
 *   master: Full dealership access
 *   manager (Sales Manager / General Manager): Can edit vehicles, pricing, photos
 *   salesperson: View-only or limited edit
 *   admin: Can edit but not delete
 */

export type VehicleEditRole = "super_admin" | "master" | "manager" | "admin" | "salesperson";

export interface VehicleEditPermission {
  canEditBasicInfo: boolean;     // year, make, model, trim
  canEditPricing: boolean;       // price, msrp, sale price
  canEditPhotos: boolean;          // upload, reorder, delete
  canEditDescription: boolean;     // VDP content, description
  canEditStatus: boolean;          // status, lifecycle, visibility
  canEditCarfax: boolean;          // refresh, badges
  canLockFields: boolean;          // prevent overwrite
  canDelete: boolean;              // soft delete / hard delete
  canBulkEdit: boolean;            // edit multiple vehicles
  canViewCosts: boolean;           // see floor plan, holdback
  canEditCosts: boolean;           // modify cost data
  maxPhotosAllowed: number;        // how many photos they can manage
  requiresApprovalFor: string[];     // which edits need GM approval
}

const PERMISSION_MATRIX: Record<VehicleEditRole, VehicleEditPermission> = {
  super_admin: {
    canEditBasicInfo: true,
    canEditPricing: true,
    canEditPhotos: true,
    canEditDescription: true,
    canEditStatus: true,
    canEditCarfax: true,
    canLockFields: true,
    canDelete: true,
    canBulkEdit: true,
    canViewCosts: true,
    canEditCosts: true,
    maxPhotosAllowed: 50,
    requiresApprovalFor: [],
  },
  master: {
    canEditBasicInfo: true,
    canEditPricing: true,
    canEditPhotos: true,
    canEditDescription: true,
    canEditStatus: true,
    canEditCarfax: true,
    canLockFields: true,
    canDelete: true,
    canBulkEdit: true,
    canViewCosts: true,
    canEditCosts: true,
    maxPhotosAllowed: 30,
    requiresApprovalFor: [],
  },
  manager: {
    canEditBasicInfo: true,
    canEditPricing: true,
    canEditPhotos: true,
    canEditDescription: true,
    canEditStatus: true,
    canEditCarfax: true,
    canLockFields: true,
    canDelete: false, // Cannot hard delete
    canBulkEdit: true,
    canViewCosts: true,
    canEditCosts: false, // Cannot modify cost basis
    maxPhotosAllowed: 20,
    requiresApprovalFor: ["price_drop_above_10_percent", "status_change_to_sold"],
  },
  admin: {
    canEditBasicInfo: true,
    canEditPricing: true,
    canEditPhotos: true,
    canEditDescription: true,
    canEditStatus: true,
    canEditCarfax: false,
    canLockFields: false,
    canDelete: false,
    canBulkEdit: true,
    canViewCosts: true,
    canEditCosts: false,
    maxPhotosAllowed: 15,
    requiresApprovalFor: ["price_change", "status_change"],
  },
  salesperson: {
    canEditBasicInfo: false,      // Cannot change VIN/year/make
    canEditPricing: false,        // Cannot change prices
    canEditPhotos: true,          // Can add photos
    canEditDescription: true,     // Can edit notes
    canEditStatus: false,         // Cannot change status
    canEditCarfax: false,
    canLockFields: false,
    canDelete: false,
    canBulkEdit: false,
    canViewCosts: false,
    canEditCosts: false,
    maxPhotosAllowed: 10,
    requiresApprovalFor: ["any_pricing_edit", "status_change", "photo_deletion"],
  },
};

export function getVehicleEditPermission(role: VehicleEditRole): VehicleEditPermission {
  return PERMISSION_MATRIX[role] || PERMISSION_MATRIX.salesperson;
}

export function canEditField(
  role: VehicleEditRole,
  field: string,
  action: "edit" | "delete" | "lock" = "edit"
): boolean {
  const perm = getVehicleEditPermission(role);

  if (action === "lock" && !perm.canLockFields) return false;
  if (action === "delete" && !perm.canDelete) return false;

  const fieldLower = field.toLowerCase();

  if (["year", "make", "model", "trim", "vin", "stock"].includes(fieldLower)) {
    return perm.canEditBasicInfo;
  }
  if (["price", "msrp", "saleprice", "internetprice", "cost"].includes(fieldLower)) {
    return perm.canEditPricing;
  }
  if (["images", "photos", "image", "photo", "photourls"].includes(fieldLower)) {
    return perm.canEditPhotos;
  }
  if (["description", "vdp", "vdcontent", "notes", "internalnotes"].includes(fieldLower)) {
    return perm.canEditDescription;
  }
  if (["status", "lifecycle", "visibility"].includes(fieldLower)) {
    return perm.canEditStatus;
  }
  if (["carfax", "carfaxbadges", "carfaxreport"].includes(fieldLower)) {
    return perm.canEditCarfax;
  }

  return false;
}

export function getPhotoLimit(role: VehicleEditRole): number {
  return getVehicleEditPermission(role).maxPhotosAllowed;
}

export function requiresApproval(
  role: VehicleEditRole,
  action: string,
  details?: Record<string, any>
): boolean {
  const perm = getVehicleEditPermission(role);

  for (const req of perm.requiresApprovalFor) {
    if (action.includes(req) || req.includes(action)) return true;
  }

  // Price drop > 10% always requires approval for non-masters
  if (details?.priceChangePercent && Math.abs(details.priceChangePercent) > 10) {
    if (role !== "master" && role !== "super_admin") return true;
  }

  return false;
}

export function sanitizeVehicleEdit(
  role: VehicleEditRole,
  input: Record<string, any>
): { allowed: Record<string, any>; rejected: Record<string, string> } {
  const allowed: Record<string, any> = {};
  const rejected: Record<string, string> = {};

  for (const [field, value] of Object.entries(input)) {
    if (canEditField(role, field, "edit")) {
      allowed[field] = value;
    } else {
      rejected[field] = `Field '${field}' cannot be edited by ${role}`;
    }
  }

  return { allowed, rejected };
}
