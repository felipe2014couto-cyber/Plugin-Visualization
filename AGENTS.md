# AGENTS.md

Instrucoes para agentes de IA e desenvolvedores que trabalhem neste projeto.

## Identidade do projeto

- Tipo: Grafana App Plugin.
- Nome: PIMS Vision.
- ID: `pims-vision-app`.
- Compatibilidade minima: Grafana 9.3.16.
- Compatibilidade maxima testada em build: Grafana 12.0.0.
- Sem backend nesta fase.

## Package manager

- Usar exclusivamente **npm**.
- Nao usar yarn nem pnpm.
- Manter `package-lock.json` versionado.
- Node.js alvo: 20.x (engines em `package.json`).

## Compatibilidade com Grafana

- A versao declarada em `src/plugin.json` e `dependencies.grafanaDependency = ">=9.3.16"`.
- As dependencias `@grafana/data`, `@grafana/runtime`, `@grafana/ui` e `@grafana/schema`
  estao fixadas em `9.3.16` (a baseline declarada) para evitar dependencia
  acidental de APIs adicionadas em Grafana 10/11/12.
- `react` e `react-dom` estao fixados em `17.0.2` para casar com a versao
  utilizada pelo Grafana 9.3.16 (peerDependency declarada em
  `@grafana/runtime@9.3.16`).
- Toda nova dependencia deve ser avaliada quanto a compatibilidade com
  Grafana 9.3.16 antes de ser adicionada.

## Comandos

Comandos efetivamente disponiveis em `package.json` (nao inventar outros):

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
| Servidor Grafana local via Docker | `npm run server` |

## Regras de escopo

- Nao modificar codigo fora do escopo solicitado.
- Nao realizar refatoracoes oportunistas.
- Nao adicionar dependencias sem necessidade real.
- Nao usar bibliotecas de canvas, drag-and-drop, grid, charting ou
  state management enquanto nao houver uma Sprint que as solicite.
- Nao introduzir Grafana Scenes, React Query, Zustand, Redux.
- Nao usar Konva, Fabric, PixiJS, D3, Plotly ou ECharts.
- Nao usar emojis em codigo ou arquivos tecnicos.
- Preservar a compatibilidade declarada com Grafana 9.3.16+.

## Estrutura relevante

```
src/
  components/App/App.tsx    - raiz do App Plugin
  module.ts                 - instancia de AppPlugin
  plugin.json               - manifesto do plugin
  constants.ts              - URL base do plugin
.config/                    - configuracoes geradas pelo scaffold
provisioning/               - arquivos de provisioning do Grafana
docker-compose.yaml         - dev environment via Docker
```

## Status

- Sprint 01 concluida: fundacao do plugin.
- Nenhuma funcionalidade de negocio implementada.
