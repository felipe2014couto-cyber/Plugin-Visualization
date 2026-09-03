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

  it('avalia condições e funções declarativas', () => {
    expect(evaluateCalculation({
      ...calculation,
      expression: 'IF(AND(Vazao_01 > 20, Producao_01 >= 50), ROUND(MAX(Vazao_01, Producao_01) / 3, 2), 0)',
    }, new Map([
      ['Vazao_01', 25],
      ['Producao_01', 50],
    ]))).toEqual({ status: 'success', value: 16.67 });
  });

  it('avalia comparações com estados digitais do PI', () => {
    expect(evaluateCalculation({
      ...calculation,
      expression: 'IF(Estado == "On", 1, IF(Estado == "Off", 2, 3))',
      inputs: [{ name: 'Estado', binding: { dataSourceUid: 'pi', serverPath: 'pims', pointName: 'Estado' } }],
    }, new Map([['Estado', 'Off']]))).toEqual({ status: 'success', value: 2 });
  });

  it('rejeita WHILE para preservar a execução limitada', () => {
    expect(evaluateCalculation({ ...calculation, expression: 'WHILE(1, 1)' }, new Map([
      ['Vazao_01', 25],
      ['Producao_01', 50],
    ]))).toMatchObject({ status: 'error' });
  });

  it('rejeita PI Points com valor numérico não finito', () => {
    expect(evaluateCalculation(calculation, new Map([
      ['Vazao_01', NaN],
      ['Producao_01', 50],
    ]))).toMatchObject({ status: 'error' });

    expect(evaluateCalculation(calculation, new Map([
      ['Vazao_01', Infinity],
      ['Producao_01', 50],
    ]))).toMatchObject({ status: 'error' });
  });

  it('suporta parsing de dias da semana e rejeita expressões de tempo inválidas', () => {
    const weekdayCalc: CalculationDefinition = {
      id: '2',
      name: 'Hora do dia',
      expression: 'HOUR(mon) >= 0',
      inputs: [],
    };
    expect(evaluateCalculation(weekdayCalc, new Map())).toEqual({ status: 'success', value: 1 });

    const invalidTimeCalc: CalculationDefinition = {
      id: '3',
      name: 'Tempo inválido',
      expression: '"not_a_valid_date_or_time"',
      inputs: [],
    };
    expect(evaluateCalculation(invalidTimeCalc, new Map())).toMatchObject({ status: 'error' });
  });

  it('avalia operador de exponenciação ^ e fórmulas polinomiais com potências', () => {
    const polyCalc: CalculationDefinition = {
      id: '4',
      name: 'BS5_T3%_CALC',
      expression: '(-0.194 +0.0854*(LFS_CL1_TR_BS5WIND/50)-0.00295*(LFS_CL1_TR_BS5WIND/50)^2)*100',
      inputs: [
        { name: 'LFS_CL1_TR_BS5WIND', binding: { dataSourceUid: 'pi', serverPath: 'pims', pointName: 'LFS_CL1_TR_BS5WIND' } },
      ],
    };
    // Com valor 50: (-0.194 + 0.0854*1 - 0.00295*1) * 100 = -11.155
    const res = evaluateCalculation(polyCalc, new Map([['LFS_CL1_TR_BS5WIND', 50]]));
    expect(res.status).toBe('success');
    if (res.status === 'success') {
      expect(res.value).toBeCloseTo(-11.155, 3);
    }

    // Exponenciação direta
    const simplePower: CalculationDefinition = {
      id: '5',
      name: 'Power',
      expression: '2 ^ 3 + 3 ** 2',
      inputs: [],
    };
    expect(evaluateCalculation(simplePower, new Map())).toEqual({ status: 'success', value: 17 });
  });

  it('suporta funções matemáticas como SQRT, POW e MOD e operador <>', () => {
    const mathCalc: CalculationDefinition = {
      id: '6',
      name: 'Math',
      expression: 'SQRT(16) + POW(2, 4) + (10 % 3) + IF(5 <> 3, 10, 0)',
      inputs: [],
    };
    // 4 + 16 + 1 + 10 = 31
    expect(evaluateCalculation(mathCalc, new Map())).toEqual({ status: 'success', value: 31 });
  });
});
