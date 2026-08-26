import {
  convertPiVisionDisplay,
  convertMultistate,
  parseDataSourcePath,
  PI_VISION_IMPORT_DATASOURCE_UID_PLACEHOLDER,
  PiVisionConvertError,
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
