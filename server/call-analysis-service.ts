export function getCallAnalysisService(_dealershipId: number): {
  processCallRecording(callRecordingId: number): Promise<boolean>;
} {
  return {
    async processCallRecording(_callRecordingId: number) {
      return false;
    },
  };
}

export async function seedDefaultCriteria(_dealershipId: number): Promise<void> {
  return undefined;
}
