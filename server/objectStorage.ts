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

  async uploadVehicleImages(..._args: unknown[]): Promise<string[]> {
    throw new Error("Object storage is not configured");
  }

  async uploadLogoFromBuffer(..._args: unknown[]): Promise<never> {
    throw new Error("Object storage is not configured");
  }

  async deleteObject(..._args: unknown[]): Promise<void> {
    return;
  }
}
