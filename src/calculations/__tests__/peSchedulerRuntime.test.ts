import {
  buildClockEvaluationSequence,
  buildEventEvaluationSequence,
  expressionRequiresSchedulerContext,
  expressionRevision,
  findStatefulOccurrences,
  peScheduleIdentity,
  replayArma,
  replayDelay,
  replayEvaluationSequence,
  replayNoOutput,
  validatePeSchedule,
} from '../peSchedulerRuntime';

const trigger = { dataSourceUid: 'gpa', serverPath: 'PISRV', pointName: 'TRIGGER' };

describe('PE Scheduler context', () => {
  it('gera scans Clock determinísticos a partir de anchor e intervalo explícitos', () => {
    const schedule = { type: 'clock' as const, intervalSeconds: 60, anchor: '2026-01-01T00:00:00.000Z' };
    const scans = buildClockEvaluationSequence(schedule, Date.parse('2026-01-01T00:01:00Z'), Date.parse('2026-01-01T00:03:00Z'));
    expect(scans.map(({ sequence, timestamp }) => [sequence, timestamp])).toEqual([
      [1, Date.parse('2026-01-01T00:01:00Z')],
      [2, Date.parse('2026-01-01T00:02:00Z')],
      [3, Date.parse('2026-01-01T00:03:00Z')],
    ]);
    expect(buildClockEvaluationSequence(schedule, Date.parse('2026-01-01T00:01:00Z'), Date.parse('2026-01-01T00:03:00Z'))).toEqual(scans);
  });

  it('ordena Event por timestamp/identidade e elimina somente eventos duplicados', () => {
    const schedule = { type: 'event' as const, trigger, anchor: '1970-01-01T00:00:00Z' };
    const scans = buildEventEvaluationSequence(schedule, [
      { identity: 'event-2', timestamp: 3000 },
      { identity: 'event-1', timestamp: 1000 },
      { identity: 'event-2', timestamp: 3000 },
    ]);
    expect(scans.map(({ sequence, timestamp, triggerIdentity }) => [sequence, timestamp, triggerIdentity])).toEqual([
      [0, 1000, 'event-1'], [1, 3000, 'event-2'],
    ]);
    expect(new Set(scans.map(({ id }) => id)).size).toBe(2);
  });

  it('gera identidades estáveis e isola revisão, schedule e ocorrências', () => {
    expect(expressionRevision('Delay(A,1,2)')).toBe(expressionRevision('Delay(A,1,2)'));
    expect(expressionRevision('Delay(A,1,2)')).not.toBe(expressionRevision('Delay(A,1,3)'));
    expect(peScheduleIdentity({ type: 'event', trigger })).not.toBe(peScheduleIdentity({ type: 'clock', intervalSeconds: 1, anchor: '2026-01-01T00:00:00Z' }));
    const occurrences = findStatefulOccurrences("Delay(A,1,2) + Delay(B,1,2) + 'Delay(C,1,2)'");
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].id).not.toBe(occurrences[1].id);
    expect(expressionRequiresSchedulerContext('Average(A, B)')).toBe(false);
    expect(expressionRequiresSchedulerContext("'Delay(A,1,2)'" )).toBe(false);
    expect(expressionRequiresSchedulerContext('Average(Delay(A,1,2), 1)')).toBe(true);
  });

  it('marca função stateful aninhada para rejeição explícita posterior', () => {
    const occurrences = findStatefulOccurrences('Delay(Arma(A,1,(0),(1,1)),1,2)');
    expect(occurrences.map(({ functionName, nested }) => [functionName, nested])).toEqual([
      ['DELAY', false], ['ARMA', true],
    ]);
  });

  it('faz replay ordenado, idempotente e independente da ordem de requisição', async () => {
    const schedule = { type: 'clock' as const, intervalSeconds: 1, anchor: '2026-01-01T00:00:00Z' };
    const [scan0, scan1, scan2] = buildClockEvaluationSequence(schedule, Date.parse(schedule.anchor), Date.parse(schedule.anchor) + 2000);
    const visited: number[] = [];
    const result = await replayEvaluationSequence([scan2, scan0, scan1, scan1], (scan) => {
      visited.push(scan.sequence);
      return scan.sequence * 10;
    });
    expect(visited).toEqual([0, 1, 2]);
    expect(result.map(({ result: value }) => value)).toEqual([0, 10, 20]);
  });

  it('reconstrói o mesmo resultado sem depender de memória live', async () => {
    const schedule = { type: 'clock' as const, intervalSeconds: 1, anchor: '2026-01-01T00:00:00Z' };
    const scans = buildClockEvaluationSequence(schedule, Date.parse(schedule.anchor), Date.parse(schedule.anchor) + 2000);
    const run = () => {
      let accumulator = 0;
      return replayEvaluationSequence(scans, (scan) => accumulator += scan.sequence + 1);
    };
    expect(await run()).toEqual(await run());
  });

  it('aplica Delay por número de scans em Clock e Event, não por tempo decorrido', () => {
    const clock = { type: 'clock' as const, intervalSeconds: 60, anchor: '2026-01-01T00:00:00Z' };
    const clockScans = buildClockEvaluationSequence(clock, Date.parse(clock.anchor), Date.parse(clock.anchor) + 180_000);
    const clockResult = replayDelay(clockScans.map((scan, index) => ({ scan, input: (index + 1) * 10, runflag: 1 })), 2);
    expect(clockResult).toEqual([
      expect.objectContaining({ kind: 'calc-failed' }), expect.objectContaining({ kind: 'calc-failed' }),
      expect.objectContaining({ kind: 'value', value: 10 }), expect.objectContaining({ kind: 'value', value: 20 }),
    ]);

    const eventScans = buildEventEvaluationSequence({ type: 'event', trigger }, [
      { identity: 'a', timestamp: 1 }, { identity: 'b', timestamp: 100 }, { identity: 'c', timestamp: 10_000 },
    ]);
    expect(replayDelay(eventScans.map((scan, index) => ({ scan, input: index + 1, runflag: 1 })), 1).at(-1))
      .toMatchObject({ kind: 'value', value: 2 });
  });

  it('aplica a recorrência oficial Arma quando o estado inicial é conhecido', () => {
    const clock = { type: 'clock' as const, intervalSeconds: 1, anchor: '2026-01-01T00:00:00Z' };
    const scans = buildClockEvaluationSequence(clock, Date.parse(clock.anchor), Date.parse(clock.anchor) + 1000);
    const result = replayArma(
      scans.map((scan, index) => ({ scan, input: index + 2, runflag: 1 })),
      [0.5],
      [1, 2],
      { previousInputs: [1], previousOutputs: [10] },
    );
    expect(result).toEqual([
      expect.objectContaining({ kind: 'value', value: 9 }),
      expect.objectContaining({ kind: 'value', value: 11.5 }),
    ]);
  });

  it('mantém NoOutput fora da série e reconstrói o último output/timestamp', () => {
    const trajectory = replayNoOutput([
      { kind: 'value', value: 10, timestamp: 1000 },
      { kind: 'no-output', timestamp: 2000 },
      { kind: 'value', value: 20, timestamp: 3000 },
    ]);
    expect(trajectory[1].lastEmitted).toEqual({ kind: 'value', value: 10, timestamp: 1000 });
    expect(trajectory[2].lastEmitted).toEqual({ kind: 'value', value: 20, timestamp: 3000 });
    expect(replayNoOutput([{ kind: 'no-output', timestamp: 1000 }])[0].lastEmitted).toBeUndefined();
  });

  it('não inventa semântica para runflag zero de Delay', () => {
    const clock = { type: 'clock' as const, intervalSeconds: 1, anchor: '2026-01-01T00:00:00Z' };
    const [scan] = buildClockEvaluationSequence(clock, Date.parse(clock.anchor), Date.parse(clock.anchor));
    expect(() => replayDelay([{ scan, input: 1, runflag: 0 }], 1)).toThrow('semântica oficial');
  });

  it('rejeita schedules, limites e identidades inconsistentes', async () => {
    expect(() => validatePeSchedule({ type: 'clock', intervalSeconds: 0, anchor: '2026-01-01T00:00:00Z' })).toThrow('intervalo positivo');
    expect(() => validatePeSchedule({ type: 'event', trigger: { ...trigger, pointName: '' } })).toThrow('trigger completo');
    const clock = { type: 'clock' as const, intervalSeconds: 1, anchor: '1970-01-01T00:00:00Z' };
    expect(() => buildClockEvaluationSequence(clock, 0, 2000, 1)).toThrow('limite explícito');
    const scan = { id: 'same', sequence: 1, timestamp: 1, source: 'explicit-clock' as const };
    await expect(replayEvaluationSequence([scan, { ...scan, timestamp: 2 }], () => 1)).rejects.toThrow('conteúdo diferente');
  });
});
