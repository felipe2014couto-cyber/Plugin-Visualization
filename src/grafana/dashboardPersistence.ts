import { getBackendSrv } from '@grafana/runtime';
import type { DisplayDocument } from '../display';
import { PLUGIN_BASE_URL } from '../constants';

const PIMS_VISION_DASHBOARD_TAG = 'pims-vision';
const PIMS_VISION_PANEL_ID = 1;

interface GrafanaDashboardResponse {
  dashboard?: {
    pimsVision?: DisplayDocument;
  };
}

interface SaveDashboardResponse {
  uid: string;
  url: string;
}

export async function loadPimsVisionDashboard(uid: string): Promise<DisplayDocument | undefined> {
  const response = await getBackendSrv().get<GrafanaDashboardResponse>(`/api/dashboards/uid/${encodeURIComponent(uid)}`);
  return response.dashboard?.pimsVision;
}

export async function savePimsVisionDashboard(
  document: DisplayDocument,
  dashboardUid?: string,
): Promise<SaveDashboardResponse> {
  const title = document.name.trim() || 'Visualization';
  const firstSave = await getBackendSrv().post<SaveDashboardResponse>('/api/dashboards/db', {
    dashboard: createDashboardModel(document, title, dashboardUid),
    overwrite: Boolean(dashboardUid),
  });

  const uid = firstSave.uid;
  return getBackendSrv().post<SaveDashboardResponse>('/api/dashboards/db', {
    dashboard: createDashboardModel(document, title, uid),
    overwrite: true,
  });
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
