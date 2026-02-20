import { PlatformDriver, PostJob } from "../types";

export const craigslistDriver: PlatformDriver = {
  platform: "craigslist",
  name: "Craigslist",
  urlPatterns: [
    "*://*.craigslist.org/post/*",
  ],

  async fillForm(_job: PostJob): Promise<void> {
    throw new Error(
      "Craigslist driver coming soon. Navigate to Facebook Marketplace to post vehicles."
    );
  },
};
