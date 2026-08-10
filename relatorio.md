# Relatório de validação — drop real de PI Point em Trend

Data: 10/08/2026

## Causa comprovada

O arraste da lista usa **HTML5 Drag and Drop**:

`PiPointSearch.onDragStart` → `DisplayEditor.onDragOver` → `DisplayEditor.onDrop`.

No navegador, o alvo de `dragover` e `drop` é um nó interno do SVG da Trend (por exemplo, o `rect` de fundo ou da área de plotagem), não o contêiner do editor. Os testes anteriores disparavam esses eventos diretamente no contêiner. A resolução do alvo dependia de `document.elementFromPoint` e de conversão de coordenadas; se uma dessas alternativas não resolvesse a Trend no drop, o fluxo não alcançava `addTrendSeries`.

## Correção aplicada

Em `DisplayEditor`, a resolução agora usa, nesta ordem:

1. `event.target.closest('[data-element-id][data-element-type="trend"]')`;
2. `document.elementFromPoint(clientX, clientY)`;
3. coordenadas convertidas para a superfície SVG.

Assim, o próprio nó que recebeu o `drop` identifica a Trend correta e é convertido para o elemento atual do `DisplayDocument`. O fluxo existente continua chamando `addTrendSeries`, que preserva séries, identidade completa, duplicação, histórico e renderização.

O drop em área vazia continua seguindo o caminho existente de criação de uma nova Trend. Não foram alterados batching, cache, datasource, Value, Gauge, Bar, Docker, porta 3000 ou provisionamento.

## Teste que reproduz o fluxo do navegador

Foi adicionado um teste de integração que:

1. pesquisa a tag na lista real de PI Points;
2. dispara `dragstart` no resultado da lista, preservando o `DataTransfer` configurado pelo componente;
3. dispara `dragover` e `drop` sobre o `rect` SVG interno da Trend;
4. faz `document.elementFromPoint` retornar `null`, comprovando que a identificação vem do alvo real do evento;
5. confirma que a prévia aparece e desaparece;
6. confirma `elements.length === 1`;
7. confirma as séries `EXISTING` e `SINUSOID` na mesma Trend.

Também permanecem cobertos: três séries no mesmo gráfico, tags duplicadas, mesma tag em datasource diferente, undo, redo, área vazia, seleção, resize e drag de elementos.

## Validação executada

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Aprovado |
| `npm run lint` | Aprovado |
| `npm run test:ci` | Aprovado: 37 suítes, 252 testes |
| `npm run build` | Aprovado: `compiled successfully` |
| `git diff --check` | Aprovado, sem saída |

Estado do repositório: branch `main`, com alterações preexistentes preservadas. O `git diff --stat` final reportou 24 arquivos modificados, 2408 inserções e 411 remoções; a correção direcionada está restrita a `DisplayEditor.tsx` e `piPointDrop.integration.test.tsx`.

## Validação no navegador

Não há automação de navegador instalada no ambiente, portanto a aceitação visual no Grafana ainda requer validação manual.

Roteiro:

1. Recarregue o plugin com `Ctrl+Shift+R`.
2. Crie uma Trend com `SINUSOID`.
3. Arraste `RED_AF1_AF2_SOMA_DIA` e solte sobre a área da curva ou o fundo do gráfico.
4. Confirme duas entradas na legenda e duas curvas; não deve surgir uma Trend externa.
5. Use Undo e Redo para remover e restaurar somente a segunda série.
