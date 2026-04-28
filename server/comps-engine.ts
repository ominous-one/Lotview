export async function getAppraisalComps(_params: Record<string, unknown>): Promise<{
  success: false;
  error: string;
  comps: unknown[];
}> {
  return { success: false, error: "Comps engine is not configured", comps: [] };
}
