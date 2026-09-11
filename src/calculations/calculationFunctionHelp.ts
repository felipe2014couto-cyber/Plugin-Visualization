import { piCompatibilityCatalog } from './piCompatibilityCatalog';

export const calculationFunctionCategories = [
  'Lógica', 'Matemática', 'Strings', 'Data e hora', 'Histórico', 'Busca histórica',
  'Qualidade', 'Digital State', 'Metadata', 'Alarmes e controle', 'Stateful', 'Extensões',
] as const;
export type CalculationFunctionCategory = typeof calculationFunctionCategories[number];
export interface CalculationFunctionHelp {
  name: string; category: CalculationFunctionCategory; signature: string; template: string; description: string; example: string;
}
type Definition = Omit<CalculationFunctionHelp, 'name'>;
const definitions = new Map<string, Definition>();

function register(names: readonly string[], category: CalculationFunctionCategory, signature: (name: string) => string, template: (name: string) => string, description: (name: string) => string, example: (name: string) => string = template) {
  names.forEach((name) => {
    if (definitions.has(name)) throw new Error('Função duplicada no catálogo de ajuda: ' + name);
    definitions.set(name, { category, signature: signature(name), template: template(name), description: description(name), example: example(name) });
  });
}
const call = (name: string, args: string) => name + '(' + args + ')';
const tagCall = (name: string) => name + "('SINUSOID', '*-1h', '*')";

register(['Acos', 'Asin', 'Atn', 'Cos', 'Cosh', 'Exp', 'Float', 'Frac', 'Int', 'Log', 'Log10', 'Sgn', 'Sin', 'Sinh', 'Sqr', 'Tan', 'Tanh'], 'Matemática', n => call(n, 'x'), n => call(n, '0'), n => 'Aplica a função matemática ' + n + ' ao valor informado.', n => call(n, '9'));
register(['Atn2'], 'Matemática', () => 'Atn2(y, x)', () => 'Atn2(0, 1)', () => 'Calcula o arco-tangente respeitando o quadrante.');
register(['Mod'], 'Matemática', () => 'Mod(x, y)', () => 'Mod(10, 3)', () => 'Retorna o resto da divisão entre dois valores.');
register(['Poly'], 'Matemática', () => 'Poly(x, c0, c1, ...)', () => 'Poly(2, 1, 2)', () => 'Avalia um polinômio para o valor informado.');
register(['PStDev', 'SStDev'], 'Matemática', n => call(n, 'x1, x2, ...'), n => call(n, '1, 2, 3'), n => 'Calcula o desvio padrão dos valores.');
register(['Curve'], 'Matemática', () => 'Curve(x, x1, y1, ...)', () => 'Curve(5, 0, 0, 10, 100)', () => 'Interpola o valor nos pontos fornecidos.');
register(['UCase', 'LCase', 'Len', 'Left', 'Right', 'Mid', 'Trim', 'LTrim', 'RTrim', 'Compare', 'InStr', 'Ascii', 'Char', 'Concat', 'Format', 'String', 'Text'], 'Strings', n => call(n, 'texto, ...'), n => call(n, "'Texto'"), n => 'Executa a operação de texto ' + n + '.', n => call(n, "'SINUSOID'"));
register(['DigText'], 'Digital State', () => 'DigText(valor)', () => "DigText('On')", () => 'Converte um estado digital para o texto correspondente.');
register(['Bod', 'Bom', 'Bonm', 'Day', 'DaySec', 'Hour', 'Minute', 'Month', 'Noon', 'ParseTime', 'Second', 'Weekday', 'Year', 'Yearday', 'IsDST'], 'Data e hora', n => call(n, 'time'), n => call(n, "'*'"), n => 'Obtém a informação de data ou hora calculada por ' + n + '.', n => call(n, "'*-1h'"));
register(['Avg', 'Max', 'Median', 'Min', 'Round', 'Trunc', 'EventCount', 'Range', 'PctGood', 'StDev'], 'Histórico', n => call(n, 'tag, start, end'), tagCall, n => 'Calcula ' + n + ' sobre os valores históricos do PI Point.');
register(['TagAvg', 'TagMax', 'TagMean', 'TagMin', 'TagTot'], 'Histórico', n => call(n, 'tag, start, end'), tagCall, n => 'Calcula ' + n + ' para um PI Point e intervalo histórico.');
register(['TagVal', 'NextVal', 'PrevVal', 'NextEvent', 'PrevEvent'], 'Histórico', n => call(n, 'tag, time'), n => n + "('SINUSOID', '*')", n => 'Obtém o valor ou evento solicitado do PI Point.');
register(['TimeEq', 'TimeGE', 'TimeGT', 'TimeLE', 'TimeLT', 'TimeNE'], 'Histórico', n => call(n, 'tag, start, end, estado'), n => n + "('Tag', '*-1h', '*', \"On\")", n => 'Calcula o tempo em que o PI Point satisfaz a condição informada.');
register(['FindEq', 'FindGE', 'FindGT', 'FindLE', 'FindLT', 'FindNE'], 'Busca histórica', n => call(n, 'tag, start, end, valor'), n => n + "('SINUSOID', '*-1h', '*', 50)", n => 'Busca o primeiro evento histórico que satisfaz a condição.');
register(['BadVal'], 'Qualidade', () => 'BadVal(valor)', () => "BadVal(TagVal('Tag', '*'))", () => 'Indica se o valor possui qualidade ruim.');
register(['IsSet'], 'Qualidade', () => 'IsSet(valor, qualidade)', () => "IsSet(TagVal('Tag', '*'), \"q\")", () => 'Verifica a qualidade solicitada do valor PI.');
register(['TagBad'], 'Qualidade', () => 'TagBad(tag, time)', () => "TagBad('Tag', '*')", () => 'Indica se o valor do PI Point possui qualidade ruim.');
register(['DigState', 'StateNo'], 'Digital State', n => call(n, 'valor'), n => n + "('On')", n => 'Obtém o estado ou código digital associado ao valor.');
register(['TagNum'], 'Metadata', () => 'TagNum(tag)', () => "TagNum('Tag')", () => 'Retorna o identificador numérico do PI Point.');
register(['TagDesc', 'TagEU', 'TagExDesc', 'TagName', 'TagSource', 'TagSpan', 'TagZero', 'TagType', 'TagTypVal'], 'Metadata', n => call(n, 'tag'), n => n + "('Tag')", n => 'Retorna o metadado ' + n + ' do PI Point informado.');
register(['AlmAckStat', 'AlmCondition', 'AlmCondText', 'AlmPriority'], 'Alarmes e controle', n => call(n, 'tag, time'), n => n + "('Tag', '*')", n => 'Consulta ' + n + ' no estado de alarme do PI Point.');
register(['Arma', 'Impulse', 'MedianFilt', 'Delay'], 'Stateful', n => call(n, 'valor, ...'), n => n + "(TagVal('Tag', '*'), 1)", n => 'Executa ' + n + ' respeitando o contexto temporal.');
register(['NoOutput'], 'Stateful', () => 'NoOutput()', () => 'NoOutput()', () => 'Suprime a emissão do resultado no ciclo atual.');

const officialNames = Object.values(piCompatibilityCatalog).flat();
const missing = officialNames.filter(name => !definitions.has(name));
if (missing.length) throw new Error('Funções sem ajuda: ' + missing.join(', '));
export const calculationFunctionHelp: readonly CalculationFunctionHelp[] = officialNames.map(name => ({ name, ...definitions.get(name)! }));

export const calculationExtensionHelp: readonly CalculationFunctionHelp[] = [
  { name: 'IF', category: 'Lógica', signature: 'IF(condição, verdadeiro, falso)', template: 'IF(0, 0, 0)', description: 'Retorna um valor quando a condição é verdadeira e outro quando é falsa.', example: 'IF(Temperatura > 80, 1, 0)' },
  { name: 'SE', category: 'Lógica', signature: 'SE(condição, verdadeiro, falso)', template: 'SE(0, 0, 0)', description: 'Forma alternativa de IF para decisões condicionais.', example: 'SE(Pressao > 5, 1, 0)' },
  { name: 'AND', category: 'Lógica', signature: 'AND(condição1, condição2, ...)', template: 'AND(0, 0)', description: 'Retorna 1 quando todas as condições são verdadeiras.', example: 'AND(Pressao > 5, Vazao > 10)' },
  { name: 'OR', category: 'Lógica', signature: 'OR(condição1, condição2, ...)', template: 'OR(0, 0)', description: 'Retorna 1 quando pelo menos uma condição é verdadeira.', example: 'OR(Alarme_A == 1, Alarme_B == 1)' },
  { name: 'NOT', category: 'Lógica', signature: 'NOT(condição)', template: 'NOT(0)', description: 'Inverte uma condição lógica.', example: 'NOT(Bomba_Ligada == 1)' },
  { name: 'ABS', category: 'Extensões', signature: 'ABS(valor)', template: 'ABS(0)', description: 'Retorna o valor absoluto.', example: 'ABS(Setpoint - Medida)' },
  { name: 'CLAMP', category: 'Extensões', signature: 'CLAMP(valor, mínimo, máximo)', template: 'CLAMP(0, 0, 100)', description: 'Limita um valor entre mínimo e máximo.', example: 'CLAMP(Nivel, 0, 100)' },
  { name: 'POWER', category: 'Extensões', signature: 'POWER(base, expoente)', template: 'POWER(0, 2)', description: 'Eleva a base ao expoente.', example: 'POWER(Pressao, 2)' },
  { name: 'SQRT', category: 'Extensões', signature: 'SQRT(valor)', template: 'SQRT(0)', description: 'Retorna a raiz quadrada.', example: 'SQRT(Vazao)' },
];
export const calculationFunctionHelpItems: readonly CalculationFunctionHelp[] = [...calculationFunctionHelp, ...calculationExtensionHelp];
