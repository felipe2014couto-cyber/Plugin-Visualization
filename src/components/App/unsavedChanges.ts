import type { DisplayDocument } from '../../display/displayDocument';

/**
 * Creates a stable fingerprint string of a DisplayDocument, focusing strictly on
 * persistable content (Display, Mini-Sheets, Calculations, Programming).
 * This string can be used to compare if two versions of a document are
 * semantically identical, ignoring runtime-only memory references.
 */
export function serializePersistableDocument(document: DisplayDocument): string {
  // Extract only what effectively changes the dashboard configuration.
  const {
    id,
    name,
    schemaVersion,
    surface,
    elements,
    calculations,
    miniSheets,
    programming,
  } = document;

  return JSON.stringify({
    id,
    name,
    schemaVersion,
    surface,
    elements,
    calculations,
    miniSheets,
    programming,
  });
}
