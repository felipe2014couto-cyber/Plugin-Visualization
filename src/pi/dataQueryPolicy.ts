export const DATA_QUERY_BATCH_WINDOW_MS = 40;
// O datasource PI executa mais de uma chamada PI Batch por consulta histórica.
// Três consultas externas mantêm o carregamento paralelo sem saturar o PI Web API
// com até dez batches efetivos ao abrir displays com muitas tags.
export const DATA_QUERY_MAX_TARGETS = 50;
export const DATA_QUERY_MAX_CONCURRENT_BATCHES = 3;
// A primeira consulta também resolve e armazena os WebIDs. No ambiente real ela
// pode ultrapassar 8 s mesmo quando a resposta é válida; cancelar cedo provoca
// divisão do lote e várias reconsultas, aumentando muito o tempo total.
export const DATA_QUERY_HISTORICAL_TIMEOUT_MS = 30_000;
// Snapshot values can be fetched together without the data volume of a trend;
// keep this policy independent from the more expensive historical queries.
export const DATA_QUERY_CURRENT_MAX_TARGETS = 60;
export const DATA_QUERY_CURRENT_TIMEOUT_MS = 3_000;
// Current values are small, short-lived requests. One extra worker reduces
// the initial loading waves without changing the more expensive trend limit.
export const DATA_QUERY_CURRENT_MAX_CONCURRENT_BATCHES = 3;
