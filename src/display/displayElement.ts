export interface DisplayElement<TType extends string = string, TProperties = Record<string, unknown>> {
  id: string;
  type: TType;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: TProperties;
}
