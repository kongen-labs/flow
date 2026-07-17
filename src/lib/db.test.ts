import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { FlowDB, type StoredMessage } from "./db";

function msg(
  id: string,
  streamId: string,
  seq: number,
  overrides: Partial<StoredMessage> = {},
): StoredMessage {
  return {
    id,
    stream_id: streamId,
    seq,
    role: "user",
    content: `message ${seq}`,
    signal: "default",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("FlowDB", () => {
  it("creates streams and lists newest-first", async () => {
    const db = await FlowDB.open(new IDBFactory());
    await db.createStream("s1", "First");
    await new Promise((r) => setTimeout(r, 5));
    await db.createStream("s2", "Second");

    const streams = await db.listStreams();
    expect(streams.map((s) => s.id)).toEqual(["s2", "s1"]);
    db.close();
  });

  it("persists messages across close/reopen (the wedge)", async () => {
    const factory = new IDBFactory();
    const db = await FlowDB.open(factory);
    await db.createStream("s1", "Chat");
    await db.addMessage(msg("m1", "s1", 1));
    await db.addMessage(
      msg("m2", "s1", 2, { role: "assistant", content: "reply" }),
    );
    db.close();

    // "Reload" — reopen from the same factory.
    const db2 = await FlowDB.open(factory);
    const messages = await db2.getMessages("s1");
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(messages[1].content).toBe("reply");

    const stream = await db2.getStream("s1");
    expect(stream?.message_count).toBe(2);
    db2.close();
  });

  it("orders messages by seq and computes nextSeq", async () => {
    const db = await FlowDB.open(new IDBFactory());
    await db.createStream("s1", "Chat");
    await db.addMessage(msg("m2", "s1", 2));
    await db.addMessage(msg("m1", "s1", 1));
    expect((await db.getMessages("s1")).map((m) => m.seq)).toEqual([1, 2]);
    expect(await db.nextSeq("s1")).toBe(3);
    expect(await db.nextSeq("empty")).toBe(1);
    db.close();
  });

  it("updates message signal (manual flame/ghost override)", async () => {
    const db = await FlowDB.open(new IDBFactory());
    await db.createStream("s1", "Chat");
    await db.addMessage(msg("m1", "s1", 1));
    await db.updateMessage("m1", { signal: "critical" });
    const [m] = await db.getMessages("s1");
    expect(m.signal).toBe("critical");
    db.close();
  });

  it("deletes a stream together with its messages", async () => {
    const db = await FlowDB.open(new IDBFactory());
    await db.createStream("s1", "Chat");
    await db.createStream("s2", "Keep");
    await db.addMessage(msg("m1", "s1", 1));
    await db.addMessage(msg("m2", "s2", 1));

    await db.deleteStream("s1");
    expect(await db.getStream("s1")).toBeUndefined();
    expect(await db.getMessages("s1")).toHaveLength(0);
    expect(await db.getMessages("s2")).toHaveLength(1);
    db.close();
  });

  it("export/import round-trips into a fresh database", async () => {
    const db = await FlowDB.open(new IDBFactory());
    await db.createStream("s1", "Chat");
    await db.addMessage(msg("m1", "s1", 1, { signal: "critical" }));
    await db.addMessage(
      msg("m2", "s1", 2, {
        role: "assistant",
        metadata: { model: "claude-sonnet-4-6", provider: "anthropic" },
      }),
    );
    const bundle = await db.exportAll();
    db.close();

    // JSON round-trip (what actually happens through a file).
    const parsed = JSON.parse(JSON.stringify(bundle));

    const db2 = await FlowDB.open(new IDBFactory());
    const result = await db2.importAll(parsed);
    expect(result).toEqual({ streams: 1, messages: 2 });

    const messages = await db2.getMessages("s1");
    expect(messages).toHaveLength(2);
    expect(messages[0].signal).toBe("critical");
    expect(messages[1].metadata?.model).toBe("claude-sonnet-4-6");

    // Import is merge-only: re-import adds nothing, destroys nothing.
    const again = await db2.importAll(parsed);
    expect(again).toEqual({ streams: 0, messages: 0 });
    expect(await db2.getMessages("s1")).toHaveLength(2);
    db2.close();
  });

  it("rejects unknown import formats", async () => {
    const db = await FlowDB.open(new IDBFactory());
    await expect(
      db.importAll({ format: "something-else" } as never),
    ).rejects.toThrow("Unrecognized export format");
    db.close();
  });
});
