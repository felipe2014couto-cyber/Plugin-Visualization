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

  describe('Range and Multi-Selection Behaviors', () => {
    it('selects a rectangular block by dragging from A1 to D10', () => {
      render(<MiniSheetsPanel />);
      const cellA1 = screen.getByTestId('mini-sheets-cell-A1');
      const cellD10 = screen.getByTestId('mini-sheets-cell-D10');

      fireEvent.pointerDown(cellA1);
      fireEvent.pointerEnter(cellD10);

      expect(screen.getByTestId('mini-sheets-active-cell')).toHaveTextContent('A1:D10');
      expect(cellA1.className).toMatch(/css-/);
      expect(cellD10.className).toMatch(/css-/);
    });

    it('normalizes inverted drag from D10 to A1', () => {
      render(<MiniSheetsPanel />);
      const cellD10 = screen.getByTestId('mini-sheets-cell-D10');
      const cellA1 = screen.getByTestId('mini-sheets-cell-A1');

      fireEvent.pointerDown(cellD10);
      fireEvent.pointerEnter(cellA1);

      expect(screen.getByTestId('mini-sheets-active-cell')).toHaveTextContent('A1:D10');
    });

    it('extends range with Shift + click', () => {
      render(<MiniSheetsPanel />);
      const cellA1 = screen.getByTestId('mini-sheets-cell-A1');
      const cellD10 = screen.getByTestId('mini-sheets-cell-D10');

      fireEvent.pointerDown(cellA1);
      fireEvent(cellD10, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true }));

      expect(screen.getByTestId('mini-sheets-active-cell')).toHaveTextContent('A1:D10');
    });

    it('selects an entire column when clicking header A', () => {
      render(<MiniSheetsPanel />);
      const colA = screen.getByTestId('mini-sheets-col-header-A');
      fireEvent.pointerDown(colA);

      expect(screen.getByTestId('mini-sheets-active-cell')).toHaveTextContent('A');
      expect(colA.className).toMatch(/css-/);
    });

    it('selects multiple columns when dragging from B to F', () => {
      render(<MiniSheetsPanel />);
      const colB = screen.getByTestId('mini-sheets-col-header-B');
      const colF = screen.getByTestId('mini-sheets-col-header-F');

      fireEvent.pointerDown(colB);
      fireEvent.pointerEnter(colF);

      expect(screen.getByTestId('mini-sheets-active-cell')).toHaveTextContent('B:F');
      expect(colB.className).toMatch(/css-/);
      expect(colF.className).toMatch(/css-/);
    });

    it('selects column interval with Shift + click', () => {
      render(<MiniSheetsPanel />);
      const colB = screen.getByTestId('mini-sheets-col-header-B');
      const colF = screen.getByTestId('mini-sheets-col-header-F');

      fireEvent.pointerDown(colB);
      fireEvent(colF, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true }));

      expect(screen.getByTestId('mini-sheets-active-cell')).toHaveTextContent('B:F');
    });

    it('selects an entire row when clicking row header 5', () => {
      render(<MiniSheetsPanel />);
      const row5 = screen.getByTestId('mini-sheets-row-header-5');
      fireEvent.pointerDown(row5);

      expect(screen.getByTestId('mini-sheets-active-cell')).toHaveTextContent('5');
      expect(row5.className).toMatch(/css-/);
    });

    it('selects multiple rows when dragging row 5 to row 12', () => {
      render(<MiniSheetsPanel />);
      const row5 = screen.getByTestId('mini-sheets-row-header-5');
      const row12 = screen.getByTestId('mini-sheets-row-header-12');

      fireEvent.pointerDown(row5);
      fireEvent.pointerEnter(row12);

      expect(screen.getByTestId('mini-sheets-active-cell')).toHaveTextContent('5:12');
      expect(row5.className).toMatch(/css-/);
      expect(row12.className).toMatch(/css-/);
    });

    it('selects entire sheet with select-all top-left button', () => {
      render(<MiniSheetsPanel />);
      const selectAll = screen.getByTestId('mini-sheets-select-all');
      fireEvent.click(selectAll);

      expect(screen.getByTestId('mini-sheets-active-cell')).toHaveTextContent('A1:T50');
    });

    it('adds multiple non-adjacent ranges with Ctrl/Cmd key', () => {
      render(<MiniSheetsPanel />);
      const cellA1 = screen.getByTestId('mini-sheets-cell-A1');
      const cellB5 = screen.getByTestId('mini-sheets-cell-B5');
      const cellD1 = screen.getByTestId('mini-sheets-cell-D1');
      const cellE5 = screen.getByTestId('mini-sheets-cell-E5');

      // Select A1:B5
      fireEvent.pointerDown(cellA1);
      fireEvent.pointerEnter(cellB5);

      // Ctrl + drag D1:E5
      fireEvent.pointerDown(cellD1, { ctrlKey: true });
      fireEvent.pointerEnter(cellE5);

      // Both regions are inside selection
      expect(cellA1.className).toMatch(/css-/);
      expect(cellE5.className).toMatch(/css-/);
    });

    it('selects non-adjacent columns with Ctrl/Cmd key (A, C, F)', () => {
      render(<MiniSheetsPanel />);
      const colA = screen.getByTestId('mini-sheets-col-header-A');
      const colC = screen.getByTestId('mini-sheets-col-header-C');
      const colF = screen.getByTestId('mini-sheets-col-header-F');

      fireEvent.pointerDown(colA);
      fireEvent.pointerDown(colC, { ctrlKey: true });
      fireEvent.pointerDown(colF, { ctrlKey: true });

      expect(colA.className).toMatch(/css-/);
      expect(colC.className).toMatch(/css-/);
      expect(colF.className).toMatch(/css-/);
    });

    it('supports inline editing on double click without breaking selection', async () => {
      render(<MiniSheetsPanel />);
      const cellB2 = screen.getByTestId('mini-sheets-cell-B2');

      fireEvent.doubleClick(cellB2);
      const input = cellB2.querySelector('input');
      expect(input).toBeInTheDocument();

      fireEvent.change(input!, { target: { value: 'Valor Editado' } });
      fireEvent.keyDown(input!, { key: 'Enter' });

      await waitFor(() => {
        expect(cellB2).toHaveTextContent('Valor Editado');
      });
    });
  });

  describe('Block Delete, Copy/Paste, Autofill & Formatting', () => {
    it('deletes single cell and block range with Delete key', async () => {
      render(<MiniSheetsPanel />);
      const input = screen.getByTestId('mini-sheets-formula-input');

      // Populate A1 and A2
      fireEvent.change(input, { target: { value: '100' } });
      fireEvent.submit(input.closest('form')!);
      await waitFor(() => expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('100'));

      const cellA2 = screen.getByTestId('mini-sheets-cell-A2');
      fireEvent.pointerDown(cellA2);
      fireEvent.change(input, { target: { value: '200' } });
      fireEvent.submit(input.closest('form')!);
      await waitFor(() => expect(screen.getByTestId('mini-sheets-cell-A2')).toHaveTextContent('200'));

      // Select A1:A2 and press Delete
      const cellA1 = screen.getByTestId('mini-sheets-cell-A1');
      fireEvent.pointerDown(cellA1);
      fireEvent.pointerEnter(cellA2);

      const panel = screen.getByTestId('mini-sheets-panel');
      fireEvent.keyDown(panel, { key: 'Delete' });

      await waitFor(() => {
        expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('');
        expect(screen.getByTestId('mini-sheets-cell-A2')).toHaveTextContent('');
      });
    });

    it('clears entire spill tree when deleting a spilled or origin cell', async () => {
      searchMock.mockResolvedValue({
        results: [{ name: 'LFS_RB2_TAG', path: '\\\\PISERVER\\LFS_RB2_TAG', dataSourceUid: 'pi-uid' }],
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
      });

      // Select spilled target B2 and press Delete -> should clear entire origin and spill
      const cellB2 = screen.getByTestId('mini-sheets-cell-B2');
      fireEvent.pointerDown(cellB2);

      const panel = screen.getByTestId('mini-sheets-panel');
      fireEvent.keyDown(panel, { key: 'Delete' });

      await waitFor(() => {
        expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('');
        expect(screen.getByTestId('mini-sheets-cell-B1')).toHaveTextContent('');
        expect(screen.getByTestId('mini-sheets-cell-A2')).toHaveTextContent('');
        expect(screen.getByTestId('mini-sheets-cell-B2')).toHaveTextContent('');
      });
    });

    it('copies and pastes single cells and matrix with relative formula adjustments', async () => {
      render(<MiniSheetsPanel />);
      const input = screen.getByTestId('mini-sheets-formula-input');
      const panel = screen.getByTestId('mini-sheets-panel');

      // A1 = 10
      fireEvent.change(input, { target: { value: '10' } });
      fireEvent.submit(input.closest('form')!);
      await waitFor(() => expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('10'));

      // B1 = =A1*2
      const cellB1 = screen.getByTestId('mini-sheets-cell-B1');
      fireEvent.pointerDown(cellB1);
      fireEvent.change(input, { target: { value: '=A1*2' } });
      fireEvent.submit(input.closest('form')!);
      await waitFor(() => expect(screen.getByTestId('mini-sheets-cell-B1')).toHaveTextContent('20'));

      // Copy B1 (Ctrl+C)
      fireEvent.keyDown(panel, { key: 'c', ctrlKey: true });

      // Paste into B2 (Ctrl+V) -> should adjust =A1*2 into =A2*2
      const cellB2 = screen.getByTestId('mini-sheets-cell-B2');
      fireEvent.pointerDown(cellB2);
      fireEvent.keyDown(panel, { key: 'v', ctrlKey: true });

      // Check formula bar text for B2
      await waitFor(() => {
        expect(screen.getByTestId('mini-sheets-formula-input')).toHaveValue('=A2*2');
      });
    });

    it('applies formatting (bold, italic, colors, align, decimals) to selected range', async () => {
      render(<MiniSheetsPanel />);
      const input = screen.getByTestId('mini-sheets-formula-input');

      // Set cell A1 = 12.3456
      fireEvent.change(input, { target: { value: '12.3456' } });
      fireEvent.submit(input.closest('form')!);
      await waitFor(() => expect(screen.getByTestId('mini-sheets-cell-A1')).toHaveTextContent('12.3456'));

      // Bold
      const boldBtn = screen.getByTestId('mini-sheets-format-bold');
      fireEvent.click(boldBtn);

      // Italic
      const italicBtn = screen.getByTestId('mini-sheets-format-italic');
      fireEvent.click(italicBtn);

      // Decimals = 2
      const decimalSelect = screen.getByTestId('mini-sheets-format-decimals');
      fireEvent.change(decimalSelect, { target: { value: '2' } });

      await waitFor(() => {
        const cellA1 = screen.getByTestId('mini-sheets-cell-A1');
        expect(cellA1).toHaveTextContent('12.35');
        expect(cellA1).toHaveStyle('font-weight: bold');
        expect(cellA1).toHaveStyle('font-style: italic');
      });
    });

    it('renders fill handle on the primary selected range', () => {
      render(<MiniSheetsPanel />);
      const fillHandle = screen.getByTestId('mini-sheets-fill-handle');
      expect(fillHandle).toBeInTheDocument();
    });

    it('renders column resize handles and resizes column on drag', async () => {
      render(<MiniSheetsPanel />);
      const resizerA = screen.getByTestId('mini-sheets-col-resizer-A');
      expect(resizerA).toBeInTheDocument();

      const colHeaderA = screen.getByTestId('mini-sheets-col-header-A');
      const cellA1 = screen.getByTestId('mini-sheets-cell-A1');
      expect(colHeaderA).toHaveStyle('width: 100px');
      expect(cellA1).toHaveStyle('width: 100px');

      // Drag resize handle A to the right by +60px (start at 100, drag to 160)
      fireEvent.mouseDown(resizerA, { clientX: 100 });
      fireEvent.mouseMove(window, { clientX: 160 });
      fireEvent.mouseUp(window);

      await waitFor(() => {
        expect(colHeaderA).toHaveStyle('width: 160px');
        expect(cellA1).toHaveStyle('width: 160px');
      });
    });
  });
});
