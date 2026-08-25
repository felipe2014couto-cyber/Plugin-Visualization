import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { PiDataLinkToolbar } from '../PiDataLinkToolbar';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
  };
});

describe('PiDataLinkToolbar', () => {
  it('exibe o ribbon e seleciona a função solicitada', () => {
    const onOpenFunction = jest.fn();
    render(<PiDataLinkToolbar activeFunction={null} onOpenFunction={onOpenFunction} />);

    expect(screen.getByTestId('pi-datalink-ribbon')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Valor de Archive' })).toHaveTextContent('Valor de Archive');
    fireEvent.click(screen.getByTestId('datalink-curr-val'));

    expect(onOpenFunction).toHaveBeenCalledWith('PICurrVal');
  });
});
