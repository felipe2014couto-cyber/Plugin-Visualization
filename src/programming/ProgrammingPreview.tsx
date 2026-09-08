import React, { useMemo, useEffect, useRef } from 'react';
import { css } from '@emotion/css';
import type { ProgrammingDocument, ProgrammingPiPointContext } from './ProgrammingTypes';

interface ProgrammingPreviewProps {
  document: ProgrammingDocument;
  piPoints?: ProgrammingPiPointContext[];
}

function escapeScriptEnd(value: string): string {
  return value.replace(/<\s*\/\s*script/gi, '<\\/script');
}

function escapeStyleEnd(value: string): string {
  return value.replace(/<\s*\/\s*style/gi, '<\\/style');
}

function serializeContext(piPoints: ProgrammingPiPointContext[] = []): string {
  const piPointsByName = Object.fromEntries(piPoints.map((point) => [point.name, point]));
  return JSON.stringify({
    // piPoint permanece como atalho de compatibilidade para a primeira tag.
    piPoint: piPoints[0] ?? null,
    piPoints,
    piPointsByName,
  })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function buildProgrammingSrcDoc(document: ProgrammingDocument, piPoints?: ProgrammingPiPointContext[]): string {
  const script = escapeScriptEnd(document.javascript);
  const style = escapeStyleEnd(document.css);
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${style}</style></head>
<body>${document.html}<script>
window.pimsVision = Object.freeze(${serializeContext(piPoints)});
window.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'PIMS_VISION_UPDATE') {
    window.pimsVision = Object.freeze(event.data.payload);
  }
});
</script><script>try {\n${script}\n} catch (error) {\n  const output = document.createElement('pre');\n  output.textContent = String(error);\n  output.style.cssText = 'color:#f87171;white-space:pre-wrap;font:12px monospace;padding:8px';\n  document.body.appendChild(output);\n}</script></body></html>`;
}

export function ProgrammingPreview({ document, piPoints }: ProgrammingPreviewProps) {
  const srcDoc = useMemo(() => buildProgrammingSrcDoc(document, piPoints), [document]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const points = piPoints ?? [];
    iframeRef.current?.contentWindow?.postMessage({
      type: 'PIMS_VISION_UPDATE',
      payload: {
        piPoint: points[0] ?? null,
        piPoints: points,
        piPointsByName: Object.fromEntries(points.map((point) => [point.name, point])),
      }
    }, '*');
  }, [piPoints]);

  return (
    <div className={styles.previewFrame} data-testid="programming-preview">
      <iframe
        ref={iframeRef}
        title="Programming preview"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        className={styles.iframe}
      />
    </div>
  );
}

const styles = {
  previewFrame: css({
    display: 'flex',
    flex: '1 1 220px',
    minHeight: 180,
    overflow: 'hidden',
    border: '1px solid var(--border-color, #2b394a)',
    borderRadius: 6,
    background: '#ffffff',
  }),
  iframe: css({
    display: 'block',
    width: '100%',
    minHeight: 180,
    border: 0,
    background: '#ffffff',
  }),
};
