const expression = 'TimeEq(LFS_RC2_TRANSLAÇÃO_DO_CARRO_LIGADA, -10m, *, "On")/600*100';
const expressionWithoutStrings = expression.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '');
console.log("Without strings:", expressionWithoutStrings);
const tokenPattern = /(?:^|[^\p{L}\p{N}_.:-])([\p{L}_][\p{L}\p{N}_.:-]*)(?=[^\p{L}\p{N}_.:-]|$)/gu;
let match;
while ((match = tokenPattern.exec(expressionWithoutStrings)) !== null) {
  const endIndex = match.index + match[0].length;
  const rest = expressionWithoutStrings.slice(endIndex);
  if (rest.trim().startsWith('(')) {
    console.log("Skipping function:", match[1]);
    continue;
  }
  console.log("Found tag:", match[1]);
}
