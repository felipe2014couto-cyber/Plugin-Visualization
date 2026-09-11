import { assertPiGoldenMatch, comparePiGolden, type PiGoldenObservation } from '../piGoldenHarness';

const base: PiGoldenObservation = {
  source: 'pi-real',
  functionName: 'NoOutput',
  expression: 'NoOutput()',
  scanId: 'clock-2',
  timestamp: '2026-01-01T00:02:00.000Z',
  input: 20,
  runflag: 1,
  stateBefore: { lastOutput: 10 },
  piExpected: { kind: 'no-output' },
  pluginActual: { kind: 'no-output' },
  stateAfter: { lastOutput: 10 },
};

describe('PI golden harness', () => {
  it('aceita NoOutput somente quando ambos os lados não emitem evento', () => {
    expect(comparePiGolden(base)).toEqual({ match: true, mismatches: [] });
    expect(comparePiGolden({ ...base, pluginActual: { kind: 'value', value: 0 } })).toMatchObject({
      match: false,
      mismatches: ['kind: PI=no-output plugin=value'],
    });
  });

  it('compara timestamp, quality e código de Digital State sem coerção', () => {
    const observation: PiGoldenObservation = {
      ...base,
      functionName: 'AlmCondition',
      piExpected: { kind: 'value', value: 'High', timestamp: '2026-01-01T00:02:00.000Z', quality: { Good: true }, digitalState: { name: 'High', code: 313, isSystem: false } },
      pluginActual: { kind: 'value', value: 'High', timestamp: '2026-01-01T00:02:00.000Z', quality: { Good: true }, digitalState: { name: 'High', code: 312, isSystem: false } },
    };
    expect(comparePiGolden(observation)).toMatchObject({ match: false });
    expect(comparePiGolden(observation).mismatches[0]).toContain('digitalState');
  });

  it('mantém categorias de erro distintas', () => {
    const observation: PiGoldenObservation = {
      ...base,
      functionName: 'Delay',
      piExpected: { kind: 'error', code: 'CALC_FAILED', message: 'Startup' },
      pluginActual: { kind: 'error', code: 'NO_DATA', message: 'Startup' },
    };
    expect(() => assertPiGoldenMatch(observation)).toThrow('error.code');
  });

  it('rejeita fixture que não tenha sido capturada do PI real', () => {
    expect(() => comparePiGolden({ ...base, source: 'mock' })).toThrow('pi-real');
  });
});
