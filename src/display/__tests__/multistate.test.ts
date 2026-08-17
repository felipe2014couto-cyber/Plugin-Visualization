import { createDisplayDocument } from '../createDisplayDocument';
import { appendBar, createBar } from '../createBar';
import { appendGauge, createGauge } from '../createGauge';
import { appendValue, createValue } from '../createValue';
import {
  evaluateMultistate,
  isValidMultistateRule,
  updateMultistateConfig,
  type MultistateConfig,
} from '../multistate';

const config = (rules: MultistateConfig['rules']): MultistateConfig => ({ enabled: true, rules });
const rule = (id: string, operator: MultistateConfig['rules'][number]['operator'], value: number, color = '#ff0000', value2?: number) => ({
  id, operator, value, color, ...(value2 === undefined ? {} : { value2 }),
});

describe('Multistate', () => {
  it('avalia operadores numéricos e ignora valores inválidos', () => {
    expect(evaluateMultistate(10, config([rule('lt', 'lt', 20)]))?.color).toBe('#ff0000');
    expect(evaluateMultistate(20, config([rule('lt', 'lt', 20)]))).toBeUndefined();
    expect(evaluateMultistate(20, config([rule('lte', 'lte', 20)]))).toBeDefined();
    expect(evaluateMultistate(50, config([rule('gt', 'gt', 20)]))).toBeDefined();
    expect(evaluateMultistate(20, config([rule('gte', 'gte', 20)]))).toBeDefined();
    expect(evaluateMultistate(20, config([rule('eq', 'eq', 20)]))).toBeDefined();
    expect(evaluateMultistate('20', config([rule('string-number', 'gte', 20)]))).toBeDefined();
    for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 'not-a-number']) {
      expect(evaluateMultistate(value, config([rule('invalid', 'gte', 0)]))).toBeUndefined();
    }
  });

  it('usa BETWEEN como mínimo inclusivo e máximo exclusivo', () => {
    const between = rule('between', 'between', 20, '#00ff00', 80);
    expect(isValidMultistateRule(between)).toBe(true);
    expect(evaluateMultistate(19.99, config([between]))).toBeUndefined();
    expect(evaluateMultistate(20, config([between]))).toBeDefined();
    expect(evaluateMultistate(50, config([between]))).toBeDefined();
    expect(evaluateMultistate(79.99, config([between]))).toBeDefined();
    expect(evaluateMultistate(80, config([between]))).toBeUndefined();
    expect(isValidMultistateRule({ ...between, value2: 20 })).toBe(false);
    expect(evaluateMultistate(20, config([{ ...between, value2: 20 }]))).toBeUndefined();
  });

  it('usa primeira correspondência e retorna ao fallback sem match', () => {
    const rules = [rule('first', 'gt', 10, '#ff0000'), rule('second', 'gt', 50, '#ffff00')];
    expect(evaluateMultistate(60, config(rules))?.rule.id).toBe('first');
    expect(evaluateMultistate(5, config(rules))).toBeUndefined();
    expect(evaluateMultistate(60, { enabled: false, rules })).toBeUndefined();
  });

  it('aceita regra transparente', () => {
    const transparent = rule('transparent', 'eq', 0, 'transparent');
    expect(isValidMultistateRule(transparent)).toBe(true);
    expect(evaluateMultistate(0, config([transparent]))?.color).toBe('transparent');
  });

  it('persiste configuração aditiva em Value, Gauge e Barra sem runtime', () => {
    const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };
    const base = createDisplayDocument({ id: 'display' });
    const value = createValue({ id: 'value', binding });
    const gauge = createGauge({ id: 'gauge', binding });
    const bar = createBar({ id: 'bar', binding });
    const document = appendBar(appendGauge(appendValue(base, value), gauge), bar);
    const multistate = config([rule('stable-rule', 'gte', 80, '#f9a825')]);
    const next = ['value', 'gauge', 'bar'].reduce((current, id) => updateMultistateConfig(current, id, multistate), document);
    for (const element of next.elements) {
      expect(element.properties.multistate).toEqual(multistate);
      expect(element.properties).not.toHaveProperty('activeRule');
      expect(element.properties).not.toHaveProperty('currentValue');
      expect(element.properties).not.toHaveProperty('runtimeColor');
    }
  });
});
