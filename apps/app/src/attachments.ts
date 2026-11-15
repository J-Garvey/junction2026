/** Files attached to an order, kept only in this browser (IndexedDB). Nothing is sent to the API. */
export type Attachment = { id: string; eventId: string; name: string; type: string; size: number; addedAt: string; blob: Blob };

const DB = "aimo-attachments";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser cannot store files locally."));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("eventId", "eventId");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listAttachments(eventId: string): Promise<Attachment[]> {
  const rows = await run<Attachment[]>("readonly", (s) => s.index("eventId").getAll(eventId));
  return rows.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

export async function addAttachment(eventId: string, file: File): Promise<Attachment> {
  const row: Attachment = {
    id: crypto.randomUUID(),
    eventId,
    name: file.name,
    type: file.type,
    size: file.size,
    addedAt: new Date().toISOString(),
    blob: file,
  };
  await run("readwrite", (s) => s.put(row));
  return row;
}

export async function removeAttachment(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

/** Plain-text files can be read into the order box. */
export function isText(file: { name: string; type: string }): boolean {
  return file.type.startsWith("text/") || /\.(txt|csv|tsv|md)$/i.test(file.name);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
