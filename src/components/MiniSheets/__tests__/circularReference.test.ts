import { evaluateStaticFormulasBase } from '../MiniSheetsPanel';
import { CellData } from '../MiniSheetsPanel';

describe('MiniSheets Circular Reference and Dependency Resolution', () => {
  it('should detect direct circular reference (A1=B1, B1=A1)', () => {
    const currentMap = new Map<string, CellData>();
    currentMap.set('0,0', { rawValue: '=B1', displayValue: '' }); // A1
    currentMap.set('1,0', { rawValue: '=A1', displayValue: '' }); // B1

    const { nextMap } = evaluateStaticFormulasBase(currentMap, 20, 50);

    expect(nextMap.get('0,0')?.displayValue).toBe('#REF_CYCLE!');
    expect(nextMap.get('1,0')?.displayValue).toBe('#REF_CYCLE!');
  });

  it('should detect indirect circular reference (A1=B1, B1=C1, C1=A1)', () => {
    const currentMap = new Map<string, CellData>();
    currentMap.set('0,0', { rawValue: '=B1', displayValue: '' }); // A1
    currentMap.set('1,0', { rawValue: '=C1', displayValue: '' }); // B1
    currentMap.set('2,0', { rawValue: '=A1', displayValue: '' }); // C1

    const { nextMap } = evaluateStaticFormulasBase(currentMap, 20, 50);

    expect(nextMap.get('0,0')?.displayValue).toBe('#REF_CYCLE!');
    expect(nextMap.get('1,0')?.displayValue).toBe('#REF_CYCLE!');
    expect(nextMap.get('2,0')?.displayValue).toBe('#REF_CYCLE!');
  });

  it('should correctly evaluate topological dependencies (A1=B1+10, B1=5)', () => {
    const currentMap = new Map<string, CellData>();
    currentMap.set('0,0', { rawValue: '=B1+10', displayValue: '' }); // A1
    currentMap.set('1,0', { rawValue: '=5', displayValue: '' }); // B1

    const { nextMap } = evaluateStaticFormulasBase(currentMap, 20, 50);

    expect(nextMap.get('1,0')?.displayValue).toBe('5');
    expect(nextMap.get('0,0')?.displayValue).toBe('15');
  });

  it('should not evaluate PI functions but use their display value in dependencies', () => {
    const currentMap = new Map<string, CellData>();
    // PICurrVal is resolved outside of evaluateStaticFormulasBase, so we simulate it already having a display value
    currentMap.set('0,0', { rawValue: '=PICurrVal("TAG")', displayValue: '100' }); // A1
    currentMap.set('1,0', { rawValue: '=A1*2', displayValue: '' }); // B1

    const { nextMap } = evaluateStaticFormulasBase(currentMap, 20, 50);

    // A1 remains as is
    expect(nextMap.get('0,0')?.displayValue).toBe('100');
    // B1 successfully depends on A1's value
    expect(nextMap.get('1,0')?.displayValue).toBe('200');
  });

  it('should stop after max depth is exceeded', () => {
    const currentMap = new Map<string, CellData>();
    // Create a very long chain A1 -> A2 -> A3 -> ... -> A150
    for (let i = 0; i < 150; i++) {
      currentMap.set(`0,${i}`, { rawValue: `=A${i + 2}`, displayValue: '' });
    }

    const { nextMap } = evaluateStaticFormulasBase(currentMap, 20, 200);

    // It should trigger a REF_DEPTH error eventually
    const values = Array.from(nextMap.values()).map(v => v.displayValue);
    expect(values).toContain('#REF_DEPTH!');
  });
});
