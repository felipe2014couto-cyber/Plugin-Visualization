export const DATA_QUERY_BATCH_WINDOW_MS = 40;
export const DATA_QUERY_MAX_TARGETS = 20;
export const DATA_QUERY_MAX_CONCURRENT_BATCHES = 2;
// Snapshot values can be fetched together without the data volume of a trend.
// Keeping this separate preserves the safer 20-target limit for history.
export const DATA_QUERY_CURRENT_MAX_TARGETS = 60;
export const DATA_QUERY_CURRENT_TIMEOUT_MS = 3_000;
// Current values are small, short-lived requests. One extra worker reduces
// the initial loading waves without changing the more expensive trend limit.
export const DATA_QUERY_CURRENT_MAX_CONCURRENT_BATCHES = 3;
