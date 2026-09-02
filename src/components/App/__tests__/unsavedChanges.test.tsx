import { serializePersistableDocument } from '../unsavedChanges';
import { createDisplayDocument } from '../../../display/createDisplayDocument';

describe('serializePersistableDocument', () => {
  it('serializes a document and ignores runtime state', () => {
    const doc = createDisplayDocument({ name: 'Test' });
    const serialized = serializePersistableDocument(doc);
    expect(typeof serialized).toBe('string');
    
    const parsed = JSON.parse(serialized);
    expect(parsed.name).toBe('Test');
    expect(parsed.id).toBe(doc.id);
    expect(parsed.elements).toEqual([]);
    expect(parsed).toHaveProperty('schemaVersion');
    expect(parsed).toHaveProperty('surface');
  });

  it('produces the same fingerprint for identical documents', () => {
    const docA = createDisplayDocument({ name: 'Identical' });
    const docB = { ...docA };
    expect(serializePersistableDocument(docA)).toBe(serializePersistableDocument(docB));
  });

  it('produces different fingerprints when elements change', () => {
    const docA = createDisplayDocument({ name: 'Base' });
    const docB = { ...docA, elements: [{ id: '1', type: 'value', x: 0, y: 0, width: 10, height: 10, properties: {} }] };
    expect(serializePersistableDocument(docA)).not.toBe(serializePersistableDocument(docB));
  });

  it('ignores arbitrary extra properties not tracked', () => {
    const doc = createDisplayDocument({ name: 'Test' });
    // This assumes we add some runtime state to the document object
    const docWithRuntime = { ...doc, runtimeState: 'active' } as any;
    expect(serializePersistableDocument(doc)).toBe(serializePersistableDocument(docWithRuntime));
  });
});
