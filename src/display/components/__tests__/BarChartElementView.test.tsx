import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  BarChartElementView,
  formatBarChartValue,
  resolveBarChartItemLabel,
} from '../BarChartElementView';
import {
  createBarChart,
  getBarChartItemConsumerId,
  type BarChartElement,
  type BarChartVisualOptions,
  type BarChartItem,
} from '../../createBarChart';
import type { ValueRuntimeState } from '../../runtime/valueRuntime';
import type { PiPointDatabaseLimits } from '../../../pi/piPointBinding';

describe('BarChartElementView', () => {
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

  function setupElement(visualPatch: Partial<BarChartVisualOptions> = {}): BarChartElement {
    const el = createBarChart({
      binding: sampleBinding1,
      id: 'barchart-1',
      x: 50,
      y: 60,
      width: 500,
      height: 300,
      visual: visualPatch,
    });
    el.properties.items.push({
      binding: sampleBinding2,
      label: 'Temperatura',
      engineeringUnit: '°C',
    });
    return el;
  }

  it('renders SVG element with vertical bars, labels, values and ticks', () => {
    const element = setupElement({
      showTitle: true,
      title: 'Visão Geral',
      gridMode: 'lines',
    });

    const consumerId1 = getBarChartItemConsumerId(element.id, sampleBinding1);
    const consumerId2 = getBarChartItemConsumerId(element.id, sampleBinding2);

    const runtimeStates = new Map<string, ValueRuntimeState>([
      [
        consumerId1,
        {
          status: 'success',
          result: {
            value: 75.4,
            unit: '°C',
            timestamp: '2026-08-24T10:00:00Z',
          },
        },
      ],
      [
        consumerId2,
        {
          status: 'success',
          result: {
            value: 42.1,
            unit: '°C',
            timestamp: '2026-08-24T10:00:00Z',
          },
        },
      ],
    ]);

    render(
      <svg>
        <BarChartElementView element={element} runtimeStates={runtimeStates} />
      </svg>
    );

    expect(screen.getByTestId(`display-element-${element.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`bar-chart-background-${element.id}`)).toBeInTheDocument();
    expect(screen.getByText('Visão Geral')).toBeInTheDocument();
    expect(screen.getByTestId(`bar-chart-grid-lines-${element.id}`)).toBeInTheDocument();

    // Bars
    expect(screen.getByTestId(`bar-chart-bar-${element.id}-0`)).toBeInTheDocument();
    expect(screen.getByTestId(`bar-chart-bar-${element.id}-1`)).toBeInTheDocument();

    // Labels
    expect(screen.getByTestId(`bar-chart-label-${element.id}-0`)).toHaveTextContent('SINUSOID');
    expect(screen.getByTestId(`bar-chart-label-${element.id}-1`)).toHaveTextContent('CDT158');

    // Values
    expect(screen.getByTestId(`bar-chart-value-${element.id}-0`)).toHaveTextContent('75.4');
    expect(screen.getByTestId(`bar-chart-value-${element.id}-1`)).toHaveTextContent('42.1');
  });

  it('renders horizontal layout when orientation is horizontal', () => {
    const element = setupElement({
      orientation: 'horizontal',
      gridMode: 'bands',
    });

    const consumerId1 = getBarChartItemConsumerId(element.id, sampleBinding1);
    const runtimeStates = new Map<string, ValueRuntimeState>([
      [
        consumerId1,
        {
          status: 'success',
          result: {
            value: 60,
            timestamp: '2026-08-24T10:00:00Z',
          },
        },
      ],
    ]);

    render(
      <svg>
        <BarChartElementView element={element} runtimeStates={runtimeStates} />
      </svg>
    );

    expect(screen.getByTestId(`bar-chart-grid-bands-${element.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`bar-chart-bar-${element.id}-0`)).toBeInTheDocument();
  });

  it('combines database limits across multiple tags in database scale mode', () => {
    const element = setupElement({
      scaleMode: 'database',
    });

    const consumerId1 = getBarChartItemConsumerId(element.id, sampleBinding1);
    const consumerId2 = getBarChartItemConsumerId(element.id, sampleBinding2);

    const databaseScales: Record<string, PiPointDatabaseLimits> = {
      [consumerId1]: { zero: 10, span: 90 }, // 10 .. 100
      [consumerId2]: { zero: 0, span: 200 }, // 0 .. 200 -> combined: 0 .. 200
    };

    const runtimeStates = new Map<string, ValueRuntimeState>([
      [consumerId1, { status: 'success', result: { value: 100, timestamp: '2026-08-24T10:00:00Z' } }],
    ]);

    render(
      <svg>
        <BarChartElementView
          element={element}
          runtimeStates={runtimeStates}
          databaseScales={databaseScales}
        />
      </svg>
    );

    // Ticks should cover up to 200
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('formats values correctly for number format with decimals and thousands separator', () => {
    const visual: BarChartVisualOptions = {
      ...createBarChart({ binding: sampleBinding1 }).properties.visual as any,
      numberFormat: 'number',
      decimals: 2,
      useThousandsSeparator: true,
    };

    expect(formatBarChartValue(1234567.891, visual)).toBe('1,234,567.89');
    expect(formatBarChartValue(42, visual)).toBe('42.00');
  });

  it('formats values correctly for scientific format', () => {
    const visual: BarChartVisualOptions = {
      ...createBarChart({ binding: sampleBinding1 }).properties.visual as any,
      numberFormat: 'scientific',
      decimals: 2,
    };

    expect(formatBarChartValue(12340, visual)).toBe('1.23E+4');
  });

  it('resolves item labels based on labelMode and customName', () => {
    const item: BarChartItem = {
      binding: sampleBinding1,
      label: 'Tag Label',
      description: 'Tag Description',
      nameMode: 'custom',
      customName: 'Custom Tag Name',
    };

    expect(resolveBarChartItemLabel(item, 'default')).toBe('Custom Tag Name');
    expect(resolveBarChartItemLabel({ ...item, nameMode: 'default' }, 'name')).toBe('SINUSOID');
    expect(resolveBarChartItemLabel({ ...item, nameMode: 'default' }, 'description')).toBe('Tag Description');
  });

  it('handles loading and error states without crashing', () => {
    const element = setupElement();
    const consumerId1 = getBarChartItemConsumerId(element.id, sampleBinding1);
    const consumerId2 = getBarChartItemConsumerId(element.id, sampleBinding2);

    const runtimeStates = new Map<string, ValueRuntimeState>([
      [consumerId1, { status: 'loading' }],
      [consumerId2, { status: 'error' }],
    ]);

    render(
      <svg>
        <BarChartElementView element={element} runtimeStates={runtimeStates} />
      </svg>
    );

    expect(screen.getByTestId(`bar-chart-value-${element.id}-0`)).toHaveTextContent('...');
    expect(screen.getByTestId(`bar-chart-value-${element.id}-1`)).toHaveTextContent('--');
  });
});
