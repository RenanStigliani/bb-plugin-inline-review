import { useEffect, useRef, useState } from "react";
import { experimental_Icon as Icon, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "../contract";
import { type SelectionAction } from "../lib/actions";
import { Button } from "./ui/button";

export function ActionSettings() {
  const rpc = useRpc<typeof rpcContract>();
  const [actions, setActions] = useState<SelectionAction[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const dragged = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    void rpc.call("getActions", {}).then((next) => { if (active) setActions(next); })
      .catch(() => { if (active) setError("Could not load actions. Reopen these settings to try again."); });
    return () => { active = false; };
  }, [rpc]);
  const change = (next: SelectionAction[]) => { setActions(next); setDirty(true); setError(""); };
  const move = (id: string, target: number) => {
    if (!actions) return;
    const next = [...actions];
    const index = next.findIndex((action) => action.id === id);
    if (index < 0 || target < 0 || target >= next.length || index === target) return;
    next.splice(target, 0, next.splice(index, 1)[0]);
    change(next);
  };
  const patch = (id: string, value: Partial<SelectionAction>) => {
    if (actions) change(actions.map((action) => action.id === id ? { ...action, ...value } : action));
  };
  const field = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";
  if (!actions) return <p role={error ? "alert" : "status"}>{error || "Loading actions…"}</p>;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">Drag the grip to reorder actions. More puts an action behind the three-dot button. Instructions go to the current agent with the selected passage.</p>
      <ol className="space-y-3">
        {actions.map((action, index) => (
          <li key={action.id} className="rounded-lg border border-border p-3 space-y-2"
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
            onDrop={(event) => { event.preventDefault(); if (!busy && dragged.current) move(dragged.current, index); dragged.current = null; }}>
            <div className="flex items-center gap-2">
              <button type="button" draggable={!busy} disabled={busy} aria-label={`Drag ${action.label}`} className="cursor-grab p-1 text-muted-foreground"
                onDragStart={(event) => { dragged.current = action.id; event.dataTransfer.setData("text/plain", action.id); event.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => { dragged.current = null; }}>
                <Icon name="GripVertical" className="size-4" aria-hidden="true" />
              </button>
              <span className="flex-1 font-medium">{action.label || "New action"}</span>
              <Button size="sm" variant="ghost" disabled={busy || index === 0} aria-label={`Move ${action.label} up`} onClick={() => move(action.id, index - 1)}>↑</Button>
              <Button size="sm" variant="ghost" disabled={busy || index === actions.length - 1} aria-label={`Move ${action.label} down`} onClick={() => move(action.id, index + 1)}>↓</Button>
              {action.kind === "custom" ? <Button size="sm" variant="ghost" disabled={busy} aria-label={`Delete ${action.label}`} onClick={() => change(actions.filter((item) => item.id !== action.id))}>×</Button> : null}
            </div>
            {action.kind === "custom" ? <label className="block space-y-1">Label<input className={`${field} block w-full`} aria-label={`Label for ${action.id}`} value={action.label} maxLength={80} disabled={busy} onChange={(event) => patch(action.id, { label: event.target.value })} /></label> : null}
            <div className="flex flex-wrap gap-3">
              <label className="space-y-1">Display<select className={`${field} block`} aria-label={`Display ${action.label}`} disabled={busy} value={action.placement} onChange={(event) => patch(action.id, { placement: event.target.value as SelectionAction["placement"] })}>
                <option value="inline">Main menu</option><option value="more">More (⋯)</option><option value="hidden">Hidden</option>
              </select></label>
              {action.kind === "custom" ? <label className="space-y-1">When clicked<select className={`${field} block`} aria-label={`Behavior ${action.label}`} disabled={busy} value={action.behavior} onChange={(event) => patch(action.id, { behavior: event.target.value as SelectionAction["behavior"] })}>
                <option value="modal">Open feedback box</option><option value="send">Send directly</option>
              </select></label> : null}
            </div>
            {action.kind === "custom" ? <label className="block space-y-1">Instructions<textarea className={`${field} block w-full`} rows={3} maxLength={10000} aria-label={`Instructions ${action.label}`} value={action.instruction} disabled={busy} onChange={(event) => patch(action.id, { instruction: event.target.value })} /></label> : null}
          </li>
        ))}
      </ol>
      {error ? <p role="alert" className="text-destructive">{error}</p> : null}
      <div className="flex justify-between gap-2">
        <Button size="sm" variant="outline" disabled={busy || actions.length >= 30} onClick={() => change([...actions, { id: crypto.randomUUID(), kind: "custom", label: "New action", instruction: "", placement: "more", behavior: "modal" }])}>Add action</Button>
        <Button size="sm" disabled={busy || !dirty} onClick={async () => {
          setBusy(true); setError("");
          try { setActions(await rpc.call("saveActions", { actions })); setDirty(false); toast.success("Actions saved."); }
          catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
          finally { setBusy(false); }
        }}>{busy ? "Saving…" : "Save actions"}</Button>
      </div>
    </div>
  );
}
