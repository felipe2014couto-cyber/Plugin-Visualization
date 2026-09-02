import { appendTrendSnapshot, canAppendTrendSnapshot } from '../incrementalTrend';

describe('incremental trend', () => {
  it('aceita somente o avanço da mesma janela móvel', () => {
    expect(canAppendTrendSnapshot({ from: 0, to: 100 }, { from: 10, to: 110 })).toBe(true);
    expect(canAppendTrendSnapshot({ from: 0, to: 100 }, { from: 0, to: 200 })).toBe(false);
    expect(canAppendTrendSnapshot({ from: 0, to: 100 }, { from: -10, to: 90 })).toBe(false);
  });

  it('remove pontos fora da janela e injeta somente o snapshot numérico atual', () => {
    expect(appendTrendSnapshot({
      pointName: 'TAG',
      points: [{ time: 5, value: 1 }, { time: 20, value: 2 }],
    }, { value: 3 }, { from: 10, to: 30 })).toEqual({
      pointName: 'TAG',
      points: [{ time: 20, value: 2 }, { time: 30, value: 3 }],
    });
  });

  it('injeta estados textuais sem transformar a série em BAD', () => {
    expect(appendTrendSnapshot({
      pointName: 'STATE',
      points: [],
      states: [{ time: 20, value: 'Running' }],
    }, { value: 'Stopped' }, { from: 10, to: 30 })).toEqual({
      pointName: 'STATE',
      points: [],
      states: [{ time: 20, value: 'Running' }, { time: 30, value: 'Stopped' }],
    });
  });
});
