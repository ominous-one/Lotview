export function createContactMessagingService(_dealershipId: number): {
  sendMessage(params: Record<string, unknown>): Promise<any>;
  generateAiMessageSuggestion(params: Record<string, unknown>): Promise<any>;
} {
  return {
    async sendMessage() {
      return { success: false, error: "Contact messaging is not configured", messageId: undefined, externalMessageId: undefined };
    },
    async generateAiMessageSuggestion() {
      return { success: false, error: "Contact messaging is not configured", suggestion: "" };
    },
  };
}
