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
  getPiTrendsPreviewForRange,
  getPiTrendsRecordedHistoryForRange,
  createProgressiveTrendLoader,
  type PiConnectionState,
  type PiPointSearchResult,
  type ProgressiveTrendLoader,
} from '../../pi';
import { PiPointSearch } from '../../pi/PiPointSearch';
import type { LoadTrendSeries } from '../../display/runtime/trendRuntime';
import { TimeRangeBar } from '../TimeRangeBar';
import { createDefaultTimeSelection } from '../../time/timeRange';

export function App() {
  const styles = useStyles2(getStyles);
  const [document, setDocument] = useState(() =>
    createDisplayDocument({ name: 'PIMS Vision' }),
  );
  const [piConnection, setPiConnection] = useState<PiConnectionState>({ status: 'checking' });
  const [selectedPiPoint, setSelectedPiPoint] = useState<PiPointSearchResult | null>(null);
  const [editorMode, setEditorMode] = useState<DisplayEditorMode>('edit');
  const [dropSymbolType, setDropSymbolType] = useState<PiPointDropSymbolType>('trend');
  const [timeSelection, setTimeSelection] = useState(() => createDefaultTimeSelection());
  const [isAssetsPanelOpen, setIsAssetsPanelOpen] = useState(true);
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

  const rangeFrom = timeSelection.range.from;
  const rangeTo = timeSelection.range.to;
  const loadTrend = useCallback<LoadTrendSeries>(
    (bindings, publishUpdate, options) => progressiveTrendLoader(
      bindings,
      { from: rangeFrom, to: rangeTo },
      publishUpdate,
      options,
    ),
    [progressiveTrendLoader, rangeFrom, rangeTo],
  );
  const loadRecordedTrend = useCallback<LoadTrendSeries>(
    (bindings, _publishUpdate, options) => getPiTrendsRecordedHistoryForRange(
      bindings,
      { from: rangeFrom, to: rangeTo },
      options,
    ),
    [rangeFrom, rangeTo],
  );
  const hasPiConnection = piConnection.status === 'connected';

  return (
    <div data-testid="pims-vision-home" className={styles.container}>
      <header className={styles.header} data-testid="pims-vision-header">
        <div className={styles.productMark} aria-hidden="true">
          <span className={styles.productMarkTop} />
          <span className={styles.productMarkBottom} />
        </div>
        <div className={styles.productName}>PIMS Vision</div>
        <div className={styles.displayContext}>Display operacional</div>
        <div className={styles.connectionStatus} data-testid="pi-connection-status">
          {getConnectionLabel(piConnection)}
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
              <div className={styles.assetTools} role="group" aria-label="Símbolo criado ao arrastar">
                <button type="button" className={dropSymbolType === 'trend' ? styles.assetToolActive : styles.assetTool} title="Arrastar como Trend" aria-label="Arrastar como Trend" aria-pressed={dropSymbolType === 'trend'} onClick={() => setDropSymbolType('trend')}><TrendIcon /></button>
                <button type="button" className={dropSymbolType === 'value' ? styles.assetToolActive : styles.assetTool} title="Arrastar como Value" aria-label="Arrastar como Value" aria-pressed={dropSymbolType === 'value'} onClick={() => setDropSymbolType('value')}><ValueIcon /></button>
                <button type="button" className={dropSymbolType === 'gauge' ? styles.assetToolActive : styles.assetTool} title="Arrastar como Gauge" aria-label="Arrastar como Gauge" aria-pressed={dropSymbolType === 'gauge'} onClick={() => setDropSymbolType('gauge')}><GaugeIcon /></button>
                <button type="button" className={dropSymbolType === 'bar' ? styles.assetToolActive : styles.assetTool} title="Arrastar como Barra" aria-label="Arrastar como Barra" aria-pressed={dropSymbolType === 'bar'} onClick={() => setDropSymbolType('bar')}><BarIcon /></button>
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
            loadRecordedTrend={hasPiConnection ? loadRecordedTrend : undefined}
            showToolbar={isAssetsPanelOpen}
            dropSymbolType={dropSymbolType}
            trendRefreshKey={`${rangeFrom}:${rangeTo}`}
            trendTimeRange={{ from: rangeFrom, to: rangeTo }}
          />
        </main>
      </div>
      <TimeRangeBar selection={timeSelection} onChange={setTimeSelection} />
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    min-height: 0;
    box-sizing: border-box;
    overflow: hidden;
    background: #d9dce2;
  `,
  header: css`
    flex: 0 0 38px;
    min-height: 38px;
    padding: 0 ${theme.spacing(1.5)};
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    box-sizing: border-box;
    color: #ffffff;
    background: #09294a;
    border-bottom: 1px solid #315273;
  `,
  productMark: css`
    position: relative;
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    border: 1px solid #d6e0eb;
    background: #f4f6f8;
  `,
  productMarkTop: css`
    position: absolute;
    top: 3px;
    left: 3px;
    width: 6px;
    height: 4px;
    border: 1px solid #e59b37;
  `,
  productMarkBottom: css`
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 6px;
    height: 4px;
    border: 1px solid #4f84c4;
  `,
  productName: css`
    font-size: 14px;
    font-weight: ${theme.typography.fontWeightMedium};
    letter-spacing: 0.01em;
  `,
  displayContext: css`
    color: rgba(255, 255, 255, 0.72);
    font-size: 11px;
  `,
  workspace: css`
    display: flex;
    flex: 1;
    min-height: 0;
  `,
  assetsPanel: css`
    display: flex;
    flex: 0 0 24.5%;
    min-width: 320px;
    overflow: hidden;
    border-right: 1px solid #aeb7c3;
    background: #e3e5e8;
  `,
  assetsPanelCollapsed: css`
    display: flex;
    flex: 0 0 52px;
    min-width: 52px;
    overflow: hidden;
    border-right: 1px solid #aeb7c3;
    background: #e3e5e8;
  `,
  assetsRail: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 0 0 52px;
    gap: 2px;
    padding-top: 8px;
    color: #dce6f0;
    background: #09294a;
    border-right: 1px solid #1f4265;
  `,
  assetsRailItem: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 46px;
    color: #dce6f0;
  `,
  assetsRailActive: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 46px;
    color: #ffffff;
    background: #29466e;
    border-left: 3px solid #29466e;
  `,
  assetsRailCollapsedToggle: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 46px;
    color: #ffffff;
    background: #173c63;
    border: 0;
    border-left: 3px solid #173c63;
    cursor: pointer;

    &:hover {
      color: #ffffff;
      background: #204b78;
    }
  `,
  assetsBody: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  `,
  assetsHeader: css`
    height: 42px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1.25)};
    padding: 0 ${theme.spacing(1.5)};
    color: #ffffff;
    background: #29466e;
    border-bottom: 1px solid #29466e;
    font-size: 16px;
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  assetsIcon: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: #1e344b;
  `,
  assetTools: css`
    display: flex;
    align-items: center;
    gap: 5px;
    height: 76px;
    padding: 0 ${theme.spacing(1.5)};
    border-bottom: 1px solid #c3c9d1;
    background: #52677c;
  `,
  assetTool: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 36px;
    padding: 0;
    color: #ffffff;
    border: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.38);
    }
  `,
  assetToolActive: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 36px;
    padding: 0;
    color: #ffffff;
    background: #092f56;
    border: 1px solid #e59b37;
    border-radius: 0;
    cursor: pointer;
  `,
  assetsSectionLabel: css`
    padding: ${theme.spacing(1.5, 1.5, 0.5)};
    color: #50657c;
    font-size: 10px;
    font-weight: ${theme.typography.fontWeightMedium};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  editorArea: css`
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  `,
  connectionStatus: css`
    margin-left: auto;
    color: rgba(255, 255, 255, 0.82);
    font-size: 10px;
    white-space: nowrap;
  `,
  viewHint: css`
    margin: ${theme.spacing(1.5)};
    color: #50657c;
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

function TrendIcon() {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" /><path d="m6 16 4-5 3 3 5-7" /></svg>;
}

function ValueIcon() {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="4" width="16" height="16" /><text x="12" y="15" fill="currentColor" stroke="none" fontSize="8" textAnchor="middle">123</text></svg>;
}

function GaugeIcon() {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 17a8 8 0 1 1 16 0" /><path d="m12 13 4-4" /><path d="M7 18h10" /></svg>;
}

function BarIcon() {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 19V9M10 19V5M15 19v-7M20 19V3" /><path d="M3 20h19" /></svg>;
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
