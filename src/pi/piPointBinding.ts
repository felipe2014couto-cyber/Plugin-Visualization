export interface PiPointBinding {
  dataSourceUid: string;
  serverPath: string;
  pointName: string;
  webId?: string;
  pointType?: string;
  kind?: 'pipoint' | 'af';
  afPath?: string;
  elementPath?: string;
  attributeName?: string;
}

export function isAfBinding(binding: Partial<PiPointBinding> | undefined | null): boolean {
  if (!binding) return false;
  return binding.kind === 'af'
    || typeof binding.afPath === 'string'
    || (typeof binding.webId === 'string' && binding.webId.indexOf('F1Ab') === 0);
}

export function getBindingKey(binding: PiPointBinding): string {
  if (isAfBinding(binding) && binding.afPath) {
    return `${binding.dataSourceUid}\u0000af\u0000${binding.afPath.toLowerCase()}`;
  }
  return `${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`;
}

export interface PiPointDatabaseLimits {
  zero: number;
  span: number;
}

export interface PiPointIdentityInput {
  dataSourceUid?: string;
  name?: string;
  path?: string;
  webId?: string;
  pointType?: string;
}

export function createPiPointBinding(input: PiPointIdentityInput): PiPointBinding | undefined {
  const dataSourceUid = input.dataSourceUid?.trim();
  const pointName = input.name?.trim();
  const path = input.path?.trim();

  if (!dataSourceUid || !pointName || !path) {
    return undefined;
  }

  const normalizedPath = path.replace(/\\+$/, '');
  const pointSuffix = `\\${pointName}`;
  const lowerPath = normalizedPath.toLocaleLowerCase();
  const lowerSuffix = pointSuffix.toLocaleLowerCase();
  const rawServerPath = lowerPath.endsWith(lowerSuffix)
    ? normalizedPath.slice(0, normalizedPath.length - pointSuffix.length)
    : normalizedPath.slice(0, normalizedPath.lastIndexOf('\\'));
  const serverPath = rawServerPath.replace(/^\\+/, '');

  if (!serverPath || normalizedPath.lastIndexOf('\\') < 1) {
    return undefined;
  }

  const webId = input.webId?.trim();
  const pointType = input.pointType?.trim();
  return {
    dataSourceUid,
    serverPath,
    pointName,
    ...(webId ? { webId } : {}),
    ...(pointType ? { pointType } : {}),
  };
}

export function isStatePiPointBinding(binding: PiPointBinding): boolean {
  const pointType = binding.pointType?.trim().toLocaleLowerCase();
  return pointType === 'string' || pointType === 'digital';
}

export function isPiPointBinding(value: unknown): value is PiPointBinding {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const binding = value as Partial<PiPointBinding>;
  return [binding.dataSourceUid, binding.serverPath, binding.pointName]
    .every((field) => typeof field === 'string' && field.trim().length > 0);
}
