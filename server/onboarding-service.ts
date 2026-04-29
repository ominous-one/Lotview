export type OnboardingValidation = {
  valid: boolean;
  errors: string[];
};

export class OnboardingService {
  static validateInput(_input: unknown): OnboardingValidation {
    return { valid: false, errors: ["Onboarding service is not configured"] };
  }

  static async getRunStatus(_runId: number): Promise<null> {
    return null;
  }

  static async getAllRuns(): Promise<unknown[]> {
    return [];
  }

  async startOnboarding(_input: unknown, _userId: number): Promise<{ dealershipId: number; runId: number }> {
    throw new Error("Onboarding service is not configured");
  }
}

export const onboardingService = new OnboardingService();
