import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDisplayDocument, type DisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';
import type { PiPointSearchResult } from '../../../../pi/piDataSource';
import type { LoadTrendSeries } from '../../../runtime/trendRuntime';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

const selectedPiPoint: PiPointSearchResult = {
  name: 'SINUSOID',
  path: '\\\\pims\\SINUSOID',
  webId: 'point-webid',
  dataSourceUid: 'resolved-datasource',
};

function Harness({ loadTrend, loadRecordedTrend }: { loadTrend: LoadTrendSeries; loadRecordedTrend?: LoadTrendSeries }) {
  const [document, setDocument] = useState<DisplayDocument>(() => createDisplayDocument({ name: 'Trend Display' }));
  return (
    <DisplayEditor
      document={document}
      onChange={setDocument}
      selectedPiPoint={selectedPiPoint}
      loadTrend={loadTrend}
      loadRecordedTrend={loadRecordedTrend}
    />
  );
}

describe('DisplayEditor - Trend', () => {
  it('cria Trend somente após seleção explícita e preserva o gráfico em Visualizar', async () => {
    const loadTrend = jest.fn(async (bindings) => ({
      'resolved-datasource\u0000pims\u0000SINUSOID': {
        status: 'success' as const,
        series: {
          pointName: bindings[0].pointName,
          points: [{ time: Date.parse('2026-08-06T12:00:00.000Z'), value: 10 }, { time: Date.parse('2026-08-06T12:30:00.000Z'), value: 12 }],
        },
      },
    }));
    render(<Harness loadTrend={loadTrend} />);

    const insert = screen.getByTestId('display-insert-trend');
    expect(insert).not.toBeDisabled();
    expect(screen.queryByTestId(/^display-element-/)).toBeNull();
    fireEvent.click(insert);

    const trend = screen.getByTestId(/^display-element-/);
    expect(trend).toHaveAttribute('data-element-type', 'trend');
    expect(screen.getByTestId('display-selection-bounding-box')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('trend-line-' + trend.getAttribute('data-element-id'))).toBeInTheDocument());
    expect(loadTrend).toHaveBeenCalledWith([{
      dataSourceUid: 'resolved-datasource',
      serverPath: 'pims',
      pointName: 'SINUSOID',
    }], expect.any(Function));

    fireEvent.click(screen.getByTestId('display-mode-view'));
    expect(screen.queryByTestId('display-selection-bounding-box')).toBeNull();
    expect(screen.getByTestId('trend-line-' + trend.getAttribute('data-element-id'))).toBeInTheDocument();
  });

  it('troca para Recorded Values em cache com duplo clique somente em Visualizar', async () => {
    const resultKey = 'resolved-datasource\u0000pims\u0000SINUSOID';
    const loadTrend = jest.fn(async () => ({
      [resultKey]: {
        status: 'success' as const,
        series: { pointName: 'SINUSOID', points: [
          { time: 1, value: 0 }, { time: 2, value: 5 }, { time: 3, value: 0 },
        ] },
      },
    }));
    const loadRecordedTrend = jest.fn(async () => ({
      [resultKey]: {
        status: 'success' as const,
        series: { pointName: 'SINUSOID', points: [
          { time: 1, value: 0 }, { time: 2, value: 0 }, { time: 3, value: 10 },
        ] },
      },
    }));
    render(<Harness loadTrend={loadTrend} loadRecordedTrend={loadRecordedTrend} />);
    fireEvent.click(screen.getByTestId('display-insert-trend'));
    const trend = screen.getByTestId(/^display-element-/);
    const elementId = trend.getAttribute('data-element-id');
    const line = await screen.findByTestId(`trend-line-${elementId}`);
    const interpolatedPath = line.getAttribute('d');

    fireEvent.doubleClick(trend);
    expect(loadRecordedTrend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('display-mode-view'));
    fireEvent.doubleClick(trend);

    await waitFor(() => expect(loadRecordedTrend).toHaveBeenCalledWith([{
      dataSourceUid: 'resolved-datasource',
      serverPath: 'pims',
      pointName: 'SINUSOID',
    }]));
    await waitFor(() => expect(screen.getByTestId(`trend-line-${elementId}`).getAttribute('d')).not.toBe(interpolatedPath));
  });
});
