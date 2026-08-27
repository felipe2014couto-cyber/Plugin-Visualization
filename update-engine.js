const fs = require('fs');
let code = fs.readFileSync('src/calculations/calculationEngine.ts', 'utf8');

// Adiciona parsePiTime antes de evaluateFunction
const parsePiTimeStr = `
function parsePiTime(str: string): number {
  const lower = str.toLowerCase();
  const now = new Date();
  switch (lower) {
    case '*':
      return Math.floor(now.getTime() / 1000);
    case 't':
    case 'today':
      return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
    case 'y':
    case 'yesterday':
      return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime() / 1000);
    default:
      // Pode adicionar fallback para parsing mais avancado depois se quiser
      return Math.floor(now.getTime() / 1000);
  }
}
`;

if (!code.includes('parsePiTime')) {
  code = code.replace('function evaluateFunction(', parsePiTimeStr + '\nfunction evaluateFunction(');
}

// Adiciona funcoes de data ao evaluateFunction
const switchCases = `
    case 'DAY':
      return new Date(args[0] * 1000).getDate();
    case 'MONTH':
      return new Date(args[0] * 1000).getMonth() + 1;
    case 'YEAR':
      return new Date(args[0] * 1000).getFullYear();
    case 'HOUR':
      return new Date(args[0] * 1000).getHours();
    case 'MINUTE':
      return new Date(args[0] * 1000).getMinutes();
    case 'SECOND':
      return new Date(args[0] * 1000).getSeconds();
    case 'IF':
`;
code = code.replace("    case 'IF':", switchCases);

// Atualiza parsePrimary para extrair strings e timestamps
const oldParsePrimaryEnd = `    const functionName = expression.slice(cursor).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (functionName) {`;

const newParsePrimaryStrings = `    // Parser de strings
    const stringMatch = expression.slice(cursor).match(/^(["'])(.*?)\\1/);
    if (stringMatch) {
      cursor += stringMatch[0].length;
      return parsePiTime(stringMatch[2]);
    }
    
    // Parser de abreviações temporais unquoted (*, t, y)
    const piTimeMatch = expression.slice(cursor).match(/^(t|y|today|yesterday|sun|mon|tue|wed|thu|fri|sat)(?=[^A-Za-z_0-9]|$)/i);
    if (piTimeMatch) {
      cursor += piTimeMatch[0].length;
      return parsePiTime(piTimeMatch[1]);
    }

    if (expression[cursor] === '*') {
      cursor += 1;
      return parsePiTime('*');
    }
    
    const functionName = expression.slice(cursor).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (functionName) {`;

code = code.replace(oldParsePrimaryEnd, newParsePrimaryStrings);

fs.writeFileSync('src/calculations/calculationEngine.ts', code);
