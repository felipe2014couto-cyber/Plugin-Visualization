# Relatório - Conexão e distribuição de dados

## 1. Objetivo

O trabalho integrou duas evoluções relacionadas:

- reduzir a latência e a quantidade de chamadas ao datasource OSIsoft-PI ao adicionar várias tags e ao navegar no tempo;
- permitir que uma Trend contenha várias séries adicionadas por drag and drop, sem substituir as séries anteriores.

O fluxo de comunicação preservado é:

```text
PIMS Vision
-> API oficial de datasource do Grafana
-> datasource OSIsoft-PI
-> PI Web API
-> PI System
```

Não foi adicionada chamada HTTP direta ao PI Web API.

## 2. Estado inicial do repositório

- Branch: `main`.
- O worktree já estava modificado antes desta execução.
- Estado inicial: 16 arquivos modificados, com `1163 insertions(+), 214 deletions(-)` no `git diff --stat`.
- As alterações iniciais estavam concentradas no App, runtimes de Value/Trend, datasource PI, loader progressivo e testes relacionados.
- Nenhuma alteração preexistente foi descartada, revertida ou sobrescrita fora do escopo.

## 3. Baseline anterior à implementação

Resultados reais executados antes da primeira edição desta execução:

```text
npm run typecheck: sucesso
npm run lint: sucesso
npm run test:ci: 37 suítes, 227 testes, todos aprovados
npm run build: sucesso
```

O baseline de testes emitia avisos React sobre atualizações fora de `act(...)` em algumas suítes, mas não havia falha. Depois dos ajustes de timers nos testes modificados, a execução final não exibiu esses avisos.

## 4. Fluxo anterior dos dados

O fluxo anterior, confirmado no código de `HEAD`, era:

```text
drop de tag
-> criação de elemento com properties.binding
-> DisplaySurface cria um consumidor por elemento
-> ValueRuntime ou TrendRuntime
-> função de carregamento do App
-> piDataSource
-> getDataSourceSrv().get({ uid, type })
-> datasource.query(request)
-> normalização do DataFrame
-> estado do runtime
-> renderer SVG
```

Para Trends, o App usava `progressiveTrendLoader`, mas o loader anterior iterava os bindings com `Promise.all(bindings.map(...))` e chamava a função de consulta uma vez para cada binding e para cada fase. O refinamento iniciado em segundo plano também não era publicado de volta ao runtime pelo código anterior.

## 5. Diagnóstico da lentidão

As causas encontradas foram:

1. O loader progressivo anterior quebrava o conjunto de bindings em consultas unitárias. Assim, N séries geravam N chamadas de preview e N chamadas de refinamento.
2. O runtime anterior iniciava a leitura imediatamente a cada mudança de consumidores, sem janela fixa para absorver várias inclusões próximas.
3. A quantidade refinada anterior podia chegar a 30.000 Recorded Values por tag e não era limitada pela largura visual.
4. A prévia usava intervalo fixo de cinco minutos; portanto, o volume podia crescer com o período.
5. O cache histórico anterior não tinha expiração e podia impedir revalidação periódica da mesma janela.

Uma tag isolada já era rápida porque o custo de fan-out e a disputa entre gerações só se tornavam visíveis com várias inclusões.

## 6. Causa do loading infinito

A causa principal foi confirmada no `TrendRuntime` anterior:

- qualquer mudança de consumidores incrementava uma geração global;
- se uma tag fosse adicionada enquanto uma consulta estava ativa, a resposta do lote ativo era descartada por diferença de geração;
- `tick()` não abria uma segunda consulta enquanto `inFlight` fosse verdadeiro;
- a tag nova precisava aguardar o scheduler de cinco segundos;
- novas inclusões durante esse ciclo podiam invalidar novamente a geração.

Além disso, uma falha inicial podia manter a série em `loading` por até 90 segundos. Esse estado de tolerância foi removido: ausência de resposta ou erro agora finaliza o loading somente do consumidor afetado, preservando dados anteriores quando existirem.

## 7. Contrato anterior da Trend

O contrato anterior era de uma única série:

```text
trend.properties.binding: PiPointBinding
```

O `DisplaySurface`, o `TrendRuntime` e o `TrendElementView` liam apenas esse binding. O renderer aceitava somente um estado e desenhava um único path.

## 8. Arquitetura implementada

O fluxo final é:

```text
Value/Gauge/Bar ou séries de Trend
-> scheduler compartilhado do contrato correspondente
-> micro-batch fixo
-> deduplicação por identidade completa
-> piDataSource
-> divisão por datasource, modo e tamanho máximo
-> datasource.query() com múltiplos targets
-> associação por refId
-> distribuição por binding e por consumidor
```

Current Values e históricos continuam em filas distintas porque possuem contratos incompatíveis. Não foi criado um coordenador concorrente para o mesmo contrato: Value, Gauge e Bar compartilham o `ValueRuntime`; todas as Trends e suas séries compartilham o `TrendRuntime`; ambos convergem na mesma política de lote e na camada central `piDataSource`.

## 9. Coordenador central e micro-batch

Política final:

- `DATA_QUERY_BATCH_WINDOW_MS = 40`;
- `DATA_QUERY_MAX_TARGETS = 20`;
- `DATA_QUERY_MAX_CONCURRENT_BATCHES = 2`.

A janela é fixa, não é um debounce reiniciável. Uma solicitação recebida durante um lote ativo entra na fila seguinte e é executada imediatamente após o lote ativo, sem aguardar o refresh periódico.

Os timers de micro-batch e refresh são únicos por runtime e são limpos quando não existem consumidores ou no unmount.

## 10. Critérios de agrupamento

O agrupamento efetivo respeita:

- datasource UID;
- contrato de Current Value ou contrato histórico;
- modo histórico (`preview`, Plot/refinamento ou `recorded`);
- início e fim da janela;
- `maxDataPoints` da fase.

Como `maxDataPoints` é global no `DataQueryRequest`, o runtime usa a maior largura necessária entre os consumidores do lote, limitada pelo teto seguro. Datasources diferentes, Current Values e históricos, previews e refinamentos nunca são enviados na mesma chamada.

## 11. Identidade e deduplicação

A identidade do binding é:

```text
dataSourceUid + NUL + serverPath + NUL + pointName
```

Para histórico, a identidade de cache também inclui:

```text
from + to + maxDataPoints + fase
```

Bindings idênticos compartilham aquisição, mas cada consumidor mantém estado próprio. Tags com mesmo nome em datasource ou servidor diferente permanecem distintas. Promises em andamento são removidas no `finally`; falhas não ficam permanentemente em cache.

## 12. Associação dos DataFrames por refId

Cada chamada gera `refId` alfabético exclusivo dentro do request (`A` até `T` no lote máximo de 20). A normalização cria um mapa por `frame.refId` e só usa fallback posicional no caso legado seguro de um target e um frame.

Foram testados:

- DataFrames fora de ordem;
- resposta parcial;
- ausência de DataFrame;
- série vazia;
- valor numérico zero;
- timestamp numérico;
- qualidade disponível;
- PI Point digital/textual;
- erro associado a um `refId`.

## 13. Cache de valores atuais

Política final do cache em memória:

- `CURRENT_VALUE_CACHE_TTL_MS = 4000`;
- `CURRENT_VALUE_CACHE_MAX_ENTRIES = 256`;
- remoção LRU previsível;
- valor recente exibido imediatamente;
- revalidação em segundo plano após a janela de 40 ms;
- erros não ficam em cache;
- valor `0` é válido.

O cache não é persistido no documento do display.

## 14. Preview e refinamento das Trends

A carga possui duas fases:

1. preview da janela completa com no máximo 250 pontos por série;
2. refinamento em segundo plano por Plot, limitado pela largura.

Todas as séries compatíveis participam da mesma chamada em cada fase. O preview é publicado primeiro. O refinamento substitui somente a série correspondente. Se o refinamento falhar, o preview permanece visível e somente a série afetada recebe estado de erro.

O cache histórico possui TTL de 4.000 ms e máximo de 128 entradas. Isso deduplica chamadas idênticas próximas sem bloquear o refresh de cinco segundos.

## 15. Quantidade adaptativa de pontos

Política final:

```text
TREND_POINTS_PER_PIXEL = 1.5
TREND_MIN_DATA_POINTS = 100
TREND_MAX_DATA_POINTS = 2000
TREND_PREVIEW_MAX_DATA_POINTS = 250
```

Exemplos:

- Trend de 520 px: 780 pontos refinados;
- Trend de 800 px: 1.200 pontos refinados;
- Trend muito larga: máximo de 2.000 pontos.

O `interval` e o `intervalMs` da requisição histórica são calculados pela duração dividida pela resolução. Assim, aumentar o período aumenta o intervalo representado por ponto, não o limite de pontos recebido pelo navegador.

## 16. Navegação temporal

Ao trocar a janela:

- os estados anteriores das séries inalteradas permanecem visíveis;
- a nova janela recebe preview de 250 pontos;
- o refinamento usa a mesma quantidade derivada da largura;
- o generation ID é por binding/request, não global para todas as Trends;
- respostas com `refreshKey` antigo são ignoradas;
- um refinamento antigo da mesma janela também é ignorado se uma consulta mais nova já começou.

Testes com 8 horas, 24 horas e 7 dias confirmaram `maxDataPoints = 1200` constante no cenário de 800 px.

## 17. Várias tags na mesma Trend

Contrato final:

```text
trend.properties.series: Array<{
  binding: PiPointBinding;
  color: string;
}>
```

Comportamento implementado:

- drop em área vazia cria uma nova Trend;
- drop sobre a Trend visual superior adiciona uma série;
- a ordem de adição é preservada;
- as séries anteriores não são substituídas;
- a identidade completa impede duplicação;
- o mesmo nome em outro datasource ou servidor é aceito;
- cada série recebe cor persistida de uma paleta de 20 cores;
- as séries participam juntas de preview, refinamento, refresh e navegação;
- falha ou ausência de dados em uma série não remove as demais;
- legenda e cursor identificam todas as séries e valores disponíveis.

Não existia remoção individual de série na interface. Nenhum botão ou fluxo visual novo de remoção foi criado.

## 18. Persistência e compatibilidade

Documentos novos são salvos somente com `properties.series`. Documentos antigos com `properties.binding` são aceitos e normalizados automaticamente para uma série com a primeira cor da paleta.

A serialização continua usando o envelope existente e o mesmo `DisplayDocument`. IDs, geometria e propriedades não relacionadas são preservados. Não existe migração manual nem segunda fonte de persistência.

O round-trip exportar/importar com várias séries e a leitura de documento legado foram testados.

## 19. Integração com undo e redo

A inclusão de série chama o mesmo `commitDocument` usado pelas demais edições. Portanto:

- um drop válido cria uma única entrada no histórico;
- undo remove somente a última série adicionada;
- redo restaura somente essa série;
- drop duplicado não altera o documento nem cria entrada adicional.

Esse comportamento foi coberto por teste de integração.

## 20. Concorrência e ciclo de vida

- Cada série usa `consumerId` derivado de elemento + identidade completa do binding.
- O estado, erro e loading são independentes por série.
- O runtime mantém sequência mais recente por binding para rejeitar refinamentos obsoletos.
- Uma troca de período não invalida Trends não relacionadas por geração global.
- Remover consumidor não cancela a chamada compartilhada dos demais.
- O lote do datasource possui no máximo 20 targets e duas chamadas concorrentes.
- Timers e filas são limpos no stop/unmount.
- A fila é retomada no `finally`, inclusive depois de erro.

## 21. Refresh periódico

O intervalo de cinco segundos foi preservado. O refresh:

- deduplica bindings iguais;
- consulta todos os consumidores ativos em lote;
- mantém dados anteriores durante atualização;
- não cria `setInterval` por elemento;
- não sobrepõe uma aquisição equivalente ativa;
- revalida o cache histórico porque o TTL é menor que o refresh;
- aplica sucesso, ausência ou erro por consumidor.

## 22. Quantidade de chamadas antes e depois

As contagens "antes" abaixo são determinísticas no código de `HEAD`: `progressiveTrendLoader` executava `querySingleBinding` dentro de `bindings.map` em cada fase. As contagens "depois" são verificadas pelo teste parametrizado `mede uma chamada por fase para 1/3/10/20 tag(s) compatíveis`.

| Cenário | Fase | Antes | Depois | Targets por chamada depois |
|---|---|---:|---:|---:|
| 1 tag | Preview | 1 | 1 | 1 |
| 1 tag | Refinamento | 1 | 1 | 1 |
| 3 tags | Preview | 3 | 1 | 3 |
| 3 tags | Refinamento | 3 | 1 | 3 |
| 10 tags | Preview | 10 | 1 | 10 |
| 10 tags | Refinamento | 10 | 1 | 10 |
| 20 tags | Preview | 20 | 1 | 20 |
| 20 tags | Refinamento | 20 | 1 | 20 |

Current Values também foram medidos em testes para 1, 3, 10 e 20 inclusões dentro da janela: depois da alteração, todos os casos produzem uma chamada ao loader com N bindings. No fluxo anterior, inclusões sequenciais que concluíam entre drops podiam produzir N chamadas; se uma leitura permanecesse ativa, somente a primeira tag era consultada e as demais aguardavam o refresh compartilhado.

Para até 20 tags do mesmo datasource:

- Current Value inicial: 1 chamada, N targets;
- preview: 1 chamada, N targets;
- refinamento: 1 chamada, N targets;
- refresh periódico: 1 chamada por modo, N targets;
- navegação temporal: 1 preview e 1 refinamento por nova janela, N targets.

Com 21 tags, o teste confirmou duas chamadas (20 + 1). Com 41 tags, o teste confirmou no máximo duas chamadas simultâneas.

O tempo end-to-end contra o Grafana QA/PI System não foi medido neste ambiente. Com timers falsos, a aquisição inicial é disparada exatamente após 40 ms; o restante depende da latência real do datasource e do PI System.

## 23. Arquivos alterados

Arquivos de produção relacionados ao escopo:

- `src/components/App/App.tsx`
- `src/display/components/DisplayEditor/DisplayEditor.tsx`
- `src/display/components/DisplayEditor/DisplaySurface.tsx`
- `src/display/components/TrendElementView.tsx`
- `src/display/createTrend.ts`
- `src/display/displayTransfer.ts`
- `src/display/index.ts`
- `src/display/runtime/trendRuntime.ts`
- `src/display/runtime/valueRuntime.ts`
- `src/pi/dataQueryPolicy.ts`
- `src/pi/index.ts`
- `src/pi/piDataSource.ts`
- `src/pi/progressiveTrendLoader.ts`

Também foram ajustados somente os testes diretamente relacionados. Parte desses arquivos já estava modificada no baseline e foi preservada/evoluída.

## 24. Testes criados ou alterados

Coberturas focadas adicionadas ou ampliadas:

- micro-batch de Current Values para 1, 3, 10 e 20 tags;
- cache atual com TTL, revalidação, zero e limite LRU;
- tag recebida durante lote ativo;
- batching de Trends para 3 e 20 tags;
- preview/refinamento para 1, 3, 10 e 20 séries;
- respostas fora de ordem e parciais por `refId`;
- máximo de 20 targets e concorrência 2;
- pontos constantes em 8 h, 1 dia e 7 dias;
- erro individual, loading finalizado e preview preservado;
- refinamento obsoleto ignorado;
- múltiplos estados na mesma Trend;
- drop em Trend, preview do alvo, prevenção de duplicata e outro datasource;
- undo/redo da inclusão de série;
- renderer com duas curvas, cores, legenda e cursor;
- serialização de múltiplas séries e compatibilidade com binding legado.

Resultado final: 37 suítes e 249 testes aprovados.

## 25. Resultado das validações

```text
npm run typecheck
sucesso - tsc --noEmit

npm run lint
sucesso - eslint sem erros ou avisos

npm run test:ci
sucesso - 37 suítes, 249 testes, 0 snapshots

npm run build
sucesso - webpack 5.109.2, module.js 132 KiB

git diff --check
sucesso - nenhuma saída

git status --short
24 arquivos modificados e 2 arquivos novos não rastreados:
relatorio-conexao-de-dados.md e src/pi/dataQueryPolicy.ts

git diff --stat
24 arquivos rastreados, 2104 inserções e 382 remoções
(arquivos untracked não aparecem no stat padrão)

rg -n -i 'piwebapi|/streams/|/streamsets/|/points/' src -g '!**/__tests__/**'
nenhuma ocorrência; exit code 1 esperado para busca sem resultados
```

## 26. Git diff --stat

Saída antes da inclusão deste relatório, que é untracked e não aparece em `git diff --stat`:

```text
24 files changed, 2104 insertions(+), 382 deletions(-)
```

O volume inclui as 16 alterações preexistentes encontradas no baseline. O arquivo novo `src/pi/dataQueryPolicy.ts` também é untracked e não aparece no stat padrão até ser adicionado ao índice. Nenhum commit ou push foi executado.

## 27. Áreas preservadas

Não foram alterados:

- `docker-compose.yaml`;
- porta 3000;
- diretório `provisioning/`;
- `src/plugin.json`;
- configuração ou credenciais do datasource;
- `package.json` e `package-lock.json`;
- seleção, movimentação e resize dos elementos;
- multistate;
- estilos gerais de Value, Gauge e Bar;
- frequência global de refresh;
- transporte oficial pelo datasource do Grafana.

Não foram adicionadas dependências, WebSocket, polling por elemento, URLs, usuários, senhas, tokens ou chamadas HTTP diretas.

## 28. Limitações e riscos

- Os testes usam mocks do contrato oficial do datasource. A latência e o comportamento do datasource OSIsoft-PI instalado devem ser confirmados manualmente no Grafana QA.
- O refinamento usa o modo Plot já existente no contrato do projeto, com `maxDataPoints` e intervalo adaptativo. A redução final depende do datasource respeitar esses campos como na integração atual.
- A consulta explícita de Recorded Values usada no detalhamento por duplo clique também foi limitada a 2.000 pontos; ela não é usada como refinamento progressivo da tela.
- O projeto não possuía múltiplos eixos ou metadados persistidos de unidade. A implementação preserva o eixo compartilhado existente e não inventa uma nova arquitetura de escalas.
- O projeto não possuía remoção individual por legenda/configuração; esse fluxo não foi criado.
- A paleta mantém 20 séries visualmente distintas. Acima de 20, as cores se repetem de forma estável.
- Não existe persistência server-side do display nesta fase. A persistência validada é o documento existente e seu fluxo de exportação/importação.

## 29. Roteiro de validação manual no Grafana QA

1. Abrir o Grafana QA em `http://localhost:3000` pelo fluxo normal do ambiente.
2. Confirmar que o status do PI System está conectado e que o datasource selecionado é OSIsoft-PI.
3. Arrastar uma tag para uma área vazia e confirmar a criação de uma Trend.
4. Arrastar uma segunda e uma terceira tag sobre essa Trend e confirmar que existe um único elemento com três curvas e três entradas de legenda.
5. Soltar novamente uma tag já presente e confirmar que não há duplicação nem erro.
6. Testar tags de mesmo nome em datasource/servidor diferente, se disponíveis.
7. Usar undo e redo e confirmar que somente a última série é removida/restaurada.
8. Exportar o display, importar novamente e confirmar ordem, cores e bindings das séries.
9. Navegar entre 8 horas, 1 dia e 7 dias; observar que as curvas antigas permanecem até a nova prévia e que o refinamento substitui cada série sem piscar.
10. Testar cursor, seleção, drag e resize após a composição de séries.
11. Adicionar 10 e 20 tags rapidamente e, nas ferramentas de diagnóstico do Grafana/datasource, confirmar um request por fase e até 20 targets por request.
12. Simular tag sem dados ou indisponível e confirmar que as outras curvas permanecem visíveis e que a Trend não fica carregando indefinidamente.
