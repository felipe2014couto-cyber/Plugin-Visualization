export interface PiPointBinding {
  dataSourceUid: string;
  serverPath: string;
  pointName: string;
  webId?: string;
  pointType?: string;
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
