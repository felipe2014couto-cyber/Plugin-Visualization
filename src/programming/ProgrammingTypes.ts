export const PROGRAMMING_TYPE = 'programming' as const;

export interface ProgrammingDocument {
  type: typeof PROGRAMMING_TYPE;
  html: string;
  css: string;
  javascript: string;
}

/** Dados enviados pela aplicação ao iframe, sem conceder acesso ao Grafana. */
export interface ProgrammingPiPointContext {
  name: string;
  value: unknown;
  timestamp?: string;
  unit?: string;
}

export const DEFAULT_PROGRAMMING_DOCUMENT: ProgrammingDocument = {
  type: PROGRAMMING_TYPE,
  html: '<div class="box">Motor ligado</div>',
  css: '.box {\n  color: #ffffff;\n  background: #b4167e;\n  padding: 12px 16px;\n  border-radius: 6px;\n  font: 600 18px sans-serif;\n}',
  javascript: '',
};
