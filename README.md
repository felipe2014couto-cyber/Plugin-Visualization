# PIMS Vision

App Plugin para criacao futura de displays industriais no Grafana.

## Objetivo

Editor proprio de displays industriais integrado ao Grafana, inspirado no
fluxo de trabalho do PI Vision, porem implementado a partir de APIs publicas
e suportadas do Grafana.

## Compatibilidade

- Grafana 9.3.16 ou superior (build validado localmente em Grafana 12.0.0).
- React 17.0.2 (alinhado a versao utilizada pelo Grafana 9.3.16).

## Status

Em desenvolvimento.

Sprint 01 concluiu apenas a fundacao do App Plugin: estrutura React + TypeScript,
manifesto `plugin.json` valido, pagina inicial minima e build de producao
funcionando. Nenhuma funcionalidade de negocio foi implementada.

## Comandos

| Finalidade | Comando |
| --- | --- |
| Instalar dependencias | `npm install` |
| Build de producao | `npm run build` |
| Build em watch | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Testes | `npm run test:ci` |
| Servidor Grafana local (Docker) | `npm run server` |

## Identidade do plugin

- name: `PIMS Vision`
- id: `pims-vision-app`
- type: `app`
- grafanaDependency: `>=9.3.16`
