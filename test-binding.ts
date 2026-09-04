import { isPiPointBinding } from './src/pi/piPointBinding';
import { createCalculationTrendBinding } from './src/display/createTrend';

const b = createCalculationTrendBinding('calc123');
console.log(b);
console.log(isPiPointBinding(b));
