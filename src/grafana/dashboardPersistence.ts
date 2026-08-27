import { getBackendSrv } from '@grafana/runtime';
import type { DisplayDocument } from '../display';
import { PLUGIN_BASE_URL } from '../constants';

const PIMS_VISION_DASHBOARD_TAG = 'pims-vision';
const PIMS_VISION_PANEL_ID = 1;

interface GrafanaDashboardResponse {
  dashboard?: {
    pimsVision?: DisplayDocument;
  };
  meta?: {
    folderUid?: string;
  };
}

interface SaveDashboardResponse {
  uid: string;
  url: string;
}

export interface GrafanaDashboardFolder {
  id: number;
  uid: string;
  title: string;
  parentFolderUid?: string;
}

interface GrafanaSearchResult {
  id: number;
  uid: string;
  title: string;
  type: 'dash-folder' | 'dash-db';
  folderUid?: string;
  parentFolderUid?: string;
}

export interface LoadedPimsVisionDashboard {
  document: DisplayDocument;
  folderUid: string;
}

export async function isGrafanaUserAuthenticated(): Promise<boolean> {
  try {
    const user = await getBackendSrv().get<{ id?: number; login?: string }>('/api/user');
    return Boolean(user.id && user.id > 0 && user.login && user.login.toLocaleLowerCase() !== 'anonymous');
  } catch {
    return false;
  }
}

export async function loadPimsVisionFolders(): Promise<GrafanaDashboardFolder[]> {
  const results = await getBackendSrv().get<GrafanaSearchResult[]>('/api/search?type=dash-folder&limit=5000');
  return results
    .filter((result) => result.type === 'dash-folder')
    .map(({ id, uid, title, parentFolderUid }) => ({ id, uid, title, parentFolderUid }))
    .sort((first, second) => first.title.localeCompare(second.title));
}

export async function loadPimsVisionDashboard(uid: string): Promise<LoadedPimsVisionDashboard | undefined> {
  const response = await getBackendSrv().get<GrafanaDashboardResponse>(`/api/dashboards/uid/${encodeURIComponent(uid)}`);
  const savedDocument = response.dashboard?.pimsVision;
  return savedDocument
    ? { document: savedDocument, folderUid: response.meta?.folderUid ?? '' }
    : undefined;
}

export async function hasDashboardTitleConflict(
  title: string,
  folderUid: string,
  dashboardUid?: string,
): Promise<boolean> {
  const query = new URLSearchParams({
    type: 'dash-db',
    folderUIDs: folderUid,
    limit: '5000',
    query: title,
  });
  const results = await getBackendSrv().get<GrafanaSearchResult[]>(`/api/search?${query.toString()}`);
  const normalizedTitle = normalizeDashboardTitle(title);

  return results.some((result) => (
    result.type === 'dash-db'
      && normalizeDashboardTitle(result.title) === normalizedTitle
      && result.uid !== dashboardUid
      && (result.folderUid ?? '') === folderUid
  ));
}

export async function savePimsVisionDashboard(
  document: DisplayDocument,
  dashboardUid?: string,
  folderUid = '',
): Promise<SaveDashboardResponse> {
  const title = document.name.trim() || 'Visualization';
  // Gerar o UID no cliente permite incluir o link correto no painel já na
  // primeira gravação. Antes, toda ação de salvar fazia dois POSTs completos:
  // um para o Grafana gerar o UID e outro apenas para corrigir esse link.
  const uid = dashboardUid ?? createDashboardUid();
  return getBackendSrv().post<SaveDashboardResponse>('/api/dashboards/db', {
    dashboard: createDashboardModel(document, title, uid),
    folderUid,
    overwrite: Boolean(dashboardUid),
  });
}

function createDashboardUid(): string {
  const randomPart = Math.random().toString(36).slice(2, 14);
  return `pims-${Date.now().toString(36)}-${randomPart}`;
}

function createDashboardModel(document: DisplayDocument, title: string, uid?: string) {
  const appUrl = `${PLUGIN_BASE_URL}?dashboardUid=${encodeURIComponent(uid ?? '')}`;
  return {
    uid,
    title,
    tags: [PIMS_VISION_DASHBOARD_TAG],
    schemaVersion: 36,
    editable: true,
    time: { from: 'now-8h', to: 'now' },
    pimsVision: document,
    panels: [{
      id: PIMS_VISION_PANEL_ID,
      type: 'text',
      title: 'PIMS Vision',
      gridPos: { h: 4, w: 24, x: 0, y: 0 },
      options: {
        mode: 'html',
        content: `<a href="${appUrl}">Abrir display no PIMS Vision</a>`,
      },
    }],
  };
}

function normalizeDashboardTitle(title: string): string {
  return title.trim().toLocaleLowerCase();
}
