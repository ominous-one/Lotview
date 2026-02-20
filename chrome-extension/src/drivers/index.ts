import { Platform, PlatformDriver } from "../types";
import { facebookDriver } from "./facebook";
import { kijijiDriver } from "./kijiji";
import { craigslistDriver } from "./craigslist";

const drivers: Record<Platform, PlatformDriver> = {
  facebook: facebookDriver,
  kijiji: kijijiDriver,
  craigslist: craigslistDriver,
};

export function getDriver(platform: Platform): PlatformDriver {
  const driver = drivers[platform];
  if (!driver) {
    throw new Error(`No driver found for platform: ${platform}`);
  }
  return driver;
}

export function getAllDrivers(): PlatformDriver[] {
  return Object.values(drivers);
}

export function isDriverImplemented(platform: Platform): boolean {
  return platform === "facebook";
}

export { facebookDriver, kijijiDriver, craigslistDriver };
