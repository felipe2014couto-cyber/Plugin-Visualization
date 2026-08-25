import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createTrend } from '../../../createTrend';
import { TrendPropertiesPanel } from '../TrendPropertiesPanel';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

describe('TrendPropertiesPanel', () => {
  const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };
  const element = createTrend({ binding, id: 'trend-1' });

  it('renderiza o painel com a opção de ocultar a legenda e dispara onVisualChange', () => {
    const onVisualChange = jest.fn();
    const onSeriesChange = jest.fn();
    const onSeriesRemove = jest.fn();

    render(
      <TrendPropertiesPanel
        element={element}
        onVisualChange={onVisualChange}
        onSeriesChange={onSeriesChange}
        onSeriesRemove={onSeriesRemove}
      />,
    );

    const hideLegendCheckbox = screen.getByTestId('trend-hide-legend');
    expect(hideLegendCheckbox).toBeInTheDocument();
    expect(hideLegendCheckbox).not.toBeChecked();

    fireEvent.click(hideLegendCheckbox);
    expect(onVisualChange).toHaveBeenCalledWith({ hideLegend: true });
  });

  it('exibe checkbox marcado quando hideLegend for true', () => {
    const trendWithHiddenLegend = {
      ...element,
      properties: {
        ...element.properties,
        visual: { hideLegend: true },
      },
    };

    render(
      <TrendPropertiesPanel
        element={trendWithHiddenLegend}
        onVisualChange={jest.fn()}
        onSeriesChange={jest.fn()}
        onSeriesRemove={jest.fn()}
      />,
    );

    expect(screen.getByTestId('trend-hide-legend')).toBeChecked();
  });
});
