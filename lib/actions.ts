import { z } from "zod";

export const actionSchema = z.strictObject({
  id: z.string().min(1).max(100),
  kind: z.enum(["native", "feedback", "custom"]),
  label: z.string().trim().min(1).max(80),
  instruction: z.string().max(10000),
  placement: z.enum(["inline", "more", "hidden"]),
  behavior: z.enum(["modal", "send"]),
});
export const actionsSchema = z.array(actionSchema).min(2).max(30).superRefine((actions, ctx) => {
  if (new Set(actions.map((action) => action.id)).size !== actions.length ||
    actions.filter((action) => action.kind === "native" && action.id === "native").length !== 1 ||
    actions.filter((action) => action.kind === "feedback" && action.id === "feedback").length !== 1 ||
    actions.some((action) => action.kind === "custom" && !action.instruction.trim()) ||
    actions.filter((action) => action.kind !== "custom").length !== 2) {
    ctx.addIssue({ code: "custom", message: "Keep both built-in actions, use unique IDs, and enter instructions for each custom action." });
  }
});
export type SelectionAction = z.infer<typeof actionSchema>;
export const defaultActions: SelectionAction[] = [
  { id: "native", kind: "native", label: "Add to chat", instruction: "", placement: "inline", behavior: "modal" },
  { id: "feedback", kind: "feedback", label: "Feedback", instruction: "", placement: "inline", behavior: "modal" },
  { id: "agree", kind: "custom", label: "Agree", instruction: "I agree, do this now.", placement: "more", behavior: "modal" },
  { id: "new-thread", kind: "custom", label: "Do in a new bb thread", instruction: "Do this in a new BB thread. Create the thread and give it the selected passage as its task.", placement: "more", behavior: "modal" },
  { id: "parallel", kind: "custom", label: "Dispatch to parallel workers", instruction: "Dispatch this work to parallel workers in new BB subthreads. Split it into independent tasks and give each worker the context it needs.", placement: "more", behavior: "modal" },
];

let pending: SelectionAction | undefined;
export function queueSelectionAction(action: SelectionAction) { pending = action; }
export function takeSelectionAction() {
  const action = pending;
  pending = undefined;
  return action;
}
