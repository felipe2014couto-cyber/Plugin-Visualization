import React, { useEffect, useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import type { PiPointSearchResult, PiPointValue } from '../../pi/piDataSource';
import { createPiPointBinding } from '../../pi/piPointBinding';
import { PI_POINT_DRAG_MIME, parsePiPointDragData } from '../../pi/piPointDrag';
import { evaluateCalculation, type CalculationDefinition, type CalculationInput } from '../../calculations/calculationEngine';
import { hasPendingHistoricalRequests, waitForPendingHistoricalRequests, hasPendingMetadataRequests, waitForPendingMetadataRequests, hasPendingDigitalStateRequests, waitForPendingDigitalStateRequests } from '../../calculations/calculationMacros';
import { classifyPiExpression, evaluatePiExpression, piExpressionFunctionNames, PiCalculationUnavailableError, probePiCalculationController } from '../../pi/piCalculation';
import { expressionRequiresSchedulerContext, expressionRequiresStatefulScheduler, peScheduleIdentity, requirePeSchedulerContext, PeSchedulerError, validatePeSchedule, type PeCalculationSchedule } from '../../calculations/peSchedulerRuntime';
import { capturePiGoldenRuntime, discoverPiGoldenAlarmStateSets, discoverPiGoldenPerformanceEquations, inspectPiGoldenQualityEvidence, normalizePiGoldenTimestamp } from '../../calculations/piGoldenRuntime';
import { calculationFunctionCategories, calculationFunctionHelpItems } from '../../calculations/calculationFunctionHelp';
import { piCompatibilityMatrix } from '../../calculations/piCompatibilityCatalog';


import { isPiTimeString } from '../../calculations/calculationMacros';

const CALCULATION_RESERVED_NAMES = new Set(['IF', 'SE', 'AND', 'OR', 'NOT', 'MIN', 'MAX', 'ABS', 'ROUND', 'CLAMP', 'WHILE', 'POW', 'POWER', 'SQRT', 'SQR', 'EXP', 'LOG', 'LN', 'LOG10', 'MOD', 'SIN', 'COS', 'TAN']);
const PI_GOLDEN_FUNCTIONS = new Set(['SQR', 'TAGVAL', 'HOUR', 'BADVAL', 'TAGBAD', 'ISSET', 'ALMACKSTAT', 'ALMCONDITION', 'ALMCONDTEXT', 'ALMPRIORITY']);
const PI_GOLDEN_FUNCTION_NAMES = {
  SQR: 'Sqr', TAGVAL: 'TagVal', HOUR: 'Hour', BADVAL: 'BadVal', TAGBAD: 'TagBad', ISSET: 'IsSet',
  ALMACKSTAT: 'AlmAckStat', ALMCONDITION: 'AlmCondition', ALMCONDTEXT: 'AlmCondText', ALMPRIORITY: 'AlmPriority',
} as const;

export interface CalculationDraft {
  name: string;
  description: string;
  expression: string;
  inputs: CalculationInput[];
  schedule?: PeCalculationSchedule;
}

export interface CalculationEditorDialogProps {
  initialCalculation?: CalculationDefinition;
  resolvePiPoint?: (name: string) => Promise<PiPointSearchResult | undefined>;
  loadValue?: (binding: CalculationInput['binding']) => Promise<PiPointValue>;
  isNameTaken?: (name: string) => boolean;
  onCancel: () => void;
  onSave: (draft: CalculationDraft) => void;
}

export function CalculationEditorDialog({ initialCalculation, resolvePiPoint, loadValue, isNameTaken, onCancel, onSave }: CalculationEditorDialogProps) {
  const styles = useStyles2(getStyles);
  const [name, setName] = useState(initialCalculation?.name ?? '');
  const [description, setDescription] = useState(initialCalculation?.description ?? '');
  const [expression, setExpression] = useState(initialCalculation?.expression ?? '');
  const [inputs, setInputs] = useState<CalculationInput[]>(initialCalculation?.inputs ?? []);
  const [validationError, setValidationError] = useState('');
  const [isDropActive, setIsDropActive] = useState(false);
  const [isResolvingInputs, setIsResolvingInputs] = useState(false);
  const [executionState, setExecutionState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [executionResult, setExecutionResult] = useState<{ value: number | string; timestamp?: string; valueKind?: 'timestamp' | 'timespan' | 'digital-state' }>();
  const [isFunctionHelpOpen, setIsFunctionHelpOpen] = useState(false);
  const [functionHelpSearch, setFunctionHelpSearch] = useState('');
  const [expandedFunctionName, setExpandedFunctionName] = useState<string>();
  const [scheduleType, setScheduleType] = useState<'' | PeCalculationSchedule['type']>(initialCalculation?.schedule?.type ?? '');
  const [clockInterval, setClockInterval] = useState(initialCalculation?.schedule?.type === 'clock' ? String(initialCalculation.schedule.intervalSeconds) : '');
  const [scheduleAnchor, setScheduleAnchor] = useState(initialCalculation?.schedule?.anchor ?? '');
  const [eventTrigger, setEventTrigger] = useState(initialCalculation?.schedule?.type === 'event' ? initialCalculation.schedule.trigger.pointName : '');
  const [goldenExpression, setGoldenExpression] = useState('Sqr(9)');
  const [goldenTimestamp, setGoldenTimestamp] = useState('');
  const [goldenCapture, setGoldenCapture] = useState('');
  const [goldenError, setGoldenError] = useState('');
  const [qualityRangeFrom, setQualityRangeFrom] = useState('');
  const [qualityRangeTo, setQualityRangeTo] = useState('');
  const [qualityEvidence, setQualityEvidence] = useState('');
  const [alarmStateSetDiscovery, setAlarmStateSetDiscovery] = useState('');
  const [peNameFilter, setPeNameFilter] = useState('*');
  const [peDiscoveryLimit, setPeDiscoveryLimit] = useState('100');
  const [peDiscoveryStartIndex, setPeDiscoveryStartIndex] = useState(0);
  const [peDiscovery, setPeDiscovery] = useState<{ hasMore: boolean; count: number; output: string }>();
  const requiresScheduler = expressionRequiresSchedulerContext(expression);
  const isDevelopment = process.env.NODE_ENV === 'development';
  const groupedFunctionHelp = useMemo(() => {
    const query = functionHelpSearch.trim().toLocaleLowerCase();
    return calculationFunctionCategories.map((category) => ({
      category,
      items: calculationFunctionHelpItems
        .filter((item) => item.category === category)
        .filter((item) => !query || [item.name, item.category, item.signature, item.description].join(' ').toLocaleLowerCase().includes(query))
        .sort((left, right) => left.name.localeCompare(right.name)),
    })).filter((group) => group.items.length > 0);
  }, [functionHelpSearch]);

  useEffect(() => {
    setName(initialCalculation?.name ?? '');
    setDescription(initialCalculation?.description ?? '');
    setExpression(initialCalculation?.expression ?? '');
    setInputs(initialCalculation?.inputs ?? []);
    setValidationError('');
    setExecutionState('idle');
    setExecutionResult(undefined);
    setScheduleType(initialCalculation?.schedule?.type ?? '');
    setClockInterval(initialCalculation?.schedule?.type === 'clock' ? String(initialCalculation.schedule.intervalSeconds) : '');
    setScheduleAnchor(initialCalculation?.schedule?.anchor ?? '');
    setEventTrigger(initialCalculation?.schedule?.type === 'event' ? initialCalculation.schedule.trigger.pointName : '');
  }, [initialCalculation]);

  const appendToken = (token: string) => {
    setExpression((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${token} `);
    setValidationError('');
    setExecutionState('idle');
    setExecutionResult(undefined);
  };

  const insertFunction = (template: string) => {
    appendToken(template);
    setIsFunctionHelpOpen(false);
  };

  const appendPiPoint = (point: PiPointSearchResult | undefined) => {
    if (!point) {
      return;
    }
    const binding = createPiPointBinding(point);
    if (!binding) {
      setValidationError('Este PI Point não possui dados suficientes para ser usado no cálculo.');
      return;
    }
    appendToken(point.name);
    setInputs((current) => current.some((input) => input.name === point.name)
      ? current
      : [...current, { name: point.name, binding }]);
  };

  const resolveInputs = async (normalizedExpression: string): Promise<CalculationInput[]> => {
    const extractedNames = new Set(extractTagNames(normalizedExpression).map(n => n.toLocaleLowerCase()));
    const validInputs = inputs.filter((input) => extractedNames.has(input.name.toLocaleLowerCase()));
    const knownNames = new Set(validInputs.map((input) => input.name.toLocaleLowerCase()));
    const missingNames = extractTagNames(normalizedExpression)
      .filter((tagName) => !knownNames.has(tagName.toLocaleLowerCase()));
    const resolvedInputs = await Promise.all(missingNames.map(async (tagName) => {
      const point = await resolvePiPoint?.(tagName);
      if (!point) {
        throw new Error(`Não foi possível localizar o PI Point "${tagName}". Verifique o nome ou use o arraste da pesquisa.`);
      }
      const binding = createPiPointBinding(point);
      if (!binding) {
        throw new Error(`O PI Point "${tagName}" não possui dados suficientes.`);
      }
      return { name: tagName, binding };
    }));
    return [...validInputs, ...resolvedInputs];
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedExpression = expression.trim();
    if (!normalizedName) {
      setValidationError('Informe um nome para o cálculo antes de salvar.');
      return;
    }
    if (!normalizedExpression) {
      setValidationError('Informe uma expressão para o cálculo antes de salvar.');
      return;
    }
    if (isNameTaken?.(normalizedName)) {
      setValidationError('Já existe um cálculo com esse nome. Escolha outro nome.');
      return;
    }
    setIsResolvingInputs(true);
    setValidationError('');
    try {
      const resolvedInputs = await resolveInputs(normalizedExpression);
      let schedule: PeCalculationSchedule | undefined;
      if (expressionRequiresSchedulerContext(normalizedExpression)) {
        if (scheduleType === '') throw new Error('Scheduler context required: selecione Clock ou Event.');
        if (scheduleType === 'clock') {
          schedule = { type: 'clock', intervalSeconds: Number(clockInterval), anchor: scheduleAnchor.trim() };
        } else {
          const triggerName = eventTrigger.trim();
          const existing = resolvedInputs.find((input) => input.name.toLocaleLowerCase() === triggerName.toLocaleLowerCase());
          const point = existing ? undefined : await resolvePiPoint?.(triggerName);
          const trigger = existing?.binding ?? (point ? createPiPointBinding(point) : undefined);
          if (!trigger) throw new Error('Schedule Event requer um PI Point trigger válido.');
          schedule = { type: 'event', trigger, ...(scheduleAnchor.trim() ? { anchor: scheduleAnchor.trim() } : {}) };
        }
        validatePeSchedule(schedule);
      }
      setIsResolvingInputs(false);
      onSave({
        name: normalizedName,
        description: description.trim(),
        expression: normalizedExpression,
        inputs: resolvedInputs,
        ...(schedule === undefined ? {} : { schedule }),
      });
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Não foi possível resolver os PI Points da expressão.');
      setIsResolvingInputs(false);
    }
  };

  const handleExecute = async () => {
    const normalizedExpression = expression.trim();
    if (!normalizedExpression) {
      setValidationError('Informe uma expressão para calcular.');
      return;
    }
    setExecutionState('loading');
    setValidationError('');
    try {
      const resolvedInputs = await resolveInputs(normalizedExpression);
      setInputs(resolvedInputs);
      let scheduler: PeCalculationSchedule | undefined;
      if (expressionRequiresStatefulScheduler(normalizedExpression)) {
        if (scheduleType === '') {
          requirePeSchedulerContext(normalizedExpression, undefined);
        }
        if (scheduleType === 'clock') {
          scheduler = { type: 'clock', intervalSeconds: Number(clockInterval), anchor: scheduleAnchor.trim() };
        } else {
          const triggerName = eventTrigger.trim();
          const existing = resolvedInputs.find((input) => input.name.toLocaleLowerCase() === triggerName.toLocaleLowerCase());
          const point = existing ? undefined : await resolvePiPoint?.(triggerName);
          const trigger = existing?.binding ?? (point ? createPiPointBinding(point) : undefined);
          if (!trigger) throw new PeSchedulerError('INVALID_SCHEDULE', 'Schedule Event requer um PI Point trigger válido.');
          scheduler = { type: 'event', trigger, ...(scheduleAnchor.trim() ? { anchor: scheduleAnchor.trim() } : {}) };
        }
        requirePeSchedulerContext(normalizedExpression, scheduler);
        // Establish the scheduler route before any server-first decision. The
        // stateful AST evaluator is intentionally still a separate blocker.
        peScheduleIdentity(scheduler);
        throw new PeSchedulerError('STATEFUL_FUNCTION_NOT_READY', 'O PE Scheduler foi validado, mas o runtime stateful desta expressão ainda não está disponível para avaliação.');
      }
      const serverClassification = classifyPiExpression(normalizedExpression);
      const metadataFunctions = new Set(['TAGDESC', 'TAGEU', 'TAGEXDESC', 'TAGNAME', 'TAGNUM', 'TAGSOURCE', 'TAGSPAN', 'TAGTYPE', 'TAGTYPVAL', 'TAGZERO']);
      const usesMetadataExecutor = piExpressionFunctionNames(normalizedExpression)
        .some((name) => metadataFunctions.has(name.toLocaleUpperCase()));
      if (serverClassification.target === 'pi' && !usesMetadataExecutor && resolvedInputs.length > 0) {
        const dataSources = new Set(resolvedInputs.map((input) => `${input.binding.dataSourceUid}\u0000${input.binding.serverPath}`));
        if (dataSources.size !== 1) {
          throw new Error('O Calculation Controller PI requer que todos os PI Points pertençam ao mesmo PI Data Server.');
        }
        try {
          const capabilities = await probePiCalculationController(resolvedInputs[0].binding);
          if (capabilities.times !== 'supported') {
            throw new PiCalculationUnavailableError(`PI Calculation Controller /calculation/times indisponível (${capabilities.times}).`);
          }
          const result = await evaluatePiExpression({ binding: resolvedInputs[0].binding, expression: normalizedExpression, mode: 'times', time: '*' });
          if ('kind' in result && result.kind === 'no-output') {
            setExecutionState('success');
            return;
          }
          if (!('value' in result)) throw new Error('Resultado do PI sem valor.');
          const value = typeof result.value === 'object' ? result.value.name : result.value;
          setExecutionResult({ value, timestamp: result.timestamp, valueKind: result.valueKind });
          setExecutionState('success');
          return;
        } catch (error) {
          if (!(error instanceof PiCalculationUnavailableError) || !serverClassification.localFallbackSafe) throw error;
        }
      }
      if (resolvedInputs.length > 0 && !loadValue) {
        throw new Error('A consulta de valores PI não está disponível.');
      }
      const values = new Map<string, unknown>();
      const pointValues = await Promise.all(resolvedInputs.map(async (input) => ({
        input,
        value: await loadValue?.(input.binding),
      })));
      pointValues.forEach(({ input, value }) => values.set(input.name, value));
      const calculation = {
        id: '__preview__',
        name: name.trim() || 'Cálculo',
        expression: normalizedExpression,
        inputs: resolvedInputs,
      };
      let evaluation = evaluateCalculation(calculation, values);
      let attempts = 0;
      while (evaluation.status === 'loading' && (hasPendingHistoricalRequests() || hasPendingMetadataRequests() || hasPendingDigitalStateRequests()) && attempts < 10) {
        attempts += 1;
        await Promise.all([waitForPendingHistoricalRequests(), waitForPendingMetadataRequests(), waitForPendingDigitalStateRequests()]);
        evaluation = evaluateCalculation(calculation, values);
      }
      if (evaluation.status === 'loading') {
        throw new Error('Aguardando os valores dos PI Points.');
      }
      if (evaluation.status === 'error') {
        throw evaluation.error;
      }
      const timestamps = pointValues
        .map(({ value }) => value?.timestamp)
        .filter((timestamp): timestamp is string => Boolean(timestamp))
        .sort();
      setExecutionResult({ value: evaluation.value, timestamp: timestamps.at(-1), valueKind: evaluation.valueKind });
      setExecutionState('success');
    } catch (error) {
      setExecutionState('error');
      setValidationError(error instanceof Error ? error.message : 'Não foi possível executar o cálculo.');
    }
  };

  const handleGoldenCapture = async () => {
    setGoldenCapture('');
    setGoldenError('');
    const normalizedExpression = goldenExpression.trim();
    const functionName = piExpressionFunctionNames(normalizedExpression)[0]?.toLocaleUpperCase();
    if (!normalizedExpression || !goldenTimestamp.trim()) {
      setGoldenError('Informe a expressão e o timestamp ISO da avaliação.');
      return;
    }
    let normalizedGoldenTimestamp: string;
    try {
      normalizedGoldenTimestamp = normalizePiGoldenTimestamp(goldenTimestamp);
    } catch (error) {
      setGoldenError(error instanceof Error ? error.message : 'Evaluation timestamp deve ser um timestamp ISO válido.');
      return;
    }
    if (!functionName || !PI_GOLDEN_FUNCTIONS.has(functionName)) {
      setGoldenError('Runner disponível apenas para Sqr, TagVal, Hour, BadVal, TagBad, IsSet e Alm* nesta captura.');
      return;
    }
    try {
      const goldenInputs = await resolveInputs(normalizedExpression);
      const binding = goldenInputs[0]?.binding;
      if (extractTagNames(normalizedExpression).length > 0 && !binding) {
        throw new Error('Não foi possível resolver os PI Points da Golden Expression.');
      }
      const capture = await capturePiGoldenRuntime({
        runtime: 'grafana-gpa',
        functionName: PI_GOLDEN_FUNCTION_NAMES[functionName as keyof typeof PI_GOLDEN_FUNCTION_NAMES],
        binding,
        expression: normalizedExpression,
        evaluationTimestamp: normalizedGoldenTimestamp,
        input: normalizedExpression,
      });
      setGoldenCapture(JSON.stringify(capture, null, 2));
    } catch (error) {
      setGoldenError(error instanceof Error ? error.message : 'Não foi possível capturar o golden PI.');
    }
  };

  const handleQualityEvidenceScan = async () => {
    setQualityEvidence('');
    setGoldenError('');
    const normalizedExpression = goldenExpression.trim();
    if (!normalizedExpression || !qualityRangeFrom.trim() || !qualityRangeTo.trim()) {
      setGoldenError('Informe uma expressão com um PI Point e o intervalo ISO da varredura de quality.');
      return;
    }
    try {
      const resolvedInputs = await resolveInputs(normalizedExpression);
      if (resolvedInputs.length !== 1) {
        throw new Error('A varredura de quality exige exatamente um PI Point na Golden Expression.');
      }
      const evidence = await inspectPiGoldenQualityEvidence({
        runtime: 'grafana-gpa',
        binding: resolvedInputs[0].binding,
        from: qualityRangeFrom,
        to: qualityRangeTo,
      });
      setQualityEvidence(JSON.stringify(evidence, null, 2));
    } catch (error) {
      setGoldenError(error instanceof Error ? error.message : 'Não foi possível buscar evidências reais de quality.');
    }
  };

  const handleAlarmStateSetDiscovery = async () => {
    setAlarmStateSetDiscovery('');
    setGoldenError('');
    try {
      const resolvedInputs = await resolveInputs(goldenExpression.trim());
      if (resolvedInputs.length !== 1) {
        throw new Error('A descoberta de Alarm State Set exige exatamente um PI Point na Golden Expression.');
      }
      const discovery = await discoverPiGoldenAlarmStateSets({ runtime: 'grafana-gpa', binding: resolvedInputs[0].binding });
      setAlarmStateSetDiscovery(JSON.stringify(discovery, null, 2));
    } catch (error) {
      setGoldenError(error instanceof Error ? error.message : 'Não foi possível descobrir Alarm State Sets reais.');
    }
  };

  const handlePerformanceEquationDiscovery = async (startIndex = 0) => {
    setPeDiscovery(undefined);
    setGoldenError('');
    try {
      const discovery = await discoverPiGoldenPerformanceEquations({
        runtime: 'grafana-gpa',
        nameFilter: peNameFilter,
        limit: Number(peDiscoveryLimit),
        startIndex,
      });
      setPeDiscoveryStartIndex(startIndex);
      setPeDiscovery({ hasMore: discovery.hasMore, count: discovery.candidates.length, output: JSON.stringify(discovery, null, 2) });
    } catch (error) {
      setGoldenError(error instanceof Error ? error.message : 'Não foi possível descobrir PI Points de Performance Equation.');
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    setIsDropActive(false);
    appendPiPoint(parsePiPointDragData(event.dataTransfer.getData(PI_POINT_DRAG_MIME)));
  };

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        onCancel();
      }
    }}>
      <form className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="calculation-editor-title" onSubmit={handleSubmit}>
        <div className={styles.header}>
          <h2 id="calculation-editor-title">Editor de cálculo</h2>
          <button type="button" className={styles.closeButton} aria-label="Fechar editor de cálculo" onClick={onCancel}>×</button>
        </div>

        <div className={styles.body}>
          <label className={styles.label} htmlFor="calculation-editor-name">Nome</label>
          <input
            id="calculation-editor-name"
            className={styles.input}
            data-testid="calculation-editor-name"
            autoFocus
            autoComplete="off"
            value={name}
            onChange={(event) => { setName(event.target.value); setValidationError(''); }}
          />

          <label className={styles.label} htmlFor="calculation-editor-description">Descrição</label>
          <textarea
            id="calculation-editor-description"
            className={styles.description}
            data-testid="calculation-editor-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
          />

          {requiresScheduler && (
            <div className={styles.inputs} data-testid="calculation-scheduler-config">
              <span className={styles.inputsLabel}>PE Scheduler</span>
              <label className={styles.label} htmlFor="calculation-schedule-type">Tipo</label>
              <select id="calculation-schedule-type" className={styles.input} data-testid="calculation-schedule-type" value={scheduleType} onChange={(event) => setScheduleType(event.target.value as '' | PeCalculationSchedule['type'])}>
                <option value="">Selecione</option>
                <option value="clock">Clock</option>
                <option value="event">Event</option>
              </select>
              {scheduleType === 'clock' && (
                <>
                  <label className={styles.label} htmlFor="calculation-schedule-interval">Intervalo em segundos</label>
                  <input id="calculation-schedule-interval" className={styles.input} data-testid="calculation-schedule-interval" inputMode="decimal" value={clockInterval} onChange={(event) => setClockInterval(event.target.value)} />
                </>
              )}
              {scheduleType === 'event' && (
                <>
                  <label className={styles.label} htmlFor="calculation-schedule-trigger">PI Point trigger</label>
                  <input id="calculation-schedule-trigger" className={styles.input} data-testid="calculation-schedule-trigger" value={eventTrigger} onChange={(event) => setEventTrigger(event.target.value)} />
                </>
              )}
              {scheduleType !== '' && (
                <>
                  <label className={styles.label} htmlFor="calculation-schedule-anchor">Anchor ISO{scheduleType === 'event' ? ' (opcional)' : ''}</label>
                  <input id="calculation-schedule-anchor" className={styles.input} data-testid="calculation-schedule-anchor" placeholder="2026-01-01T00:00:00Z" value={scheduleAnchor} onChange={(event) => setScheduleAnchor(event.target.value)} />
                </>
              )}
            </div>
          )}

          {inputs.length > 0 && (
            <div className={styles.inputs} data-testid="calculation-editor-inputs">
              <span className={styles.inputsLabel}>PI Points usados</span>
              <div className={styles.inputTags}>
                {inputs.map((input) => <span key={input.name} className={styles.inputTag} draggable>{input.name}</span>)}
              </div>
            </div>
          )}

          <label className={styles.label} htmlFor="calculation-editor-expression">Expressão</label>
          <textarea
            id="calculation-editor-expression"
            className={isDropActive ? styles.expressionActive : styles.expression}
            data-testid="calculation-editor-expression"
            value={expression}
            onChange={(event) => { setExpression(event.target.value); setValidationError(''); setExecutionState('idle'); setExecutionResult(undefined); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setIsDropActive(true); }}
            onDragLeave={() => setIsDropActive(false)}
            onDrop={handleDrop}
            placeholder="Ex.: Vazão / Produção * 100"
            rows={4}
          />

          <div className={styles.operatorRow} aria-label="Operadores">
            {['+', '-', '*', '/', '^', '(', ')'].map((operator) => (
              <button key={operator} type="button" className={styles.operatorButton} onClick={() => appendToken(operator)}>{operator}</button>
            ))}
          </div>

          <div className={styles.functionHelpContainer}>
            <button type="button" className={styles.functionHelpButton} data-testid="calculation-function-help-toggle" aria-expanded={isFunctionHelpOpen} aria-controls="calculation-function-help" onClick={() => setIsFunctionHelpOpen((current) => !current)}>
              Funções e lógica <InfoIcon />
            </button>
            {isFunctionHelpOpen && (
              <div id="calculation-function-help" className={styles.functionHelpPopup} data-testid="calculation-function-help" role="dialog" aria-label="Funções disponíveis">
                <div className={styles.functionHelpHeader}>
                  <strong>Funções disponíveis</strong>
                  <button type="button" aria-label="Fechar funções disponíveis" onClick={() => setIsFunctionHelpOpen(false)}>×</button>
                </div>
                <input
                  className={styles.functionHelpSearch}
                  data-testid="calculation-function-search"
                  aria-label="Pesquisar função"
                  placeholder="Pesquisar função..."
                  value={functionHelpSearch}
                  onChange={(event) => setFunctionHelpSearch(event.target.value)}
                />
                {groupedFunctionHelp.map((group) => (
                  <section key={group.category} aria-label={group.category}>
                    <strong className={styles.functionCategory}>{group.category}</strong>
                    {group.items.map((item) => {
                      const unavailable = piCompatibilityMatrix[item.name]?.productStatus === 'not-implemented';
                      return (
                        <div key={item.name} className={styles.functionHelpItem}>
                          <button type="button" className={styles.functionInsertButton} aria-label={`Inserir ${item.name}`} disabled={unavailable} onClick={() => insertFunction(item.template)}>{item.name}</button>
                          <button type="button" className={styles.functionInfoButton} aria-label={`Explicação de ${item.name}`} aria-expanded={expandedFunctionName === item.name} onClick={() => setExpandedFunctionName((current) => current === item.name ? undefined : item.name)}><InfoIcon /></button>
                          {expandedFunctionName === item.name && (
                            <div className={styles.functionExplanation}>
                              <span>{item.description}</span>
                              <span className={styles.functionSignature}>Sintaxe: {item.signature}</span>
                              <span className={styles.functionExample}>Ex.: {item.example}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </section>
                ))}
                {groupedFunctionHelp.length === 0 && <span className={styles.functionNoResults}>Nenhuma função encontrada.</span>}
              </div>
            )}
          </div>

          {executionState === 'success' && executionResult && (
            <div className={styles.executionResult} data-testid="calculation-editor-result">
              <strong>Último valor: {formatExecutionValue(executionResult.value, executionResult.valueKind)}</strong>
              {executionResult.timestamp && <span>Atualizado em {formatExecutionTimestamp(executionResult.timestamp)}</span>}
            </div>
          )}
          {isDevelopment && (
            <div className={styles.goldenRunner} data-testid="calculation-golden-runner">
              <strong>PI Golden Capture — DEV ONLY</strong>
              <label className={styles.label} htmlFor="calculation-golden-expression">Expression</label>
              <input id="calculation-golden-expression" className={styles.input} data-testid="calculation-golden-expression" value={goldenExpression} onChange={(event) => setGoldenExpression(event.target.value)} />
              <label className={styles.label} htmlFor="calculation-golden-timestamp">Evaluation timestamp (ISO)</label>
              <input id="calculation-golden-timestamp" className={styles.input} data-testid="calculation-golden-timestamp" placeholder="2026-09-10T13:45:30Z" value={goldenTimestamp} onChange={(event) => setGoldenTimestamp(event.target.value)} />
              <button type="button" className={styles.executeButton} data-testid="calculation-golden-capture" onClick={() => void handleGoldenCapture()}>Capturar Golden PI</button>
              <label className={styles.label} htmlFor="calculation-golden-quality-from">Quality scan start (ISO)</label>
              <input id="calculation-golden-quality-from" className={styles.input} data-testid="calculation-golden-quality-from" placeholder="2026-09-01T00:00:00Z" value={qualityRangeFrom} onChange={(event) => setQualityRangeFrom(event.target.value)} />
              <label className={styles.label} htmlFor="calculation-golden-quality-to">Quality scan end (ISO)</label>
              <input id="calculation-golden-quality-to" className={styles.input} data-testid="calculation-golden-quality-to" placeholder="2026-09-11T00:00:00Z" value={qualityRangeTo} onChange={(event) => setQualityRangeTo(event.target.value)} />
              <button type="button" className={styles.executeButton} data-testid="calculation-golden-quality-scan" onClick={() => void handleQualityEvidenceScan()}>Buscar evidências Quality</button>
              <button type="button" className={styles.executeButton} data-testid="calculation-golden-alarm-discovery" onClick={() => void handleAlarmStateSetDiscovery()}>Descobrir Alarm State Sets</button>
              <label className={styles.label} htmlFor="calculation-golden-pe-filter">PE Point name filter</label>
              <input id="calculation-golden-pe-filter" className={styles.input} data-testid="calculation-golden-pe-filter" value={peNameFilter} onChange={(event) => { setPeNameFilter(event.target.value); setPeDiscoveryStartIndex(0); }} />
              <label className={styles.label} htmlFor="calculation-golden-pe-limit">PE page limit</label>
              <input id="calculation-golden-pe-limit" className={styles.input} data-testid="calculation-golden-pe-limit" inputMode="numeric" value={peDiscoveryLimit} onChange={(event) => { setPeDiscoveryLimit(event.target.value); setPeDiscoveryStartIndex(0); }} />
              <button type="button" className={styles.executeButton} data-testid="calculation-golden-pe-discovery" onClick={() => void handlePerformanceEquationDiscovery(0)}>Descobrir PE Points</button>
              {peDiscovery?.hasMore && <button type="button" className={styles.executeButton} data-testid="calculation-golden-pe-next" onClick={() => void handlePerformanceEquationDiscovery(peDiscoveryStartIndex + Number(peDiscoveryLimit))}>Próxima página PE</button>}
              {goldenError && <span className={styles.error} role="alert">{goldenError}</span>}
              {goldenCapture && <pre className={styles.goldenOutput} data-testid="calculation-golden-output">{goldenCapture}</pre>}
              {qualityEvidence && <pre className={styles.goldenOutput} data-testid="calculation-golden-quality-output">{qualityEvidence}</pre>}
              {alarmStateSetDiscovery && <pre className={styles.goldenOutput} data-testid="calculation-golden-alarm-output">{alarmStateSetDiscovery}</pre>}
              {peDiscovery && <pre className={styles.goldenOutput} data-testid="calculation-golden-pe-output">{peDiscovery.output}</pre>}
            </div>
          )}
          {validationError && <span className={styles.error} role="alert">{validationError}</span>}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.executeButton} data-testid="calculation-editor-execute" onClick={() => void handleExecute()} disabled={isResolvingInputs || executionState === 'loading'}>{executionState === 'loading' ? 'Calculando...' : 'Calcular'}</button>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>Cancelar</button>
          <button type="submit" className={styles.saveButton} data-testid="calculation-editor-save" disabled={isResolvingInputs}>{isResolvingInputs ? 'Localizando...' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  backdrop: css`
    position: fixed;
    z-index: 40;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--overlay-bg);
  `,
  dialog: css`
    display: flex;
    flex-direction: column;
    width: min(580px, 100%);
    max-height: min(720px, calc(100vh - 48px));
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    background: var(--surface-elevated);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.48);
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 46px;
    padding: 0 14px;
    color: var(--assets-header-text);
    background: var(--assets-header-bg);
    h2 { margin: 0; font-size: 17px; font-weight: 600; }
  `,
  closeButton: css`
    width: 28px;
    height: 28px;
    border: 0;
    color: var(--assets-header-muted);
    background: transparent;
    cursor: pointer;
    font-size: 25px;
    line-height: 1;
    &:hover { color: var(--assets-header-text); background: var(--assets-header-hover); }
  `,
  body: css`
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 18px;
    overflow: auto;
  `,
  label: css`
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  `,
  input: css`
    width: 100%;
    min-height: 38px;
    box-sizing: border-box;
    padding: 0 10px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg);
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
  `,
  description: css`
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 8px 10px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg);
    font: inherit;
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
  `,
  inputs: css`
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px;
    border: 1px solid var(--border-subtle);
    border-radius: 5px;
    background: var(--surface-secondary);
  `,
  inputsLabel: css`color: var(--text-muted); font-size: 10px;`,
  inputTags: css`display: flex; flex-wrap: wrap; gap: 5px;`,
  inputTag: css`
    padding: 4px 7px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    color: var(--accent-hover);
    background: var(--selection-bg);
    cursor: grab;
    font-size: 11px;
  `,
  expression: css`
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 9px 10px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg);
    font: inherit;
    font-size: 13px;
    line-height: 1.45;
    &::placeholder { color: var(--text-secondary); opacity: 1; }
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
  `,
  expressionActive: css`
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 9px 10px;
    border: 1px solid var(--accent);
    border-radius: 5px;
    outline: none;
    color: var(--text-primary);
    background: var(--selection-bg);
    font: inherit;
    font-size: 13px;
    line-height: 1.45;
    &::placeholder { color: var(--text-secondary); opacity: 1; }
    box-shadow: 0 0 0 2px var(--focus-ring);
  `,
  goldenRunner: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
    padding: 12px;
    border: 1px dashed var(--border-color);
    background: var(--background-secondary);
  `,
  goldenOutput: css`
    max-height: 240px;
    overflow: auto;
    margin: 0;
    white-space: pre-wrap;
    font-size: 11px;
  `,
  operatorRow: css`display: flex; gap: 6px;`,
  operatorButton: css`
    flex: 1;
    min-height: 30px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
    &:hover { border-color: var(--accent); color: var(--accent-hover); }
  `,
  functionHelpContainer: css`position: relative; align-self: flex-start;`,
  functionHelpButton: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 28px;
    padding: 0 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-secondary);
    background: var(--button-bg);
    cursor: pointer;
    font-size: 11px;
    svg { width: 14px; height: 14px; }
    &:hover { border-color: var(--accent); color: var(--accent-hover); }
  `,
  functionHelpPopup: css`
    position: absolute;
    z-index: 2;
    bottom: calc(100% + 6px);
    left: 0;
    width: min(390px, calc(100vw - 72px));
    max-height: 280px;
    overflow: auto;
    padding: 8px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    color: var(--text-primary);
    background: var(--surface-elevated);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  `,
  functionHelpHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 5px;
    font-size: 12px;
    button { border: 0; color: var(--text-secondary); background: transparent; cursor: pointer; font-size: 18px; line-height: 1; }
  `,
  functionHelpSearch: css`
    box-sizing: border-box;
    width: 100%;
    margin-bottom: 6px;
    padding: 6px 7px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    background: var(--input-bg);
    font-size: 11px;
  `,
  functionCategory: css`
    display: block;
    padding: 6px 0 2px;
    color: var(--text-secondary);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  functionHelpItem: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 26px;
    gap: 5px;
    padding: 4px 0;
    border-top: 1px solid var(--border-subtle);
  `,
  functionInsertButton: css`
    min-width: 0;
    padding: 5px 7px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
    font-size: 11px;
    text-align: left;
    &:hover { border-color: var(--accent); color: var(--accent-hover); }
    &:disabled { cursor: not-allowed; opacity: 0.55; }
  `,
  functionInfoButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    color: var(--accent-hover);
    background: transparent;
    cursor: pointer;
    svg { width: 15px; height: 15px; }
  `,
  functionExample: css`
    display: block;
    padding: 5px 7px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    color: var(--text-primary);
    background: var(--input-bg);
    font-family: monospace;
    font-size: 10px;
    line-height: 1.35;
  `,
  functionSignature: css`
    display: block;
    color: var(--text-primary);
    font-family: monospace;
    font-size: 10px;
  `,
  functionNoResults: css`display: block; padding: 8px 0; color: var(--text-secondary); font-size: 11px;`,
  functionExplanation: css`
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 5px 7px;
    color: var(--text-secondary);
    background: var(--surface-secondary);
    font-size: 10px;
    line-height: 1.35;
  `,
  executionResult: css`
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 3px;
    padding: 9px 10px;
    border: 1px solid var(--accent);
    border-radius: 5px;
    color: var(--text-primary);
    background: var(--surface-secondary);
    font-size: 12px;
    span { color: var(--text-secondary); font-size: 10px; }
  `,
  error: css`color: var(--danger); font-size: 11px; line-height: 1.35;`,
  footer: css`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--border-subtle);
    background: var(--surface-secondary);
  `,
  executeButton: css`
    min-width: 88px;
    min-height: 32px;
    margin-right: auto;
    border: 1px solid var(--accent);
    border-radius: 5px;
    color: var(--accent-hover);
    background: transparent;
    cursor: pointer;
    font-weight: 600;
    &:hover { color: var(--accent-contrast); background: var(--accent); }
    &:disabled { cursor: wait; opacity: 0.65; }
  `,
  cancelButton: css`
    min-width: 88px;
    min-height: 32px;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
  `,
  saveButton: css`
    min-width: 88px;
    min-height: 32px;
    border: 1px solid var(--accent);
    border-radius: 5px;
    color: var(--accent-contrast);
    background: var(--accent);
    cursor: pointer;
    font-weight: 600;
    &:hover { background: var(--accent-hover); }
    &:disabled { cursor: wait; opacity: 0.65; }
  `,
});

export function extractTagNames(expression: string): string[] {
  const names = new Set<string>();
  
  // 1. Extrair tags entre aspas simples, ignorando strings de tempo
  const singleQuotePattern = /'([^']+)'/g;
  let sqMatch: RegExpExecArray | null;
  while ((sqMatch = singleQuotePattern.exec(expression)) !== null) {
    if (!isPiTimeString(sqMatch[1])) {
      names.add(sqMatch[1]);
    }
  }
  
  // 2. Remove strings para processar identificadores sem aspas
  const expressionWithoutStrings = expression.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '');
  
  // 2. Token pattern supporting Unicode letters (\p{L}) and numbers (\p{N})
  const tokenPattern = new RegExp('(?:^|[^\\p{L}\\p{N}_.:-])([\\p{L}_][\\p{L}\\p{N}_.:-]*)(?=[^\\p{L}\\p{N}_.:-]|$)', 'gu');
  
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(expressionWithoutStrings)) !== null) {
    const endIndex = match.index + match[0].length;
    const rest = expressionWithoutStrings.slice(endIndex);
    
    // Ignore if this token is immediately followed by '(' (it's a function, not a PI Point)
    if (rest.trim().startsWith('(')) {
      continue;
    }
    
    if (!CALCULATION_RESERVED_NAMES.has(match[1].toLocaleUpperCase()) && !isPiTimeString(match[1])) {
      names.add(match[1]);
    }
  }
  return [...names];
}

function formatExecutionValue(value: number | string, valueKind?: 'timestamp' | 'timespan' | 'digital-state'): string {
  if (valueKind === 'timestamp') {
    const milliseconds = typeof value === 'number' ? value * 1000 : Date.parse(value);
    if (Number.isFinite(milliseconds)) return new Date(milliseconds).toISOString();
  }
  if (typeof value === 'string') return value;
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatExecutionTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function InfoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10v6M12 7h.01" />
  </svg>;
}
