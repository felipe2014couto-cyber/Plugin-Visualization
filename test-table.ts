import { createTable } from './src/display/createTable';
import { createCalculationTrendBinding } from './src/display/createTrend';

try {
  const table = createTable({
    surface: { width: 1000, height: 1000 } as any,
    existingIds: [],
    item: {
      binding: createCalculationTrendBinding('calc123'),
      description: 'Calc',
      nameMode: 'custom',
      customName: 'Calc'
    }
  });
  console.log("Success:", table);
} catch (e) {
  console.error("Error:", e);
}
