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
| `TagAvg` | PARCIAL | Média ponderada no tempo sobre os intervalos disponíveis; o datasource atual não informa stepped, qualidade por ponto nem valores de fronteira. |
| `TagMean` | PARCIAL | Média ponderada por eventos, sem interpolação de fronteira. |
| `TagMin`, `TagMax` | PARCIAL | Mínimo/máximo dos eventos numéricos retornados; qualidade e `pctgood` não estão disponíveis. |
| `TagTot` | PARCIAL | Integral em dias, usando interpolação linear entre pontos retornados; stepped e fronteiras não são fornecidos. |
| `EventCount` | PARCIAL | Conta os eventos retornados pelo modo `recorded`; o frame atual não expõe marcadores adicionais para auditar fronteiras. |
| `Range` | PARCIAL | Máximo menos mínimo dos eventos numéricos retornados. |
| `PctGood` | NÃO IMPLEMENTADO | A resposta normalizada não fornece qualidade por evento nem cobertura temporal Good/Bad. |
| `StDev`, `PStDev`, `SStDev` | NÃO IMPLEMENTADO | As variantes PI e seus denominadores/ponderação ainda não foram implementados nesta fase. |

#### Status da compatibilidade PE/PI Vision — Fase 4

| Função | Status | Retorno e limitações |
|---|---|---|
| `TimeEq`, `TimeNE` | PARCIAL | Duração em segundos; estados digitais são tratados como stepped, enquanto séries numéricas usam igualdade contínua. Não há valores de fronteira nem stepped numérico no frame. |
| `TimeGT`, `TimeGE` | PARCIAL | Duração em segundos com cruzamento linear para séries numéricas; comparação inclusiva preserva platôs no limite. |
| `TimeLT`, `TimeLE` | PARCIAL | Duração em segundos com cruzamento linear para séries numéricas; comparação inclusiva preserva platôs no limite. |
| `FindEq`, `FindNE`, `FindGT`, `FindGE`, `FindLT`, `FindLE` | PARCIAL | Retornam timestamp Unix em segundos; há interpolação numérica e suporte stepped digital, mas não há boundary values nem extrapolação. |

As funções `Time*` calculam somente os intervalos cobertos por dois eventos
retornados pelo datasource. Como o GPA atual não fornece stepped numérico,
qualidade por evento ou valores boundary, a compatibilidade é explicitamente
parcial; estados digitais não são interpolados como números.

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
| `Int`, `Frac`, `Float` | PARCIAL | Conversão e parte fracionária preservam sinal; limites de tipos PI não foram ampliados. |
| `Log`, `Ln`, `Log10`, `Sqr` | COMPATÍVEL | `Log`/`Ln` natural, `Log10` comum e `Sqr` raiz quadrada. |

`TagNum` permanece **NÃO IMPLEMENTADO** por depender do PointID real, que não é
exposto pelo datasource atual. `DigText`, `DigState` e `StateNo` foram
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
| `TagNum` | NÃO IMPLEMENTADO | `TagNum("tagname")` retorna PointID | As respostas atuais de `/points/{webId}`, atributos e `metricFindQuery` não expõem PointID; WebId não é equivalente. |

### Digital State Functions — Fase 12

| Função | Status | Dependência | Observação |
|---|---|---|---|
| `DigText(tagname)` | PARCIAL | PI Point digital + Digital State Set | Traduz o código/nome do valor atual; ponto não digital, set ausente ou estado desconhecido geram erro. |
| `DigState(state[, tagname])` | PARCIAL | Digital State Set do PI Point | Resolve o nome do estado com comparação case-insensitive e preserva o nome do set; a forma sem tag não é suportada. |
| `StateNo(digstate)` | PARCIAL | Digital State Set | Retorna o código fornecido pelo PI, sem assumir `On = 1`; estados sem código geram erro. |
| `IsSet(value, select)` | NÃO IMPLEMENTADO | Flags `Annotated`, `Substituted` ou `Questionable` | O datasource atual não fornece essas flags de forma integrada ao cálculo. |

As consultas de Digital State Set usam cache e Promise lock por PI Point. A
interface aguarda essas Promises junto com histórico e metadata, preservando o
fluxo de um único clique. Estados normais do set não são misturados aos estados
de sistema (`Shutdown`, `I/O Timeout`, `Pt Created`, `No Data`), cuja qualidade
continua seguindo a prioridade da Fase 8.

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
| Digital State Set | `/enumerationsets/{id}/enumerationvalues` e rotas legadas | Sim, via `getResource` | `DigText`, `DigState`, `StateNo` |
| Plot de stream | `/streams/{webId}/plot` | Sim, quando o handler existe | Tendências auxiliares |
| Boundary histórico | recurso `recorded` não confirmado nesta instalação | Não confirmado | Não integrado |
| Qualidade por evento | recurso raw não confirmado nesta instalação | Não confirmado | `PctGood` permanece não implementado |
| Stepped/PointID/timezone do servidor | nenhum campo confirmado no metadata carregado | Não | Funções permanecem parciais |

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
| Matemática | `Acos`, `Asin`, `Atn`, `Atn2`, `Cos`, `Cosh`, `Exp`, `Frac`, `Int`, `Log`, `Log10`, `Mod`, `Sgn`, `Sin`, `Sinh`, `Sqr`, `Tan`, `Tanh`, `Poly` | `Avg`, `Float`, `Max`, `Min`, `Median`, `Round`, `Trunc` | — | `Arma`, `Curve`, `Impulse`, `MedianFilt` |
| Strings/conversão | `UCase`, `LCase`, `Len`, `Left`, `Right`, `Mid`, `Trim`, `LTrim`, `RTrim` | `Ascii`, `Char`, `Compare`, `Concat`, `InStr`, `Format`, `String`, `Text`, `DigText` | `UPPER`, `LOWER`, `LENGTH`, `SUBSTRING`, `CONCAT` | — |
| Data/hora | — | `Day`, `DaySec`, `Hour`, `Minute`, `Month`, `Second`, `Weekday`, `Year`, `Yearday`, `Bod`, `Bom`, `Bonm`, `Noon`, `ParseTime` | — | `Delay`, `IsDST` |
| Histórico/arquivo | — | `TagAvg`, `TagMean`, `TagMin`, `TagMax`, `TagTot`, `EventCount`, `Range`, `TagVal`, `PrevVal`, `NextVal`, `TimeEq`, `TimeNE`, `TimeGT`, `TimeGE`, `TimeLT`, `TimeLE`, `FindEq`, `FindNE`, `FindGT`, `FindGE`, `FindLT`, `FindLE` | `Average`, `Minimum`, `Maximum`, `Count`, `Total`, `Moving_Average`, `Moving_Min`, `Moving_Max`, `Moving_StdDev` | `NextEvent`, `PrevEvent`, `PctGood`, `StDev`, `PStDev`, `SStDev` |
| Qualidade/estado | — | `BadVal`, `DigState`, `StateNo` | `IS_GOOD`, `IS_BAD`, `IS_QUESTIONABLE`, `IS_SUBSTITUTED`, `IS_NO_DATA`, `QUALITY`, `STATUS_CODE` | `IsSet`, `TagBad` |
| Metadata | `TagDesc`, `TagEU`, `TagExDesc`, `TagName`, `TagSource`, `TagSpan`, `TagZero`, `TagType`, `TagTypVal` | — | — | `TagNum` |
| Alarmes | — | — | — | `AlmAckStat`, `AlmCondition`, `AlmCondText`, `AlmPriority` |

Contagem dos 112 nomes da referência auditada: 37 COMPATÍVEIS, 56 PARCIAIS e
19 NÃO IMPLEMENTADOS; NÃO CONFIRMADOS: 0. Além deles, a matriz identifica 14
EXTENSÕES do plugin. `GoodVal`
não faz parte da lista de referência adotada e não foi inventada como função
PE.

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
- Metadata `stepped` numérica não está disponível; séries numéricas usam
  interpolação linear. Séries digitais são tratadas como stepped.
- Não há qualidade histórica por evento suficiente para `PctGood`, desvios PI
  e filtros de qualidade.
- O Digital State Set não está disponível para implementar `DigText`, `DigState`
  e `StateNo` com segurança.
- O PointID não é exposto pelo caminho atual de metadata; `TagNum` não usa WebId
  como substituto.
- `Format` limita-se aos especificadores C numéricos documentados na matriz da
  Fase 9; datas, locale e máscaras compostas não são suportados.
- Funções de data usam o timezone local do navegador, enquanto PI pode operar
  com timezone/configuração diferente; essas funções são classificadas como
  PARCIAIS.

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

O datasource preserva os campos de qualidade disponíveis no valor atual (por
exemplo `Good`, `Questionable` e `Substituted`, inclusive dentro de
`quality`). O editor mantém esse objeto ao chamar o Calculation Engine; assim,
zero numérico e estados digitais como `On`/`Off` não são classificados como
ruins por seu tipo. Estados de sistema do PI (como `Shutdown`/`No Data`) são
ruins quando o datasource os informa como `Good=false` ou quando não há valor.
Sem uma flag Good explícita, `BadVal` não inventa uma qualidade para valores
válidos. A série histórica normalizada atualmente não carrega qualidade por
evento; por isso `PctGood` continua não implementado e a qualidade histórica
não é inferida.

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
| `TagNum('Tag')` | NÃO IMPLEMENTADO | — | O datasource atual não expõe PointID; WebId não é substituído por esse valor |
