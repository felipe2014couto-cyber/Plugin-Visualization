import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { CalculationEditorDialog, type CalculationEditorDialogProps } from '../CalculationEditorDialog';
import { globalHistoricalPromiseLock, globalHistoricalResultCache, globalMetadataPromiseLock, globalMetadataResultCache } from '../../../calculations/calculationMacros';
import { getPiPointMetadata, getPiTrendsRecordedHistoryForRange } from '../../../pi/piDataSource';
import { classifyPiExpression, evaluatePiExpression, probePiCalculationController } from '../../../pi/piCalculation';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return { ...actual, useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()) };
});

jest.mock('../../../pi/piDataSource', () => ({ getPiTrendsRecordedHistoryForRange: jest.fn(), getPiPointMetadata: jest.fn() }));
jest.mock('../../../pi/piCalculation', () => ({
  classifyPiExpression: jest.fn(() => ({ target: 'local', localFallbackSafe: true })),
  evaluatePiExpression: jest.fn(),
  probePiCalculationController: jest.fn(),
  PiCalculationUnavailableError: class PiCalculationUnavailableError extends Error {},
}));

const queryHistory = getPiTrendsRecordedHistoryForRange as jest.MockedFunction<typeof getPiTrendsRecordedHistoryForRange>;
const queryMetadata = getPiPointMetadata as jest.MockedFunction<typeof getPiPointMetadata>;
const classify = classifyPiExpression as jest.MockedFunction<typeof classifyPiExpression>;
const evaluatePi = evaluatePiExpression as jest.MockedFunction<typeof evaluatePiExpression>;
const probePi = probePiCalculationController as jest.MockedFunction<typeof probePiCalculationController>;
const calculation = {
  id: '__preview__', name: 'Teste', expression: "Average('SINUSOID', '-1h', '*')",
  inputs: [{ name: 'SINUSOID', binding: { dataSourceUid: 'pi', serverPath: 'pims', pointName: 'SINUSOID' } }],
};

beforeEach(() => {
  queryHistory.mockReset();
  globalHistoricalPromiseLock.clear();
  globalHistoricalResultCache.clear();
  globalMetadataPromiseLock.clear();
  globalMetadataResultCache.clear();
  queryMetadata.mockReset();
  classify.mockReset();
  classify.mockReturnValue({ target: 'local', localFallbackSafe: true });
  evaluatePi.mockReset();
  probePi.mockReset();
});

it('mostra Scheduler somente para expressão stateful e salva Clock explícito', async () => {
  const onSave = jest.fn();
  const { rerender } = render(<CalculationEditorDialog initialCalculation={{
    ...calculation, expression: 'SINUSOID + 1',
  }} loadValue={async () => ({ value: 1 })} onCancel={jest.fn()} onSave={onSave} />);
  expect(screen.queryByTestId('calculation-scheduler-config')).not.toBeInTheDocument();

  rerender(<CalculationEditorDialog initialCalculation={{
    ...calculation, expression: 'Delay(SINUSOID, 1, 2)',
  }} loadValue={async () => ({ value: 1 })} onCancel={jest.fn()} onSave={onSave} />);
  expect(screen.getByTestId('calculation-scheduler-config')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('calculation-schedule-type'), { target: { value: 'clock' } });
  fireEvent.change(screen.getByTestId('calculation-schedule-interval'), { target: { value: '60' } });
  fireEvent.change(screen.getByTestId('calculation-schedule-anchor'), { target: { value: '2026-01-01T00:00:00Z' } });
  fireEvent.click(screen.getByTestId('calculation-editor-save'));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    schedule: { type: 'clock', intervalSeconds: 60, anchor: '2026-01-01T00:00:00Z' },
  })));
});

it('não envia Arma, Delay ou Impulse ao Controller sem Scheduler Context', async () => {
  render(<CalculationEditorDialog initialCalculation={{
    ...calculation, expression: "Delay('SINUSOID', 1, 2)",
  }} loadValue={async () => ({ value: 1 })} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.click(screen.getByTestId('calculation-editor-execute'));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('requer configuração do PE Scheduler'));
  expect(probePi).not.toHaveBeenCalled();
  expect(evaluatePi).not.toHaveBeenCalled();
});

it('valida Scheduler Clock antes de bloquear o runtime stateful, sem Controller', async () => {
  render(<CalculationEditorDialog initialCalculation={{
    ...calculation, expression: "Arma('SINUSOID', 1, (0.5), (1, 1))",
  }} loadValue={async () => ({ value: 1 })} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.change(screen.getByTestId('calculation-schedule-type'), { target: { value: 'clock' } });
  fireEvent.change(screen.getByTestId('calculation-schedule-interval'), { target: { value: '60' } });
  fireEvent.change(screen.getByTestId('calculation-schedule-anchor'), { target: { value: '2026-01-01T00:00:00Z' } });
  fireEvent.click(screen.getByTestId('calculation-editor-execute'));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('runtime stateful'));
  expect(probePi).not.toHaveBeenCalled();
  expect(evaluatePi).not.toHaveBeenCalled();
});

it('aguarda metadata e calcula após um único clique', async () => {
  queryMetadata.mockResolvedValue({ name: 'SINUSOID', description: 'Sinusoid', engineeringUnit: 'unit' });
  render(<CalculationEditorDialog initialCalculation={{
    ...calculation, expression: 'Len(TagDesc(\'SINUSOID\'))',
  }} loadValue={async () => ({ value: 1 })} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.click(screen.getByTestId('calculation-editor-execute'));
  await waitFor(() => expect(screen.getByTestId('calculation-editor-result')).toHaveTextContent('Último valor: 8'));
  expect(queryMetadata).toHaveBeenCalledTimes(1);
});

it('preserva a qualidade do valor atual no cálculo de um único clique', async () => {
  render(<CalculationEditorDialog initialCalculation={{
    ...calculation, expression: "IF(BadVal('SINUSOID'), 0, 1)",
  }} loadValue={async () => ({ value: 0, quality: { Good: true } })} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.click(screen.getByTestId('calculation-editor-execute'));
  await waitFor(() => expect(screen.getByTestId('calculation-editor-result')).toHaveTextContent('Último valor: 1'));
});

it('aguarda o histórico e exibe o resultado após um único clique', async () => {
  queryHistory.mockResolvedValue({
    'pi\u0000pims\u0000SINUSOID': {
      status: 'success',
      series: { pointName: 'SINUSOID', points: [{ time: 1, value: 42 }] },
    },
  });
  render(<CalculationEditorDialog initialCalculation={calculation} loadValue={async () => ({ value: 1 })} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.click(screen.getByTestId('calculation-editor-execute'));

  await waitFor(() => expect(screen.getByTestId('calculation-editor-result')).toHaveTextContent('Último valor: 42'));
  expect(queryHistory).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('calculation-editor-execute')).toBeEnabled();
});

it('ignora um segundo clique enquanto a consulta histórica está pendente', async () => {
  let resolveQuery: ((value: Awaited<ReturnType<typeof getPiTrendsRecordedHistoryForRange>>) => void) | undefined;
  queryHistory.mockReturnValue(new Promise((resolve) => { resolveQuery = resolve; }));
  render(<CalculationEditorDialog initialCalculation={calculation} loadValue={async () => ({ value: 1 })} onCancel={jest.fn()} onSave={jest.fn()} />);

  const button = screen.getByTestId('calculation-editor-execute');
  fireEvent.click(button);
  await waitFor(() => expect(queryHistory).toHaveBeenCalledTimes(1));
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(queryHistory).toHaveBeenCalledTimes(1);

  resolveQuery?.({
    'pi\u0000pims\u0000SINUSOID': {
      status: 'success', series: { pointName: 'SINUSOID', points: [{ time: 1, value: 7 }] },
    },
  });
  await waitFor(() => expect(screen.getByTestId('calculation-editor-result')).toHaveTextContent('Último valor: 7'));
});

it('aguarda consultas históricas sucessivas na mesma expressão', async () => {
  queryHistory.mockImplementation(async (bindings) => {
    const pointName = bindings[0].pointName;
    const value = pointName === 'SINUSOID' ? 10 : 30;
    return { [`pi\u0000pims\u0000${pointName}`]: {
      status: 'success', series: { pointName, points: [{ time: 1, value }] },
    } };
  });
  const multiCalculation = {
    ...calculation,
    expression: "Average('SINUSOID', '-1h', '*') + Maximum('OTHER', '-1h', '*')",
    inputs: [
      ...calculation.inputs,
      { name: 'OTHER', binding: { dataSourceUid: 'pi', serverPath: 'pims', pointName: 'OTHER' } },
    ],
  };
  render(<CalculationEditorDialog initialCalculation={multiCalculation} loadValue={async () => ({ value: 1 })} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.click(screen.getByTestId('calculation-editor-execute'));

  await waitFor(() => expect(screen.getByTestId('calculation-editor-result')).toHaveTextContent('Último valor: 40'));
  expect(queryHistory).toHaveBeenCalledTimes(2);
});

it('encerra loading sem histórico pendente como erro controlado', async () => {
  const noCurrentValue: NonNullable<CalculationEditorDialogProps['loadValue']> = async () => undefined as never;
  render(<CalculationEditorDialog initialCalculation={{
    ...calculation, expression: 'SINUSOID + 1',
  }} loadValue={noCurrentValue} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.click(screen.getByTestId('calculation-editor-execute'));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Aguardando os valores dos PI Points.'));
  expect(screen.getByTestId('calculation-editor-execute')).toBeEnabled();
  expect(queryHistory).not.toHaveBeenCalled();
});

it('calcula uma expressão PI no controller com um clique, sem carregar valores locais', async () => {
  classify.mockReturnValue({ target: 'pi', localFallbackSafe: false });
  probePi.mockResolvedValue({ times: 'supported', recorded: 'supported', intervals: 'supported', summary: 'supported' });
  evaluatePi.mockResolvedValue({ value: 52, timestamp: '2026-01-01T00:00:00Z', errors: [] });
  const loadValue = jest.fn();
  render(<CalculationEditorDialog initialCalculation={{ ...calculation, expression: "TagAvg('SINUSOID', '*-1h', '*')" }} loadValue={loadValue} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.click(screen.getByTestId('calculation-editor-execute'));

  await waitFor(() => expect(screen.getByTestId('calculation-editor-result')).toHaveTextContent('Último valor: 52'));
  expect(probePi).toHaveBeenCalledTimes(1);
  expect(evaluatePi).toHaveBeenCalledWith(expect.objectContaining({ expression: "TagAvg('SINUSOID', '*-1h', '*')", mode: 'times', time: '*' }));
  expect(loadValue).not.toHaveBeenCalled();
});

it('usa fallback local somente para expressão localmente compatível quando o controller está indisponível', async () => {
  classify.mockReturnValue({ target: 'pi', localFallbackSafe: true });
  probePi.mockResolvedValue({ times: 'unsupported', recorded: 'supported', intervals: 'supported', summary: 'supported' });
  const loadValue = jest.fn(async () => ({ value: 9 }));
  render(<CalculationEditorDialog initialCalculation={{ ...calculation, expression: 'Sqr(SINUSOID)' }} loadValue={loadValue} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.click(screen.getByTestId('calculation-editor-execute'));

  await waitFor(() => expect(screen.getByTestId('calculation-editor-result')).toHaveTextContent('Último valor: 3'));
  expect(loadValue).toHaveBeenCalledTimes(1);
  expect(evaluatePi).not.toHaveBeenCalled();
});

it.each([
  ['parcial', "TagAvg('SINUSOID', '*-1h', '*')"],
  ['não implementada localmente', "MedianFilt('SINUSOID', 1, 3)"],
])('não faz fallback local para função %s quando o controller está indisponível', async (_kind, expression) => {
  classify.mockReturnValue({ target: 'pi', localFallbackSafe: false });
  probePi.mockResolvedValue({ times: 'unsupported', recorded: 'supported', intervals: 'supported', summary: 'supported' });
  const loadValue = jest.fn(async () => ({ value: 9 }));
  render(<CalculationEditorDialog initialCalculation={{ ...calculation, expression }} loadValue={loadValue} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.click(screen.getByTestId('calculation-editor-execute'));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('/calculation/times indisponível'));
  expect(loadValue).not.toHaveBeenCalled();
});

it('mantém Calc Failed do PI como erro e não usa o fallback local', async () => {
  classify.mockReturnValue({ target: 'pi', localFallbackSafe: true });
  probePi.mockResolvedValue({ times: 'supported', recorded: 'supported', intervals: 'supported', summary: 'supported' });
  evaluatePi.mockRejectedValue(new Error('Calc Failed'));
  const loadValue = jest.fn(async () => ({ value: 9 }));
  render(<CalculationEditorDialog initialCalculation={{ ...calculation, expression: 'Sqr(SINUSOID)' }} loadValue={loadValue} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.click(screen.getByTestId('calculation-editor-execute'));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Calc Failed'));
  expect(loadValue).not.toHaveBeenCalled();
});

it('aceita resultado server-side para função não implementada localmente', async () => {
  classify.mockReturnValue({ target: 'pi', localFallbackSafe: false });
  probePi.mockResolvedValue({ times: 'supported', recorded: 'supported', intervals: 'supported', summary: 'supported' });
  evaluatePi.mockResolvedValue({ value: 7, timestamp: '2026-01-01T00:00:00Z', errors: [] });
  render(<CalculationEditorDialog initialCalculation={{ ...calculation, expression: "MedianFilt('SINUSOID', 1, 3)" }} loadValue={jest.fn()} onCancel={jest.fn()} onSave={jest.fn()} />);

  fireEvent.click(screen.getByTestId('calculation-editor-execute'));

  await waitFor(() => expect(screen.getByTestId('calculation-editor-result')).toHaveTextContent('Último valor: 7'));
});

it('preserva o último valor quando o Controller retorna o sentinel NoOutput', async () => {
  classify.mockReturnValue({ target: 'pi', localFallbackSafe: false });
  probePi.mockResolvedValue({ times: 'supported', recorded: 'supported', intervals: 'supported', summary: 'supported' });
  evaluatePi
    .mockResolvedValueOnce({ value: 10, timestamp: '2026-01-01T00:00:00Z', errors: [] })
    .mockResolvedValueOnce({ kind: 'no-output' });
  render(<CalculationEditorDialog initialCalculation={{ ...calculation, expression: "IF('SINUSOID' > 0, NoOutput(), 10)" }} loadValue={jest.fn()} onCancel={jest.fn()} onSave={jest.fn()} />);

  const button = screen.getByTestId('calculation-editor-execute');
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByTestId('calculation-editor-result')).toHaveTextContent('Último valor: 10'));
  fireEvent.click(button);
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.getByTestId('calculation-editor-result')).toHaveTextContent('Último valor: 10');
  expect(screen.getByTestId('calculation-editor-result')).toHaveTextContent('2026');
});
