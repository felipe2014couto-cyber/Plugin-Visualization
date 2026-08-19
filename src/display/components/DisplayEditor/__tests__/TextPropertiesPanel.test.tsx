import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextPropertiesPanel } from '../TextPropertiesPanel';
import { DEFAULT_TEXT_PROPERTIES, type TextProperties } from '../../../createText';

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
});
