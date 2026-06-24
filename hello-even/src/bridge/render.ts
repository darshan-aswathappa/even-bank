// Centralized, serialized bridge writes. All render calls must go through here
// so they never overlap on the BLE link (concurrent writes can crash the
// connection). createStartUpPageContainer is called exactly once at startup.

import {
  type EvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerUpgrade,
  type TextContainerProperty,
  type ListContainerProperty,
} from "@evenrealities/even_hub_sdk";

export interface PageContainers {
  text?: TextContainerProperty[];
  list?: ListContainerProperty[];
}

let bridge: EvenAppBridge;
let chain: Promise<unknown> = Promise.resolve();

export function initRender(b: EvenAppBridge): void {
  bridge = b;
}

function total(c: PageContainers): number {
  return (c.text?.length ?? 0) + (c.list?.length ?? 0);
}

// Queue a bridge write; failures are logged, never thrown (keeps the chain alive).
function enqueue(fn: () => Promise<unknown>): void {
  chain = chain.then(fn).catch((err) => console.error("bridge write failed:", err));
}

// One-shot startup page. Returns the StartUpPageCreateResult code (0 = success).
export async function createPage(c: PageContainers): Promise<number> {
  return bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: total(c),
      textObject: c.text,
      listObject: c.list,
    }),
  );
}

// Full redraw — used when the page structure changes (screen/list switches).
export function rebuild(c: PageContainers): void {
  enqueue(() =>
    bridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: total(c),
        textObject: c.text,
        listObject: c.list,
      }),
    ),
  );
}

// Flicker-free in-place text update — used for same-structure refreshes.
export function upgradeText(
  containerID: number,
  containerName: string,
  content: string,
): void {
  enqueue(() =>
    bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID,
        containerName,
        contentOffset: 0,
        contentLength: 0,
        content,
      }),
    ),
  );
}
