export const DATA_QUERY_BATCH_WINDOW_MS = 40;
// Mantemos lotes de histórico com no máximo 50 targets e até cinco consultas
// simultâneas. Isso reduz o tempo da primeira carga sem transformar um lote
// maior em uma requisição única para o datasource PI.
export const DATA_QUERY_MAX_TARGETS = 50;
export const DATA_QUERY_MAX_CONCURRENT_BATCHES = 5;
// Snapshot values can be fetched together without the data volume of a trend;
// keep this policy independent from the more expensive historical queries.
export const DATA_QUERY_CURRENT_MAX_TARGETS = 60;
export const DATA_QUERY_CURRENT_TIMEOUT_MS = 3_000;
// Current values are small, short-lived requests. One extra worker reduces
// the initial loading waves without changing the more expensive trend limit.
export const DATA_QUERY_CURRENT_MAX_CONCURRENT_BATCHES = 3;
