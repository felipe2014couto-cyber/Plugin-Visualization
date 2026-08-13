import React, { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { TimeRangeBar } from '../../components/TimeRangeBar';
import type { DisplayTimeRange, DisplayTimeSelection } from '../../time/timeRange';
import type { TrendSeriesViewState } from './TrendElementView';
import { resolveTrendCursorValue, type TrendCursor } from '../runtime/trendCursor';
import { DEFAULT_TREND_VISUAL_OPTIONS, type TrendScaleMode, type TrendVisualOptions } from '../createTrend';

export interface TrendPopupProps {
  seriesStates: readonly TrendSeriesViewState[];
  timeRange?: DisplayTimeRange;
  timeSelection?: DisplayTimeSelection;
  onTimeSelectionChange?: (selection: DisplayTimeSelection) => void;
  loading?: boolean;
  visualOptions?: TrendVisualOptions;
  onClose: () => void;
}

const POPUP_WIDTH = 2400;
const POPUP_HEIGHT = 800;
const SCALE_INTERVALS = 10;
const MAX_NAMED_STATE_LABELS = 8;
const POPUP_AXIS_FONT_SIZE = 15;
const POPUP_LEGEND_LINE_HEIGHT = 19;
const POPUP_LEGEND_ITEM_HEIGHT = 46;
type PopupScaleMode = TrendScaleMode;
type PopupCustomScales = Record<string, { min: string; max: string }>;
interface PopupZoom {
  from: number;
  to: number;
  topRatio: number;
  bottomRatio: number;
}

export function TrendPopup({ seriesStates, timeRange, timeSelection, onTimeSelectionChange, loading = false, visualOptions = DEFAULT_TREND_VISUAL_OPTIONS, onClose }: TrendPopupProps) {
  const [scaleMode, setScaleMode] = useState<PopupScaleMode>(visualOptions.scaleMode === 'configurable' ? 'configurable' : 'individual');
  const [customScales, setCustomScales] = useState<PopupCustomScales>({});
  const [cursorMode, setCursorMode] = useState(true);
  const [zoomMode, setZoomMode] = useState(true);
  const [zoomHistory, setZoomHistory] = useState<PopupZoom[]>([]);
  const [cursors, setCursors] = useState<TrendCursor[]>([]);
  const [selectedCursorId, setSelectedCursorId] = useState<string | null>(null);
  const [cursorDrag, setCursorDrag] = useState<{ id: string; pointerId: number } | null>(null);
  const nextCursorId = useRef(1);

  useEffect(() => setScaleMode(visualOptions.scaleMode === 'configurable' ? 'configurable' : 'individual'), [visualOptions.scaleMode]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    const undoZoom = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (editingText || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') {
        return;
      }
      setZoomHistory((current) => {
        if (current.length === 0) {
          return current;
        }
        event.preventDefault();
        return current.slice(0, -1);
      });
    };
    window.addEventListener('keydown', undoZoom);
    return () => window.removeEventListener('keydown', undoZoom);
  }, []);

  const addCursor = (time: number) => {
    const cursor = { id: `popup-cursor-${nextCursorId.current}`, time };
    nextCursorId.current += 1;
    setCursors((current) => [...current, cursor]);
    setSelectedCursorId(cursor.id);
  };
  const configurableSeries = seriesStates.flatMap(({ series, runtimeState }) => {
    const points = runtimeState.status === 'success' || runtimeState.status === 'error'
      ? runtimeState.data?.points ?? []
      : [];
    return points.length > 0 ? [{ series, automaticScale: createNiceScale(points.map(({ value }) => value)) }] : [];
  });
  const activateConfigurableScale = () => {
    setScaleMode('configurable');
    setCustomScales((current) => {
      const next = { ...current };
      for (const { series, automaticScale } of configurableSeries) {
        const key = popupSeriesKey(series);
        next[key] ??= { min: formatValue(Number.isFinite(series.scaleMin) ? series.scaleMin as number : automaticScale.min), max: formatValue(Number.isFinite(series.scaleMax) ? series.scaleMax as number : automaticScale.max) };
      }
      return next;
    });
  };

  return (
    <section className={styles.popup} role="dialog" aria-modal="true" aria-label="Pop-up de tendência" data-testid="trend-popup">
      <header className={styles.topHeader}>
        <span
          className={styles.brand}
          role="img"
          aria-label="Aperam Visualization"
        />
        <div className={styles.topActions}>
          <button type="button" className={styles.newDisplayButton}><span>+</span> Novo display</button>
          <button type="button" className={styles.headerIconButton} aria-label="Mais opções">⋮</button>
          <button type="button" className={styles.headerIconButton} aria-label="Ajuda">?</button>
        </div>
      </header>
      <div className={styles.titleBar}>
        <span className={styles.title}>Pop-up de tendência</span>
        <button type="button" className={styles.closeButton} onClick={onClose} data-testid="trend-popup-close" aria-label="Fechar pop-up de tendência">
          <span>Fechar</span><span className={styles.closeIcon}>×</span>
        </button>
      </div>
      <div className={styles.chartPanel}>
        <div className={styles.chartToolbar}>
          <button type="button" className={scaleMode === 'single' ? styles.trendToolActive : styles.trendTool} aria-pressed={scaleMode === 'single'} data-testid="trend-popup-scale-single" onClick={() => setScaleMode('single')}>
            <TrendToolIcon kind="single" /><span>Escala única</span>
          </button>
          <button type="button" className={scaleMode === 'individual' || scaleMode === 'multiple' || scaleMode === 'configurable' ? styles.trendToolActive : styles.trendTool} aria-pressed={scaleMode !== 'single'} data-testid="trend-popup-scale-multiple" onClick={() => setScaleMode('individual')}>
            <TrendToolIcon kind="multiple" /><span>Individual por série</span>
          </button>
          <button type="button" className={scaleMode === 'configurable' ? styles.trendToolActive : styles.trendTool} aria-pressed={scaleMode === 'configurable'} data-testid="trend-popup-scale-configurable" onClick={activateConfigurableScale}>
            <TrendToolIcon kind="configurable" /><span>Escala configurável</span>
          </button>
          <button
            type="button"
            className={cursorMode ? styles.trendToolActive : styles.trendTool}
            aria-pressed={cursorMode}
            data-testid="trend-popup-cursor-mode"
            title="Adicionar e mover cursores"
            onClick={() => {
              setCursorMode((enabled) => !enabled);
            }}
          >
            <TrendToolIcon kind="cursor" /><span>Cursores</span>
          </button>
          <button
            type="button"
            className={zoomMode ? styles.trendToolActive : styles.trendTool}
            aria-pressed={zoomMode}
            data-testid="trend-popup-zoom-mode"
            onClick={() => {
              setZoomMode((enabled) => !enabled);
            }}
          >
            <TrendToolIcon kind="zoom" /><span>Zoom</span>
          </button>
          <button
            type="button"
            className={styles.trendTool}
            data-testid="trend-popup-clear-cursors"
            disabled={cursors.length === 0}
            onClick={() => {
              setCursors([]);
              setSelectedCursorId(null);
              setCursorDrag(null);
            }}
          >
            <TrendToolIcon kind="clear" /><span>Limpar cursores</span>
          </button>
        </div>
        {scaleMode === 'configurable' && (
          <div className={styles.scaleConfiguration} data-testid="trend-popup-scale-configuration">
            {configurableSeries.length > 0 ? configurableSeries.map(({ series }) => {
              const key = popupSeriesKey(series);
              const scale = customScales[key] ?? { min: '', max: '' };
              return (
                <div key={key} className={styles.scaleConfigurationRow}>
                  <span className={styles.seriesSwatch} style={{ background: series.color }} />
                  <strong>{series.binding.pointName}</strong>
                  <label>Min<input type="number" value={scale.min} data-testid={`trend-popup-scale-min-${key}`} onChange={(event) => {
                    const min = event.currentTarget.value;
                    setCustomScales((current) => ({ ...current, [key]: { ...scale, min } }));
                  }} /></label>
                  <label>Máx<input type="number" value={scale.max} data-testid={`trend-popup-scale-max-${key}`} onChange={(event) => {
                    const max = event.currentTarget.value;
                    setCustomScales((current) => ({ ...current, [key]: { ...scale, max } }));
                  }} /></label>
                  <button type="button" onClick={() => setCustomScales((current) => {
                    const { [key]: _removed, ...next } = current;
                    return next;
                  })}>Automático</button>
                </div>
              );
            }) : <span className={styles.noConfigurableSeries}>Nenhuma série numérica disponível.</span>}
          </div>
        )}
        <div className={styles.chartArea}>
          <svg
            className={styles.chart}
            width="100%"
            height="100%"
            viewBox={`0 0 ${POPUP_WIDTH} ${POPUP_HEIGHT}`}
            preserveAspectRatio="none"
            aria-label="Trend detalhada"
            tabIndex={0}
            onKeyDown={(event) => {
              if (!selectedCursorId || (event.key !== 'Delete' && event.key !== 'Backspace')) {
                return;
              }
              event.preventDefault();
              setCursors((current) => current.filter((cursor) => cursor.id !== selectedCursorId));
              setCursorDrag((current) => current?.id === selectedCursorId ? null : current);
              setSelectedCursorId(null);
            }}
          >
            <PopupChart
              seriesStates={seriesStates}
              timeRange={timeRange}
              scaleMode={scaleMode}
              customScales={customScales}
              zoom={zoomHistory.at(-1)}
              visualOptions={visualOptions}
              zoomEnabled={zoomMode}
              onApplyZoom={(zoom) => setZoomHistory((current) => [...current, zoom])}
              cursorEnabled={cursorMode}
              cursors={cursors}
              selectedCursorId={selectedCursorId}
              cursorDrag={cursorDrag}
              onActivateCursor={(time) => {
                addCursor(time);
              }}
              onSelectCursor={setSelectedCursorId}
              onStartCursorDrag={(id, pointerId) => setCursorDrag({ id, pointerId })}
              onMoveCursor={(id, time) => setCursors((current) => current.map((cursor) => cursor.id === id ? { ...cursor, time } : cursor))}
              onEndCursorDrag={() => setCursorDrag(null)}
              onRemoveCursor={(id) => {
                setCursors((current) => current.filter((cursor) => cursor.id !== id));
                setSelectedCursorId((current) => current === id ? null : current);
                setCursorDrag((current) => current?.id === id ? null : current);
              }}
            />
          </svg>
          {loading && <span className={styles.loading} data-testid="trend-popup-loading">Carregando tendência...</span>}
        </div>
      </div>
      {timeSelection && onTimeSelectionChange && (
        <TimeRangeBar selection={timeSelection} onChange={onTimeSelectionChange} />
      )}
    </section>
  );
}

interface PopupChartProps extends Pick<TrendPopupProps, 'seriesStates' | 'timeRange'> {
  visualOptions: TrendVisualOptions;
  scaleMode: PopupScaleMode;
  customScales: PopupCustomScales;
  zoom?: PopupZoom;
  zoomEnabled: boolean;
  onApplyZoom: (zoom: PopupZoom) => void;
  cursorEnabled: boolean;
  cursors: readonly TrendCursor[];
  selectedCursorId: string | null;
  cursorDrag: { id: string; pointerId: number } | null;
  onActivateCursor: (time: number) => void;
  onSelectCursor: (id: string) => void;
  onStartCursorDrag: (id: string, pointerId: number) => void;
  onMoveCursor: (id: string, time: number) => void;
  onEndCursorDrag: () => void;
  onRemoveCursor: (id: string) => void;
}

function PopupChart({
  seriesStates,
  timeRange,
  scaleMode,
  customScales,
  zoom,
  visualOptions,
  zoomEnabled,
  onApplyZoom,
  cursorEnabled,
  cursors,
  selectedCursorId,
  cursorDrag,
  onActivateCursor,
  onSelectCursor,
  onStartCursorDrag,
  onMoveCursor,
  onEndCursorDrag,
  onRemoveCursor,
}: PopupChartProps) {
  const [zoomDrag, setZoomDrag] = useState<{ pointerId: number; start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  useEffect(() => {
    if (!zoomEnabled) {
      setZoomDrag(null);
    }
  }, [zoomEnabled]);
  const series = seriesStates.flatMap(({ series: configured, runtimeState }) => {
    const data = runtimeState.status === 'success' || runtimeState.status === 'error' ? runtimeState.data : undefined;
    return data ? [{ key: popupSeriesKey(configured), name: configured.legendLabel || configured.binding.pointName, color: configured.color, primaryScale: configured.primaryScale === true, scaleMin: configured.scaleMin, scaleMax: configured.scaleMax, lineWidth: configured.lineWidth ?? 2, lineStyle: configured.lineStyle ?? 'solid', marker: configured.marker ?? 'none', data }] : [];
  });
  const allTimes = series.flatMap(({ data }) => [
    ...data.points.map((point) => point.time),
    ...(data.states ?? []).map((point) => point.time),
  ]);
  const domainStart = zoom?.from ?? timeRange?.from ?? Math.min(...allTimes);
  const domainEnd = zoom?.to ?? timeRange?.to ?? Math.max(...allTimes);
  const sharedScale = createNiceScale(series.flatMap(({ data }) => data.points.map(({ value }) => value)));
  const primaryItem = series.find((item) => item.primaryScale && item.data.points.length > 0) ?? series.find((item) => item.data.points.length > 0);
  const primaryAutomaticScale = primaryItem ? createNiceScale(primaryItem.data.points.map(({ value }) => value)) : sharedScale;
  const primaryScale = scaleMode === 'single'
    ? sharedScale
      : scaleMode === 'configurable' && primaryItem
      ? applyCustomScale(primaryAutomaticScale, customScales[primaryItem.key])
      : primaryAutomaticScale;
  const scaledSeries = series.map((item) => {
    const automaticScale = createNiceScale(item.data.points.map((point) => point.value));
    const modeScale = item.data.points.length === 0
      ? automaticScale
      : scaleMode === 'single'
        ? sharedScale
        : scaleMode === 'configurable' && customScales[item.key]
          ? applyCustomScale(automaticScale, customScales[item.key])
          : automaticScale;
    return {
      ...item,
      scale: applyZoomScale(modeScale, zoom),
      stateLabels: [...new Set((item.data.states ?? []).map(({ value }) => value))],
    };
  });
  const axisSeries = [scaledSeries.find(({ data }) => data.points.length > 0), ...scaledSeries.filter(({ data }) => data.points.length === 0)]
    .filter((item): item is typeof scaledSeries[number] => item !== undefined)
    .slice(0, 4);
  const plotX = Math.max(46, 8 + axisSeries.length * 38);
  const plot = { x: plotX, y: 20, width: POPUP_WIDTH - 132 - plotX, height: 724 };
  const legendX = plot.x + plot.width + 14;
  const timeSpan = Math.max(1, domainEnd - domainStart);
  const xFor = (time: number) => plot.x + ((time - domainStart) / timeSpan) * plot.width;
  const yFor = (value: number, scale: ValueScale) => plot.y + ((scale.max - value) / (scale.max - scale.min)) * plot.height;
  const xTicks = createTimeTicks(domainStart, domainEnd);
  const pointerTime = (event: React.MouseEvent<SVGElement> | React.PointerEvent<SVGElement>) => popupTimeFromPointer(event, plot, domainStart, domainEnd);
  const pointerPoint = (event: React.MouseEvent<SVGElement> | React.PointerEvent<SVGElement>) => clampPopupPoint(popupPointFromPointer(event), plot);

  if (series.length === 0 || !Number.isFinite(domainStart) || !Number.isFinite(domainEnd)) {
    return <text x={POPUP_WIDTH / 2} y={POPUP_HEIGHT / 2} textAnchor="middle" fill="var(--text-secondary)" fontSize={16}>Sem dados</text>;
  }

  return (
    <g
      onPointerMove={(event) => {
        if (zoomDrag && zoomDrag.pointerId === event.pointerId) {
          const point = pointerPoint(event);
          setZoomDrag((current) => current ? { ...current, current: point } : null);
          return;
        }
        if (!cursorDrag || cursorDrag.pointerId !== event.pointerId) {
          return;
        }
        onMoveCursor(cursorDrag.id, pointerTime(event));
      }}
      onPointerUp={(event) => {
        if (zoomDrag?.pointerId === event.pointerId) {
          const end = pointerPoint(event);
          const left = Math.min(zoomDrag.start.x, end.x);
          const right = Math.max(zoomDrag.start.x, end.x);
          const top = Math.min(zoomDrag.start.y, end.y);
          const bottom = Math.max(zoomDrag.start.y, end.y);
          const isZoomSelection = right - left >= 8 && bottom - top >= 8;
          if (isZoomSelection) {
            const from = domainStart + ((left - plot.x) / plot.width) * (domainEnd - domainStart);
            const to = domainStart + ((right - plot.x) / plot.width) * (domainEnd - domainStart);
            const topRatio = (top - plot.y) / plot.height;
            const bottomRatio = (bottom - plot.y) / plot.height;
            const currentTop = zoom?.topRatio ?? 0;
            const currentBottom = zoom?.bottomRatio ?? 1;
            const currentSpan = currentBottom - currentTop;
            onApplyZoom({
              from,
              to,
              topRatio: currentTop + topRatio * currentSpan,
              bottomRatio: currentTop + bottomRatio * currentSpan,
            });
          } else if (cursorEnabled) {
            onActivateCursor(pointerTime(event));
          }
          setZoomDrag(null);
          return;
        }
        if (cursorDrag?.pointerId === event.pointerId) {
          onEndCursorDrag();
        }
      }}
      onPointerCancel={() => {
        setZoomDrag(null);
        onEndCursorDrag();
      }}
    >
      {visualOptions.title && <text x={plot.x + plot.width / 2} y={plot.y + 18} textAnchor="middle" fill="var(--text-primary)" fontSize={visualOptions.fontSize} fontFamily={visualOptions.fontFamily}>{visualOptions.title}</text>}
      {Array.from({ length: visualOptions.scaleIntervals + 1 }, (_, index) => index).map((index) => {
        const y = plot.y + (plot.height * index) / visualOptions.scaleIntervals;
        return (
          <g key={index}>
            {index < visualOptions.scaleIntervals && index % 2 === 1 && <rect x={plot.x} y={y} width={plot.width} height={plot.height / visualOptions.scaleIntervals} fill="var(--chart-band)" />}
            <line x1={plot.x} y1={y} x2={plot.x + plot.width} y2={y} stroke="var(--border-subtle)" />
            {axisSeries.map(({ color, scale, name, data, stateLabels }, seriesIndex) => {
              const axisValue = data.points.length > 0
                ? formatValue(scale.max - ((scale.max - scale.min) * index) / visualOptions.scaleIntervals, visualOptions.numberFormat)
                : stateLabels.length > MAX_NAMED_STATE_LABELS
                  ? formatValue((stateLabels.length - 1) * (1 - index / visualOptions.scaleIntervals), visualOptions.numberFormat)
                  : undefined;
              return axisValue !== undefined ? (
                <text key={name} x={8 + seriesIndex * 38} y={y + 5} textAnchor="start" fill={color} fontSize={POPUP_AXIS_FONT_SIZE}>
                  {axisValue}
                </text>
              ) : null;
            })}
          </g>
        );
      })}
      {axisSeries.flatMap(({ color, name, stateLabels }, seriesIndex) => (
        stateLabels.length <= MAX_NAMED_STATE_LABELS ? stateLabels.map((label) => (
          <text
            key={`${name}-${label}`}
            x={8 + seriesIndex * 38}
            y={stateY(label, stateLabels, plot) + 4}
            textAnchor="start"
            fill={color}
            fontSize={POPUP_AXIS_FONT_SIZE}
          >
            {label}
          </text>
        )) : []
      ))}
      <line x1={plot.x} y1={plot.y} x2={plot.x} y2={plot.y + plot.height} stroke="var(--text-secondary)" />
      <line x1={plot.x} y1={plot.y + plot.height} x2={plot.x + plot.width} y2={plot.y + plot.height} stroke="var(--text-secondary)" />
      {xTicks.map((time) => (
        <g key={time}>
          <line x1={xFor(time)} y1={plot.y + plot.height} x2={xFor(time)} y2={plot.y + plot.height - 6} stroke="var(--text-secondary)" />
          <text x={xFor(time)} y={plot.y + plot.height + 20} textAnchor="middle" fill="var(--text-primary)" fontSize={POPUP_AXIS_FONT_SIZE}>{formatAxisTime(time, timeSpan)}</text>
        </g>
      ))}
      {visualOptions.scaleMode === 'configurable' && scaledSeries
        .filter(({ primaryScale, data }) => !primaryScale && data.points.length > 0)
        .map(({ key, color, scaleMin, scaleMax }, index) => (
          <g key={`configured-popup-scale-${key}`} fill={color} fontSize={POPUP_AXIS_FONT_SIZE} pointerEvents="none">
            {Number.isFinite(scaleMax) && <text x={plot.x + 8 + index * 64} y={plot.y + 18}>{formatValue(scaleMax as number, visualOptions.numberFormat)}</text>}
            {Number.isFinite(scaleMin) && <text x={plot.x + 8 + index * 64} y={plot.y + plot.height - 8}>{formatValue(scaleMin as number, visualOptions.numberFormat)}</text>}
          </g>
        ))}
      {scaledSeries.map(({ name, color, lineWidth, lineStyle, marker, data, scale, stateLabels }, index) => {
        const points = data.points.filter((point) => point.time >= domainStart && point.time <= domainEnd);
        const path = points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${xFor(point.time)} ${yFor(point.value, scale)}`).join(' ');
        const currentValue = points.at(-1)?.value;
        const states = (data.states ?? []).filter((state) => state.time >= domainStart && state.time <= domainEnd);
        const statePath = digitalPopupPath(states, domainEnd, xFor, (value) => stateY(value, stateLabels, plot));
        const currentState = states.at(-1)?.value;
        return (
          <React.Fragment key={name}>
            {path && <path d={path} fill="none" stroke={color} strokeWidth={lineWidth} strokeDasharray={lineStyle === 'dashed' ? '8 5' : lineStyle === 'dotted' ? '2 4' : undefined} strokeLinejoin="round" strokeLinecap="round" data-testid={`trend-popup-line-${index}`} />}
            {visualOptions.showRegression && points.length > 1 && <path d={popupRegressionPath(points, xFor, (value) => yFor(value, scale))} fill="none" stroke={color} strokeWidth={1} strokeDasharray="5 4" opacity={0.7} />}
            {statePath && <path d={statePath} fill="none" stroke={color} strokeWidth={lineWidth} strokeDasharray={lineStyle === 'dashed' ? '8 5' : lineStyle === 'dotted' ? '2 4' : undefined} strokeLinejoin="miter" data-testid={`trend-popup-state-line-${index}`} />}
            {marker === 'circle' && points.map((point) => <circle key={point.time} cx={xFor(point.time)} cy={yFor(point.value, scale)} r={3} fill={color} />)}
            {marker === 'square' && points.map((point) => <rect key={point.time} x={xFor(point.time) - 3} y={yFor(point.value, scale) - 3} width={6} height={6} fill={color} />)}
            <text x={legendX} y={36 + index * POPUP_LEGEND_ITEM_HEIGHT} fill={color} fontSize={visualOptions.fontSize} fontFamily={visualOptions.fontFamily}>
              <tspan x={legendX}>{name}</tspan>
              <tspan x={legendX} dy={POPUP_LEGEND_LINE_HEIGHT}>{currentValue !== undefined ? formatValue(currentValue, visualOptions.numberFormat) : currentState ?? '--'}</tspan>
            </text>
          </React.Fragment>
        );
      })}
      <rect
        x={plot.x}
        y={plot.y}
        width={plot.width}
        height={plot.height}
        fill="transparent"
        pointerEvents="all"
        style={{ cursor: cursorEnabled || zoomEnabled ? 'crosshair' : 'default' }}
        data-testid="trend-popup-cursor-plot"
        onPointerDown={zoomEnabled ? (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          const point = pointerPoint(event);
          setZoomDrag({ pointerId: event.pointerId, start: point, current: point });
          event.currentTarget.ownerSVGElement?.focus();
        } : undefined}
      />
      {zoomDrag && (
        <rect
          x={Math.min(zoomDrag.start.x, zoomDrag.current.x)}
          y={Math.min(zoomDrag.start.y, zoomDrag.current.y)}
          width={Math.abs(zoomDrag.current.x - zoomDrag.start.x)}
          height={Math.abs(zoomDrag.current.y - zoomDrag.start.y)}
          fill="rgba(110, 159, 255, 0.12)"
          stroke="var(--text-primary)"
          strokeWidth={1.5}
          pointerEvents="none"
          data-testid="trend-popup-zoom-selection"
        />
      )}
      {cursors.map((cursor) => {
        const x = xFor(cursor.time);
        const selected = cursor.id === selectedCursorId;
        const readings = scaledSeries.map(({ name, color, data, scale, stateLabels }) => {
          if (data.points.length > 0) {
            const value = resolveTrendCursorValue(data.points, cursor.time);
            return value === undefined ? undefined : {
              name,
              color,
              label: formatValue(value),
              y: yFor(value, scale),
            };
          }
          const value = resolvePopupState(data.states ?? [], cursor.time);
          return value === undefined ? undefined : {
            name,
            color,
            label: value,
            y: stateY(value, stateLabels, plot),
          };
        }).filter((reading): reading is { name: string; color: string; label: string; y: number } => reading !== undefined);
        const labelAnchor = x > plot.x + plot.width * 0.72 ? 'end' : 'start';
        const labelX = x + (labelAnchor === 'end' ? -6 : 6);
        const labelWidth = 158;
        const labelHeight = 21 + readings.length * 28;
        const labelBoxX = labelAnchor === 'end' ? labelX - labelWidth : labelX - 4;
        return (
          <g key={cursor.id} data-testid={`trend-popup-cursor-${cursor.id}`}>
            <line x1={x} y1={plot.y} x2={x} y2={plot.y + plot.height} stroke="var(--trend-cursor, #ffffff)" strokeWidth={selected ? 2 : 1} pointerEvents="none" data-testid={`trend-popup-cursor-line-${cursor.id}`} />
            <rect x={labelBoxX} y={plot.y + 2} width={labelWidth} height={labelHeight} fill="var(--canvas-bg)" fillOpacity={0.92} stroke="var(--border-color)" pointerEvents="none" />
            <line
              x1={x}
              y1={plot.y}
              x2={x}
              y2={plot.y + plot.height}
              stroke="transparent"
              strokeWidth={14}
              pointerEvents={cursorEnabled ? 'stroke' : 'none'}
              style={cursorEnabled ? { cursor: 'ew-resize' } : undefined}
              data-testid={`trend-popup-cursor-hit-${cursor.id}`}
              onPointerDown={cursorEnabled ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                event.currentTarget.ownerSVGElement?.focus();
                onSelectCursor(cursor.id);
                onStartCursorDrag(cursor.id, event.pointerId);
              } : undefined}
              onDoubleClick={cursorEnabled ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemoveCursor(cursor.id);
              } : undefined}
            />
            <text x={labelX} y={plot.y + 13} textAnchor={labelAnchor} fill="var(--trend-cursor, #ffffff)" fontSize={10} fontWeight={600} pointerEvents="none" data-testid={`trend-popup-cursor-label-${cursor.id}`}>
              {formatCursorDate(cursor.time)}
            </text>
            {readings.map((reading, index) => (
              <g key={`${reading.name}-${index}`} pointerEvents="none" data-testid={`trend-popup-cursor-reading-${cursor.id}-${index}`}>
                <circle cx={x} cy={reading.y} r={4} fill={reading.color} stroke="var(--canvas-bg)" strokeWidth={2} />
                <text
                  x={labelX}
                  y={plot.y + 27 + index * 28}
                  textAnchor={labelAnchor}
                  fill={reading.color}
                  fontSize={11}
                >
                  <tspan x={labelX}>{reading.name}</tspan>
                  <tspan x={labelX} dy={13}>{reading.label}</tspan>
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}

function popupTimeFromPointer(
  event: React.MouseEvent<SVGElement> | React.PointerEvent<SVGElement>,
  plot: { x: number; width: number },
  domainStart: number,
  domainEnd: number,
): number {
  const point = popupPointFromPointer(event);
  const ratio = Math.max(0, Math.min(1, (point.x - plot.x) / plot.width));
  return domainStart + ratio * (domainEnd - domainStart);
}

function popupPointFromPointer(event: React.MouseEvent<SVGElement> | React.PointerEvent<SVGElement>): { x: number; y: number } {
  const svg = event.currentTarget.ownerSVGElement;
  const bounds = svg?.getBoundingClientRect();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return { x: POPUP_WIDTH / 2, y: POPUP_HEIGHT / 2 };
  }
  const clientX = Number.isFinite(event.clientX) ? event.clientX : bounds.left + bounds.width / 2;
  const clientY = Number.isFinite(event.clientY) ? event.clientY : bounds.top + bounds.height / 2;
  return {
    x: ((clientX - bounds.left) / bounds.width) * POPUP_WIDTH,
    y: ((clientY - bounds.top) / bounds.height) * POPUP_HEIGHT,
  };
}

function clampPopupPoint(point: { x: number; y: number }, plot: { x: number; y: number; width: number; height: number }) {
  return {
    x: Math.max(plot.x, Math.min(plot.x + plot.width, point.x)),
    y: Math.max(plot.y, Math.min(plot.y + plot.height, point.y)),
  };
}

function resolvePopupState(states: ReadonlyArray<{ time: number; value: string }>, time: number): string | undefined {
  let resolved: string | undefined;
  for (const state of states) {
    if (state.time > time) {
      break;
    }
    resolved = state.value;
  }
  return resolved ?? states[0]?.value;
}

function formatCursorDate(time: number): string {
  return new Date(time).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function stateY(value: string, labels: string[], plot: { y: number; height: number }): number {
  if (labels.length <= 1) {
    return plot.y + plot.height / 2;
  }
  const index = Math.max(0, labels.indexOf(value));
  return plot.y + plot.height - (index / (labels.length - 1)) * plot.height;
}

function digitalPopupPath(
  states: Array<{ time: number; value: string }>,
  domainEnd: number,
  xFor: (time: number) => number,
  yFor: (value: string) => number,
): string {
  if (states.length === 0) {
    return '';
  }
  const path = states.map((state, index) => (
    index === 0
      ? `M ${xFor(state.time)} ${yFor(state.value)}`
      : `H ${xFor(state.time)} V ${yFor(state.value)}`
  )).join(' ');
  return `${path} H ${xFor(domainEnd)}`;
}

function formatValue(value: number, format: TrendVisualOptions['numberFormat'] = 'automatic'): string {
  if (format === 'integer') return String(Math.round(value));
  if (format === 'oneDecimal') return value.toFixed(1);
  if (format === 'twoDecimals') return value.toFixed(2);
  return Math.abs(value) < 1 ? value.toFixed(1) : String(Math.round(value));
}

function popupRegressionPath(points: ReadonlyArray<{ time: number; value: number }>, xFor: (time: number) => number, yFor: (value: number) => number): string {
  const meanTime = points.reduce((sum, point) => sum + point.time, 0) / points.length;
  const meanValue = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const variance = points.reduce((sum, point) => sum + (point.time - meanTime) ** 2, 0);
  const slope = variance === 0 ? 0 : points.reduce((sum, point) => sum + (point.time - meanTime) * (point.value - meanValue), 0) / variance;
  const first = points[0]; const last = points[points.length - 1];
  const predict = (time: number) => meanValue + slope * (time - meanTime);
  return `M ${xFor(first.time)} ${yFor(predict(first.time))} L ${xFor(last.time)} ${yFor(predict(last.time))}`;
}

interface ValueScale {
  min: number;
  max: number;
  step: number;
}

function createNiceScale(values: number[]): ValueScale {
  if (values.length === 0) {
    return { min: 0, max: 100, step: 20 };
  }
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min >= 0 && max <= 1) {
    return { min: 0, max: 1, step: 0.1 };
  }
  if (min >= 0 && min <= max * 0.25) {
    min = 0;
  }
  if (max <= 0 && Math.abs(max) <= Math.abs(min) * 0.25) {
    max = 0;
  }
  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    min -= padding;
    max += padding;
  }
  const step = niceStep((max - min) / 5);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const intervalStep = (niceMax - niceMin) / SCALE_INTERVALS;
  return { min: niceMin, max: niceMax, step: intervalStep };
}

function applyCustomScale(automaticScale: ValueScale, customScale: { min: string; max: string } | undefined): ValueScale {
  if (!customScale || customScale.min.trim() === '' || customScale.max.trim() === '') {
    return automaticScale;
  }
  const min = Number(customScale.min);
  const max = Number(customScale.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return automaticScale;
  }
  return { min, max, step: (max - min) / SCALE_INTERVALS };
}

function applyZoomScale(scale: ValueScale, zoom: PopupZoom | undefined): ValueScale {
  if (!zoom) {
    return scale;
  }
  const span = scale.max - scale.min;
  const max = scale.max - zoom.topRatio * span;
  const min = scale.max - zoom.bottomRatio * span;
  return { min, max, step: (max - min) / SCALE_INTERVALS };
}

function popupSeriesKey(series: TrendSeriesViewState['series']): string {
  const { dataSourceUid, serverPath, pointName } = series.binding;
  return encodeURIComponent(`${dataSourceUid}|${serverPath}|${pointName}`);
}

function niceStep(value: number): number {
  const exponent = Math.floor(Math.log10(Math.max(value, Number.EPSILON)));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

function createTimeTicks(from: number, to: number): number[] {
  const span = to - from;
  const day = 24 * 60 * 60 * 1000;
  if (span >= 28 * day) {
    const week = 7 * day;
    const first = Math.ceil(from / week) * week;
    return Array.from({ length: Math.max(0, Math.floor((to - first) / week) + 1) }, (_, index) => first + index * week);
  }
  return Array.from({ length: 9 }, (_, index) => from + (span * index) / 8);
}

function formatAxisTime(time: number, span: number): string {
  if (span >= 7 * 24 * 60 * 60 * 1000) {
    return new Date(time).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
  return new Date(time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function TrendToolIcon({ kind }: { kind: 'single' | 'multiple' | 'configurable' | 'cursor' | 'zoom' | 'clear' }) {
  if (kind === 'single') {
    return <svg viewBox="0 0 32 32"><path d="M9 5h14M16 5v22M9 27h14M12 11h8M12 17h8M12 23h8" /></svg>;
  }
  if (kind === 'multiple') {
    return <svg viewBox="0 0 32 32"><path d="M5 5h9M9.5 5v22M5 27h9M6.5 11h6M6.5 17h6M6.5 23h6M18 5h9M22.5 5v22M18 27h9M19.5 11h6M19.5 17h6M19.5 23h6" /></svg>;
  }
  if (kind === 'configurable') {
    return <svg viewBox="0 0 32 32"><path d="M5 5h12M11 5v22M5 27h12M7 11h8M7 17h8M7 23h8M18 24l8-8 3 3-8 8-4 1z" /></svg>;
  }
  if (kind === 'cursor') {
    return <svg viewBox="0 0 32 32"><path d="M16 4v24" strokeDasharray="4 3" /><path d="M5 16h22" /><rect x="13" y="13" width="6" height="6" rx="1" /></svg>;
  }
  if (kind === 'zoom') {
    return <svg viewBox="0 0 32 32"><rect x="5" y="6" width="18" height="16" rx="2" strokeDasharray="3 2" /><circle cx="20" cy="20" r="6" /><path d="m24.5 24.5 4 4M20 17v6M17 20h6" /></svg>;
  }
  return <svg viewBox="0 0 32 32"><path d="M16 4v24" strokeDasharray="4 3" /><path d="M5 16h22" /><rect x="13" y="13" width="6" height="6" rx="1" /><path d="m22 22 7 7M29 22l-7 7" /></svg>;
}

const styles = {
  popup: css`
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    padding: 0 8px 2px;
    background:
      radial-gradient(circle at 55% 38%, rgba(29, 64, 98, 0.22), transparent 48%),
      var(--canvas-bg);
    color: var(--text-primary);
    width: 100vw;
    height: 100vh;
    box-sizing: border-box;
    overflow: hidden;
  `,
  topHeader: css`
    height: 72px;
    flex: 0 0 72px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    background: transparent;
  `,
  titleBar: css`
    position: relative;
    height: 68px;
    flex: 0 0 68px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: linear-gradient(100deg, var(--surface-primary), var(--surface-secondary));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  `,
  brand: css`
    display: block;
    width: 150px;
    height: 64px;
    background-image: var(--brand-logo);
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
  `,
  topActions: css`
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 600;
  `,
  newDisplayButton: css`
    display: inline-flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 16px;
    border: 1px solid var(--border-color);
    border-radius: 16px;
    color: var(--text-primary);
    background: var(--surface-primary);
    cursor: pointer;
    font-weight: 600;

    span { color: var(--accent); font-size: 24px; font-weight: 300; }
  `,
  headerIconButton: css`
    width: 44px;
    height: 44px;
    border: 1px solid var(--border-color);
    border-radius: 50%;
    color: var(--text-primary);
    background: var(--surface-primary);
    cursor: pointer;
    font-size: 18px;
  `,
  chartPanel: css`
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    flex-direction: column;
    margin-top: 1px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    overflow: hidden;
    background: linear-gradient(110deg, var(--surface-primary), var(--canvas-bg));
  `,
  chartToolbar: css`
    display: flex;
    align-items: center;
    height: 62px;
    flex: 0 0 62px;
    gap: 7px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-color);
  `,
  trendTool: css`
    display: inline-flex;
    flex: 0 1 126px;
    min-width: 96px;
    height: 48px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    color: var(--text-secondary);
    background: var(--button-bg);
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;

    &:hover:not(:disabled) { color: var(--text-primary); border-color: var(--accent-hover); }
    &:disabled { cursor: default; opacity: 0.38; }
    svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; }
  `,
  trendToolActive: css`
    display: inline-flex;
    flex: 0 1 126px;
    min-width: 96px;
    height: 48px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 4px 8px;
    border: 1px solid var(--accent);
    border-radius: 10px;
    color: var(--text-primary);
    background: var(--selection-bg);
    box-shadow: inset 0 0 0 2px var(--focus-ring);
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;

    svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; }
  `,
  scaleConfiguration: css`
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 12px;
    min-height: 54px;
    padding: 6px 12px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border-color);
    background: var(--surface-primary);
  `,
  scaleConfigurationRow: css`
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    padding-right: 12px;
    border-right: 1px solid var(--border-color);
    font-size: 11px;

    strong { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    label { display: inline-flex; align-items: center; gap: 5px; color: var(--text-secondary); }
    input {
      width: 76px;
      height: 30px;
      box-sizing: border-box;
      padding: 0 7px;
      border: 1px solid var(--border-color);
      border-radius: 7px;
      outline: none;
      color: var(--text-primary);
      background: var(--input-bg);
    }
    input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus-ring); }
    button {
      height: 30px;
      padding: 0 9px;
      border: 1px solid var(--border-color);
      border-radius: 7px;
      color: var(--text-secondary);
      background: var(--button-bg);
      cursor: pointer;
    }
  `,
  seriesSwatch: css`
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border-radius: 50%;
  `,
  noConfigurableSeries: css`
    color: var(--text-secondary);
    font-size: 11px;
  `,
  title: css`
    font-size: 18px;
    font-weight: 600;
  `,
  closeButton: css`
    position: absolute;
    right: 14px;
    display: inline-flex;
    align-items: center;
    gap: 16px;
    height: 46px;
    border: 1px solid var(--accent-hover);
    border-radius: 15px;
    padding: 0 16px 0 22px;
    color: var(--text-primary);
    background: var(--button-bg);
    cursor: pointer;
    font-size: 14px;
  `,
  closeIcon: css`
    font-size: 24px;
    line-height: 1;
    font-weight: 200;
  `,
  chartArea: css`
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    background: transparent;
  `,
  chart: css`
    display: block;
    width: 100%;
    height: 100%;
  `,
  loading: css`
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    padding: 5px 10px;
    border-radius: 2px;
    color: var(--accent-contrast);
    background: var(--accent);
    font-size: 12px;
  `,
};
