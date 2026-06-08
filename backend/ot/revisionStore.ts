// backend/ot/revisionStore.ts
// Per-document revision management with serialized processing queue.
// One queue per document ensures ops are never processed concurrently.

import { ClientOp, AcceptedOp, AtomicOp } from './types';
import { transformBatch, applyOp } from './transform';

const MAX_HISTORY = 500; // Keep last N accepted ops in memory for catch-up

interface DocumentState {
  revision: number;
  opHistory: AcceptedOp[]; // Ordered by acceptedRevision
  // Serialized processing queue: each op waits for the previous to complete
  queue: Promise<void>;
}

// ─── Global store ─────────────────────────────────────────────────────────────

class RevisionStore {
  private docs = new Map<string, DocumentState>();

  private getOrCreate(designId: string): DocumentState {
    if (!this.docs.has(designId)) {
      this.docs.set(designId, {
        revision: 0,
        opHistory: [],
        queue: Promise.resolve(),
      });
    }
    return this.docs.get(designId)!;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  getCurrentRevision(designId: string): number {
    return this.docs.get(designId)?.revision ?? 0;
  }

  /**
   * Get all ops accepted AFTER `sinceRevision` — used for catch-up on reconnect.
   */
  getOpsSince(designId: string, sinceRevision: number): AcceptedOp[] {
    const doc = this.docs.get(designId);
    if (!doc) return [];
    return doc.opHistory.filter(op => op.acceptedRevision > sinceRevision);
  }

  /**
   * Enqueue an op for processing. Returns a promise that resolves with the
   * AcceptedOp (to broadcast) or null if the op was a no-op after transform.
   *
   * ALL calls for the same designId are serialized — this eliminates all races.
   */
  processOp(designId: string, clientOp: ClientOp): Promise<AcceptedOp | null> {
    const doc = this.getOrCreate(designId);

    // Wrap in a promise chained on the queue — enforces serial execution.
    const result = new Promise<AcceptedOp | null>((resolve) => {
      doc.queue = doc.queue.then(() => {
        try {
          resolve(this._doProcess(designId, clientOp));
        } catch (err) {
          console.error('[OT] Error processing op:', err);
          resolve(null);
        }
      });
    });

    return result;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _doProcess(designId: string, clientOp: ClientOp): AcceptedOp | null {
    const doc = this.getOrCreate(designId);

    // Dedup: if we've already accepted this opId, silently ignore.
    if (doc.opHistory.some(op => op.opId === clientOp.opId)) {
      console.log(`[OT] Duplicate op ignored: ${clientOp.opId}`);
      return null;
    }

    // Find all ops accepted since the client's base revision.
    const concurrent = doc.opHistory.filter(
      op => op.acceptedRevision > clientOp.revision
    );

    // Transform client's atomic ops against each concurrent server op, in order.
    let transformedOps: AtomicOp[] = clientOp.ops;
    for (const serverOp of concurrent) {
      transformedOps = transformBatch(transformedOps, serverOp.ops);
    }

    // Drop pure no-ops.
    const meaningful = transformedOps.filter(op => op.type !== 'NoOp');
    if (meaningful.length === 0) {
      console.log(`[OT] Op ${clientOp.opId} became no-op after transform`);
      return null;
    }

    // Accept: assign the next revision.
    doc.revision += 1;
    const accepted: AcceptedOp = {
      ...clientOp,
      ops: meaningful,
      acceptedRevision: doc.revision,
    };

    doc.opHistory.push(accepted);

    // Bound memory: discard oldest history beyond MAX_HISTORY.
    if (doc.opHistory.length > MAX_HISTORY) {
      doc.opHistory.shift();
    }

    console.log(
      `[OT] Accepted op ${accepted.opId} → revision ${accepted.acceptedRevision} ` +
      `(client: ${accepted.clientId}, ${meaningful.length} atomic ops)`
    );

    return accepted;
  }

  /** Remove document state when all users leave (optional GC). */
  evict(designId: string): void {
    this.docs.delete(designId);
    console.log(`[OT] Evicted revision store for design ${designId}`);
  }
}

// Singleton — shared across all socket connections.
export const revisionStore = new RevisionStore();
