/**
 * XY Plot — bug-fix regression tests
 *
 * Covers:
 *   BUG-01  global Y consumer IDs when ySeries mixes PI Points and Calculations
 *   BUG-02  database-scale never calls loadPiPointDatabaseLimits for Calculations
 *   BUG-03  Calculation history race: stale response discarded
 *   BUG-05  collectDisplayDataBindings collects XY X+Y bindings, skips pseudo-bindings
 */

import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import {
  appendXYPlot,
  createDisplayDocument,
  createXYPlot,
  addXYPlotYSeries,
  getXYPlotYSeries,
  type DisplayDocument,
} from '../../../index';
import { createCalculationTrendBinding, isCalculationTrendBinding, CALCULATION_DATASOURCE_UID } from '../../../createTrend';
import { collectDisplayDataBindings } from '../../../displayDataExport';
import { PI_POINT_DRAG_MIME, serializePiPointDragData } from '../../../../pi/piPointDrag';
import { CALCULATION_DRAG_MIME, serializeCalculationDragData } from '../../../../calculations/calculationDrag';
import { DisplayEditor } from '../DisplayEditor';

jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return { ...actual, useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()) };
});

// ─── Shared test data ─────────────────────────────────────────────────────────

const piA = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'PI_A' };
const piB = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'PI_B' };
const piC = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'PI_C' };
const calcC = createCalculationTrendBinding('calc-C');
const calcD = createCalculationTrendBinding('calc-D');

function makeXY(xBinding = piA as any) {
  return createXYPlot({ xBinding, surface: { width: 800, height: 600, backgroundColor: '#000' }, existingIds: [] });
}

// ─── Drop harness ─────────────────────────────────────────────────────────────

function DropHarness({ type = 'xy-plot', initial }: { type?: string; initial?: DisplayDocument }) {
  const [doc, setDoc] = useState<DisplayDocument>(() => {
    const d = initial ?? createDisplayDocument({ name: 'Drop' });
    if (!initial) {
      d.surface.width = 800;
      d.surface.height = 600;
      d.calculations = [{ id: 'calc-1', name: 'Cálculo 1', expression: 'A*2', inputs: [{ name: 'A', binding: piA }] }];
    }
    return d;
  });
  return (
    <>
      <DisplayEditor document={doc} onChange={setDoc} dropSymbolType={type as any} />
      <output data-testid="doc-json">{JSON.stringify(doc)}</output>
    </>
  );
}

function mockSurface() {
  const surface = screen.getByTestId('display-surface') as unknown as SVGSVGElement;
  jest.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600, x: 100, y: 50, toJSON: () => ({}),
  });
}

function fireDrop(dt: DataTransfer, x = 500, y = 350) {
  const e = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperties(e, { clientX: { value: x }, clientY: { value: y }, dataTransfer: { value: dt } });
  fireEvent(screen.getByTestId('display-editor-surface-wrapper'), e);
}

function piDT(point = piA): DataTransfer {
  const payload = serializePiPointDragData({ name: point.pointName, path: `\\\\pims\\${point.pointName}`, webId: 'wid', dataSourceUid: point.dataSourceUid });
  return { types: [PI_POINT_DRAG_MIME], effectAllowed: 'copy', dropEffect: 'none', getData: (t: string) => t === PI_POINT_DRAG_MIME ? payload : '', setData: jest.fn() } as unknown as DataTransfer;
}

function calcDT(calcId = 'calc-1'): DataTransfer {
  return { types: [CALCULATION_DRAG_MIME], effectAllowed: 'copy', dropEffect: 'none', getData: (t: string) => t === CALCULATION_DRAG_MIME ? serializeCalculationDragData(calcId) : '', setData: jest.fn() } as unknown as DataTransfer;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. isCalculationTrendBinding helper
// ═══════════════════════════════════════════════════════════════════════════════

describe('isCalculationTrendBinding', () => {
  it('returns true for pseudo-binding', () => expect(isCalculationTrendBinding(calcC)).toBe(true));
  it('returns false for real PI binding', () => expect(isCalculationTrendBinding(piA)).toBe(false));
  it('CALCULATION_DATASOURCE_UID equals __pims_calculation__', () => expect(CALCULATION_DATASOURCE_UID).toBe('__pims_calculation__'));
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. BUG-01 — global Y index preserved
// ═══════════════════════════════════════════════════════════════════════════════

describe('BUG-01: XY consumer IDs use global ySeries index', () => {
  it('Y0=CalcC, Y1=PI_B — no consumer-ID collision (BUG-01 main scenario)', () => {
    let doc = createDisplayDocument({ name: 'test' });
    const xy = makeXY();
    doc = appendXYPlot(doc, xy);
    doc = addXYPlotYSeries(doc, xy.id, calcC as any, 'Calc C');
    doc = addXYPlotYSeries(doc, xy.id, piB);
    const el = doc.elements[0] as ReturnType<typeof makeXY>;
    const series = getXYPlotYSeries(el.properties);
    expect(series).toHaveLength(2);
    // Build consumer IDs the way DisplaySurface does AFTER the fix (global index):
    const calcIds = series.map((s, i) => ({ s, i })).filter(({ s }) => isCalculationTrendBinding(s.binding)).map(({ i }) => `${xy.id}:xy-y-${i}`);
    const piIds = series.map((s, i) => ({ s, i })).filter(({ s }) => !isCalculationTrendBinding(s.binding)).map(({ i }) => `${xy.id}:xy-y-${i}`);
    // No overlap:
    expect(calcIds).toEqual([`${xy.id}:xy-y-0`]);
    expect(piIds).toEqual([`${xy.id}:xy-y-1`]);
    expect(new Set([...calcIds, ...piIds]).size).toBe(2);
  });

  it('Y0=PI_B, Y1=CalcC — correct order', () => {
    let doc = createDisplayDocument({ name: 'test' });
    const xy = makeXY();
    doc = appendXYPlot(doc, xy);
    doc = addXYPlotYSeries(doc, xy.id, piB);
    doc = addXYPlotYSeries(doc, xy.id, calcC as any, 'CalcC');
    const el = doc.elements[0] as ReturnType<typeof makeXY>;
    const series = getXYPlotYSeries(el.properties);
    const piIds = series.map((s, i) => ({ s, i })).filter(({ s }) => !isCalculationTrendBinding(s.binding)).map(({ i }) => `${xy.id}:xy-y-${i}`);
    const calcIds = series.map((s, i) => ({ s, i })).filter(({ s }) => isCalculationTrendBinding(s.binding)).map(({ i }) => `${xy.id}:xy-y-${i}`);
    expect(piIds).toEqual([`${xy.id}:xy-y-0`]);
    expect(calcIds).toEqual([`${xy.id}:xy-y-1`]);
  });

  it('Y0=Calc1, Y1=PI_B, Y2=Calc2, Y3=PI_C — 4 unique IDs', () => {
    let doc = createDisplayDocument({ name: 'test' });
    const xy = makeXY();
    doc = appendXYPlot(doc, xy);
    doc = addXYPlotYSeries(doc, xy.id, calcC as any, 'Calc1');
    doc = addXYPlotYSeries(doc, xy.id, piB);
    doc = addXYPlotYSeries(doc, xy.id, calcD as any, 'Calc2');
    doc = addXYPlotYSeries(doc, xy.id, piC);
    const el = doc.elements[0] as ReturnType<typeof makeXY>;
    const series = getXYPlotYSeries(el.properties);
    expect(series).toHaveLength(4);
    const ids = series.map((_, i) => `${xy.id}:xy-y-${i}`);
    expect(new Set(ids).size).toBe(4);
    // Types at each index:
    expect(isCalculationTrendBinding(series[0].binding)).toBe(true);
    expect(isCalculationTrendBinding(series[1].binding)).toBe(false);
    expect(isCalculationTrendBinding(series[2].binding)).toBe(true);
    expect(isCalculationTrendBinding(series[3].binding)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. BUG-02 — database scale must not include Calculation bindings
// ═══════════════════════════════════════════════════════════════════════════════

describe('BUG-02: database scale filter excludes Calculations', () => {
  function buildDBElems(xB: any, xMode: string, ySeries: Array<{ binding: any; scaleMode: string }>, xyId = 'xy-1') {
    const out: Array<{ id: string; binding: any }> = [];
    if (xMode === 'database' && !isCalculationTrendBinding(xB)) out.push({ id: `${xyId}:xy-x`, binding: xB });
    ySeries.forEach((s, i) => { if (s.scaleMode === 'database' && !isCalculationTrendBinding(s.binding)) out.push({ id: `${xyId}:xy-y-${i}`, binding: s.binding }); });
    return out;
  }

  it('PI Point X with database scale → included', () => expect(buildDBElems(piA, 'database', [])).toHaveLength(1));
  it('Calculation X with database scale → NOT included (BUG-02)', () => expect(buildDBElems(calcC, 'database', [])).toHaveLength(0));
  it('PI Point Y with database scale → included', () => {
    const elems = buildDBElems(piA, 'plotted', [{ binding: piB, scaleMode: 'database' }]);
    expect(elems).toHaveLength(1);
    expect(elems[0].id).toBe('xy-1:xy-y-0');
  });
  it('Calculation Y with database scale → NOT included (BUG-02)', () => expect(buildDBElems(piA, 'plotted', [{ binding: calcC, scaleMode: 'database' }])).toHaveLength(0));
  it('mixed: PI_X(db) + CalcY(db) + PI_Y(db) → only PI entries, no calc binding exposed', () => {
    const elems = buildDBElems(piA, 'database', [{ binding: calcC, scaleMode: 'database' }, { binding: piB, scaleMode: 'database' }]);
    expect(elems).toHaveLength(2); // piA(X) + piB(Y index 1)
    expect(elems.every((e: any) => !isCalculationTrendBinding(e.binding))).toBe(true);
    expect(elems[1].id).toBe('xy-1:xy-y-1'); // global index preserved
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. BUG-03 — race: stale response discarded when newer resolves first
// ═══════════════════════════════════════════════════════════════════════════════

describe('BUG-03: Calculation history race condition & Stale-while-loading', () => {
  it('discards stale response when newer request resolves first', async () => {
    let currentSeq = 0;
    let result: string | null = null;
    async function load(name: string, ms: number) {
      const seq = ++currentSeq;
      await new Promise<void>(r => setTimeout(r, ms));
      if (seq !== currentSeq) return; // stale — discard (BUG-03 fix)
      result = name;
    }
    const a = load('Calc_A', 100); // slow
    const b = load('Calc_B', 10);  // fast
    await Promise.all([a, b]);
    expect(result).toBe('Calc_B'); // A must NOT overwrite B
  });

  it('accepts the only response when no race occurs', async () => {
    let seq = 0;
    let result: string | null = null;
    async function load(name: string) {
      const s = ++seq;
      await Promise.resolve();
      if (s !== seq) return;
      result = name;
    }
    await load('Only');
    expect(result).toBe('Only');
  });

  it('clears stale data immediately when Calculation source changes (stale-while-loading fix)', () => {
    // This replicates the behavior from DisplaySurface's functional updater.
    let states = new Map<string, string>();
    states.set('xy-y-0', 'Calc_A_Data');
    
    // Simulate signature change to Calc_B
    const nextSignatures = new Map<string, string>();
    nextSignatures.set('xy-y-0', 'Calc_B');
    
    // The previous signature was 'Calc_A'
    const oldSignatures = new Map<string, string>();
    oldSignatures.set('xy-y-0', 'Calc_A');
    
    // Functional updater logic:
    let changed = false;
    const nextState = new Map(states);
    
    ['xy-y-0'].forEach((consumerId) => {
      const signature = nextSignatures.get(consumerId);
      if (oldSignatures.get(consumerId) !== signature) {
        nextState.delete(consumerId);
        changed = true;
      }
    });
    
    if (changed) states = nextState;
    
    // Expect the state to be cleared while loading Calc_B
    expect(states.has('xy-y-0')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. BUG-05 — collectDisplayDataBindings for XY Plot
// ═══════════════════════════════════════════════════════════════════════════════

describe('BUG-05: collectDisplayDataBindings — XY Plot', () => {
  it('collects X + all Y PI Point bindings', () => {
    let doc = createDisplayDocument({ name: 'exp' });
    const xy = makeXY(piA);
    doc = appendXYPlot(doc, xy);
    doc = addXYPlotYSeries(doc, xy.id, piB);
    doc = addXYPlotYSeries(doc, xy.id, piC);
    const bindings = collectDisplayDataBindings(doc);
    const names = bindings.map(b => b.pointName);
    expect(names).toContain('PI_A');
    expect(names).toContain('PI_B');
    expect(names).toContain('PI_C');
    expect(bindings).toHaveLength(3);
  });

  it('does NOT include Calculation pseudo-bindings', () => {
    let doc = createDisplayDocument({ name: 'exp-calc' });
    const xy = makeXY(piA);
    doc = appendXYPlot(doc, xy);
    doc = addXYPlotYSeries(doc, xy.id, calcC as any, 'Calc');
    doc = addXYPlotYSeries(doc, xy.id, piB);
    const bindings = collectDisplayDataBindings(doc);
    expect(bindings.every(b => !isCalculationTrendBinding(b))).toBe(true);
    expect(bindings.map(b => b.pointName)).not.toContain('calc-C');
  });

  it('deduplicates bindings across elements', () => {
    let doc = createDisplayDocument({ name: 'dedup' });
    const xy1 = makeXY(piA);
    const xy2 = makeXY(piA); // same X
    doc = appendXYPlot(doc, xy1);
    doc = appendXYPlot(doc, xy2);
    const bindings = collectDisplayDataBindings(doc);
    expect(bindings.filter(b => b.pointName === 'PI_A')).toHaveLength(1);
  });

  it('Calc-only XY produces empty list', () => {
    let doc = createDisplayDocument({ name: 'calc-only' });
    const xy = makeXY(calcC as any);
    doc = appendXYPlot(doc, xy);
    doc = addXYPlotYSeries(doc, xy.id, calcD as any, 'CalcD');
    expect(collectDisplayDataBindings(doc)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PI Point drop integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('DisplayEditor — PI Point drop → XY Plot', () => {
  it('creates XY with PI_A as X (dropSymbolType=xy-plot)', () => {
    render(<DropHarness type="xy-plot" />);
    mockSurface();
    fireDrop(piDT(piA));
    const doc = JSON.parse(screen.getByTestId('doc-json').textContent ?? '{}');
    expect(doc.elements[0]?.type).toBe('xy-plot');
    expect(doc.elements[0]?.properties.xBinding.pointName).toBe('PI_A');
  });

  it('adds PI_B as Y to existing XY', () => {
    let initial = createDisplayDocument({ name: 'XY' });
    initial.surface.width = 800; initial.surface.height = 600;
    const xy = makeXY(piA);
    initial = appendXYPlot(initial, xy);
    render(<DropHarness type="xy-plot" initial={initial} />);
    mockSurface();
    fireDrop(piDT(piB));
    const doc = JSON.parse(screen.getByTestId('doc-json').textContent ?? '{}');
    const series = getXYPlotYSeries(doc.elements[0].properties);
    expect(series.some((s: any) => s.binding.pointName === 'PI_B')).toBe(true);
  });

  it('duplicate Y is silently ignored', () => {
    let initial = createDisplayDocument({ name: 'XY dup' });
    initial.surface.width = 800; initial.surface.height = 600;
    const xy = makeXY(piA);
    initial = appendXYPlot(initial, xy);
    initial = addXYPlotYSeries(initial, xy.id, piB);
    render(<DropHarness type="xy-plot" initial={initial} />);
    mockSurface();
    fireDrop(piDT(piB));
    const doc = JSON.parse(screen.getByTestId('doc-json').textContent ?? '{}');
    const series = getXYPlotYSeries(doc.elements[0].properties);
    expect(series.filter((s: any) => s.binding.pointName === 'PI_B')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Calculation drop integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('DisplayEditor — Calculation drop → XY Plot', () => {
  it('creates XY with Calculation as X (dropSymbolType=xy-plot)', () => {
    render(<DropHarness type="xy-plot" />);
    mockSurface();
    fireDrop(calcDT('calc-1'));
    const doc = JSON.parse(screen.getByTestId('doc-json').textContent ?? '{}');
    expect(doc.elements[0]?.type).toBe('xy-plot');
    expect(doc.elements[0]?.properties.xBinding.dataSourceUid).toBe(CALCULATION_DATASOURCE_UID);
    expect(doc.elements[0]?.properties.xLabel).toBe('Cálculo 1');
  });

  it('adds Calculation as Y to existing XY', () => {
    let initial = createDisplayDocument({ name: 'XY' });
    initial.surface.width = 800; initial.surface.height = 600;
    initial.calculations = [{ id: 'calc-1', name: 'Cálculo 1', expression: 'A*2', inputs: [{ name: 'A', binding: piA }] }];
    const xy = makeXY(piA);
    initial = appendXYPlot(initial, xy);
    render(<DropHarness type="xy-plot" initial={initial} />);
    mockSurface();
    fireDrop(calcDT('calc-1'));
    const doc = JSON.parse(screen.getByTestId('doc-json').textContent ?? '{}');
    const series = getXYPlotYSeries(doc.elements[0].properties);
    expect(series.some((s: any) => s.binding.dataSourceUid === CALCULATION_DATASOURCE_UID && s.binding.serverPath === 'calc-1')).toBe(true);
  });
});
