/**
 * In-memory Firestore mock implementing exactly the surface the OTP factories
 * use: doc get/set/delete/update, runTransaction, batch, and the
 * collection().where().limit().get() chain (cleanup function).
 */

export interface MockFirestore {
  store: Map<string, Record<string, unknown>>;
  db: {
    collection: (name: string) => MockQuery;
    runTransaction: (fn: (tx: MockTransaction) => Promise<void>) => Promise<void>;
    batch: () => MockBatch;
  };
}

interface MockDocRef {
  id: string;
  path: string;
  get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
  set: (data: Record<string, unknown>) => Promise<void>;
  delete: () => Promise<void>;
}

type MockTransaction = {
  get: (ref: MockDocRef) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
  delete: (ref: MockDocRef) => void;
  update: (ref: MockDocRef, data: Record<string, unknown>) => void;
};

type MockQuery = {
  where: (field: string, op: string, value: unknown) => MockQuery;
  limit: (n: number) => MockQuery;
  get: () => Promise<{
    empty: boolean;
    docs: { id: string; ref: MockDocRef; data: () => Record<string, unknown> }[];
  }>;
};

type MockBatch = {
  delete: (ref: MockDocRef) => void;
  commit: () => Promise<unknown>;
};

export function createMockFirestore(): MockFirestore {
  const store = new Map<string, Record<string, unknown>>();

  const snapshot = (path: string) => ({
    exists: store.has(path),
    data: () => (store.has(path) ? store.get(path) : undefined),
  });

  const makeRef = (coll: string, id: string): MockDocRef => ({
    id,
    path: `${coll}/${id}`,
    get: async () => snapshot(`${coll}/${id}`),
    set: async (data) => {
      store.set(`${coll}/${id}`, { ...data });
    },
    delete: async () => {
      store.delete(`${coll}/${id}`);
    },
  });

  const makeQuery = (coll: string, filters: { field: string; op: string; value: unknown }[], limitN?: number): MockQuery => ({
    where: (field, op, value) => makeQuery(coll, [...filters, { field, op, value }], limitN),
    limit: (n) => makeQuery(coll, filters, n),
    get: async () => {
      const docs = [...store.entries()]
        .filter(([path, data]) => {
          if (!path.startsWith(`${coll}/`)) return false;
          return filters.every((f) => {
            const actual = data[f.field] as number;
            switch (f.op) {
              case '<':
                return actual < (f.value as number);
              case '<=':
                return actual <= (f.value as number);
              case '>':
                return actual > (f.value as number);
              case '>=':
                return actual >= (f.value as number);
              case '==':
                return actual === f.value;
              default:
                throw new Error(`Mock query: unsupported op ${f.op}`);
            }
          });
        })
        .slice(0, limitN)
        .map(([path, data]) => {
          const ref = makeRef(coll, path.slice(coll.length + 1));
          return { id: ref.id, ref, data: () => data };
        });
      return { empty: docs.length === 0, docs };
    },
  });

  const db = {
    collection: (name: string) => ({
      doc: (id: string) => makeRef(name, id),
      where: (field: string, op: string, value: unknown) => makeQuery(name, [{ field, op, value }]),
      limit: (n: number) => makeQuery(name, [], n),
      get: async () => makeQuery(name, []).get(),
    }),
    runTransaction: async (fn: (tx: MockTransaction) => Promise<void>) => {
      const pendingDeletes = new Set<string>();
      const tx: MockTransaction = {
        get: async (r) => {
          const path = r.path;
          if (pendingDeletes.has(path)) return { exists: false, data: () => undefined };
          return snapshot(path);
        },
        delete: (r) => {
          pendingDeletes.add(r.path);
        },
        update: (r, data) => {
          const existing = store.get(r.path);
          store.set(r.path, { ...existing, ...data });
        },
      };
      await fn(tx);
      for (const path of pendingDeletes) store.delete(path);
    },
    batch: () => {
      const deletes = new Set<string>();
      return {
        delete: (ref: MockDocRef) => {
          deletes.add(ref.path);
        },
        commit: async () => {
          for (const path of deletes) store.delete(path);
        },
      };
    },
  };

  return { store, db };
}

/** Install the global mock that vi.mock factories look up. */
export function installFirestoreMock(mock: MockFirestore): void {
  (globalThis as Record<string, unknown>).__mockFirestore = mock;
}
