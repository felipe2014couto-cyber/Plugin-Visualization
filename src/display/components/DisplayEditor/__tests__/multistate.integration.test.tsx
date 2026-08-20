import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { appendBar, appendGauge, appendValue, createBar, createDisplayDocument, createGauge, createValue, type DisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';
import type { PiPointSearchResult } from '../../../../pi/piDataSource';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

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

const point: PiPointSearchResult = {
  name: 'SINUSOID', path: '\\\\pims\\SINUSOID', webId: 'webid', dataSourceUid: 'ds',
};

function Harness({ initial, onChange, loadValue }: { initial?: DisplayDocument; onChange?: (document: DisplayDocument) => void; loadValue?: () => Promise<{ value: unknown }> }) {
  const [document, setDocument] = useState<DisplayDocument>(() => initial ?? createDisplayDocument({ name: 'Multistate' }));
  return <DisplayEditor document={document} onChange={(next) => { setDocument(next); onChange?.(next); }} selectedPiPoint={point} loadValue={loadValue} />;
}

function setMultistateRuleColor(ruleId: string, color: string, prefix = 'multistate') {
  const testId = `${prefix}-color-${ruleId}`;
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.change(screen.getByLabelText('Código hexadecimal'), { target: { value: color } });
  fireEvent.click(screen.getByTestId(testId));
}

function selectElement(id: string): void {
  const element = screen.getByTestId(`display-element-${id}`);
  fireEvent.pointerDown(element, { clientX: 20, clientY: 20, pointerId: 1 });
  fireEvent.pointerUp(element, { clientX: 20, clientY: 20, pointerId: 1 });
}

describe('Multistate no editor', () => {
  it('aplica Multistate a uma forma geométrica vinculada ao PI Point', async () => {
    const loadValue = jest.fn().mockResolvedValue({ value: 85 });
    render(<Harness loadValue={loadValue} />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    fireEvent.change(screen.getByTestId('geometric-shape-type'), { target: { value: 'ellipse' } });
    fireEvent.click(screen.getByTestId('multistate-enabled'));
    fireEvent.click(screen.getByTestId('multistate-add-rule'));
    const ruleId = screen.getByTestId(/^multistate-rule-/).getAttribute('data-testid')?.replace('multistate-rule-', '') as string;
    fireEvent.change(screen.getByTestId(`multistate-operator-${ruleId}`), { target: { value: 'gte' } });
    fireEvent.change(screen.getByTestId(`multistate-value-${ruleId}`), { target: { value: '80' } });
    setMultistateRuleColor(ruleId, '#00ff00');
    const shape = await screen.findByTestId(/^display-element-/);
    expect(shape).toHaveAttribute('data-shape', 'ellipse');
    await waitFor(() => {
      expect(screen.getByTestId(/^display-element-/).querySelector('ellipse')).toHaveAttribute('fill', '#00ff00');
    });
  });

  it('habilita, adiciona, edita e remove regra com histórico', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    fireEvent.click(screen.getByTestId('multistate-enabled'));
    fireEvent.click(screen.getByTestId('multistate-add-rule'));
    const rule = screen.getByTestId(/^multistate-rule-/);
    const ruleId = rule.getAttribute('data-testid')?.replace('multistate-rule-', '') as string;
    fireEvent.change(screen.getByTestId(`multistate-operator-${ruleId}`), { target: { value: 'gte' } });
    fireEvent.change(screen.getByTestId(`multistate-value-${ruleId}`), { target: { value: '80' } });
    setMultistateRuleColor(ruleId, '#00ff00');
    expect(screen.getByTestId(`multistate-rule-${ruleId}`)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`multistate-remove-${ruleId}`));
    expect(screen.queryByTestId(`multistate-rule-${ruleId}`)).toBeNull();
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.getByTestId(`multistate-rule-${ruleId}`)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('display-redo'));
    expect(screen.queryByTestId(`multistate-rule-${ruleId}`)).toBeNull();
  });

  it('exibe e edita limite simples e os dois limites de BETWEEN', () => {
    const changes: DisplayDocument[] = [];
    render(<Harness onChange={(document) => changes.push(document)} />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    fireEvent.click(screen.getByTestId('multistate-enabled'));
    fireEvent.click(screen.getByTestId('multistate-add-rule'));
    const ruleId = screen.getByTestId(/^multistate-rule-/).getAttribute('data-testid')?.replace('multistate-rule-', '') as string;

    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId(`multistate-operator-${ruleId}`), { target: { value: 'gt' } });
    fireEvent.change(screen.getByTestId(`multistate-value-${ruleId}`), { target: { value: '20' } });
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue('20');

    fireEvent.change(screen.getByTestId(`multistate-operator-${ruleId}`), { target: { value: 'between' } });
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`multistate-value2-${ruleId}`)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId(`multistate-value-${ruleId}`), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId(`multistate-value2-${ruleId}`), { target: { value: '80' } });
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue(20);
    expect(screen.getByTestId(`multistate-value2-${ruleId}`)).toHaveValue(80);

    fireEvent.change(screen.getByTestId(`multistate-value-${ruleId}`), { target: { value: '' } });
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue(null);
    expect(changes.at(-1)?.elements[0].properties.binding).toEqual({
      dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID', webId: 'webid',
    });
  });

  it('permite configurar estados digitais em string no operador eq', () => {
    const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'MOTOR_STATUS', webId: 'webid-motor' };
    const base = createDisplayDocument();
    const initial = appendValue(base, createValue({ id: 'val-digital', binding }));
    render(<Harness initial={initial} />);
    selectElement('val-digital');

    expect(screen.getByTestId('value-text-multistate-properties')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('value-text-multistate-enabled'));
    fireEvent.click(screen.getByTestId('value-text-multistate-add-rule'));
    const ruleId = screen.getByTestId(/^value-text-multistate-rule-/).getAttribute('data-testid')?.replace('value-text-multistate-rule-', '') as string;
    fireEvent.change(screen.getByTestId(`value-text-multistate-operator-${ruleId}`), { target: { value: 'eq' } });
    fireEvent.change(screen.getByTestId(`value-text-multistate-value-${ruleId}`), { target: { value: 'LIGADO' } });
    expect(screen.getByTestId(`value-text-multistate-value-${ruleId}`)).toHaveValue('LIGADO');
  });

  it('preserva o limite no Undo/Redo sem alterar o binding', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-rectangle'));
    fireEvent.click(screen.getByTestId('multistate-enabled'));
    fireEvent.click(screen.getByTestId('multistate-add-rule'));
    const ruleId = screen.getByTestId(/^multistate-rule-/).getAttribute('data-testid')?.replace('multistate-rule-', '') as string;
    fireEvent.change(screen.getByTestId(`multistate-value-${ruleId}`), { target: { value: '30' } });
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue('30');
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue('0');
    fireEvent.click(screen.getByTestId('display-redo'));
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue('30');
  });

  it('mantém documentos antigos sem multistate com aparência padrão', () => {
    const binding = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID' };
    const base = createDisplayDocument();
    const initial = appendBar(appendGauge(appendValue(base, createValue({ id: 'value-old', binding })), createGauge({ id: 'gauge-old', binding })), createBar({ id: 'bar-old', binding }));
    render(<Harness initial={initial} />);
    expect(screen.queryByTestId('multistate-properties')).toBeNull();
    expect(screen.getByTestId('display-element-value-old')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('display-mode-view'));
    expect(screen.queryByTestId('display-selection-overlay')).toBeNull();
  });
});
