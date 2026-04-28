export async function syncCatalog(_dealershipId: number): Promise<any> {
  return { success: false, errors: ["facebook_catalog_not_configured"] };
}

export const facebookCatalogService = {
  async syncVehiclesToCatalog(): Promise<{ success: false; created: 0; updated: 0; deleted: 0; errors: string[] }> {
    return {
      success: false,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: ["facebook_catalog_not_configured"],
    };
  },
};
