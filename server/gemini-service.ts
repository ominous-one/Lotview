type GeminiTestResult = {
  success: false;
  error: string;
  modelInfo?: { total: number };
};

export class GeminiService {
  static async getInstanceForDealership(_dealershipId: number): Promise<GeminiService | null> {
    return null;
  }

  async testConnection(): Promise<GeminiTestResult> {
    return { success: false, error: "Gemini service is not configured", modelInfo: { total: 0 } };
  }

  async generateVehicleVideoPrompt(..._args: unknown[]): Promise<any> {
    return { success: false, error: "Gemini service is not configured" };
  }

  async generateVideo(..._args: unknown[]): Promise<any> {
    return { success: false, error: "Gemini service is not configured" };
  }
}
