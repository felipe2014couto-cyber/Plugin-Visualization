import { evaluateCalculation, type CalculationDefinition } from '../calculationEngine';

const calculation: CalculationDefinition = {
  id: '1',
  name: 'Eficiência',
  expression: 'Vazao_01 / Producao_01 * 100',
  inputs: [
    { name: 'Vazao_01', binding: { dataSourceUid: 'pi', serverPath: 'pims', pointName: 'Vazao_01' } },
    { name: 'Producao_01', binding: { dataSourceUid: 'pi', serverPath: 'pims', pointName: 'Producao_01' } },
  ],
};

describe('calculationEngine', () => {
  it('avalia expressões aritméticas com valores de PI Points', () => {
    expect(evaluateCalculation(calculation, new Map([
      ['Vazao_01', 25],
      ['Producao_01', 50],
    ]))).toEqual({ status: 'success', value: 50 });
  });

  it('não executa tokens que não fazem parte da gramática aritmética', () => {
    expect(evaluateCalculation({ ...calculation, expression: '1 + alert(1)' }, new Map([
      ['Vazao_01', 25],
      ['Producao_01', 50],
    ]))).toMatchObject({ status: 'error' });
  });

  it('indica carregamento enquanto um PI Point ainda não tem valor', () => {
    expect(evaluateCalculation(calculation, new Map([['Vazao_01', 25]]))).toEqual({ status: 'loading' });
  });
});
