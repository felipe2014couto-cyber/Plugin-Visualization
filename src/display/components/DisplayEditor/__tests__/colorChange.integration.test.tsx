import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import {
  appendBar,
  appendDisplayElement,
  appendGauge,
  createBar,
  createDisplayDocument,
  createGauge,
  createRectangle,
  DEFAULT_RECTANGLE_PROPERTIES,
  type DisplayDocument,
} from '../../../index';
import { DisplayEditor } from '../DisplayEditor';
import type { PiPointBinding } from '../../../../pi/piPointBinding';
import type { PiPointValue } from '../../../../pi/piDataSource';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
  };
});

beforeAll(() => {
  const w = window as unknown as {
    PointerEvent?: typeof MouseEvent;
    MouseEvent: typeof MouseEvent;
  };
  if (typeof w.PointerEvent !== 'function') {
    w.PointerEvent = class FakePointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      readonly isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? 'mouse';
        this.isPrimary = init.isPrimary ?? true;
      }
    } as unknown as typeof MouseEvent;
  }
});

const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };

function Harness({
  initial,
  loadValue,
  onChange,
}: {
  initial: DisplayDocument;
  loadValue?: (binding: PiPointBinding) => Promise<PiPointValue>;
  onChange?: (document: DisplayDocument) => void;
}) {
  const [document, setDocument] = useState<DisplayDocument>(initial);
  return (
    <DisplayEditor
      document={document}
      onChange={(next) => {
        setDocument(next);
        onChange?.(next);
      }}
      loadValue={loadValue}
    />
  );
}

function selectElement(id: string): void {
  const element = screen.getByTestId(`display-element-${id}`);
  fireEvent.pointerDown(element, { clientX: 20, clientY: 20, pointerId: 1 });
  fireEvent.pointerUp(element, { clientX: 20, clientY: 20, pointerId: 1 });
}

describe('DisplayEditor - cor do Gauge', () => {
  it('altera a cor base, atualiza o documento e reflete no SVG', async () => {
    const changes: DisplayDocument[] = [];
    const initial = appendGauge(
      createDisplayDocument({ name: 'Cor' }),
      createGauge({ id: 'gauge', binding }),
    );
    const loadValue = jest.fn(async () => ({ value: 25 }));
    render(<Harness initial={initial} loadValue={loadValue} onChange={(next) => changes.push(next)} />);

    selectElement('gauge');
    await waitFor(() => expect(screen.getByTestId('gauge-fill-gauge')).toHaveAttribute('stroke', '#00a2e8'));

    fireEvent.change(screen.getByTestId('gauge-color'), { target: { value: '#ff9830' } });

    expect(screen.getByTestId('gauge-fill-gauge')).toHaveAttribute('stroke', '#ff9830');
    expect(changes.at(-1)?.elements[0].properties).toMatchObject({ color: '#ff9830' });
    expect(changes.at(-1)?.elements[0].properties).toMatchObject({ minimum: 0, maximum: 100 });
  });

  it('altera a cor do contorno e da escala do Gauge', async () => {
    const changes: DisplayDocument[] = [];
    const initial = appendGauge(
      createDisplayDocument({ name: 'Cor' }),
      createGauge({ id: 'gauge', binding }),
    );
    const loadValue = jest.fn(async () => ({ value: 50 }));
    render(<Harness initial={initial} loadValue={loadValue} onChange={(next) => changes.push(next)} />);

    selectElement('gauge');
    await waitFor(() => expect(screen.getByTestId('gauge-track-gauge')).toHaveAttribute('stroke', 'var(--text-primary, #f8fafc)'));

    fireEvent.change(screen.getByTestId('gauge-border-color'), { target: { value: '#ff5500' } });
    expect(screen.getByTestId('gauge-track-gauge')).toHaveAttribute('stroke', '#ff5500');
    expect(changes.at(-1)?.elements[0].properties).toMatchObject({ gaugeBorderColor: '#ff5500' });

    fireEvent.change(screen.getByTestId('gauge-scale-color'), { target: { value: '#00ffcc' } });
    expect(screen.getByTestId('gauge-value-gauge')).toHaveAttribute('fill', '#00ffcc');
    expect(changes.at(-1)?.elements[0].properties).toMatchObject({ gaugeScaleColor: '#00ffcc' });
  });

  it('mantém a regra Multistate com precedência sobre a cor base', async () => {
    const changes: DisplayDocument[] = [];
    const initial = appendGauge(
      createDisplayDocument({ name: 'Cor' }),
      createGauge({
        id: 'gauge',
        binding,
        multistate: { enabled: true, rules: [{ id: 'low', operator: 'lt', value: 30, color: '#0000ff' }] },
      }),
    );
    const loadValue = jest.fn(async () => ({ value: 20 }));
    render(<Harness initial={initial} loadValue={loadValue} onChange={(next) => changes.push(next)} />);

    selectElement('gauge');
    await waitFor(() => expect(screen.getByTestId('gauge-fill-gauge')).toHaveAttribute('stroke', '#0000ff'));

    fireEvent.change(screen.getByTestId('gauge-color'), { target: { value: '#00ff00' } });

    expect(changes.at(-1)?.elements[0].properties).toMatchObject({ color: '#00ff00' });
    expect(screen.getByTestId('gauge-fill-gauge')).toHaveAttribute('stroke', '#0000ff');
  });
});

describe('DisplayEditor - cor do Bar', () => {
  it('aplica a cor do contorno à escala, rótulos e valor', async () => {
    const changes: DisplayDocument[] = [];
    const initial = appendBar(createDisplayDocument({ name: 'Cor' }), createBar({ id: 'bar', binding }));
    render(<Harness initial={initial} loadValue={async () => ({ value: 25 })} onChange={(next) => changes.push(next)} />);

    selectElement('bar');
    await waitFor(() => expect(screen.getByTestId('bar-border-bar')).toHaveAttribute('stroke', 'var(--text-primary, #f8fafc)'));
    fireEvent.change(screen.getByTestId('bar-border-color'), { target: { value: '#ff5500' } });

    expect(screen.getByTestId('bar-border-bar')).toHaveAttribute('stroke', '#ff5500');
    expect(screen.getByTestId('bar-value-bar')).toHaveAttribute('fill', '#ff5500');
    expect(screen.getByText('SINUSOID')).toHaveAttribute('fill', '#ff5500');
    expect(changes.at(-1)?.elements[0].properties).toMatchObject({ borderColor: '#ff5500' });
  });

  it('altera a cor base sem tocar orientation nem geometria', async () => {
    const changes: DisplayDocument[] = [];
    const initial = appendBar(
      createDisplayDocument({ name: 'Cor' }),
      createBar({ id: 'bar', binding, orientation: 'vertical' }),
    );
    const loadValue = jest.fn(async () => ({ value: 25 }));
    render(<Harness initial={initial} loadValue={loadValue} onChange={(next) => changes.push(next)} />);

    selectElement('bar');
    await waitFor(() => expect(screen.getByTestId('bar-fill-bar')).toHaveAttribute('fill', '#6e9fff'));

    const background = screen.getByTestId('bar-background-bar');
    const geometry = {
      x: background.getAttribute('x'),
      y: background.getAttribute('y'),
      width: background.getAttribute('width'),
      height: background.getAttribute('height'),
    };

    fireEvent.change(screen.getByTestId('bar-color'), { target: { value: '#f2495c' } });

    expect(screen.getByTestId('bar-fill-bar')).toHaveAttribute('fill', '#f2495c');
    expect(changes.at(-1)?.elements[0].properties).toMatchObject({ color: '#f2495c', orientation: 'vertical' });
    const after = screen.getByTestId('bar-background-bar');
    expect(after.getAttribute('x')).toBe(geometry.x);
    expect(after.getAttribute('y')).toBe(geometry.y);
    expect(after.getAttribute('width')).toBe(geometry.width);
    expect(after.getAttribute('height')).toBe(geometry.height);
  });

  it('mantém a regra Multistate com precedência sobre a cor base', async () => {
    const changes: DisplayDocument[] = [];
    const initial = appendBar(
      createDisplayDocument({ name: 'Cor' }),
      createBar({
        id: 'bar',
        binding,
        multistate: { enabled: true, rules: [{ id: 'low', operator: 'lt', value: 30, color: '#0000ff' }] },
      }),
    );
    const loadValue = jest.fn(async () => ({ value: 20 }));
    render(<Harness initial={initial} loadValue={loadValue} onChange={(next) => changes.push(next)} />);

    selectElement('bar');
    await waitFor(() => expect(screen.getByTestId('bar-fill-bar')).toHaveAttribute('fill', '#0000ff'));

    fireEvent.change(screen.getByTestId('bar-color'), { target: { value: '#00ff00' } });

    expect(changes.at(-1)?.elements[0].properties).toMatchObject({ color: '#00ff00' });
    expect(screen.getByTestId('bar-fill-bar')).toHaveAttribute('fill', '#0000ff');
  });
});

describe('DisplayEditor - cor do Rectangle', () => {
  it('exibe o painel e altera fill e stroke com atualização do documento e do SVG', () => {
    const changes: DisplayDocument[] = [];
    const rectangle = createRectangle({ id: 'rectangle', x: 100, y: 100 });
    const initial = appendDisplayElement(createDisplayDocument({ name: 'Cor' }), rectangle);
    render(<Harness initial={initial} onChange={(next) => changes.push(next)} />);

    selectElement('rectangle');
    expect(screen.getByTestId('rectangle-properties-panel')).toBeInTheDocument();
    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute(
      'fill',
      DEFAULT_RECTANGLE_PROPERTIES.fill,
    );

    fireEvent.change(screen.getByTestId('rectangle-fill'), { target: { value: '#ff0000' } });
    expect(changes.at(-1)?.elements[0].properties).toMatchObject({ fill: '#ff0000' });
    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute('fill', '#ff0000');

    fireEvent.change(screen.getByTestId('rectangle-stroke'), { target: { value: '#00ff00' } });
    expect(changes.at(-1)?.elements[0].properties).toMatchObject({ fill: '#ff0000', stroke: '#00ff00' });
    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute('stroke', '#00ff00');
  });

  it('preserva fill e stroke no Undo e Redo sem afetar geometria', () => {
    const rectangle = createRectangle({ id: 'rectangle', x: 100, y: 100 });
    const initial = appendDisplayElement(createDisplayDocument({ name: 'Cor' }), rectangle);
    render(<Harness initial={initial} />);

    selectElement('rectangle');
    fireEvent.change(screen.getByTestId('rectangle-fill'), { target: { value: '#ff0000' } });
    fireEvent.change(screen.getByTestId('rectangle-stroke'), { target: { value: '#00ff00' } });
    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute('fill', '#ff0000');
    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute('stroke', '#00ff00');

    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute('fill', '#ff0000');
    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute('stroke', '#6e9fff');

    fireEvent.click(screen.getByTestId('display-redo'));
    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute('stroke', '#00ff00');

    fireEvent.click(screen.getByTestId('display-undo'));
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute('fill', DEFAULT_RECTANGLE_PROPERTIES.fill);
    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute('stroke', '#6e9fff');

    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute('x', '100');
    expect(screen.getByTestId('display-element-rectangle')).toHaveAttribute('y', '100');
  });
});
