export const CALCULATION_DRAG_MIME = 'application/x-pims-vision-calculation';

export function serializeCalculationDragData(calculationId: string): string {
  return calculationId;
}

export function parseCalculationDragData(value: string): string | undefined {
  const calculationId = value.trim();
  return calculationId || undefined;
}
