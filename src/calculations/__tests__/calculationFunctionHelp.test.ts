import { piCompatibilityCatalog } from '../piCompatibilityCatalog';
import { calculationExtensionHelp, calculationFunctionHelp, calculationFunctionHelpItems } from '../calculationFunctionHelp';

describe('calculation function help', () => {
  it('contains exactly one help entry for every official catalog function', () => {
    const catalogNames = Object.values(piCompatibilityCatalog).flat();
    const helpNames = calculationFunctionHelp.map(item => item.name);

    expect(new Set(catalogNames).size).toBe(catalogNames.length);
    expect(new Set(helpNames).size).toBe(helpNames.length);
    expect(helpNames.sort()).toEqual([...catalogNames].sort());
    expect(calculationFunctionHelp.every(item => item.signature && item.template && item.description && item.example)).toBe(true);
  });

  it('mantém apenas extensões executáveis e não duplica nomes oficiais', () => {
    const officialNames = new Set(calculationFunctionHelp.map(item => item.name.toLocaleUpperCase()));
    expect(calculationExtensionHelp.map(item => item.name)).toEqual(['IF', 'SE', 'AND', 'OR', 'NOT', 'ABS', 'CLAMP', 'POWER', 'SQRT']);
    expect(calculationExtensionHelp.every(item => !officialNames.has(item.name.toLocaleUpperCase()))).toBe(true);
    expect(new Set(calculationFunctionHelpItems.map(item => item.name.toLocaleUpperCase())).size).toBe(calculationFunctionHelpItems.length);
  });
});
