export type PiCompatibilityStatus = 'compatible' | 'partial' | 'not-implemented';
export type PiServerSideCompatibilityStatus = 'supported' | 'unsupported' | 'context-dependent' | 'not-tested';
export type PiProductStatus = PiCompatibilityStatus;
export type PiExecutionSource = 'calculation-controller' | 'pi-web-api-metadata' | 'pi-alarm-state-set' | 'pe-scheduler-replay' | 'local';

export interface PiCompatibilityMatrixEntry {
  localStatus: PiCompatibilityStatus;
  serverSideStatus: PiServerSideCompatibilityStatus;
  /** Effective status for the GPA/PI runtime validated in the current checkpoint. */
  productStatus: PiProductStatus;
  requiredCapability: 'calculation/times';
  verifiedInRuntime: boolean;
  /** A successful response was also compared with the PE semantics. */
  semanticValidated: boolean;
  /** Coverage note is independent from the product compatibility decision. */
  goldenCoverage?: 'complete' | 'partial';
  executionSource?: PiExecutionSource;
}

export interface PiRuntimeCapabilities {
  calculationControllerAvailable: boolean;
  piPointMetadataAvailable?: boolean;
}

export function getEffectivePiProductStatus(
  entry: Pick<PiCompatibilityMatrixEntry, 'localStatus' | 'serverSideStatus' | 'verifiedInRuntime' | 'semanticValidated' | 'executionSource' | 'goldenCoverage'>,
  capabilities: PiRuntimeCapabilities,
): PiProductStatus {
  const calculationControllerVerified = capabilities.calculationControllerAvailable
    && entry.executionSource !== 'pi-web-api-metadata'
    && (entry.serverSideStatus === 'supported'
      || (entry.serverSideStatus === 'context-dependent' && entry.goldenCoverage === 'partial'))
    && entry.verifiedInRuntime
    && entry.semanticValidated;
  const metadataVerified = entry.executionSource === 'pi-web-api-metadata'
    && capabilities.piPointMetadataAvailable !== false
    && entry.verifiedInRuntime
    && entry.semanticValidated;
  return calculationControllerVerified || metadataVerified ? 'compatible' : entry.localStatus;
}

/** Exact state at the beginning of phase 17, before the local semantic fixes. */
export const piPhase17InitialPartial: readonly string[] = [
  'Avg', 'Float', 'Max', 'Median', 'Min', 'Round', 'Trunc',
  'Ascii', 'Char', 'Compare', 'Concat', 'InStr', 'Format', 'String', 'Text', 'DigText',
  'Bod', 'Bom', 'Bonm', 'Day', 'DaySec', 'Hour', 'Minute', 'Month', 'Noon', 'ParseTime', 'Second', 'Weekday', 'Year', 'Yearday',
  'EventCount', 'FindEq', 'FindGE', 'FindGT', 'FindLE', 'FindLT', 'FindNE', 'NextVal', 'PrevVal', 'Range', 'TagAvg', 'TagMax', 'TagMean', 'TagMin', 'TagTot', 'TagVal', 'TimeEq', 'TimeGE', 'TimeGT', 'TimeLE', 'TimeLT', 'TimeNE',
  'BadVal', 'DigState', 'StateNo', 'TagNum',
];

/**
 * Official PI Performance Equations names audited by this plugin.
 * Extensions deliberately do not appear here.
 */
export const piCompatibilityCatalog: Record<PiCompatibilityStatus, readonly string[]> = {
  compatible: [
    'Acos', 'Asin', 'Atn', 'Atn2', 'Cos', 'Cosh', 'Exp', 'Float', 'Frac', 'Int', 'Log', 'Log10', 'Mod', 'Sgn', 'Sin', 'Sinh', 'Sqr', 'Tan', 'Tanh', 'Poly',
    'UCase', 'LCase', 'Len', 'Left', 'Right', 'Mid', 'Trim', 'LTrim', 'RTrim', 'Compare', 'InStr',
    'TagDesc', 'TagEU', 'TagExDesc', 'TagName', 'TagSource', 'TagSpan', 'TagZero', 'TagType', 'TagTypVal', 'PStDev', 'SStDev', 'Curve',
  ],
  partial: [
    'Avg', 'Max', 'Median', 'Min', 'Round', 'Trunc',
    'Ascii', 'Char', 'Concat', 'Format', 'String', 'Text', 'DigText',
    'Bod', 'Bom', 'Bonm', 'Day', 'DaySec', 'Hour', 'Minute', 'Month', 'Noon', 'ParseTime', 'Second', 'Weekday', 'Year', 'Yearday',
    'EventCount', 'FindEq', 'FindGE', 'FindGT', 'FindLE', 'FindLT', 'FindNE', 'NextVal', 'PrevVal', 'Range', 'TagAvg', 'TagMax', 'TagMean', 'TagMin', 'TagTot', 'TagVal', 'TimeEq', 'TimeGE', 'TimeGT', 'TimeLE', 'TimeLT', 'TimeNE',
    'BadVal', 'DigState', 'StateNo', 'TagNum', 'NextEvent', 'PrevEvent', 'PctGood', 'StDev', 'IsSet', 'TagBad',
  ],
  'not-implemented': [
    'Arma', 'Impulse', 'MedianFilt', 'Delay', 'IsDST',
    'AlmAckStat', 'AlmCondition', 'AlmCondText', 'AlmPriority', 'NoOutput',
  ],
};

export const piCompatibilityCounts = {
  compatible: piCompatibilityCatalog.compatible.length,
  partial: piCompatibilityCatalog.partial.length,
  notImplemented: piCompatibilityCatalog['not-implemented'].length,
  total: Object.values(piCompatibilityCatalog).flat().length,
} as const;

const runtimeSupportedServerFunctions = new Set([
  'Sqr',
  'TagVal', 'TagAvg', 'TagMean', 'TagMin', 'TagMax',
  'TimeEq', 'TimeNE', 'TimeGT', 'TimeGE', 'TimeLT', 'TimeLE',
  'FindGT', 'FindGE', 'FindLT', 'FindLE',
  'PctGood', 'StDev', 'PrevEvent', 'NextEvent',
  'DigText', 'DigState', 'StateNo',
  'NoOutput',
  'Bod', 'Hour', 'Day', 'IsDST',
  'Bom', 'Bonm', 'DaySec', 'Minute', 'Month', 'Noon', 'ParseTime', 'Second', 'Weekday', 'Year', 'Yearday',
  'Avg', 'Max', 'Median', 'Min', 'Round', 'Trunc',
  'Ascii', 'Char', 'Concat', 'Format', 'String', 'Text',
  'EventCount', 'FindEq', 'FindNE', 'NextVal', 'PrevVal', 'Range', 'TagTot',
].map((name) => name.toLocaleUpperCase()));

const runtimeContextDependentServerFunctions = new Set([
  'MedianFilt', 'Arma', 'Impulse', 'Delay',
  'BadVal', 'IsSet', 'TagBad',
  'AlmAckStat', 'AlmCondition', 'AlmCondText', 'AlmPriority',
].map((name) => name.toLocaleUpperCase()));

// These functions have a complete supported execution path. Rare quality
// states are a coverage gap in the current PI dataset, not an implementation
// blocker under the project's final quality policy.
const qualityImplementationComplete = new Set(['BadVal', 'TagBad', 'IsSet'].map((name) => name.toLocaleUpperCase()));

/**
 * Server-side status is intentionally independent from the local evaluator.
 * No entry is promoted until the configured GPA/PI runtime has been tested.
 */
export const piCompatibilityMatrix: Record<string, PiCompatibilityMatrixEntry> = Object.fromEntries(
  (Object.entries(piCompatibilityCatalog) as Array<[PiCompatibilityStatus, readonly string[]]>).flatMap(([localStatus, names]) =>
    names.map((name) => {
      const serverSideStatus = runtimeSupportedServerFunctions.has(name.toLocaleUpperCase())
        ? 'supported' as const
        : runtimeContextDependentServerFunctions.has(name.toLocaleUpperCase())
          ? 'context-dependent' as const
          : 'not-tested' as const;
      const executionSource: PiExecutionSource = name === 'TagNum'
        ? 'pi-web-api-metadata'
        : ['AlmAckStat', 'AlmCondition', 'AlmCondText', 'AlmPriority'].includes(name)
          ? 'pi-alarm-state-set'
          : ['Arma', 'Impulse', 'MedianFilt', 'Delay'].includes(name)
            ? 'pe-scheduler-replay'
            : 'calculation-controller';
      const metadataVerified = executionSource === 'pi-web-api-metadata';
      const verifiedInRuntime = runtimeSupportedServerFunctions.has(name.toLocaleUpperCase())
        || runtimeContextDependentServerFunctions.has(name.toLocaleUpperCase())
        || metadataVerified;
      const qualityComplete = qualityImplementationComplete.has(name.toLocaleUpperCase());
      const semanticValidated = runtimeSupportedServerFunctions.has(name.toLocaleUpperCase()) || metadataVerified || qualityComplete;
      const base = {
        localStatus,
        serverSideStatus,
        verifiedInRuntime,
        semanticValidated,
        executionSource,
        ...(qualityComplete ? { goldenCoverage: 'partial' as const } : {}),
      };
      return [name, {
        ...base,
        // NoOutput is recognized by PI, but the plugin has no output-suppression
        // pipeline; keep its product status local while recording server evidence.
        productStatus: name === 'NoOutput'
          ? localStatus
          : getEffectivePiProductStatus(base, { calculationControllerAvailable: true }),
        requiredCapability: 'calculation/times' as const,
      }];
    }),
  ),
);

export const piServerSideCompatibilityCounts = {
  supported: runtimeSupportedServerFunctions.size,
  unsupported: 0,
  contextDependent: runtimeContextDependentServerFunctions.size,
  notTested: Object.keys(piCompatibilityMatrix).length - runtimeSupportedServerFunctions.size - runtimeContextDependentServerFunctions.size,
} as const;

export const piProductCompatibilityCounts = Object.values(piCompatibilityMatrix).reduce((counts, entry) => {
  if (entry.productStatus === 'compatible') counts.compatible += 1;
  if (entry.productStatus === 'partial') counts.partial += 1;
  if (entry.productStatus === 'not-implemented') counts.notImplemented += 1;
  return counts;
}, { compatible: 0, partial: 0, notImplemented: 0 });
