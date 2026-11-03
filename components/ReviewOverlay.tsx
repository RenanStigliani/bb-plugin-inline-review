import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  useBbContext,
  useRealtime,
  useRpc,
  type ExperimentalAppOverlayProps,
} from "@get-bb/plugin-sdk/app";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { rpcContract } from "../contract";
import { defaultActions, type SelectionAction } from "../lib/actions";
import { mountActionMenu } from "../lib/action-menu";
import { reviewEditorStore } from "../lib/editor-store";
import { reviewHighlights } from "../lib/review-highlights";
import { AnnotationEditor } from "./AnnotationEditor";
import { Button } from "./ui/button";

function useVisibleMobileViewport(open: boolean): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();

  useEffect(() => {
    if (!open) {
      setStyle(undefined);
      return;
    }
    const viewport = window.visualViewport;
    const mobile = window.matchMedia?.("(max-width: 639px)");
    const update = () => {
      if (!viewport || !mobile?.matches) {
        setStyle(undefined);
        return;
      }
      setStyle({
        top: `calc(${viewport.offsetTop}px + max(0.75rem, env(safe-area-inset-top)))`,
        bottom: "auto",
        maxHeight: `max(11.25rem, calc(${viewport.height}px - max(1rem, env(safe-area-inset-top)) - 0.5rem))`,
      });
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    mobile?.addEventListener("change", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      mobile?.removeEventListener("change", update);
    };
  }, [open]);

  return style;
}

function useEditorPosition(request: ReturnType<typeof reviewEditorStore.getSnapshot>, ref: { current: HTMLElement | null }) {
  useLayoutEffect(() => {
    const editor = ref.current;
    if (!request || !editor) return;
    const range = reviewHighlights.getEditorRange(request);
    const update = () => {
      if (window.matchMedia?.("(max-width: 639px)").matches) return;
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const bounds = range?.startContainer.isConnected ? range.getBoundingClientRect?.() : null;
      const box = editor.getBoundingClientRect();
      const gap = 8;
      const x = bounds?.left ?? left + (width - box.width) / 2;
      const below = bounds ? bounds.bottom + gap : top + (height - box.height) / 2;
      const y = bounds && below + box.height > top + height - gap
        ? bounds.top - box.height - gap
        : below;
      editor.style.left = `${Math.max(left + gap, Math.min(x, left + width - box.width - gap))}px`;
      editor.style.top = `${Math.max(top + gap, Math.min(y, top + height - box.height - gap))}px`;
      editor.style.right = "auto";
      editor.style.bottom = "auto";
    };
    editor.showPopover?.();
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(editor);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      editor.hidePopover?.();
    };
  }, [request, ref]);
}

export function ReviewOverlay(_props: ExperimentalAppOverlayProps) {
  const request = useSyncExternalStore(
    reviewEditorStore.subscribe,
    reviewEditorStore.getSnapshot,
    reviewEditorStore.getSnapshot,
  );
  const rpc = useRpc<typeof rpcContract>();
  const [actions, setActions] = useState<SelectionAction[]>(defaultActions);
  useEffect(() => {
    let active = true;
    void rpc.call("getActions", {}).then((next) => { if (active) setActions(next); }).catch(() => {});
    return () => { active = false; };
  }, [rpc]);
  useRealtime("actions-changed", () => {
    void rpc.call("getActions", {}).then(setActions).catch(() => {});
  });
  useEffect(() => mountActionMenu(actions), [actions]);
  const directInvocation = useRef<string | null>(null);
  useEffect(() => {
    if (request?.mode !== "create" || request.action?.behavior !== "send") return;
    if (directInvocation.current === request.selection.invocationId) return;
    directInvocation.current = request.selection.invocationId;
    void rpc.call("sendSelectionAction", { actionId: request.action.id, selection: request.selection })
      .then((result) => toast.success(`Feedback submitted (${result.delivery}).`))
      .catch((error: unknown) => toast.error("Could not send feedback", {
        description: error instanceof Error ? error.message : String(error),
      }))
      .finally(() => {
        reviewHighlights.cancelSelection(request.selection.invocationId);
        if (reviewEditorStore.getSnapshot() === request) reviewEditorStore.close();
      });
  }, [request, rpc]);
  const { threadId: visibleThreadId } = useBbContext();
  const visibleThreadRef = useRef(visibleThreadId);
  visibleThreadRef.current = visibleThreadId;
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const editorRef = useRef<HTMLElement>(null);
  useEditorPosition(request, editorRef);
  const viewportStyle = useVisibleMobileViewport(request !== null);

  const loadHighlightDraft = useCallback(async () => {
    if (!visibleThreadId) return;
    const draft = await rpc.call("getDraft", { threadId: visibleThreadId });
    if (visibleThreadRef.current === visibleThreadId) reviewHighlights.setDraft(draft);
  }, [rpc, visibleThreadId]);

  useEffect(() => {
    if (!visibleThreadId) return;
    void loadHighlightDraft().catch(() => {
      if (visibleThreadRef.current === visibleThreadId) {
        reviewHighlights.deactivateThread(visibleThreadId);
      }
    });
    return () => reviewHighlights.deactivateThread(visibleThreadId);
  }, [loadHighlightDraft, visibleThreadId]);
  useRealtime("draft-changed", () => {
    void loadHighlightDraft().catch(() => {});
  });

  const close = () => {
    if (busy) return;
    if (request?.mode === "create") {
      reviewHighlights.cancelSelection(request.selection.invocationId);
    }
    reviewEditorStore.close();
  };

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request, busy]);

  if (!request || (request.mode === "create" && request.action?.behavior === "send")) return null;

  return createPortal(
    <section
      data-bb-plugin="inline-review-local"
      ref={editorRef}
      popover={typeof HTMLElement.prototype.showPopover === "function" ? "manual" : undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      style={{ margin: 0, zIndex: 2147483647, minWidth: "min(24rem, calc(100vw - 1.5rem))", ...viewportStyle }}
      className="fixed left-3 right-3 top-[max(0.5rem,env(safe-area-inset-top))] bottom-auto max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-lg border border-border bg-background text-foreground p-3 text-xs shadow-xl sm:right-auto sm:w-[24rem] sm:max-w-[calc(100vw-1rem)]"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-sm font-semibold">
          {request.mode === "create" ? "Add feedback" : "Edit feedback"}
        </h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Close feedback editor"
          disabled={busy}
          onClick={close}
        >
          ×
        </Button>
      </div>
      <AnnotationEditor
        key={
          request.mode === "create"
            ? request.selection.invocationId
            : request.annotation.id
        }
        quote={
          request.mode === "create"
            ? request.selection.selectedText
            : request.annotation.quote
        }
        initial={request.mode === "edit" ? request.annotation : request.action?.instruction ? { kind: "comment", body: request.action.instruction } : undefined}
        busy={busy}
        embedded
        onCancel={close}
        onSave={(feedback, sendNow = false) => {
          if (busy) return;
          setBusy(true);
          const operation =
            request.mode === "create"
              ? rpc.call("addAnnotation", {
                  threadId: request.selection.message.threadId,
                  ...request.selection,
                  feedback,
                })
              : rpc.call("updateAnnotation", {
                  threadId: request.threadId,
                  annotationId: request.annotation.id,
                  patch: feedback,
                });
          void operation
            .then(async (draft) => {
              reviewHighlights.setDraft(draft);
              reviewEditorStore.close();
              if (sendNow) {
                try {
                  const result = await rpc.call("sendDraft", { threadId: draft.threadId });
                  reviewHighlights.setDraft(result.draft);
                  toast.success(`Feedback submitted (${result.delivery}).`);
                } catch (error) {
                  toast.error("Could not send feedback. Your comment is saved in the draft.", {
                    description: error instanceof Error ? error.message : String(error),
                  });
                }
                return;
              }
              toast.success(
                request.mode === "create" ? "Feedback added." : "Feedback updated.",
              );
            })
            .catch((error: unknown) =>
              toast.error("Could not save feedback", {
                description: error instanceof Error ? error.message : String(error),
              }),
            )
            .finally(() => setBusy(false));
        }}
      />
    </section>,
    document.body,
  );
}
