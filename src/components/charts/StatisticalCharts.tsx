import React, { useMemo, useRef, useState } from 'react';
import { Download, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { DescriptiveStats } from '../../types/analytics';
import { formatNum, normInv } from '../../utils/mathStats';
import { downloadSvgAsPng } from '../../utils/exportUtils';

interface ChartFrameProps {
  title: string;
  subtitle?: string;
  exportName: string;
  controls?: React.ReactNode;
  svgRef: React.RefObject<SVGSVGElement | null>;
  children: React.ReactNode;
}

const ChartFrame: React.FC<ChartFrameProps> = ({
  title,
  subtitle,
  exportName,
  controls,
  svgRef,
  children,
}) => {
  return (
    <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-100 truncate">{title}</h4>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {controls}
          <button
            type="button"
            onClick={() => downloadSvgAsPng(svgRef.current, exportName)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Exportar gráfico como PNG"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PNG</span>
          </button>
        </div>
      </div>
      <div className="relative w-full overflow-hidden">{children}</div>
    </div>
  );
};

// ============================================================================
// 1. INTERACTIVE HISTOGRAM + TREND CURVE
// ============================================================================

export const InteractiveHistogram: React.FC<{
  stat: DescriptiveStats;
  binsCount?: number;
}> = ({ stat, binsCount = 14 }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [bins, setBins] = useState(binsCount);
  const [hoverBin, setHoverBin] = useState<number | null>(null);

  const W = 680;
  const H = 310;
  const pad = { top: 20, right: 20, bottom: 42, left: 50 };
  const pw = W - pad.left - pad.right;
  const ph = H - pad.top - pad.bottom;

  const hist = useMemo(() => {
    const vals = stat.values;
    if (vals.length === 0) return [];
    const min = stat.min;
    const max = stat.max === stat.min ? stat.min + 1 : stat.max;
    const step = (max - min) / bins;
    const result = Array.from({ length: bins }, (_, i) => ({
      idx: i,
      x0: min + i * step,
      x1: min + (i + 1) * step,
      count: 0,
    }));
    for (const v of vals) {
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / step)));
      result[idx].count++;
    }
    return result;
  }, [stat, bins]);

  const maxC = Math.max(1, ...hist.map((b) => b.count));
  const minX = stat.min;
  const maxX = stat.max === stat.min ? stat.min + 1 : stat.max;
  const toX = (v: number) => pad.left + ((v - minX) / (maxX - minX)) * pw;
  const toY = (c: number) => pad.top + ph - (c / maxC) * ph;

  // Smooth density polygon line across bin centers
  const trendPath = useMemo(() => {
    if (hist.length < 2) return '';
    return hist
      .map((b, i) => {
        const cx = toX((b.x0 + b.x1) / 2);
        const cy = toY(b.count);
        return `${i === 0 ? 'M' : 'L'} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
      })
      .join(' ');
  }, [hist]);

  return (
    <ChartFrame
      title={`Histograma y distribución — ${stat.column}`}
      subtitle={`N = ${stat.n} · Media = ${formatNum(stat.mean, 2)} · Mediana = ${formatNum(stat.median, 2)}`}
      exportName={`histograma_${stat.column}`}
      svgRef={svgRef}
      controls={
        <div className="flex items-center gap-1 bg-[#0B0F17] border border-[#1E293B] rounded-lg px-2 py-1 text-xs text-slate-300">
          <span>Intervalos:</span>
          <button
            type="button"
            onClick={() => setBins((b) => Math.max(6, b - 2))}
            className="px-1.5 hover:text-sky-400 cursor-pointer"
          >
            -
          </button>
          <span className="font-mono w-5 text-center">{bins}</span>
          <button
            type="button"
            onClick={() => setBins((b) => Math.min(30, b + 2))}
            className="px-1.5 hover:text-sky-400 cursor-pointer"
          >
            +
          </button>
        </div>
      }
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none">
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = pad.top + ph * (1 - t);
          return (
            <g key={i}>
              <line x1={pad.left} y1={y} x2={pad.left + pw} y2={y} stroke="#1E293B" strokeWidth={1} />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fill="#64748B" fontSize="10" className="font-mono">
                {Math.round(maxC * t)}
              </text>
            </g>
          );
        })}

        {hist.map((b) => {
          const x = toX(b.x0) + 1.5;
          const bw = Math.max(2, toX(b.x1) - toX(b.x0) - 3);
          const y = toY(b.count);
          const bh = pad.top + ph - y;
          const isHover = hoverBin === b.idx;
          return (
            <rect
              key={b.idx}
              x={x}
              y={y}
              width={bw}
              height={bh}
              rx={2}
              fill={isHover ? '#7DD3FC' : '#0EA5E9'}
              fillOpacity={isHover ? 0.95 : 0.75}
              onMouseEnter={() => setHoverBin(b.idx)}
              onMouseLeave={() => setHoverBin(null)}
              className="transition-colors duration-100 cursor-pointer"
            />
          );
        })}

        {trendPath && (
          <path d={trendPath} fill="none" stroke="#34D399" strokeWidth={2} strokeOpacity={0.85} />
        )}

        {/* Mean & Median reference lines */}
        {Number.isFinite(stat.mean) && (
          <line
            x1={toX(stat.mean)}
            y1={pad.top}
            x2={toX(stat.mean)}
            y2={pad.top + ph}
            stroke="#F59E0B"
            strokeWidth={1.75}
            strokeDasharray="5 4"
          />
        )}
        {Number.isFinite(stat.median) && (
          <line
            x1={toX(stat.median)}
            y1={pad.top}
            x2={toX(stat.median)}
            y2={pad.top + ph}
            stroke="#A78BFA"
            strokeWidth={1.75}
            strokeDasharray="2 3"
          />
        )}

        {/* X axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const val = minX + (maxX - minX) * t;
          const x = pad.left + pw * t;
          return (
            <text key={i} x={x} y={H - 14} textAnchor="middle" fill="#94A3B8" fontSize="10" className="font-mono">
              {formatNum(val, 1)}
            </text>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${pad.left + 8}, ${pad.top + 8})`}>
          <line x1={0} y1={5} x2={16} y2={5} stroke="#F59E0B" strokeWidth={2} strokeDasharray="4 3" />
          <text x={20} y={8} fill="#CBD5E1" fontSize="10">Media</text>
          <line x1={64} y1={5} x2={80} y2={5} stroke="#A78BFA" strokeWidth={2} strokeDasharray="2 2" />
          <text x={84} y={8} fill="#CBD5E1" fontSize="10">Mediana</text>
          <line x1={138} y1={5} x2={154} y2={5} stroke="#34D399" strokeWidth={2} />
          <text x={158} y={8} fill="#CBD5E1" fontSize="10">Tendencia</text>
        </g>
      </svg>

      {hoverBin !== null && hist[hoverBin] && (
        <div className="mt-1 flex items-center justify-between text-xs text-slate-300 bg-[#0B0F17] border border-[#1E293B] rounded-lg px-3 py-1.5 font-mono">
          <span>
            Rango: [{formatNum(hist[hoverBin].x0, 2)}, {formatNum(hist[hoverBin].x1, 2)}]
          </span>
          <span>
            Frecuencia: {hist[hoverBin].count} ({((hist[hoverBin].count / Math.max(1, stat.n)) * 100).toFixed(1)}%)
          </span>
        </div>
      )}
    </ChartFrame>
  );
};

// ============================================================================
// 2. INTERACTIVE SCATTER PLOT WITH ZOOM & OPTIONAL OLS LINE
// ============================================================================

export interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
  highlight?: boolean;
}

export const InteractiveScatter: React.FC<{
  title: string;
  subtitle?: string;
  xLabel: string;
  yLabel: string;
  points: ScatterPoint[];
  exportName: string;
  referenceLine?: { type: 'ols'; slope: number; intercept: number } | { type: 'zero' } | { type: 'identity' };
  pointColor?: string;
}> = ({
  title,
  subtitle,
  xLabel,
  yLabel,
  points,
  exportName,
  referenceLine,
  pointColor = '#38BDF8',
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<ScatterPoint | null>(null);

  const W = 680;
  const H = 320;
  const pad = { top: 22, right: 24, bottom: 44, left: 62 };
  const pw = W - pad.left - pad.right;
  const ph = H - pad.top - pad.bottom;

  const bounds = useMemo(() => {
    if (points.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    let minX = Math.min(...points.map((p) => p.x));
    let maxX = Math.max(...points.map((p) => p.x));
    let minY = Math.min(...points.map((p) => p.y));
    let maxY = Math.max(...points.map((p) => p.y));

    if (referenceLine?.type === 'identity') {
      minX = minY = Math.min(minX, minY);
      maxX = maxY = Math.max(maxX, maxY);
    }
    if (referenceLine?.type === 'zero') {
      const m = Math.max(Math.abs(minY), Math.abs(maxY), 1e-6);
      minY = -m * 1.1;
      maxY = m * 1.1;
    }

    const dx = (maxX - minX) || 1;
    const dy = (maxY - minY) || 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const halfX = (dx * 0.56) / zoom;
    const halfY = (dy * 0.56) / zoom;

    return {
      minX: cx - halfX,
      maxX: cx + halfX,
      minY: cy - halfY,
      maxY: cy + halfY,
    };
  }, [points, zoom, referenceLine]);

  const toX = (v: number) => pad.left + ((v - bounds.minX) / (bounds.maxX - bounds.minX)) * pw;
  const toY = (v: number) => pad.top + ph - ((v - bounds.minY) / (bounds.maxY - bounds.minY)) * ph;

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      exportName={exportName}
      svgRef={svgRef}
      controls={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, Number((z + 0.35).toFixed(2))))}
            className="p-1.5 text-slate-300 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer"
            title="Acercar"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.35).toFixed(2))))}
            className="p-1.5 text-slate-300 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer"
            title="Alejar"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          {zoom !== 1 && (
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="p-1.5 text-slate-300 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer"
              title="Restablecer zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      }
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none">
        <defs>
          <clipPath id={`clip-${exportName}`}>
            <rect x={pad.left} y={pad.top} width={pw} height={ph} />
          </clipPath>
        </defs>

        {/* Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = pad.top + ph * (1 - t);
          const x = pad.left + pw * t;
          const yVal = bounds.minY + (bounds.maxY - bounds.minY) * t;
          const xVal = bounds.minX + (bounds.maxX - bounds.minX) * t;
          return (
            <g key={i}>
              <line x1={pad.left} y1={y} x2={pad.left + pw} y2={y} stroke="#1E293B" strokeWidth={1} />
              <line x1={x} y1={pad.top} x2={x} y2={pad.top + ph} stroke="#172030" strokeWidth={1} />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fill="#64748B" fontSize="10" className="font-mono">
                {formatNum(yVal, 1)}
              </text>
              <text x={x} y={pad.top + ph + 16} textAnchor="middle" fill="#64748B" fontSize="10" className="font-mono">
                {formatNum(xVal, 1)}
              </text>
            </g>
          );
        })}

        <rect x={pad.left} y={pad.top} width={pw} height={ph} fill="none" stroke="#28354D" strokeWidth={1} />

        <g clipPath={`url(#clip-${exportName})`}>
          {referenceLine?.type === 'zero' && (
            <line
              x1={pad.left}
              y1={toY(0)}
              x2={pad.left + pw}
              y2={toY(0)}
              stroke="#F59E0B"
              strokeWidth={1.75}
              strokeDasharray="6 4"
            />
          )}

          {referenceLine?.type === 'identity' && (
            <line
              x1={toX(bounds.minX)}
              y1={toY(bounds.minX)}
              x2={toX(bounds.maxX)}
              y2={toY(bounds.maxX)}
              stroke="#10B981"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}

          {referenceLine?.type === 'ols' && (
            <line
              x1={toX(bounds.minX)}
              y1={toY(referenceLine.intercept + referenceLine.slope * bounds.minX)}
              x2={toX(bounds.maxX)}
              y2={toY(referenceLine.intercept + referenceLine.slope * bounds.maxX)}
              stroke="#F59E0B"
              strokeWidth={2.2}
            />
          )}

          {points.map((pt, idx) => (
            <circle
              key={idx}
              cx={toX(pt.x)}
              cy={toY(pt.y)}
              r={hovered === pt ? 6 : pt.highlight ? 4.8 : 3.6}
              fill={pt.highlight ? '#F43F5E' : pointColor}
              fillOpacity={hovered === pt ? 1 : 0.78}
              stroke={hovered === pt ? '#FFFFFF' : 'none'}
              strokeWidth={1.5}
              onMouseEnter={() => setHovered(pt)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            />
          ))}
        </g>

        <text x={pad.left + pw / 2} y={H - 6} textAnchor="middle" fill="#94A3B8" fontSize="11">
          {xLabel}
        </text>
        <text
          x={14}
          y={pad.top + ph / 2}
          textAnchor="middle"
          fill="#94A3B8"
          fontSize="11"
          transform={`rotate(-90 14 ${pad.top + ph / 2})`}
        >
          {yLabel}
        </text>
      </svg>

      {hovered && (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200 bg-[#0B0F17] border border-[#1E293B] rounded-lg px-3 py-1.5 font-mono">
          <span>{hovered.label ? hovered.label : 'Observación'}</span>
          <span>
            {xLabel}: {formatNum(hovered.x, 3)} · {yLabel}: {formatNum(hovered.y, 3)}
          </span>
        </div>
      )}
    </ChartFrame>
  );
};

// ============================================================================
// 3. CORRELATION HEATMAP (PEARSON)
// ============================================================================

export const CorrelationHeatmap: React.FC<{
  columns: string[];
  matrix: number[][];
  pValues: number[][];
}> = ({ columns, matrix, pValues }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ i: number; j: number } | null>(null);

  const k = columns.length;
  const cellSize = Math.max(46, Math.min(72, Math.floor(460 / Math.max(1, k))));
  const labelW = 148;
  const topH = 92;
  const W = labelW + k * cellSize + 24;
  const H = topH + k * cellSize + 24;

  const getColor = (r: number) => {
    if (!Number.isFinite(r)) return '#1E293B';
    const mag = Math.min(1, Math.abs(r));
    if (r >= 0) {
      return `rgba(14, 165, 233, ${0.14 + mag * 0.72})`;
    }
    return `rgba(244, 63, 94, ${0.14 + mag * 0.72})`;
  };

  return (
    <ChartFrame
      title="Mapa de calor — Matriz de correlaciones de Pearson (r)"
      subtitle="Azul indica correlación positiva; carmesí indica correlación negativa"
      exportName="heatmap_correlaciones"
      svgRef={svgRef}
    >
      <div className="overflow-x-auto">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, 560) }} className="w-full h-auto select-none">
          {columns.map((col, j) => {
            const cx = labelW + j * cellSize + cellSize / 2;
            const short = col.length > 15 ? col.slice(0, 14) + '…' : col;
            return (
              <text
                key={`top-${j}`}
                x={cx}
                y={topH - 10}
                fill="#CBD5E1"
                fontSize="10.5"
                textAnchor="start"
                transform={`rotate(-38 ${cx} ${topH - 10})`}
              >
                {short}
              </text>
            );
          })}

          {columns.map((rowCol, i) => {
            const ry = topH + i * cellSize;
            const shortRow = rowCol.length > 19 ? rowCol.slice(0, 18) + '…' : rowCol;
            return (
              <g key={`row-${i}`}>
                <text
                  x={labelW - 10}
                  y={ry + cellSize / 2 + 4}
                  textAnchor="end"
                  fill="#CBD5E1"
                  fontSize="10.5"
                >
                  {shortRow}
                </text>
                {columns.map((_, j) => {
                  const rx = labelW + j * cellSize;
                  const r = matrix[i]?.[j] ?? NaN;
                  const isHover = hoveredCell?.i === i && hoveredCell?.j === j;
                  return (
                    <g
                      key={`cell-${i}-${j}`}
                      onMouseEnter={() => setHoveredCell({ i, j })}
                      onMouseLeave={() => setHoveredCell(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={rx + 1}
                        y={ry + 1}
                        width={cellSize - 2}
                        height={cellSize - 2}
                        rx={4}
                        fill={getColor(r)}
                        stroke={isHover ? '#F8FAFC' : '#0F172A'}
                        strokeWidth={isHover ? 1.5 : 1}
                      />
                      <text
                        x={rx + cellSize / 2}
                        y={ry + cellSize / 2 + 4}
                        textAnchor="middle"
                        fill="#F8FAFC"
                        fontSize="11"
                        fontWeight={600}
                        className="font-mono"
                      >
                        {Number.isFinite(r) ? r.toFixed(2) : '—'}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {hoveredCell && (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200 bg-[#0B0F17] border border-[#1E293B] rounded-lg px-3 py-1.5 font-mono">
          <span>
            {columns[hoveredCell.i]} × {columns[hoveredCell.j]}
          </span>
          <span>
            r = {formatNum(matrix[hoveredCell.i]?.[hoveredCell.j], 4)} · valor p ={' '}
            {pValues[hoveredCell.i]?.[hoveredCell.j] < 0.0001
              ? '< 0.0001'
              : formatNum(pValues[hoveredCell.i]?.[hoveredCell.j], 4)}
          </span>
        </div>
      )}
    </ChartFrame>
  );
};

// ============================================================================
// 4. INTERACTIVE BOXPLOT (IQR & OUTLIERS)
// ============================================================================

export const InteractiveBoxplot: React.FC<{
  statsList: DescriptiveStats[];
}> = ({ statsList }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredVar, setHoveredVar] = useState<DescriptiveStats | null>(null);
  const [normalized, setNormalized] = useState(false);

  const visible = statsList.filter((s) => s.n > 0).slice(0, 8);
  const W = 680;
  const H = 310;
  const pad = { top: 20, right: 24, bottom: 56, left: 56 };
  const pw = W - pad.left - pad.right;
  const ph = H - pad.top - pad.bottom;

  const transformVal = (s: DescriptiveStats, v: number) => {
    if (!normalized) return v;
    return s.stdDev > 1e-12 ? (v - s.mean) / s.stdDev : 0;
  };

  const allTransformed = visible.flatMap((s) => [
    transformVal(s, s.min),
    transformVal(s, s.max),
  ]);
  const minY = allTransformed.length ? Math.min(...allTransformed) : 0;
  const maxY = allTransformed.length ? Math.max(...allTransformed) : 1;
  const spanY = maxY - minY || 1;
  const yLo = minY - spanY * 0.08;
  const yHi = maxY + spanY * 0.08;

  const toY = (v: number) => pad.top + ph - ((v - yLo) / (yHi - yLo)) * ph;

  return (
    <ChartFrame
      title="Diagramas de caja (Boxplots) y detección de valores atípicos"
      subtitle={normalized ? 'Escala estandarizada (Z-score) para comparar dispersión relativa' : 'Valores en escala original (Q1, Mediana, Q3, bigotes 1.5·IQR y atípicos)'}
      exportName="boxplots_variables"
      svgRef={svgRef}
      controls={
        <button
          type="button"
          onClick={() => setNormalized((n) => !n)}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
            normalized
              ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
              : 'bg-[#182235] text-slate-300 border-[#28354D] hover:bg-[#1F2C44]'
          }`}
        >
          {normalized ? 'Escala Z-score' : 'Normalizar (Z)'}
        </button>
      }
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none">
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = pad.top + ph * (1 - t);
          const val = yLo + (yHi - yLo) * t;
          return (
            <g key={i}>
              <line x1={pad.left} y1={y} x2={pad.left + pw} y2={y} stroke="#1E293B" strokeWidth={1} />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fill="#64748B" fontSize="10" className="font-mono">
                {formatNum(val, 1)}
              </text>
            </g>
          );
        })}

        {visible.map((s, idx) => {
          const bandW = pw / Math.max(1, visible.length);
          const cx = pad.left + idx * bandW + bandW / 2;
          const boxW = Math.min(36, bandW * 0.45);

          const lowFence = s.q1 - 1.5 * s.iqr;
          const highFence = s.q3 + 1.5 * s.iqr;
          const inliers = s.values.filter((v) => v >= lowFence && v <= highFence);
          const outliers = s.values.filter((v) => v < lowFence || v > highFence);
          const whiskerLow = inliers.length ? Math.min(...inliers) : s.min;
          const whiskerHigh = inliers.length ? Math.max(...inliers) : s.max;

          const yQ1 = toY(transformVal(s, s.q1));
          const yQ3 = toY(transformVal(s, s.q3));
          const yMed = toY(transformVal(s, s.median));
          const yWLow = toY(transformVal(s, whiskerLow));
          const yWHigh = toY(transformVal(s, whiskerHigh));

          const short = s.column.length > 12 ? s.column.slice(0, 11) + '…' : s.column;

          return (
            <g
              key={s.column}
              onMouseEnter={() => setHoveredVar(s)}
              onMouseLeave={() => setHoveredVar(null)}
              className="cursor-pointer"
            >
              {/* Whiskers */}
              <line x1={cx} y1={yWHigh} x2={cx} y2={yQ3} stroke="#94A3B8" strokeWidth={1.4} />
              <line x1={cx} y1={yQ1} x2={cx} y2={yWLow} stroke="#94A3B8" strokeWidth={1.4} />
              <line x1={cx - boxW / 3} y1={yWHigh} x2={cx + boxW / 3} y2={yWHigh} stroke="#94A3B8" strokeWidth={1.4} />
              <line x1={cx - boxW / 3} y1={yWLow} x2={cx + boxW / 3} y2={yWLow} stroke="#94A3B8" strokeWidth={1.4} />

              {/* Box */}
              <rect
                x={cx - boxW / 2}
                y={Math.min(yQ3, yQ1)}
                width={boxW}
                height={Math.max(2, Math.abs(yQ1 - yQ3))}
                rx={3}
                fill="#0EA5E9"
                fillOpacity={hoveredVar === s ? 0.5 : 0.3}
                stroke="#38BDF8"
                strokeWidth={1.5}
              />
              {/* Median */}
              <line x1={cx - boxW / 2} y1={yMed} x2={cx + boxW / 2} y2={yMed} stroke="#F59E0B" strokeWidth={2.2} />

              {/* Outliers */}
              {outliers.slice(0, 40).map((ov, oi) => (
                <circle
                  key={oi}
                  cx={cx}
                  cy={toY(transformVal(s, ov))}
                  r={2.8}
                  fill="#F43F5E"
                  fillOpacity={0.85}
                />
              ))}

              <text
                x={cx}
                y={pad.top + ph + 16}
                textAnchor="middle"
                fill="#CBD5E1"
                fontSize="10"
              >
                {short}
              </text>
              <text
                x={cx}
                y={pad.top + ph + 30}
                textAnchor="middle"
                fill={s.outliersCount > 0 ? '#FB7185' : '#64748B'}
                fontSize="9.5"
                className="font-mono"
              >
                {s.outliersCount} atíp.
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredVar && (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200 bg-[#0B0F17] border border-[#1E293B] rounded-lg px-3 py-1.5 font-mono">
          <span>{hoveredVar.column}</span>
          <span>
            Mín: {formatNum(hoveredVar.min, 2)} · Q1: {formatNum(hoveredVar.q1, 2)} · Med: {formatNum(hoveredVar.median, 2)} · Q3: {formatNum(hoveredVar.q3, 2)} · Máx: {formatNum(hoveredVar.max, 2)}
          </span>
        </div>
      )}
    </ChartFrame>
  );
};

// ============================================================================
// 5. Q-Q PLOT & STANDARDIZED RESIDUALS DIAGNOSTIC CHARTS
// ============================================================================

export const QQPlotChart: React.FC<{
  stdResiduals: number[];
  modelLabel: string;
}> = ({ stdResiduals, modelLabel }) => {
  const points: ScatterPoint[] = useMemo(() => {
    const sorted = [...stdResiduals].sort((a, b) => a - b);
    const n = sorted.length;
    return sorted.map((val, i) => ({
      x: normInv((i + 0.5) / n),
      y: val,
      label: `Cuantil #${i + 1}`,
      highlight: Math.abs(val) > 3,
    }));
  }, [stdResiduals]);

  return (
    <InteractiveScatter
      title="Gráfico Q-Q Normal de residuos estandarizados"
      subtitle={`Evaluación visual de normalidad — ${modelLabel}`}
      xLabel="Cuantiles teóricos N(0, 1)"
      yLabel="Residuos estandarizados"
      points={points}
      exportName="qq_plot_residuos"
      referenceLine={{ type: 'identity' }}
      pointColor="#38BDF8"
    />
  );
};

export const StandardizedResidualsChart: React.FC<{
  stdResiduals: number[];
  cooksD: number[];
  cooksThreshold: number;
  modelLabel: string;
}> = ({ stdResiduals, cooksD, cooksThreshold, modelLabel }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const W = 680;
  const H = 310;
  const pad = { top: 24, right: 24, bottom: 42, left: 54 };
  const pw = W - pad.left - pad.right;
  const ph = H - pad.top - pad.bottom;

  const maxAbs = Math.max(3.5, ...stdResiduals.map((r) => Math.abs(r)));
  const toX = (i: number) => pad.left + (i / Math.max(1, stdResiduals.length - 1)) * pw;
  const toY = (v: number) => pad.top + ph - ((v + maxAbs) / (2 * maxAbs)) * ph;

  return (
    <ChartFrame
      title="Residuos estandarizados por observación (Detección de atípicos e influencia)"
      subtitle={`${modelLabel} · Bandas de alerta ±2 y ±3 desviaciones · Rojo = Cook's D > ${cooksThreshold.toFixed(3)}`}
      exportName="residuos_estandarizados"
      svgRef={svgRef}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none">
        {[-3, -2, 0, 2, 3].map((lvl) => {
          const y = toY(lvl);
          return (
            <g key={lvl}>
              <line
                x1={pad.left}
                y1={y}
                x2={pad.left + pw}
                y2={y}
                stroke={lvl === 0 ? '#64748B' : Math.abs(lvl) === 3 ? '#F43F5E' : '#F59E0B'}
                strokeWidth={lvl === 0 ? 1.2 : 1}
                strokeDasharray={lvl === 0 ? undefined : '4 4'}
              />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fill="#94A3B8" fontSize="10" className="font-mono">
                {lvl}
              </text>
            </g>
          );
        })}

        {stdResiduals.map((r, i) => {
          const influential = (cooksD[i] ?? 0) > cooksThreshold || Math.abs(r) > 3;
          const x = toX(i);
          const y = toY(r);
          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <line x1={x} y1={toY(0)} x2={x} y2={y} stroke={influential ? '#F43F5E' : '#334155'} strokeWidth={1} />
              <circle
                cx={x}
                cy={y}
                r={hoveredIdx === i ? 5.5 : influential ? 4 : 2.7}
                fill={influential ? '#F43F5E' : '#38BDF8'}
              />
            </g>
          );
        })}

        <text x={pad.left + pw / 2} y={H - 10} textAnchor="middle" fill="#94A3B8" fontSize="11">
          Índice de observación en entrenamiento (1 – {stdResiduals.length})
        </text>
      </svg>

      {hoveredIdx !== null && (
        <div className="mt-1 flex items-center justify-between text-xs text-slate-200 bg-[#0B0F17] border border-[#1E293B] rounded-lg px-3 py-1.5 font-mono">
          <span>Observación entren. #{hoveredIdx + 1}</span>
          <span>
            Residuo estand.: {formatNum(stdResiduals[hoveredIdx], 3)} · Cook's D: {formatNum(cooksD[hoveredIdx], 4)}
          </span>
        </div>
      )}
    </ChartFrame>
  );
};
