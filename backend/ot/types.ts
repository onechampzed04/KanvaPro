// backend/ot/types.ts
// Shared type definitions for the Operational Transformation engine.
// Single source of truth — mirrored on frontend.

// ─── Hybrid Logical Clock ────────────────────────────────────────────────────
// Encodes (wallMs, counter) in a single number: wallMs * 10000 + counter.
// Monotonic: never goes backward even if wall clock drifts.
export type HLC = number;

// ─── Atomic Operations ────────────────────────────────────────────────────────
// Every single mutation is one of these. Never send state, only deltas.

export type AtomicOp =
  // Set a single property on an element (property-level conflict resolution)
  | { type: 'SetProperty'; elementId: string; key: string; value: unknown }
  // Insert a new element after `afterId` (null = beginning of page)
  | { type: 'InsertElement'; pageId: string; afterId: string | null; element: Record<string, unknown> }
  // Soft-remove an element
  | { type: 'DeleteElement'; elementId: string; pageId: string }
  // Change z-order: move element after `afterId` (null = front of page)
  | { type: 'MoveElement'; elementId: string; pageId: string; afterId: string | null }
  // Text insertion at char offset (classic OT)
  | { type: 'InsertText'; elementId: string; offset: number; text: string }
  // Text deletion from char offset
  | { type: 'DeleteText'; elementId: string; offset: number; length: number }
  // Tombstone — produced by transform when an op is no-op'd
  | { type: 'NoOp' };

// ─── Client Op (what the client sends) ────────────────────────────────────────
export interface ClientOp {
  opId: string;       // UUID — used for dedup and ACK matching
  clientId: string;   // Socket / client session identifier
  pageId: string;     // Which page these ops apply to
  revision: number;   // Server revision the client was at when it created this op
  timestamp: HLC;     // Hybrid Logical Clock — not wall clock
  ops: AtomicOp[];    // Batch of atomic ops (must be applied atomically)
}

// ─── Accepted Op (what the server broadcasts back) ────────────────────────────
export interface AcceptedOp extends ClientOp {
  acceptedRevision: number;   // The server revision assigned to this op
  // ops may differ from the original (transformed against concurrent ops)
}
