import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { appendBar, appendGauge, appendValue, createBar, createDisplayDocument, createGauge, createValue, type DisplayDocument } from '../../../index';
import { DisplayEditor } from '../DisplayEditor';
import type { PiPointSearchResult } from '../../../../pi/piDataSource';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

const point: PiPointSearchResult = {
  name: 'SINUSOID', path: '\\\\pims\\SINUSOID', webId: 'webid', dataSourceUid: 'ds',
};

function Harness({ initial, onChange, loadValue }: { initial?: DisplayDocument; onChange?: (document: DisplayDocument) => void; loadValue?: () => Promise<{ value: unknown }> }) {
  const [document, setDocument] = useState<DisplayDocument>(() => initial ?? createDisplayDocument({ name: 'Multistate' }));
  return <DisplayEditor document={document} onChange={(next) => { setDocument(next); onChange?.(next); }} selectedPiPoint={point} loadValue={loadValue} />;
}

function setMultistateRuleColor(ruleId: string, color: string) {
  const testId = `multistate-color-${ruleId}`;
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.change(screen.getByLabelText('Código hexadecimal'), { target: { value: color } });
  fireEvent.click(screen.getByTestId(testId));
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
    expect(await screen.findByTestId(/^display-element-/)).toHaveAttribute('data-shape', 'ellipse');
    expect(await screen.findByTestId(/^display-element-/)).toHaveAttribute('fill', '#00ff00');
  });

  it('habilita, adiciona, edita e remove regra com histórico', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-value'));
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
    fireEvent.click(screen.getByTestId('display-insert-value'));
    fireEvent.click(screen.getByTestId('multistate-enabled'));
    fireEvent.click(screen.getByTestId('multistate-add-rule'));
    const ruleId = screen.getByTestId(/^multistate-rule-/).getAttribute('data-testid')?.replace('multistate-rule-', '') as string;

    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId(`multistate-operator-${ruleId}`), { target: { value: 'gt' } });
    fireEvent.change(screen.getByTestId(`multistate-value-${ruleId}`), { target: { value: '20' } });
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue(20);

    fireEvent.change(screen.getByTestId(`multistate-operator-${ruleId}`), { target: { value: 'between' } });
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`multistate-value2-${ruleId}`)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId(`multistate-value-${ruleId}`), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId(`multistate-value2-${ruleId}`), { target: { value: '80' } });
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue(20);
    expect(screen.getByTestId(`multistate-value2-${ruleId}`)).toHaveValue(80);

    fireEvent.change(screen.getByTestId(`multistate-value-${ruleId}`), { target: { value: '' } });
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue(20);
    expect(changes.at(-1)?.elements[0].properties.binding).toEqual({
      dataSourceUid: 'ds', serverPath: 'pims', pointName: 'SINUSOID', webId: 'webid',
    });
  });

  it('preserva o limite no Undo/Redo sem alterar o binding', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('display-insert-value'));
    fireEvent.click(screen.getByTestId('multistate-enabled'));
    fireEvent.click(screen.getByTestId('multistate-add-rule'));
    const ruleId = screen.getByTestId(/^multistate-rule-/).getAttribute('data-testid')?.replace('multistate-rule-', '') as string;
    fireEvent.change(screen.getByTestId(`multistate-value-${ruleId}`), { target: { value: '30' } });
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue(30);
    fireEvent.click(screen.getByTestId('display-undo'));
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue(0);
    fireEvent.click(screen.getByTestId('display-redo'));
    expect(screen.getByTestId(`multistate-value-${ruleId}`)).toHaveValue(30);
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
