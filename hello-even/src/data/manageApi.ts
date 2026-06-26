// Phone-side (WebView) management calls. These run in the same web app as the
// glasses bridge and reuse the glasses' device token, so the phone UI can list
// linked banks, unlink one, and unpair the glasses.

import { API_BASE_URL, REQUEST_TIMEOUT_MS, DEV_MODE } from "../config";
import { getDeviceToken } from "./session";
import { DEV_ACCOUNTS } from "./fixtures";
import { UnauthorizedError } from "./bankApi";
import type { LinkedItem, ManageAccountsResponse } from "./types";

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = getDeviceToken();
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 401) throw new UnauthorizedError(`401 for ${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// Linked banks + their accounts. In dev mode, synthesize one item from fixtures.
export async function getLinkedItems(): Promise<LinkedItem[]> {
  if (DEV_MODE) {
    return [
      { itemId: "dev", institution: "Dev Bank", status: "good", accounts: DEV_ACCOUNTS },
    ];
  }
  return (await apiFetch<ManageAccountsResponse>("/manage/accounts")).items;
}

export async function unpairGlasses(): Promise<void> {
  if (DEV_MODE) return;
  await apiFetch("/manage/device", { method: "DELETE" });
}
