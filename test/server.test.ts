import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
  experimental_scanPublicSdkOnly,
} from "@get-bb/plugin-sdk/testing";
import plugin from "../server";
const hosts: ReturnType<typeof createFakePluginHost>[] = [];
afterEach(async () => {
  for (const h of hosts.splice(0)) await h.harness.lifecycle.dispose();
});
async function setup(
  send = vi.fn(async () => ({
    ok: true as const,
    delivery: "steered" as const,
  })),
) {
  let host = createFakePluginHost({ sdk: { threads: { send } } });
  hosts.push(host);
  await plugin(host.bb);
  const call = async (method: string, input: unknown) => {
    try {
      return {
        ok: true,
        result: await host.harness.behavior.callRpc(method, input),
      };
    } catch (error) {
      return { ok: false, error };
    }
  };
  return {
    get harness() {
      return host.harness;
    },
    call,
    send,
    reload: async () => {
      host = await host.harness.lifecycle.reload(plugin);
      hosts.push(host);
    },
  };
}
const input = (invocationId = "a", threadId = "t") => ({
  threadId,
  invocationId,
  message: { id: "m", threadId, role: "assistant", sourceSeqEnd: 3 },
  selectedText: " exact\nquote ",
  feedback: { kind: "comment", body: "Explain this" },
});
const result = (r: any) => {
  expect(r).toMatchObject({ ok: true });
  return r.result;
};
describe("draft RPC", () => {
  it("persists, isolates, edits, reorders, removes and reloads", async () => {
    const h = await setup();
    expect(
      result(await h.call("getDraft", { threadId: "t" })).annotations,
    ).toEqual([]);
    await Promise.all([
      h.call("addAnnotation", input()),
      h.call("addAnnotation", input("b")),
    ]);
    expect(
      result(await h.call("getDraft", { threadId: "other" })).annotations,
    ).toEqual([]);
    let d = result(
      await h.call("moveAnnotation", {
        threadId: "t",
        annotationId: "b",
        direction: "up",
      }),
    );
    expect(d.annotations.map((a: any) => a.id)).toEqual(["b", "a"]);
    d = result(
      await h.call("updateAnnotation", {
        threadId: "t",
        annotationId: "b",
        patch: { kind: "delete", body: "" },
      }),
    );
    expect(d.annotations[0].kind).toBe("delete");
    await h.reload();
    expect(result(await h.call("getDraft", { threadId: "t" }))).toEqual(d);
    expect(
      result(
        await h.call("removeAnnotation", { threadId: "t", annotationId: "a" }),
      ).annotations,
    ).toHaveLength(1);
    expect(
      await h.call("removeAnnotation", {
        threadId: "t",
        annotationId: "missing",
      }),
    ).toMatchObject({ ok: false });
    await h.harness.behavior.emitThreadEvent("thread.deleted", {
      thread: makeThreadResponse({ id: "t" }),
    });
    expect(
      result(await h.call("getDraft", { threadId: "t" })).annotations,
    ).toEqual([]);
  });
  it("validates role, thread, comment, whitespace and size; deduplicates invocation", async () => {
    const h = await setup();
    for (const invalid of [
      { ...input(), selectedText: "  " },
      { ...input(), selectedText: "x".repeat(20001) },
      { ...input(), feedback: { kind: "comment", body: " " } },
      { ...input(), message: { ...input().message, role: "user" } },
      { ...input(), threadId: "other" },
    ])
      expect(await h.call("addAnnotation", invalid)).toMatchObject({
        ok: false,
      });
    result(await h.call("addAnnotation", input()));
    expect(
      result(await h.call("addAnnotation", input())).annotations,
    ).toHaveLength(1);
    expect(
      await h.call("setOverallFeedback", {
        threadId: "t",
        value: "x".repeat(20001),
      }),
    ).toMatchObject({ ok: false });
    for (let i = 0; i < 12; i++)
      await h.call("addAnnotation", {
        ...input(`big${i}`),
        selectedText: "😀".repeat(9500),
      });
    const d = result(await h.call("getDraft", { threadId: "t" }));
    expect(Buffer.byteLength(JSON.stringify(d))).toBeLessThanOrEqual(220000);
    expect(d.annotations.length).toBeLessThan(13);
  });
  it("sends one batch, preserves failed delivery and prevents concurrent duplicate send", async () => {
    const send = vi.fn(async () => ({
      ok: true as const,
      delivery: "steered" as const,
    }));
    const h = await setup(send);
    expect(await h.call("sendDraft", { threadId: "t" })).toMatchObject({
      ok: false,
    });
    await h.call("addAnnotation", input());
    await h.call("setOverallFeedback", {
      threadId: "t",
      value: "Overall instruction",
    });
    send.mockRejectedValueOnce(new Error("offline"));
    expect(await h.call("sendDraft", { threadId: "t" })).toMatchObject({
      ok: false,
    });
    expect(
      result(await h.call("getDraft", { threadId: "t" })).annotations,
    ).toHaveLength(1);
    const responses = await Promise.all([
      h.call("sendDraft", { threadId: "t" }),
      h.call("sendDraft", { threadId: "t" }),
    ]);
    expect(responses.filter((r) => r.ok)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]).toMatchObject([
      {
        threadId: "t",
        mode: "auto",
        input: [
          {
            type: "text",
            mentions: [],
            text: expect.stringContaining("Overall instruction"),
          },
        ],
      },
    ]);
    expect(
      result(await h.call("getDraft", { threadId: "t" })).annotations,
    ).toEqual([]);
  });
  it("public SDK scan", () => {
    const scan = experimental_scanPublicSdkOnly(process.cwd(), {
      allow: [
        /^react(?:-dom)?(?:\/|$)/,
        /^sonner$/,
        /^@testing-library\//,
        /^vitest(?:\/|$)/,
        /^@\//,
        /^@hugeicons\//,
        /^@radix-ui\//,
        /^(class-variance-authority|clsx|tailwind-merge|vaul)$/,
      ],
    });
    expect(scan.violations).toEqual([]);
    expect(scan.privateDependencies).toEqual([]);
  });
});

it("sends overall-only feedback and preserves a mutation queued during delivery", async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const send = vi.fn(async () => {
    entered();
    await waiting;
    return { ok: true as const, delivery: "steered" as const };
  });
  const h = await setup(send);
  await h.call("setOverallFeedback", { threadId: "t", value: "Overall only" });
  const sending = h.call("sendDraft", { threadId: "t" });
  await started;
  const adding = h.call("addAnnotation", input());
  release();
  expect(result(await sending).draft.annotations).toEqual([]);
  expect(result(await adding).annotations).toHaveLength(1);
  expect(
    result(await h.call("getDraft", { threadId: "t" })).annotations,
  ).toHaveLength(1);
  expect(send).toHaveBeenCalledTimes(1);
});

it("saves action order and sends custom instructions without consuming staged feedback", async () => {
  const h = await setup();
  const actions = result(await h.call("getActions", {}));
  const agree = actions.find((action: any) => action.id === "agree");
  agree.behavior = "send";
  const reordered = [...actions].reverse();
  expect(result(await h.call("saveActions", { actions: reordered }))).toEqual(reordered);
  await h.reload();
  expect(result(await h.call("getActions", {}))).toEqual(reordered);
  await h.call("addAnnotation", input());
  const { feedback, threadId, ...selection } = input("selected");
  result(await h.call("sendSelectionAction", { actionId: "agree", selection }));
  expect(h.send).toHaveBeenCalledOnce();
  expect(h.harness.inspection.sdk.callsTo("threads.send")[0][0]).toMatchObject({ threadId: "t", input: [{ text: expect.stringContaining("I agree, do this now.") }] });
  expect(result(await h.call("getDraft", { threadId: "t" })).annotations).toHaveLength(1);
  expect((await h.call("sendSelectionAction", { actionId: "missing", selection })).ok).toBe(false);
});

it("rejects blank instructions, duplicate IDs and missing built-in actions", async () => {
  const h = await setup();
  const actions = result(await h.call("getActions", {}));
  expect((await h.call("saveActions", { actions: actions.slice(1) })).ok).toBe(false);
  expect((await h.call("saveActions", { actions: [...actions, actions[0]] })).ok).toBe(false);
  expect((await h.call("saveActions", { actions: actions.map((action: any) => action.id === "agree" ? { ...action, instruction: " " } : action) })).ok).toBe(false);
});
