export async function generateDescription(..._args: unknown[]): Promise<any> {
  return { success: false, error: "AI description generation is not configured", description: "" };
}

export async function generateBatchDescriptions(..._args: unknown[]): Promise<any> {
  return { success: false, error: "AI description generation is not configured", results: [] };
}
