async function generateKey(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getOrCreateSigningKey(): Promise<string> {
  const stored = await chrome.storage.local.get(["signingKey"]) as { signingKey?: string };
  if (stored.signingKey && typeof stored.signingKey === "string" && stored.signingKey.length === 64) {
    return stored.signingKey;
  }
  const newKey = await generateKey();
  await chrome.storage.local.set({ signingKey: newKey });
  return newKey;
}

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  const stored = await chrome.storage.local.get(["encKeyRaw"]) as { encKeyRaw?: string };
  
  if (stored.encKeyRaw) {
    const rawKey = Uint8Array.from(atob(stored.encKeyRaw), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }
  
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const exported = await crypto.subtle.exportKey("raw", key);
  const base64Key = btoa(String.fromCharCode(...new Uint8Array(exported)));
  await chrome.storage.local.set({ encKeyRaw: base64Key });
  return key;
}

export async function encryptToken(token: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(token));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(encryptedToken: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const combined = Uint8Array.from(atob(encryptedToken), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const messageData = encoder.encode(message);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

interface SignedHeaders {
  "X-Timestamp": string;
  "X-Nonce": string;
  "X-Signature": string;
}

export async function signRequest(
  method: string,
  endpoint: string,
  body: string | null,
  token: string
): Promise<SignedHeaders> {
  const timestamp = getTimestamp();
  const nonce = generateNonce();
  
  const signingKey = await getOrCreateSigningKey();
  
  const parts = [
    method.toUpperCase(),
    endpoint,
    timestamp.toString(),
    nonce,
    token,
    body || "",
  ];
  const payload = parts.join("\n");
  
  const signature = await hmacSha256(signingKey, payload);
  
  return {
    "X-Timestamp": timestamp.toString(),
    "X-Nonce": nonce,
    "X-Signature": signature,
  };
}

const NONCE_EXPIRY_MS = 5 * 60 * 1000;
const usedNonces = new Map<string, number>();

export function isNonceValid(nonce: string, timestamp: number): boolean {
  const now = Date.now();
  const requestTime = timestamp * 1000;
  
  if (Math.abs(now - requestTime) > NONCE_EXPIRY_MS) {
    return false;
  }
  
  if (usedNonces.has(nonce)) {
    return false;
  }
  
  usedNonces.set(nonce, now);
  
  for (const [key, time] of usedNonces.entries()) {
    if (now - time > NONCE_EXPIRY_MS) {
      usedNonces.delete(key);
    }
  }
  
  return true;
}
