# PIMS Vision

PIMS Vision é um Grafana App Plugin para criação e operação de displays industriais, consulta de dados PI e edição de planilhas integradas ao Grafana.

## Identificação

| Item | Valor |
| --- | --- |
| Nome do plugin | PIMS Vision / Visualization |
| ID | `pims-vision-app` |
| Tipo | Grafana App Plugin |
| Backend próprio | Não |
| Grafana mínimo | `9.3.16` |
| Grafana máximo usado nos builds locais | `12.0.0` |
| Node.js | `20.x` |
| Package manager | npm |
| Versão do pacote | `0.1.0` |
| Versão do manifesto | `0.1.1` |

## Funcionalidades atuais

### Editor de displays

- Criação e edição de displays industriais.
- Elementos de texto, imagem, retângulo, valor, barra, tabela, tendência e símbolos da biblioteca.
- Posicionamento, dimensionamento e configuração visual dos elementos.
- Associação de elementos a PI Points.
- Regras multistate para alterar a apresentação conforme o valor recebido.
- Histórico local de edição com desfazer e refazer.
- Exportação e importação de displays.
- Exportação de dados em CSV e XML.

### Integração PI

- Descoberta do datasource PI configurado no Grafana.
- Pesquisa de PI Points.
- Consulta de valor atual.
- Consulta de dados gravados e interpolados.
- Carregamento progressivo de tendências.
- Associação de PI Points por seleção e arraste.

### Mini-Sheets

- Planilha integrada com seleção de células e intervalos.
- Edição direta, barra de fórmulas, formatação e redimensionamento de colunas.
- Seleções múltiplas, copiar/colar, preenchimento automático e histórico de edição.
- Fórmulas matemáticas e agregações como `SUM`, `AVERAGE`, `MIN` e `MAX`.
- Funções PI DataLink:
  - `PICurrVal`
  - `PIArcVal`
  - `PICompDat`
  - `PISampDat`
  - `PITimeDat`
  - `PIAdvCalcVal`
  - `PITimeFilter`
- Preenchimento expandido de resultados tabulares e tratamento de conflitos de spill.
- Seleção de referências diretamente no Sheets: primeiro o usuário ativa o campo do formulário e depois seleciona a célula ou o intervalo desejado.

### Cálculos

- Cadastro e edição de cálculos baseados em PI Points.
- Uso de cálculos como ativos do display.
- Séries de cálculo em tendências.

## Arquitetura

```text
src/
  components/
    App/              Raiz e navegação do App Plugin
    Calculations/     Interface de cálculos
    Library/          Biblioteca de ativos industriais
    MiniSheets/       Planilha e funções PI DataLink
    TimeRangeBar/     Seleção do intervalo de tempo
  calculations/      Modelo e motor de cálculos
  display/            Documento, elementos e runtime do editor visual
  grafana/            Integrações específicas com serviços do Grafana
  library/            Catálogos e carregamento dos símbolos
  pi/                 Datasource, bindings e consultas PI
  time/               Funções relacionadas a tempo
  module.ts           Registro do AppPlugin
  plugin.json         Manifesto do plugin
dist/                 Artefato gerado pelo build
provisioning/         Provisionamento para ambiente Grafana
docs/                 Documentação complementar
```

O frontend utiliza React 17, TypeScript, Emotion e as bibliotecas do Grafana fixadas na baseline `9.3.16`. APIs exclusivas de versões mais novas do Grafana não devem ser introduzidas sem uma decisão explícita de compatibilidade.

## Preparação do ambiente

Use Node.js 20 e npm:

```bash
nvm use
npm ci
```

Não use yarn ou pnpm. O arquivo `package-lock.json` deve permanecer versionado.

## Comandos disponíveis

| Finalidade | Comando |
| --- | --- |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Lint com correção | `npm run lint:fix` |
| Testes em watch | `npm run test` |
| Testes de CI | `npm run test:ci` |
| Build de produção | `npm run build` |
| Build em watch | `npm run dev` |
| Grafana via Docker | `npm run server` |
| Assinatura do plugin | `npm run sign` |

Fluxo de validação recomendado:

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

## Execução no Grafana

### Grafana nativo

Gere o build:

```bash
npm run build
```

Publique o conteúdo de `dist/` no diretório configurado para plugins. Em uma instalação padrão:

```bash
sudo cp -a dist/. /var/lib/grafana/plugins/pims-vision-app/
```

O usuário do serviço Grafana deve conseguir ler os arquivos. Depois da atualização, reinicie a instância nativa conforme o gerenciador usado no ambiente e recarregue o navegador sem cache.

Como o plugin ainda pode estar sem assinatura, o Grafana de desenvolvimento deve permitir explicitamente o ID `pims-vision-app`. Consulte [docs/DEPLOYMENT_PLAN.md](docs/DEPLOYMENT_PLAN.md) para o processo completo de implantação, validação e rollback.

### Docker

O ambiente versionado usa Grafana 12.0.0 e monta `dist/` como diretório do plugin:

```bash
npm run build
npm run server
```

Por padrão, o Grafana fica disponível em `http://localhost:3000`.

## Testes

Os testes usam Jest e Testing Library. As suítes ficam próximas aos módulos ou em diretórios `__tests__`.

Áreas cobertas incluem:

- documento e operações do editor visual;
- runtime de valores e tendências;
- integração e parsing das funções PI;
- seleção, fórmulas, histórico e operações do Mini-Sheets;
- cálculos, biblioteca e utilitários de tempo.

## Regras de contribuição

- Preservar compatibilidade com Grafana `9.3.16+`.
- Usar somente npm.
- Não adicionar dependências sem necessidade real e validação de compatibilidade.
- Não introduzir bibliotecas de canvas, grid, gráficos ou gerenciamento de estado fora de uma demanda planejada.
- Não usar Grafana Scenes, React Query, Zustand, Redux, Konva, Fabric, PixiJS, D3, Plotly ou ECharts neste estágio.
- Evitar refatorações fora do escopo da alteração.
- Não versionar credenciais, tokens, senhas ou chaves privadas.
- Executar typecheck, lint e testes proporcionais ao risco antes de publicar.

## Documentação relacionada

- [Plano de implantação](docs/DEPLOYMENT_PLAN.md)
- [Instruções para agentes e desenvolvedores](AGENTS.md)
- [Licenças de terceiros](THIRD_PARTY_LICENSES.md)
- [Changelog](CHANGELOG.md)

## Licença

Apache License 2.0. Consulte [LICENSE](LICENSE).
