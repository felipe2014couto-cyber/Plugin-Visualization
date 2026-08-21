import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { TextPropertiesPanel } from '../TextPropertiesPanel';
import { DEFAULT_TEXT_PROPERTIES, type TextProperties } from '../../../createText';
import type { MultistateConfig } from '../../../multistate';

jest.mock('@grafana/ui', () => ({
  useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()),
}));

describe('TextPropertiesPanel', () => {
  test('renders text content and embedded link controls', () => {
    const handleChange = jest.fn();
    const properties: TextProperties = {
      ...DEFAULT_TEXT_PROPERTIES,
      text: 'Texto de teste',
      linkUrl: 'https://exemplo.com',
      openInNewTab: true,
    };

    render(<TextPropertiesPanel properties={properties} onChange={handleChange} />);

    expect(screen.getByTestId('text-content')).toHaveValue('Texto de teste');
    expect(screen.getByTestId('text-link-url')).toHaveValue('https://exemplo.com');
    expect(screen.getByTestId('text-link-url-new-tab')).toBeChecked();

    fireEvent.change(screen.getByTestId('text-link-url'), { target: { value: 'https://novo-link.com' } });
    expect(handleChange).toHaveBeenCalledWith({ linkUrl: 'https://novo-link.com' });

    fireEvent.click(screen.getByTestId('text-link-url-new-tab'));
    expect(handleChange).toHaveBeenCalledWith({ openInNewTab: false });
  });

  test('permite alterar a cor do texto e a cor de preenchimento do fundo', () => {
    const handleChange = jest.fn();
    const properties: TextProperties = {
      ...DEFAULT_TEXT_PROPERTIES,
      color: '#ffffff',
      backgroundColor: '#123456',
    };

    render(<TextPropertiesPanel properties={properties} onChange={handleChange} />);

    const textColorTrigger = screen.getByTestId('text-color');
    fireEvent.change(textColorTrigger, { target: { value: '#ff0000' } });
    expect(handleChange).toHaveBeenCalledWith({ color: '#ff0000' });

    const bgColorTrigger = screen.getByTestId('text-bg-color');
    fireEvent.change(bgColorTrigger, { target: { value: '#00ff00' } });
    expect(handleChange).toHaveBeenCalledWith({ backgroundColor: '#00ff00' });
  });

  test('exibe painéis separados para Multistate de Texto e Multistate de Fundo quando há PI Point', () => {
    const handleChange = jest.fn();
    const handleMultistateChange = jest.fn();
    const handleBgMultistateChange = jest.fn();
    const binding = { dataSourceUid: 'ds-1', serverPath: 'pims', pointName: 'SINUSOID' };
    const multistateText: MultistateConfig = {
      enabled: true,
      rules: [{ id: 'rule-1', operator: 'gt', value: 50, color: '#ff0000' }],
    };
    const multistateBg: MultistateConfig = {
      enabled: true,
      rules: [{ id: 'rule-2', operator: 'lt', value: 20, color: '#0000ff' }],
    };

    render(
      <TextPropertiesPanel
        properties={DEFAULT_TEXT_PROPERTIES}
        pointName="SINUSOID"
        binding={binding}
        multistate={multistateText}
        onMultistateChange={handleMultistateChange}
        backgroundMultistate={multistateBg}
        onBackgroundMultistateChange={handleBgMultistateChange}
        onChange={handleChange}
      />,
    );

    expect(screen.getByText('Multistate (Texto)')).toBeInTheDocument();
    expect(screen.getByText('Multistate (Fundo)')).toBeInTheDocument();
    expect(screen.getByTestId('text-multistate-enabled')).toBeChecked();
    expect(screen.getByTestId('text-bg-multistate-enabled')).toBeChecked();
  });
});
