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
  getPiPointDatabaseLimits,
  getPiPointDigitalStates,
  getPiPointsCurrentValues,
  searchPiPointsWithStatus,
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
import { LibraryPanel } from '../Library/LibraryPanel';
import { CalculationsPanel } from '../Calculations/CalculationsPanel';
import { MiniSheetsPanel } from '../MiniSheets/MiniSheetsPanel';
import { createDefaultTimeSelection } from '../../time/timeRange';
import { PLUGIN_ASSET_BASE_URL } from '../../constants';
import {
  hasDashboardTitleConflict,
  isGrafanaUserAuthenticated,
  loadPimsVisionDashboard,
  loadPimsVisionFolders,
  savePimsVisionDashboard,
  type GrafanaDashboardFolder,
} from '../../grafana/dashboardPersistence';

export type VisualizationTheme = 'dark' | 'light';

export const VISUALIZATION_THEME_STORAGE_KEY = 'aperam-visualization-theme';

type AuthenticationState = 'checking' | 'authenticated' | 'unauthenticated';
type ActiveModule = 'visualization' | 'sheets';
type AssetsTab = 'assets' | 'library' | 'calculations';

function getInitialTheme(): VisualizationTheme {
  try {
    return globalThis.localStorage?.getItem(VISUALIZATION_THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function App() {
  const styles = useStyles2(getStyles);
  const [authenticationState, setAuthenticationState] = useState<AuthenticationState>('checking');
  const [activeModule, setActiveModule] = useState<ActiveModule>('visualization');
  const [document, setDocument] = useState(() =>
    createDisplayDocument({ name: 'Visualization' }),
  );
  const [piConnection, setPiConnection] = useState<PiConnectionState>({ status: 'checking' });
  const [selectedPiPoint, setSelectedPiPoint] = useState<PiPointSearchResult | null>(null);
  const [editorMode, setEditorMode] = useState<DisplayEditorMode>('edit');
  const [dropSymbolType, setDropSymbolType] = useState<PiPointDropSymbolType>('trend');
  const [timeSelection, setTimeSelection] = useState(() => createDefaultTimeSelection());
  const [isAssetsPanelOpen, setIsAssetsPanelOpen] = useState(true);
  const [assetsTab, setAssetsTab] = useState<AssetsTab>('assets');
  const [openCalculationId, setOpenCalculationId] = useState<string>();
  const [isPiPointFiltersOpen, setIsPiPointFiltersOpen] = useState(false);
  const [isPiSearchOpen, setIsPiSearchOpen] = useState(true);
  const [visualizationTheme, setVisualizationTheme] = useState<VisualizationTheme>(getInitialTheme);
  const [dashboardUid, setDashboardUid] = useState<string>();
  const [folders, setFolders] = useState<GrafanaDashboardFolder[]>([]);
  const [selectedFolderUid, setSelectedFolderUid] = useState('');
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveFolderUid, setSaveFolderUid] = useState('');
  const [saveFolderSearch, setSaveFolderSearch] = useState('');
  const [expandedFolderUids, setExpandedFolderUids] = useState<string[]>([]);
  const [saveValidationError, setSaveValidationError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const progressiveTrendLoaderRef = useRef<ProgressiveTrendLoader>();
  if (!progressiveTrendLoaderRef.current) {
    progressiveTrendLoaderRef.current = createProgressiveTrendLoader(
      (bindings, range, options) => getPiTrendsHistoryForRange(bindings, range, options),
      (bindings, range, options) => getPiTrendsPreviewForRange(bindings, range, options),
    );
  }
  const progressiveTrendLoader = progressiveTrendLoaderRef.current;
  const resolveCalculationPiPoint = useCallback(async (name: string): Promise<PiPointSearchResult | undefined> => {
    const response = await searchPiPointsWithStatus({ term: name, limit: 20 });
    const exactMatch = response.results.find((result) => result.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0);
    return exactMatch ?? (response.results.length === 1 ? response.results[0] : undefined);
  }, []);

  useEffect(() => {
    let active = true;

    isGrafanaUserAuthenticated().then((authenticated) => {
      if (active) {
        setAuthenticationState(authenticated ? 'authenticated' : 'unauthenticated');
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authenticationState !== 'authenticated') {
      return;
    }

    let active = true;
    loadPimsVisionFolders()
      .then((availableFolders) => {
        if (active) {
          setFolders(availableFolders);
        }
      })
      .catch(() => {
        if (active) {
          setFolders([]);
        }
      });

    return () => {
      active = false;
    };
  }, [authenticationState]);

  useEffect(() => {
    if (authenticationState !== 'authenticated') {
      return;
    }

    let active = true;

    checkPiConnection().then((connection) => {
      if (active) {
        setPiConnection(connection);
      }
    });

    return () => {
      active = false;
    };
  }, [authenticationState]);

  useEffect(() => {
    if (authenticationState !== 'authenticated') {
      return;
    }

    const uid = new URLSearchParams(globalThis.location?.search ?? '').get('dashboardUid');
    if (!uid) {
      return;
    }

    let active = true;
    loadPimsVisionDashboard(uid)
      .then((savedDocument) => {
        if (active && savedDocument) {
          setDocument(savedDocument.document);
          setDashboardUid(uid);
          setSelectedFolderUid(savedDocument.folderUid);
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
  }, [authenticationState]);

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
  const openSaveAsDialog = useCallback(() => {
    setSaveName(document.name);
    setSaveFolderUid(selectedFolderUid);
    setSaveFolderSearch('');
    setSaveValidationError('');
    setSaveState('idle');
    setIsSaveDialogOpen(true);
  }, [document.name, selectedFolderUid]);

  const updateDashboardUrl = useCallback((uid: string) => {
    const savedUrl = new URL(globalThis.location.href);
    savedUrl.searchParams.set('dashboardUid', uid);
    globalThis.history?.replaceState(null, '', `${savedUrl.pathname}${savedUrl.search}`);
  }, []);

  const handleSaveDashboard = useCallback(async () => {
    if (!dashboardUid) {
      openSaveAsDialog();
      return;
    }

    setSaveState('saving');
    try {
      const saved = await savePimsVisionDashboard(document, dashboardUid, selectedFolderUid);
      setDashboardUid(saved.uid);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [dashboardUid, document, openSaveAsDialog, selectedFolderUid]);

  const handleSaveAsDashboard = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = saveName.trim();
    if (!title) {
      setSaveValidationError('Informe um nome para o dashboard.');
      return;
    }

    setSaveState('saving');
    try {
      if (await hasDashboardTitleConflict(title, saveFolderUid)) {
        setSaveValidationError('Já existe um dashboard com esse nome nesta pasta.');
        setSaveState('idle');
        return;
      }

      const documentToSave = { ...document, name: title };
      setDocument(documentToSave);
      const saved = await savePimsVisionDashboard(documentToSave, undefined, saveFolderUid);
      setDashboardUid(saved.uid);
      setSelectedFolderUid(saveFolderUid);
      setIsSaveDialogOpen(false);
      setSaveValidationError('');
      updateDashboardUrl(saved.uid);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [document, saveFolderUid, saveName, updateDashboardUrl]);

  if (authenticationState !== 'authenticated') {
    const loginUrl = `/login?redirect=${encodeURIComponent(globalThis.location?.href ?? '')}`;
    return (
      <div className={styles.authGate} data-testid="pims-vision-auth-gate">
        <div className={styles.authCard}>
          <span className={styles.productMark} role="img" aria-label="Aperam Visualization" />
          <h1>{authenticationState === 'checking' ? 'Verificando acesso' : 'Login necessário'}</h1>
          <p>
            {authenticationState === 'checking'
              ? 'Verificando sua sessão no Grafana...'
              : 'Faça login no Grafana para acessar o Visualization.'}
          </p>
          {authenticationState === 'unauthenticated' && (
            <a className={styles.loginButton} href={loginUrl}>Entrar no Grafana</a>
          )}
        </div>
      </div>
    );
  }

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
            >{saveState === 'saving' ? 'Salvando...' : 'Salvar'}</button>
            <button
              type="button"
              className={styles.saveAsButton}
              data-testid="pims-vision-save-as-dashboard"
              disabled={saveState === 'saving'}
              onClick={openSaveAsDialog}
            >Salvar como</button>
            {saveState !== 'idle' && (
              <span className={saveState === 'error' ? styles.saveError : styles.saveStatus} role="status">
                {saveState === 'saved' ? 'Salvo no Grafana' : saveState === 'error' ? 'Não foi possível salvar' : ''}
              </span>
            )}
          </div>
        </div>
      </header>
      {isSaveDialogOpen && (
        <div className={styles.dialogBackdrop} role="presentation">
          <form className={styles.saveDialog} role="dialog" aria-modal="true" aria-labelledby="save-dashboard-title" onSubmit={handleSaveAsDashboard}>
            <h2 id="save-dashboard-title">Salvar como</h2>
            <label className={styles.dialogLabel} htmlFor="save-dashboard-name">Nome do dashboard</label>
            <input
              id="save-dashboard-name"
              className={styles.dialogInput}
              value={saveName}
              autoFocus
              onChange={(event) => {
                setSaveName(event.target.value);
                setSaveValidationError('');
              }}
            />
            <label className={styles.dialogLabel} htmlFor="save-dashboard-folder-search">Pasta</label>
            <input
              id="save-dashboard-folder-search"
              className={styles.dialogInput}
              value={saveFolderSearch}
              placeholder="Buscar pastas"
              onChange={(event) => {
                setSaveFolderSearch(event.target.value);
              }}
            />
            <FolderPicker
              folders={folders}
              search={saveFolderSearch}
              selectedFolderUid={saveFolderUid}
              expandedFolderUids={expandedFolderUids}
              classes={{
                tree: styles.folderTree,
                row: styles.folderRow,
                rowSelected: styles.folderRowSelected,
                toggle: styles.folderToggle,
                indent: styles.folderIndent,
                empty: styles.folderEmpty,
              }}
              onSelect={(folderUid) => {
                setSaveFolderUid(folderUid);
                setSaveValidationError('');
              }}
              onToggle={(folderUid) => setExpandedFolderUids((current) => (
                current.includes(folderUid)
                  ? current.filter((uid) => uid !== folderUid)
                  : [...current, folderUid]
              ))}
            />
            {saveValidationError && <span className={styles.dialogError} role="alert">{saveValidationError}</span>}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.dialogCancelButton}
                onClick={() => setIsSaveDialogOpen(false)}
              >Cancelar</button>
              <button type="submit" className={styles.dialogSaveButton} data-testid="pims-vision-save-as-submit" disabled={saveState === 'saving'}>
                {saveState === 'saving' ? 'Salvando...' : 'Salvar como'}
              </button>
            </div>
          </form>
        </div>
      )}
      <div className={styles.workspace}>
        <aside
          className={isAssetsPanelOpen ? styles.assetsPanel : styles.assetsPanelCollapsed}
          data-testid="pims-vision-assets-panel"
          aria-label="Data, Library e Calculation"
        >
          <div className={styles.assetsRail} aria-label="Navegação de ativos">
            <button
              type="button"
              className={
                activeModule === 'visualization' && isAssetsPanelOpen
                  ? styles.assetsRailActive
                  : styles.assetsRailButton
              }
              title={isAssetsPanelOpen ? 'Ocultar barra de ferramentas' : 'Visualização'}
              aria-label={isAssetsPanelOpen ? 'Ocultar barra de ferramentas' : 'Mostrar barra de ferramentas'}
              aria-pressed={isAssetsPanelOpen}
              data-testid="pims-vision-toggle-assets-panel"
              onClick={() => {
                if (activeModule !== 'visualization') {
                  setActiveModule('visualization');
                  setIsAssetsPanelOpen(true);
                } else {
                  setIsAssetsPanelOpen((prev) => !prev);
                }
              }}
            ><CubeIcon /></button>
            <button
              type="button"
              className={activeModule === 'sheets' ? styles.assetsRailActive : styles.assetsRailButton}
              title="Mini-Sheets"
              aria-label="Mini-Sheets"
              aria-pressed={activeModule === 'sheets'}
              data-testid="pims-vision-sheets-tab"
              onClick={() => { setActiveModule('sheets'); setIsAssetsPanelOpen(true); }}
            ><SheetsIcon /></button>
            <span className={styles.assetsRailItem} title="PI Points" aria-label="PI Points"><DatabaseIcon /></span>
            <span className={styles.assetsRailItem} title="Pesquisa PI" aria-label="Pesquisa PI"><SearchIcon /></span>
          </div>
          {isAssetsPanelOpen && (
            <div className={styles.assetsBody}>
              {activeModule === 'visualization' ? <>
                  <div className={styles.assetsHeader} role="tablist" aria-label="Módulos do painel">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={assetsTab === 'assets'}
                      className={assetsTab === 'assets' ? styles.assetsHeaderTabActive : styles.assetsHeaderTab}
                      data-testid="pims-vision-assets-tab"
                      onClick={() => setAssetsTab('assets')}
                    ><span className={styles.assetsIcon} aria-hidden="true"><CubeIcon /></span><span>Data</span></button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={assetsTab === 'library'}
                      className={assetsTab === 'library' ? styles.assetsHeaderTabActive : styles.assetsHeaderTab}
                      data-testid="pims-vision-library-tab"
                      onClick={() => setAssetsTab('library')}
                    ><span className={styles.assetsIcon} aria-hidden="true"><FactoryIcon /></span><span>Library</span></button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={assetsTab === 'calculations'}
                      className={assetsTab === 'calculations' ? styles.assetsHeaderTabActive : styles.assetsHeaderTab}
                      data-testid="pims-vision-calculations-tab"
                      onClick={() => setAssetsTab('calculations')}
                    ><span className={styles.assetsIcon} aria-hidden="true"><CalculatorIcon /></span><span>Calculation</span></button>
                  </div>
                  <div className={styles.assetsContent}>
                    <div className={styles.assetsPiSearch} hidden={assetsTab !== 'assets'}>
                      <div className={styles.assetsSectionHeader}>
                        <button
                          type="button"
                          className={styles.sectionCollapseButton}
                          aria-expanded={isPiSearchOpen}
                          aria-controls="pi-system-search-content"
                          data-testid="pi-system-toggle"
                          onClick={() => setIsPiSearchOpen((open) => !open)}
                        >
                          <span className={styles.assetsSectionLabel}>PI System</span>
                          <ChevronIcon expanded={isPiSearchOpen} />
                        </button>
                        <button
                          type="button"
                          className={isPiPointFiltersOpen ? styles.piFilterButtonActive : styles.piFilterButton}
                          data-testid="pi-point-filter-toggle"
                          aria-label="Filtros da pesquisa de PI Points"
                          aria-expanded={isPiPointFiltersOpen}
                          title="Filtros"
                          onClick={() => setIsPiPointFiltersOpen((open) => !open)}
                        >
                          <FilterIcon />
                        </button>
                      </div>
                      {isPiSearchOpen && <div id="pi-system-search-content" className={styles.piSearchContent}>
                        {editorMode === 'edit' ? (
                          <PiPointSearch
                            enabled={piConnection.status === 'connected'}
                            onSelect={setSelectedPiPoint}
                            filtersOpen={isPiPointFiltersOpen}
                            onCloseFilters={() => setIsPiPointFiltersOpen(false)}
                          />
                        ) : (
                          <p className={styles.viewHint}>Selecione Editar para pesquisar e vincular PI Points.</p>
                        )}
                      </div>}
                    </div>
                    <div className={styles.libraryTabContent} hidden={assetsTab !== 'library'}>
                      <LibraryPanel />
                    </div>
                    <div className={`${styles.libraryTabContent} ${styles.calculationsTabContent}`} hidden={assetsTab !== 'calculations'}>
                      <CalculationsPanel
                        document={document}
                        onChange={setDocument}
                        resolvePiPoint={resolveCalculationPiPoint}
                        loadValue={hasPiConnection ? getPiPointCurrentValue : undefined}
                        openCalculationId={openCalculationId}
                        onCalculationOpenHandled={() => setOpenCalculationId(undefined)}
                      />
                    </div>
                  </div>
              </> : <div id="pims-sheets-menu-slot" className={styles.sheetsMenuSlot} data-testid="pims-sheets-menu-slot" />}
            </div>
          )}
        </aside>
        <main className={styles.editorArea} data-testid="pims-vision-editor-area">
          <div style={{ display: activeModule === 'visualization' ? 'flex' : 'none', flex: 1, minWidth: 0, minHeight: 0 }}>
            <DisplayEditor
              document={document}
              onChange={setDocument}
              onModeChange={setEditorMode}
              selectedPiPoint={selectedPiPoint}
              loadValue={hasPiConnection ? getPiPointCurrentValue : undefined}
              loadPiPointDatabaseLimits={hasPiConnection ? getPiPointDatabaseLimits : undefined}
              loadDigitalStates={hasPiConnection ? getPiPointDigitalStates : undefined}
              loadValues={hasPiConnection ? getPiPointsCurrentValues : undefined}
              loadTrend={hasPiConnection ? loadTrend : undefined}
              loadRecordedTrend={hasPiConnection ? loadTrend : undefined}
              loadRecordedData={hasPiConnection ? (bindings, range, options) => getPiTrendsRecordedHistoryForRange(bindings, range, options) : undefined}
              loadInterpolatedData={hasPiConnection ? (bindings, range, options) => getPiTrendsPreviewForRange(bindings, range, options) : undefined}
              showToolbar={isAssetsPanelOpen}
              symbolModeOnly={assetsTab === 'calculations'}
              dropSymbolType={dropSymbolType}
              onDropSymbolTypeChange={setDropSymbolType}
              trendRefreshKey={`${rangeFrom}:${rangeTo}`}
              trendTimeRange={{ from: rangeFrom, to: rangeTo }}
              timeSelection={timeSelection}
              onTimeSelectionChange={setTimeSelection}
              onCalculationOpen={(calculationId) => {
                setAssetsTab('calculations');
                setIsAssetsPanelOpen(true);
                setOpenCalculationId(calculationId);
              }}
            />
          </div>
          <div style={{ display: activeModule === 'sheets' ? 'flex' : 'none', flex: 1, minWidth: 0, minHeight: 0 }}>
            <MiniSheetsPanel
              initialDocument={document.miniSheets}
              dataLinkMenuHostId="pims-sheets-menu-slot"
              dataLinkMenuActive={activeModule === 'sheets' && isAssetsPanelOpen}
              onChange={(miniSheetsDoc) => {
                setDocument((prev) => {
                  if (prev.miniSheets === miniSheetsDoc) {
                    return prev;
                  }
                  return {
                    ...prev,
                    miniSheets: miniSheetsDoc,
                  };
                });
              }}
            />
          </div>
        </main>
      </div>
      <TimeRangeBar selection={timeSelection} onChange={setTimeSelection} />
    </div>
  );
}

interface FolderPickerProps {
  folders: GrafanaDashboardFolder[];
  search: string;
  selectedFolderUid: string;
  expandedFolderUids: string[];
  classes: {
    tree: string;
    row: string;
    rowSelected: string;
    toggle: string;
    indent: string;
    empty: string;
  };
  onSelect: (folderUid: string) => void;
  onToggle: (folderUid: string) => void;
}

function FolderPicker({
  folders,
  search,
  selectedFolderUid,
  expandedFolderUids,
  classes,
  onSelect,
  onToggle,
}: FolderPickerProps) {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const foldersByParent = new Map<string, GrafanaDashboardFolder[]>();
  folders.forEach((folder) => {
    const parentUid = folder.parentFolderUid ?? '';
    const siblings = foldersByParent.get(parentUid) ?? [];
    siblings.push(folder);
    foldersByParent.set(parentUid, siblings);
  });
  foldersByParent.forEach((siblings) => siblings.sort((first, second) => first.title.localeCompare(second.title)));

  if (normalizedSearch) {
    const matches = folders.filter((folder) => folder.title.toLocaleLowerCase().includes(normalizedSearch));
    return (
      <div className={classes.tree} role="tree" aria-label="Pastas disponíveis">
        {matches.length === 0 ? (
          <span className={classes.empty}>Nenhuma pasta encontrada.</span>
        ) : matches.map((folder) => (
          <button
            key={folder.uid}
            type="button"
            className={selectedFolderUid === folder.uid ? classes.rowSelected : classes.row}
            role="treeitem"
            aria-selected={selectedFolderUid === folder.uid}
            onClick={() => onSelect(folder.uid)}
          >{folder.title}</button>
        ))}
      </div>
    );
  }

  const renderChildren = (parentUid: string, depth: number): React.ReactNode => (
    (foldersByParent.get(parentUid) ?? []).map((folder) => {
      const children = foldersByParent.get(folder.uid) ?? [];
      const isExpanded = expandedFolderUids.includes(folder.uid);
      return (
        <React.Fragment key={folder.uid}>
          <div className={selectedFolderUid === folder.uid ? classes.rowSelected : classes.row} role="treeitem" aria-level={depth + 1} aria-selected={selectedFolderUid === folder.uid}>
            <span className={classes.indent} style={{ width: `${depth * 16}px` }} />
            {children.length > 0 ? (
              <button type="button" className={classes.toggle} aria-label={`${isExpanded ? 'Fechar' : 'Abrir'} ${folder.title}`} aria-expanded={isExpanded} onClick={() => onToggle(folder.uid)}>{isExpanded ? '⌄' : '›'}</button>
            ) : <span className={classes.toggle} aria-hidden="true" />}
            <button type="button" className={classes.row} onClick={() => onSelect(folder.uid)}>{folder.title}</button>
          </div>
          {isExpanded && renderChildren(folder.uid, depth + 1)}
        </React.Fragment>
      );
    })
  );

  return (
    <div className={classes.tree} role="tree" aria-label="Pastas disponíveis">
      <button type="button" className={selectedFolderUid === '' ? classes.rowSelected : classes.row} role="treeitem" aria-selected={selectedFolderUid === ''} onClick={() => onSelect('')}>Geral</button>
      {renderChildren('', 0)}
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
    --assets-header-muted: rgba(255, 255, 255, 0.72);
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
    --assets-header-muted: #64748b;
  `,
  authGate: css`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
    box-sizing: border-box;
    color: #f1f2f5;
    background: #080f19;
  `,
  authCard: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(420px, 100%);
    padding: 32px;
    box-sizing: border-box;
    border: 1px solid #2b394a;
    border-radius: 12px;
    background: #111923;
    text-align: center;

    h1 { margin: 8px 0; font-size: 22px; }
    p { margin: 0 0 20px; color: #aeb3bf; line-height: 1.5; }
  `,
  loginButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 0 16px;
    border-radius: 8px;
    color: #ffffff;
    background: #d33b91;
    text-decoration: none;
    font-weight: 600;
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
    gap: 3px;
    box-sizing: border-box;
    margin-left: auto;
  `,
  headerConnectionRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  headerSaveRow: css`
    display: flex;
    align-items: center;
    gap: 6px;
  `,
  saveButton: css`
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    color: var(--accent-contrast);
    background: var(--accent);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    &:hover:not(:disabled) { background: var(--accent-hover); }
    &:disabled { opacity: 0.65; cursor: wait; }
  `,
  saveAsButton: css`
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    &:hover:not(:disabled) { background: var(--button-hover); }
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
  dialogBackdrop: css`
    position: fixed;
    z-index: 10;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(3, 8, 15, 0.72);
  `,
  saveDialog: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(440px, 100%);
    padding: 24px;
    box-sizing: border-box;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    color: var(--text-primary);
    background: var(--surface-elevated);
    box-shadow: var(--shadow);

    h2 { margin: 0 0 10px; font-size: 18px; }
  `,
  dialogLabel: css`
    margin-top: 6px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  `,
  dialogInput: css`
    width: 100%;
    min-height: 38px;
    padding: 0 10px;
    box-sizing: border-box;
    border: 1px solid var(--border-color);
    border-radius: 7px;
    outline: none;
    color: var(--text-primary);
    background: var(--input-bg);

    &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
  `,
  folderTree: css`
    display: flex;
    flex-direction: column;
    max-height: 210px;
    overflow: auto;
    border: 1px solid var(--border-color);
    border-radius: 7px;
    background: var(--input-bg);
  `,
  folderRow: css`
    display: flex;
    align-items: center;
    min-height: 34px;
    width: 100%;
    padding: 0 10px;
    box-sizing: border-box;
    border: 0;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-primary);
    background: transparent;
    cursor: pointer;
    text-align: left;
    font-size: 12px;

    &:hover { background: var(--button-hover); }
  `,
  folderRowSelected: css`
    display: flex;
    align-items: center;
    min-height: 34px;
    width: 100%;
    padding: 0 10px;
    box-sizing: border-box;
    border: 0;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-primary);
    background: var(--selection-bg);
    box-shadow: inset 3px 0 0 var(--accent);
    cursor: pointer;
    text-align: left;
    font-size: 12px;
  `,
  folderToggle: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 24px;
    width: 24px;
    height: 30px;
    padding: 0;
    border: 0;
    color: var(--text-secondary);
    background: transparent;
    cursor: pointer;
    font-size: 18px;
  `,
  folderIndent: css`
    display: inline-block;
    flex: 0 0 auto;
  `,
  folderEmpty: css`
    padding: 12px;
    color: var(--text-secondary);
    font-size: 12px;
  `,
  dialogError: css`
    margin-top: 4px;
    color: var(--danger);
    font-size: 12px;
    line-height: 1.4;
  `,
  dialogActions: css`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  `,
  dialogCancelButton: css`
    min-height: 34px;
    padding: 0 13px;
    border: 1px solid var(--border-color);
    border-radius: 7px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
  `,
  dialogSaveButton: css`
    min-height: 34px;
    padding: 0 14px;
    border: 1px solid var(--accent);
    border-radius: 7px;
    color: var(--accent-contrast);
    background: var(--accent);
    cursor: pointer;
    font-weight: 600;
    &:disabled { opacity: 0.65; cursor: wait; }
  `,
  themeSelector: css`
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--surface-secondary);
  `,
  themeButton: css`
    min-width: 56px;
    height: 28px;
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
    min-width: 56px;
    height: 28px;
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
  assetsRailButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border: 1px solid var(--border-color);
    border-radius: 13px;
    background: var(--button-bg);
    color: var(--text-secondary);
    cursor: pointer;

    &:hover {
      color: var(--accent-hover, var(--text-primary));
      background: var(--button-hover);
      border-color: var(--accent, #b4167e);
    }
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
    cursor: pointer;
  `,
  assetsRailCollapsedToggle: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    color: var(--text-secondary);
    background: var(--button-bg);
    border: 1px solid var(--border-color);
    border-radius: 13px;
    cursor: pointer;

    &:hover {
      color: var(--accent-hover, var(--text-primary));
      background: var(--button-hover);
      border-color: var(--accent, #b4167e);
    }
  `,
  assetsBody: css`
    container-type: inline-size;
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
  sheetsMenuSlot: css`
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
  `,
  assetsContent: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
  `,
  assetsPiSearch: css`
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  `,
  piSearchContent: css`
    display: flex;
    flex: 0 0 auto;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
  `,
  libraryTabContent: css`
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    &[hidden] { display: none; }
  `,
  calculationsTabContent: css`
    flex: 0 0 auto;
  `,
  assetsHeader: css`
    height: 72px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0;
    color: var(--assets-header-text);
    background: var(--assets-header-bg);
    border-bottom: 1px solid var(--border-color);
    font-size: 14px;
    font-weight: ${theme.typography.fontWeightRegular};
    @container (min-width: 560px) {
      height: 105px;
      font-size: 24px;
    }
  `,
  assetsHeaderTab: css`
    display: flex;
    align-items: center;
    justify-content: flex-start;
    align-self: stretch;
    min-width: 0;
    flex: 1;
    gap: 5px;
    padding: 0 6px;
    border: 0;
    border-right: 1px solid rgba(255, 255, 255, 0.22);
    color: var(--assets-header-muted);
    background: transparent;
    cursor: pointer;
    font: inherit;
    white-space: nowrap;
    &:last-child { flex: 1.25; }
    &:last-child { border-right: 0; }
    &:hover { color: var(--assets-header-text); background: var(--button-hover); }
    @container (min-width: 560px) {
      gap: 20px;
      padding: 0 30px;
    }
  `,
  assetsHeaderTabActive: css`
    display: flex;
    align-items: center;
    justify-content: flex-start;
    align-self: stretch;
    min-width: 0;
    flex: 1;
    gap: 5px;
    padding: 0 6px;
    border: 0;
    border-right: 1px solid rgba(255, 255, 255, 0.22);
    color: #ffffff;
    background: linear-gradient(135deg, #b4167e 0%, #9d126e 100%);
    cursor: pointer;
    font: inherit;
    font-weight: ${theme.typography.fontWeightRegular};
    white-space: nowrap;
    &:last-child { flex: 1.25; }
    &:last-child { border-right: 0; }
    @container (min-width: 560px) {
      gap: 20px;
      padding: 0 30px;
    }
  `,
  assetsIcon: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 32px;
    width: 32px;
    height: 40px;
    color: currentColor;
    svg { width: 32px; height: 32px; stroke-width: 1.55; }
    @container (min-width: 560px) {
      flex-basis: 52px;
      width: 52px;
      height: 60px;
      svg { width: 52px; height: 52px; stroke-width: 1.45; }
    }
  `,
  assetsSectionHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 39px;
    padding: ${theme.spacing(0.75, 1.25, 0.25, 1.5)};
  `,
  assetsSectionLabel: css`
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: ${theme.typography.fontWeightMedium};
    letter-spacing: 0.01em;
  `,
  sectionCollapseButton: css`
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 0;
    border: 0;
    color: var(--text-secondary);
    background: transparent;
    cursor: pointer;
    &:hover { color: var(--text-primary); }
  `,
  piFilterButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--button-bg);
    color: var(--text-secondary);
    cursor: pointer;

    &:hover {
      color: var(--text-primary);
      background: var(--button-hover);
    }
  `,
  piFilterButtonActive: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--accent);
    border-radius: 3px;
    background: var(--selection-bg);
    color: var(--accent);
    cursor: pointer;
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

function FilterIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 5h18" />
    <path d="M6 12h12" />
    <path d="M10 19h4" />
  </svg>;
}

function CubeIcon() {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </svg>;
}

function FactoryIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 20V9l6 3V8l6 3V5h4v15" />
    <path d="M2 20h20M6 16v4M11 16v4M16 16v4M19 8h2v12" />
  </svg>;
}

function CalculatorIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 18h2M14 18h2" />
  </svg>;
}

function SheetsIcon() {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </svg>;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={expanded ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
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
