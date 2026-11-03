import { queueSelectionAction, type SelectionAction } from "./actions";

export function mountActionMenu(actions: SelectionAction[]) {
  const originals = new Map<HTMLElement, string>();
  const inserted = new Set<HTMLElement>();
  const initialized = new WeakSet<HTMLElement>();
  const cleanups = new Map<HTMLElement, () => void>();
  const remember = (element: HTMLElement) => {
    if (!originals.has(element)) originals.set(element, element.style.cssText);
  };
  const update = () => {
    for (const menu of document.querySelectorAll<HTMLElement>('[data-radix-popper-content-wrapper] [data-state="open"]')) {
      if (initialized.has(menu)) continue;
      const rows = Array.from(menu.children) as HTMLElement[];
      const entries = rows.map((row) => ({ row, button: row.querySelector<HTMLButtonElement>(":scope > button") }));
      if (!entries.length || entries.some(({ button }) => !button?.classList.contains("select-none"))) continue;
      const native = entries.find(({ button }) => button?.textContent?.trim() === "Add to chat");
      const feedback = entries.find(({ button }) => button?.textContent?.trim() === "Feedback");
      if (!native && !feedback) continue;
      initialized.add(menu);
      remember(menu);
      const more: { action: SelectionAction; run: () => void }[] = [];
      let inlineCount = 0;
      const addButton = (label: string, run: () => void) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        const button = document.createElement("button");
        button.type = "button";
        button.className = feedback?.button?.className ?? native!.button!.className;
        button.textContent = label;
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", run);
        row.append(button);
        menu.append(row);
        inserted.add(row);
        return row;
      };
      const nativeRows = new Set([native?.row, feedback?.row]);
      actions.forEach((action, index) => {
        const entry = action.kind === "native" ? native : action.kind === "feedback" ? feedback : undefined;
        const run = () => {
          if (action.kind === "native") native?.button?.click();
          else {
            if (!feedback?.button) return;
            queueSelectionAction(action);
            feedback.button.click();
          }
        };
        let row = entry?.row;
        if (!row && action.kind === "custom" && feedback) row = addButton(action.label, run);
        if (!row) return;
        remember(row);
        row.style.order = String(index);
        row.style.display = action.placement === "inline" ? "flex" : "none";
        row.querySelectorAll<HTMLElement>(':scope > span[aria-hidden="true"]').forEach((separator) => {
          remember(separator);
          separator.style.display = "none";
        });
        if (action.placement === "inline") inlineCount += 1;
        if (action.placement === "more") more.push({ action, run });
      });
      for (const { row } of entries) {
        if (!nativeRows.has(row)) {
          remember(row);
          row.style.order = String(actions.length);
          inlineCount += 1;
        }
      }
      if (more.length) {
        const panel = document.createElement("div");
        panel.setAttribute("popover", "manual");
        panel.setAttribute("role", "menu");
        panel.setAttribute("aria-label", "More selection actions");
        panel.style.cssText = "position:fixed;inset:auto;margin:0;box-sizing:border-box;width:max-content;height:auto;padding:4px;border:1px solid var(--border);border-radius:6px;background:var(--popover);color:var(--popover-foreground);box-shadow:0 4px 12px #0003;z-index:2147483647;min-width:180px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow-y:auto;";
        panel.hidden = true;
        let frame: number | undefined;
        const stopTracking = () => {
          if (frame !== undefined) window.cancelAnimationFrame(frame);
          frame = undefined;
        };
        const placePanel = () => {
          if (panel.hidden || !menu.isConnected) { stopTracking(); return; }
          const rect = row.querySelector("button")!.getBoundingClientRect();
          const box = panel.getBoundingClientRect();
          panel.style.left = `${Math.max(8, Math.min(rect.right - box.width, window.innerWidth - box.width - 8))}px`;
          panel.style.top = `${Math.max(8, rect.bottom + box.height + 8 <= window.innerHeight ? rect.bottom + 6 : rect.top - box.height - 6)}px`;
          if (window.requestAnimationFrame) frame = window.requestAnimationFrame(placePanel);
        };
        cleanups.set(menu, stopTracking);
        const row = addButton("⋯", () => {
          if (!panel.hidden) { closePanel(); return; }
          panel.hidden = false;
          if (panel.showPopover) panel.showPopover();
          const nativeStyle = getComputedStyle(feedback?.button ?? native!.button!);
          panel.style.fontFamily = nativeStyle.fontFamily;
          panel.style.fontSize = nativeStyle.fontSize;
          panel.style.lineHeight = nativeStyle.lineHeight;
          panel.style.fontWeight = nativeStyle.fontWeight;
          const toolbarStyle = getComputedStyle(menu);
          panel.style.backgroundColor = toolbarStyle.backgroundColor;
          panel.style.color = toolbarStyle.color;
          panel.style.borderColor = toolbarStyle.borderColor;
          placePanel();
          row.querySelector("button")?.setAttribute("aria-expanded", "true");
          panel.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
        });
        row.style.order = String(actions.length + 1);
        const trigger = row.querySelector("button") as HTMLButtonElement;
        trigger.textContent = "";
        trigger.style.justifyContent = "center";
        trigger.style.minWidth = "24px";
        const dots = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        dots.setAttribute("viewBox", "0 0 24 24");
        dots.setAttribute("width", "14");
        dots.setAttribute("height", "14");
        dots.setAttribute("aria-hidden", "true");
        dots.style.cssText = "width:14px;height:14px;flex-shrink:0;";
        [5, 12, 19].forEach((x) => {
          const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          dot.setAttribute("cx", String(x)); dot.setAttribute("cy", "12"); dot.setAttribute("r", "1.5"); dot.setAttribute("fill", "currentColor");
          dots.append(dot);
        });
        trigger.append(dots);
        row.querySelector("button")?.setAttribute("aria-label", "More actions");
        row.querySelector("button")?.setAttribute("aria-haspopup", "menu");
        row.querySelector("button")?.setAttribute("aria-expanded", "false");
        const closePanel = () => {
          stopTracking();
          if (panel.hidePopover && !panel.hidden) panel.hidePopover();
          panel.hidden = true;
          row.querySelector("button")?.setAttribute("aria-expanded", "false");
        };
        more.forEach(({ action, run }) => {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute("role", "menuitem");
          button.textContent = action.label;
          button.style.cssText = "display:block;box-sizing:border-box;width:100%;text-align:left;padding:5px 8px;border:0;border-radius:3px;background:transparent;color:inherit;font:inherit;cursor:pointer;outline-offset:-2px;";
          button.addEventListener("mouseenter", () => { button.style.background = "var(--muted)"; });
          button.addEventListener("mouseleave", () => { button.style.background = "transparent"; });
          button.addEventListener("mousedown", (event) => event.preventDefault());
          button.addEventListener("click", () => { closePanel(); run(); });
          panel.append(button);
        });
        panel.addEventListener("keydown", (event) => {
          const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>("button"));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
          }
          if (event.key === "Escape") { event.stopPropagation(); closePanel(); (row.querySelector("button") as HTMLElement)?.focus(); }
        });
        menu.append(panel);
        inserted.add(panel);
        inlineCount += 1;
      }
      const visibleRows = Array.from(menu.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement && !child.hidden && child.getAttribute("role") !== "menu" && child.style.display !== "none" && child.querySelector(":scope > button") !== null)
        .sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0));
      visibleRows.forEach((row, index) => {
        row.querySelectorAll<HTMLElement>(':scope > span[aria-hidden="true"]').forEach((separator) => {
          remember(separator);
          separator.style.display = "none";
        });
        if (index === 0) return;
        const separator = document.createElement("span");
        separator.setAttribute("aria-hidden", "true");
        separator.style.cssText = "width:1px;height:16px;flex-shrink:0;align-self:center;margin:0 2px;background:var(--border);";
        row.prepend(separator);
        inserted.add(separator);
      });
      if (!inlineCount) menu.style.display = "none";
    }
    for (const [menu, cleanup] of cleanups) if (!menu.isConnected) { cleanup(); cleanups.delete(menu); }
    for (const element of originals.keys()) if (!element.isConnected) originals.delete(element);
    for (const element of inserted) if (!element.isConnected) inserted.delete(element);
  };
  const observer = new MutationObserver(update);
  observer.observe(document.body, { childList: true, subtree: true });
  update();
  return () => {
    observer.disconnect();
    for (const cleanup of cleanups.values()) cleanup();
    for (const element of inserted) element.remove();
    for (const [element, style] of originals) element.style.cssText = style;
  };
}
