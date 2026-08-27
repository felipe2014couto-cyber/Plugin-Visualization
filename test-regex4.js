const PI_TIME_ABBREVIATIONS = new Set(['*', 't', 'y', 'today', 'yesterday', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

function isPiTimeString(str) {
  const lower = str.trim().toLowerCase();
  if (PI_TIME_ABBREVIATIONS.has(lower)) {
    return true;
  }
  if (/^(\*|t|y|today|yesterday|sun|mon|tue|wed|thu|fri|sat)[+-]\d+[smhdwy]$/.test(lower)) {
    return true;
  }
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(lower)) {
    return true;
  }
  return false;
}

function extractTagNames(expression) {
  const names = new Set();
  const CALCULATION_RESERVED_NAMES = new Set(['IF', 'SE', 'AND', 'OR', 'NOT', 'MIN', 'MAX', 'ABS', 'ROUND', 'CLAMP', 'WHILE']);
  
  // 1. Extrair tags entre aspas simples, ignorando strings de tempo
  const singleQuotePattern = /'([^']+)'/g;
  let sqMatch;
  while ((sqMatch = singleQuotePattern.exec(expression)) !== null) {
    if (!isPiTimeString(sqMatch[1])) {
      names.add(sqMatch[1]);
    }
  }
  
  // 2. Remover strings para processar identificadores sem aspas
  const expressionWithoutStrings = expression.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '');
  
  // 3. Extrair identificadores sem aspas (ignorando funcoes)
  const tokenPattern = /(?:^|[^\p{L}\p{N}_.:-])([\p{L}_][\p{L}\p{N}_.:-]*)(?=[^\p{L}\p{N}_.:-]|$)/gu;
  
  let match;
  while ((match = tokenPattern.exec(expressionWithoutStrings)) !== null) {
    const endIndex = match.index + match[0].length;
    const rest = expressionWithoutStrings.slice(endIndex);
    
    if (rest.trim().startsWith('(')) {
      continue;
    }
    
    if (!CALCULATION_RESERVED_NAMES.has(match[1].toUpperCase()) && !isPiTimeString(match[1])) {
      names.add(match[1]);
    }
  }
  return [...names];
}

console.log(extractTagNames("'t'-(86400*(day('*')-0.958333))"));
console.log(extractTagNames("TimeEq('Turno 07 as 15', -10m, *, \"On\")"));
