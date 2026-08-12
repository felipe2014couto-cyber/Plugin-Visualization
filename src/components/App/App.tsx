import React, { useCallback, useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { createDisplayDocument } from '../../display';
import { DisplayEditor } from '../../display/components/DisplayEditor';
import {
  DisplayEditorMode,
  PiPointDropSymbolType,
} from '../../display/components/DisplayEditor/DisplayEditor';
import {
  checkPiConnection,
  getPiPointCurrentValue,
  getPiPointsCurrentValues,
  getPiTrendsHistoryForRange,
  getPiTrendsPlotDataForRange,
  getPiTrendsPreviewForRange,
  getPiTrendsRecordedHistoryForRange,
  createProgressiveTrendLoader,
  type PiConnectionState,
  type PiPointSearchResult,
  type ProgressiveTrendLoader,
} from '../../pi';
import { PiPointSearch } from '../../pi/PiPointSearch';
import { isStatePiPointBinding } from '../../pi/piPointBinding';
import type { LoadTrendSeries } from '../../display/runtime/trendRuntime';
import { TimeRangeBar } from '../TimeRangeBar';
import { createDefaultTimeSelection } from '../../time/timeRange';
import { PLUGIN_ASSET_BASE_URL } from '../../constants';
import { loadPimsVisionDashboard, savePimsVisionDashboard } from '../../grafana/dashboardPersistence';

export type VisualizationTheme = 'dark' | 'light';

export const VISUALIZATION_THEME_STORAGE_KEY = 'aperam-visualization-theme';

function getInitialTheme(): VisualizationTheme {
  try {
    return globalThis.localStorage?.getItem(VISUALIZATION_THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function App() {
  const styles = useStyles2(getStyles);
  const [document, setDocument] = useState(() =>
    createDisplayDocument({ name: 'Visualization' }),
  );
  const [piConnection, setPiConnection] = useState<PiConnectionState>({ status: 'checking' });
  const [selectedPiPoint, setSelectedPiPoint] = useState<PiPointSearchResult | null>(null);
  const [editorMode, setEditorMode] = useState<DisplayEditorMode>('edit');
  const [dropSymbolType, setDropSymbolType] = useState<PiPointDropSymbolType>('trend');
  const [timeSelection, setTimeSelection] = useState(() => createDefaultTimeSelection());
  const [isAssetsPanelOpen, setIsAssetsPanelOpen] = useState(true);
  const [visualizationTheme, setVisualizationTheme] = useState<VisualizationTheme>(getInitialTheme);
  const [dashboardUid, setDashboardUid] = useState<string>();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const progressiveTrendLoaderRef = useRef<ProgressiveTrendLoader>();
  if (!progressiveTrendLoaderRef.current) {
    progressiveTrendLoaderRef.current = createProgressiveTrendLoader(
      (bindings, range, options) => getPiTrendsHistoryForRange(bindings, range, options),
      (bindings, range, options) => getPiTrendsPreviewForRange(bindings, range, options),
    );
  }
  const progressiveTrendLoader = progressiveTrendLoaderRef.current;

  useEffect(() => {
    let active = true;

    checkPiConnection().then((connection) => {
      if (active) {
        setPiConnection(connection);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const uid = new URLSearchParams(globalThis.location?.search ?? '').get('dashboardUid');
    if (!uid) {
      return;
    }

    let active = true;
    loadPimsVisionDashboard(uid)
      .then((savedDocument) => {
        if (active && savedDocument) {
          setDocument(savedDocument);
          setDashboardUid(uid);
        }
      })
      .catch(() => {
        if (active) {
          setSaveState('error');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(VISUALIZATION_THEME_STORAGE_KEY, visualizationTheme);
    } catch {
      // The selected theme still works for the current session when storage is unavailable.
    }
  }, [visualizationTheme]);

  const rangeFrom = timeSelection.range.from;
  const rangeTo = timeSelection.range.to;
  const loadTrend = useCallback<LoadTrendSeries>(
    async (bindings, publishUpdate, options) => {
      const range = { from: rangeFrom, to: rangeTo };
      const stateBindings = bindings.filter(isStatePiPointBinding);
      const numericBindings = bindings.filter((binding) => !isStatePiPointBinding(binding));
      const [plotDataResults, stateResults] = await Promise.all([
        getPiTrendsPlotDataForRange(numericBindings, range, options),
        getPiTrendsRecordedHistoryForRange(stateBindings, range, options),
      ]);
      const failedBindings = numericBindings.filter((binding) => plotDataResults[`${binding.dataSourceUid}\u0000${binding.serverPath}\u0000${binding.pointName}`]?.status === 'error');
      if (failedBindings.length === 0) {
        return { ...plotDataResults, ...stateResults };
      }
      const fallbackResults = await progressiveTrendLoader(failedBindings, range, publishUpdate, options);
      return { ...plotDataResults, ...stateResults, ...fallbackResults };
    },
    [progressiveTrendLoader, rangeFrom, rangeTo],
  );
  const hasPiConnection = piConnection.status === 'connected';
  const handleSaveDashboard = useCallback(async () => {
    const name = globalThis.prompt?.('Nome do dashboard', document.name);
    if (name === null) {
      return;
    }

    const documentToSave = { ...document, name: name?.trim() || document.name };
    setDocument(documentToSave);
    setSaveState('saving');
    try {
      const saved = await savePimsVisionDashboard(documentToSave, dashboardUid);
      setDashboardUid(saved.uid);
      const savedUrl = new URL(globalThis.location.href);
      savedUrl.searchParams.set('dashboardUid', saved.uid);
      globalThis.history?.replaceState(null, '', `${savedUrl.pathname}${savedUrl.search}`);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [dashboardUid, document]);

  return (
    <div
      data-testid="pims-vision-home"
      data-visualization-theme={visualizationTheme}
      className={`${styles.container} ${visualizationTheme === 'light' ? styles.themeLight : styles.themeDark}`}
    >
      <header className={styles.header} data-testid="pims-vision-header">
        <span
          className={styles.productMark}
          role="img"
          aria-label="Aperam Visualization"
        />
        <div className={styles.productName}>Visualization</div>
        <div className={styles.displayContext}>Display operacional</div>
        <div className={styles.headerActions}>
          <div className={styles.headerConnectionRow}>
            <div className={styles.themeSelector} role="group" aria-label="Tema visual">
              <button type="button" className={visualizationTheme === 'dark' ? styles.themeButtonActive : styles.themeButton} aria-pressed={visualizationTheme === 'dark'} data-testid="visualization-theme-dark" onClick={() => setVisualizationTheme('dark')}>Escuro</button>
              <button type="button" className={visualizationTheme === 'light' ? styles.themeButtonActive : styles.themeButton} aria-pressed={visualizationTheme === 'light'} data-testid="visualization-theme-light" onClick={() => setVisualizationTheme('light')}>Claro</button>
            </div>
            <div className={`${styles.connectionStatus} ${piConnection.status === 'connected' ? styles.connectionStatusConnected : ''}`} data-testid="pi-connection-status">
              {getConnectionLabel(piConnection)}
            </div>
          </div>
          <div className={styles.headerSaveRow}>
            <button
              type="button"
              className={styles.saveButton}
              data-testid="pims-vision-save-dashboard"
              disabled={saveState === 'saving'}
              onClick={handleSaveDashboard}
            >{saveState === 'saving' ? 'Salvando...' : 'Salvar dashboard'}</button>
            {saveState !== 'idle' && (
              <span className={saveState === 'error' ? styles.saveError : styles.saveStatus} role="status">
                {saveState === 'saved' ? 'Salvo no Grafana' : saveState === 'error' ? 'Não foi possível salvar' : ''}
              </span>
            )}
          </div>
        </div>
      </header>
      <div className={styles.workspace}>
        <aside
          className={isAssetsPanelOpen ? styles.assetsPanel : styles.assetsPanelCollapsed}
          data-testid="pims-vision-assets-panel"
          aria-label="Ativos"
        >
          <div className={styles.assetsRail} aria-label="Navegação de ativos">
            <button
              type="button"
              className={isAssetsPanelOpen ? styles.assetsRailActive : styles.assetsRailCollapsedToggle}
              title={isAssetsPanelOpen ? 'Ocultar barra de ferramentas' : 'Mostrar barra de ferramentas'}
              aria-label={isAssetsPanelOpen ? 'Ocultar barra de ferramentas' : 'Mostrar barra de ferramentas'}
              aria-pressed={isAssetsPanelOpen}
              data-testid="pims-vision-toggle-assets-panel"
              onClick={() => setIsAssetsPanelOpen((prev) => !prev)}
            ><CubeIcon /></button>
            <span className={styles.assetsRailItem} title="PI Points" aria-label="PI Points"><DatabaseIcon /></span>
            <span className={styles.assetsRailItem} title="Pesquisa PI" aria-label="Pesquisa PI"><SearchIcon /></span>
          </div>
          {isAssetsPanelOpen && (
            <div className={styles.assetsBody}>
              <div className={styles.assetsHeader}>
                <span className={styles.assetsIcon} aria-hidden="true"><CubeIcon /></span>
                <span>Ativos</span>
              </div>
              <div className={styles.assetsSectionLabel}>PI System</div>
              {editorMode === 'edit' ? (
                <PiPointSearch
                  enabled={piConnection.status === 'connected'}
                  onSelect={setSelectedPiPoint}
                />
              ) : (
                <p className={styles.viewHint}>Selecione Editar para pesquisar e vincular PI Points.</p>
              )}
            </div>
          )}
        </aside>
        <main className={styles.editorArea} data-testid="pims-vision-editor-area">
          <DisplayEditor
            document={document}
            onChange={setDocument}
            onModeChange={setEditorMode}
            selectedPiPoint={selectedPiPoint}
            loadValue={hasPiConnection ? getPiPointCurrentValue : undefined}
            loadValues={hasPiConnection ? getPiPointsCurrentValues : undefined}
            loadTrend={hasPiConnection ? loadTrend : undefined}
            loadRecordedTrend={hasPiConnection ? loadTrend : undefined}
            showToolbar={isAssetsPanelOpen}
            dropSymbolType={dropSymbolType}
            onDropSymbolTypeChange={setDropSymbolType}
            trendRefreshKey={`${rangeFrom}:${rangeTo}`}
            trendTimeRange={{ from: rangeFrom, to: rangeTo }}
            timeSelection={timeSelection}
            onTimeSelectionChange={setTimeSelection}
          />
        </main>
      </div>
      <TimeRangeBar selection={timeSelection} onChange={setTimeSelection} />
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  themeDark: css`
    color-scheme: dark;
    --app-bg: #080f19;
    --surface-primary: #111923;
    --surface-secondary: #151e2a;
    --surface-elevated: #18212d;
    --panel-bg: #111923;
    --panel-header-bg: #17212d;
    --canvas-bg: #09121f;
    --canvas-dot: rgba(116, 143, 174, 0.2);
    --border-color: #2b394a;
    --border-subtle: #202d3c;
    --text-primary: #f1f2f5;
    --trend-cursor: #ffffff;
    --text-secondary: #aeb3bf;
    --text-muted: #7f8a9a;
    --accent: #d33b91;
    --accent-hover: #ed62ad;
    --accent-contrast: #ffffff;
    --input-bg: #0c1521;
    --button-bg: #172231;
    --button-hover: #223146;
    --selection-bg: rgba(211, 59, 145, 0.18);
    --focus-ring: rgba(237, 98, 173, 0.34);
    --success: #4ade80;
    --danger: #f87171;
    --shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
    --brand-logo: url('${PLUGIN_ASSET_BASE_URL}/img/image.png');
    --chart-band: rgba(255, 255, 255, 0.035);
    --element-bg: rgba(22, 31, 43, 0.92);
    --element-border: rgba(112, 132, 157, 0.42);
    --top-header-bg: linear-gradient(110deg, #0b131e 0%, #111a25 100%);
    --assets-header-bg: linear-gradient(105deg, rgba(156, 31, 119, 0.92), rgba(95, 26, 79, 0.8));
    --assets-header-text: #ffffff;
  `,
  themeLight: css`
    color-scheme: light;
    --app-bg: #f2f5f9;
    --surface-primary: #ffffff;
    --surface-secondary: #f8fafc;
    --surface-elevated: #ffffff;
    --panel-bg: #ffffff;
    --panel-header-bg: #f8fafc;
    --canvas-bg: #f8fafc;
    --canvas-dot: rgba(100, 116, 139, 0.16);
    --border-color: #d7dee8;
    --border-subtle: #e5e9f0;
    --text-primary: #1e293b;
    --trend-cursor: #000000;
    --text-secondary: #64748b;
    --text-muted: #94a3b8;
    --accent: #a82578;
    --accent-hover: #c42e8d;
    --accent-contrast: #ffffff;
    --input-bg: #ffffff;
    --button-bg: #f8fafc;
    --button-hover: #eef3f8;
    --selection-bg: rgba(168, 37, 120, 0.1);
    --focus-ring: rgba(168, 37, 120, 0.24);
    --success: #22c55e;
    --danger: #dc2626;
    --shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
    --brand-logo: url('${PLUGIN_ASSET_BASE_URL}/img/logo-visualization-header-light.png');
    --chart-band: rgba(100, 116, 139, 0.055);
    --element-bg: rgba(255, 255, 255, 0.96);
    --element-border: rgba(100, 116, 139, 0.38);
    --top-header-bg: #ffffff;
    --assets-header-bg: var(--panel-header-bg);
    --assets-header-text: var(--text-primary);
  `,
  container: css`
    display: flex;
    flex-direction: column;
    height: calc(100vh - 40px);
    height: calc(100dvh - 40px);
    max-height: calc(100vh - 40px);
    max-height: calc(100dvh - 40px);
    width: 100%;
    min-height: 0;
    box-sizing: border-box;
    overflow: hidden;
    color: var(--text-primary);
    background:
      radial-gradient(circle at 55% 35%, rgba(31, 66, 101, 0.16), transparent 48%),
      var(--app-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  `,
  header: css`
    flex: 0 0 76px;
    min-height: 76px;
    padding: 0 ${theme.spacing(3.5)};
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    box-sizing: border-box;
    color: var(--text-primary);
    background: var(--top-header-bg);
    border-bottom: 1px solid var(--border-color);
  `,
  productMark: css`
    width: 158px;
    height: 68px;
    flex: 0 0 158px;
    background-image: var(--brand-logo);
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
  `,
  productName: css`
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  `,
  displayContext: css`display: none;`,
  headerActions: css`
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    margin-left: auto;
  `,
  headerConnectionRow: css`
    display: flex;
    align-items: center;
    gap: 10px;
  `,
  headerSaveRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  saveButton: css`
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    color: var(--accent-contrast);
    background: var(--accent);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    &:hover:not(:disabled) { background: var(--accent-hover); }
    &:disabled { opacity: 0.65; cursor: wait; }
  `,
  saveStatus: css`
    color: var(--success);
    font-size: 12px;
    white-space: nowrap;
  `,
  saveError: css`
    color: var(--danger);
    font-size: 12px;
    white-space: nowrap;
  `,
  themeSelector: css`
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--surface-secondary);
  `,
  themeButton: css`
    min-width: 62px;
    height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    color: var(--text-secondary);
    background: transparent;
    cursor: pointer;
    font-size: 11px;
    &:hover { color: var(--text-primary); background: var(--button-hover); }
  `,
  themeButtonActive: css`
    min-width: 62px;
    height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    color: var(--accent-contrast);
    background: var(--accent);
    cursor: pointer;
    font-size: 11px;
  `,
  workspace: css`
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 14px;
    padding: 10px 10px 0;
    box-sizing: border-box;
  `,
  assetsPanel: css`
    display: flex;
    flex: 0 0 24.5%;
    min-width: 320px;
    overflow: hidden;
    gap: 10px;
    border: 0;
    background: var(--app-bg);
  `,
  assetsPanelCollapsed: css`
    display: flex;
    flex: 0 0 74px;
    min-width: 74px;
    overflow: hidden;
    border: 0;
    background: var(--app-bg);
  `,
  assetsRail: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 0 0 74px;
    gap: 10px;
    padding-top: 10px;
    color: var(--text-secondary);
    background: var(--surface-secondary);
    border: 1px solid var(--border-color);
    border-radius: 14px;
    overflow: hidden;
  `,
  assetsRailItem: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border: 1px solid var(--border-color);
    border-radius: 13px;
    background: var(--button-bg);
    color: var(--text-secondary);
  `,
  assetsRailActive: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    color: var(--accent);
    background: var(--selection-bg);
    border: 1px solid var(--accent);
    border-radius: 13px;
    box-shadow: 0 0 0 3px var(--focus-ring);
  `,
  assetsRailCollapsedToggle: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    color: var(--accent);
    background: var(--selection-bg);
    border: 1px solid var(--accent);
    border-radius: 13px;
    cursor: pointer;

    &:hover {
      color: var(--accent-hover);
      background: var(--button-hover);
    }
  `,
  assetsBody: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 14px;
    background: var(--panel-bg);
  `,
  assetsHeader: css`
    height: 72px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1.25)};
    padding: 0 ${theme.spacing(1.5)};
    color: var(--assets-header-text);
    background: var(--assets-header-bg);
    border-bottom: 1px solid var(--border-color);
    font-size: 18px;
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  assetsIcon: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--assets-header-text);
  `,
  assetsSectionLabel: css`
    padding: ${theme.spacing(1.5, 1.5, 0.5)};
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: ${theme.typography.fontWeightMedium};
    letter-spacing: 0.01em;
  `,
  editorArea: css`
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  `,
  connectionStatus: css`
    color: var(--text-secondary);
    font-size: 13px;
    white-space: nowrap;
  `,
  connectionStatusConnected: css`
    &::before {
      content: '';
      display: inline-block;
      width: 7px;
      height: 7px;
      margin-right: 6px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.16);
    }
  `,
  viewHint: css`
    margin: ${theme.spacing(1.5)};
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.45;
  `,
});

function DatabaseIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <ellipse cx="12" cy="5" rx="7" ry="3" />
    <path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
    <path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" />
  </svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m16 16 5 5" />
  </svg>;
}

function CubeIcon() {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </svg>;
}

function getConnectionLabel(connection: PiConnectionState): string {
  switch (connection.status) {
    case 'checking':
      return 'PI System: Verificando';
    case 'connected':
      return `PI System: Conectado (${connection.dataSource?.name ?? ''})`;
    case 'error':
      return 'PI System: Data Source indisponível';
    case 'not-configured':
      return 'PI System: Data Source não configurada';
  }
}
