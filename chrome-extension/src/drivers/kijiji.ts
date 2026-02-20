import { PlatformDriver, PostJob } from "../types";

export const kijijiDriver: PlatformDriver = {
  platform: "kijiji",
  name: "Kijiji",
  urlPatterns: [
    "*://*.kijiji.ca/p-post-ad.html*",
    "*://*.kijiji.ca/p-admarkt-post-ad/*",
  ],

  async fillForm(_job: PostJob): Promise<void> {
    throw new Error(
      "Kijiji driver coming soon. Navigate to Facebook Marketplace to post vehicles."
    );
  },
};
