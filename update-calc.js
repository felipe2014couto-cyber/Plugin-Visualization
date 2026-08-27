const fs = require('fs');

// 1. Atualizar piVisionConverter.ts
let converter = fs.readFileSync('src/display/piVisionConverter.ts', 'utf8');

const isPiTimeStringCode = `
const PI_TIME_ABBREVIATIONS = new Set(['*', 't', 'y', 'today', 'yesterday', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
function isPiTimeString(str: string): boolean {
  const lower = str.trim().toLocaleLowerCase();
  if (PI_TIME_ABBREVIATIONS.has(lower)) {
    return true;
  }
  if (/^(\\*|t|y|today|yesterday|sun|mon|tue|wed|thu|fri|sat)[+-]\\d+[smhdwy]$/.test(lower)) {
    return true;
  }
  if (/^\\d{1,4}[-/]\\d{1,2}[-/]\\d{1,4}/.test(lower)) {
    return true;
  }
  return false;
}
`;

converter = converter.replace('function extractPiVisionExpressionPointNames(expression: string): string[] {', 
isPiTimeStringCode + '\nfunction extractPiVisionExpressionPointNames(expression: string): string[] {');

converter = converter.replace(
  '    if (pointName && !names.has(normalized)) {',
  '    if (pointName && !names.has(normalized) && !isPiTimeString(pointName)) {'
);

fs.writeFileSync('src/display/piVisionConverter.ts', converter);

// 2. Atualizar CalculationEditorDialog.tsx
let editor = fs.readFileSync('src/components/Calculations/CalculationEditorDialog.tsx', 'utf8');

const editorIsPiTimeStringCode = `
const PI_TIME_ABBREVIATIONS = new Set(['*', 't', 'y', 'today', 'yesterday', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
function isPiTimeString(str: string): boolean {
  const lower = str.trim().toLocaleLowerCase();
  if (PI_TIME_ABBREVIATIONS.has(lower)) {
    return true;
  }
  if (/^(\\*|t|y|today|yesterday|sun|mon|tue|wed|thu|fri|sat)[+-]\\d+[smhdwy]$/.test(lower)) {
    return true;
  }
  if (/^\\d{1,4}[-/]\\d{1,2}[-/]\\d{1,4}/.test(lower)) {
    return true;
  }
  return false;
}
`;

editor = editor.replace('const CALCULATION_RESERVED_NAMES = new Set', editorIsPiTimeStringCode + '\nconst CALCULATION_RESERVED_NAMES = new Set');

// Atualiza extractTagNames para extrair aspas simples
editor = editor.replace(
  `  // 1. Remove string literals (both single and double quotes) so we don't extract tags from them
  const expressionWithoutStrings = expression.replace(/(["'])(?:(?=(\\\\?))\\2.)*?\\1/g, '');`,
  `  // 1. Extrair tags entre aspas simples, ignorando strings de tempo
  const singleQuotePattern = /'([^']+)'/g;
  let sqMatch: RegExpExecArray | null;
  while ((sqMatch = singleQuotePattern.exec(expression)) !== null) {
    if (!isPiTimeString(sqMatch[1])) {
      names.add(sqMatch[1]);
    }
  }
  
  // 2. Remove strings para processar identificadores sem aspas
  const expressionWithoutStrings = expression.replace(/(["'])(?:(?=(\\\\?))\\2.)*?\\1/g, '');`
);

// Atualiza a verificacao de !CALCULATION_RESERVED_NAMES
editor = editor.replace(
  '    if (!CALCULATION_RESERVED_NAMES.has(match[1].toLocaleUpperCase())) {',
  '    if (!CALCULATION_RESERVED_NAMES.has(match[1].toLocaleUpperCase()) && !isPiTimeString(match[1])) {'
);

// Atualiza resolveInputs para dar prune em inputs invalidos
editor = editor.replace(
  '  const resolveInputs = async (normalizedExpression: string): Promise<CalculationInput[]> => {\n    const knownNames = new Set(inputs.map((input) => input.name.toLocaleLowerCase()));\n    const missingNames = extractTagNames(normalizedExpression)\n      .filter((tagName) => !knownNames.has(tagName.toLocaleLowerCase()));',
  `  const resolveInputs = async (normalizedExpression: string): Promise<CalculationInput[]> => {
    const extractedNames = new Set(extractTagNames(normalizedExpression).map(n => n.toLocaleLowerCase()));
    const validInputs = inputs.filter((input) => extractedNames.has(input.name.toLocaleLowerCase()));
    const knownNames = new Set(validInputs.map((input) => input.name.toLocaleLowerCase()));
    const missingNames = extractTagNames(normalizedExpression)
      .filter((tagName) => !knownNames.has(tagName.toLocaleLowerCase()));`
);

editor = editor.replace(
  '    return [...inputs, ...resolvedInputs];',
  '    return [...validInputs, ...resolvedInputs];'
);

fs.writeFileSync('src/components/Calculations/CalculationEditorDialog.tsx', editor);
