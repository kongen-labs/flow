/**
 * Local conversation store — IndexedDB.
 *
 * This is the wedge: "GPTs come and go — your conversations stay with you."
 * Full history persists locally forever; no compression, no compaction,
 * no restarts. Everything is exportable/importable as JSON so conversations
 * are portable across browsers and devices.
 *
 * Zero-dependency promise wrapper (no `idb`) so the same module runs in the
 * PWA shell, the future MV3 shell, and under fake-indexeddb in tests.
 */

import type { SignalLevel } from "./classify-message";

export interface StoredStream {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_model?: string;
  message_count: number;
}

export interface StoredMessageMetadata {
  regime?: string;
  model?: string;
  provider?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  savings_pct?: number;
  budget?: number;
  confidence_adj?: number;
  balance?: number;
  routed_via?: "kongen" | "pinned" | "default";
  /** Context scope used for this reply (absent on pre-v2 local data). */
  context_scope?: "relevant" | "everything";
}

export interface StoredMessage {
  id: string;
  stream_id: string;
  /** Monotonic per-stream ordering key. */
  seq: number;
  role: "user" | "assistant";
  content: string;
  signal: SignalLevel;
  metadata?: StoredMessageMetadata;
  created_at: string;
}

export interface FlowExport {
  format: "flow-local-export";
  version: 1;
  exported_at: string;
  streams: StoredStream[];
  messages: StoredMessage[];
}

const DB_NAME = "flow-local";
const DB_VERSION = 1;
const STREAMS = "streams";
const MESSAGES = "messages";

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

export class FlowDB {
  private constructor(private db: IDBDatabase) {}

  /**
   * Open (and migrate) the database.
   *
   * @param factory  Injectable for tests (fake-indexeddb); defaults to the
   *                 global indexedDB in the browser.
   */
  static async open(factory?: IDBFactory): Promise<FlowDB> {
    const idb = factory ?? indexedDB;
    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STREAMS)) {
        db.createObjectStore(STREAMS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(MESSAGES)) {
        const store = db.createObjectStore(MESSAGES, { keyPath: "id" });
        store.createIndex("by_stream", "stream_id", { unique: false });
      }
    };

    const db = await req(request);
    return new FlowDB(db);
  }

  close(): void {
    this.db.close();
  }

  // -------------------------------------------------------------------
  // Streams
  // -------------------------------------------------------------------

  async createStream(id: string, title: string): Promise<StoredStream> {
    const now = new Date().toISOString();
    const stream: StoredStream = {
      id,
      title,
      created_at: now,
      updated_at: now,
      message_count: 0,
    };
    const tx = this.db.transaction(STREAMS, "readwrite");
    tx.objectStore(STREAMS).put(stream);
    await txDone(tx);
    return stream;
  }

  async listStreams(): Promise<StoredStream[]> {
    const tx = this.db.transaction(STREAMS, "readonly");
    const all = await req(tx.objectStore(STREAMS).getAll() as IDBRequest<StoredStream[]>);
    // Newest first
    return all.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }

  async getStream(id: string): Promise<StoredStream | undefined> {
    const tx = this.db.transaction(STREAMS, "readonly");
    return req(tx.objectStore(STREAMS).get(id) as IDBRequest<StoredStream | undefined>);
  }

  async updateStream(
    id: string,
    updates: Partial<Pick<StoredStream, "title" | "last_model">>,
  ): Promise<void> {
    const tx = this.db.transaction(STREAMS, "readwrite");
    const store = tx.objectStore(STREAMS);
    const stream = await req(store.get(id) as IDBRequest<StoredStream | undefined>);
    if (!stream) return;
    Object.assign(stream, updates, { updated_at: new Date().toISOString() });
    store.put(stream);
    await txDone(tx);
  }

  /**
   * NOTE: deleting a LOCAL stream is user-owned data on the user's own
   * machine — not production data — so a real delete is appropriate here.
   * The messages are removed with the stream.
   */
  async deleteStream(id: string): Promise<void> {
    const tx = this.db.transaction([STREAMS, MESSAGES], "readwrite");
    tx.objectStore(STREAMS).delete(id);
    const index = tx.objectStore(MESSAGES).index("by_stream");
    const keys = await req(index.getAllKeys(id));
    for (const key of keys) {
      tx.objectStore(MESSAGES).delete(key);
    }
    await txDone(tx);
  }

  // -------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------

  async addMessage(message: StoredMessage): Promise<void> {
    const tx = this.db.transaction([MESSAGES, STREAMS], "readwrite");
    tx.objectStore(MESSAGES).put(message);
    const streams = tx.objectStore(STREAMS);
    const stream = await req(
      streams.get(message.stream_id) as IDBRequest<StoredStream | undefined>,
    );
    if (stream) {
      stream.message_count += 1;
      stream.updated_at = new Date().toISOString();
      if (message.metadata?.model) stream.last_model = message.metadata.model;
      streams.put(stream);
    }
    await txDone(tx);
  }

  async updateMessage(
    id: string,
    updates: Partial<Pick<StoredMessage, "content" | "signal" | "metadata">>,
  ): Promise<void> {
    const tx = this.db.transaction(MESSAGES, "readwrite");
    const store = tx.objectStore(MESSAGES);
    const message = await req(store.get(id) as IDBRequest<StoredMessage | undefined>);
    if (!message) return;
    Object.assign(message, updates);
    store.put(message);
    await txDone(tx);
  }

  async getMessages(streamId: string): Promise<StoredMessage[]> {
    const tx = this.db.transaction(MESSAGES, "readonly");
    const index = tx.objectStore(MESSAGES).index("by_stream");
    const all = await req(index.getAll(streamId) as IDBRequest<StoredMessage[]>);
    return all.sort((a, b) => a.seq - b.seq);
  }

  /** All messages across all streams (savings aggregation at app load). */
  async getAllMessages(): Promise<StoredMessage[]> {
    const tx = this.db.transaction(MESSAGES, "readonly");
    return req(tx.objectStore(MESSAGES).getAll() as IDBRequest<StoredMessage[]>);
  }

  async nextSeq(streamId: string): Promise<number> {
    const messages = await this.getMessages(streamId);
    return messages.length === 0 ? 1 : messages[messages.length - 1].seq + 1;
  }

  // -------------------------------------------------------------------
  // Export / import — conversation portability
  // -------------------------------------------------------------------

  async exportAll(): Promise<FlowExport> {
    const streamsTx = this.db.transaction([STREAMS, MESSAGES], "readonly");
    const streams = await req(
      streamsTx.objectStore(STREAMS).getAll() as IDBRequest<StoredStream[]>,
    );
    const messages = await req(
      streamsTx.objectStore(MESSAGES).getAll() as IDBRequest<StoredMessage[]>,
    );
    return {
      format: "flow-local-export",
      version: 1,
      exported_at: new Date().toISOString(),
      streams,
      messages,
    };
  }

  /**
   * Import an export bundle. Merge semantics: existing records with the
   * same id are left untouched (import never destroys local history).
   * Returns counts of newly imported records.
   */
  async importAll(
    bundle: FlowExport,
  ): Promise<{ streams: number; messages: number }> {
    if (bundle.format !== "flow-local-export" || bundle.version !== 1) {
      throw new Error("Unrecognized export format");
    }
    let streamCount = 0;
    let messageCount = 0;

    const tx = this.db.transaction([STREAMS, MESSAGES], "readwrite");
    const streams = tx.objectStore(STREAMS);
    const messages = tx.objectStore(MESSAGES);

    for (const stream of bundle.streams) {
      const existing = await req(
        streams.get(stream.id) as IDBRequest<StoredStream | undefined>,
      );
      if (!existing) {
        streams.put(stream);
        streamCount += 1;
      }
    }
    for (const message of bundle.messages) {
      const existing = await req(
        messages.get(message.id) as IDBRequest<StoredMessage | undefined>,
      );
      if (!existing) {
        messages.put(message);
        messageCount += 1;
      }
    }
    await txDone(tx);
    return { streams: streamCount, messages: messageCount };
  }
}
