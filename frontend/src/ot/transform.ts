// frontend/src/ot/transform.ts — Client-side mirror of backend transform engine.
// MUST stay in sync with backend/ot/transform.ts.

import { AtomicOp, ClientOp } from './types';

// ─── Apply ────────────────────────────────────────────────────────────────────

export function applyAtomicOp(elements: any[], op: AtomicOp): any[] {
  switch (op.type) {
    case 'NoOp': return elements;

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
      if (idx === -1) return [...elements, op.element];
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

    default: return elements;
  }
}

export function applyOp(elements: any[], op: Pick<ClientOp, 'ops'>): any[] {
  let result = elements;
  for (const atomic of op.ops) result = applyAtomicOp(result, atomic);
  return result;
}

// ─── Transform ────────────────────────────────────────────────────────────────

export function transformAtomic(opA: AtomicOp, opB: AtomicOp): AtomicOp {
  if (opA.type === 'NoOp') return opA;
  if (opB.type === 'NoOp') return opA;

  switch (opA.type) {
    case 'SetProperty':    return txSetProperty(opA, opB);
    case 'InsertElement':  return txInsertElement(opA, opB);
    case 'DeleteElement':  return txDeleteElement(opA, opB);
    case 'MoveElement':    return txMoveElement(opA, opB);
    case 'InsertText':     return txInsertText(opA, opB);
    case 'DeleteText':     return txDeleteText(opA, opB);
    default:               return opA;
  }
}

export function transformBatch(opsA: AtomicOp[], opsB: AtomicOp[]): AtomicOp[] {
  let current = opsA;
  for (const b of opsB) current = current.map(a => transformAtomic(a, b));
  return current;
}

// ─── Per-type rules ───────────────────────────────────────────────────────────

function txSetProperty(
  opA: Extract<AtomicOp, { type: 'SetProperty' }>, opB: AtomicOp
): AtomicOp {
  if (opB.type === 'SetProperty' && opA.elementId === opB.elementId && opA.key === opB.key)
    return { type: 'NoOp' };
  if (opB.type === 'DeleteElement' && opA.elementId === opB.elementId)
    return { type: 'NoOp' };
  return opA;
}

function txInsertElement(
  opA: Extract<AtomicOp, { type: 'InsertElement' }>, opB: AtomicOp
): AtomicOp {
  if (opB.type === 'InsertElement' && opA.afterId === opB.afterId && opA.pageId === opB.pageId)
    return { ...opA, afterId: (opB.element as any).id as string };
  if (opB.type === 'DeleteElement' && opA.afterId === opB.elementId)
    return { ...opA, afterId: null };
  return opA;
}

function txDeleteElement(
  opA: Extract<AtomicOp, { type: 'DeleteElement' }>, opB: AtomicOp
): AtomicOp {
  if (opB.type === 'DeleteElement' && opA.elementId === opB.elementId)
    return { type: 'NoOp' };
  return opA;
}

function txMoveElement(
  opA: Extract<AtomicOp, { type: 'MoveElement' }>, opB: AtomicOp
): AtomicOp {
  if (opB.type === 'DeleteElement') {
    if (opA.elementId === opB.elementId) return { type: 'NoOp' };
    if (opA.afterId === opB.elementId) return { ...opA, afterId: null };
  }
  if (opB.type === 'MoveElement') {
    if (opA.elementId === opB.afterId && opB.elementId === opA.afterId)
      return { type: 'NoOp' }; // cycle detected — server wins
    if (opA.afterId === opB.elementId)
      return { ...opA, afterId: opB.afterId };
  }
  return opA;
}

function txInsertText(
  opA: Extract<AtomicOp, { type: 'InsertText' }>, opB: AtomicOp
): AtomicOp {
  if ((opB as any).elementId !== opA.elementId) return opA;
  if (opB.type === 'DeleteElement') return { type: 'NoOp' };
  if (opB.type === 'InsertText') {
    if (opB.offset <= opA.offset)
      return { ...opA, offset: opA.offset + opB.text.length };
  }
  if (opB.type === 'DeleteText') {
    if (opB.offset + opB.length <= opA.offset)
      return { ...opA, offset: opA.offset - opB.length };
    if (opB.offset < opA.offset)
      return { ...opA, offset: opB.offset };
  }
  return opA;
}

function txDeleteText(
  opA: Extract<AtomicOp, { type: 'DeleteText' }>, opB: AtomicOp
): AtomicOp {
  if ((opB as any).elementId !== opA.elementId) return opA;
  if (opB.type === 'DeleteElement') return { type: 'NoOp' };
  if (opB.type === 'InsertText') {
    if (opB.offset <= opA.offset)
      return { ...opA, offset: opA.offset + opB.text.length };
    if (opB.offset < opA.offset + opA.length)
      return { ...opA, length: opA.length + opB.text.length };
  }
  if (opB.type === 'DeleteText') {
    const endA = opA.offset + opA.length;
    const endB = opB.offset + opB.length;
    if (endB <= opA.offset) return { ...opA, offset: opA.offset - opB.length };
    if (opB.offset >= endA) return opA;
    if (opB.offset <= opA.offset && endB >= endA) return { type: 'NoOp' };
    const newOffset = Math.min(opA.offset, opB.offset);
    const overlapStart = Math.max(opA.offset, opB.offset);
    const overlap = Math.max(0, Math.min(endA, endB) - overlapStart);
    return { ...opA, offset: newOffset, length: opA.length - overlap };
  }
  return opA;
}
