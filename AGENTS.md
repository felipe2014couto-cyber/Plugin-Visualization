# AGENTS.md

Instrucoes para agentes de IA e desenvolvedores que trabalhem neste projeto.

## Identidade do projeto

- Tipo: Grafana App Plugin.
- Nome: PIMS Vision.
- ID: `pims-vision-app` (declarado em `src/plugin.json` e usado em `docker-compose.yaml`).
- Versao atual: `0.1.9` (`package.json`, `src/plugin.json`).
- Grafana minimo suportado: `9.3.16` (declarado em `src/plugin.json`).
- Grafana usado no build Docker local: `12.0.0` (`docker-compose.yaml`).
- O sistema em producao e composto por tres servicos coordenados:
  1. Frontend App Plugin (Grafana, porta 3000) - este repositorio, build em `dist/`.
  2. `pi-vision-proxy.js` - proxy Node.js standalone (porta 3001) que faz NTLM
     contra o PI Vision e bypassa CORS. Carrega credenciais de `.env`.
     Nao faz parte dos scripts npm; e executado diretamente
     (`node pi-vision-proxy.js`) ou via unit systemd em producao.
  3. `backend-python/` - API FastAPI standalone (porta 8085) para SQL
     read-only contra Oracle/SIP. Tem `requirements.txt`, `.env.example` e
     `test_security.py` proprios. Documentado em
     `docs/SIP_SECURITY.md` e `docs/SIP_SECURITY_BACKEND_REQUIREMENTS.md`.

Descricoes funcionais vivem em `PROJECT.md`; este arquivo foca em regras
que agentes costumam violar sem contexto.

## Package manager e ambiente

- Usar exclusivamente **npm**. Nunca rodar `yarn` ou `pnpm`.
- Em CI e em qualquer setup novo usar `npm ci` (nao `npm install`) para
  respeitar `package-lock.json`.
- Manter `package-lock.json` versionado.
- Node.js alvo: `20.x` (fixado em `.nvmrc` e `engines.node`).
- O arquivo `.env` na raiz contem credenciais reais do PI Vision e **esta
  no `.gitignore`**; nunca versionar credenciais reais, nunca commitar
  `.env`, e nunca copiar valores deste `.env` para novos arquivos
  versionados. Usar `.env.example` como modelo.

## Compatibilidade com Grafana

- A baseline declarada em `src/plugin.json` e
  `dependencies.grafanaDependency = ">=9.3.16"`.
- `@grafana/data`, `@grafana/runtime`, `@grafana/ui` e `@grafana/schema`
  estao fixados em `9.3.16` para evitar dependencia acidental de APIs
  adicionadas em Grafana 10/11/12. Manter esse pining.
- `react` e `react-dom` estao em `17.0.2` para casar com a peerDependency
  declarada por `@grafana/runtime@9.3.16`.
- Toda nova dependencia precisa ser avaliada quanto a compatibilidade com
  Grafana 9.3.16 antes de ser adicionada.
- `.cprc.json` define `bundleGrafanaUI: false` (Grafana UI vem do host em
  runtime, nao do bundle) e `useReactRouterV6: true` - nao trocar.
- CI roda `npx @grafana/levitate is-compatible --path src/module.ts
  --target @grafana/data,@grafana/ui,@grafana/runtime` em todo PR
  (`.github/workflows/is-compatible.yml`); manter `src/module.ts` como
  unico entrypoint do plugin.

## Comandos

Comandos declarados em `package.json` (nao inventar outros):

| Finalidade | Comando |
| --- | --- |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Lint com correcao | `npm run lint:fix` |
| Testes unitarios (watch) | `npm run test` |
| Testes unitarios (CI) | `npm run test:ci` |
| Build de producao | `npm run build` |
| Build em watch | `npm run dev` |
| Assinar plugin | `npm run sign` |
| Grafana local via Docker | `npm run server` |

Fluxo de validacao reproduzido por `.github/workflows/ci.yml`:

```
npm ci
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

Gotchas:

- O lint global tem violacoes preexistentes em codigo legado
  (registradas em `QA_LOAD_TEST.md`). Tratar como divida tecnica
  separada; nao "resolver" com disables em massa em PRs novos.
- `npm run test` abre Jest em watch com `--onlyChanged`; em CI e em
  loops automatizados usar sempre `npm run test:ci`.
- `npm run server` faz `docker-compose up --build` e monta `./dist` no
  container, entao exige `npm run build` previo para carregar alteracoes
  no frontend.

## Estrutura relevante

```
src/
  module.ts                       entrypoint do plugin (registrado por AppPlugin)
  plugin.json                     manifesto
  constants.ts                    PLUGIN_BASE_URL / PLUGIN_ASSET_BASE_URL
  polyfills.ts                    polyfill de window.caches para HTTP nao-HTTPS
  components/App/App.tsx          raiz React, roteamento, auth gate, dashboards
  components/MiniSheets/          planilha + funcoes PI DataLink
  components/Calculations/        UI e motor de calculos
  components/Library/             biblioteca de simbolos industriais
  components/SqlQuery/            UI SQL + SqlChartRender (usa recharts)
  components/TimeRangeBar/        selecao de intervalo de tempo
  display/                        documento, elementos, runtime, multistate,
                                 conversor PI Vision, export CSV/XML
  pi/                             datasource, bindings, tendencias, cache
  calculations/                   motor de calculos
  grafana/                        dashboardPersistence (carrega/salva displays)
  library/                        catalogos e simbolos
  time/                           utilidades de tempo
  programming/                    modulo Programming (HTML/CSS/JS + PI query)
  img/                            logos
.config/                          config do scaffold (jest, eslint, prettier,
                                 tsconfig, webpack, Dockerfile, supervisord)
provisioning/plugins/apps.yaml    provisioning do Grafana para o plugin
docker-compose.yaml               Grafana 12.0.0 montando ./dist
pi-vision-proxy.js                proxy Node para PI Vision (NTLM/CORS)
backend-python/                   API FastAPI SIP/Oracle (ver docs/SIP_SECURITY.md)
scripts/                          scripts de deploy, migracao e importacao de
                                 ativos (nao fazem parte do build do frontend)
docs/                             DEPLOYMENT_PLAN, SIP_SECURITY,
                                 SIP_SECURITY_BACKEND_REQUIREMENTS
```

## Regras de escopo

- Nao modificar codigo fora do escopo solicitado.
- Nao realizar refatoracoes oportunistas.
- Nao adicionar dependencias sem necessidade real e sem validacao de
  compatibilidade com Grafana 9.3.16.
- `recharts` ja esta em uso por `src/components/SqlQuery/SqlChartRender.tsx`
  e esta versionado em `dependencies`. Outras bibliotecas de canvas,
  drag-and-drop, grid, charting ou state management nao devem ser
  introduzidas fora de uma Sprint que as solicite.
- Nao introduzir Grafana Scenes, React Query, Zustand, Redux.
- Nao usar Konva, Fabric, PixiJS, D3, Plotly ou ECharts.
- Nao usar emojis em codigo ou arquivos tecnicos.
- Preservar a compatibilidade declarada com Grafana 9.3.16+.
- Toda alteracao deve passar por `typecheck`, `lint`, `test:ci` e
  `build` antes de ser considera pronta; em alteracoes com risco
  visual, validar tambem o editor abrindo o Docker local.

## Onde estao os detalhes que costumam confundir

- Identidade do plugin e comandos: este arquivo.
- Comandos de implantacao, systemd, hosts, thick mode do Oracle:
  `docs/DEPLOYMENT_PLAN.md`.
- Requisitos de seguranca do backend SIP/Oracle (limits, cookies,
  politica read-only): `docs/SIP_SECURITY.md` e
  `docs/SIP_SECURITY_BACKEND_REQUIREMENTS.md`.
- Estado do produto, funcionalidades atuais, validacao de QA com 100
  clientes: `PROJECT.md`, `QA_LOAD_TEST.md`, `CHANGELOG.md`.
