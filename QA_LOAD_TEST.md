# Teste de carga do PIMS Vision

Data: 27/08/2026

## Objetivo

Validar a build otimizada com 100 clientes simultâneos visualizando dados PI e
criando/atualizando telas antes da promoção para produção.

## Cenário

- Ambiente: Grafana QA 12.0.0 em `10.247.72.134`.
- Servidor QA: 8 vCPUs e aproximadamente 8 GB de memória.
- Clientes: 100, com rampa de 10 segundos.
- Duração por cliente: 60 segundos; duração total: 70,3 segundos.
- Cada cliente carregou o módulo e um display, atualizou o display, consultou
  cinco valores atuais e uma tendência PI por ciclo, criou uma tela e realizou
  uma atualização dessa tela.
- Todas as telas temporárias usaram a tag `qa-load-temporary` e foram removidas
  ao final.

## Resultado

- Requisições: 4.600, excluindo preparação e limpeza.
- Vazão média: 65,5 requisições por segundo.
- Sucesso global: 100%.
- Telas criadas e atualizadas: 100 de 100.
- Resíduos após limpeza: zero.

| Operação | Requisições | Sucesso | p50 | p95 | Máximo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Módulo do plugin | 100 | 100% | 99 ms | 145 ms | 194 ms |
| Abertura do display | 100 | 100% | 119 ms | 173 ms | 227 ms |
| Valor atual PI | 3.000 | 100% | 46 ms | 233 ms | 5.046 ms |
| Tendência PI | 600 | 100% | 48 ms | 264 ms | 3.350 ms |
| Atualização do display | 600 | 100% | 105 ms | 147 ms | 597 ms |
| Criação de tela | 100 | 100% | 60 ms | 84 ms | 91 ms |
| Atualização da tela | 100 | 100% | 40 ms | 71 ms | 94 ms |

Durante a carga, a CPU permaneceu tipicamente entre 27% e 46%, com pico
observado de aproximadamente 65%. A fila de execução chegou a 12, sem espera de
I/O. Após o teste, o Grafana permaneceu ativo, sem erros recentes no serviço,
com 1.007 MiB de 7.939 MiB de memória em uso e disco em 36%.

## Comparação indicativa

Antes das otimizações, o ensaio registrou 57,9 requisições por segundo, taxas de
sucesso entre 75,7% e 82,2% nas operações principais, p95 entre 4,07 e 6,06
segundos, CPU entre 97% e 99% e fila máxima de 48. A rodada atual aplicou carga
ligeiramente maior e obteve 100% de sucesso com p95 abaixo de 300 ms nas
operações de dados e persistência.

## Decisão de QA

A build está aprovada para o cenário de 100 sessões simultâneas descrito acima.
Antes da promoção definitiva, ainda são recomendados um teste visual de navegador
com displays PI Vision representativos e um teste específico dos displays que
dependem de elementos PI AF; esses aspectos não são exercitados integralmente por
um teste de carga em nível de API.

O lint global continua bloqueado por violações preexistentes no código legado e
deve ser tratado como dívida técnica separada. Typecheck, build e as 682 unidades
e integrações automatizadas passaram.
