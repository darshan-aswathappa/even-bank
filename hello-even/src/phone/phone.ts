// Phone-side WebView UI for the Even Bank app. This renders into the app's DOM
// (#app) — the surface the wearer sees in the Even companion app (the
// simulator's "Browser" window) — while the glasses screens render separately
// via the bridge. It owns onboarding instructions and, once linked, the active
// accounts plus unlink/unpair actions.

import type { PairingStart } from "../data/pairing";
import type { Account, LinkedItem } from "../data/types";
import { UnauthorizedError } from "../data/bankApi";
import { getLinkedItems, unpairGlasses } from "../data/manageApi";

export interface PhoneCallbacks {
  onUnpaired: () => void; // after unlink & unpair — re-enter pairing
  onReauth: () => void; // a 401 means the token is gone — re-enter pairing
}

let root: HTMLElement | null = null;
let cb: PhoneCallbacks;

export function initPhone(callbacks: PhoneCallbacks): void {
  cb = callbacks;
  root = document.getElementById("app");
  injectStyles();
  showLoading("Starting…");
}

// ---- DOM helpers ----------------------------------------------------------

type Attrs = Record<string, string>;
function el(tag: string, attrs: Attrs = {}, children: (Node | string)[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
}

function mount(card: HTMLElement): void {
  if (!root) return;
  root.replaceChildren(el("div", { class: "eb-wrap" }, [card]));
}

function fmtMoney(amount: number | null, currency: string | null): string {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

// ---- Screens --------------------------------------------------------------

export function showLoading(msg = "Loading…"): void {
  mount(
    el("div", { class: "eb-card eb-center" }, [
      el("h1", {}, ["Even Bank"]),
      el("p", { class: "eb-dim" }, [msg]),
    ]),
  );
}

// Onboarding: the setup page must run in a REAL phone browser — Plaid Link can't
// load in a WebView-in-WebView (this companion-app UI is itself a WebView). So we
// give the wearer a copyable setup link with the pairing code baked in; pasting
// it into any browser opens the onboarding page with the code already filled.
export function showOnboarding(start: PairingStart): void {
  const setupUrl = `${start.verificationUri}?code=${encodeURIComponent(start.userCode)}`;

  const status = el("p", { class: "eb-fallback eb-center" }, []);
  const setNote = (msg: string) => {
    status.replaceChildren(document.createTextNode(msg));
  };

  const copy = el("button", { class: "eb-btn" }, ["Copy setup link"]);
  copy.addEventListener("click", () => void copyLink(setupUrl, setNote));

  mount(
    el("div", { class: "eb-card eb-center" }, [
      el("h1", {}, ["Set up Even Bank"]),
      el("p", { class: "eb-dim" }, [
        "Copy the setup link and open it in your phone's browser to link a bank — your pairing code is already included.",
      ]),
      copy,
      el("p", { class: "eb-fallback" }, [
        "Or open ",
        el("span", { class: "eb-fallback-url" }, [start.verificationUri]),
        " and enter ",
        el("span", { class: "eb-fallback-code" }, [start.userCode]),
      ]),
      status,
    ]),
  );
}

async function copyLink(url: string, note: (msg: string) => void): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = el("textarea") as HTMLTextAreaElement;
      ta.value = url;
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    note("Link copied — paste it into your browser.");
  } catch {
    note("Couldn't copy. Open the address shown above in your browser.");
  }
}

// Linked dashboard: fetch and render the active banks + actions.
export async function showLinked(): Promise<void> {
  showLoading("Loading your accounts…");
  let items: LinkedItem[];
  try {
    items = await getLinkedItems();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      cb.onReauth();
      return;
    }
    showError();
    return;
  }
  renderDashboard(items);
}

function renderDashboard(items: LinkedItem[]): void {
  const children: (Node | string)[] = [
    el("h1", { class: "eb-center" }, ["Your accounts"]),
  ];

  if (items.length === 0) {
    children.push(el("p", { class: "eb-dim eb-center" }, ["No banks linked."]));
  } else {
    children.push(el("p", { class: "eb-dim eb-center" }, ["Linked banks"]));
    for (const item of items) children.push(renderItem(item));
  }

  // One action covers both: removing the banks and unpairing the glasses are a
  // single "disconnect" from the wearer's point of view. It's gated behind an
  // inline confirm since it returns them to onboarding with a fresh code.
  children.push(el("div", { class: "eb-spacer" }), renderDisconnect());

  mount(el("div", { class: "eb-card" }, children));
}

// A footer that toggles in place between the single danger button and a
// confirm/cancel pair — no native dialog (blocked in the WebView host).
function renderDisconnect(): HTMLElement {
  const footer = el("div", {});

  const showConfirm = () => {
    const confirm = el("button", { class: "eb-btn eb-danger" }, ["Confirm — unlink & unpair"]);
    const cancel = el("button", { class: "eb-btn eb-secondary" }, ["Cancel"]);
    confirm.addEventListener("click", () => onUnlinkAndUnpair(confirm, cancel));
    cancel.addEventListener("click", showDefault);
    footer.replaceChildren(
      el("p", { class: "eb-fallback eb-center" }, [
        "This removes your linked banks and unpairs the glasses.",
      ]),
      confirm,
      el("div", { class: "eb-spacer" }),
      cancel,
    );
  };

  const showDefault = () => {
    const start = el("button", { class: "eb-btn eb-danger" }, ["Unlink & unpair"]);
    start.addEventListener("click", showConfirm);
    footer.replaceChildren(start);
  };

  showDefault();
  return footer;
}

function renderItem(item: LinkedItem): HTMLElement {
  const head = el("div", { class: "eb-item-head" }, [
    el("span", { class: "eb-inst" }, [item.institution || "Bank"]),
  ]);
  if (item.status && item.status !== "good") {
    head.append(
      el("span", { class: "eb-badge" }, [
        item.status === "login_required" ? "Reconnect" : "Error",
      ]),
    );
  }

  const rows = item.accounts.map((a: Account) =>
    el("div", { class: "eb-acct" }, [
      el("span", { class: "eb-name" }, [
        a.name,
        ...(a.mask ? [el("span", { class: "eb-mask" }, ["••" + a.mask])] : []),
      ]),
      el("span", { class: "eb-amt" }, [fmtMoney(a.available ?? a.current, a.currency)]),
    ]),
  );

  return el("div", { class: "eb-item" }, [head, ...rows]);
}

function showError(): void {
  const retry = el("button", { class: "eb-btn" }, ["Retry"]);
  retry.addEventListener("click", () => void showLinked());
  mount(
    el("div", { class: "eb-card eb-center" }, [
      el("h1", {}, ["Even Bank"]),
      el("p", { class: "eb-dim" }, ["Couldn't load your accounts."]),
      retry,
    ]),
  );
}

// ---- Actions --------------------------------------------------------------

// Unlink every bank and unpair in one server call, then re-enter pairing so the
// wearer lands back on onboarding with a fresh code.
async function onUnlinkAndUnpair(confirm: HTMLElement, cancel: HTMLElement): Promise<void> {
  confirm.setAttribute("disabled", "true");
  cancel.setAttribute("disabled", "true");
  confirm.textContent = "Disconnecting…";
  try {
    await unpairGlasses();
  } catch (err) {
    if (err instanceof UnauthorizedError) return cb.onUnpaired();
    confirm.removeAttribute("disabled");
    cancel.removeAttribute("disabled");
    confirm.textContent = "Retry";
    return;
  }
  cb.onUnpaired(); // banks removed + device token revoked — re-enter pairing
}

// ---- Styles ---------------------------------------------------------------

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  // Tokens, type scale and 4/8 spacing grid per the Even Hub phone-side
  // (Flutter WebView host) design system. Accent (#FEF991) is used only for
  // buttons/highlights, never as a page background.
  const css = `
    :root {
      color-scheme: dark;
      --eb-text: #FFFFFF;
      --eb-text-dim: #8A8A8A;
      --eb-bg: #111111;
      --eb-surface: #1A1A1A;
      --eb-accent: #FEF991;
      --eb-text-on-accent: #232323;
      --eb-danger: #FF6B6B;
      --eb-hairline: #2A2A2A;
      --eb-font: "FK Grotesk Neue", "Source Han Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body { margin: 0; }
    .eb-wrap {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: var(--eb-bg); color: var(--eb-text); padding: 20px;
      font-family: var(--eb-font);
    }
    .eb-card { background: var(--eb-surface); border-radius: 16px; padding: 32px 24px; max-width: 400px; width: 100%; }
    .eb-center { text-align: center; }
    .eb-card h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 8px; }
    .eb-card p { font-size: 16px; font-weight: 400; letter-spacing: -0.01em; line-height: 1.5; margin: 0 0 24px; }
    .eb-dim { color: var(--eb-text-dim); }
    .eb-btn {
      appearance: none; border: none; border-radius: 12px; background: var(--eb-accent); color: var(--eb-text-on-accent);
      font-family: var(--eb-font); font-size: 16px; font-weight: 600; letter-spacing: -0.01em;
      padding: 16px 24px; width: 100%; cursor: pointer;
    }
    .eb-btn[disabled] { opacity: 0.4; cursor: default; }
    .eb-secondary { background: transparent; color: var(--eb-text); border: 1px solid var(--eb-hairline); }
    .eb-danger { background: transparent; color: var(--eb-danger); border: 1px solid var(--eb-hairline); }
    .eb-spacer { height: 12px; }
    .eb-fallback { color: var(--eb-text-dim); font-size: 13px; line-height: 1.5; margin: 24px 0 0; }
    .eb-fallback-url { color: var(--eb-accent); word-break: break-all; }
    .eb-fallback-code {
      color: var(--eb-text); font-weight: 600; letter-spacing: 0.12em;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }
    .eb-item { border: 1px solid var(--eb-hairline); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
    .eb-item-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .eb-inst { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
    .eb-badge { font-size: 11px; font-weight: 500; letter-spacing: 0.04em; color: var(--eb-text); background: var(--eb-danger); border-radius: 6px; padding: 2px 8px; margin-left: 8px; }
    .eb-acct { display: flex; align-items: baseline; justify-content: space-between; padding: 8px 0; font-size: 16px; letter-spacing: -0.01em; }
    .eb-name { color: var(--eb-text); }
    .eb-mask { color: var(--eb-text-dim); font-size: 13px; margin-left: 8px; }
    .eb-amt { color: var(--eb-text); font-variant-numeric: tabular-nums; }
  `;
  document.head.append(el("style", {}, [css]));
}
