import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { MiniSheetsPanel } from '../MiniSheetsPanel';
import {
  searchPiPointsWithStatus,
  getPiPointCurrentValue,
  getPiTrendsRecordedHistoryForRange,
  getPiTrendsPreviewForRange,
} from '../../../pi/piDataSource';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

jest.mock('../../../pi/piDataSource', () => ({
  searchPiPointsWithStatus: jest.fn(),
  getPiPointCurrentValue: jest.fn(),
  getPiTrendsRecordedHistoryForRange: jest.fn(),
  getPiTrendsPreviewForRange: jest.fn(),
}));

describe('MiniSheetsPanel', () => {
  const searchMock = searchPiPointsWithStatus as jest.MockedFunction<typeof searchPiPointsWithStatus>;
  const currValMock = getPiPointCurrentValue as jest.MockedFunction<typeof getPiPointCurrentValue>;
  const recordedMock = getPiTrendsRecordedHistoryForRange as jest.MockedFunction<
    typeof getPiTrendsRecordedHistoryForRange
  >;
  const previewMock = getPiTrendsPreviewForRange as jest.MockedFunction<typeof getPiTrendsPreviewForRange>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders grid with headers and active cell indicator', () => {
    render(<MiniSheetsPanel />);
    expect(screen.getByTestId('mini-sheets-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mini-sheets-active-cell')).toHaveTextContent('A1');
    expect(screen.getByTestId('mini-sheets-cell-A1')).toBeInTheDocument();
    expect(screen.getByTestId('mini-sheets-cell-T50')).toBeInTheDocument();
  });

  it('selects cell when clicked and updates formula bar', () => {
    render(<MiniSheetsPanel />);
    const cellB2 = screen.getByTestId('mini-sheets-cell-B2');
    fireEvent.click(cellB2);

    expect(screen.getByTestId('mini-sheets-active-cell')).toHaveTextContent('B2');
  });

  it('enters simple text and displays it', async () => {
    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    fireEvent.change(input, { target: { value: 'Temperatura' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('Temperatura');
    });
  });

  it('enters simple number and displays it', async () => {
    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    fireEvent.change(input, { target: { value: '123.45' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('123.45');
    });
  });

  it('evaluates math formula =A1+B1', async () => {
    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    // A1 = 10
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.submit(input.closest('form')!);

    // B1 = 25
    fireEvent.click(screen.getByTestId('mini-sheets-cell-B1'));
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.submit(input.closest('form')!);

    // C1 = =A1+B1
    fireEvent.click(screen.getByTestId('mini-sheets-cell-C1'));
    fireEvent.change(input, { target: { value: '=A1+B1' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-C1')).toHaveTextContent('35');
    });
  });

  it('evaluates aggregate formula =SUM(A1:A3)', async () => {
    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    // A1 = 10
    fireEvent.click(screen.getByTestId('mini-sheets-cell-A1'));
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.submit(input.closest('form')!);

    // A2 = 20
    fireEvent.click(screen.getByTestId('mini-sheets-cell-A2'));
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.submit(input.closest('form')!);

    // A3 = 30
    fireEvent.click(screen.getByTestId('mini-sheets-cell-A3'));
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.submit(input.closest('form')!);

    // A4 = =SUM(A1:A3)
    fireEvent.click(screen.getByTestId('mini-sheets-cell-A4'));
    fireEvent.change(input, { target: { value: '=SUM(A1:A3)' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A4')).toHaveTextContent('60');
    });
  });

  it('evaluates =PICurrVal("LFS_RB2_MOTOR_TEMP")', async () => {
    searchMock.mockResolvedValue({
      results: [
        {
          name: 'LFS_RB2_MOTOR_TEMP',
          path: '\\\\PISERVER\\LFS_RB2_MOTOR_TEMP',
          dataSourceUid: 'pi-uid',
          webId: 'web-123',
        },
      ],
      hasMore: false,
    });
    currValMock.mockResolvedValue({
      value: 78.4,
      timestamp: '2026-08-19T07:00:00Z',
    });

    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    fireEvent.change(input, { target: { value: '=PICurrVal("LFS_RB2_MOTOR_TEMP")' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('78.4');
    });
  });

  it('evaluates =PIArcVal("LFS_RB2_MOTOR_TEMP", "*-1h")', async () => {
    searchMock.mockResolvedValue({
      results: [
        {
          name: 'LFS_RB2_MOTOR_TEMP',
          path: '\\\\PISERVER\\LFS_RB2_MOTOR_TEMP',
          dataSourceUid: 'pi-uid',
        },
      ],
      hasMore: false,
    });
    recordedMock.mockResolvedValue({
      'pi-uid\u0000PISERVER\u0000LFS_RB2_MOTOR_TEMP': {
        status: 'success',
        series: {
          pointName: 'LFS_RB2_MOTOR_TEMP',
          points: [
            { time: Date.now() - 3600000, value: 65.2 },
          ],
        },
      },
    });

    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    fireEvent.change(input, { target: { value: '=PIArcVal("LFS_RB2_MOTOR_TEMP", "*-1h")' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('65.2');
    });
  });

  it('evaluates =PICompDat with SPILL to timestamp and value columns', async () => {
    searchMock.mockResolvedValue({
      results: [
        {
          name: 'LFS_RB2_TAG',
          path: '\\\\PISERVER\\LFS_RB2_TAG',
          dataSourceUid: 'pi-uid',
        },
      ],
      hasMore: false,
    });
    const ts1 = new Date(2026, 7, 19, 7, 0, 0).getTime();
    const ts2 = new Date(2026, 7, 19, 7, 3, 0).getTime();
    recordedMock.mockResolvedValue({
      'pi-uid\u0000PISERVER\u0000LFS_RB2_TAG': {
        status: 'success',
        series: {
          pointName: 'LFS_RB2_TAG',
          points: [
            { time: ts1, value: 35.2 },
            { time: ts2, value: 35.7 },
          ],
        },
      },
    });

    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    fireEvent.change(input, { target: { value: '=PICompDat("LFS_RB2_TAG", "*-1h", "*")' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('19/08/2026 07:00:00');
      expect(screen.getByTestId('mini-sheets-cell-B1')).toHaveTextContent('35.2');
      expect(screen.getByTestId('mini-sheets-cell-A2')).toHaveTextContent('19/08/2026 07:03:00');
      expect(screen.getByTestId('mini-sheets-cell-B2')).toHaveTextContent('35.7');
    });
  });

  it('evaluates =PISampDat with SPILL to interpolated rows', async () => {
    searchMock.mockResolvedValue({
      results: [
        {
          name: 'LFS_RB2_TAG',
          path: '\\\\PISERVER\\LFS_RB2_TAG',
          dataSourceUid: 'pi-uid',
        },
      ],
      hasMore: false,
    });
    const ts1 = new Date(2026, 7, 19, 7, 0, 0).getTime();
    const ts2 = new Date(2026, 7, 19, 7, 5, 0).getTime();
    previewMock.mockResolvedValue({
      'pi-uid\u0000PISERVER\u0000LFS_RB2_TAG': {
        status: 'success',
        series: {
          pointName: 'LFS_RB2_TAG',
          points: [
            { time: ts1, value: 35.2 },
            { time: ts2, value: 35.5 },
          ],
        },
      },
    });

    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    fireEvent.change(input, { target: { value: '=PISampDat("LFS_RB2_TAG", "*-1h", "*", "5m")' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('19/08/2026 07:00:00');
      expect(screen.getByTestId('mini-sheets-cell-B1')).toHaveTextContent('35.2');
      expect(screen.getByTestId('mini-sheets-cell-A2')).toHaveTextContent('19/08/2026 07:05:00');
      expect(screen.getByTestId('mini-sheets-cell-B2')).toHaveTextContent('35.5');
    });
  });

  it('shows #SPILL! when target cell has manual data', async () => {
    searchMock.mockResolvedValue({
      results: [
        {
          name: 'LFS_RB2_TAG',
          path: '\\\\PISERVER\\LFS_RB2_TAG',
          dataSourceUid: 'pi-uid',
        },
      ],
      hasMore: false,
    });
    recordedMock.mockResolvedValue({
      'pi-uid\u0000PISERVER\u0000LFS_RB2_TAG': {
        status: 'success',
        series: {
          pointName: 'LFS_RB2_TAG',
          points: [
            { time: Date.now() - 10000, value: 10 },
            { time: Date.now(), value: 20 },
          ],
        },
      },
    });

    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    // Enter manual data in B1
    fireEvent.click(screen.getByTestId('mini-sheets-cell-B1'));
    fireEvent.change(input, { target: { value: 'Bloqueio' } });
    fireEvent.submit(input.closest('form')!);

    // Enter PICompDat in A1
    fireEvent.click(screen.getByTestId('mini-sheets-cell-A1'));
    fireEvent.change(input, { target: { value: '=PICompDat("LFS_RB2_TAG", "*-1h", "*")' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('#SPILL!');
      expect(screen.getByTestId('mini-sheets-cell-B1')).toHaveTextContent('Bloqueio');
    });
  });

  it('shows #PI! on PI point resolution failure or query error', async () => {
    searchMock.mockResolvedValue({ results: [], hasMore: false });

    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    fireEvent.change(input, { target: { value: '=PICurrVal("NON_EXISTENT_TAG")' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('#PI!');
    });
  });

  it('shows #FORMULA! on invalid formula syntax', async () => {
    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    fireEvent.change(input, { target: { value: '=PICurrVal()' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('#FORMULA!');
    });
  });

  it('recalculates formulas when clicking Recalcular button', async () => {
    searchMock.mockResolvedValue({
      results: [
        {
          name: 'LFS_TAG',
          path: '\\\\PISERVER\\LFS_TAG',
          dataSourceUid: 'pi-uid',
        },
      ],
      hasMore: false,
    });
    currValMock.mockResolvedValueOnce({ value: 100 }).mockResolvedValueOnce({ value: 200 });

    render(<MiniSheetsPanel />);
    const input = screen.getByTestId('mini-sheets-formula-input');

    fireEvent.change(input, { target: { value: '=PICurrVal("LFS_TAG")' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('100');
    });

    fireEvent.click(screen.getByTestId('mini-sheets-recalculate'));

    await waitFor(() => {
      expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('200');
    });
  });
});
