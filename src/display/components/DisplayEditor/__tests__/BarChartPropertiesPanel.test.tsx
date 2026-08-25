import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BarChartPropertiesPanel } from '../BarChartPropertiesPanel';
import { createBarChart } from '../../../createBarChart';

describe('BarChartPropertiesPanel', () => {
  const sampleBinding1 = {
    dataSourceUid: 'pi-default',
    serverPath: 'SRV\\PIMS',
    pointName: 'SINUSOID',
  };
  const sampleBinding2 = {
    dataSourceUid: 'pi-default',
    serverPath: 'SRV\\PIMS',
    pointName: 'CDT158',
  };

  function setup() {
    const element = createBarChart({ binding: sampleBinding1, id: 'bc-1' });
    element.properties.items.push({ binding: sampleBinding2 });

    const onChange = jest.fn();
    const onVisualChange = jest.fn();
    const onRemoveItem = jest.fn();
    const onMoveItem = jest.fn();
    const onClose = jest.fn();

    const view = render(
      <BarChartPropertiesPanel
        element={element}
        onChange={onChange}
        onVisualChange={onVisualChange}
        onRemoveItem={onRemoveItem}
        onMoveItem={onMoveItem}
        onClose={onClose}
      />
    );

    return {
      element,
      onChange,
      onVisualChange,
      onRemoveItem,
      onMoveItem,
      onClose,
      ...view,
    };
  }

  it('renders panel with all main sections', () => {
    setup();

    expect(screen.getByTestId('bar-chart-properties-panel')).toBeInTheDocument();
    expect(screen.getByText('Gráfico de Barras')).toBeInTheDocument();
    expect(screen.getByText('Estilo')).toBeInTheDocument();
    expect(screen.getByText('Orientação')).toBeInTheDocument();
    expect(screen.getByText('Grade')).toBeInTheDocument();
    expect(screen.getByText('Visibilidade')).toBeInTheDocument();
    expect(screen.getByText('Escala')).toBeInTheDocument();
    expect(screen.getByText('Início da barra')).toBeInTheDocument();
    expect(screen.getByText('Barras (2)')).toBeInTheDocument();
  });

  it('toggles title and updates title text', () => {
    const { onVisualChange } = setup();

    const titleCheckbox = screen.getByTestId('bar-chart-show-title');
    fireEvent.click(titleCheckbox);
    expect(onVisualChange).toHaveBeenCalledWith({ showTitle: true });
  });

  it('changes orientation when clicking vertical or horizontal buttons', () => {
    const { onVisualChange } = setup();

    fireEvent.click(screen.getByTestId('bar-chart-orientation-horizontal'));
    expect(onVisualChange).toHaveBeenCalledWith({ orientation: 'horizontal' });

    fireEvent.click(screen.getByTestId('bar-chart-orientation-vertical'));
    expect(onVisualChange).toHaveBeenCalledWith({ orientation: 'vertical' });
  });

  it('changes grid mode when clicking grid choices', () => {
    const { onVisualChange } = setup();

    fireEvent.click(screen.getByTestId('bar-chart-grid-bands'));
    expect(onVisualChange).toHaveBeenCalledWith({ gridMode: 'bands' });

    fireEvent.click(screen.getByTestId('bar-chart-grid-plain'));
    expect(onVisualChange).toHaveBeenCalledWith({ gridMode: 'plain' });
  });

  it('toggles visibility options and label mode', () => {
    const { onVisualChange } = setup();

    fireEvent.click(screen.getByTestId('bar-chart-show-units'));
    expect(onVisualChange).toHaveBeenCalledWith({ showUnits: true });

    fireEvent.click(screen.getByTestId('bar-chart-show-scale'));
    expect(onVisualChange).toHaveBeenCalledWith({ showScale: false });

    fireEvent.change(screen.getByTestId('bar-chart-label-mode'), { target: { value: 'description' } });
    expect(onVisualChange).toHaveBeenCalledWith({ labelMode: 'description' });
  });

  it('changes decimals and scale options', () => {
    const { onVisualChange } = setup();

    fireEvent.change(screen.getByTestId('bar-chart-decimals'), { target: { value: '3' } });
    expect(onVisualChange).toHaveBeenCalledWith({ decimals: 3 });

    fireEvent.change(screen.getByTestId('bar-chart-scale-mode'), { target: { value: 'custom' } });
    expect(onVisualChange).toHaveBeenCalledWith({ scaleMode: 'custom' });
  });

  it('invokes move and remove handlers on items list actions', () => {
    const { onMoveItem, onRemoveItem } = setup();

    const moveDownButtons = screen.getAllByTitle('Mover para baixo');
    fireEvent.click(moveDownButtons[0]);
    expect(onMoveItem).toHaveBeenCalledWith(0, 1);

    const removeButtons = screen.getAllByTitle('Excluir barra');
    fireEvent.click(removeButtons[1]);
    expect(onRemoveItem).toHaveBeenCalledWith(1);
  });
});
