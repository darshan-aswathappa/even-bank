// Phone-side WebView UI for the Even Bank app. This renders into the app's DOM
// (#app) — the surface the wearer sees in the Even companion app (the
// simulator's "Browser" window) — while the glasses screens render separately
// via the bridge. It owns onboarding instructions and, once linked, the active
// accounts plus unlink/unpair actions.

import type { PairingStart } from "../data/pairing";
import type { Account, LinkedItem } from "../data/types";
import { UnauthorizedError } from "../data/bankApi";
import { getLinkedItems, unlinkItem, unpairGlasses } from "../data/manageApi";

export interface PhoneCallbacks {
  onUnpaired: () => void; // after the user unpairs — re-enter pairing
  onReauth: () => void; // a 401 means the token is gone — re-enter pairing
  onChanged: () => void; // a bank was unlinked — refresh the glasses too
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

// Onboarding: the wearer opens a browser, enters the code shown on the glasses,
// and links a bank. The code shown here matches the glasses display.
export function showOnboarding(start: PairingStart): void {
  const steps = el("ol", { class: "eb-steps" }, [
    el("li", {}, [
      "Open this page in your browser:",
      el("div", { class: "eb-url" }, [start.verificationUri]),
    ]),
    el("li", {}, [
      "Enter the pairing code shown on your glasses:",
      el("div", { class: "eb-code" }, [start.userCode]),
    ]),
    el("li", {}, ["Securely connect your bank account with Plaid."]),
  ]);
  mount(
    el("div", { class: "eb-card" }, [
      el("h1", { class: "eb-center" }, ["Set up Even Bank"]),
      el("p", { class: "eb-dim eb-center" }, ["Link a bank to see your balances on your glasses."]),
      steps,
    ]),
  );
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

  const unpair = el("button", { class: "eb-btn eb-danger" }, ["Unpair glasses"]);
  unpair.addEventListener("click", () => onUnpair(unpair));
  children.push(el("div", { class: "eb-spacer" }), unpair);

  mount(el("div", { class: "eb-card" }, children));
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
  const unlink = el("button", { class: "eb-unlink" }, ["Unlink"]);
  unlink.addEventListener("click", () => onUnlink(item.itemId, unlink));
  head.append(unlink);

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

async function onUnlink(itemId: string, btn: HTMLElement): Promise<void> {
  btn.setAttribute("disabled", "true");
  try {
    await unlinkItem(itemId);
  } catch (err) {
    btn.removeAttribute("disabled");
    if (err instanceof UnauthorizedError) return cb.onReauth();
    btn.textContent = "Retry";
    return;
  }
  cb.onChanged(); // refresh glasses balances
  void showLinked(); // refresh the dashboard
}

async function onUnpair(btn: HTMLElement): Promise<void> {
  btn.setAttribute("disabled", "true");
  try {
    await unpairGlasses();
  } catch (err) {
    btn.removeAttribute("disabled");
    if (err instanceof UnauthorizedError) return cb.onUnpaired();
    btn.textContent = "Retry";
    return;
  }
  cb.onUnpaired(); // device token revoked — re-enter pairing
}

// ---- Styles ---------------------------------------------------------------

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
    :root { color-scheme: dark; }
    body { margin: 0; }
    .eb-wrap {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #111; color: #fff; padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: -0.01em;
    }
    .eb-card { background: #1a1a1a; border-radius: 16px; padding: 28px 22px; max-width: 400px; width: 100%; }
    .eb-center { text-align: center; }
    .eb-card h1 { font-size: 23px; font-weight: 600; margin: 0 0 8px; }
    .eb-card p { font-size: 15px; line-height: 1.45; margin: 0 0 18px; }
    .eb-dim { color: #8a8a8a; }
    .eb-btn {
      appearance: none; border: none; border-radius: 10px; background: #fef991; color: #111;
      font-size: 16px; font-weight: 600; padding: 14px 20px; width: 100%; cursor: pointer;
    }
    .eb-btn[disabled] { opacity: 0.4; cursor: default; }
    .eb-danger { background: transparent; color: #ff6b6b; border: 1px solid #2a2a2a; }
    .eb-spacer { height: 10px; }
    .eb-steps { margin: 4px 0 18px; padding: 0; list-style: none; counter-reset: step; }
    .eb-steps li {
      counter-increment: step; position: relative; padding: 0 0 18px 40px;
      color: #8a8a8a; font-size: 15px; line-height: 1.4;
    }
    .eb-steps li::before {
      content: counter(step); position: absolute; left: 0; top: -2px;
      width: 26px; height: 26px; border-radius: 50%; background: #0d0d0d; border: 1px solid #2a2a2a;
      color: #fef991; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600;
    }
    .eb-url { color: #fef991; font-size: 14px; margin-top: 6px; word-break: break-all; }
    .eb-code {
      color: #fff; font-size: 26px; font-weight: 700; letter-spacing: 0.18em; margin-top: 8px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
    }
    .eb-item { border: 1px solid #2a2a2a; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }
    .eb-item-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .eb-inst { font-size: 16px; font-weight: 600; }
    .eb-badge { font-size: 11px; color: #fff; background: #ff6b6b; border-radius: 6px; padding: 2px 7px; margin-left: 8px; font-weight: 600; }
    .eb-unlink {
      appearance: none; width: auto; padding: 6px 12px; font-size: 13px; background: transparent;
      color: #ff6b6b; border: 1px solid #2a2a2a; border-radius: 8px; cursor: pointer;
    }
    .eb-unlink[disabled] { opacity: 0.4; cursor: default; }
    .eb-acct { display: flex; align-items: baseline; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .eb-name { color: #fff; }
    .eb-mask { color: #8a8a8a; font-size: 12px; margin-left: 6px; }
    .eb-amt { color: #fff; font-variant-numeric: tabular-nums; }
  `;
  document.head.append(el("style", {}, [css]));
}
