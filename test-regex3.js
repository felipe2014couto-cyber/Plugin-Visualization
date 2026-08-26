function extractTagNames(expression) {
  const names = new Set();
  const CALCULATION_RESERVED_NAMES = new Set(['IF', 'SE', 'AND', 'OR', 'NOT', 'MIN', 'MAX', 'ABS', 'ROUND', 'CLAMP', 'WHILE']);
  
  // 1. Extrair tags entre aspas simples (ex: 'Turno 07 as 15')
  const singleQuotePattern = /'([^']+)'/g;
  let sqMatch;
  while ((sqMatch = singleQuotePattern.exec(expression)) !== null) {
    names.add(sqMatch[1]);
  }
  
  // 2. Remover TODAS as strings (aspas simples e duplas) para processar os identificadores sem aspas
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
    
    if (!CALCULATION_RESERVED_NAMES.has(match[1].toLocaleUpperCase())) {
      names.add(match[1]);
    }
  }
  return [...names];
}

console.log(extractTagNames('TimeEq(LFS_RC2_TRANSLAÇÃO_DO_CARRO_LIGADA, -10m, *, "On")/600*100'));
console.log(extractTagNames("TimeEq('Turno 07 as 15', -10m, *, \"On\")"));
