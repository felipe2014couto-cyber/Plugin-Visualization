import { getElementDataSourceCapability, replaceElementPiBinding } from '../dataSourceBehavior';
import type { DisplayDocument } from '../displayDocument';
import type { DisplayElement } from '../displayElement';
import type { PiPointBinding } from '../../pi/piPointBinding';

describe('dataSourceBehavior', () => {
  describe('getElementDataSourceCapability', () => {
    it('identifies single capability elements', () => {
      expect(getElementDataSourceCapability({ type: 'value' } as DisplayElement)).toBe('single');
      expect(getElementDataSourceCapability({ type: 'gauge' } as DisplayElement)).toBe('single');
      expect(getElementDataSourceCapability({ type: 'bar' } as DisplayElement)).toBe('single');
      expect(getElementDataSourceCapability({ type: 'text' } as DisplayElement)).toBe('single');
      expect(getElementDataSourceCapability({ type: 'rectangle' } as DisplayElement)).toBe('single');
      expect(getElementDataSourceCapability({ type: 'library-symbol' } as DisplayElement)).toBe('single');
    });

    it('identifies multiple capability elements', () => {
      expect(getElementDataSourceCapability({ type: 'trend' } as DisplayElement)).toBe('multiple');
      expect(getElementDataSourceCapability({ type: 'table' } as DisplayElement)).toBe('multiple');
      expect(getElementDataSourceCapability({ type: 'bar-chart' } as DisplayElement)).toBe('multiple');
    });

    it('identifies xy capability elements', () => {
      expect(getElementDataSourceCapability({ type: 'xy-plot' } as DisplayElement)).toBe('xy');
    });

    it('returns none for unknown or unrelated elements', () => {
      expect(getElementDataSourceCapability({ type: 'image' } as DisplayElement)).toBe('none');
      expect(getElementDataSourceCapability({ type: 'link' } as DisplayElement)).toBe('none');
    });
  });

  describe('replaceElementPiBinding', () => {
    const mockBinding: PiPointBinding = {
      dataSourceUid: 'uid1',
      serverPath: '\\\\SERVER',
      pointName: 'TAG.PV',
    };

    it('replaces binding and retains other properties', () => {
      const doc = {
        id: 'doc1',
        schemaVersion: 1,
        name: 'Test',
        elements: [
          {
            id: 'e1',
            type: 'value',
            x: 10,
            y: 20,
            width: 100,
            height: 50,
            properties: {
              foo: 'bar',
              binding: { dataSourceUid: 'uid1', serverPath: 'old', pointName: 'old' },
            },
          },
        ],
        surface: { width: 1000, height: 1000, backgroundColor: 'white' },
      } as unknown as DisplayDocument;

      const result = replaceElementPiBinding(doc, 'e1', mockBinding);
      
      expect(result.elements[0].properties.binding).toEqual(mockBinding);
      expect(result.elements[0].properties.foo).toBe('bar');
      expect(result.elements[0].x).toBe(10);
      expect(result.elements[0].id).toBe('e1');
      expect(result.elements.length).toBe(1);
    });

    it('removes calculationId if present', () => {
      const doc = {
        id: 'doc1',
        schemaVersion: 1,
        name: 'Test',
        elements: [
          {
            id: 'e1',
            type: 'value',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            properties: {
              calculationId: 'calc1',
            },
          },
        ],
        surface: { width: 1000, height: 1000, backgroundColor: 'white' },
      } as unknown as DisplayDocument;

      const result = replaceElementPiBinding(doc, 'e1', mockBinding);
      
      expect(result.elements[0].properties.binding).toEqual(mockBinding);
      expect(result.elements[0].properties.calculationId).toBeUndefined();
    });

    it('returns original document if element not found', () => {
      const doc = {
        id: 'doc1',
        schemaVersion: 1,
        name: 'Test',
        elements: [],
        surface: { width: 1000, height: 1000, backgroundColor: 'white' },
      } as unknown as DisplayDocument;

      const result = replaceElementPiBinding(doc, 'missing', mockBinding);
      expect(result).toBe(doc);
    });
  });
});
