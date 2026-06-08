// backend/ot/transform.ts
// OT Transform engine.
// Rule: T(opA, opB) → opA' such that: apply(opA', apply(opB, S)) == apply(opA, S)
// opB is the "already accepted" server op. opA is what we're trying to rebase onto opB.

import { AtomicOp, ClientOp } from './types';

// ─── Apply ────────────────────────────────────────────────────────────────────
// Applies a single AtomicOp to an elements array (immutably).

export function applyAtomicOp(elements: any[], op: AtomicOp): any[] {
  switch (op.type) {
    case 'NoOp':
      return elements;

    case 'SetProperty':
      return elements.map(el =>
        el.id === op.elementId ? { ...el, [op.key]: op.value } : el
      );

    case 'InsertElement': {
      // Defensive check: If element ID already exists, do not duplicate!
      if (elements.some(el => el.id === op.element.id)) {
        return elements;
      }
      if (!op.afterId) return [op.element, ...elements];
      const idx = elements.findIndex(el => el.id === op.afterId);
      if (idx === -1) return [...elements, op.element]; // afterId gone → append
      const next = [...elements];
      next.splice(idx + 1, 0, op.element);
      return next;
    }

    case 'DeleteElement':
      return elements.filter(el => el.id !== op.elementId);

    case 'MoveElement': {
      const moving = elements.find(el => el.id === op.elementId);
      if (!moving) return elements;
      const without = elements.filter(el => el.id !== op.elementId);
      if (!op.afterId) return [moving, ...without];
      const idx = without.findIndex(el => el.id === op.afterId);
      if (idx === -1) return [...without, moving];
      const next = [...without];
      next.splice(idx + 1, 0, moving);
      return next;
    }

    case 'InsertText':
      return elements.map(el => {
        if (el.id !== op.elementId) return el;
        const t = (el.text as string) || '';
        return { ...el, text: t.slice(0, op.offset) + op.text + t.slice(op.offset) };
      });

    case 'DeleteText':
      return elements.map(el => {
        if (el.id !== op.elementId) return el;
        const t = (el.text as string) || '';
        return { ...el, text: t.slice(0, op.offset) + t.slice(op.offset + op.length) };
      });

    default:
      return elements;
  }
}

export function applyOp(elements: any[], op: ClientOp): any[] {
  let result = elements;
  for (const atomicOp of op.ops) {
    result = applyAtomicOp(result, atomicOp);
  }
  return result;
}

// ─── Transform ────────────────────────────────────────────────────────────────
// Transform a single AtomicOp (opA — client pending) against another AtomicOp
// (opB — already accepted by server). Returns opA adjusted to apply after opB.

export function transformAtomic(opA: AtomicOp, opB: AtomicOp): AtomicOp {
  if (opA.type === 'NoOp') return opA;
  if (opB.type === 'NoOp') return opA;

  switch (opA.type) {
    case 'SetProperty':      return transformSetProperty(opA, opB);
    case 'InsertElement':    return transformInsertElement(opA, opB);
    case 'DeleteElement':    return transformDeleteElement(opA, opB);
    case 'MoveElement':      return transformMoveElement(opA, opB);
    case 'InsertText':       return transformInsertText(opA, opB);
    case 'DeleteText':       return transformDeleteText(opA, opB);
    default:                 return opA;
  }
}

// Transform an entire batch (opA's ops) against another batch (opB's ops).
export function transformBatch(opAOps: AtomicOp[], opBOps: AtomicOp[]): AtomicOp[] {
  let current = opAOps;
  for (const b of opBOps) {
    current = current.map(a => transformAtomic(a, b));
  }
  return current;
}

// ─── Per-type transform rules ─────────────────────────────────────────────────

function transformSetProperty(
  opA: Extract<AtomicOp, { type: 'SetProperty' }>,
  opB: AtomicOp
): AtomicOp {
  switch (opB.type) {
    case 'SetProperty':
      // Same element, SAME key → server wins (last-write wins). Client's op dropped.
      if (opA.elementId === opB.elementId && opA.key === opB.key) return { type: 'NoOp' };
      // Same element, different key → independent, no transform needed.
      return opA;

    case 'DeleteElement':
      // Setting a property on a now-deleted element → pointless, drop it.
      if (opA.elementId === opB.elementId) return { type: 'NoOp' };
      return opA;

    default:
      return opA;
  }
}

function transformInsertElement(
  opA: Extract<AtomicOp, { type: 'InsertElement' }>,
  opB: AtomicOp
): AtomicOp {
  switch (opB.type) {
    case 'InsertElement':
      // Both inserting after the same element → server's element now occupies that slot,
      // so client's insert goes after the server's new element (server wins tiebreak).
      if (opA.afterId === opB.afterId && opA.pageId === opB.pageId) {
        return { ...opA, afterId: (opB.element as any).id as string };
      }
      return opA;

    case 'DeleteElement':
      // We wanted to insert after a now-deleted element → insert at head of page.
      if (opA.afterId === opB.elementId) return { ...opA, afterId: null };
      return opA;

    default:
      return opA;
  }
}

function transformDeleteElement(
  opA: Extract<AtomicOp, { type: 'DeleteElement' }>,
  opB: AtomicOp
): AtomicOp {
  switch (opB.type) {
    case 'DeleteElement':
      // Both deleting the same element → idempotent, NoOp for the second one.
      if (opA.elementId === opB.elementId) return { type: 'NoOp' };
      return opA;

    default:
      return opA;
  }
}

function transformMoveElement(
  opA: Extract<AtomicOp, { type: 'MoveElement' }>,
  opB: AtomicOp
): AtomicOp {
  switch (opB.type) {
    case 'DeleteElement':
      // The element we wanted to move was deleted → NoOp.
      if (opA.elementId === opB.elementId) return { type: 'NoOp' };
      // Our "insert after" anchor was deleted → move to head.
      if (opA.afterId === opB.elementId) return { ...opA, afterId: null };
      return opA;

    case 'MoveElement':
      // Cycle detection: A moves X after Y, B moves Y after X → drop A (server wins).
      if (opA.elementId === opB.afterId && opB.elementId === opA.afterId) {
        return { type: 'NoOp' };
      }
      // Our "after" anchor also got moved — follow it to its new position.
      if (opA.afterId === opB.elementId) {
        return { ...opA, afterId: opB.afterId };
      }
      return opA;

    default:
      return opA;
  }
}

function transformInsertText(
  opA: Extract<AtomicOp, { type: 'InsertText' }>,
  opB: AtomicOp
): AtomicOp {
  if (opA.elementId !== (opB as any).elementId) return opA;

  switch (opB.type) {
    case 'DeleteElement':
      return { type: 'NoOp' };

    case 'InsertText': {
      // opB inserted text BEFORE or AT our offset → shift our offset right.
      if (opB.offset <= opA.offset) {
        return { ...opA, offset: opA.offset + opB.text.length };
      }
      return opA;
    }

    case 'DeleteText': {
      // opB deleted text before our insertion point → shift left.
      if (opB.offset + opB.length <= opA.offset) {
        return { ...opA, offset: opA.offset - opB.length };
      }
      // opB deleted text that spans our offset → clamp to deletion start.
      if (opB.offset < opA.offset) {
        return { ...opA, offset: opB.offset };
      }
      return opA;
    }

    default:
      return opA;
  }
}

function transformDeleteText(
  opA: Extract<AtomicOp, { type: 'DeleteText' }>,
  opB: AtomicOp
): AtomicOp {
  if (opA.elementId !== (opB as any).elementId) return opA;

  switch (opB.type) {
    case 'DeleteElement':
      return { type: 'NoOp' };

    case 'InsertText': {
      // opB inserted before our range → shift our offset.
      if (opB.offset <= opA.offset) {
        return { ...opA, offset: opA.offset + opB.text.length };
      }
      // opB inserted inside our range → expand our deletion to cover it.
      if (opB.offset < opA.offset + opA.length) {
        return { ...opA, length: opA.length + opB.text.length };
      }
      return opA;
    }

    case 'DeleteText': {
      const endA = opA.offset + opA.length;
      const endB = opB.offset + opB.length;
      // opB entirely before us → shift left.
      if (endB <= opA.offset) return { ...opA, offset: opA.offset - opB.length };
      // opB entirely after us → no effect.
      if (opB.offset >= endA) return opA;
      // opB entirely covers us → already deleted, NoOp.
      if (opB.offset <= opA.offset && endB >= endA) return { type: 'NoOp' };
      // Partial overlaps: shrink our range.
      const newOffset = Math.min(opA.offset, opB.offset);
      const overlapStart = Math.max(opA.offset, opB.offset);
      const overlapEnd   = Math.min(endA, endB);
      const overlap      = Math.max(0, overlapEnd - overlapStart);
      return { ...opA, offset: newOffset, length: opA.length - overlap };
    }

    default:
      return opA;
  }
}
