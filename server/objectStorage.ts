import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }
    return null;
  }

  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
      });

      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async uploadLogoFromBuffer(buffer: Buffer, dealershipId: number, mimeType: string): Promise<string> {
    const publicPaths = this.getPublicObjectSearchPaths();
    if (publicPaths.length === 0) {
      throw new Error("No public object storage paths configured");
    }

    const publicPath = publicPaths[0];
    const objectId = randomUUID();
    
    const extensionMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      'image/x-icon': 'ico',
      'image/vnd.microsoft.icon': 'ico',
    };
    const extension = extensionMap[mimeType] || 'png';
    
    const relativePath = `logos/dealership-${dealershipId}-${objectId}.${extension}`;
    const fullPath = `${publicPath}/${relativePath}`;
    
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buffer, {
      contentType: mimeType,
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });

    await setObjectAclPolicy(file, {
      owner: `dealership-${dealershipId}`,
      visibility: 'public',
    });

    return `/public-objects/${relativePath}`;
  }

  async uploadVehicleImage(buffer: Buffer, dealershipId: number, vehicleId: number, imageIndex: number, mimeType: string): Promise<string> {
    const publicPaths = this.getPublicObjectSearchPaths();
    if (publicPaths.length === 0) {
      throw new Error("No public object storage paths configured");
    }

    const publicPath = publicPaths[0];
    
    const extensionMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    const extension = extensionMap[mimeType] || 'jpg';
    
    const relativePath = `vehicles/${dealershipId}/${vehicleId}/image-${imageIndex.toString().padStart(2, '0')}.${extension}`;
    const fullPath = `${publicPath}/${relativePath}`;
    
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buffer, {
      contentType: mimeType,
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });

    await setObjectAclPolicy(file, {
      owner: `dealership-${dealershipId}`,
      visibility: 'public',
    });

    return `/public-objects/${relativePath}`;
  }

  async uploadVehicleImages(cdnUrls: string[], dealershipId: number, vehicleId: number): Promise<string[]> {
    const localUrls: string[] = [];
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.autotrader.ca/',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };
    
    // Helper to generate fallback URLs - strips query params which is where maximizeImageUrl adds transforms
    const generateFallbackUrls = (url: string): string[] => {
      const fallbacks: string[] = [];
      
      // Primary fallback: strip query params entirely (reverses autotradercdn/cargurus/cloudinary transforms)
      if (url.includes('?')) {
        fallbacks.push(url.split('?')[0]);
      }
      
      // Dedupe
      return [...new Set(fallbacks)].filter(f => f !== url);
    };
    
    // Helper to validate response is actually an image (uses global fetch Response, not express Response)
    const isValidImageResponse = (contentType: string, buffer: Buffer): boolean => {
      
      // Must be an image content type
      if (!contentType.startsWith('image/')) {
        return false;
      }
      
      // Must be reasonably sized (> 1KB to filter out error pages/placeholders)
      if (buffer.length < 1024) {
        return false;
      }
      
      return true;
    };
    
    for (let i = 0; i < cdnUrls.length; i++) {
      const cdnUrl = cdnUrls[i];
      try {
        // Try the provided URL first
        let response = await fetch(cdnUrl, { headers: fetchHeaders });
        let usedUrl = cdnUrl;
        let buffer: Buffer | null = null;
        let isValid = false;

        // Check if response is OK and actually an image
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          const contentType = response.headers.get('content-type') || '';
          isValid = isValidImageResponse(contentType, buffer);
          
          if (!isValid) {
            console.log(`[ObjectStorage] Image ${i} for vehicle ${vehicleId}: Response not valid image, trying fallbacks`);
          }
        }

        // If error status or invalid content, try fallback URLs
        if (!response.ok || !isValid) {
          const statusOrReason = response.ok ? 'invalid content' : response.status;
          console.log(`[ObjectStorage] Image ${i} for vehicle ${vehicleId}: ${statusOrReason} on primary URL, trying fallbacks`);
          
          const fallbackUrls = generateFallbackUrls(cdnUrl);
          
          for (const fallbackUrl of fallbackUrls) {
            try {
              response = await fetch(fallbackUrl, { headers: fetchHeaders });
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                buffer = Buffer.from(arrayBuffer);
                const contentType = response.headers.get('content-type') || '';
                if (isValidImageResponse(contentType, buffer)) {
                  usedUrl = fallbackUrl;
                  isValid = true;
                  console.log(`[ObjectStorage] Image ${i} for vehicle ${vehicleId}: Success with fallback`);
                  break;
                }
              }
            } catch {
              // Continue to next fallback
            }
          }
        }

        if (!isValid || !buffer) {
          console.error(`Failed to fetch image ${i} for vehicle ${vehicleId}: no valid image found`);
          continue;
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const localUrl = await this.uploadVehicleImage(buffer, dealershipId, vehicleId, i, contentType);
        localUrls.push(localUrl);
      } catch (error) {
        console.error(`Error uploading image ${i} for vehicle ${vehicleId}:`, error);
      }
    }

    return localUrls;
  }

  async deleteVehicleImages(dealershipId: number, vehicleId: number): Promise<void> {
    try {
      const publicPaths = this.getPublicObjectSearchPaths();
      if (publicPaths.length === 0) return;

      const publicPath = publicPaths[0];
      const prefix = `vehicles/${dealershipId}/${vehicleId}/`;
      const { bucketName, objectName: basePath } = parseObjectPath(`${publicPath}/${prefix}`);
      const bucket = objectStorageClient.bucket(bucketName);

      const [files] = await bucket.getFiles({ prefix: basePath });
      for (const file of files) {
        await file.delete();
      }
    } catch (error) {
      console.error(`Error deleting vehicle images for ${vehicleId}:`, error);
    }
  }

  async deleteObject(objectPath: string): Promise<void> {
    try {
      if (objectPath.startsWith('/public-objects/')) {
        const relativePath = objectPath.replace('/public-objects/', '');
        const publicPaths = this.getPublicObjectSearchPaths();
        
        for (const searchPath of publicPaths) {
          const fullPath = `${searchPath}/${relativePath}`;
          const { bucketName, objectName } = parseObjectPath(fullPath);
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          const [exists] = await file.exists();
          if (exists) {
            await file.delete();
            return;
          }
        }
      }
    } catch (error) {
      console.error("Error deleting object:", error);
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}
