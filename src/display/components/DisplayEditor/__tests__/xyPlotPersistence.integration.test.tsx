
import { createTheme } from '@grafana/data';
import {
  appendXYPlot,
  createDisplayDocument,
  createXYPlot,
  addXYPlotYSeries,
  getXYPlotYSeries,

  serializeDisplay,
  parseImportedDisplay,
} from '../../../index';
import { createCalculationTrendBinding, isCalculationTrendBinding, CALCULATION_DATASOURCE_UID } from '../../../createTrend';


jest.mock('@grafana/ui', () => {
  const actual = jest.requireActual('@grafana/ui');
  return { ...actual, useStyles2: <T,>(getStyles: (theme: unknown) => T) => getStyles(createTheme()) };
});

const piA = { dataSourceUid: 'ds', serverPath: 'pims', pointName: 'PI_A' };
const calcX = createCalculationTrendBinding('calc-X');
const calcY = createCalculationTrendBinding('calc-Y');

describe('XY Plot Persistence', () => {
  it('save/reload Calc × PI + Calc', () => {
    let doc = createDisplayDocument({ name: 'persist-test' });
    const xy = createXYPlot({ xBinding: calcX as any, surface: { width: 800, height: 600, backgroundColor: '#000' }, existingIds: [] });
    // Configurações customizadas
    xy.properties.timestampMatch = 'exact';
    xy.properties.xScaleMode = 'database';
    doc = appendXYPlot(doc, xy);
    
    // Y0 = PI_A
    doc = addXYPlotYSeries(doc, xy.id, piA, 'Label A');
    
    // Y1 = Calc Y
    doc = addXYPlotYSeries(doc, xy.id, calcY as any, 'Label Y');
    const xyPlot = doc.elements[0] as any;
    xyPlot.properties.ySeries[0].color = '#ff0000';
    xyPlot.properties.ySeries[1].marker = 'circle';

    // Serialize
    const json = serializeDisplay(doc);
    
    // Deserialize
    const loaded = parseImportedDisplay(json);
    
    const loadedXY = loaded.elements[0] as any;
    expect(loadedXY.properties.xBinding.dataSourceUid).toBe(CALCULATION_DATASOURCE_UID);
    expect(loadedXY.properties.xBinding.serverPath).toBe('calc-X');
    expect(loadedXY.properties.timestampMatch).toBe('exact');
    expect(loadedXY.properties.xScaleMode).toBe('database');
    
    const loadedYSeries = getXYPlotYSeries(loadedXY.properties);
    expect(loadedYSeries).toHaveLength(2);
    
    // Y0 PI_A
    expect(isCalculationTrendBinding(loadedYSeries[0].binding)).toBe(false);
    expect(loadedYSeries[0].binding.pointName).toBe('PI_A');
    expect(loadedYSeries[0].color).toBe('#ff0000');
    
    // Y1 Calc Y
    expect(isCalculationTrendBinding(loadedYSeries[1].binding)).toBe(true);
    expect(loadedYSeries[1].binding.serverPath).toBe('calc-Y');
    expect(loadedYSeries[1].marker).toBe('circle');
  });

  it('legacy yBinding is migrated correctly without ySeries', () => {
    // Simulando um JSON antigo que só tinha xBinding e yBinding (legado)
    const legacyJson = {
      format: 'pims-vision-display',
      version: 1,
      document: {
        id: 'doc-1',
        schemaVersion: 1,
        name: 'legacy',
        surface: { width: 800, height: 600, backgroundColor: '#000' },
        elements: [
          {
            type: 'xy-plot',
            id: 'xy-1',
            x: 0, y: 0, width: 100, height: 100,
            properties: {
              xBinding: calcX,
              yBinding: piA, // propriedade legada
              timestampMatch: 'interpolated'
            }
          }
        ]
      }
    };
    
    const loaded = parseImportedDisplay(JSON.stringify(legacyJson));
    const loadedXY = loaded.elements[0] as any;
    
    // xBinding continua CalcX
    expect(loadedXY.properties.xBinding.dataSourceUid).toBe(CALCULATION_DATASOURCE_UID);
    
    // yBinding deve ter virado ySeries[0]
    const loadedYSeries = getXYPlotYSeries(loadedXY.properties);
    expect(loadedYSeries).toHaveLength(1);
    expect(loadedYSeries[0].binding.pointName).toBe('PI_A');
  });
  
  it('runtime state is not serialized', () => {
    let doc = createDisplayDocument({ name: 'persist-test' });
    const xy = createXYPlot({ xBinding: piA as any, surface: { width: 800, height: 600, backgroundColor: '#000' }, existingIds: [] });
    (xy as any).runtimeState = { loading: true }; // simulando injeção indevida
    doc = appendXYPlot(doc, xy);
    
    const serialized = JSON.parse(serializeDisplay(doc));
    const serializedXY = serialized.document.elements[0];
    expect((serializedXY as any).runtimeState).toBeUndefined();
  });
});
