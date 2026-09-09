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

### Macros Históricas (PI Vision/DataLink)

| Função | Uso | Exemplo |
|--------|-----|---------|
| **INTERPOLATE** | Interpolar no tempo (sinônimo: **VALUE_AT_TIME**) | `INTERPOLATE('Tag', '*')` |
| **FIRST_VALUE** | Primeiro valor da janela | `FIRST_VALUE('Tag', '-1d')` |
| **LAST_VALUE** | Último valor da janela | `LAST_VALUE('Tag', '-1d')` |
| **EVENT_COUNT** | Contar os eventos (sinônimo: **COUNT_VALUES**) | `EVENT_COUNT('Tag', '-1d')` |
| **STATE_DURATION**| Tempo contínuo no estado | `STATE_DURATION('Tag', "On", '-8h')` |
| **TIME_EQ** | Tempo total no estado na janela inteira | `TIME_EQ('Tag', "On", '-8h')` |
| **TIME_NE** | Tempo total fora do estado na janela inteira | `TIME_NE('Tag', "On", '-8h')` |
| **IS_GOOD** / etc. | Funções de qualidade retornam 1 ou 0 | `IS_GOOD('Tag')` |
