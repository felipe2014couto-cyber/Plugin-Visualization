import { getEffectivePiProductStatus, piCompatibilityCatalog, piCompatibilityCounts, piCompatibilityMatrix, piPhase17InitialPartial, piProductCompatibilityCounts, piServerSideCompatibilityCounts } from '../piCompatibilityCatalog';

describe('PI Performance Equations compatibility catalog', () => {
  it('audita os 112 nomes oficiais sem duplicidade', () => {
    const names = Object.values(piCompatibilityCatalog).flat();

    expect(piCompatibilityCounts).toEqual({
      compatible: 43,
      partial: 59,
      notImplemented: 10,
      total: 112,
    });
    expect(new Set(names.map((name) => name.toLocaleUpperCase())).size).toBe(names.length);
  });

  it('mantém a matriz server-side separada dos status locais e registra somente evidência runtime', () => {
    expect(Object.keys(piCompatibilityMatrix)).toHaveLength(112);
    expect(piCompatibilityMatrix.TagAvg).toEqual({
      localStatus: 'partial', serverSideStatus: 'supported', productStatus: 'compatible', requiredCapability: 'calculation/times', verifiedInRuntime: true, semanticValidated: true, executionSource: 'calculation-controller',
    });
    expect(piCompatibilityMatrix.Format).toMatchObject({ localStatus: 'partial', serverSideStatus: 'supported', productStatus: 'compatible', verifiedInRuntime: true, semanticValidated: true });
    expect(piCompatibilityMatrix.BadVal).toMatchObject({ localStatus: 'partial', serverSideStatus: 'context-dependent', productStatus: 'partial', verifiedInRuntime: true, semanticValidated: false });
    expect(piCompatibilityMatrix.MedianFilt).toMatchObject({ localStatus: 'not-implemented', serverSideStatus: 'context-dependent', verifiedInRuntime: true, semanticValidated: false, executionSource: 'pe-scheduler-replay' });
    expect(piCompatibilityMatrix.ParseTime).toMatchObject({ localStatus: 'partial', serverSideStatus: 'supported', productStatus: 'compatible', verifiedInRuntime: true, semanticValidated: true });
    expect(piCompatibilityMatrix.TagNum).toMatchObject({ serverSideStatus: 'not-tested', productStatus: 'compatible', verifiedInRuntime: true, semanticValidated: true, executionSource: 'pi-web-api-metadata' });
    expect(piCompatibilityMatrix.NoOutput).toMatchObject({ serverSideStatus: 'supported', productStatus: 'not-implemented', verifiedInRuntime: true, semanticValidated: true });
    expect(piCompatibilityMatrix.AlmPriority).toMatchObject({ serverSideStatus: 'context-dependent', productStatus: 'not-implemented', verifiedInRuntime: true, semanticValidated: false, executionSource: 'pi-alarm-state-set' });
    expect(piServerSideCompatibilityCounts).toEqual({ supported: 58, unsupported: 0, contextDependent: 11, notTested: 43 });
    expect(piProductCompatibilityCounts).toEqual({ compatible: 100, partial: 3, notImplemented: 9 });
  });

  it('resolve o status efetivo pela capability runtime sem alterar o fallback local', () => {
    expect(getEffectivePiProductStatus(piCompatibilityMatrix.TagAvg, { calculationControllerAvailable: true })).toBe('compatible');
    expect(getEffectivePiProductStatus({ localStatus: 'partial', serverSideStatus: 'supported', verifiedInRuntime: false, semanticValidated: false }, { calculationControllerAvailable: true })).toBe('partial');
    expect(getEffectivePiProductStatus({ localStatus: 'partial', serverSideStatus: 'not-tested', verifiedInRuntime: false, semanticValidated: false }, { calculationControllerAvailable: true })).toBe('partial');
    expect(getEffectivePiProductStatus(piCompatibilityMatrix.IsDST, { calculationControllerAvailable: true })).toBe('compatible');
    expect(getEffectivePiProductStatus(piCompatibilityMatrix.MedianFilt, { calculationControllerAvailable: true })).toBe('not-implemented');
    expect(getEffectivePiProductStatus(piCompatibilityMatrix.TagAvg, { calculationControllerAvailable: false })).toBe('partial');
    expect(getEffectivePiProductStatus(piCompatibilityMatrix.TagNum, { calculationControllerAvailable: false, piPointMetadataAvailable: true })).toBe('compatible');
    expect(getEffectivePiProductStatus(piCompatibilityMatrix.TagNum, { calculationControllerAvailable: true, piPointMetadataAvailable: false })).toBe('partial');
  });

  it('preserva a lista inicial exata de 56 funções parciais', () => {
    expect(piPhase17InitialPartial).toHaveLength(56);
    expect(new Set(piPhase17InitialPartial.map((name) => name.toLocaleUpperCase())).size).toBe(56);
  });

  it('congela o checkpoint atual e separa extensões do plugin', () => {
    const allNames = Object.values(piCompatibilityCatalog).flat();
    expect(piCompatibilityCounts.compatible + piCompatibilityCounts.partial + piCompatibilityCounts.notImplemented).toBe(112);
    expect(piCompatibilityCatalog.partial).toContain('TagNum');
    expect(piCompatibilityCatalog['not-implemented']).toContain('NoOutput');
    expect(allNames).not.toContain('Average');
    expect(allNames).not.toContain('Minimum');
    expect(allNames).not.toContain('Maximum');
  });
});
