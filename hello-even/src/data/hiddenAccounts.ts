// Persists the set of account IDs the user has hidden from the glasses display.
// Written to localStorage so the preference survives app restarts.

const STORAGE_KEY = "even_hidden_account_ids";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function save(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage quota or private-mode restriction — best effort.
  }
}

let _hidden: Set<string> = load();
let _onChange: (() => void) | null = null;

export function setOnHiddenChange(fn: () => void): void {
  _onChange = fn;
}

export function isHidden(id: string): boolean {
  return _hidden.has(id);
}

export function toggleHidden(id: string): void {
  const next = new Set(_hidden);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  _hidden = next;
  save(next);
  _onChange?.();
}
