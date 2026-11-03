import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
export function AnnotationEditor({
  quote,
  initial,
  busy,
  onSave,
  onCancel,
  embedded = false,
}: {
  quote: string;
  initial?: { kind: "comment" | "delete"; body: string };
  busy: boolean;
  onSave: (value: { kind: "comment" | "delete"; body: string }, sendNow?: boolean) => void;
  onCancel: () => void;
  embedded?: boolean;
}) {
  const [body, setBody] = useState(initial?.body ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let queued: number | undefined;
    const focusFeedback = () => {
      textareaRef.current?.focus({ preventScroll: true });
    };
    const queueFocusCheck = () => {
      window.clearTimeout(queued);
      queued = window.setTimeout(() => {
        const form = formRef.current;
        const active = document.activeElement;
        if (form && (!active || !form.contains(active))) focusFeedback();
      }, 0);
    };

    // BB can restore composer focus after its native iOS selection menu closes.
    // Guard only that startup window; controls inside this form remain focusable.
    document.addEventListener("focusin", queueFocusCheck);
    document.addEventListener("focusout", queueFocusCheck);
    const initial = window.setTimeout(focusFeedback, 0);
    const stopGuard = window.setTimeout(() => {
      document.removeEventListener("focusin", queueFocusCheck);
      document.removeEventListener("focusout", queueFocusCheck);
    }, 1500);
    return () => {
      document.removeEventListener("focusin", queueFocusCheck);
      document.removeEventListener("focusout", queueFocusCheck);
      window.clearTimeout(initial);
      window.clearTimeout(queued);
      window.clearTimeout(stopGuard);
    };
  }, []);

  return (
    <form
      ref={formRef}
      className={embedded ? "space-y-2" : "space-y-2 rounded border border-border p-3"}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ kind: "comment", body });
      }}
    >
      {!embedded ? <h3>{initial ? "Edit annotation" : "New annotation"}</h3> : null}
      <blockquote className="max-h-20 text-xs leading-relaxed overflow-auto whitespace-pre-wrap break-words border-l-2 border-border pl-3">
        {quote}
      </blockquote>
      <label className="block">
        Comment
        <textarea
          ref={textareaRef}
          autoFocus
          aria-label="Annotation feedback"
          className="mt-1 w-full rounded border border-border bg-background p-2"
          rows={3}
          value={body}
          maxLength={10000}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            ) {
              return;
            }
            event.preventDefault();
            if (!busy && body.trim()) event.currentTarget.form?.requestSubmit();
          }}
        />
      </label>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" type="submit" className="disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100" disabled={busy || !body.trim()}>
            Add
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            className="h-8 w-8 shrink-0 px-0"
            aria-label="Send Now"
            disabled={busy || !body.trim()}
            onClick={() => onSave({ kind: "comment", body }, true)}
          >
            <svg width="14" height="14" style={{ width: 14, height: 14, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </Button>
        </div>
      </div>
    </form>
  );
}
