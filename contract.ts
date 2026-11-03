import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { actionsSchema } from "./lib/actions";
export const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w:.-]+$/);
// Message references are opaque SDK strings; real IDs include pipes.
export const messageId = z
  .string()
  .min(1)
  .max(2000)
  .regex(/^[^\x00-\x1f\x7f]+$/);
export const feedback = z
  .strictObject({
    kind: z.enum(["comment", "delete"]),
    body: z.string().max(10000),
  })
  .refine(
    (v) => v.kind === "delete" || !!v.body.trim(),
    "Comment requires feedback",
  );
export const messageSchema = z.strictObject({
  id: messageId,
  threadId: id,
  role: z.literal("assistant"),
  sourceSeqEnd: z.number().int().nonnegative(),
});
export const quoteSchema = z
  .string()
  .max(20000)
  .refine((v) => !!v.trim(), "Select a nonblank passage");
export const annotationSchema = z
  .strictObject({
    id,
    messageId,
    sourceSeqEnd: z.number().int().nonnegative(),
    quote: quoteSchema,
    kind: z.enum(["comment", "delete"]),
    body: z.string().max(10000),
    createdAt: z.string(),
  })
  .refine(
    (v) => v.kind === "delete" || !!v.body.trim(),
    "Comment requires feedback",
  );
export const draftSchema = z
  .strictObject({
    threadId: id,
    overallFeedback: z.string().max(20000),
    annotations: z.array(annotationSchema).max(100),
    updatedAt: z.string(),
  })
  .refine(
    (v) => new TextEncoder().encode(JSON.stringify(v)).length <= 220000,
    "Draft exceeds 220,000 bytes",
  );
export type ReviewDraft = z.infer<typeof draftSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
export const selectionSchema = z.strictObject({
  invocationId: id,
  message: messageSchema,
  selectedText: quoteSchema,
});
export type Selection = z.infer<typeof selectionSchema>;
const thread = z.strictObject({ threadId: id });
const item = thread.extend({ annotationId: id });
export const rpcContract = defineRpcContract({
  getActions: { input: z.strictObject({}), output: actionsSchema },
  saveActions: { input: z.strictObject({ actions: actionsSchema }), output: actionsSchema },
  sendSelectionAction: {
    input: z.strictObject({ actionId: z.string().min(1).max(100), selection: selectionSchema }),
    output: z.strictObject({ delivery: z.string() }),
  },
  getDraft: { input: thread, output: draftSchema },
  addAnnotation: {
    input: thread.extend({
      message: messageSchema,
      selectedText: quoteSchema,
      feedback,
      invocationId: id,
    }),
    output: draftSchema,
  },
  updateAnnotation: {
    input: item.extend({ patch: feedback }),
    output: draftSchema,
  },
  removeAnnotation: { input: item, output: draftSchema },
  moveAnnotation: {
    input: item.extend({ direction: z.enum(["up", "down"]) }),
    output: draftSchema,
  },
  setOverallFeedback: {
    input: thread.extend({ value: z.string().max(20000) }),
    output: draftSchema,
  },
  clearDraft: { input: thread, output: draftSchema },
  sendDraft: {
    input: thread,
    output: z.strictObject({ draft: draftSchema, delivery: z.string() }),
  },
});
