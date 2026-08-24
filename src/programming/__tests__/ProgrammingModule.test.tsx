import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProgrammingPanel } from '../ProgrammingModule';
import { buildProgrammingSrcDoc } from '../ProgrammingPreview';

describe('ProgrammingModule', () => {
  it('exibe os três editores e aplica o HTML ao preview isolado', () => {
    render(<ProgrammingPanel />);

    expect(screen.getByTestId('programming-panel')).toBeInTheDocument();
    expect(screen.getByTestId('programming-html-editor')).toBeInTheDocument();
    expect(screen.getByTestId('programming-css-editor')).toBeInTheDocument();
    expect(screen.getByTestId('programming-javascript-editor')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('programming-html-editor'), { target: { value: '<strong>Teste</strong>' } });
    fireEvent.click(screen.getByTestId('programming-apply'));

    expect(screen.getByTestId('programming-preview')).toBeInTheDocument();
    expect(screen.getByTitle('Programming preview')).toHaveAttribute('sandbox', 'allow-scripts');
    expect(screen.getByTitle('Programming preview')).toHaveAttribute('srcdoc', expect.stringContaining('<strong>Teste</strong>'));
  });

  it('mantém HTML, CSS e JavaScript no documento do iframe sem acesso ao contexto principal', () => {
    const srcDoc = buildProgrammingSrcDoc({
      type: 'programming',
      html: '<div class="box">Motor</div>',
      css: '.box { color: red; }',
      javascript: 'document.body.dataset.ready = "true";',
    });

    expect(srcDoc).toContain('<div class="box">Motor</div>');
    expect(srcDoc).toContain('.box { color: red; }');
    expect(srcDoc).toContain('document.body.dataset.ready');
    expect(srcDoc).not.toContain('allow-same-origin');
  });

  it('fornece ao script somente o valor da PI Point selecionada', () => {
    const srcDoc = buildProgrammingSrcDoc(
      { type: 'programming', html: '<div />', css: '', javascript: 'void window.pimsVision.piPoint.value;' },
      [{ name: 'MOTOR_01', value: 42.5, timestamp: '2026-08-24T12:00:00Z', unit: '°C' }],
    );

    expect(srcDoc).toContain('window.pimsVision = Object.freeze');
    expect(srcDoc).toContain('"name":"MOTOR_01"');
    expect(srcDoc).toContain('"value":42.5');
  });

  it('fornece todas as tags da consulta por lista e por nome', () => {
    const srcDoc = buildProgrammingSrcDoc(
      { type: 'programming', html: '', css: '', javascript: 'void window.pimsVision.piPoints;' },
      [{ name: 'TAG_A', value: 10 }, { name: 'TAG_B', value: 20 }],
    );

    expect(srcDoc).toContain('"piPointsByName"');
    expect(srcDoc).toContain('"TAG_A"');
    expect(srcDoc).toContain('"TAG_B"');
  });
});
