import {
  convertPiVisionDisplay,
  convertPiVisionCalculations,
  convertMultistate,
  parseDataSourcePath,
  translatePiVisionExpression,
  PI_VISION_IMPORT_DATASOURCE_UID_PLACEHOLDER,
  PiVisionConvertError,
  mapPiVisionGraphicToLocalSymbol,
  type PiVisionDisplay,
  type PiVisionSymbol,
} from '../piVisionConverter';
import { DISPLAY_SCHEMA_VERSION } from '../schemaVersion';
import { VALUE_TYPE } from '../createValue';
import { TREND_TYPE } from '../createTrend';
import { GAUGE_TYPE } from '../createGauge';
import { BAR_TYPE } from '../createBar';
import { TABLE_TYPE } from '../createTable';
import { TEXT_TYPE } from '../createText';
import { RECTANGLE_TYPE } from '../createRectangle';
import { IMAGE_TYPE } from '../createImage';
import { LIBRARY_SYMBOL_TYPE } from '../createLibrarySymbol';
import { isPiPointBinding } from '../../pi/piPointBinding';

// ---------------------------------------------------------------------------
// parseDataSourcePath
// ---------------------------------------------------------------------------

describe('parseDataSourcePath', () => {
  const uid = 'test-uid';

  it('parseia path pi:\\\\ padrao', () => {
    const result = parseDataSourcePath('pi:\\\\SERVER\\TAG1', uid);
    expect(result).not.toBeUndefined();
    expect(result!.dataSourceUid).toBe(uid);
    expect(result!.serverPath).toBe('SERVER');
    expect(result!.pointName).toBe('TAG1');
  });

  it('parseia path sem prefixo de protocolo', () => {
    const result = parseDataSourcePath('SERVER\\TAGNAME', uid);
    expect(result).not.toBeUndefined();
    expect(result!.serverPath).toBe('SERVER');
    expect(result!.pointName).toBe('TAGNAME');
  });

  it('parseia path com barras iniciais', () => {
    const result = parseDataSourcePath('\\\\SERVER\\TAG', uid);
    expect(result).not.toBeUndefined();
    expect(result!.serverPath).toBe('SERVER');
    expect(result!.pointName).toBe('TAG');
  });

  it('parseia path af:\\\\ e extrai o ponto como ultima parte', () => {
    const result = parseDataSourcePath('af:\\\\SERVER\\DB\\Element|Attribute', uid);
    expect(result).not.toBeUndefined();
    expect(result!.serverPath).toBe('SERVER');
    expect(result!.pointName).toBe('Attribute');
  });

  it('parseia path af:\\\\ com separador de subitem pipe', () => {
    const result = parseDataSourcePath('af:\\\\MYSERVER\\PlantDB\\Pump01|Speed', uid);
    expect(result).not.toBeUndefined();
    expect(result!.pointName).toBe('Speed');
  });

  it('retorna undefined para path vazio', () => {
    expect(parseDataSourcePath('', uid)).toBeUndefined();
  });

  it('retorna undefined para path sem separador de servidor', () => {
    expect(parseDataSourcePath('SOMENTE_TAG', uid)).toBeUndefined();
  });

  it('retorna undefined para dataSourceUid vazio', () => {
    expect(parseDataSourcePath('SERVER\\TAG', '')).toBeUndefined();
  });

  it('resultado e um PiPointBinding valido', () => {
    const result = parseDataSourcePath('pi:\\\\SRV\\MY.TAG', uid);
    expect(isPiPointBinding(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// convertMultistate
// ---------------------------------------------------------------------------

describe('convertMultistate', () => {
  it('converte trigger menor-que', () => {
    const config = convertMultistate([{ Expression: '< 10', ForeColor: '#ff0000' }]);
    expect(config.enabled).toBe(true);
    expect(config.rules).toHaveLength(1);
    expect(config.rules[0].operator).toBe('lt');
    expect(config.rules[0].value).toBe(10);
    expect(config.rules[0].color).toBe('#ff0000');
  });

  it('converte trigger menor-ou-igual', () => {
    const config = convertMultistate([{ Expression: '<= 5', ForeColor: '#ff9800' }]);
    expect(config.rules[0].operator).toBe('lte');
    expect(config.rules[0].value).toBe(5);
  });

  it('converte trigger maior-que', () => {
    const config = convertMultistate([{ Expression: '> 20', ForeColor: '#4caf50' }]);
    expect(config.rules[0].operator).toBe('gt');
    expect(config.rules[0].value).toBe(20);
  });

  it('converte trigger maior-ou-igual', () => {
    const config = convertMultistate([{ Expression: '>= 100', ForeColor: '#2196f3' }]);
    expect(config.rules[0].operator).toBe('gte');
    expect(config.rules[0].value).toBe(100);
  });

  it('converte trigger igual a numero', () => {
    const config = convertMultistate([{ Expression: '= 0', ForeColor: '#9c27b0' }]);
    expect(config.rules[0].operator).toBe('eq');
    expect(config.rules[0].value).toBe(0);
  });

  it('converte trigger igual a estado digital (string)', () => {
    const config = convertMultistate([{ Expression: '= Shutdown', ForeColor: '#f44336' }]);
    expect(config.rules[0].operator).toBe('eq');
    expect(config.rules[0].value).toBe('Shutdown');
  });

  it('converte trigger between (formato "X to Y")', () => {
    const config = convertMultistate([{ Expression: '10 to 20', ForeColor: '#ff9800' }]);
    expect(config.rules[0].operator).toBe('between');
    expect(config.rules[0].value).toBe(10);
    expect(config.rules[0].value2).toBe(20);
  });

  it('ordena o between corretamente quando min > max', () => {
    const config = convertMultistate([{ Expression: '50 to 10', ForeColor: '#ff9800' }]);
    expect(config.rules[0].value).toBe(10);
    expect(config.rules[0].value2).toBe(50);
  });

  it('cada regra tem id unico', () => {
    const config = convertMultistate([
      { Expression: '< 10', ForeColor: '#ff0000' },
      { Expression: '> 90', ForeColor: '#00ff00' },
    ]);
    const ids = config.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ignora trigger com expressao vazia', () => {
    const config = convertMultistate([
      { Expression: '', ForeColor: '#ff0000' },
      { Expression: '> 10', ForeColor: '#00ff00' },
    ]);
    expect(config.rules).toHaveLength(1);
  });

  it('retorna enabled: false quando todos os triggers sao invalidos', () => {
    const config = convertMultistate([{ Expression: '', ForeColor: '#ff0000' }]);
    expect(config.enabled).toBe(false);
    expect(config.rules).toHaveLength(0);
  });

  it('usa cor de fallback quando ForeColor e invalida', () => {
    const config = convertMultistate([{ Expression: '< 5', ForeColor: 'nao-uma-cor' }]);
    expect(config.rules[0].color).toBe('#d32f2f');
  });
});

// ---------------------------------------------------------------------------
// convertPiVisionDisplay — casos de erro
// ---------------------------------------------------------------------------

describe('convertPiVisionDisplay — erros', () => {
  it('lanca PiVisionConvertError para input null', () => {
    expect(() => convertPiVisionDisplay(null)).toThrow(PiVisionConvertError);
  });

  it('lanca PiVisionConvertError para array', () => {
    expect(() => convertPiVisionDisplay([])).toThrow(PiVisionConvertError);
  });

  it('lanca PiVisionConvertError para string', () => {
    expect(() => convertPiVisionDisplay('invalid')).toThrow(PiVisionConvertError);
  });
});

// ---------------------------------------------------------------------------
// convertPiVisionDisplay — documento resultado
// ---------------------------------------------------------------------------

describe('convertPiVisionDisplay — documento', () => {
  it('retorna DisplayDocument com schemaVersion correto', () => {
    const result = convertPiVisionDisplay({ Name: 'Test' });
    expect(result.schemaVersion).toBe(DISPLAY_SCHEMA_VERSION);
  });

  it('gera id unico para o documento', () => {
    const r1 = convertPiVisionDisplay({ Name: 'A' });
    const r2 = convertPiVisionDisplay({ Name: 'B' });
    expect(r1.id).not.toBe(r2.id);
  });

  it('usa o nome do display', () => {
    const result = convertPiVisionDisplay({ Name: 'Minha Tela' });
    expect(result.name).toBe('Minha Tela');
  });

  it('usa nome padrao quando Name e ausente', () => {
    const result = convertPiVisionDisplay({});
    expect(result.name).toBe('Display Importado');
  });

  it('mapeia Width e Height para a superficie', () => {
    const result = convertPiVisionDisplay({ Width: 1600, Height: 900 });
    expect(result.surface.width).toBe(1600);
    expect(result.surface.height).toBe(900);
  });

  it('usa dimensoes padrao quando Width/Height sao invalidos', () => {
    const result = convertPiVisionDisplay({ Width: -1, Height: 0 });
    expect(result.surface.width).toBe(1920);
    expect(result.surface.height).toBe(1080);
  });

  it('mapeia BackgroundColor para a superficie', () => {
    const result = convertPiVisionDisplay({ BackgroundColor: '#181b1f' });
    expect(result.surface.backgroundColor).toBe('#181b1f');
  });

  it('usa cor de fundo padrao quando BackgroundColor e invalida', () => {
    const result = convertPiVisionDisplay({ BackgroundColor: 'nao-hex' });
    expect(result.surface.backgroundColor).toBe('#1f1f1f');
  });

  it('retorna lista de elementos vazia quando Symbols e ausente', () => {
    const result = convertPiVisionDisplay({ Name: 'Sem Simbolos' });
    expect(result.elements).toEqual([]);
  });

  it('usa o placeholder de dataSourceUid quando nao fornecido', () => {
    const display: PiVisionDisplay = {
      Symbols: [
        {
          SymbolType: 'Value',
          Left: 0, Top: 0, Width: 200, Height: 80,
          Configuration: { DataSources: ['SERVER\\TAG1'] },
        },
      ],
    };
    const result = convertPiVisionDisplay(display);
    const el = result.elements[0];
    expect((el.properties as any).binding?.dataSourceUid).toBe(PI_VISION_IMPORT_DATASOURCE_UID_PLACEHOLDER);
  });

  it('usa o dataSourceUid fornecido', () => {
    const display: PiVisionDisplay = {
      Symbols: [
        {
          SymbolType: 'Value',
          Left: 0, Top: 0, Width: 200, Height: 80,
          Configuration: { DataSources: ['SERVER\\TAG1'] },
        },
      ],
    };
    const result = convertPiVisionDisplay(display, 'my-ds-uid');
    const el = result.elements[0];
    expect((el.properties as any).binding?.dataSourceUid).toBe('my-ds-uid');
  });

  it('converte o formato real retornado por OpenEditDisplay', () => {
    const result = convertPiVisionDisplay({
      Name: 'Display real',
      DisplayProperties: { BackgroundColor: '#202020' },
      Symbols: [
        {
          SymbolType: 'value',
          DataSources: ['pi:\\PISERVER?server-id\\TAG-01?point-id'],
          Configuration: {
            Left: 100,
            Top: 50,
            Right: 340,
            Height: 80,
            ValueStroke: '#ffffff',
            Fill: '#101010',
            ShowUOM: true,
            ShowTime: true,
          },
        },
        {
          SymbolType: 'statictext',
          Configuration: {
            Left: 10,
            Top: 200,
            Width: 300,
            Height: 40,
            StaticText: 'Titulo',
            Stroke: '#eeeeee',
          },
        },
      ],
    }, 'pi-uid');

    expect(result.surface).toEqual({ width: 340, height: 240, backgroundColor: '#202020' });
    expect(result.elements).toHaveLength(2);
    expect(result.elements[0]).toMatchObject({ type: VALUE_TYPE, x: 100, y: 50, width: 240, height: 80 });
    expect((result.elements[0].properties as any).binding).toMatchObject({
      dataSourceUid: 'pi-uid',
      serverPath: 'PISERVER',
      pointName: 'TAG-01',
    });
    expect((result.elements[0].properties as any).visual).toMatchObject({ showUnit: true, showTimestamp: true });
    expect(result.elements[1]).toMatchObject({ type: TEXT_TYPE, x: 10, y: 200, width: 300, height: 40 });
    expect((result.elements[1].properties as any).text).toBe('Titulo');
  });

  it('alinha o texto de um botão ao retângulo exportado pelo PI Vision', () => {
    const result = convertPiVisionDisplay({
      Width: 400,
      Height: 200,
      Symbols: [
        {
          SymbolType: 'rectangle',
          Left: 8,
          Top: 110,
          Width: 146,
          Height: 29,
          Configuration: {
            Fill: 'rgba(240,240,240,1)',
            Stroke: 'rgba(100,100,100,1)',
          },
        },
        {
          SymbolType: 'statictext',
          Left: 56,
          Top: 115,
          Width: 200,
          Height: 19,
          Configuration: {
            StaticText: 'Voltar',
            BackColor: 'rgba(240,240,240,1)',
            ForeColor: 'rgba(0,0,0,1)',
            LinkURL: 'http://example.test/voltar',
          },
        },
      ],
    });

    const button = result.elements.find((element) => element.type === 'rectangle');
    const label = result.elements.find((element) => element.type === 'text');
    expect(button).toMatchObject({ x: 8, y: 110, width: 146, height: 29 });
    expect(label).toMatchObject({ x: 8, y: 115, width: 146, height: 19 });
  });

  it('usa Center para calcular a largura de Values e preserva cores rgba', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{
        SymbolType: 'value',
        DataSources: ['pi:\\pims\\TAG'],
        Configuration: {
          Left: 100,
          Center: 130,
          Top: 20,
          Height: 24,
          Fill: 'rgba(255,255,255,0)',
          ValueStroke: 'rgba(0,0,0,1)',
          FormatType: 'N2',
          NameType: 'C',
          CustomName: 'Temperatura',
        },
      }],
    }, 'pi-uid');

    expect(result.elements[0]).toMatchObject({ type: VALUE_TYPE, x: 100, width: 60 });
    expect((result.elements[0].properties as any).visual).toMatchObject({
      backgroundColor: 'rgba(255,255,255,0)',
      color: 'rgba(0,0,0,1)',
      decimals: 2,
      labelMode: 'custom',
      customLabel: 'Temperatura',
    });
  });

  it('usa largura compacta para Value do PI Vision sem largura declarada', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{
        SymbolType: 'value',
        DataSources: ['pi:\\pims\\PRESSAO'],
        Configuration: {
          Left: 100, Top: 20, Height: 19, Fill: '#000000', ValueStroke: '#2cfe21', FontSize: 14,
        },
      }],
    }, 'pi-uid');
    expect(result.elements[0]).toMatchObject({ type: VALUE_TYPE, width: 67 });
    expect(result.elements[0].properties).toMatchObject({ _piVisionSquareBackground: true });
  });

  it('converte verticalgauge do PI Vision em barra compacta com escala', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{
        SymbolType: 'verticalgauge',
        DataSources: ['pi:\\pims\\PR58_LIGADA'],
        Configuration: {
          Left: 100, Top: 50, Width: 73, Height: 213,
          Fill: 'rgb(0, 162, 232)', Background: 'rgba(255,255,255,0)',
          Stroke: 'white', StrokeWidth: 2, ShowLabel: true, ShowValue: true,
          ShowUOM: true, NameType: 'C', CustomName: 'LIGADO', FormatType: 'N2',
          ValueScaleSettings: { MinValue: 0, MaxValue: 100 },
        },
      }],
    }, 'pi-uid');
    expect(result.elements[0]).toMatchObject({ type: BAR_TYPE, x: 100, y: 50, width: 73, height: 213 });
    expect(result.elements[0].properties).toMatchObject({
      minimum: 0, maximum: 100, orientation: 'vertical', fillColor: 'rgb(0, 162, 232)',
      backgroundColor: 'rgba(255,255,255,0)', borderColor: 'white', borderWidth: 2,
      tagNameMode: 'custom', customTagName: 'LIGADO', showUnit: true,
      _piVisionCompactGauge: true,
    });
  });

  it('nao desenha metadados de grupo novamente', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{ SymbolType: 'group', Configuration: { Children: ['Symbol1'] } as any }],
    });
    expect(result.elements).toEqual([]);
  });

  it('converte graphic industrial em SVG incorporado', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{
        SymbolType: 'graphic',
        Configuration: {
          Left: 10,
          Top: 20,
          Width: 80,
          Height: 60,
          DirectoryKey: 'Machining',
          FileKey: 'Saw blade',
          Rotation: 45,
          Fill: '#ffffff',
        },
      }],
    });
    expect(result.elements[0]).toMatchObject({ type: IMAGE_TYPE, x: 10, y: 20, width: 80, height: 60 });
    expect((result.elements[0].properties as any).src).toMatch(/^data:image\/svg\+xml,/);
    expect((result.elements[0].properties as any).rotation).toBe(45);
  });

  it('prioriza o SVG oficial incorporado pelo proxy e remove conteudo ativo', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{
        SymbolType: 'graphic',
        Configuration: {
          Left: 0, Top: 0, Width: 40, Height: 40,
          FileKey: 'Pilot light',
          GraphicSource: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><circle cx="5" cy="5" r="5"/></svg>',
        },
      }],
    });
    const source = decodeURIComponent((result.elements[0].properties as any).src.split(',')[1]);
    expect(source).toContain('<circle');
    expect(source).not.toContain('<script');
    expect(source).not.toContain('onload=');
  });

  it('converte imagem anexada que o proxy incorporou', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{
        SymbolType: 'image',
        Configuration: {
          Left: 10, Top: 15, Width: 320, Height: 180,
          AttachmentId: 0,
          ImageData: 'data:image/png;base64,iVBORw0KGgo=',
        },
      }],
    });
    expect(result.elements[0]).toMatchObject({
      type: IMAGE_TYPE,
      x: 10,
      y: 15,
      width: 320,
      height: 180,
      properties: { src: 'data:image/png;base64,iVBORw0KGgo=', _piVisionAttachmentId: 0 },
    });
  });

  it('preserva pontos e espessura das linhas do PI Vision', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{
        SymbolType: 'line',
        Configuration: {
          Left: 5,
          Top: 7,
          Width: 100,
          Height: 50,
          Points: [{ X: 98, Y: 0 }, { X: 0, Y: 48 }],
          StrokeWidth: 3,
          Fill: '#778899',
        },
      }],
    });
    expect(result.elements[0].properties).toMatchObject({
      shape: 'line',
      strokeWidth: 3,
      points: [{ x: 98, y: 0 }, { x: 0, y: 48 }],
    });
  });

  it('mapeia escala e estilo reais do radial gauge', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{
        SymbolType: 'radialgauge',
        DataSources: ['pi:\\pims\\VELOCIDADE'],
        Configuration: {
          Left: 0, Top: 0, Width: 200, Height: 150,
          FaceAngle: 300,
          IndicatorType: 'triangle',
          IndicatorColor: '#0000ff',
          BorderColor: '#000000',
          ScaleColor: '#000000',
          ScaleLabels: 'all',
          LabelLocation: 'bottom',
          ShowUOM: true,
          ValueScaleSettings: { MinValue: 0, MaxValue: 45 },
        },
      }],
    }, 'pi-uid');
    expect(result.elements[0].properties).toMatchObject({
      minimum: 0,
      maximum: 45,
      gaugeStyle: 'triangle',
      gaugeAngle: 300,
      gaugeBorderColor: '#000000',
      gaugeScaleColor: '#000000',
      labelPosition: 'below',
      showUnit: true,
    });
  });

  it('converte multistate real do PI Vision e vincula o retangulo ao MSDataSource', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{
        SymbolType: 'rectangle',
        MSDataSources: ['pi:\\pims\\VIBRACAO'],
        Configuration: {
          Left: 10, Top: 20, Width: 100, Height: 30,
          Fill: 'rgba(255,255,255,1)',
          Multistates: [{
            LowerValue: 0,
            StateVariables: ['Fill', 'Blink'],
            States: [
              { UpperValue: 5, StateValues: ['rgba(0,255,0,1)', false] },
              { UpperValue: 7, StateValues: ['rgba(255,255,0,1)', false] },
              { UpperValue: 20, StateValues: ['rgba(255,0,0,1)', false] },
            ],
          }],
        },
      }],
    }, 'pi-uid');

    expect(result.elements[0].properties).toMatchObject({
      binding: { dataSourceUid: 'pi-uid', serverPath: 'pims', pointName: 'VIBRACAO' },
      multistate: {
        enabled: true,
        rules: [
          { operator: 'lte', value: 5, color: '#00ff00' },
          { operator: 'lte', value: 7, color: '#ffff00' },
          { operator: 'gte', value: 7, color: '#ff0000' },
        ],
      },
    });
  });

  it('converte graphic com multistate em simbolo dinamico colorizavel', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{
        SymbolType: 'graphic',
        MSDataSources: ['pi:\\pims\\ESTADO_MOTOR'],
        Configuration: {
          Left: 10, Top: 20, Width: 200, Height: 100,
          DirectoryKey: 'Motors', FileKey: 'Motor 17', Fill: '#0000ff',
          GraphicSource: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 61"><path fill="#ccc" d="M0 0h112v61H0z"/></svg>',
          Multistates: [{
            StateVariables: ['MSColor', 'MSBlink'],
            States: [
              { UpperValue: 0.5, StateValues: ['rgba(0,255,0,1)', false] },
              { UpperValue: 20, StateValues: ['rgba(255,0,0,1)', false] },
            ],
          }],
        },
      }],
    }, 'pi-uid');

    expect(result.elements[0]).toMatchObject({ type: LIBRARY_SYMBOL_TYPE });
    expect(result.elements[0].properties).toMatchObject({
      viewBox: '0 0 112 61',
      binding: { dataSourceUid: 'pi-uid', serverPath: 'pims', pointName: 'ESTADO_MOTOR' },
      multistate: { enabled: true },
    });
  });

  it('cria calculos e associa referencias calc aos Values e Trends importados', () => {
    const result = convertPiVisionDisplay({
      Name: 'Display com calculos',
      DisplayProperties: {
        Calculations: [
          {
            Name: 'calc zona 1',
            Description: 'Razao ar gas',
            Server: 'pims?server-web-id',
            Expression: "if 'VAZ_GAS'<= 0 then 0 else 'VAZ_AR' / 'VAZ_GAS'",
          },
          {
            Name: 'TV',
            Server: 'pims?server-web-id',
            Expression: "'VELOCIDADE' * 'ESPESSURA'",
          },
        ],
      },
      Symbols: [
        {
          SymbolType: 'value',
          DataSources: ['calc:TV.Value'],
          Configuration: { Left: 10, Top: 10, Width: 100, Height: 40 },
        },
        {
          SymbolType: 'trend',
          DataSources: ['calc:calc zona 1.Value', 'pi:\\pims\\TEMPERATURA'],
          Configuration: {
            Left: 10,
            Top: 60,
            Width: 400,
            Height: 200,
            TraceSettings: [{ Color: '#ff0000' }, { Color: '#00ff00' }],
          },
        },
      ],
    }, 'pi-principal');

    expect(result.calculations).toHaveLength(2);
    expect(result.calculations?.[0]).toMatchObject({
      name: 'calc zona 1',
      description: 'Razao ar gas',
      expression: 'IF(VAZ_GAS<= 0, 0, VAZ_AR / VAZ_GAS)',
      inputs: [
        { name: 'VAZ_GAS', binding: { dataSourceUid: 'pi-principal', serverPath: 'pims', pointName: 'VAZ_GAS' } },
        { name: 'VAZ_AR', binding: { dataSourceUid: 'pi-principal', serverPath: 'pims', pointName: 'VAZ_AR' } },
      ],
    });

    const calculationByName = new Map(result.calculations?.map((calculation) => [calculation.name, calculation]));
    const valueProperties = result.elements[0].properties as any;
    expect(valueProperties.calculationId).toBe(calculationByName.get('TV')?.id);
    expect(valueProperties.binding).toBeUndefined();

    const trendProperties = result.elements[1].properties as any;
    expect(trendProperties.series).toHaveLength(2);
    expect(trendProperties.series[0]).toMatchObject({
      calculationId: calculationByName.get('calc zona 1')?.id,
      legendLabel: 'calc zona 1',
      binding: { dataSourceUid: '__pims_calculation__' },
    });
    expect(trendProperties.series[1]).toMatchObject({
      binding: { dataSourceUid: 'pi-principal', serverPath: 'pims', pointName: 'TEMPERATURA' },
    });
  });

  it('conecta o estado múltiplo de uma forma a um cálculo', () => {
    const result = convertPiVisionDisplay({
      Name: 'Estado de cálculo',
      DisplayProperties: {
        Calculations: [{ Name: 'STATUS DARMA', Server: 'pims', Expression: "'TAG_STATUS'" }],
      },
      Symbols: [{
        SymbolType: 'rectangle',
        MSDataSources: ['calc:STATUS DARMA.Value'],
        Configuration: {
          Left: 10,
          Top: 10,
          Width: 30,
          Height: 20,
          Multistates: [{
            StateVariables: ['Fill', 'Blink'],
            States: [
              { StateValues: ['rgba(0,128,0,1)', false], UpperValue: 1 },
              { StateValues: ['rgba(255,0,0,1)', false], UpperValue: 2 },
            ],
          }],
        },
      }],
    }, 'pi-principal');

    const properties = result.elements[0].properties as any;
    expect(properties.calculationId).toBe(result.calculations?.[0].id);
    expect(properties.binding).toBeUndefined();
    expect(properties.multistate).toMatchObject({
      enabled: true,
      rules: [
        { operator: 'lte', value: 1, color: '#008000' },
        { operator: 'gte', value: 1, color: '#ff0000' },
      ],
    });
  });
});

describe('conversao de calculos do PI Vision', () => {
  it('traduz IF/THEN/ELSE, igualdade e operadores logicos', () => {
    expect(translatePiVisionExpression("if 'TAG_A'= 1 then 'TAG_B' else 'TAG_C' and 'TAG_D'"))
      .toBe('IF(TAG_A== 1, TAG_B, TAG_C && TAG_D)');
  });

  it('ignora calculos duplicados e entradas incompletas', () => {
    const calculations = convertPiVisionCalculations([
      { Name: 'Calc', Server: 'pims', Expression: "'A' + 'B'" },
      { Name: ' calc ', Server: 'pims', Expression: "'C'" },
      { Name: 'Sem expressão', Server: 'pims' },
    ], 'pi');
    expect(calculations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Conversao de elementos individuais
// ---------------------------------------------------------------------------

function makeDisplay(symbol: PiVisionSymbol): PiVisionDisplay {
  return { Width: 1920, Height: 1080, Symbols: [symbol] };
}

describe('conversao de Value', () => {
  const valueSymbol: PiVisionSymbol = {
    SymbolType: 'Value',
    Left: 100,
    Top: 50,
    Width: 200,
    Height: 80,
    Configuration: {
      DataSources: ['pi:\\\\SERVER\\TAG1'],
      ForeColor: '#ffcc00',
      TextSize: 20,
      Decimals: 2,
      ShowLabel: true,
      ShowUnit: true,
      ShowTimestamp: false,
      TextAlignment: 'Right',
    },
  };

  it('cria elemento do tipo value', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(valueSymbol));
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe(VALUE_TYPE);
  });

  it('preserva geometria (Left/Top/Width/Height)', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(valueSymbol));
    const el = elements[0];
    expect(el.x).toBe(100);
    expect(el.y).toBe(50);
    expect(el.width).toBe(200);
    expect(el.height).toBe(80);
  });

  it('converte binding corretamente', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(valueSymbol), 'my-uid');
    const props = elements[0].properties as any;
    expect(props.binding).toBeDefined();
    expect(props.binding.serverPath).toBe('SERVER');
    expect(props.binding.pointName).toBe('TAG1');
  });

  it('converte cor e fontSize', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(valueSymbol));
    const props = elements[0].properties as any;
    expect(props.visual.color).toBe('#ffcc00');
    expect(props.visual.fontSize).toBe(20);
  });

  it('converte decimais', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(valueSymbol));
    const props = elements[0].properties as any;
    expect(props.visual.decimals).toBe(2);
  });

  it('converte textAlign para right', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(valueSymbol));
    const props = elements[0].properties as any;
    expect(props.visual.textAlign).toBe('right');
  });

  it('converte showUnit e showTimestamp', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(valueSymbol));
    const props = elements[0].properties as any;
    expect(props.visual.showUnit).toBe(true);
    expect(props.visual.showTimestamp).toBe(false);
  });

  it('omite elemento quando DataSources esta vazio', () => {
    const sym: PiVisionSymbol = { SymbolType: 'Value', Configuration: { DataSources: [] } };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    expect(elements).toHaveLength(0);
  });

  it('converte multistate quando presente', () => {
    const sym: PiVisionSymbol = {
      ...valueSymbol,
      Multistate: {
        Triggers: [{ Expression: '< 10', ForeColor: '#ff0000' }],
      },
    };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    const props = elements[0].properties as any;
    expect(props.multistate).toBeDefined();
    expect(props.multistate.enabled).toBe(true);
    expect(props.multistate.rules).toHaveLength(1);
  });

  it('converte limites do PI Vision na cor dos valores', () => {
    const result = convertPiVisionDisplay({
      Symbols: [{
        SymbolType: 'value',
        DataSources: ['pi:\\pims\\LFS_LB2_TEMP_COMUTACAO2'],
        Configuration: {
          Left: 10,
          Top: 10,
          Width: 80,
          Height: 30,
          Multistates: [{
            StateVariables: ['Fill'],
            States: [
              { StateValues: ['rgba(255,0,0,1)'], UpperValue: 150 },
              { StateValues: ['rgba(255,255,0,1)'], UpperValue: 120 },
              { StateValues: ['rgba(0,255,0,1)'], UpperValue: 100 },
            ],
          }],
        },
      }],
    }, 'pi-uid');

    const props = result.elements[0].properties as any;
    expect(props.multistate).toMatchObject({ enabled: true, rules: [{ color: '#ff0000' }, { color: '#ffff00' }, { color: '#00ff00' }] });
    expect(props.backgroundMultistate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('conversao de Trend', () => {
  const trendSymbol: PiVisionSymbol = {
    SymbolType: 'Trend',
    Left: 0, Top: 0, Width: 800, Height: 300,
    Configuration: {
      Traces: [
        { Path: 'SERVER\\TAG_A', Color: '#6e9fff', LegendLabel: 'Serie A' },
        { Path: 'SERVER\\TAG_B', Color: '#ff9830', LegendLabel: 'Serie B' },
        { Path: 'SERVER\\TAG_C' },
      ],
    },
  };

  it('cria elemento do tipo trend', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(trendSymbol));
    expect(elements[0].type).toBe(TREND_TYPE);
  });

  it('cria 3 series para 3 traces', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(trendSymbol));
    const props = elements[0].properties as any;
    expect(props.series).toHaveLength(3);
  });

  it('preserva cores das series', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(trendSymbol));
    const props = elements[0].properties as any;
    expect(props.series[0].color).toBe('#6e9fff');
    expect(props.series[1].color).toBe('#ff9830');
  });

  it('atribui cor automatica quando trace nao tem cor', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(trendSymbol));
    const props = elements[0].properties as any;
    // Terceiro trace sem cor — deve receber uma cor do array padrao
    expect(typeof props.series[2].color).toBe('string');
    expect(props.series[2].color.startsWith('#')).toBe(true);
  });

  it('preserva legendLabel das series', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(trendSymbol));
    const props = elements[0].properties as any;
    expect(props.series[0].legendLabel).toBe('Serie A');
  });

  it('cada serie tem um binding valido', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(trendSymbol), 'uid');
    const props = elements[0].properties as any;
    for (const serie of props.series) {
      expect(isPiPointBinding(serie.binding)).toBe(true);
    }
  });

  it('omite elemento quando nenhum trace tem path valido', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'Trend',
      Configuration: { Traces: [{ Path: '' }] },
    };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    expect(elements).toHaveLength(0);
  });

  it('cria serie a partir de DataSources quando Traces e ausente', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'Trend',
      Configuration: { DataSources: ['SERVER\\TAG1', 'SERVER\\TAG2'] },
    };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    const props = elements[0].properties as any;
    expect(props.series).toHaveLength(2);
  });

  it('importa largura da legenda e elimina intersecao entre Trends da mesma linha', () => {
    const display: PiVisionDisplay = {
      Symbols: [
        {
          SymbolType: 'trend',
          DataSources: ['pi:\\SERVER\\TAG_A'],
          Configuration: {
            Left: 0,
            Top: 40,
            Width: 600,
            Height: 250,
            FontName: 'Arial',
            FontSize: 12,
            TrendConfig: { LegendWidth: 120 },
          },
        },
        {
          SymbolType: 'trend',
          DataSources: ['pi:\\SERVER\\TAG_B'],
          Configuration: { Left: 480, Top: 42, Width: 600, Height: 250 },
        },
      ],
    };

    const { elements } = convertPiVisionDisplay(display, 'pi');
    expect(elements[0]).toMatchObject({ x: 0, width: 472 });
    expect((elements[0].properties as any).visual).toMatchObject({
      fontFamily: 'Arial',
      fontSize: 12,
      legendWidth: 120,
    });
    expect(elements[0].x + elements[0].width).toBeLessThan(elements[1].x);
  });
});

// ---------------------------------------------------------------------------

describe('conversao de Gauge', () => {
  const gaugeSymbol: PiVisionSymbol = {
    SymbolType: 'Gauge',
    Left: 10, Top: 10, Width: 280, Height: 220,
    Configuration: {
      DataSources: ['SERVER\\PRESSURE'],
      MinValue: 0,
      MaxValue: 500,
      ForeColor: '#00a2e8',
    },
  };

  it('cria elemento do tipo gauge', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(gaugeSymbol));
    expect(elements[0].type).toBe(GAUGE_TYPE);
  });

  it('mapeia minimum e maximum', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(gaugeSymbol));
    const props = elements[0].properties as any;
    expect(props.minimum).toBe(0);
    expect(props.maximum).toBe(500);
  });

  it('mapeia cor', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(gaugeSymbol));
    const props = elements[0].properties as any;
    expect(props.color).toBe('#00a2e8');
  });
});

// ---------------------------------------------------------------------------

describe('conversao de Bar', () => {
  it('cria elemento do tipo bar', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'VerticalBar',
      Left: 0, Top: 0, Width: 100, Height: 300,
      Configuration: { DataSources: ['SERVER\\LEVEL'], MinValue: 0, MaxValue: 100 },
    };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    expect(elements[0].type).toBe(BAR_TYPE);
  });

  it('define orientacao vertical para VerticalBar', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'VerticalBar',
      Configuration: { DataSources: ['SERVER\\TAG'] },
    };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    const props = elements[0].properties as any;
    expect(props.orientation).toBe('vertical');
  });

  it('define orientacao horizontal para HorizontalBar', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'HorizontalBar',
      Configuration: { DataSources: ['SERVER\\TAG'] },
    };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    const props = elements[0].properties as any;
    expect(props.orientation).toBe('horizontal');
  });
});

// ---------------------------------------------------------------------------

describe('conversao de Table', () => {
  const tableSymbol: PiVisionSymbol = {
    SymbolType: 'Table',
    Left: 0, Top: 0, Width: 520, Height: 260,
    Configuration: {
      DataSources: ['SERVER\\TAG_A', 'SERVER\\TAG_B', 'SERVER\\TAG_C'],
    },
  };

  it('cria elemento do tipo table', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(tableSymbol));
    expect(elements[0].type).toBe(TABLE_TYPE);
  });

  it('cria 3 items para 3 datasources', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(tableSymbol));
    const props = elements[0].properties as any;
    expect(props.items).toHaveLength(3);
  });

  it('cada item tem binding valido', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(tableSymbol), 'uid');
    const props = elements[0].properties as any;
    for (const item of props.items) {
      expect(isPiPointBinding(item.binding)).toBe(true);
    }
  });

  it('omite elemento quando nenhum datasource e valido', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'Table',
      Configuration: { DataSources: [''] },
    };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    expect(elements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('conversao de Text', () => {
  const textSymbol: PiVisionSymbol = {
    SymbolType: 'StaticText',
    Left: 50, Top: 200, Width: 300, Height: 50,
    Configuration: {
      Content: 'Pressao do Sistema',
      ForeColor: '#ffffff',
      TextSize: 18,
      TextAlignment: 'Left',
    },
  };

  it('cria elemento do tipo text', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(textSymbol));
    expect(elements[0].type).toBe(TEXT_TYPE);
  });

  it('preserva o conteudo do texto', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(textSymbol));
    const props = elements[0].properties as any;
    expect(props.text).toBe('Pressao do Sistema');
  });

  it('decodifica entidades HTML em textos estáticos', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay({
      ...textSymbol,
      Configuration: { ...textSymbol.Configuration, Content: '&lt;= 170 &gt; 90' },
    }));
    expect((elements[0].properties as any).text).toBe('<= 170 > 90');
  });

  it('converte espaços HTML e quebras de linha do PI Vision', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay({
      ...textSymbol,
      Configuration: { ...textSymbol.Configuration, Content: '&nbsp; &nbsp; Consumo de GN&lt;br&gt;Acumulado Mês atual' },
    }));
    expect((elements[0].properties as any).text).toBe('    Consumo de GN\nAcumulado Mês atual');
  });

  it('converte cor e fontSize', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(textSymbol));
    const props = elements[0].properties as any;
    expect(props.color).toBe('#ffffff');
    expect(props.fontSize).toBe(18);
  });

  it('converte textAlign', () => {
    const { elements } = convertPiVisionDisplay(makeDisplay(textSymbol));
    const props = elements[0].properties as any;
    expect(props.textAlign).toBe('left');
  });
});

// ---------------------------------------------------------------------------

describe('conversao de Shape', () => {
  it('cria elemento do tipo rectangle para SymbolType Rectangle', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'Rectangle',
      Left: 0, Top: 0, Width: 400, Height: 200,
      Configuration: { BackColor: '#1a2b3c', ForeColor: '#aabbcc' },
    };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    expect(elements[0].type).toBe(RECTANGLE_TYPE);
    const props = elements[0].properties as any;
    expect(props.shape).toBe('rectangle');
    expect(props.fill).toBe('#1a2b3c');
    expect(props.stroke).toBe('#aabbcc');
  });

  it('cria shape ellipse para SymbolType Ellipse', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'Ellipse',
      Configuration: {},
    };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    const props = elements[0].properties as any;
    expect(props.shape).toBe('ellipse');
  });

  it('cria shape line para SymbolType Line', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'Line',
      Configuration: {},
    };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    const props = elements[0].properties as any;
    expect(props.shape).toBe('line');
  });
});

// ---------------------------------------------------------------------------

describe('simbolo desconhecido', () => {
  it('converte SymbolType desconhecido como rectangle', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'LibrarySymbol',
      Left: 0, Top: 0, Width: 100, Height: 100,
      Configuration: {},
    };
    const { elements } = convertPiVisionDisplay(makeDisplay(sym));
    expect(elements[0].type).toBe(RECTANGLE_TYPE);
  });
});

// ---------------------------------------------------------------------------

describe('ids de elementos', () => {
  it('todos os elementos tem ids unicos', () => {
    const display: PiVisionDisplay = {
      Symbols: [
        { SymbolType: 'Value', Configuration: { DataSources: ['S\\T1'] } },
        { SymbolType: 'Value', Configuration: { DataSources: ['S\\T2'] } },
        { SymbolType: 'Value', Configuration: { DataSources: ['S\\T3'] } },
      ],
    };
    const { elements } = convertPiVisionDisplay(display);
    const ids = elements.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('mapPiVisionGraphicToLocalSymbol - De-para de Motores e Conjuntos', () => {
  it('mapeia Motor 1 para Motor 01', () => {
    expect(mapPiVisionGraphicToLocalSymbol('Motors', 'Motor 1')).toEqual({
      id: 'pims-vision:motores:01',
      name: 'Motor 01',
    });
    expect(mapPiVisionGraphicToLocalSymbol('Motors', 'motor_01.svg')).toEqual({
      id: 'pims-vision:motores:01',
      name: 'Motor 01',
    });
  });

  it('mapeia Motor 2 para Motor 02', () => {
    expect(mapPiVisionGraphicToLocalSymbol('Motors', 'Motor 2')).toEqual({
      id: 'pims-vision:motores:02',
      name: 'Motor 02',
    });
    expect(mapPiVisionGraphicToLocalSymbol('Motors', 'motor-vertical')).toEqual({
      id: 'pims-vision:motores:02',
      name: 'Motor 02',
    });
  });

  it('mapeia Motor 3 para Motor 03', () => {
    expect(mapPiVisionGraphicToLocalSymbol('Motors', 'Motor 3')).toEqual({
      id: 'pims-vision:motores:03',
      name: 'Motor 03',
    });
  });

  it('mapeia Motor 4 para Motor 04', () => {
    expect(mapPiVisionGraphicToLocalSymbol('Motors', 'Motor 4')).toEqual({
      id: 'pims-vision:motores:04',
      name: 'Motor 04',
    });
  });

  it('mapeia Motor 5 para Bomba 01 (conjunto motor-bomba centrífuga)', () => {
    expect(mapPiVisionGraphicToLocalSymbol('Motors', 'Motor 5')).toEqual({
      id: 'pims-vision:bombas:01',
      name: 'Bomba 01',
    });
  });

  it('mapeia Motor 6 para Bomba 02 (conjunto motor-bomba inline/deslocamento)', () => {
    expect(mapPiVisionGraphicToLocalSymbol('Motors', 'Motor 6')).toEqual({
      id: 'pims-vision:bombas:02',
      name: 'Bomba 02',
    });
  });
});

describe('Multistate Blink e Background na conversão PI Vision', () => {
  it('converte triggers com flag de piscar (Blink) no multistate', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'Value',
      Configuration: {
        DataSources: ['pi:\\\\SERVER\\TAG_TEMP'],
      },
      Multistate: {
        Triggers: [
          { Expression: '< 20', ForeColor: '#00ff00', Blink: false },
          { Expression: '>= 80', ForeColor: '#ff0000', Blink: true },
        ],
      },
    };

    const { elements } = convertPiVisionDisplay({ Symbols: [sym] });
    const props = elements[0].properties as any;
    expect(props.multistate?.enabled).toBe(true);
    expect(props.multistate?.rules[0].blink).toBeUndefined();
    expect(props.multistate?.rules[1].blink).toBe(true);
  });

  it('converte triggers com BackColor para backgroundMultistate', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'Value',
      Configuration: {
        DataSources: ['pi:\\\\SERVER\\TAG_PRESS'],
      },
      Multistate: {
        Triggers: [
          { Expression: '< 50', ForeColor: '#ffffff', BackColor: '#008000' },
          { Expression: '>= 50', ForeColor: '#ffffff', BackColor: '#ff0000', Blink: true },
        ],
      },
    };

    const { elements } = convertPiVisionDisplay({ Symbols: [sym] });
    const props = elements[0].properties as any;
    expect(props.multistate?.enabled).toBe(true);
    expect(props.backgroundMultistate?.enabled).toBe(true);
    expect(props.backgroundMultistate?.rules[1].blink).toBe(true);
    expect(props.backgroundMultistate?.rules[1].color).toBe('#ff0000');
  });

  it('converte multistate com array Blink no nível raiz do Multistate ou States', () => {
    const sym: PiVisionSymbol = {
      SymbolType: 'Value',
      Configuration: {
        DataSources: ['pi:\\\\SERVER\\TEMPERATURA_MANCAL_D'],
      },
      Multistate: {
        Triggers: [
          { Expression: '<= 70', ForeColor: '#00ff00' },
          { Expression: '<= 80', ForeColor: '#ffff00' },
          { Expression: '>= 80', ForeColor: '#ff0000' },
        ],
        Blink: [false, false, true],
      },
    };

    const { elements } = convertPiVisionDisplay({ Symbols: [sym] });
    const props = elements[0].properties as any;
    expect(props.multistate?.enabled).toBe(true);
    expect(props.multistate?.rules[0].blink).toBeUndefined();
    expect(props.multistate?.rules[1].blink).toBeUndefined();
    expect(props.multistate?.rules[2].blink).toBe(true);
  });
});
