import type { SelectionAction } from "./actions";
import type { Annotation, Selection } from "../contract";

export type ReviewEditorRequest =
  | { mode: "create"; selection: Selection; action?: SelectionAction }
  | { mode: "edit"; threadId: string; annotation: Annotation };

let current: ReviewEditorRequest | null = null;
const listeners = new Set<() => void>();

export const reviewEditorStore = {
  getSnapshot: () => current,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  open(request: ReviewEditorRequest) {
    current = request;
    for (const listener of listeners) listener();
  },
  close() {
    if (current === null) return;
    current = null;
    for (const listener of listeners) listener();
  },
};
