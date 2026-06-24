// Holds the device token in memory + persists it via the Even bridge storage.
// The token is the glasses' per-user credential (Bearer) for the backend.

const STORAGE_KEY = "evenbank.deviceToken";

let token: string | null = null;

export function getDeviceToken(): string | null {
  return token;
}

export function setDeviceToken(value: string | null): void {
  token = value;
}

export interface StorageBridge {
  getLocalStorage(key: string): Promise<string>;
  setLocalStorage(key: string, value: string): Promise<boolean>;
}

export async function loadDeviceToken(bridge: StorageBridge): Promise<string | null> {
  try {
    const stored = await bridge.getLocalStorage(STORAGE_KEY);
    token = stored || null;
  } catch {
    token = null;
  }
  return token;
}

export async function persistDeviceToken(
  bridge: StorageBridge,
  value: string,
): Promise<void> {
  token = value;
  try {
    await bridge.setLocalStorage(STORAGE_KEY, value);
  } catch {
    // in-memory token still works for this session
  }
}

export async function clearDeviceToken(bridge: StorageBridge): Promise<void> {
  token = null;
  try {
    await bridge.setLocalStorage(STORAGE_KEY, "");
  } catch {
    /* ignore */
  }
}
