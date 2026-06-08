// frontend/src/ot/types.ts — Mirror of backend/ot/types.ts

export type HLC = number;

export type AtomicOp =
  | { type: 'SetProperty'; elementId: string; key: string; value: unknown }
  | { type: 'InsertElement'; pageId: string; afterId: string | null; element: Record<string, unknown> }
  | { type: 'DeleteElement'; elementId: string; pageId: string }
  | { type: 'MoveElement'; elementId: string; pageId: string; afterId: string | null }
  | { type: 'InsertText'; elementId: string; offset: number; text: string }
  | { type: 'DeleteText'; elementId: string; offset: number; length: number }
  | { type: 'NoOp' };

export interface ClientOp {
  opId: string;
  clientId: string;
  pageId: string;
  revision: number;
  timestamp: HLC;
  ops: AtomicOp[];
}

export interface AcceptedOp extends ClientOp {
  acceptedRevision: number;
}
