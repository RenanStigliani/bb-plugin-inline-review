import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { draftSchema, rpcContract, type ReviewDraft } from "./contract";
import { actionsSchema, defaultActions } from "./lib/actions";
import { formatFeedback } from "./lib/format-feedback";
export default function plugin(bb: BbPluginApi) {
  const readActions = async () => actionsSchema.parse(await bb.storage.kv.get("selection-actions") ?? defaultActions);
  const locks = new Map<string, Promise<unknown>>();
  const key = (threadId: string) => `draft:${threadId}`;
  const empty = (threadId: string): ReviewDraft => ({
    threadId,
    annotations: [],
    overallFeedback: "",
    updatedAt: new Date().toISOString(),
  });
  const read = async (threadId: string) => {
    const draft = draftSchema.parse(
      (await bb.storage.kv.get(key(threadId))) ?? empty(threadId),
    );
    if (draft.threadId !== threadId)
      throw new Error("Stored draft thread mismatch");
    return draft;
  };
  async function serial<T>(threadId: string, fn: () => Promise<T>): Promise<T> {
    const next = (locks.get(threadId) ?? Promise.resolve())
      .catch(() => {})
      .then(fn);
    locks.set(threadId, next);
    try {
      return await next;
    } finally {
      if (locks.get(threadId) === next) locks.delete(threadId);
    }
  }
  async function write(draft: ReviewDraft) {
    draft.updatedAt = new Date().toISOString();
    draftSchema.parse(draft);
    await bb.storage.kv.set(key(draft.threadId), draft);
    bb.realtime.publish("draft-changed", { threadId: draft.threadId });
    return draft;
  }
  const mutate = (threadId: string, fn: (d: ReviewDraft) => void) =>
    serial(threadId, async () => {
      const d = await read(threadId);
      fn(d);
      return write(d);
    });
  const index = (d: ReviewDraft, annotationId: string) => {
    const i = d.annotations.findIndex((a) => a.id === annotationId);
    if (i < 0)
      throw new Error("Annotation no longer exists. Reload the draft.");
    return i;
  };
  bb.rpc.register(rpcContract, {
    getActions: () => readActions(),
    saveActions: async ({ actions }) => {
      await bb.storage.kv.set("selection-actions", actions);
      bb.realtime.publish("actions-changed", {});
      return actions;
    },
    sendSelectionAction: async ({ actionId, selection }) => {
      const action = (await readActions()).find((item) => item.id === actionId);
      if (!action || action.kind === "native" || action.placement === "hidden" || !action.instruction.trim()) {
        throw new Error("This action has no instructions or is hidden.");
      }
      const result = await bb.sdk.threads.send({
        threadId: selection.message.threadId,
        mode: "auto",
        input: [{ type: "text", text: formatFeedback({
          threadId: selection.message.threadId,
          overallFeedback: "",
          updatedAt: new Date().toISOString(),
          annotations: [{ id: selection.invocationId, messageId: selection.message.id,
            sourceSeqEnd: selection.message.sourceSeqEnd, quote: selection.selectedText,
            kind: "comment", body: action.instruction, createdAt: new Date().toISOString() }],
        }), mentions: [] }],
      });
      return { delivery: result.delivery };
    },
    getDraft: ({ threadId }) => serial(threadId, () => read(threadId)),
    addAnnotation: ({
      threadId,
      message,
      selectedText,
      feedback,
      invocationId,
    }) =>
      mutate(threadId, (d) => {
        if (message.threadId !== threadId)
          throw new Error("Selection belongs to another thread");
        if (d.annotations.some((a) => a.id === invocationId)) return;
        d.annotations.push({
          id: invocationId,
          messageId: message.id,
          sourceSeqEnd: message.sourceSeqEnd,
          quote: selectedText,
          ...feedback,
          createdAt: new Date().toISOString(),
        });
      }),
    updateAnnotation: ({ threadId, annotationId, patch }) =>
      mutate(threadId, (d) => {
        Object.assign(d.annotations[index(d, annotationId)], patch);
      }),
    removeAnnotation: ({ threadId, annotationId }) =>
      mutate(threadId, (d) => {
        d.annotations.splice(index(d, annotationId), 1);
      }),
    moveAnnotation: ({ threadId, annotationId, direction }) =>
      mutate(threadId, (d) => {
        const i = index(d, annotationId);
        const j = i + (direction === "up" ? -1 : 1);
        if (j >= 0 && j < d.annotations.length)
          [d.annotations[i], d.annotations[j]] = [
            d.annotations[j],
            d.annotations[i],
          ];
      }),
    setOverallFeedback: ({ threadId, value }) =>
      mutate(threadId, (d) => {
        d.overallFeedback = value;
      }),
    clearDraft: ({ threadId }) =>
      serial(threadId, () => write(empty(threadId))),
    sendDraft: ({ threadId }) =>
      serial(threadId, async () => {
        const d = await read(threadId);
        if (!d.annotations.length && !d.overallFeedback.trim())
          throw new Error("Add feedback before sending");
        const result = await bb.sdk.threads.send({
          threadId,
          mode: "auto",
          input: [{ type: "text", text: formatFeedback(d), mentions: [] }],
        });
        const draft = await write(empty(threadId));
        return { draft, delivery: result.delivery };
      }),
  });
  bb.events.on("thread.deleted", ({ thread }) =>
    serial(thread.id, () => bb.storage.kv.delete(key(thread.id))),
  );
}
