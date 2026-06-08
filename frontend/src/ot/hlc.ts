// frontend/src/ot/hlc.ts
// Hybrid Logical Clock — monotonic clock that stays close to wall time.
// Encodes as a single number: wallMs * 10_000 + counter (0-9999).
// Max counter 9999 supports 10,000 events per millisecond per client.

let lastHLC = 0;

export function nextHLC(): number {
  const wall = Date.now() * 10_000;
  lastHLC = Math.max(lastHLC + 1, wall);
  return lastHLC;
}

/** Advance local HLC to be at least as large as a received remote HLC. */
export function receiveHLC(remote: number): void {
  lastHLC = Math.max(lastHLC, remote);
}

export type HLC = number;
