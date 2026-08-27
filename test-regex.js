const expression = 'TimeEq(LFS_RC2_TRANSLAÇÃO_DO_CARRO_LIGADA, -10m, *, "On")/600*100';
const expressionWithoutStrings = expression.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '');
console.log("Without strings:", expressionWithoutStrings);
const tokenPattern = /(?:^|[^\p{L}\p{N}_.:-])([\p{L}_][\p{L}\p{N}_.:-]*)(?!\s*\()/gu;
let match;
while ((match = tokenPattern.exec(expressionWithoutStrings)) !== null) {
  console.log("Found:", match[1]);
}
