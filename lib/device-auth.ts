const STORAGE_JWK = "claw-dash:device-jwk";
const STORAGE_PUB = "claw-dash:device-pub";
const STORAGE_ID = "claw-dash:device-id";
const STORAGE_TOKENS = "claw-dash:device-tokens";

// ── Types ──

export interface DeviceIdentity {
  deviceId: string;
  publicKeyBase64Url: string;
  privateKey: CryptoKey;
}

export interface DeviceAuthPayloadParams {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
  version?: "v1" | "v2";
}

interface StoredTokenEntry {
  token: string;
  scopes: string[];
}

// ── Helpers ──

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Ed25519 raw public key is 32 bytes. The SPKI encoding wraps it with a
 * 12-byte prefix. We strip that prefix to get the raw key bytes.
 */
const ED25519_SPKI_PREFIX_LEN = 12;
const ED25519_RAW_KEY_LEN = 32;

async function exportRawPublicKey(key: CryptoKey): Promise<ArrayBuffer> {
  const spki = await crypto.subtle.exportKey("spki", key);
  const spkiBytes = new Uint8Array(spki);
  if (spkiBytes.length === ED25519_SPKI_PREFIX_LEN + ED25519_RAW_KEY_LEN) {
    return spkiBytes.slice(ED25519_SPKI_PREFIX_LEN).buffer;
  }
  return spki;
}

// ── Key Generation & Persistence ──

async function generateDeviceIdentity(): Promise<DeviceIdentity> {
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);

  const rawPub = await exportRawPublicKey(keyPair.publicKey);
  const publicKeyBase64Url = toBase64Url(rawPub);
  const deviceId = await sha256Hex(rawPub);

  const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  try {
    localStorage.setItem(STORAGE_JWK, JSON.stringify(jwk));
    localStorage.setItem(STORAGE_PUB, publicKeyBase64Url);
    localStorage.setItem(STORAGE_ID, deviceId);
  } catch {}

  return { deviceId, publicKeyBase64Url, privateKey: keyPair.privateKey };
}

async function loadDeviceIdentity(): Promise<DeviceIdentity | null> {
  try {
    const jwkStr = localStorage.getItem(STORAGE_JWK);
    const pub = localStorage.getItem(STORAGE_PUB);
    const id = localStorage.getItem(STORAGE_ID);
    if (!jwkStr || !pub || !id) return null;

    const jwk = JSON.parse(jwkStr) as JsonWebKey;
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      "Ed25519",
      false,
      ["sign"]
    );
    return { deviceId: id, publicKeyBase64Url: pub, privateKey };
  } catch {
    return null;
  }
}

export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = await loadDeviceIdentity();
  if (existing) return existing;
  return generateDeviceIdentity();
}

// ── Signing ──

/**
 * Build the pipe-delimited signing payload that the gateway expects.
 * Matches `buildDeviceAuthPayload` from the gateway SDK.
 */
export function buildDeviceAuthPayload(params: DeviceAuthPayloadParams): string {
  const version = params.version ?? (params.nonce ? "v2" : "v1");
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === "v2") base.push(params.nonce ?? "");
  return base.join("|");
}

export async function signPayload(
  privateKey: CryptoKey,
  payload: string
): Promise<string> {
  const data = new TextEncoder().encode(payload);
  const sig = await crypto.subtle.sign("Ed25519", privateKey, data);
  return toBase64Url(sig);
}

// ── Device Token Storage ──

function readTokenStore(): Record<
  string,
  Record<string, StoredTokenEntry>
> {
  try {
    const raw = localStorage.getItem(STORAGE_TOKENS);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeTokenStore(
  store: Record<string, Record<string, StoredTokenEntry>>
): void {
  try {
    localStorage.setItem(STORAGE_TOKENS, JSON.stringify(store));
  } catch {}
}

export function loadDeviceToken(
  deviceId: string,
  role: string
): string | null {
  const store = readTokenStore();
  return store[deviceId]?.[role]?.token ?? null;
}

export function storeDeviceToken(
  deviceId: string,
  role: string,
  token: string,
  scopes: string[]
): void {
  const store = readTokenStore();
  if (!store[deviceId]) store[deviceId] = {};
  store[deviceId][role] = { token, scopes };
  writeTokenStore(store);
}

export function clearDeviceAuth(): void {
  try {
    localStorage.removeItem(STORAGE_JWK);
    localStorage.removeItem(STORAGE_PUB);
    localStorage.removeItem(STORAGE_ID);
    localStorage.removeItem(STORAGE_TOKENS);
  } catch {}
}
