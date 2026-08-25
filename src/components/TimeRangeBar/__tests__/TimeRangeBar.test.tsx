import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { createDefaultTimeSelection, type DisplayTimeSelection } from '../../../time/timeRange';
import { TimeRangeBar } from '../TimeRangeBar';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
  };
});

function Harness({ initial }: { initial: DisplayTimeSelection }) {
  const [selection, setSelection] = useState(initial);
  return <TimeRangeBar selection={selection} onChange={setSelection} />;
}

describe('TimeRangeBar', () => {
  const now = Date.parse('2026-08-07T12:00:00.000Z');

  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(now));
  afterEach(() => jest.restoreAllMocks());

  it('aplica expressão relativa, navega e retorna para agora', () => {
    render(<Harness initial={createDefaultTimeSelection(now)} />);
    expect(screen.getByTestId('time-range-start')).toHaveValue('*-8h');
    expect(screen.getByTestId('time-range-duration')).toHaveTextContent('8h');

    fireEvent.change(screen.getByTestId('time-range-start'), { target: { value: '*-2h' } });
    fireEvent.click(screen.getByTestId('time-range-apply'));
    expect(screen.getByTestId('time-range-duration')).toHaveTextContent('2h');

    fireEvent.click(screen.getByTestId('time-range-back'));
    expect(screen.getByTestId('time-range-start')).not.toHaveValue('*-2h');
    fireEvent.click(screen.getByTestId('time-range-now'));
    expect(screen.getByTestId('time-range-start')).toHaveValue('*-2h');
    expect(screen.getByTestId('time-range-end')).toHaveValue('*');
  });

  it('indica período inválido sem aplicar', () => {
    render(<Harness initial={createDefaultTimeSelection(now)} />);
    fireEvent.change(screen.getByTestId('time-range-start'), { target: { value: 'inválido' } });
    fireEvent.click(screen.getByTestId('time-range-apply'));
    expect(screen.getByRole('alert')).toHaveTextContent('Período inválido');
    expect(screen.getByTestId('time-range-duration')).toHaveTextContent('8h');
  });

  it('aplica os períodos rápidos e destaca a seleção', () => {
    render(<Harness initial={createDefaultTimeSelection(now)} />);

    expect(screen.queryByTestId('time-range-presets')).toBeNull();
    fireEvent.click(screen.getByTestId('time-range-duration'));
    expect(screen.getByTestId('time-range-duration')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('time-range-preset-8h')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('time-range-preset-1mo'));

    expect(screen.getByTestId('time-range-start')).toHaveValue('*-1mo');
    expect(screen.getByTestId('time-range-end')).toHaveValue('*');
    expect(screen.getByTestId('time-range-duration')).toHaveTextContent('31d');
    expect(screen.queryByTestId('time-range-presets')).toBeNull();
    expect(screen.getByTestId('time-range-duration')).toHaveAttribute('aria-expanded', 'false');
  });
});
