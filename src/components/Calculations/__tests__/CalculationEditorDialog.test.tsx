import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { CalculationEditorDialog, type CalculationEditorDialogProps } from '../CalculationEditorDialog';
import { globalHistoricalPromiseLock, globalHistoricalResultCache } from '../../../calculations/calculationMacros';
import { getPiTrendsRecordedHistoryForRange } from '../../../pi/piDataSource';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return { ...actual, useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()) };
});

jest.mock('../../../pi/piDataSource', () => ({ getPiTrendsRecordedHistoryForRange: jest.fn() }));

const queryHistory = getPiTrendsRecordedHistoryForRange as jest.MockedFunction<typeof getPiTrendsRecordedHistoryForRange>;
const calculation = {
  id: '__preview__', name: 'Teste', expression: "Average('SINUSOID', '-1h', '*')",
  inputs: [{ name: 'SINUSOID', binding: { dataSourceUid: 'pi', serverPath: 'pims', pointName: 'SINUSOID' } }],
};

beforeEach(() => {
  queryHistory.mockReset();
  globalHistoricalPromiseLock.clear();
  globalHistoricalResultCache.clear();
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
