import { useCallback, useEffect, useRef, useState } from "react";
import { experimental_Icon as Icon, useComposerView, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { Annotation, ReviewDraft, rpcContract } from "../contract";
import { reviewEditorStore } from "../lib/editor-store";
import { reviewHighlights } from "../lib/review-highlights";
import { Button } from "./ui/button";

export function ReviewBanner() {
  const view = useComposerView();
  if (view.scope.kind !== "thread") return null;
  return <ThreadReviewBanner key={view.scope.threadId} threadId={view.scope.threadId} />;
}

function ThreadReviewBanner({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const [draft, setDraft] = useState<ReviewDraft>();
  const [overall, setOverall] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = useRef(false);
  const overallRef = useRef("");
  const active = useRef(false);
  const mounted = useRef(true);

  const accept = useCallback((next: ReviewDraft) => {
    if (!mounted.current) return;
    reviewHighlights.setDraft(next);
    setDraft(next);
    if (!dirty.current) {
      overallRef.current = next.overallFeedback;
      setOverall(next.overallFeedback);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      accept(await rpc.call("getDraft", { threadId }));
      setError("");
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [accept, rpc, threadId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  useRealtime("draft-changed", () => {
    if (!active.current) void load();
  });

  const run = async (operation: () => Promise<void>) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      toast.error("Could not update feedback", { description: message });
    } finally {
      active.current = false;
      setBusy(false);
    }
  };

  const saveOverall = async () => {
    const value = overallRef.current;
    const next = await rpc.call("setOverallFeedback", { threadId, value });
    if (overallRef.current === value) dirty.current = false;
    accept(next);
    return next;
  };

  const saveOverallOnBlur = () => {
    if (!dirty.current) return;
    void saveOverall().catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      toast.error("Could not save overall feedback", { description: message });
    });
  };

  const send = () =>
    void run(async () => {
      if (dirty.current) await saveOverall();
      const result = await rpc.call("sendDraft", { threadId });
      dirty.current = false;
      accept(result.draft);
      setExpanded(false);
      toast.success(`Feedback submitted (${result.delivery}).`);
    });

  const remove = (annotation: Annotation) =>
    void run(async () => {
      accept(
        await rpc.call("removeAnnotation", {
          threadId,
          annotationId: annotation.id,
        }),
      );
    });

  if (!draft) {
    return error ? (
      <div role="alert" className="rounded-lg border border-destructive/50 bg-card p-3 text-sm">
        <span className="text-destructive">Could not load feedback.</span>{" "}
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    ) : null;
  }

  const hasFeedback = draft.annotations.length > 0 || !!overall.trim();
  if (!hasFeedback && !dirty.current) return null;

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <div className="flex min-w-0 items-stretch gap-2">
        <button
          type="button"
          className="-my-2 -ml-3 flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pl-3 text-left font-medium text-foreground hover:bg-state-hover"
          aria-label="Feedback"
          aria-expanded={expanded}
          onClick={() => {
            setConfirmingClear(false);
            setExpanded((value) => !value);
          }}
        >
          <Icon name={expanded ? "ChevronDown" : "ChevronRight"} className="size-3.5 shrink-0" aria-hidden="true" />
          Feedback
          {draft.annotations.length ? (
            <span className="text-xs font-normal text-muted-foreground">
              {draft.annotations.length} {draft.annotations.length === 1 ? "item" : "items"}
            </span>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {hasFeedback ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={send}
            >
              <svg width="14" height="14" style={{ width: 14, height: 14, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
              {busy ? "Working…" : "Send"}
            </Button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="mt-2 space-y-3 border-t border-border pt-2">
          {draft.annotations.length ? (
            <ol className="max-h-48 space-y-2 overflow-y-auto">
              {draft.annotations.map((annotation, index) => (
                <li key={annotation.id} className="flex min-w-0 items-start gap-2 text-xs">
                  <span className="shrink-0 text-muted-foreground">{index + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">“{annotation.quote}”</p>
                    <p className="truncate text-muted-foreground">
                      {annotation.kind === "comment"
                        ? `Comment: ${annotation.body}`
                        : annotation.body
                          ? `Remove · ${annotation.body}`
                          : "Remove"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      reviewEditorStore.open({ mode: "edit", threadId, annotation })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove feedback ${index + 1}`}
                    disabled={busy}
                    onClick={() => remove(annotation)}
                  >
                    ×
                  </Button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select assistant text and choose Feedback, or add an overall note here.
            </p>
          )}

          <label className="block text-xs font-medium">
            <span className="flex items-center justify-between gap-2">
              <span>Overall feedback</span>
              <span className="hidden font-normal text-muted-foreground sm:inline">
                Ctrl/⌘+Enter to send
              </span>
            </span>
            <textarea
              aria-label="Overall feedback"
              aria-keyshortcuts="Control+Enter Meta+Enter"
              className="mt-1 w-full resize-y rounded border border-border bg-background p-2 text-sm font-normal"
              rows={2}
              maxLength={20000}
              disabled={busy}
              value={overall}
              onChange={(event) => {
                dirty.current = true;
                overallRef.current = event.target.value;
                setOverall(event.target.value);
              }}
              onBlur={saveOverallOnBlur}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
                event.preventDefault();
                if (hasFeedback && !busy) send();
              }}
            />
          </label>

          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2">
            {hasFeedback && !confirmingClear ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmingClear(true)}
              >
                Clear ({draft.annotations.length})
              </Button>
            ) : null}
            {hasFeedback && confirmingClear ? (
              <div
                role="group"
                aria-label="Confirm clearing all feedback"
                className="flex items-center gap-1"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmingClear(false)}
                >
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      accept(await rpc.call("clearDraft", { threadId }));
                      dirty.current = false;
                      overallRef.current = "";
                      setOverall("");
                      setConfirmingClear(false);
                    })
                  }
                >
                  Clear all
                </Button>
              </div>
            ) : null}

          </div>
        </div>
      ) : null}
    </section>
  );
}
