export async function uploadImage(_imageData: Buffer, _filename: string): Promise<never> {
  throw new Error("Object storage is not configured");
}

export class ObjectStorageService {
  async searchPublicObject(_filePath: string): Promise<null> {
    return null;
  }

  downloadObject(_file: unknown, _res: unknown): never {
    throw new Error("Object storage is not configured");
  }

  async uploadVehicleImages(): Promise<string[]> {
    throw new Error("Object storage is not configured");
  }

  async uploadLogoFromBuffer(): Promise<never> {
    throw new Error("Object storage is not configured");
  }

  async deleteObject(): Promise<void> {
    return;
  }
}
