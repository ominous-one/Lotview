export async function syncCatalog(_dealershipId: number): Promise<any> {
  return { success: false, errors: ["facebook_catalog_not_configured"] };
}

export const facebookCatalogService = {
  async syncVehiclesToCatalog(..._args: unknown[]): Promise<any> {
    return {
      success: false,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: ["facebook_catalog_not_configured"],
    };
  },
  async testConnection(..._args: unknown[]): Promise<any> {
    return {
      success: false,
      error: "facebook_catalog_not_configured",
      catalogName: null,
      productCount: 0,
    };
  },
};
