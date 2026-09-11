# Manual do Usuário - Calculation Engine
## Criação de Expressões Matemáticas, Estatísticas e Lógicas

---

## 1. Introdução

O **Calculation Engine** (Motor de Cálculos) é uma ferramenta poderosa integrada ao Plugin que permite realizar operações matemáticas, estatísticas e lógicas diretamente nos seus dashboards industriais. 

Ele serve para transformar dados brutos de sensores e equipamentos em informações úteis e indicadores consolidados em tempo real, sem a necessidade de criar novas tags físicas no seu servidor (como no PI System). Com ele, você pode combinar múltiplas variáveis, aplicar condições e extrair análises complexas.

**Exemplos de uso industrial:**
- **Temperatura Média:** `(Temp_Forno_Z1 + Temp_Forno_Z2) / 2`
- **Diferença entre sensores:** `ABS(Pressao_Entrada - Pressao_Saida)`
- **Status de Alarme:** `IF(Nivel_Tanque > 90, 1, 0)`

Neste manual, você aprenderá a criar expressões robustas e tirar o máximo proveito das funções disponíveis.

### Compatibilidade com PI Vision

O Calculation Engine possui suporte a diversas funções matemáticas, estatísticas e lógicas utilizadas em expressões do PI Vision.

A sintaxe foi desenvolvida para facilitar a criação de novos cálculos e a migração de expressões existentes para o Plugin-Visualization.

#### Status da compatibilidade PE/PI Vision — Fase 1

Os fundamentos abaixo foram validados no parser e no engine:

| Construção | Status | Exemplo |
|---|---|---|
| `Sqr(x)` | Compatível | `Sqr(9)` retorna `3` |
| `IF ... THEN ... ELSE ...` | Compatível | `IF Tag > 10 THEN 1 ELSE 0` |
| `AND`, `OR`, `NOT` | Compatível | `IF A > 0 AND NOT B THEN 1 ELSE 0` |
| `IF()`, `AND()`, `OR()`, `NOT()` | Forma legada do plugin, mantida | `IF(A > 10, 1, 0)` |

Na Fase 10 houve uma correção na avaliação/consumo dos operadores lógicos
`AND`/`OR`; isso não alterou a gramática nem a sintaxe geral do parser.

As construções históricas, de busca temporal, strings, datas e metadados ainda
devem ser classificadas individualmente conforme suas assinaturas e semântica
forem validadas. A existência de uma função com nome semelhante não implica
compatibilidade completa com PI Performance Equations.

#### Status da compatibilidade PE/PI Vision — Fase 3

| Função | Status | Observação |
|---|---|---|
| `TagAvg` | PARCIAL | Média ponderada no tempo sobre os intervalos disponíveis; `stepped` depende da metadata exposta pelo datasource, e qualidade por ponto/valores de fronteira não estão integrados. |
| `TagMean` | PARCIAL | Média ponderada por eventos, sem interpolação de fronteira. |
| `TagMin`, `TagMax` | PARCIAL | Mínimo/máximo dos eventos numéricos retornados; qualidade e `pctgood` não estão disponíveis. |
| `TagTot` | PARCIAL | Integral em dias, usando interpolação linear ou retenção stepped quando a metadata real informa esse modo; fronteiras não são fornecidas. |
| `EventCount` | PARCIAL | Conta os eventos retornados pelo modo `recorded`; o frame atual não expõe marcadores adicionais para auditar fronteiras. |
| `Range` | PARCIAL | Máximo menos mínimo dos eventos numéricos retornados. |
| `PctGood` | PARCIAL | Percentual temporal quando qualidade e cobertura completas são fornecidas; sem boundary/quality garantidos, retorna erro de capability. |
| `StDev` | PARCIAL | Desvio padrão ponderado no tempo; depende de qualidade e cobertura históricas completas. |
| `PStDev`, `SStDev` | COMPATÍVEL | Desvio populacional e amostral para argumentos numéricos/temporais homogêneos. |
| `Curve` | COMPATÍVEL | Interpolação linear entre pontos `(x,y)`, com saturação nos limites. |

#### Fase 18 — primeiro grupo implementado

| Função | Assinatura e retorno | Status | Quality/boundary/capability |
|---|---|---|---|
| `PrevEvent` | `PrevEvent(tag, time)` → timestamp em segundos | PARCIAL | Seleciona evento `origin=recorded` estritamente anterior; depende de origem arquivada garantida e não usa boundary/interpolação. |
| `NextEvent` | `NextEvent(tag, time)` → timestamp em segundos | PARCIAL | Seleciona evento `origin=recorded` estritamente posterior; depende de origem arquivada garantida e não usa boundary/interpolação. |
| `PctGood` | `PctGood(tag, start, end)` → percentual de 0 a 100 | PARCIAL | Calcula cobertura temporal dos segmentos com `Good=true`; `Good=false` não é contado, `unknown` e cobertura sem boundary geram erro explícito. |
| `StDev` | `StDev(tag, start, end)` → desvio padrão ponderado no tempo | PARCIAL | Usa segmentos numéricos e quality tri-state; requer qualidade conhecida e cobertura suficiente, com `Step` da metadata quando disponível. |
| `PStDev` | `PStDev(x1, ..., xn)` → desvio padrão populacional | COMPATÍVEL | Argumentos numéricos ou temporais homogêneos; divisor `n`, estados digitais são ignorados pelo filtro de tipo. |
| `SStDev` | `SStDev(x1, ..., xn)` → desvio padrão amostral | COMPATÍVEL | Argumentos numéricos ou temporais homogêneos; divisor `n-1`, um argumento retorna zero conforme a referência adotada. |
| `IsSet` | `IsSet(value, select)` → 0 ou 1 | PARCIAL | Seletores `a`, `s`, `q` verificam Annotated, Substituted e Questionable; flag ausente em valor PI estruturado gera capability error. |
| `TagBad` | `TagBad(tag)` → 0 ou 1 | PARCIAL | Avalia o estado atual anormal, incluindo `Good=false` e estados de sistema reconhecidos; o datasource não garante todos os estados PI. |

`PrevEvent` e `NextEvent` são distintos de `PrevVal` e `NextVal`: retornam o
timestamp do evento arquivado, não seu valor. O caminho atual reaproveita a
consulta histórica GPA e o cache/Promise lock existentes; por isso essas duas
funções permanecem parciais quando a resposta não comprova `origin=recorded`.

#### Checkpoint 18.2 — algoritmos e tempo

| Função | Assinatura PE | Status | Decisão técnica |
|---|---|---|---|
| `Arma` | `Arma(in, runflag, (a1,...,aN), (b0,...,bN))` | NÃO IMPLEMENTADA | ARMA exige saídas/entradas anteriores e intervalos regulares do Scheduler; cache de I/O não é estado do filtro. |
| `Curve` | `Curve(x, (x1,y1) (x2,y2) ...)` | COMPATÍVEL | Interpolação linear, pontos x crescentes e saturação fora do domínio; implementação local determinística. |
| `Impulse` | `Impulse(tagname, runflag, i1,i2,...)` | NÃO IMPLEMENTADA | Exige estado de resposta anterior e semântica de intervalos do Scheduler. |
| `MedianFilt` | `MedianFilt(tagname, runflag, number)` | NÃO IMPLEMENTADA | Requer os últimos N eventos da série e estado/execução de filtro; a consulta atual não garante janela por contagem de eventos. |
| `Delay` | `Delay(x, runflag, n)` | NÃO IMPLEMENTADA | Retarda por N intervalos de cálculo, dependentes do Scheduler; não pode ser simulado com espera da UI. |
| `IsDST` | `IsDST(time)` → 0 ou 1 | NÃO IMPLEMENTADA | A referência usa o timezone local do contexto de cálculo; a GPA atual não fornece timezone/regras DST do PI Server. |

`Curve` não é alias de `Poly`: seus pontos são constantes `(x,y)` e a
interpolação é linear. As outras cinco permanecem não implementadas porque uma
aproximação violaria estado, intervalo ou timezone definidos pelo PE.

Ficha técnica do checkpoint:

| Função | Tipos aceitos / retorno | Estado e histórico | Metadados / timezone | Implementável no runtime atual | Status |
|---|---|---|---|---|---|
| `Arma` | Entrada numérica, `runflag`, coeficientes numéricos → número | Estado de entradas/saídas anteriores e Scheduler regular; não é consulta de arquivo | Não depende de metadados ou timezone | Não, falta estado de Scheduler | N |
| `Curve` | `x` numérico e pares constantes `(x,y)` → número | Sem estado e sem histórico | Não depende de metadados ou timezone | Sim, local e determinístico | C |
| `Impulse` | Entrada/tag numérico, `runflag`, impulsos numéricos → número | Resposta anterior e intervalos regulares do Scheduler | Não depende de metadados ou timezone | Não, falta estado de Scheduler | N |
| `MedianFilt` | Tag numérico, `runflag`, inteiro `number >= 3` → número | Últimos N eventos e estado do filtro; a série temporal atual não garante janela por contagem | Não depende de metadados ou timezone | Não sem semântica de eventos exata | N |
| `Delay` | Entrada numérica, `runflag`, inteiro `n` → número | N intervalos de cálculo; falha até haver amostras suficientes | Não depende de metadados ou timezone | Não, UI não substitui Scheduler | N |
| `IsDST` | Timestamp → `0` ou `1` | Sem estado/histórico | Depende das regras do timezone local do contexto PE | Não há timezone PI Server garantido | N |

#### Checkpoint final da Fase 18 — funções estruturais restantes

A reauditoria foi confrontada com a referência de funções PE, que define
`MedianFilt` como a mediana dos últimos valores da série, `NoOutput()` como
supressão do envio do resultado ao PI e as funções `Alm*` como consultas de
Alarm State ([PI Server Applications User's Guide](https://manualzz.com/doc/28884584/rockwell-automation-pi-server-applications--pi-performanc...)).

| Function | Before | After | Semântica oficial | Dependência arquitetural | Implementação | Bloqueio restante |
|---|---|---|---|---|---|---|
| `Arma` | N | N | Resposta ARMA com coeficientes e valores anteriores | PE Scheduler e estado de entradas/saídas | Não implementada; erro explícito | Não há estado persistente de Scheduler reconstruível |
| `Impulse` | N | N | Resposta dinâmica por coeficientes de impulso | PE Scheduler e resposta anterior | Não implementada; erro explícito | Histórico GPA não representa avaliações anteriores |
| `MedianFilt` | N | N | Mediana dos últimos `number` valores da série | Eventos recorded e janela por contagem | Não implementada; erro explícito | GPA atual não garante os últimos N eventos sem janela arbitrária |
| `Delay` | N | N | Valor/resultante de N intervalos de cálculo anteriores | PE Scheduler | Não implementada; erro explícito | Não existe histórico de resultados do Scheduler |
| `IsDST` | N | N | `0/1` conforme DST do timezone do contexto PE | Regras de timezone do PI/PE | Não implementada; erro explícito | Nenhuma fonte confiável do timezone PE está disponível |
| `NoOutput` | N | N | Suprime o envio do resultado atual ao PI | Pipeline de escrita do PE Scheduler | Não implementada; erro explícito | O plugin exibe resultados; não possui operação de escrita a suprimir |
| `AlmAckStat` | N | N | Código de acknowledgement do Alarm State | PI Alarm State subsystem | Não implementada; erro explícito | GPA não expõe esse subsistema por capability confirmada |
| `AlmCondition` | N | N | Código da condição do Alarm State | PI Alarm State subsystem | Não implementada; erro explícito | GPA não expõe esse subsistema por capability confirmada |
| `AlmCondText` | N | N | Texto da condição do Alarm State | PI Alarm State subsystem | Não implementada; erro explícito | GPA não expõe esse subsistema por capability confirmada |
| `AlmPriority` | N | N | Prioridade do Alarm State | PI Alarm State subsystem | Não implementada; erro explícito | GPA não expõe esse subsistema por capability confirmada |

Classificação dos bloqueios: `Arma`, `Impulse` e `Delay` = **S** (Scheduler);
`AlmAckStat`, `AlmCondition`, `AlmCondText` e `AlmPriority` = **A** (Alarm
subsystem); `IsDST` = **T** (timezone PI indisponível); `MedianFilt` = **O**
(capacidade de consulta por contagem de eventos); `NoOutput` = **O** (ausência
de pipeline de escrita/supressão). Nenhuma dessas funções foi aproximada com
estado global, timer, zero, alarme sintético ou timezone do navegador.

O engine agora diferencia essas dez funções conhecidas de uma função realmente
desconhecida, retornando erro explícito de função PI não implementada. Isso não
altera o resultado público de cálculos suportados nem o fluxo histórico.

#### Fase 19 — fechamento das funções parciais

O catálogo (`piCompatibilityCatalog.ts`) foi recontado programaticamente antes
da auditoria: 43 C, 59 P e 10 N, total de 112 nomes únicos. As extensões do
plugin não entram nessa contagem. A auditoria não encontrou capability garantida
que elimine integralmente o blocker de uma função parcial; portanto nenhuma
função foi promovida nesta fase.

| Function | Category | Exact blocker | Capability required | Solvable locally? | Solvable through existing GPA? | Evidence/status |
|---|---|---|---|---|---|---|
| `Avg`, `Max`, `Median`, `Min` | S/H | Agregações PE têm regras próprias de tipo/coerção; variantes históricas ainda dependem do domínio correto | Semântica PE e, quando histórica, boundary/quality | Parcialmente | Não para fechar o histórico | Evidência semântica suficiente; P mantido |
| `Round`, `Trunc` | TZ/S | Valores temporais precisam do contexto temporal PE; `Round` também distingue timestamp/período | Timezone e tipos temporais | Não sem timezone PE | Não exposta de forma garantida | P mantido |
| `Ascii`, `Char`, `Concat`, `Format` | S | Encoding, coerções e cobertura completa do sprintf PE não estão integralmente comprovados no runtime | Semântica/encoding PE | Não sem prova adicional | Não | P mantido |
| `String`, `Text` | TZ/S | Conversão de ponto/tempo depende de tipo e representação temporal PE; implementação é subconjunto | Tipos PE e timezone | Não integralmente | Não | P mantido |
| `DigText` | DS | Requer texto/código do Digital State Set correto | Digital State Sets | Não | Capability existe somente quando o set é resolvido | P mantido |
| `Bod`, `Bom`, `Bonm`, `Day`, `DaySec`, `Hour`, `Minute`, `Month`, `Noon`, `ParseTime`, `Second`, `Weekday`, `Year`, `Yearday` | TZ | Componentes e fronteiras de calendário dependem do timezone do contexto PE | Timezone PI/PE e regras DST | Não sem fonte temporal correta | Não garantido pelo GPA | P mantido |
| `TagNum` | MD | PointID ausente não pode ser substituído por WebId/GUID | PointID real | Não | GPA pode fornecer em alguns recursos, não universalmente garantido | P mantido |
| `EventCount`, `Range`, `TagVal`, `PrevVal`, `NextVal` | H | Seleção exata de eventos, boundary e valor no instante não é garantida em todas as respostas | recorded/boundary/interpolated | Não | Parcialmente, conforme resposta GPA | P mantido |
| `TagAvg`, `TagMean`, `TagMin`, `TagMax`, `TagTot` | H | Cobertura, boundary, Bad, qualidade e Step podem alterar o resultado PE | boundary, quality, Step e origem | Não | Recursos existem, mas não são garantidos no caminho normal | P mantido |
| `PrevEvent`, `NextEvent` | H | Navegação exige origem `recorded` inequívoca e fronteiras fora do conjunto de eventos | recorded origin e navegação arquivada | Não | Somente quando a origem é comprovada | P mantido |
| `PctGood`, `StDev` | H/Q | Requerem qualidade conhecida e cobertura temporal completa, inclusive extremos | historical quality, boundary e Step | Não | GPA pode omitir qualidade/boundary | P mantido |
| `TimeEq`, `TimeNE`, `TimeGT`, `TimeGE`, `TimeLT`, `TimeLE` | H/Q | Duração depende de boundary, Bad, stepped e tratamento de estados | timeline, quality, boundary e Step | Não | Parcialmente, conforme capability retornada | P mantido |
| `FindEq`, `FindNE`, `FindGT`, `FindGE`, `FindLT`, `FindLE` | H/Q | Busca não pode cruzar segmento Bad e precisa distinguir crossing, stepped e boundary | timeline, quality, boundary e Step | Não | Parcialmente, conforme capability retornada | P mantido |
| `BadVal`, `IsSet`, `TagBad` | Q/DS | Flags ausentes não podem ser convertidas em Good/Bad por inferência | quality e estado real | Não sem dados | GPA pode fornecer somente alguns campos | P mantido |

Matriz de capabilities do runtime: `pointMetadata` e `pointId` são detectados
por recursos GPA quando o ponto expõe os campos; `step` é opcional; Digital
State Sets são consultados pelos recursos existentes; `rawRecorded` e seus
campos de qualidade são capability-probed, mas não garantidos para todo runtime;
`boundary`, `recordedOrigin`, `previousRecorded` e `nextRecorded` só são usados
quando a resposta os comprova; `interpolatedAtTime` depende do formato retornado;
`piTimezone` permanece indisponível. A detecção é interna, sem UI, e não altera
automaticamente a classificação global do catálogo.

Quando a capability não está disponível, o comportamento operacional é erro
explícito de capability ou resultado parcial documentado; nunca se preenche
qualidade desconhecida, PointID com WebId, alarme sintético, offset fixo ou
boundary artificial.

#### Status da compatibilidade PE/PI Vision — Fase 4

| Função | Status | Retorno e limitações |
|---|---|---|
| `TimeEq`, `TimeNE` | PARCIAL | Duração em segundos; estados digitais são tratados como stepped e séries numéricas respeitam `stepped` quando informado. Não há valores de fronteira. |
| `TimeGT`, `TimeGE` | PARCIAL | Duração em segundos com cruzamento linear para séries numéricas; comparação inclusiva preserva platôs no limite. |
| `TimeLT`, `TimeLE` | PARCIAL | Duração em segundos com cruzamento linear para séries numéricas; comparação inclusiva preserva platôs no limite. |
| `FindEq`, `FindNE`, `FindGT`, `FindGE`, `FindLT`, `FindLE` | PARCIAL | Retornam timestamp Unix em segundos; há interpolação numérica e suporte stepped digital, mas não há boundary values nem extrapolação. |

As funções `Time*` calculam somente os intervalos cobertos por dois eventos
retornados pelo datasource. Como o GPA atual não garante stepped numérico,
qualidade por evento ou valores boundary em todo runtime, a compatibilidade é
explicitamente parcial; estados digitais não são interpolados como números.

#### Checkpoint histórico — modelo comum

O histórico normalizado usa `PiHistoricalValue` (`timestamp`, `value`,
`quality` opcional e `origin` opcional). `Good=false` é preservado e exclui o
valor das avaliações históricas que dependem de valores utilizáveis; a
ausência de `Good` não recebe um valor padrão. `Questionable`, `Substituted` e
`Annotated` também só são transportados quando o datasource os fornece.

`origin` só é preenchido quando a resposta informa explicitamente
`recorded`, `boundary` ou `interpolated` (ou `Recorded=true` no recurso raw).
Posição ou timestamp não são usados para inferi-lo. O caminho normal continua
sendo `/api/ds/query`; o recurso raw `/streams/{webId}/recorded` só é usado
por chamadas explicitamente solicitadas e participa do mesmo capability cache e
Promise lock. 404/405/501 podem ser classificados como `unsupported`; 401/403,
500, timeout e resposta inválida permanecem erros transitórios/operacionais.

Mapa de dependências do checkpoint:

| Função | boundary | quality | Step | origem recorded |
|---|---|---|---|---|
| `TagAvg`, `TagTot`, `Time*` | required | required | required | optional |
| `TagMean`, `TagMin`, `TagMax`, `Range` | not relevant | required | not relevant | optional |
| `EventCount` | required | required | not relevant | required |
| `TagVal` | required | required | required | optional |
| `PrevVal`, `NextVal` | optional | required | not relevant | required |
| `Find*` | required | required | required | optional |

Política de quality auditada neste checkpoint:

| Família | `Good=false` | `Good=undefined` | `Questionable`/`Substituted`/`Annotated` |
|---|---|---|---|
| Agregações e duração (`TagAvg`, `TagMean`, `TagMin`, `TagMax`, `TagTot`, `Range`, `Time*`) | excluído do valor/intervalo utilizável | desconhecido, preservado e não promovido como quality garantida | não descarta automaticamente |
| Seleção (`TagVal`, `PrevVal`, `NextVal`, `Find*`) | não é convertido em valor válido | preservado; sem capability de quality, permanece limitação | não descarta automaticamente |
| Contagem (`EventCount`) | não contado como evento utilizável | não pode ser promovido sem origem arquivada | não redefine `Good` |

Nesta etapa, a consulta normal não promete valores boundary nem origem de
evento quando o contrato GPA não os expõe. Por isso as funções continuam
`PARCIAL` nesses cenários, e `EventCount` não usa heurística para contar
boundary/interpolated como evento arquivado. A qualidade explicitamente ruim
não é convertida em zero; quando não resta valor utilizável, a avaliação
retorna erro histórico.

#### Status da compatibilidade PE/PI Vision — Fase 5

**String Functions**

| Função PI | Status | Observação |
|---|---|---|
| `UCase`, `LCase`, `Len` | COMPATÍVEL | Conversão de caixa e comprimento Unicode conforme a string JavaScript recebida. |
| `Left`, `Right`, `Mid` | COMPATÍVEL | Índices PI baseados em 1; `Mid` aceita comprimento opcional. |
| `Trim`, `LTrim`, `RTrim` | COMPATÍVEL | Removem espaços em branco nas extremidades correspondentes. |
| `InStr` | PARCIAL | Retorna posição base 1 ou `0`; suporta início opcional e `casesen`, sem curingas. |
| `Ascii`, `Char`, `Compare` | PARCIAL | Implementados para códigos ASCII e curingas de `Compare`; limites de encoding PI mais amplos ainda não foram validados. |

Os nomes legados `UPPER`, `LOWER`, `LENGTH`, `SUBSTRING` e `CONCAT` foram
mantidos como extensões do plugin.

**Date/Time Functions**

| Função PI | Status | Observação |
|---|---|---|
| `Day`, `Month`, `Year`, `Hour`, `Minute`, `Second` | PARCIAL | Retornam componentes usando o timezone local do navegador. |
| `Weekday`, `Yearday`, `DaySec` | PARCIAL | Semana de 1 a 7 (domingo = 1), dia do ano de 1 a 366 e segundos desde meia-noite. |
| `Bod`, `Bom`, `Bonm`, `Noon` | PARCIAL | Retornam timestamp em segundos no timezone local do navegador. |
| `ParseTime` | PARCIAL | Reutiliza o parser PI temporal existente; não cobre toda a gramática histórica. |

**Math Functions**

| Função PI | Status | Observação |
|---|---|---|
| `Atn`, `Atn2`, `Sgn` | COMPATÍVEL | Aliases de `ATAN`, `ATAN2` e `SIGN`, respectivamente. |
| `Int`, `Frac` | PARCIAL | Conversão e parte fracionária preservam sinal; limites de tipos PI não foram ampliados. |
| `Float` | COMPATÍVEL | Aceita somente número ou string numérica não vazia e retorna erro para conversão inválida. |
| `Log`, `Ln`, `Log10`, `Sqr` | COMPATÍVEL | `Log`/`Ln` natural, `Log10` comum e `Sqr` raiz quadrada. |

`TagNum` permanece **PARCIAL**: depende de o datasource expor o PointID real;
WebId não é substituído. `DigText`, `DigState` e `StateNo` foram
integrados de forma PARCIAL usando o Digital State Set resolvido pelo
datasource; `Find*` foi implementado posteriormente como PARCIAL;
metadados PI Point, `PctGood` e qualidade por evento devem ser lidos conforme a
matriz final abaixo.

#### Status da compatibilidade PE/PI Vision — Fase 9

| Função | Status | Assinatura/retorno | Limitação |
|---|---|---|---|
| `Format` | PARCIAL | `Format(num, format[, "R"/"I"])` retorna string | Subconjunto determinístico de especificadores C numéricos; datas, locale e máscaras compostas não são suportados. |
| `String` | PARCIAL | `String(anyvalue)` retorna string | Números, strings e estados digitais já resolvidos; timestamp numérico não recebe formatação de data PI. |
| `Text` | PARCIAL | `Text(val1[, ...])` concatena os valores em string | Não aplica formatação de timestamp PI nem substitui `Concat` para tipos incompatíveis. |
| `Poly` | COMPATÍVEL | `Poly(x, c0, ..., cn)` = `c0 + c1*x + ... + cn*x^n` | Todos os argumentos precisam ser numéricos. |
| `DigText` | PARCIAL | `DigText(tagname)` retorna texto do estado digital | Consulta o Digital State Set associado ao PI Point; requer metadata e não cobre a pesquisa global de sets. |
| `TagNum` | PARCIAL | `TagNum("tagname")` retorna PointID | Retorna somente `Id`/`PointID` real quando exposto pelo PI; WebId não é usado como substituto. |

### Digital State Functions — Fase 12

| Função | Status | Dependência | Observação |
|---|---|---|---|
| `DigText(tagname)` | PARCIAL | PI Point digital + Digital State Set | Traduz o código/nome real do valor atual; se necessário reconhece System Digital State sem adicioná-lo ao set normal. Ponto não digital, set ausente ou estado desconhecido geram erro. |
| `DigState(state[, tagname])` | PARCIAL | Set do PI Point; sem tag, `/dataservers/{id}/enumerationsets` | Com tag usa o set do ponto; sem tag consulta `SYSTEM` primeiro e preserva a ordem retornada pelo PI para os demais sets. Falha explicitamente se a capability não estiver disponível. |
| `StateNo(digstate)` | PARCIAL | Valor digital com identidade do set | Retorna o código PI real de `StateNo(DigState(...))` ou de um ponto digital, sem assumir `On = 1`; string isolada não é convertida arbitrariamente. |
| `IsSet(value, select)` | NÃO IMPLEMENTADO | Flags `Annotated`, `Substituted` ou `Questionable` | O datasource atual não fornece essas flags de forma integrada ao cálculo. |

As consultas de Digital State Set usam cache e Promise lock por PI Point; a
busca sem tag adiciona cache por datasource/Data Server. A interface aguarda
essas Promises junto com histórico e metadata, preservando o fluxo de um único
clique. Estados normais do set não são misturados aos estados de sistema
(`Shutdown`, `I/O Timeout`, `Pt Created`, `No Data`), cuja qualidade continua
seguindo a prioridade da Fase 8.

### Capacidades do PI Web API via datasource Grafana configurada

O plugin não abre uma segunda conexão com o PI, não lê `secureJsonData` e não
envia credenciais próprias. Ele obtém a instância GPA pelo `dataSourceSrv` e
usa os métodos já autenticados da datasource: `query`, `metricFindQuery` e,
quando disponível, `getResource`. O último não é tratado como proxy universal:
é um resource handler da versão instalada da GPA e cada rota precisa ser
suportada pelo backend.

| Capacidade | Recurso usado | GPA/resource disponível no código | Integração |
|---|---|---|---|
| Pesquisa de PI Points | `/points/search`, `/dataservers/{id}/points` | Sim, via `getResource`; fallback `metricFindQuery` | Pesquisa |
| Metadata de ponto | `/points/{webId}`, `/points/{webId}/attributes` | Sim, via `getResource` | Metadata e limites |
| Digital State Set | `/dataservers/{id}/enumerationsets`, `/enumerationsets/{id}/enumerationvalues` e rotas legadas | Sim, via `getResource` | `DigText`, `DigState`, `StateNo` |
| Plot de stream | `/streams/{webId}/plot` | Sim, quando o handler existe | Tendências auxiliares |
| Boundary histórico | recurso `recorded` não confirmado nesta instalação | Não confirmado | Não integrado |
| Qualidade por evento | recurso raw não confirmado nesta instalação | Não confirmado | `PctGood` permanece não implementado |
| Stepped/PointID/timezone do servidor | `Step`/`Stepped` e `Id`/`PointID` quando expostos; timezone do servidor não confirmado | Parcial | Funções dependentes respeitam a metadata disponível; `TagNum` não usa WebId |

O helper `getPiResource(datasourceUid, path)` aceita somente caminhos relativos,
confirma o tipo GPA e propaga erros. Portanto a autenticação continua no fluxo
Grafana → datasource GPA → PI Web API, sem URL PI hardcoded, token ou senha no
bundle do plugin.

Inventário das funções confirmadas que permanecem fora do escopo: `IsSet`
depende de flags não disponíveis de forma completa; `PctGood`, `StDev`,
`PStDev` e `SStDev` dependem de qualidade e
fronteiras históricas por evento; `TagBad` e `PrevEvent` exigem semântica de
arquivo/qualidade adicional; `Delay` e funções de alarmes não se aplicam ao
modelo síncrono de cálculo do plugin. `GoodVal` não foi encontrado como função
oficial na referência adotada e não foi implementado.

`TagMean` não é alias de `TagAvg`: o primeiro usa a média dos eventos e o
segundo pondera os intervalos de tempo. `TagTot` retorna unidade de valor por
dia, conforme a semântica PE de totalizador; `Total` permanece como extensão
legada do plugin.

### Auditoria final — Fase 10

A auditoria foi feita contra a lista de funções do *PI Server Applications
User's Guide* (Performance Equations). **COMPATÍVEL** indica assinatura e
semântica validadas para os tipos cobertos; **PARCIAL** indica limitação
explícita; **PLUGIN EXTENSION** não é uma promessa de compatibilidade PE; e
**NÃO IMPLEMENTADO** não deve ser usado como se fosse PE. Não foi classificada
nenhuma função como NÃO CONFIRMADA.

| Família | COMPATÍVEL | PARCIAL | PLUGIN EXTENSION | NÃO IMPLEMENTADO |
|---|---|---|---|---|
| Matemática | `Acos`, `Asin`, `Atn`, `Atn2`, `Cos`, `Cosh`, `Exp`, `Float`, `Frac`, `Int`, `Log`, `Log10`, `Mod`, `Sgn`, `Sin`, `Sinh`, `Sqr`, `Tan`, `Tanh`, `Poly`, `Curve` | `Avg`, `Max`, `Min`, `Median`, `Round`, `Trunc` | — | `Arma`, `Impulse`, `MedianFilt` |
| Strings/conversão | `UCase`, `LCase`, `Len`, `Left`, `Right`, `Mid`, `Trim`, `LTrim`, `RTrim`, `Compare`, `InStr` | `Ascii`, `Char`, `Concat`, `Format`, `String`, `Text`, `DigText` | `UPPER`, `LOWER`, `LENGTH`, `SUBSTRING`, `CONCAT` | — |
| Data/hora | — | `Day`, `DaySec`, `Hour`, `Minute`, `Month`, `Second`, `Weekday`, `Year`, `Yearday`, `Bod`, `Bom`, `Bonm`, `Noon`, `ParseTime` | — | `Delay`, `IsDST` |
| Histórico/arquivo | `PStDev`, `SStDev` | `TagAvg`, `TagMean`, `TagMin`, `TagMax`, `TagTot`, `EventCount`, `Range`, `TagVal`, `PrevVal`, `NextVal`, `NextEvent`, `PrevEvent`, `PctGood`, `StDev`, `TimeEq`, `TimeNE`, `TimeGT`, `TimeGE`, `TimeLT`, `TimeLE`, `FindEq`, `FindNE`, `FindGT`, `FindGE`, `FindLT`, `FindLE` | `Average`, `Minimum`, `Maximum`, `Count`, `Total`, `Moving_Average`, `Moving_Min`, `Moving_Max`, `Moving_StdDev` | — |
| Qualidade/estado | — | `BadVal`, `DigState`, `StateNo`, `IsSet`, `TagBad` | `IS_GOOD`, `IS_BAD`, `IS_QUESTIONABLE`, `IS_SUBSTITUTED`, `IS_NO_DATA`, `QUALITY`, `STATUS_CODE` | — |
| Metadata | `TagDesc`, `TagEU`, `TagExDesc`, `TagName`, `TagSource`, `TagSpan`, `TagZero`, `TagType`, `TagTypVal` | `TagNum` | — | — |
| Alarmes/controle | — | — | — | `AlmAckStat`, `AlmCondition`, `AlmCondText`, `AlmPriority`, `NoOutput` |

Contagem inicial corrigida dos 112 nomes da referência auditada: 37 COMPATÍVEIS,
56 PARCIAIS e 19 NÃO IMPLEMENTADOS; NÃO CONFIRMADOS: 0. A contagem anterior
(`37/57/18`) não fechava com a enumeração nominal: `TagNum` deve ser PARCIAL e
`NoOutput`, função oficial ausente, é NÃO IMPLEMENTADA. O catálogo verificável
está em `src/calculations/piCompatibilityCatalog.ts`. Nesta fase, `Float`,
`Compare` e `InStr` foram promovidas após validação de assinatura, tipo e casos
de borda locais; a Fase 18 promoveu `PStDev` e `SStDev` e implementou
parcialmente as outras seis funções do primeiro grupo. O Checkpoint 18.2 promoveu
`Curve`. A contagem atual é 43 COMPATÍVEIS, 59 PARCIAIS e 10 NÃO IMPLEMENTADOS. Além deles, a matriz identifica
14 EXTENSÕES do plugin. `GoodVal`
não faz parte da lista de referência adotada e não foi inventada como função
PE.

### Encerramento da auditoria — Fase 17

Esta matriz é a fonte de verdade do estado auditado: 112 funções PI,
sendo 43 **COMPATÍVEIS**, 59 **PARCIAIS** e 10 **NÃO IMPLEMENTADAS**, além de
14 **PLUGIN EXTENSIONS** separadas. A classificação PARCIAL é mantida quando a
assinatura funciona, mas depende de metadata, Digital State Set, qualidade,
boundary values ou timezone que a datasource não garante.

O histórico usa cache e Promise lock por datasource, ponto e janela. A
interface aguarda consultas pendentes e reavalia automaticamente, sem exigir
um segundo clique. `No Data`, erro HTTP/datasource, metadata ausente,
capability indisponível e ausência de correspondência em `Find*` permanecem
resultados distintos; erros não são convertidos em zero.

As limitações estruturais finais são: boundary avançado e qualidade histórica
não integrados; `PctGood`, `StDev`, `IsSet`, `PrevEvent`, `NextEvent`, `TagBad`
e alarmes são parciais por capabilities externas; `TagNum` e `stepped` dependentes da
metadata real; Digital State Functions dependentes do set retornado pela
datasource; `Format` como subconjunto; e funções de data usando o timezone
local do navegador quando o timezone do PI Server não é exposto.

O engine preserva internamente `timestamp` e `timespan` durante uma avaliação;
o resultado público continua sendo o primitivo em segundos. `Find*`,
`ParseTime`, `Bod`, `Bom`, `Bonm` e `Noon` produzem `timestamp`; `Time*`
produz `timespan`. Isso permite composições como `Hour(FindGT(...))` sem
tratar segundos Unix como milissegundos. `Avg`, `Max`, `Min` e `Median`
aceitam números, timestamps ou períodos homogêneos e preservam essa categoria
interna. Permanecem PARCIAIS porque a semântica completa para strings, digitais
e dados PI tipados ainda não é coberta.

| Função | Tipos internos aceitos nesta implementação | Resultado interno |
|---|---|---|
| `Avg`, `Min`, `Max` | número, `timestamp` ou `timespan` homogêneos | mesma categoria do argumento |
| `Median` | três ou mais número, `timestamp` ou `timespan` homogêneos | mesma categoria do argumento |
| `Round`, `Trunc` | número; `timestamp`/`timespan` com unidade da mesma categoria | mesma categoria do valor |

`ROUND(valor, casas)` continua sendo a extensão legada de casas decimais,
enquanto `Round(valor[, unidade])` usa unidade PE. `Trunc` arredonda para o
múltiplo inferior, inclusive para números negativos. `String` e `Text` não
fazem coerção de objetos estruturados: timestamps continuam PARCIAIS até haver
formatação PI e timezone do servidor. `Ascii`/`Char` mantêm uma faixa de código
que a referência não detalha; `Concat` aceita estritamente strings, enquanto a
extensão `CONCAT` legada permanece separada.

Cobertura atual de `Format` (por isso continua PARCIAL):

| Elemento `sprintf` | PE | Plugin | Equivalente |
|---|---|---|---|
| `%d`, `%i`, `%u`, `%o`, `%x`, `%X` | suportado | subconjunto para `num_type=I` | Não |
| `%f`, `%e`, `%E`, `%g`, `%G` | suportado | subconjunto para `num_type=R` | Não |
| flags `-`, `+`, espaço, `0`; width; precisão | suportado | uma especificação simples | Não |
| `%%`, múltiplas conversões e demais recursos C | suportado | não suportado | Não |

`DigText`, `DigState` e `StateNo` usam o set do ponto quando a GPA o expõe.
`DigState(state)` consulta o set `SYSTEM` primeiro e então a ordem devolvida
pelo PI Data Server; a função continua PARCIAL porque essa capability pode não
existir na GPA instalada. `StateNo` preserva o contexto do set para estados
repetidos. `TagNum` só é válido quando há PointID numérico real na metadata;
WebId nunca é usado como substituto.

Validação final desta fase: `npm run typecheck` passou; as cinco suítes
focadas (`calculationEngine`, `calculationMacros`, `piDataSource`,
`CalculationEditorDialog` e catálogo) passaram com 166 testes; a suíte completa mantém
falhas preexistentes de integração do `DisplayEditor` fora deste escopo.
Não foram adicionadas UI, conexão, credenciais ou logs de diagnóstico.

---

## 2. Como Criar um Cálculo

Um cálculo é uma fórmula (expressão) avaliada em tempo real. Os nomes das tags que você digita são automaticamente substituídos pelos valores atuais vindos da planta durante a execução do dashboard.

**Passo a passo básico:**
1. No painel de edição do Grafana, localize o campo destinado a **Expressão** ou **Cálculo**.
2. Digite sua fórmula matemática referenciando o nome das tags desejadas.
3. Não é necessário utilizar aspas em torno dos nomes das tags em expressões simples.

**Exemplo simples:**
```text
Temperatura_Motor_A + Temperatura_Mancal_B
```
*O sistema pegará o valor numérico de `Temperatura_Motor_A`, somará ao valor de `Temperatura_Mancal_B` e exibirá o total consolidado no elemento visual correspondente.*

---

## 3. Sintaxe Básica

Você pode construir suas lógicas unindo tags e números fixos usando os operadores matemáticos universais:

| Operador | Ação | Exemplo de Uso |
|:---:|---|---|
| `+` | Adição | `Producao_A + Producao_B` |
| `-` | Subtração | `Nivel_Atual - 10` |
| `*` | Multiplicação | `Corrente * Tensao` |
| `/` | Divisão | `Producao_Total / Horas_Operacao` |
| `^` | Potência | `Velocidade ^ 2` |

---

## 4. Operadores de Comparação

Os operadores de comparação são utilizados principalmente em funções lógicas como `IF()`, `AND()` e `OR()`.

| Operador | Descrição | Exemplo |
|----------|-----------|---------|
| `>` | Maior que | `Temperatura > 100` |
| `<` | Menor que | `Pressao < 5` |
| `>=` | Maior ou igual | `Nivel >= 90` |
| `<=` | Menor ou igual | `Vazao <= 10` |
| `=` | Igual | `Bomba = 1` |
| `!=` | Diferente | `Status != 0` |

**Observação:** Operadores de comparação retornam valores lógicos e são normalmente utilizados dentro das funções: `IF()`, `AND()`, `OR()`, `NOT()`.

**Exemplos industriais:**
```text
IF(
 Temperatura_Forno > 100,
 1,
 0
)
```

```text
IF(
 Nivel_Tanque >= 90,
 1,
 0
)
```

---

## 5. Funções Matemáticas

O motor possui diversas funções embutidas para tratamento de dados operacionais.

### ABS()
- **Descrição:** Retorna a distância numérica em relação ao zero, removendo o sinal negativo quando existir.
- **Sintaxe:** `ABS(valor)`
- **Exemplo industrial:** `ABS(Pressao_Atual - Pressao_Setpoint)`
- **Resultado:** Retorna a diferença de pressão sempre positiva, independente de qual for maior.

### ROUND()
- **Status:** 🔵 PLUGIN EXTENSION (não é a assinatura PI `Round(x[, unit])`).
- **Descrição:** Arredonda um número para uma quantidade específica de casas decimais.
- **Sintaxe:** `ROUND(valor, casas_decimais)`
- **Exemplo industrial:** `ROUND(Vazao_Principal, 2)`
- **Resultado:** Exibe a vazão com exatamente duas casas decimais (ex: `125.46`).

### FLOOR()
- **Descrição:** Arredonda o número para baixo (maior número inteiro menor ou igual ao valor).
- **Sintaxe:** `FLOOR(valor)`
- **Exemplo industrial:** `FLOOR(Horas_Rodando_Bomba)`
- **Resultado:** Ignora os minutos/segundos quebrados, entregando horas inteiras completas.

### CEIL()
- **Descrição:** Arredonda o número para cima (menor número inteiro maior ou igual ao valor).
- **Sintaxe:** `CEIL(valor)`
- **Exemplo industrial:** `CEIL(Dias_Para_Manutencao)`

### SIGN()
- **Descrição:** Retorna a polaridade de uma variável:
  - `1` para valores positivos;
  - `-1` para valores negativos;
  - `0` quando o valor for exatamente zero.
- **Sintaxe:** `SIGN(valor)`

### TRUNC()
- **Descrição:** Remove as casas decimais de um número mantendo o seu sinal original.
- **Sintaxe:** `TRUNC(valor)`
- **Exemplo:** `TRUNC(10.567)` retorna `10`, e `TRUNC(-10.567)` retorna `-10`.

### MOD()
- **Descrição:** Retorna o resto da divisão entre dois números.
- **Sintaxe:** `MOD(dividendo, divisor)`
- **Exemplo industrial:** `MOD(Minutos_Ligado, 60)`

---

## 6. Funções Exponenciais e Logarítmicas

Ideal para cálculos de grandezas que variam de forma não linear.

### EXP
- **Descrição:** Calcula a função exponencial natural (Número de Euler elevado ao valor).
- **Quando usar:** Curvas de aquecimento/resfriamento industrial.
- **Sintaxe:** `EXP(Taxa_Decaimento)`

### LN e LOG
- **Descrição:** LN e LOG possuem o mesmo comportamento no Calculation Engine. Ambos calculam o logaritmo natural (base e). Para logaritmos em base 10 utilize LOG10.
- **Sintaxe:** `LN(valor)` ou `LOG(valor)`
- **Exemplos comparativos:**
  - `LOG(10)` retorna aproximadamente `2.302` (logaritmo natural).
  - `LOG10(10)` retorna `1` (logaritmo base 10).

### LOG10
- **Descrição:** Retorna o logaritmo de base 10.
- **Quando usar:** Escalas acústicas de compressores, cálculos de pH de fluidos.
- **Exemplo industrial:** `LOG10(Concentracao_Ion)`
- **Aviso:** Utilize `LOG10` quando precisar de logaritmos em base 10.

### POW / POWER
- **Descrição:** Eleva um número base a uma potência.
- **Quando usar:** Cálculos de área, volume de cilindros e tubulações, ou leis da física.
- **Exemplo industrial:** `POWER(Diametro_Tubo, 2)`

---

## 7. Funções Trigonométricas

O Motor de Cálculo oferece suporte total a trigonometria.

> [!IMPORTANT]
> Todas as funções trigonométricas operam em **Radianos**. Se o seu sensor fornece dados em Graus, você deverá convertê-los matematicamente (multiplicando por `PI/180`) antes de aplicar o cálculo.
> 
> **Exemplo de Conversão:**
> `SIN(Graus_Sensor * 3.14159 / 180)`

- **SIN**: Seno.
- **COS**: Cosseno.
- **TAN**: Tangente.
- **ASIN**: Arco-seno. *(Retorna erro se o valor não estiver entre -1 e 1)*
- **ACOS**: Arco-cosseno. *(Retorna erro se o valor não estiver entre -1 e 1)*
- **ATAN**: Arco-tangente.
- **ATAN2**: Arco-tangente considerando quadrantes (recebe `y` e `x`).

**Exemplo industrial:**
Cálculo de posição angular ou defasagem de corrente/tensão (Fator de Potência):
```text
COS(Angulo_Fasorial_Radianos)
```

---

## 8. Funções Hiperbólicas

Utilizadas em análises acadêmicas e modelos termodinâmicos avançados.

- **SINH**: Seno hiperbólico.
- **COSH**: Cosseno hiperbólico.
- **TANH**: Tangente hiperbólica.

---

## 9. Funções Lógicas

As funções lógicas avaliam as condições operacionais para gerar tomadas de decisões e estados binários.

### IF()
- **Descrição:** Executa uma condição e retorna valores diferentes conforme o resultado.
- **Sintaxe:** `IF(condição, valor_se_verdadeiro, valor_se_falso)`
- **Exemplo industrial:**
  ```text
  IF(Temperatura_Motor > 100, 1, 0)
  ```
- **Resultado:** Retornará `1` (Alarme) se a temperatura ultrapassar 100, ou `0` (Normal) caso contrário.

### AND()
- **Descrição:** Retorna verdadeiro (1) quando todas as condições informadas são verdadeiras.
- **Sintaxe:** `AND(condição1, condição2, ...)`
- **Exemplo:**
  ```text
  AND(Temperatura > 80, Vibracao > 5)
  ```

### OR()
- **Descrição:** Retorna verdadeiro (1) quando pelo menos uma das condições for verdadeira.
- **Sintaxe:** `OR(condição1, condição2, ...)`
- **Exemplo:**
  ```text
  OR(Bomba_A_Falha = 1, Bomba_B_Falha = 1)
  ```

### NOT()
- **Descrição:** Inverte uma condição lógica.
- **Sintaxe:** `NOT(condição)`
- **Exemplo:**
  ```text
  NOT(Bomba_Ligada)
  ```

---

## 10. Funções Estatísticas

As funções estatísticas aceitam múltiplos argumentos ao mesmo tempo (listas de tags ou valores manuais) divididos por vírgula.

### SUM
- **Descrição:** Soma dos valores informados.
- **Sintaxe:** `SUM(valor1, valor2, ...)`
- **Exemplo industrial:** `SUM(Producao_Linha1, Producao_Linha2, Producao_Linha3)`

### MIN e MAX
- **Descrição:** Extrai o menor (`MIN`) ou o maior (`MAX`) valor de um conjunto de tags.
- **Sintaxe:** `MAX(valor1, valor2, ...)`
- **Exemplo industrial:** `MAX(Temperatura_Motor1, Temperatura_Motor2)` (identifica o motor mais quente).

### AVERAGE / AVG
- **Descrição:** Calcula a média aritmética (soma dividida pela quantidade). AVG é um alias de AVERAGE e possui o mesmo comportamento.
- **Sintaxe:** `AVERAGE(valor1, valor2, ...)`
- **Exemplo industrial:** `AVERAGE(Temp_Z1, Temp_Z2, Temp_Z3)`

### MEDIAN
- **Descrição:** Retorna a mediana de um conjunto de valores (o valor que está exatamente no meio quando ordenados).
- **Sintaxe:** `MEDIAN(SensorA, SensorB, SensorC)`

### VARIANCE
- **Descrição:** Calcula a variância amostral dos valores informados (compreendendo o nível de dispersão do processo).
- **Sintaxe:** `VARIANCE(Amostra1, Amostra2, Amostra3, Amostra4)`

### STDDEV
- **Descrição:** Calcula o Desvio Padrão amostral (a raiz da variância).
- **Sintaxe:** `STDDEV(Vibracao_Mancal1, Vibracao_Mancal2, Vibracao_Mancal3)` (ideal para detecção de anomalias).

### COUNT
- **Descrição:** Conta a quantidade de valores informados na expressão.
- **Sintaxe:** `COUNT(Tag1, Tag2, Tag3)`

---

## 11. Exemplos Adicionais de Aplicação Industrial

### Indicador de Estado
```text
IF(
 Motor_Running = 1,
 100,
 0
)
```

### Alarme Combinado
```text
IF(
 AND(
  Temperatura > 80,
  Vibracao > 5
 ),
 1,
 0
)
```

### Maior Temperatura entre Equipamentos
```text
MAX(
 Motor_A_Temp,
 Motor_B_Temp,
 Motor_C_Temp
)
```

### Diferença de Processo
```text
ABS(
 Valor_Processo - Setpoint
)
```

### Percentual de Carga
```text
(
 Corrente_Atual /
 Corrente_Nominal
) * 100
```

### Eficiência de Produção
- **Fórmula:**
  ```text
  (
   Producao_Real /
   Producao_Meta
  ) * 100
  ```
- **Descrição:** Calcula o percentual de atendimento da meta.

### Desvio Médio de Processo
- **Fórmula:**
  ```text
  AVERAGE(
   ABS(
    Sensor_Processo - Setpoint
   )
  )
  ```
- **Descrição:** Calcula o desvio médio absoluto entre processo e referência.

### Condição Operacional
- **Fórmula:**
  ```text
  IF(
   AND(
    Motor_Ligado = 1,
    Temperatura < 90
   ),
   1,
   0
  )
  ```
- **Descrição:** Cria um indicador de operação normal.

---

## 12. Limitações e Considerações

- **Funções trigonométricas** utilizam sempre radianos.
- Valores utilizados nos cálculos devem ser **numéricos**.
- **Tags inexistentes** ou escritas de forma equivocada gerarão erro de substituição.
- Funções matemáticas não aceitam valores inválidos no mundo real (ex: raiz de número negativo, divisão por zero).
- O resultado acompanha automaticamente a atualização dos dados do painel sempre que um novo valor de sensor for registrado.

---

## 13. Erros Comuns

O Motor de Cálculos é protegido, mas se um cálculo falhar, um erro será exibido no seu elemento gráfico. Fique atento a:

1. **Divisão por Zero (`10 / 0`)**: Interrompe o cálculo com um erro. Assegure que as tags no denominador não chegam a zero absoluto.
2. **Logaritmo Inválido (`LN(-1)`)**: O Motor recusará logaritmos de números nulos ou negativos.
3. **Trigonometria**: Uso incorreto de graus ao invés de radianos. O Motor assume sempre Radianos.
4. **Funções Vazias (`SUM()`)**: Funções não operam sem argumentos. Você deve passar no mínimo um parâmetro.
5. **Tags Inexistentes**: Se você digitar errado o nome do equipamento, o Motor não conseguirá substituí-lo.

---

## 14. Boas Práticas

- **Use nomes claros:** Mantenha fácil leitura visual no cálculo.
- **Evite cálculos muito grandes:** Divida cálculos complexos. Fórmulas imensas são difíceis de dar manutenção.
- **Teste antes de publicar:** Certifique-se de que o valor final gerado faz sentido para a área.
- **Use `ROUND` para apresentação:** Monitores poluem a tela com muitas casas decimais. Utilize `ROUND` para limpar a exibição.
- **Use `ABS` para diferenças:** Para não ver alarmes negativos apenas porque o sensor B subiu acima do A.
- **Use `MAX/MIN` para limites:** Melhor do que criar múltiplos `IF`s encadeados para encontrar a medição mais crítica.

---

## 15. Tabela de Referência Rápida

| Função | Categoria | Uso | Exemplo |
|--------|-----------|-----|---------|
| **ABS** | Matemática | Distância absoluta ao zero | `ABS(Tag)` |
| **ROUND** | Matemática | Arredondar para decimais definidos | `ROUND(Tag, 2)` |
| **FLOOR** | Matemática | Arredondar sempre para baixo | `FLOOR(Tag)` |
| **CEIL** | Matemática | Arredondar sempre para cima | `CEIL(Tag)` |
| **SIGN** | Matemática | Descobrir a polaridade (1, -1 ou 0) | `SIGN(Tag)` |
| **TRUNC** | Matemática | Remover a parte fracionária | `TRUNC(Tag)` |
| **MOD** | Matemática | Resto de uma divisão inteira | `MOD(Tag, 10)` |
| **EXP** | Exponencial | Função Exponencial Natural | `EXP(Tag)` |
| **LN** | Exponencial | Logaritmo Natural | `LN(Tag)` |
| **LOG** | Exponencial | Logaritmo Natural | `LOG(Tag)` |
| **LOG10** | Exponencial | Logaritmo em base 10 | `LOG10(Tag)` |
| **POW** | Exponencial | Elevado à potência base | `POW(Raio, 2)` |
| **POWER** | Exponencial | Elevado à potência base | `POWER(Raio, 2)` |
| **SIN** | Trigonometria | Seno (Radianos) | `SIN(Fasor_Rad)` |
| **COS** | Trigonometria | Cosseno (Radianos) | `COS(Fasor_Rad)` |
| **TAN** | Trigonometria | Tangente (Radianos) | `TAN(Fasor_Rad)` |
| **ASIN** | Trigonometria | Arco Seno | `ASIN(Tag)` |
| **ACOS** | Trigonometria | Arco Cosseno | `ACOS(Tag)` |
| **ATAN** | Trigonometria | Arco Tangente | `ATAN(Tag)` |
| **ATAN2** | Trigonometria | Arco Tangente considerando quadrantes | `ATAN2(y, x)` |
| **SINH** | Hiperbólica | Seno hiperbólico | `SINH(Tag)` |
| **COSH** | Hiperbólica | Cosseno hiperbólico | `COSH(Tag)` |
| **TANH** | Hiperbólica | Tangente hiperbólica | `TANH(Tag)` |
| **IF** | Lógica | Executar lógicas com condições | `IF(Tag > 10, 1, 0)` |
| **AND** | Lógica | Combinar múltiplas lógicas estritas | `AND(A > 1, B > 1)` |
| **OR** | Lógica | Avaliar se qualquer condição for verdadeira | `OR(A = 1, B = 1)` |
| **NOT** | Lógica | Inverter estado booliano | `NOT(Bomba_Ligada)` |
| **SUM** | Estatística | Soma dos valores informados | `SUM(Vazao1, Vazao2)` |
| **MIN** | Estatística | Identificar o menor valor do conjunto | `MIN(T1, T2)` |
| **MAX** | Estatística | Identificar o maior valor do conjunto | `MAX(T1, T2)` |
| **AVERAGE** | Estatística | Calcular a média do grupo | `AVERAGE(A, B, C)` |
| **AVG** | Estatística | Calcular a média do grupo | `AVG(A, B, C)` |
| **MEDIAN** | Estatística | Mediana (imune a picos distorcidos) | `MEDIAN(A, B, C)` |
| **VARIANCE** | Estatística | Variância da amostragem | `VARIANCE(A, B)` |
| **STDDEV** | Estatística | Desvio padrão da amostragem | `STDDEV(A, B)` |
| **COUNT** | Estatística | Contagem de valores alimentados | `COUNT(A, B)` |
| **PI** | Matemática | Constante Pi | `PI()` |
| **DEGREES** | Matemática | Converter radianos para graus | `DEGREES(Tag)` |
| **RADIANS** | Matemática | Converter graus para radianos | `RADIANS(Tag)` |
| **MAD** | Estatística | Desvio absoluto médio | `MAD(A, B)` |
| **CV** | Estatística | Coeficiente de variação em % | `CV(A, B)` |
| **RANGE** | Estatística | Diferença entre máx e mín | `RANGE(A, B)` |
| **PERCENTILE** | Estatística | Encontra o N-ésimo percentil | `PERCENTILE(A, B, C, 95)` |
| **TIME_DIFF** | Temporal | Diferença de tempo absoluta (s) | `TIME_DIFF(T1, T2)` |
| **CONCAT** | String | Juntar textos | `CONCAT('A', 'B')` |
| **CONTAINS** | String | Verifica se contém substring | `CONTAINS('A', 'B')` |
| **STARTS_WITH**| String | Verifica se inicia com substring | `STARTS_WITH('A', 'B')` |
| **ENDS_WITH** | String | Verifica se termina com substring | `ENDS_WITH('A', 'B')` |
| **UPPER** | String | Transformar para maiúsculas | `UPPER('Tag')` |
| **LOWER** | String | Transformar para minúsculas | `LOWER('Tag')` |
| **TRIM** | String | Remover espaços nas pontas | `TRIM('Tag')` |

### Macros Temporais e Históricas (Sintaxe Estrita PI Vision)

As macros do Calculation Engine realizam buscas de histórico (Event/Recorded Values) de forma assíncrona antes de processarem o resultado das expressões.
O Plugin suporta **exclusivamente a sintaxe nativa do PI Vision** para as funções baseadas em eventos.

| Função PI Vision | Sintaxe | Exemplo (PI Vision) | Descrição |
| --- | --- | --- | --- |
| **TimeEq** | `TimeEq('Tag', start, end, "Estado")` | `TimeEq('STATUS', '-24h', '*', "On")` | Tempo total em que a tag esteve em um estado digital específico durante a janela de tempo informada. |
| **TimeGT** | `TimeGT('Tag', start, end, Valor)` | `TimeGT('TEMP', '-8h', '*', 100)` | Tempo total (s) em que a tag esteve acima de um valor durante a janela. |
| **TimeLT** | `TimeLT('Tag', start, end, Valor)` | `TimeLT('PRESSAO', 'y', 't', 50)` | Tempo total (s) em que a tag esteve abaixo de um valor durante a janela. |
| **TagVal** | `TagVal('Tag'[, time])` | `TagVal('TEMP', '*')` | Valor interpolado da tag no instante solicitado; sem `time`, usa `'*'`. |
| **PrevVal** | `PrevVal('Tag'[, time])` | `PrevVal('TEMP', '*-5m')` | Último valor arquivado até o instante solicitado. |
| **NextVal** | `NextVal('Tag'[, time])` | `NextVal('TEMP', '*-5m')` | Primeiro valor arquivado a partir do instante solicitado. |
| **Average** | `Average('Tag', start, end)` | `Average('TEMP', '*-24h', '*')` | Média temporal dos valores da tag no período especificado. |
| **Total** | `Total('Tag', start, end)` | `Total('VAZAO', '-1d', '*')` | Extensão histórica do plugin; integral linear nos pontos retornados, em unidades/dia, sem boundary/stepped. |
| **Minimum** | `Minimum('Tag', start, end)` | `Minimum('TEMP', '-1h', '*')` | Menor valor alcançado na janela de tempo. |
| **Maximum** | `Maximum('Tag', start, end)` | `Maximum('TEMP', '-1h', '*')` | Maior valor alcançado na janela de tempo. |
| **Count** | `Count('Tag', start, end)` | `Count('TEMP', '-8h', '*')` | Quantidade total de eventos / registros salvos no histórico durante o período. |
| **ValueAtTime** | `ValueAtTime('Tag', timestamp)` | `ValueAtTime('TEMP', 't')` | Obtém o valor interpolado na data/hora especificada. |
| **Moving_Average** | `Moving_Average('Tag', start, end)` | `Moving_Average('T', '-1h', '*')` | Média móvel dos valores da tag. |
| **Moving_Min** | `Moving_Min('Tag', start, end)` | `Moving_Min('T', '-1h', '*')` | Mínimo móvel na janela de histórico. |
| **Moving_Max** | `Moving_Max('Tag', start, end)` | `Moving_Max('T', '-1h', '*')` | Máximo móvel na janela de histórico. |
| **Moving_StdDev**| `Moving_StdDev('Tag', start, end)`| `Moving_StdDev('T', '-1h', '*')`| Desvio padrão móvel. |

### Resolução de Datas Especiais (PI Time)

Qualquer macro histórica ou função de data que aceita um parâmetro de tempo consegue interpretar as abreviações literais do PI Data Archive:
- `'*'` - O momento atual.
- `'t'` ou `'today'` - Hoje à meia-noite.
- `'y'` ou `'yesterday'` - Ontem à meia-noite.
- `'-8h'` - 8 horas antes do momento atual (assume-se `*` como base).
- `'*-24h'` - 24 horas antes do momento atual.
- `'+1d'` - Adiciona 1 dia.

### Limitações atuais da compatibilidade PI

- O datasource histórico não fornece valores de fronteira; estatísticas e
  funções de busca não extrapolam o primeiro/último evento.
- Metadata `stepped` numérica é usada quando o datasource a expõe; sem ela,
  séries numéricas mantêm a interpolação linear legada. Séries digitais são
  tratadas como stepped.
- Não há qualidade histórica por evento suficiente para `PctGood`, desvios PI
  e filtros de qualidade.
- `DigText`, `DigState` e `StateNo` dependem do Digital State Set resolvido pelo
  datasource e falham explicitamente quando ele não está disponível.
- `TagNum` depende de `Id`/`PointID` real na metadata; WebId não é usado como
  substituto.
- `Format` limita-se aos especificadores C numéricos documentados na matriz da
  Fase 9; datas, locale e máscaras compostas não são suportados.
- Funções de data usam o timezone local do navegador, enquanto PI pode operar
  com timezone/configuração diferente; essas funções são classificadas como
  PARCIAIS.

### Fase 19 — PI Web API Calculation Controller

O editor de cálculo usa uma estratégia **server-first** para expressões PE que
não contenham extensões exclusivas do plugin. A expressão completa, sem
substituir tags por valores locais, é enviada pelo handler de recursos da
datasource GPA já configurada ao `GET /calculation/times`, com o WebId do
**PI Data Server** resolvido a partir do binding. O caminho continua relativo,
portanto autenticação, proxy e credenciais permanecem sob responsabilidade do
Grafana e da datasource GPA.

Antes do primeiro uso por datasource/Data Server, o plugin verifica sob demanda
`/calculation/times`, `/calculation/recorded`, `/calculation/intervals` e
`/calculation/summary` com a expressão `1+1`. A resposta normalizada preserva
timestamp, qualidade, unidade, erros e Digital States; `Good=false`, erros PE,
payload inválido e HTTP 401/403/404/405/500/501 não são convertidos em zero.
Erros 500 permanecem transitórios e não são cacheados como rota não suportada.

Se o controller não estiver disponível, o motor local só é usado quando todos
os nomes da expressão pertencem ao catálogo **COMPATÍVEL** (ou aos operadores
PE básicos). Expressões PARCIAIS e NÃO IMPLEMENTADAS retornam erro explícito
nesse cenário; extensões PIMS permanecem exclusivamente locais. O catálogo
continua em 43 COMPATÍVEIS, 59 PARCIAIS e 10 NÃO IMPLEMENTADAS: esta fase não
promoveu funções. A validação em PI/GPA real depende de uma instância conectada
e, portanto, permanece **não verificada em runtime neste repositório**.

#### Checkpoint 19.1 — matriz e gate de runtime

O catálogo conserva o status do executor local e agora registra uma matriz
server-side independente para os mesmos 112 nomes: `localStatus`,
`serverSideStatus`, capability exigida e `verifiedInRuntime`. No checkpoint,
os 112 registros estão como `serverSideStatus=NOT_TESTED` e
`verifiedInRuntime=false`; portanto não há promoção de produto baseada em mocks.

O `Calculation Controller` é o executor prioritário somente para uma expressão
inteira formada por funções PE oficiais. Funções locais exclusivas do PIMS
permanecem no engine local; token não catalogado também não é enviado ao PI.
Em indisponibilidade do controller, o fallback é permitido exclusivamente para
funções localmente COMPATÍVEIS. Resposta PE (`Calc Failed`, erro de parsing,
`Good=false`) é um erro do PI e não aciona fallback.

| Rota | Runtime verificado | Estado neste repositório |
|---|---:|---|
| `/calculation/times` | Não | NOT_TESTED — é a rota escalar usada pelo editor após probe |
| `/calculation/recorded` | Não | NOT_TESTED — probe sob demanda; reservada a resultado por eventos |
| `/calculation/intervals` | Não | NOT_TESTED — probe sob demanda; reservada a série regular |
| `/calculation/summary` | Não | NOT_TESTED — probe sob demanda; reservada a summaries |

Validação real requerida: executar, em uma GPA conectada, `1+1`, `Sqr(9)` e
expressões completas contra tags de teste numérica e digital; depois comparar
TagVal, TagAvg/TagMean, Time*, Find*, PctGood, StDev e funções de calendário
com PI Vision/DataLink/PE. Funções de Scheduler, Alarm State e `NoOutput`
exigem contexto apropriado e não podem ser classificadas por um erro de dados.

#### Checkpoint 19.2 — validação runtime GPA/PI Web API

Foi executada uma validação read-only em 2026-09-10 pelo proxy de recursos da
datasource GPA configurada no Grafana, usando o WebId do PI Data Server. Não
houve URL, credencial, token ou chamada direta ao PI no plugin. As quatro rotas
responderam HTTP 200 a `1+1`: `times` retornou `2` e `Sqr(9)` retornou `3`,
ambos com `Good=true`; `recorded`, `intervals` e `summary` também retornaram
itens válidos e `Good=true` (o summary retornou a estrutura summary aninhada
esperada pelo endpoint).

| Grupo validado no `/calculation/times` | Funções com `Good=true` | Server-side |
|---|---|---|
| Matemática | `Sqr` | SUPPORTED |
| Histórico | `TagVal`, `TagAvg`, `TagMean`, `TagMin`, `TagMax`, `PctGood`, `StDev`, `PrevEvent`, `NextEvent` | SUPPORTED |
| Duração/busca | `TimeEq`, `TimeNE`, `TimeGT`, `TimeGE`, `TimeLT`, `TimeLE`, `FindGT`, `FindGE`, `FindLT`, `FindLE` | SUPPORTED |
| Digital | `DigText`, `DigState`, `StateNo` | SUPPORTED |
| Calendário | `Bod`, `Hour`, `Day`, `IsDST` | SUPPORTED |

`TagMean` retornou resultado diferente de `TagAvg` na mesma janela histórica,
confirmando avaliação semântica pelo PI. Uma expressão composta com `IF`,
`TagVal` e `TagAvg` também retornou sucesso como expressão inteira, sem
decomposição local. `MedianFilt`, `Arma`, `Impulse` e `Delay` retornaram o
Digital State `Calc Failed` com `Good=false` no contexto escalar do editor;
foram registrados como `CONTEXT_DEPENDENT`, não como unsupported. `ParseTime`
não foi classificada: duas formas testadas responderam HTTP 404 sem payload e a
assinatura/contexto corretos ainda precisam de evidência. Alarmes, `NoOutput`,
Bad quality controlado e demais funções continuam NOT_TESTED.

A matriz contém agora 27 SUPPORTED, 4 CONTEXT_DEPENDENT, 0 UNSUPPORTED e 81
NOT_TESTED no executor server-side. Isso não altera o catálogo local (43 C,
59 P, 10 N) nem promove o status de produto: a promoção permanece para o
checkpoint 19.3, após avaliação semântica completa por função.

#### Checkpoint 19.3 — status efetivo do produto

O catálogo passa a manter três status independentes: `localStatus` descreve o
fallback no browser; `serverSideStatus` e `verifiedInRuntime` descrevem a
evidência do Calculation Controller; e `productStatus` descreve o executor
normal no ambiente GPA/PI validado. A resolução efetiva considera a capability
da sessão: se o Calculation Controller não estiver disponível, retorna ao
`localStatus` — isto não libera fallback parcial para uma função que depende do
servidor.

Assim, as 25 funções locais PARCIAIS validadas pelo PI (`TagVal`, agregações,
`Time*`/`Find*` testadas, digitais, `PctGood`, `StDev`, eventos e calendário
testado) possuem `productStatus=COMPATIBLE`; `IsDST` também é COMPATIBLE no
produto apesar de continuar NÃO IMPLEMENTADA localmente. `Sqr` mantém C→C,
agora com evidência server-side. `MedianFilt`, `Arma`, `Impulse` e `Delay`
permanecem CONTEXT_DEPENDENT e não são promovidas.

No ambiente validado, o catálogo efetivo é **69 COMPATÍVEIS, 34 PARCIAIS e 9
NÃO IMPLEMENTADAS**. O catálogo local continua **43/59/10**. Essa promoção é
condicionada à capability runtime do Calculation Controller e não afirma que
toda instalação GPA oferece o mesmo suporte.

#### Checkpoint 19.4 — 34 parciais efetivas

Validação read-only no mesmo PI/GPA real, sempre por `/calculation/times` e
com executor PI Server confirmado. Nomes operacionais de PI Points foram
omitidos; `<tag-numérica>` indica apenas o ponto de teste do ambiente.

| Função | Expressão testada | Server-side | Runtime | Produto | Resultado / observação |
|---|---|---|---:|---|---|
| `Avg` | `Avg(1,2,3)` | SUPPORTED | Sim | C | `2` |
| `Min` | `Min(-2,4,-2)` | SUPPORTED | Sim | C | `-2` |
| `Max` | `Max(-2,4,4)` | SUPPORTED | Sim | C | `4` |
| `Median` | `Median(1,100,2)` / par | SUPPORTED | Sim | C | ímpar `2`, par `3` |
| `Round` | `Round(12.8,10)` | SUPPORTED | Sim | C | `10` |
| `Trunc` | `Trunc(-1.9)` / unidade | SUPPORTED | Sim | C | `-1`, unidade `10` |
| `Ascii` | `Ascii("A")` | SUPPORTED | Sim | C | `65` |
| `Char` | `Char(65)` / `Char(80,73)` | SUPPORTED | Sim | C | `A` / `PI` |
| `Concat` | `Concat("PI","Vision")` | SUPPORTED | Sim | C | `PIVision` |
| `Format` | `%d`, `%f`, `%e`, `%g`, flags, `%%` | SUPPORTED | Sim | C | formatos retornados pelo PI |
| `String` | `String(12.5)` | SUPPORTED | Sim | C | `"12.5"` |
| `Text` | `Text("Value=",12.5)` | SUPPORTED | Sim | C | `"Value=12.5"` |
| `Bom` | `Bom('*')` | NOT_TESTED | Não | P | HTTP 404 vazio; assinatura/controller a confirmar |
| `Bonm` | `Bonm('*')` | NOT_TESTED | Não | P | HTTP 404 vazio; assinatura/controller a confirmar |
| `DaySec` | `DaySec('*')` | NOT_TESTED | Não | P | HTTP 404 vazio; assinatura/controller a confirmar |
| `Minute` | `Minute('*')` | NOT_TESTED | Não | P | HTTP 404 vazio; assinatura/controller a confirmar |
| `Month` | `Month('*')` | NOT_TESTED | Não | P | HTTP 404 vazio; assinatura/controller a confirmar |
| `Noon` | `Noon('*')` | NOT_TESTED | Não | P | HTTP 404 vazio; assinatura/controller a confirmar |
| `ParseTime` | `ParseTime('*')` e ISO | NOT_TESTED | Não | P | formas testadas não produziram payload PI |
| `Second` | `Second('*')` | NOT_TESTED | Não | P | HTTP 404 vazio; assinatura/controller a confirmar |
| `Weekday` | `Weekday('*')` | NOT_TESTED | Não | P | HTTP 404 vazio; assinatura/controller a confirmar |
| `Year` | `Year('*')` | NOT_TESTED | Não | P | HTTP 404 vazio; assinatura/controller a confirmar |
| `Yearday` | `Yearday('*')` | NOT_TESTED | Não | P | HTTP 404 vazio; assinatura/controller a confirmar |
| `EventCount` | `EventCount('<tag-numérica>','*-10m','*')` | SUPPORTED | Sim | C | `20`, igual ao recorded real |
| `FindEq` | valor archived real | SUPPORTED | Sim | C | timestamp do evento correspondente |
| `FindNE` | `FindNE(...,20)` | SUPPORTED | Sim | C | timestamp PI retornado |
| `NextVal` | `NextVal(...,'*-30m')` | SUPPORTED | Sim | C | valor PI retornado |
| `PrevVal` | `PrevVal(...,'*-30m')` | SUPPORTED | Sim | C | valor PI retornado |
| `Range` | `Range(...,'*-1h','*')` | SUPPORTED | Sim | C | range PI retornado |
| `TagTot` | `TagTot(...,'*-1h','*')` | SUPPORTED | Sim | C | total PI retornado |
| `BadVal` | `BadVal('<tag-numérica>')` | CONTEXT_DEPENDENT | Sim | P | ramo Good validado; falta caso Bad controlado |
| `IsSet` | selectors `a`, `q`, `s` | CONTEXT_DEPENDENT | Sim | P | PI executa; faltam flags reais Assertadas |
| `TagNum` | `TagNum('<tag-numérica>')` | NOT_TESTED | Não | P | HTTP 404 vazio; contrato PointID a confirmar |
| `TagBad` | `TagBad('<tag-numérica>')` | CONTEXT_DEPENDENT | Sim | P | ramo Good validado; falta caso Bad controlado |

#### Checkpoint 19.5 — fechamento das 15 parciais efetivas

Foi feita nova validação read-only no runtime GPA/PI real, exclusivamente pelo
proxy da datasource configurada. O controle `Hour('*')` e `Day('*')` respondeu
pela mesma rota `/calculation/times`, confirmando que o contexto do Data Server,
a rota e o método são válidos. Os 11 casos de tempo abaixo foram então testados
com a assinatura PE oficial e com `10-Sep-26 13:45:30`, sem usar o resultado
local como fallback.

| Function | Expression tested | Endpoint | HTTP | Server status | Runtime | Semantic | Product | Notes |
|---|---|---|---:|---|---:|---:|---|---|
| `Bom` | `Bom('10-Sep-26 13:45:30')` | `/calculation/times` | 200 | SUPPORTED | Sim | Sim | C | início do mês retornou `2026-09-01T03:00:00Z` |
| `Bonm` | `Bonm('10-Sep-26 13:45:30')` | `/calculation/times` | 200 | SUPPORTED | Sim | Sim | C | início do mês seguinte retornou `2026-10-01T03:00:00Z` |
| `DaySec` | `DaySec('10-Sep-26 13:45:30')` | `/calculation/times` | 200 | SUPPORTED | Sim | Sim | C | `49530`, segundos desde meia-noite no contexto PI |
| `Minute` | `Minute('10-Sep-26 13:45:30')` | `/calculation/times` | 200 | SUPPORTED | Sim | Sim | C | `45` |
| `Month` | `Month('10-Sep-26 13:45:30')` | `/calculation/times` | 200 | SUPPORTED | Sim | Sim | C | `9` |
| `Noon` | `Noon('10-Sep-26 13:45:30')` | `/calculation/times` | 200 | SUPPORTED | Sim | Sim | C | `2026-09-10T15:00:00Z`, contexto PI UTC-3 |
| `ParseTime` | `ParseTime("*")`, `ParseTime("t")`, `ParseTime("y")`, `ParseTime("*-1h")`, `ParseTime("t+8h")`, `ParseTime("y+1d")` | `/calculation/times` | 200 | SUPPORTED | Sim | Sim | C | string PE entre aspas duplas; entrada inválida retorna `Good=false` |
| `Second` | `Second('10-Sep-26 13:45:30')` | `/calculation/times` | 200 | SUPPORTED | Sim | Sim | C | `30` |
| `Weekday` | `Weekday('10-Sep-26 13:45:30')` | `/calculation/times` | 200 | SUPPORTED | Sim | Sim | C | `5` (quinta-feira; domingo = 1) |
| `Year` | `Year('10-Sep-26 13:45:30')` | `/calculation/times` | 200 | SUPPORTED | Sim | Sim | C | `2026` |
| `Yearday` | `Yearday('10-Sep-26 13:45:30')` | `/calculation/times` | 200 | SUPPORTED | Sim | Sim | C | `253`, base 1..366 |
| `TagNum` | `TagNum("SINUSOID")` | `/calculation/times` | 404 | NOT_TESTED | Não | Não | P | resposta `{}`; sem payload PI, `Errors`, ou mensagem Grafana/GPA; PointID de referência é `1`, mas não foi inferido como resultado |
| `BadVal` | `BadVal(1)` | `/calculation/times` | 200 | CONTEXT_DEPENDENT | Sim | Não | P | Good conhecido retornou `0`; falta evento PI real com estado Bad |
| `IsSet` | `IsSet(1,"a")`, `IsSet(1,"q")`, `IsSet(1,"s")` | `/calculation/times` | 200 | CONTEXT_DEPENDENT | Sim | Não | P | seletores executaram e retornaram `0`; faltam flags Annotated/Substituted/Questionable reais |
| `TagBad` | `TagBad('<tag-digital>')` | `/calculation/times` | 200 | CONTEXT_DEPENDENT | Sim | Não | P | estado digital normal retornou `0`; falta evento PI anormal/Bad controlado |

Os 404 foram respostas do proxy GPA com `Content-Type: application/json` e
corpo `{}`, sem `Errors` nem mensagem de Grafana/GPA. Como `Hour`/`Day` e as
demais expressões válidas retornam 200 no mesmo endpoint e Data Server, a
evidência aponta para expressão/contrato da função no Calculation Controller,
não para indisponibilidade da rota, do método ou do contexto. O código não
converte esse resultado em `unsupported` e não altera o status da rota.

`ParseTime("not-a-time")` foi uma rejeição PI real (`HTTP 200`, `Good=false`),
portanto não é tratada como o valor local “uma hora atrás”. Para `TagNum`, o
PointID de referência foi obtido pela metadata real do ponto e permaneceu fora
do resultado porque o controller respondeu 404. Para `BadVal`, `IsSet` e
`TagBad`, não foram fabricados estados de qualidade no frontend nem escritos
valores no processo; sem eventos reais com as flags necessárias, não há
promoção semântica.

O catálogo local permanece **43 C / 59 P / 10 N**. A matriz agora distingue
`verifiedInRuntime` de `semanticValidated`: o executor server-side ficou em
**57 SUPPORTED / 7 CONTEXT_DEPENDENT / 0 UNSUPPORTED / 48 NOT_TESTED** e o
produto em **99 C / 4 P / 9 N**. Foram promovidas somente as 11 funções de
tempo listadas acima; `TagNum`, `BadVal`, `IsSet` e `TagBad` permanecem
PARCIAIS pelos cenários explicitamente faltantes.

No checkpoint 19.4 foram promovidas: `Avg`, `Min`, `Max`, `Median`, `Round`,
`Trunc`, `Ascii`, `Char`, `Concat`, `Format`, `String`, `Text`, `EventCount`,
`FindEq`, `FindNE`, `NextVal`, `PrevVal`, `Range` e `TagTot`. O ambiente
validado passa a **88 COMPATÍVEIS, 15 PARCIAIS e 9 NÃO IMPLEMENTADAS**; o
catálogo local segue **43/59/10**. Server-side: 46 SUPPORTED, 7
CONTEXT_DEPENDENT, 0 UNSUPPORTED e 59 NOT_TESTED.

| **SQRT** | Matemática | Raiz quadrada | `SQRT(Tag)` |
| **YEAR** | Data/Tempo | Ano da data atual ou de evento | `YEAR('*')` |
| **MONTH** | Data/Tempo | Mês da data atual ou de evento | `MONTH('*')` |
| **DAY** | Data/Tempo | Dia do mês atual ou de evento | `DAY('*')` |
| **HOUR** | Data/Tempo | Hora atual ou de evento | `HOUR('*')` |
| **MINUTE** | Data/Tempo | Minuto atual ou de evento | `MINUTE('*')` |


| Função | Uso | Exemplo |
|--------|-----|---------|
| **INTERPOLATE** | Interpolar no tempo (sinônimo: **VALUE_AT_TIME**) | `INTERPOLATE('Tag', '*')` |
| **FIRST_VALUE** | Primeiro valor da janela | `FIRST_VALUE('Tag', '-1d')` |
| **LAST_VALUE** | Último valor da janela | `LAST_VALUE('Tag', '-1d')` |
| **EVENT_COUNT** | Contar os eventos (sinônimo: **COUNT_VALUES**) | `EVENT_COUNT('Tag', '-1d')` |
| **STATE_DURATION**| Tempo contínuo no estado | `STATE_DURATION('Tag', "On", '-8h')` |
| **TIME_EQ** | Tempo total igual ao estado na janela | `TIME_EQ('Tag', "On", '-8h')` |
| **TIME_NE** | Tempo total diferente do estado na janela | `TIME_NE('Tag', "On", '-8h')` |
| **TIME_GT** | Tempo total maior que um limite numérico na janela | `TIME_GT('Tag', 50, '-8h')` |
| **TIME_LT** | Tempo total menor que um limite numérico na janela | `TIME_LT('Tag', 10, '-8h')` |
| **MOVING_AVERAGE**| Média móvel temporal na janela | `MOVING_AVERAGE('Tag', '-1h')` |
| **MOVING_MIN** | Mínimo móvel na janela | `MOVING_MIN('Tag', '-1h')` |
| **MOVING_MAX** | Máximo móvel na janela | `MOVING_MAX('Tag', '-1h')` |

### Funções de Qualidade PI
Todas essas funções retornam 1 (verdadeiro) ou 0 (falso) para validar tags:
- `BadVal('Tag')`: 1 para qualidade PI explicitamente Good=false ou valor ausente; 0 para valor digital/numericamente válido sem flag de erro.
- `IS_GOOD('Tag')`: O valor é confiável.
- `IS_BAD('Tag')`: O valor não é confiável (ex: I/O Timeout).
- `IS_QUESTIONABLE('Tag')`: O valor está com flag de questionável no PI.
- `IS_SUBSTITUTED('Tag')`: O valor foi sobreescrito manualmente.
- `IS_NO_DATA('Tag')`: A tag está sem dados (Pt Created / No Data).
- `QUALITY('Tag')` e `STATUS_CODE('Tag')`: Recuperam o código interno do estado digital (Int32).

O datasource preserva os campos de qualidade disponíveis no valor atual e no
histórico normalizado (por
exemplo `Good`, `Questionable` e `Substituted`, inclusive dentro de
`quality`). O editor mantém esse objeto ao chamar o Calculation Engine; assim,
zero numérico e estados digitais como `On`/`Off` não são classificados como
ruins por seu tipo. Estados de sistema do PI (como `Shutdown`/`No Data`) são
ruins quando o datasource os informa como `Good=false` ou quando não há valor.
Sem uma flag Good explícita, `BadVal` não inventa uma qualidade para valores
válidos. A qualidade histórica continua opcional e `PctGood` continua não
implementado; a qualidade não é inferida quando ausente.

### Archive Search / Find Functions

As funções `Find*` retornam um timestamp Unix em segundos, correspondente ao
instante mais próximo do início da janela em que a condição é satisfeita.
Janelas invertidas são consultadas em ordem reversa. Séries numéricas usam
interpolação linear entre eventos disponíveis; não há extrapolação antes do
primeiro ou depois do último ponto porque o datasource atual não fornece
boundary values. Ausência de correspondência e qualidade inválida retornam
erro, não zero ou No Data silencioso.

| Function | Status | Return | Numeric | Digital | Notes |
| --- | --- | --- | --- | --- | --- |
| `FindEq(Tag, Start, End, Value)` | PARCIAL | Timestamp (s) | Sim, interpolado | Sim, stepped | Sem extrapolação/boundary; erro sem correspondência |
| `FindNE(Tag, Start, End, Value)` | PARCIAL | Timestamp (s) | Sim, interpolado | Sim, stepped | Sem extrapolação/boundary; erro sem correspondência |
| `FindGT(Tag, Start, End, Value)` | PARCIAL | Timestamp (s) | Sim, interpolado | Não | Comparação digital não é semântica; erro explícito |
| `FindGE(Tag, Start, End, Value)` | PARCIAL | Timestamp (s) | Sim, interpolado | Não | Comparação digital não é semântica; erro explícito |
| `FindLT(Tag, Start, End, Value)` | PARCIAL | Timestamp (s) | Sim, interpolado | Não | Comparação digital não é semântica; erro explícito |
| `FindLE(Tag, Start, End, Value)` | PARCIAL | Timestamp (s) | Sim, interpolado | Não | Comparação digital não é semântica; erro explícito |

### PI Point Metadata

As funções abaixo consultam os metadados reais do PI Point pela API de recurso
do datasource PI configurado. Não há inferência a partir de valores atuais ou
do histórico; quando a propriedade não estiver disponível, a avaliação retorna
erro.

| Função | Status | Retorno | Fonte |
| --- | --- | --- | --- |
| `TagDesc('Tag')` | COMPATÍVEL | String | Atributo `Descriptor`/`Description` do PI Point |
| `TagEU('Tag')` | COMPATÍVEL | String | Atributo `EngineeringUnits`/`EngUnits` |
| `TagExDesc('Tag')` | COMPATÍVEL | String | Atributo `ExDesc`/`ExtendedDescriptor`, quando exposto pelo PI Web API |
| `TagName('Tag')` | COMPATÍVEL | String | Campo `Name` do PI Point |
| `TagSource('Tag')` | COMPATÍVEL | String | Atributo `PointSource` |
| `TagSpan('Tag')` | COMPATÍVEL | Número | Atributo `Span` |
| `TagZero('Tag')` | COMPATÍVEL | Número | Atributo `Zero` |
| `TagType('Tag')` | COMPATÍVEL | String | Atributo `PointType` |
| `TagTypVal('Tag')` | COMPATÍVEL | Número ou String | Atributo `TypicalValue`/`TypicalVal`, quando exposto pelo PI Web API |
| `TagNum('Tag')` | PARCIAL | Número inteiro | Depende de `Id`/`PointID` numérico real exposto pelo datasource; WebId, GUID e identificadores compostos não são substitutos |

### Classificação nominal final das 53 PARCIAIS

No último checkpoint, nenhuma função restante é categoria A. `B` significa
capability externa não garantida pela GPA configurada; `C` significa semântica
PE ainda não suficientemente comprovada.

| Function | Status | Category | Exact blocker |
|---|---|---|---|
| Avg | PARCIAL | B | Tipos PI temporais e sua semântica completa não são garantidos |
| Max | PARCIAL | B | Tipos PI temporais e sua semântica completa não são garantidos |
| Median | PARCIAL | C | Casos PE para tipos históricos não suficientemente confirmados |
| Min | PARCIAL | B | Tipos PI temporais e sua semântica completa não são garantidos |
| Round | PARCIAL | B | Arredondamento temporal depende do timezone do PI Server |
| Trunc | PARCIAL | B | Truncamento temporal depende do timezone do PI Server |
| Ascii | PARCIAL | C | Encoding e limites PE de caracteres não comprovados |
| Char | PARCIAL | C | Encoding e limites PE de caracteres não comprovados |
| Concat | PARCIAL | C | Coerção e casos da função PE não suficientemente confirmados |
| Format | PARCIAL | C | Subconjunto C implementado; sprintf completo não comprovado |
| String | PARCIAL | B | Formatação temporal depende do timezone do PI Server |
| Text | PARCIAL | B | Formatação temporal depende do timezone do PI Server |
| DigText | PARCIAL | B | Digital State Set global não é garantido pela datasource |
| Bod | PARCIAL | B | Timezone do PI Server não é exposto |
| Bom | PARCIAL | B | Timezone do PI Server não é exposto |
| Bonm | PARCIAL | B | Timezone do PI Server não é exposto |
| Day | PARCIAL | B | Timezone do PI Server não é exposto |
| DaySec | PARCIAL | B | Timezone do PI Server não é exposto |
| Hour | PARCIAL | B | Timezone do PI Server não é exposto |
| Minute | PARCIAL | B | Timezone do PI Server não é exposto |
| Month | PARCIAL | B | Timezone do PI Server não é exposto |
| Noon | PARCIAL | B | Timezone do PI Server não é exposto |
| ParseTime | PARCIAL | B | Timezone/gramática efetiva do PI Server não é exposta |
| Second | PARCIAL | B | Timezone do PI Server não é exposto |
| Weekday | PARCIAL | B | Timezone do PI Server não é exposto |
| Year | PARCIAL | B | Timezone do PI Server não é exposto |
| Yearday | PARCIAL | B | Timezone do PI Server não é exposto |
| EventCount | PARCIAL | B | Origem recorded e qualidade por evento dependem da GPA |
| FindEq | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| FindGE | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| FindGT | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| FindLE | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| FindLT | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| FindNE | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| NextVal | PARCIAL | B | Próximo evento recorded inequívoco não é garantido |
| PrevVal | PARCIAL | B | Evento recorded anterior inequívoco não é garantido |
| Range | PARCIAL | B | Boundary e tratamento de Bad não são garantidos |
| TagAvg | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| TagMax | PARCIAL | B | Boundary e qualidade por evento não são garantidos |
| TagMean | PARCIAL | B | Qualidade/origem dos eventos recorded não é garantida |
| TagMin | PARCIAL | B | Boundary e qualidade por evento não são garantidos |
| TagTot | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| TagVal | PARCIAL | B | Valor exato/interpolado, Step e qualidade dependem da GPA |
| TimeEq | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| TimeGE | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| TimeGT | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| TimeLE | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| TimeLT | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| TimeNE | PARCIAL | B | Boundary, Step e qualidade por evento são opcionais |
| BadVal | PARCIAL | B | Estados de qualidade/sistema PI não são universalmente expostos |
| DigState | PARCIAL | B | Digital State Set e códigos globais não são garantidos |
| StateNo | PARCIAL | B | Digital State Set e códigos globais não são garantidos |
| TagNum | PARCIAL | B | PointID numérico real não é garantido; WebId não substitui PointID |

#### Checkpoint 19.6 — fechamento das quatro parciais efetivas

`TagNum` foi validada separadamente do Calculation Controller. A metadata PI
obtida pela datasource GPA retornou `Id/PointID` inteiro real para o mesmo
ponto usado nos controles `TagVal`, `TagName` e `TagDesc`; WebId/GUID nunca são
aceitos como substitutos. O produto mantém `localStatus=PARTIAL` e
`serverSideStatus=NOT_TESTED` para o controller, mas usa a fonte de execução
`PI_WEB_API_METADATA`, com cache por datasource/servidor/ponto, e passa a
`productStatus=COMPATIBLE`.

| Function | Execution source | Expression/resource tested | Runtime verified | Semantic validated | Server status | Product status | Remaining blocker |
|---|---|---|---:|---:|---|---|---|
| `TagNum` | `PI_WEB_API_METADATA` | `TagNum("<tag-real>")` / `/points/{webId}` e busca no Data Server | Sim | Sim | NOT_TESTED (Calculation Controller) | C | nenhum para o caminho de metadata; controller ainda responde 404 `{}` |
| `BadVal` | `CALCULATION_CONTROLLER` | `BadVal(1)` | Sim | Não | CONTEXT_DEPENDENT | P | falta valor/evento PI real com `Good=false` |
| `IsSet` | `CALCULATION_CONTROLLER` | `IsSet(1,"a")`, `IsSet(1,"q")`, `IsSet(1,"s")` | Sim | Não | CONTEXT_DEPENDENT | P | falta evento real positivo para Annotated, Questionable e Substituted |
| `TagBad` | `CALCULATION_CONTROLLER` | `TagBad('<tag-digital>')` | Sim | Não | CONTEXT_DEPENDENT | P | falta ponto/evento digital PI em estado anormal/Bad |

O `Id` do recurso usado como controle foi inteiro e igual ao PointID real; a
regressão rejeita valores GUID/WebId. `BadVal`, `IsSet` e `TagBad` não foram
promovidas por ausência de cenários de qualidade adequados, sem criação de
estados sintéticos ou escrita no PI. O total final do produto é **100 C / 3 P /
9 N**; o catálogo local permanece **43 C / 59 P / 10 N**.

**FASE 19 ENCERRADA.** As nove funções NÃO IMPLEMENTADAS permanecem congeladas.

### Fase 20 — fechamento das nove funções não implementadas efetivas

A investigação foi feita exclusivamente por chamadas read-only à datasource
GPA existente, usando o PI Calculation Controller e os quatro modos já
comprovados. As assinaturas foram confrontadas com a referência de
Performance Equations; `MedianFilt(tagname, runflag, number)`,
`Arma(in, runflag, (a...), (b...))`, `Impulse(tagname, runflag, i...)`,
`Delay(x, runflag, n)` e as quatro `Alm*` não foram aproximadas localmente.

| Function | Official semantics | Execution mode tested | PI runtime result | Server status | Runtime verified | Semantic validated | Product status | Exact blocker |
|---|---|---|---|---|---:|---:|---|---|
| `MedianFilt` | Mediana dos últimos `N` valores de uma série; `N >= 3` | `times`, `recorded`, `intervals` | `Calc Failed`, `Good=false` | CONTEXT_DEPENDENT | Sim | Não | N | controller não forneceu a sequência histórica/estado do filtro |
| `Arma` | Modelo ARMA com coeficientes e entradas/saídas anteriores; `runflag=0` reseta | `times`, `recorded`, `intervals` | `Calc Failed`, `Good=false` | CONTEXT_DEPENDENT | Sim | Não | N | requer estado sequencial do Scheduler PE, não reproduzido pelo request |
| `Impulse` | Resposta de impulso com memória de amostras anteriores | `times`, `recorded`, `intervals` | `Calc Failed`, `Good=false` | CONTEXT_DEPENDENT | Sim | Não | N | requer sequência/intervalo de cálculo e estado persistente |
| `Delay` | Valor de `N` intervalos de cálculo anteriores | `times`, `recorded`, `intervals` | `Calc Failed`, `Good=false` | CONTEXT_DEPENDENT | Sim | Não | N | intervalo de cálculo e histórico entre avaliações não disponíveis |
| `NoOutput` | Suprime a gravação/envio do resultado PE | `times`, expressão condicional PE | `No Sample`, `Good=false` | SUPPORTED | Sim | Sim | N | plugin é somente leitura e não possui pipeline de supressão/escrita |
| `AlmAckStat` | Código de acknowledgement do Alarm State: 0, 1 ou 2 | `times`, `recorded`, `intervals` | 200; `0` no ponto digital, sem Alarm State | CONTEXT_DEPENDENT | Sim | Não | N | falta ponto/contexto Alarm State real para validar acknowledge |
| `AlmCondition` | Código da condição do Alarm State | `times`, `recorded`, `intervals` | 200; `0` no ponto digital, sem Alarm State | CONTEXT_DEPENDENT | Sim | Não | N | falta condição de alarme real conhecida |
| `AlmCondText` | Texto da condição do Alarm State | `times`, `recorded`, `intervals` | 200; vazio/`No Data` sem Alarm State | CONTEXT_DEPENDENT | Sim | Não | N | falta texto de condição de alarme real |
| `AlmPriority` | Prioridade do Alarm State; 0 significa não-unacknowledgeable | `times`, `recorded`, `intervals` | 200; `0` no ponto digital, sem Alarm State | CONTEXT_DEPENDENT | Sim | Não | N | falta prioridade de alarme real conhecida |

`summary` também foi sondado para as funções dinâmicas e de alarme, mas não é
o modo semanticamente adequado para funções de estado/valor e não alterou a
classificação. `NoOutput` foi testado com a forma PE condicional `if ... then
NoOutput() else ...`; o marcador `No Sample` confirma o comportamento do
controller, mas não equivale a suprimir um resultado de cálculo no frontend.

Não foi criado estado ARMA/Delay/Impulse, não foram usados timers, não houve
escrita no PI e nenhum alarme foi fabricado. Os quatro `Alm*` permanecem
context-dependent porque um HTTP 200 em ponto digital comum não prova a
semântica do subsistema Alarm State.

Status final: local **43 C / 59 P / 10 N**; server-side **58 SUPPORTED / 11
CONTEXT_DEPENDENT / 0 UNSUPPORTED / 43 NOT_TESTED**; produto **100 C / 3 P /
9 N**. Não houve promoção das nove funções: todas permanecem N por exigirem
Scheduler/estado persistente, supressão de escrita ou Alarm State não
disponível no contexto validado.

**FASE 20 ENCERRADA.** Não iniciar nova fase automaticamente.

#### Fase 21 — auditoria final e hardening

Esta seção congela o estado auditado após a Fase 20. Não foram adicionadas
funções PI nem alterados parser, UI, Calculation Engine ou o caminho histórico.

| Matriz | Compatíveis | Parciais | Não implementadas | Outros | Total |
|---|---:|---:|---:|---:|---:|
| Local Engine | 43 | 59 | 10 | — | 112 |
| PI server-side | — | — | — | 58 supported / 11 context-dependent / 0 unsupported / 43 not-tested | 112 |
| Product effective | 100 | 3 | 9 | — | 112 |

As 43 funções localmente compatíveis não dependem de teste server-side para
continuarem `productStatus=compatible`. As 100 funções efetivas têm executor
local compatível, Calculation Controller validado (`supported` +
`verifiedInRuntime` + `semanticValidated`) ou metadata PI equivalente para
`TagNum`. `executionSource` distingue `calculation-controller`,
`pi-web-api-metadata` e `local`; metadata nunca é rotulada como Controller.

As três parciais permanecem sem promoção:

| Função | Status | Bloqueio exato | Necessário para completar |
|---|---|---|---|
| `BadVal` | P | Cenário real com valor PI `Bad` não foi validado | Evento PI com qualidade `Bad` e comparação semântica |
| `IsSet` | P | Não foram comprovados eventos reais `Annotated`, `Substituted` e `Questionable` | Flags PE reais no resultado PI |
| `TagBad` | P | Não foi validado um PI Point/estado real `Bad` | Ponto PI com qualidade ruim comprovada |

As nove não implementadas efetivas também permanecem N:

| Função | Product | Server | Bloqueio e requisito para completar |
|---|---|---|---|
| `Arma` | N | CONTEXT_DEPENDENT | Estado de entradas/saídas anteriores do PE Scheduler; requer execução Scheduler persistente |
| `Impulse` | N | CONTEXT_DEPENDENT | Estado dinâmico e avaliações anteriores; requer contexto Scheduler real |
| `MedianFilt` | N | CONTEXT_DEPENDENT | Sequência dos últimos eventos e estado do filtro; requer janela PE por eventos comprovada |
| `Delay` | N | CONTEXT_DEPENDENT | Intervalos anteriores do Scheduler; requer resultados persistentes de avaliações |
| `NoOutput` | N | SUPPORTED | PI reconhece supressão, mas o plugin é read-only; requer pipeline de suppress-output/escrita |
| `AlmAckStat` | N | CONTEXT_DEPENDENT | Alarm State real não foi acessado; requer subsistema/contexto de alarmes |
| `AlmCondition` | N | CONTEXT_DEPENDENT | Alarm State real não foi acessado; requer condição de alarme real |
| `AlmCondText` | N | CONTEXT_DEPENDENT | Alarm State real não foi acessado; requer texto de condição real |
| `AlmPriority` | N | CONTEXT_DEPENDENT | Alarm State real não foi acessado; requer prioridade de alarme real |

`NoOutput` possui evidência de reconhecimento pelo Controller, mas recebe
`productStatus=not-implemented` explicitamente porque a capacidade server-side
não equivale ao pipeline de produto. Não há aproximação por cache frontend,
estado React/module, timer, zero, alarme sintético, timezone do navegador ou
escrita PI.

O fluxo de execução permanece:

```text
expressão PE → classificador → Calculation Controller (preferencial)
             → resultado PI normalizado

extensão PIMS → Calculation Engine local

Controller indisponível → fallback local somente para função localmente C
Controller alcançado com Calc Failed/Good=false → erro PI, sem fallback local
função desconhecida → não enviada indiscriminadamente ao PI
```

O fallback diferencia indisponibilidade de endpoint, permissão/autenticação,
HTTP 500, 404 de recurso, resposta inválida, `Calc Failed`, erro de parsing,
`No Data` e `Good=false`; nenhum desses casos vira zero silenciosamente.
HTTP 200 não é considerado sucesso numérico por si só. O caminho usa apenas a
datasource GPA configurada e `getPiResource` aceita exclusivamente paths
relativos, rejeitando URLs absolutas e protocol-relative.

As chaves de cache e locks incluem o contexto do datasource/ponto/expressão e
as Promises são removidas tanto em resolução quanto em rejeição. Consultas
iguais compartilham uma Promise; consultas diferentes permanecem separadas.
O editor aguarda pendências e reavalia automaticamente, com limite de dez
tentativas, sem polling ou segundo clique.

#### Investigação da 16ª suíte

O primeiro run completo apresentou 16 falhas porque
`src/calculations/__tests__/piCompatibilityCatalog.test.ts` capturou uma
regra provisória excessivamente ampla que também impedia a promoção de
`IsDST`. Essa falha foi corrigida restringindo a exceção a `NoOutput`. No run
completo final, o catálogo passou e o resultado voltou a 15 suites falhas:

`MiniSheetsPanel.test.tsx`; `colorChange.integration.test.tsx`;
`history.integration.test.tsx`; `CalculationsPanel.test.tsx`;
`piPointDrop.integration.test.tsx`; `trendCursor.integration.test.tsx`;
`rectangle.integration.test.tsx`; `librarySymbolDrop.integration.test.tsx`;
`multistate.integration.test.tsx`; `calculationDrop.integration.test.tsx`;
`groupSymbols.integration.test.tsx`; `gaugeBar.integration.test.tsx`;
`BarChartPropertiesPanel.test.tsx`; `GaugeElementView.test.tsx`;
`createBarChart.test.ts`.

Assim, a 16ª suíte foi uma falha transitória do próprio teste de auditoria,
não uma regressão do core. `CalculationsPanel` continua com expectativa
stale sobre a mensagem de validação; as demais falhas pertencem aos grupos de
UI já existentes e não foram alteradas nesta fase.

Validações finais: catálogo programático com 112 nomes únicos e contagens
`43/59/10`, `58/11/0/43` e `100/3/9`; typecheck aprovado; testes focados com
6 suites e 207 testes aprovados; suíte completa com 75 suites aprovadas,
15 falhas e 982 testes aprovados/39 falhos; `git diff --check` aprovado;
zero `console.log`, `console.debug` e `console.info` em `src/`.

**AUDITORIA FINAL CONCLUÍDA.** Não iniciar a Fase 22 automaticamente.

#### Fase 22.1 — decoder de Alarm State Sets

Checkpoint limitado a `AlmAckStat`, `AlmCondition`, `AlmCondText` e
`AlmPriority`. As outras cinco funções da Fase 22 não foram alteradas.

O decoder em `piDataSource.ts` reutiliza `getPiPointDigitalStates` através da
datasource GPA configurada. Ele só aceita um conjunto que contenha todos os
elementos estruturais necessários: estado de ausência de alarme, marcador
terminal `Nack MaxPriority` com código numérico, quantidade determinística de
condições e estados de condição finais. Um Digital State Set comum é rejeitado
com erro explícito; nomes visuais isolados não são suficientes.

Para o layout documentado do `pialarm33`, o valor é tratado como offset
iniciado em zero. Com três estados de acknowledgement e prioridade máxima
`M`, o estado ativo é decodificado por:

```text
condition = floor((code - 1) / (3*M)) + 1
ack        = floor(((code - 1) % (3*M)) / M)
priority   = ((code - 1) % M) + 1
```

Os estados de condição finais fornecem o `conditionText` e o código de
condição; não é usado o índice arbitrário do array. `ack=0/1/2` significa,
respectivamente, acknowledged/no alarm, unacknowledged e missed alarm. Um
estado de condição sem prioridade retorna prioridade zero. Essa estrutura e
as assinaturas das funções são descritas na referência de PI Alarm State Set
Encoding and Decoding ([PI Server Applications User's Guide](https://manualzz.com/doc/28884584/rockwell-automation-pi-server-applications--pi-performanc...)).

O resultado é integrado ao `Calculation Engine` por macro síncrona com o mesmo
Promise lock de Digital State Sets: enquanto os estados são carregados, a
avaliação fica pendente; depois o decoder produz número/texto sem expor o
objeto interno ao usuário. Sets não reconhecidos, ponto não digital e estado
ausente terminam em erro explícito.

| Função | Antes | Depois | Fonte | Runtime |
|---|---|---|---|---|
| `AlmAckStat` | N | N | decoder estrutural de Digital State Set PI | Sem Alarm State Set real disponível para golden runtime |
| `AlmCondition` | N | N | condição final e fórmula de offset PI | Sem Alarm State Set real disponível para golden runtime |
| `AlmCondText` | N | N | texto do estado de condição PI | Sem Alarm State Set real disponível para golden runtime |
| `AlmPriority` | N | N | prioridade derivada do offset PI | Sem Alarm State Set real disponível para golden runtime |

Os testes cobrem `pialarm33` com ausência de alarme, alarmes novos,
acknowledged, missed, prioridades 1 e 2, condição 2 e rejeição de um conjunto
digital comum. A promoção individual fica pendente até resolver um set e um
estado reais via GPA e comparar os quatro resultados com o PE Scheduler.

**CHECKPOINT 22.1 CONCLUÍDO.** Parar antes de iniciar MedianFilt.

#### Fase 22.2 — auditoria de `MedianFilt`

Checkpoint limitado a `MedianFilt`. `NoOutput`, `Arma`, `Impulse`, `Delay` e
as quatro funções `Alm*` não foram alterados nesta etapa.

Assinatura auditada: `MedianFilt(tagname, runflag, number)`. `tagname` deve
ser um PI Point numérico, `runflag` não zero habilita o filtro e `number` deve
ser inteiro maior ou igual a 3. A função trabalha sobre uma série temporal e
não equivale a chamar `Median` sobre argumentos escalares.

| Aspecto | Resultado | Evidência |
|---|---|---|
| Controller `/calculation/times` | `Calc Failed`, `Good=false` | Probe read-only com tag numérica real, `MedianFilt('<tag-numérica>',1,3)` |
| Controller `/calculation/recorded` | `Calc Failed`, `Good=false` | Probe read-only em intervalo histórico com eventos |
| Controller `/calculation/intervals` | `Calc Failed`, `Good=false` | Probe read-only em intervalo regular |
| Últimos N valores | Não determinado | O Controller não produziu série; `/streams/{webId}/recorded` não prova equivalência com a série PE |
| Evento exatamente no evaluationTime | Não determinado | Não há golden PE válido |
| Snapshot versus archive | Não determinado | Não há resultado PE comparável em `'*'` |
| `N=3` | Não promovido | A fórmula matemática isolada não fecha startup/boundary |
| `N=4` | Não promovido | Não há evidência PI para a mediana de quantidade par |
| `runflag=0` | Não implementado/inconclusivo | A referência consultada confirma habilitação por valor não zero, mas não confirma reset ou hold |
| Digital States | Regra documentada, não promovida | Estados digitais devem ser ignorados; não houve golden com mistura numérico/digital |
| Todos Digital States | Erro documentado, não promovido | Não há resposta PE real que permita validar o valor de erro |
| Histórico insuficiente | Não determinado | Startup não foi exposto pelo Controller testado |
| `Good=false` numérico | Não determinado | A referência disponível não fecha essa política |
| Reload/out-of-order | Determinismo não comprovado | Sem reconstrução local implementada e sem golden PI |

O histórico `recorded` existente pode recuperar eventos reais via GPA, mas não
fornece, por si só, a definição comprovada de “last specified number of values”
usada pelo PE: não se sabe neste ambiente se entram snapshot, boundary, evento
no instante exato, eventos `Bad` ou avaliações do Scheduler. Buscar uma janela
arbitrária seria incorreto; criar paginação sem essa semântica também não
resolveria a equivalência. Por isso nenhum `evaluateMedianFilt` local foi
adicionado, nenhum estado frontend foi usado e a fonte não foi chamada de
Calculation Controller.

`MedianFilt` permanece `localStatus=N`, `serverSideStatus=CONTEXT_DEPENDENT`,
`productStatus=N`, sem promoção. Para completar seria necessário um golden
real do PE Scheduler/Controller em contexto que exponha a sequência, ou prova
documental/runtime de que os eventos `recorded` do PI são exatamente a série
do filtro, incluindo boundary, snapshot, startup, `runflag=0`, `N` par,
qualidade e descarte de Digital States. A contagem do produto permanece
100 C / 3 P / 9 N.

**CHECKPOINT 22.2 CONCLUÍDO.** Parar antes de iniciar NoOutput.

#### Fase 22.3 — `NoOutput`

Checkpoint limitado a `NoOutput`. As oito funções restantes não foram
alteradas.

No runtime PI/GPA validado, a forma condicional reconhecida pelo Calculation
Controller retornou um `Item` com `Good=false` e o valor digital de sistema
`{ Name: "No Sample", Value: 211, IsSystem: true }`. Esse formato específico
é a evidência usada pelo adapter; `Good=false` genérico, valor vazio, `null`,
`No Data` ou `Calc Failed` continuam sendo erro e não são convertidos em
`NO_OUTPUT`. As consultas foram read-only nos endpoints `times`, `recorded` e
`intervals`; as formas semânticas não condicionais que não retornaram esse
marcador não foram reinterpretadas.

O adapter expõe internamente apenas `{ kind: 'no-output' }` para esse marcador.
Ele é um sinal de controle, não um valor: não recebe `Good`, timestamp novo,
qualidade, `0`, `null`, string ou Digital State público. O editor intercepta o
sinal antes de formatar o valor; em uma primeira avaliação não mostra um
resultado inventado e, quando já existe um resultado, preserva exatamente o
valor e timestamp anteriores sem emitir uma nova atualização. Não há
`localStorage`, `sessionStorage` ou pipeline de escrita PI.

O Calculation Controller continua sendo preferencial para expressões PE com
`NoOutput`. Como a implementação local ainda não é fallback-safe e a
persistência/reconstrução do output anterior após reload não é equivalente ao
PE Scheduler, o status permanece:

```text
localStatus=N
serverSideStatus=SUPPORTED
verifiedInRuntime=true
semanticValidated=true para o marcador observado
productStatus=N
```

O resultado de composição, série e reload não foi promovido além do que o
produto consegue observar: não existe evento artificial no timestamp suprimido
e o último valor não é regravado. A promoção para `Product C` exige fechar a
semântica composta e a reconstrução após reload, ou um contrato PI que torne
essa persistência desnecessária para o fluxo exposto pelo plugin.

**CHECKPOINT 22.3 CONCLUÍDO.** Parar antes de iniciar Arma, Impulse ou Delay.

#### Fase 22.4 — auditoria do runtime stateful PE (NO-GO)

Este checkpoint auditou somente a infraestrutura necessária para `Arma`,
`Impulse` e `Delay`. Não foi criado runtime stateful, não foram alteradas as
funções e não foi usado o cache temporal existente como substituto do PE
Scheduler.

| Pergunta | Estado observado no código local | Consequência |
|---|---|---|
| Identidade do cálculo | `CalculationDefinition.id` é estável para cálculos salvos; o editor usa `__preview__` | Não há identidade persistente de execução no preview |
| Identidade da expressão | Há somente a expressão textual e seus inputs | Não há revisão/ocorrência de expressão para replay ou idempotência |
| Sequência de avaliações | `evaluateCalculation` recebe apenas um `Map` de valores atuais | Não há índice, número de scan ou ordem PE determinística |
| Timestamps | Timestamps podem vir do valor do input; na ausência deles há fallback para `Date.now()` | O relógio do navegador não é timestamp de Scheduler |
| Clock/intervalo | Não existe scan class ou intervalo de cálculo explícito | Refresh do Grafana não pode ser tratado como período PE |
| Gatilho por evento | Não existe evento de execução de cálculo | Não é possível distinguir clock, evento e avaliação manual |
| Histórico de resultado | O histórico consultado é histórico dos PI Points de entrada | Não há histórico de resultados, `RunFlag` ou estado anterior do cálculo |
| Replay/reload | Não há sequência persistida nem checkpoint de estado | O resultado após reload não pode ser reconstruído deterministicamente |
| Ocorrências duplicadas | Não há occurrence ID/scan ID nem contrato de ordenação | Repetições e respostas fora de ordem não são resolvíveis |
| Concorrência | Locks/cache existentes coordenam consultas e valores temporários | Não são um scheduler nem uma máquina de estados PE |
| Separação histórico/live | Há caminhos distintos para séries históricas e valores atuais, mas não um runtime PE | Não há regra para combinar estado histórico com live |
| Preview e display | Editor calcula `__preview__`; DisplaySurface calcula snapshots por elemento | A renderização não define uma cadência semântica de cálculo |
| Persistência externa | Não há local/session storage nem escrita PI para esse estado | Não há mecanismo autorizado para reconstrução |
| Fonte server-side | O Controller PI foi usado para expressões atuais, sem contexto de Scheduler | A resposta não prova a sequência necessária para as três funções |

**Decisão: NO-GO.** Com o contrato atual, implementar estado local para as
funções seria inventar a unidade de avaliação. Isso produziria diferenças em
startup, reset, replay, reload, avaliações duplicadas e respostas fora de
ordem. Em particular:

- `Arma` precisa do valor/estado anterior e das transições de avaliação,
  inclusive do reset definido pelo PE Scheduler;
- `Delay` precisa dos intervalos entre avaliações do cálculo, não de um
  atraso de UI ou de um timer do navegador;
- `Impulse` precisa da identidade e do estado anterior de cada avaliação
  dinâmica, além da política de startup e reset.

Portanto `Arma`, `Impulse` e `Delay` permanecem `productStatus=N`, e o total
do produto continua **100 C / 3 P / 9 N**. Nenhuma estrutura pseudo-stateful,
timer, polling, estado React, persistência no navegador ou uso do refresh do
Grafana como scan foi adicionado.

Para reabrir o GO será necessário um contrato explícito de avaliação ou uma
fonte server-side equivalente ao PE Scheduler contendo, no mínimo, identidade
estável do cálculo e revisão da expressão, sequência/scan ID, timestamp do
evento, clock ou gatilho, ocorrência idempotente, regras de reset/runflag,
histórico suficiente para replay e política para out-of-order/concurrency.
Sem esses dados, a implementação correta é permanecer bloqueada; não se
deve iniciar a Fase 22.5.

**CHECKPOINT 22.4 CONCLUÍDO — NO-GO.** Parar antes da Fase 22.5.

#### Fase 22.5 — STATEFUL PE SCHEDULER REQUIREMENTS

Este checkpoint transforma o resultado do 22.4 em uma proposta arquitetural,
sem implementar `Arma`, `Impulse` ou `Delay`. A decisão permanece **NO-GO**
para um runtime stateful geral: não existe hoje um contexto live equivalente
ao PE Scheduler.

O modelo atual já fornece alguns dados úteis: `CalculationDefinition.id` para
cálculos salvos, expressão textual, bindings, timestamps eventualmente
retornados nos valores PI e séries históricas de entradas. Também existe um
caminho de backfill que reúne timestamps das séries de entrada. Isso é
suficiente para identificar uma possível futura `EXPLICIT_INTERVAL_SERIES`,
mas não é suficiente para executá-la corretamente: o avaliador recebe apenas
valores atuais, usa o relógio local quando falta timestamp e não recebe
`evaluationTime`, sequence ou runflag histórico.

| Requisito | Situação | Decisão |
|---|---|---|
| calculation identity | ID estável em cálculo salvo; preview usa `__preview__` | Usar o ID salvo; preview precisa de identidade/revisão própria |
| expression revision | Não existe revisão estrutural | Derivar de AST/token spans quando o contexto for implementado |
| occurrence identity | Não existe identidade para duas ocorrências stateful | Usar caminho estrutural da expressão |
| schedule identity | Não existe schedule live | Não inferir de Grafana refresh, React ou request |
| clock/event | Não há clock class nem trigger PE | Exigir metadata/configuração ou Scheduler externo |
| scans/sequence | Não há scan ID nem sequência reconstruível | Obrigatório antes do runtime stateful |
| ordered timestamps | Existem timestamps de entrada em séries históricas | Podem formar sequência explícita somente com contrato de evaluation time |
| reset/runflag | Não há histórico de runflag nem anchor PE comprovado | Não assumir zero ou startup implícito |
| replay | Não há replay com estado inicial e outputs anteriores | Deve ser a fonte de verdade; memória pode ser só otimização |
| reload | Não é possível reconstruir o mesmo estado | Continua bloqueado |
| backfill/live | Input history existe, mas não há contextos separados | Separar `HistoricalReplayContext` de `LiveContinuationContext` |
| out-of-order/duplicate | Não há occurrence/scan idempotente | HTTP não pode definir a ordem PE |
| quality/result type | O pipeline possui qualidade e `NoOutput` em partes distintas | Transportar `VALUE`, `ERROR`, `CALC_FAILED` e `NO_OUTPUT` por scan |
| nested stateful | Ordem de avaliação não foi definida | Rejeitar explicitamente até haver contrato |

As respostas de decisão são:

1. Existe identidade de cálculo salva, mas não identidade de scan.
2. Faltam revisão de expressão, schedule, trigger/clock, scan ID, runflag,
   anchor, replay, reload e política de ordem/duplicação.
3. Uma sequência histórica explícita pode ser suficiente para um modo de
   replay, depois que o evaluator aceitar `evaluationTime` e houver estado
   inicial comprovado.
4. Live não é possível com semântica PE no contrato atual.
5. `CalculationDefinition` provavelmente precisará de metadata interna de
   schedule/revisão, mas seus campos não serão adicionados neste checkpoint.
6. Sim: clock/event configuration ou um Scheduler PI real é necessário.
7. Preview pode permanecer `Calc Failed`/uninitialized até possuir contexto;
   não deve criar estado artificial.
8. Replay após reload não é possível hoje.
9. `Arma` não pode avançar.
10. `Delay` não pode avançar.
11. `Impulse` não pode avançar.
12. A comparação de testes não produz dois testes adicionais estáveis: o
    baseline registrado foi 986/39, uma execução anterior foi 984/41 e a
    repetição deste checkpoint foi 980/45, sempre concentrada nas mesmas 15
    suites de UI. A variação do conjunto/count — com testes que alternam entre
    timeout, seleção/painel e expectativas stale — é classificada como
    **FLAKY/STALE EXPECTATION**, não como regressão deste checkpoint, pois só
    a documentação foi alterada e nenhuma dessas áreas foi tocada.

### Decisão arquitetural

As opções foram comparadas assim:

- **A — somente sequências históricas explícitas:** viável como modo de
  replay restrito, após tornar `evaluationTime` explícito; não resolve live.
- **B — metadata em `CalculationDefinition`:** necessária para associar
  schedule, revisão e identidade; não basta sem avaliações ordenadas e
  replay.
- **C — configuração Clock/Event:** necessária para definir o significado de
  intervalos de `Delay` e a origem dos eventos; não deve usar refresh do
  Grafana como default.
- **D — Scheduler PI externo:** é a alternativa mais forte para equivalência
  geral, desde que exponha contexto, resultados ou dados de replay suficientes.
- **E — solução equivalente:** somente seria aceita se fornecesse os mesmos
  invariantes de identidade, sequência, reset, replay, reload e idempotência.

A arquitetura necessária antes de uma nova implementação é: contrato de scan
explícito (clock/event), `calculationId`, revisão da expressão, occurrence ID,
timestamps ordenados, runflag/reset e estado inicial, contexto separado para
replay/live, reconstrução após reload e deduplicação por scan. Um store local
poderá memorizar checkpoints, mas nunca será a fonte exclusiva da verdade.
Inputs continuarão seguindo exclusivamente Plugin → Grafana → GPA → PI Web
API; não será criado HTTP direto para PI, backend novo ou persistência no
navegador.

`MedianFilt`, `NoOutput`, `Alm*`, `BadVal`, `IsSet` e `TagBad` não foram
alterados. O produto permanece **100 C / 3 P / 9 N**. Não iniciar a Fase 23.

**CHECKPOINT 22.5 CONCLUÍDO — SCHEDULER CONTEXT REQUIRES ARCHITECTURAL CHANGE.**

#### FASE 22 FINAL — STATEFUL PE COMPATIBILITY

Esta fase executou a auditoria conjunta das nove funções restantes e criou a
infraestrutura que podia ser implementada sem inventar semântica. A referência
principal foi o capítulo de Performance Equations do
[PI Server Applications User's Guide](https://manualzz.com/doc/28884584/rockwell-automation-pi-server-applications--pi-performanc...).

##### Scheduler model

`CalculationDefinition` agora aceita `schedule` opcional. Cálculos antigos e
funções stateless não mudam. Clock exige intervalo positivo e anchor ISO; os
scan IDs derivam da identidade do schedule e do índice calculado a partir do
anchor. Event exige PI Point trigger completo e eventos com identidade real;
os scans são ordenados por timestamp/identidade. Refresh, render, timers,
ordem HTTP e armazenamento do navegador não participam do modelo.

A revisão é um hash estável da expressão. Cada ocorrência stateful recebe ID
derivado da revisão, nome da função e span estrutural. O replay ordena a
sequência, elimina scans realmente duplicados, rejeita reutilização de ID com
conteúdo diferente e pode ser reexecutado do zero com o mesmo resultado.
Backfill e live ainda não foram conectados: memória não é fonte de verdade.
Funções stateful aninhadas são detectadas para futura rejeição explícita.

O editor mostra configuração mínima Clock/Event apenas quando o scanner léxico
seguro encontra `Arma`, `Impulse`, `MedianFilt` ou `Delay`. Schedule é
preservado no save e no import/export; nenhuma configuração default é criada.

##### Auditoria por função

| Function | Semântica oficial / implementação disponível | Fonte | Schedule | Runtime/semântica | Status produto | Blocker |
|---|---|---|---|---|---|---|
| `Arma` | `u[t]=Σa[k]u[t-k-1]+Σb[k]y[t-k]`; exige um `b` a mais; recorrência pura implementada quando o estado inicial é conhecido | PE Scheduler replay | sim | equação validada por teste, sem golden PI | N | initialization pós-start/reset e integração AST/histórico |
| `Impulse` | assinatura `Impulse(tagname,runflag,i1,...)`; texto oficial publicado não fecha de modo coerente como o input participa da recorrência | PE Scheduler replay | sim | não validada | N | equação/input, initialization e reset oficiais completos |
| `MedianFilt` | últimos N valores, tag numérica, N constante ≥3, Digital States ignorados | PE Scheduler replay | provável | não validada | N | origem exata da série, startup, N par e runflag=0 |
| `Delay` | input atrasado N calculation intervals; startup `Calc Failed` por N scans; replay habilitado implementado para Clock/Event | PE Scheduler replay | sim | núcleo validado por testes determinísticos | N | semântica oficial de runflag=0 e integração de inputs históricos |
| `NoOutput` | `No Sample`/211 vira sentinel; output é omitido; replay do último output/timestamp implementado | Calculation Controller + replay | não isoladamente | sentinel real já observado; trajetória testada | N | integração completa do replay na série/current após reload |
| `AlmAckStat` | 0 acknowledged/no alarm, 1 unacknowledged, 2 missed | PI Alarm State Set | não | decoder estrutural testado | N | Alarm State Set real do ambiente não disponível ao teste automatizado |
| `AlmCondition` | código da condição decodificado sem índice arbitrário | PI Alarm State Set | não | decoder estrutural testado | N | golden runtime real |
| `AlmCondText` | texto oficial da condição, sem símbolos de ack/prioridade | PI Alarm State Set | não | decoder estrutural testado | N | golden runtime real |
| `AlmPriority` | prioridade positiva; zero para condição que nunca fica unacknowledged | PI Alarm State Set | não | decoder estrutural testado | N | golden runtime real |

`Arma` reseta quando `runflag=0`, conforme a referência. Para `Delay` e
`MedianFilt`, “non-zero enables” não define se zero limpa, congela ou qual
resultado é produzido no scan; o runtime rejeita esse caso em vez de copiar a
regra de `Arma`. `Delay` usa quantidade de scans tanto em Clock regular quanto
em Event irregular. `Arma` não assume inputs/outputs anteriores iguais a zero.

O texto oficial de `Impulse` descreve `u(t)=i1*u(t-1)+...` apesar de exigir um
`tagname`; sem explicar o papel do input, essa informação não fecha uma
implementação observável. `MedianFilt` também permanece bloqueada porque a
referência não define startup, mediana com N par ou efeito de runflag zero, e
o Controller real retornou `Calc Failed` em `times`, `recorded` e `intervals`.

`NoOutput` preserva a distinção entre sentinel, `Calc Failed`, `Good=false`
genérico e valor normal. A infraestrutura reconstrói `lastEmitted` e mantém o
timestamp do último output real, inclusive quando o primeiro scan é
`NoOutput`; a conexão dessa trajetória ao fluxo completo de current/série
ainda é necessária antes da promoção.

As funções de alarme continuam usando o decoder genérico já existente. Um DSS
comum permanece erro. Não foi possível consultar um `pialarm33` real fora do
runtime Grafana/GPA nesta execução, e nenhum HTTP direto ao PI foi criado.

##### Erros e limitações

O runtime representa `value`, `calc-failed` e `no-output`; nenhum startup,
runflag desconhecido ou falta de estado vira zero. Schedule inválido, evento
sem identidade, scan duplicado inconsistente e sequência não monotônica são
erros explícitos. Quality completa por scan, avaliação de `*` em
`evaluationTime`, subexpressões híbridas via AST, paginação de histórico e
separação live/backfill permanecem trabalho necessário para executar as
funções dentro de expressões do produto.

Nenhum status foi promovido: implementação isolada e teste matemático não são
evidência suficiente para `semanticValidated=true`. `BadVal`, `IsSet` e
`TagBad` não foram alterados. Estado final: LOCAL **43 C / 59 P / 10 N**;
SERVER **58 SUPPORTED / 11 CONTEXT_DEPENDENT / 0 UNSUPPORTED / 43 NOT_TESTED**;
PRODUCT **100 C / 3 P / 9 N**.

**FASE 22 FINAL CONCLUÍDA COM BLOCKERS.**

#### RUNTIME REGRESSIONS AUDIT

O extrator do Editor agora reconhece datas PI absolutas com mês textual
(`10-Sep-26 13:45:30`) como tempo, mantendo `*`, `*-1h`, `t` e `y` fora da
lista de PI Points. Somente argumentos posicionais de ponto, como o primeiro
argumento de `TagAvg`/`Find*`, continuam sendo resolvidos como tags.

O caminho de metadata passou a reutilizar a resolução de Data Server associada
ao `PiPointBinding` ao buscar atributos do ponto. `TagNum` continua aceitando
somente `Id`/`PointID` inteiro real; WebId, GUID, índice e refId permanecem
inválidos.

Respostas `Find*` que o Controller identifica explicitamente como `No Data`,
`No Match` ou equivalente agora são classificadas como
`PiCalculationNoMatchError`, separadas de `PI Calculation Controller retornou
Good=false.`. O algoritmo de busca não foi alterado. Não foi feita promoção de
status.

Não foi possível validar nesta execução um threshold real no PI, nem obter um
Digital State Set real pelo ambiente Grafana/GPA. Portanto `Find*`, `DigState`,
`StateNo` e o fluxo manual de `TagNum` permanecem dependentes de validação
runtime, sem resultados inventados.

#### CHECKPOINT 22.7 — STATEFUL AST EXECUTION

O parser recursivo existente agora aceita um `PeEvaluationContext` opcional.
Esse contexto carrega identidade do cálculo, revisão da expressão, identidade
do schedule/scan, timestamp de avaliação e estado por ocorrência. Não existe
um segundo parser nem substituição textual de `*`.

`Delay(input, runflag, n)` pode ser avaliado scan a scan pelo mesmo AST quando
os inputs do scan já estão resolvidos: `n` é contado em scans, startup retorna
erro explícito até haver scans anteriores suficientes e um scan repetido é
idempotente. Cada ocorrência possui fila independente. `runflag=0` continua
bloqueado porque a referência usada no projeto não comprova se o scan reseta,
congela ou produz outro resultado.

O roteamento do editor permanece anterior ao server-first: `Arma`, `Delay` e
`Impulse` sem schedule produzem `SCHEDULER_CONTEXT_REQUIRED`; com schedule
inválido produzem `INVALID_SCHEDULE`; e nunca são enviados como expressão
inteira ao PI Calculation Controller. `MedianFilt`, `NoOutput`, `Alm*`,
`BadVal`, `IsSet` e `TagBad` não foram alterados neste checkpoint.

O executor ainda não transforma um replay histórico completo em scans de
inputs automaticamente. Em particular, uma subexpressão como
`Delay(TagAvg(...),1,2)` exige uma avaliação PI por timestamp de scan e regras
de amostragem/qualidade que não estão expostas pelo contrato atual da camada
GPA. Portanto `Arma` continua sem integração AST completa e `Impulse` continua
sem semântica oficial fechada. Nenhum status de compatibilidade foi promovido.

#### APRESENTAÇÃO TEMPORAL E FIND NO-MATCH

Resultados temporais continuam sendo números Unix em segundos durante a
avaliação, mas o motor agora expõe separadamente o tipo temporal do resultado
final. O Editor usa esse tipo explícito para apresentar `Bod`, `Bom`, `Bonm`,
`Noon`, `ParseTime` e resultados `Find*` como data ISO, sem heurística baseada
no tamanho do número e sem alterar a aritmética temporal.

O adaptador do PI Calculation Controller marca `Find*` como timestamp apenas
quando a expressão é dessa família. Respostas sem correspondência continuam
sendo `PiCalculationNoMatchError` somente quando o payload fornece evidência
de `No Data`/`No Match`; `Good=false` genérico permanece erro de execução.

#### STATEFUL FINALIZATION — AUDITORIA SEMÂNTICA

Esta execução não promoveu `Delay`, `Arma`, `Impulse`, `MedianFilt` ou
`NoOutput`. O núcleo determinístico de `Delay` permanece disponível para
contextos `Clock`/`Event`, com scan baseado em sequência e deduplicação, mas a
integração de subárvores históricas (`Delay(TagAvg(...),...)`) ainda exige que
cada scan seja resolvido no timestamp do replay pela camada GPA.

| Função | Assinatura/semântica confirmada | Execução atual | Blocker para Product C |
|---|---|---|---|
| `Delay` | `Delay(x, runflag, n)`; `n` é número de intervalos de cálculo; startup falha até `n` scans | núcleo PE Scheduler replay | runflag zero e replay de inputs históricos ainda não integrados |
| `Arma` | `Arma(in, runflag, (a...), (b...))`; `b` tem um termo a mais; `runflag=0` reinicializa | replay matemático isolado | inicialização e integração AST com estado real do Scheduler |
| `Impulse` | `Impulse(tagname, runflag, i1,...)`; resposta usa outputs anteriores | não promovida | papel do input, startup e estado inicial não confirmados pelo golden do ambiente |
| `MedianFilt` | `MedianFilt(tagname, runflag, number)`; últimos N valores, N constante >= 3; Digital States são ignorados | Controller retorna `Calc Failed` no ambiente observado | origem da série, startup, N par e runflag zero |
| `NoOutput` | `No Sample`/211 é sentinel de ausência de output no scan | Controller + sentinel interno | pipeline completo de supressão/current/série/reload não existe no plugin somente leitura |

As assinaturas e as semânticas acima foram confrontadas com o manual de
Performance Equations adotado. Não foram inventadas regras para `runflag=0`,
estado inicial de `Arma`/`Impulse`, ou origem da janela de `MedianFilt`. Por
isso o catálogo e `semanticValidated` permanecem inalterados; mocks e HTTP
200 do Controller não foram usados como prova de equivalência PI.

#### FASE 23 — GOLDEN VALIDATION CONTRA PI REAL

Foi criado o harness `piGoldenHarness.ts` para registrar uma observação por
scan com função, schedule, scanId, timestamp, input, runflag, estado antes e
depois, resultado PI e resultado do plugin. A comparação é estrita: não faz
coerção de valor, timestamp, quality, Digital State, categoria de erro ou
`NoOutput`. Fixtures cuja origem seja `mock` ou `unknown` são rejeitadas.

O harness é infraestrutura de teste, sem UI, logs, credenciais ou chamada PI
direta. Nesta execução não havia sessão Grafana/GPA conectada disponível para
capturar os goldens de `Delay`, `Arma`, `Impulse`, `MedianFilt`, alarmes,
`BadVal`, `TagBad` ou `IsSet`; consequentemente não foi criada fixture
inventada e não houve promoção de status. A única forma de preencher esses
casos é executar o harness com capturas observadas através da datasource GPA
configurada no Grafana.

#### FASE 24 — CAPTURA DE GOLDENS PI REAIS NO RUNTIME GRAFANA/GPA

`piGoldenRuntime.ts` é um adaptador de aquisição separado do harness de
comparação. Ele exige explicitamente o runtime `grafana-gpa` e recebe a
`DataSourceSrv` já configurada; a avaliação segue `DataSourceSrv -> GPA ->
recurso Grafana -> PI Web API`, sem credenciais, cookies, tokens, endpoint
direto ou armazenamento local.

O adaptador preserva timestamp, flags de qualidade, Digital State e categorias
de erro, sem converter erro, `No Data` ou `NoOutput` em valor. Funções que
dependem de Scheduler (`Delay`, `Arma`, `Impulse`, `MedianFilt` e `NoOutput`)
são recusadas no Controller isolado e exigem uma Performance Equation real com
scans, schedule, reset e estado observados.

Nesta execução não havia sessão Grafana/GPA autenticada nem PE Scheduler
acessível no terminal. Nenhum golden PI real foi capturado, nenhuma fixture
semântica foi inventada e nenhum status do catálogo foi promovido. Estado:
`PI GOLDEN CAPTURE PARCIAL — BLOCKERS EXTERNOS IDENTIFICADOS`.

#### FASE 25.2 — INTEGRIDADE TEMPORAL E RESOLUÇÃO DA GOLDEN EXPRESSION

O runtime do golden agora valida e normaliza o `evaluationTimestamp` antes de
qualquer chamada à datasource. Para o modo `times`, o instante normalizado é
enviado como parâmetro `time`; o timestamp retornado pelo PI deve representar
o mesmo instante, considerando apenas precisão/formatação equivalentes. Caso
contrário, a captura falha com `PI_GOLDEN_TIMESTAMP_MISMATCH`.

O `scanId` é gerado somente a partir do timestamp validado. A própria Golden
Expression é analisada pelo extrator de referências existente e seus PI Points
são resolvidos pelo mesmo `resolvePiPoint` do Editor, independentemente do
campo de expressão principal. Expressões sem tags continuam usando o contexto
único de datasource/PI Data Server.

O browser Grafana já demonstrou o caminho real `Grafana -> GPA -> PI
Calculation Controller` com `Sqr(9) = 3` e `Good=true`. A validação temporal e
a resolução automática dos bindings estão implementadas; novas promoções de
compatibilidade continuam condicionadas à captura e comparação de goldens PI
reais.

#### STATUS FINAL DE QUALITY — `BadVal`, `TagBad` e `IsSet`

Por decisão do projeto, `COMPATIBLE` descreve suporte de implementação e
execução no runtime PI/GPA. A ausência de estados raros no dataset atual é
registrada separadamente como cobertura de golden; não é apresentada como
limitação funcional conhecida.

| Função | Status de produto | Cobertura PI disponível |
|---|---|---|
| `BadVal` | COMPATIBLE | Golden Good (`sinusoid` → `0`, `Good=true`) disponível; positive bad-quality golden not available in the current test dataset. |
| `TagBad` | COMPATIBLE | Assinatura `TagBad(tagname [, time])`; comportamento independente de `BadVal`; positive bad-quality golden not available in the current test dataset. |
| `IsSet` | COMPATIBLE | Selectors `a` (Annotated), `s` (Substituted) e `q` (Questionable); positive-flag golden coverage unavailable in current PI dataset. |

A matriz mantém `semanticValidated=true` para essas três implementações e
`goldenCoverage=partial` para não confundir suporte semântico/runtime com a
observação de todos os estados raros possíveis no ambiente PI. Nenhum golden
falso foi criado. O status de produto final é `103 COMPATÍVEIS`, `0
PARCIAIS` e `9 NÃO IMPLEMENTADAS`, totalizando 112; as nove não implementadas
permanecem `Delay`, `Arma`, `Impulse`, `MedianFilt`, `NoOutput`, `AlmAckStat`,
`AlmCondition`, `AlmCondText` e `AlmPriority`.

#### FASE 27 — VALIDAÇÃO FINAL DAS NOVE FUNÇÕES RESTANTES

O runner DEV passou a expor descoberta read-only de Alarm State Sets usando
somente a listagem de Enumeration Sets já fornecida pela datasource GPA. Um
set só é reportado quando o decoder estrutural existente aceita os códigos e a
estrutura retornados pelo PI; texto de tag ou nomes como `Alarm`/`Fault` não
classificam um set. A descoberta não é golden das funções `Alm*`: após localizar
uma PI Point ligada ao set, ainda é necessário capturar cada expressão no
Calculation Controller e comparar valor, código, texto, quality e timestamp.

Não existe no contrato GPA atualmente integrado ao plugin uma capacidade de
listar Performance Equations configuradas, seus schedules, scans ou output
tags. Portanto não foram sondadas rotas desconhecidas. Para fechar os cinco
casos stateful, o ambiente precisa disponibilizar uma PE já configurada e
observável (expressão, output PI Point, Clock/Event, ao menos cinco timestamps
de scan, inputs/runflag e resultado arquivado); para `NoOutput`, a sequência
deve ainda provar a ausência de evento no scan suprimido. Sem esses dados, a
fonte de verdade do Scheduler não está disponível ao plugin e nenhuma das
nove funções é promovida.

#### FASE 27.1 — DESCOBERTA DE PI POINTS DE PERFORMANCE EQUATION

O runner DEV possui agora `PE Point Discovery`, limitado a 100 resultados por
página e com paginação explícita. Para cada resultado da busca de PI Points,
ele lê somente `GET /points/{webId}/attributes` pelo proxy GPA configurado e
preserva `PointSource`, `ExDesc`, `Location1`, `Location3`, `Location4`,
`Scan`, `Shutdown`, `PointClass`/`PtClassName` e `PointType` sem inferir uma
scan class a partir de `Location4`.

`ExDesc` original é mantido. A descoberta marca `LIKELY_PE_CLOCK` somente
quando encontra estruturalmente uma chamada `Delay`, `NoOutput`, `Arma`,
`Impulse` ou `MedianFilt`; `event=<trigger>, <expression>` é separado em
`triggerTag` e `calculationExpression` sem substituir o texto bruto, e resulta
em `LIKELY_PE_EVENT`. `PointSource=C` é exibido, mas não é critério isolado.
Os demais resultados ficam `NOT_PE` ou `UNKNOWN`; nenhuma categoria altera o
catálogo de compatibilidade.

Se um candidato Clock for encontrado, qualquer diferença entre timestamps
arquivados poderá ser reportada somente como cadência observada no próximo
checkpoint, nunca como configuração oficial da scan class. Se for Event, o
trigger retornado pelo `ExDesc` permite comparar posteriormente os históricos
do trigger e do output. Nenhuma rota de escrita, credencial ou conexão direta
ao PI é usada nessa descoberta.
