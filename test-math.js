require('ts-node/register');
const { evaluateCalculation } = require('./src/calculations/calculationEngine.ts');

const calc = {
  id: '1',
  name: 'test',
  expression: "t-(86400*(day(*)-0.9583333333333333))",
  inputs: []
};

console.log(evaluateCalculation(calc, new Map()));
