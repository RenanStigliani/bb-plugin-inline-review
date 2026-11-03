// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mountActionMenu } from "../lib/action-menu";
import { defaultActions, takeSelectionAction } from "../lib/actions";
const mountSelectionMenuPreferences = (preferences: { showNative: boolean; showFeedback: boolean; feedbackFirst: boolean }) => {
  const actions = defaultActions.slice(0, 2).map((action) => ({ ...action,
    placement: (action.kind === "native" ? preferences.showNative : preferences.showFeedback) ? "inline" as const : "hidden" as const,
  }));
  return mountActionMenu(preferences.feedbackFirst ? actions.reverse() : actions);
};

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});

function menu() {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-radix-popper-content-wrapper", "");
  wrapper.innerHTML = `<div data-state="open"><div data-action="native"><button class="select-none">Add to chat</button></div><div data-action="feedback"><span aria-hidden="true"></span><button class="select-none">Feedback</button></div></div>`;
  document.body.append(wrapper);
  return {
    root: wrapper.firstElementChild as HTMLElement,
    native: wrapper.querySelector<HTMLElement>('[data-action="native"]')!,
    feedback: wrapper.querySelector<HTMLElement>('[data-action="feedback"]')!,
  };
}

describe("selection menu preferences", () => {
  it.each([
    [true, true], [false, true], [true, false], [false, false],
  ])("shows native=%s and feedback=%s without hiding other actions", (showNative, showFeedback) => {
    const elements = menu();
    dispose = mountSelectionMenuPreferences({ showNative, showFeedback, feedbackFirst: false });
    expect(elements.native.style.display).toBe(showNative ? "flex" : "none");
    expect(elements.feedback.style.display).toBe(showFeedback ? "flex" : "none");
    expect(elements.root.style.display).toBe(showNative || showFeedback ? "" : "none");
  });

  it("puts Feedback first and restores styles when disabled", () => {
    const elements = menu();
    dispose = mountSelectionMenuPreferences({ showNative: true, showFeedback: true, feedbackFirst: true });
    expect(elements.feedback.style.order).toBe("0");
    expect(elements.native.style.order).toBe("1");
    dispose();
    expect(elements.feedback.style.order).toBe("");
    expect(elements.native.style.order).toBe("");
  });

  it("applies preferences to newly opened menus", async () => {
    dispose = mountSelectionMenuPreferences({ showNative: false, showFeedback: true, feedbackFirst: false });
    const elements = menu();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(elements.native.style.display).toBe("none");
    expect(elements.feedback.querySelector("span")!.style.display).toBe("none");
  });

  it("leaves other popovers and message action bars unchanged", () => {
    document.body.innerHTML = '<div data-radix-popper-content-wrapper><div data-state="open"><button>Feedback</button></div></div><div><button class="select-none">Feedback</button></div>';
    dispose = mountSelectionMenuPreferences({ showNative: false, showFeedback: false, feedbackFirst: true });
    expect(document.querySelectorAll('[style*="none"]')).toHaveLength(0);
  });
});


it("adds custom actions and proxies overflow choices through the captured Feedback action", () => {
  const elements = menu();
  let selected: string | undefined;
  elements.feedback.querySelector("button")!.addEventListener("click", () => { selected = takeSelectionAction()?.id; });
  dispose = mountActionMenu(defaultActions.map((action) => ({ ...action, placement: action.id === "agree" ? "inline" : action.placement })));
  const agree = Array.from(elements.root.querySelectorAll("button")).find((button) => button.textContent === "Agree")!;
  agree.click();
  expect(selected).toBe("agree");
  const more = elements.root.querySelector<HTMLButtonElement>('[aria-label="More actions"]')!;
  const panel = elements.root.querySelector<HTMLElement>('[role="menu"]')!;
  more.getBoundingClientRect = () => ({ right: 600, top: 100, bottom: 120 }) as DOMRect;
  panel.getBoundingClientRect = () => ({ width: 200, height: 100 }) as DOMRect;
  more.click();
  expect(panel.style.inset).toBe("auto");
  expect(panel.style.left).toBe("400px");
  expect(panel.style.top).toBe("126px");
  expect(panel.hidden).toBe(false);
  const child = Array.from(panel.querySelectorAll("button")).find((button) => button.textContent === "Do in a new bb thread")!;
  child.click();
  expect(selected).toBe("new-thread");
  expect(panel.hidden).toBe(true);
  dispose();
  expect(elements.root.querySelector('[aria-label="More actions"]')).toBeNull();
  expect(elements.root.children).toHaveLength(2);
});


it("has no leading divider when the native action is hidden and More is available", () => {
  const elements = menu();
  dispose = mountActionMenu(defaultActions.map((action) => ({ ...action, placement: action.id === "native" ? "hidden" : action.id === "agree" ? "inline" : action.placement })));
  const visibleSeparators = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>(':scope > span[aria-hidden="true"]')).filter((separator) => separator.style.display !== "none");
  expect(visibleSeparators(elements.feedback)).toHaveLength(0);
  const agreeRow = Array.from(elements.root.children).find((row) => row.querySelector(":scope > button")?.textContent === "Agree") as HTMLElement;
  expect(visibleSeparators(agreeRow)).toHaveLength(1);
  const moreRow = elements.root.querySelector('[aria-label="More actions"]')!.parentElement!;
  expect(visibleSeparators(moreRow)).toHaveLength(1);
  expect(elements.root.querySelector('[role="menu"] > span')).toBeNull();
});
