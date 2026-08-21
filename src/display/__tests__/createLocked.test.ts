import { createDisplayDocument } from '../createDisplayDocument';
import { createRectangle } from '../createRectangle';
import { createText } from '../createText';
import { createGroup } from '../createGroup';
import { isElementLocked, updateElementLocked } from '../createLocked';

describe('createLocked utilities', () => {
  it('identifica corretamente se um elemento ou grupo está bloqueado', () => {
    const unlockedEl = createRectangle({ x: 0, y: 0, width: 100, height: 50 });
    const lockedEl = createText({ x: 10, y: 10, width: 80, height: 30, properties: { locked: true } });
    const group = createGroup({ elements: [unlockedEl], properties: { locked: true } });

    expect(isElementLocked(unlockedEl)).toBe(false);
    expect(isElementLocked(lockedEl)).toBe(true);
    expect(isElementLocked(group)).toBe(true);
    expect(isElementLocked(null)).toBe(false);
  });

  it('atualiza o estado de bloqueio de um elemento ou lista de elementos no documento', () => {
    const doc = createDisplayDocument({ name: 'Doc' });
    const el1 = createRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 50 });
    const el2 = createText({ id: 't1', x: 10, y: 10, width: 80, height: 30 });
    const docWithElements = { ...doc, elements: [el1, el2] };

    // Lock el1
    const lockedDoc = updateElementLocked(docWithElements, 'r1', true);
    expect(isElementLocked(lockedDoc.elements.find((el) => el.id === 'r1'))).toBe(true);
    expect(isElementLocked(lockedDoc.elements.find((el) => el.id === 't1'))).toBe(false);

    // Lock both
    const multiLockedDoc = updateElementLocked(lockedDoc, ['r1', 't1'], true);
    expect(isElementLocked(multiLockedDoc.elements.find((el) => el.id === 'r1'))).toBe(true);
    expect(isElementLocked(multiLockedDoc.elements.find((el) => el.id === 't1'))).toBe(true);

    // Unlock both
    const unlockedDoc = updateElementLocked(multiLockedDoc, ['r1', 't1'], false);
    expect(isElementLocked(unlockedDoc.elements.find((el) => el.id === 'r1'))).toBe(false);
    expect(isElementLocked(unlockedDoc.elements.find((el) => el.id === 't1'))).toBe(false);
  });
});
