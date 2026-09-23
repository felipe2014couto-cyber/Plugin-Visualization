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
      title: '',
      transparent: true,
      gridPos: { h: 24, w: 24, x: 0, y: 0 },
      options: {
        mode: 'html',
        content: createDashboardRedirectHtml(appUrl),
      },
    }],
    links: [{
      asDropdown: false,
      icon: 'external link',
      includeVars: true,
      keepTime: true,
      tags: [],
      targetBlank: false,
      title: 'Abrir no Aperam Visualization',
      tooltip: '',
      type: 'link',
      url: appUrl,
    }],
  };
}

export function createDashboardRedirectHtml(appUrl: string): string {
  return [
    '<div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#111217;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#ccccdc;">',
    '  <div style="display:flex;align-items:center;gap:12px;">',
    '    <svg style="animation:pims-spin 0.8s linear infinite;width:28px;height:28px;" viewBox="0 0 24 24" fill="none" stroke="#5794f2" stroke-width="2.5">',
    '      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" stroke-width="2.5"></circle>',
    '      <path d="M12 2 a10 10 0 0 1 10 10" stroke-linecap="round"></path>',
    '    </svg>',
    '    <span style="font-size:16px;font-weight:500;color:#f4f5f5;">Carregando Aperam Visualization...</span>',
    '  </div>',
    `  <a id="pims-vision-fallback" href="${appUrl}" style="margin-top:16px;font-size:13px;color:#5794f2;text-decoration:underline;">Clique aqui caso não seja redirecionado automaticamente</a>`,
    '  <style>@keyframes pims-spin { 100% { transform: rotate(360deg); } }</style>',
    '</div>',
    '<script>',
    '(function() {',
    '  var base = (window.grafanaBootData && window.grafanaBootData.settings && window.grafanaBootData.settings.appSubUrl) || "";',
    `  var target = base + "${appUrl}";`,
    '  try {',
    '    if (window.location.search) {',
    '      var currentParams = new URLSearchParams(window.location.search);',
    '      var targetUrl = new URL(target, window.location.origin);',
    '      currentParams.forEach(function(val, key) {',
    '        if (!targetUrl.searchParams.has(key)) {',
    '          targetUrl.searchParams.set(key, val);',
    '        }',
    '      });',
    '      target = targetUrl.pathname + targetUrl.search;',
    '    }',
    '  } catch (e) {}',
    '  window.location.replace(target);',
    '})();',
    '</script>',
    `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" style="display:none;" onload="window.location.replace('${appUrl}')" />`,
  ].join('\\n');
}


function normalizeDashboardTitle(title: string): string {
  return title.trim().toLocaleLowerCase();
}
