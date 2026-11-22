import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, Info, Search, XCircle } from 'lucide-react';
import { Dataset, DescriptiveStats, RegressionConfig } from '../../types/analytics';
import { computeCorrelationMatrix, formatNum, formatPValue } from '../../utils/mathStats';
import { exportDescriptiveStats } from '../../utils/exportUtils';
import {
  CorrelationHeatmap,
  InteractiveBoxplot,
  InteractiveHistogram,
  InteractiveScatter,
} from '../charts/StatisticalCharts';

// ============================================================================
// SECTION 3: EXPLORACIÓN DE DATOS (CALIDAD + VISUALIZACIONES EXPLORATORIAS)
// ============================================================================

export const ExplorationView: React.FC<{
  dataset: Dataset;
  stats: DescriptiveStats[];
  config: RegressionConfig;
}> = ({ dataset, stats, config }) => {
  const numericCols = useMemo(
    () =>
      dataset.columns
        .filter(
          (c) =>
            c.included &&
            (c.inferredKind === 'numeric_continuous' || c.inferredKind === 'numeric_discrete')
        )
        .map((c) => c.name),
    [dataset]
  );

  const [histVar, setHistVar] = useState<string>(config.dependentVar || numericCols[0] || '');
  const [scatterX, setScatterX] = useState<string>(config.simpleX || numericCols[0] || '');
  const [scatterY, setScatterY] = useState<string>(config.dependentVar || numericCols[1] || numericCols[0] || '');
  const [searchQuery, setSearchQuery] = useState('');

  const activeHistStat =
    stats.find((s) => s.column === histVar) ?? stats.find((s) => s.column === numericCols[0]) ?? stats[0];

  const corrData = useMemo(() => {
    const cols = numericCols.slice(0, 10);
    return computeCorrelationMatrix(dataset, cols);
  }, [dataset, numericCols]);

  const scatterPoints = useMemo(() => {
    const pts: { x: number; y: number; label: string }[] = [];
    for (let i = 0; i < dataset.numericRows.length; i++) {
      const xv = dataset.numericRows[i][scatterX];
      const yv = dataset.numericRows[i][scatterY];
      if (xv !== null && xv !== undefined && yv !== null && yv !== undefined && Number.isFinite(xv) && Number.isFinite(yv)) {
        pts.push({ x: xv, y: yv, label: `Fila #${i + 1}` });
      }
    }
    return pts;
  }, [dataset, scatterX, scatterY]);

  // Quick OLS slope/intercept for exploratory scatter trendline
  const scatterTrend = useMemo(() => {
    if (scatterPoints.length < 3) return undefined;
    const n = scatterPoints.length;
    const mx = scatterPoints.reduce((a, p) => a + p.x, 0) / n;
    const my = scatterPoints.reduce((a, p) => a + p.y, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of scatterPoints) {
      num += (p.x - mx) * (p.y - my);
      den += (p.x - mx) * (p.x - mx);
    }
    if (den < 1e-12) return undefined;
    const slope = num / den;
    const intercept = my - slope * mx;
    return { type: 'ols' as const, slope, intercept };
  }, [scatterPoints]);

  const filteredPreviewRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const mapped = dataset.rows.map((r, idx) => ({ row: r, idx }));
    if (!q) return mapped.slice(0, 25);
    return mapped
      .filter(({ row }) =>
        dataset.columns.some((c) => String(row[c.name] ?? '').toLowerCase().includes(q))
      )
      .slice(0, 25);
  }, [dataset, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Data Quality Section */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Auditoría de calidad de datos
          </h2>
          <span className="text-xs text-slate-400">
            {dataset.quality.totalRows} filas · {dataset.quality.totalCols} columnas · {dataset.quality.totalNulls} nulos ({dataset.quality.totalNullPct.toFixed(2)}%)
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {dataset.quality.alerts.map((a) => (
            <div key={a.id} className="p-3.5 bg-[#0E1420] border border-[#1E293B] rounded-lg space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {a.severity === 'error' ? (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : a.severity === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Info className="w-4 h-4 text-sky-400 shrink-0" />
                )}
                <span className="text-slate-100">{a.title}</span>
              </div>
              <p className="text-xs text-slate-400">{a.detail}</p>
              <p className="text-xs text-slate-300">Recomendación: {a.recommendation}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Exploratory Controls & Charts */}
      {numericCols.length === 0 ? (
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-6 text-sm text-amber-300">
          No hay variables numéricas activas seleccionadas. Activa al menos una variable numérica en "Cargar datos".
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Histogram + variable selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 bg-[#111827] border border-[#1E293B] rounded-xl px-4 py-2.5">
                <label htmlFor="hist-var" className="text-xs font-medium text-slate-300 whitespace-nowrap">
                  Variable para histograma:
                </label>
                <select
                  id="hist-var"
                  value={activeHistStat?.column ?? ''}
                  onChange={(e) => setHistVar(e.target.value)}
                  className="bg-[#0B0F17] border border-[#273247] rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-400"
                >
                  {numericCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {activeHistStat && <InteractiveHistogram stat={activeHistStat} />}
            </div>

            {/* Scatter + X/Y selectors */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111827] border border-[#1E293B] rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <label htmlFor="scat-x" className="text-xs text-slate-300">Eje X:</label>
                  <select
                    id="scat-x"
                    value={scatterX}
                    onChange={(e) => setScatterX(e.target.value)}
                    className="bg-[#0B0F17] border border-[#273247] rounded-lg px-2 py-1 text-xs text-slate-100"
                  >
                    {numericCols.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="scat-y" className="text-xs text-slate-300">Eje Y:</label>
                  <select
                    id="scat-y"
                    value={scatterY}
                    onChange={(e) => setScatterY(e.target.value)}
                    className="bg-[#0B0F17] border border-[#273247] rounded-lg px-2 py-1 text-xs text-slate-100"
                  >
                    {numericCols.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <InteractiveScatter
                title={`Dispersión y tendencia lineal — ${scatterY} vs. ${scatterX}`}
                subtitle={`${scatterPoints.length} pares válidos · Línea ámbar = tendencia OLS exploratoria`}
                xLabel={scatterX}
                yLabel={scatterY}
                points={scatterPoints}
                exportName={`dispersion_${scatterX}_vs_${scatterY}`}
                referenceLine={scatterTrend}
              />
            </div>
          </div>

          {/* Boxplots & Heatmap */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <InteractiveBoxplot statsList={stats.filter((s) => numericCols.includes(s.column))} />

            {corrData.columns.length >= 2 && (
              <CorrelationHeatmap
                columns={corrData.columns}
                matrix={corrData.matrix}
                pValues={corrData.pValues}
              />
            )}
          </div>

          {/* Numeric Pearson Correlation Matrix Table */}
          {corrData.columns.length >= 2 && (
            <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-100">
                Tabla de correlaciones de Pearson (r) y significancia bilateral
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-slate-400">
                      <th className="py-2 px-3">Variable</th>
                      {corrData.columns.map((c) => (
                        <th key={c} className="py-2 px-3 text-right whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#182131]">
                    {corrData.columns.map((rowCol, i) => (
                      <tr key={rowCol} className="hover:bg-[#161F30]">
                        <td className="py-2 px-3 font-medium text-slate-200 whitespace-nowrap">{rowCol}</td>
                        {corrData.columns.map((_, j) => {
                          const r = corrData.matrix[i][j];
                          const p = corrData.pValues[i][j];
                          const strong = i !== j && Math.abs(r) >= 0.7;
                          return (
                            <td
                              key={j}
                              className={`py-2 px-3 text-right font-mono whitespace-nowrap ${
                                i === j
                                  ? 'text-slate-500'
                                  : strong
                                    ? 'text-sky-300 font-semibold'
                                    : 'text-slate-300'
                              }`}
                              title={i === j ? 'Diagonal' : `p = ${formatPValue(p)}`}
                            >
                              {Number.isFinite(r) ? r.toFixed(3) : '—'}
                              {i !== j && p < 0.05 ? '*' : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">* Indica correlación estadísticamente significativa (p &lt; 0.05). Valores |r| ≥ 0.70 entre predictores pueden anticipar multicolinealidad.</p>
            </div>
          )}
        </>
      )}

      {/* Searchable Data Explorer Table */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Explorador de registros (mostrando hasta 25 filas filtradas)
          </h3>
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en cualquier columna..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#0B0F17] border border-[#273247] rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
            />
          </div>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 bg-[#111827]">
              <tr className="border-b border-[#1E293B] text-slate-400">
                <th className="py-2 px-3">#</th>
                {dataset.columns.map((c) => (
                  <th key={c.name} className="py-2 px-3 whitespace-nowrap">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182131]">
              {filteredPreviewRows.map(({ row, idx }) => (
                <tr key={idx} className="hover:bg-[#161F30]">
                  <td className="py-2 px-3 font-mono text-slate-500">{idx + 1}</td>
                  {dataset.columns.map((c) => {
                    const val = row[c.name];
                    const isNull = val === null || val === undefined || val === '';
                    return (
                      <td
                        key={c.name}
                        className={`py-2 px-3 font-mono whitespace-nowrap ${
                          isNull ? 'text-rose-400 italic' : 'text-slate-200'
                        }`}
                      >
                        {isNull ? 'NULL' : String(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SECTION 4: ANÁLISIS DESCRIPTIVO (MÓDULO 3)
// ============================================================================

export const DescriptiveView: React.FC<{
  dataset: Dataset;
  stats: DescriptiveStats[];
}> = ({ dataset, stats }) => {
  const [selectedCols, setSelectedCols] = useState<string[]>(() => stats.map((s) => s.column));

  const activeStats = useMemo(() => {
    const filtered = stats.filter((s) => selectedCols.includes(s.column));
    return filtered.length > 0 ? filtered : stats;
  }, [stats, selectedCols]);

  const toggleCol = (col: string) => {
    setSelectedCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const [focusCol, setFocusCol] = useState<string>(stats[0]?.column ?? '');
  const focusedStat = activeStats.find((s) => s.column === focusCol) ?? activeStats[0];

  return (
    <div className="space-y-6">
      {/* Variable selector bar */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Selección de variables numéricas para análisis descriptivo
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Selecciona las variables que deseas incluir en la tabla y en los gráficos comparativos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportDescriptiveStats(activeStats, 'xlsx', dataset.fileName.replace(/\.[^.]+$/, ''))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Excel</span>
            </button>
            <button
              type="button"
              onClick={() => exportDescriptiveStats(activeStats, 'csv', dataset.fileName.replace(/\.[^.]+$/, ''))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {stats.map((s) => {
            const active = selectedCols.includes(s.column);
            return (
              <button
                key={s.column}
                type="button"
                onClick={() => toggleCol(s.column)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                    : 'bg-[#0E1420] text-slate-400 border-[#1E293B] hover:text-slate-200'
                }`}
              >
                {s.column}
              </button>
            );
          })}
        </div>
      </div>

      {/* Complete Descriptive Statistics Table */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-100">
          Tabla de estadísticos descriptivos
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-slate-400">
                <th className="py-2.5 px-2.5">Variable</th>
                <th className="py-2.5 px-2.5 text-right">N</th>
                <th className="py-2.5 px-2.5 text-right">Faltantes</th>
                <th className="py-2.5 px-2.5 text-right">Media</th>
                <th className="py-2.5 px-2.5 text-right">Mediana</th>
                <th className="py-2.5 px-2.5 text-right">Moda</th>
                <th className="py-2.5 px-2.5 text-right">Desv. Est.</th>
                <th className="py-2.5 px-2.5 text-right">Varianza</th>
                <th className="py-2.5 px-2.5 text-right">Mín</th>
                <th className="py-2.5 px-2.5 text-right">Q1 (25%)</th>
                <th className="py-2.5 px-2.5 text-right">Q3 (75%)</th>
                <th className="py-2.5 px-2.5 text-right">Máx</th>
                <th className="py-2.5 px-2.5 text-right">Rango</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182131]">
              {activeStats.map((s) => (
                <tr
                  key={s.column}
                  onClick={() => setFocusCol(s.column)}
                  className={`hover:bg-[#161F30] cursor-pointer ${
                    focusedStat?.column === s.column ? 'bg-[#161F30]' : ''
                  }`}
                >
                  <td className="py-2.5 px-2.5 font-medium text-slate-100 whitespace-nowrap">{s.column}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-200">{s.n}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-300 whitespace-nowrap">
                    {s.missingCount} ({s.missingPct.toFixed(1)}%)
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-sky-300">{formatNum(s.mean, 3)}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-200">{formatNum(s.median, 3)}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-300 whitespace-nowrap" title={s.modeNote}>
                    {s.mode !== null ? formatNum(s.mode, 2) : 'N/A'}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-200">{formatNum(s.stdDev, 3)}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">{formatNum(s.variance, 2)}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">{formatNum(s.min, 2)}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">{formatNum(s.q1, 2)}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">{formatNum(s.q3, 2)}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">{formatNum(s.max, 2)}</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">{formatNum(s.range, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Haz clic sobre cualquier fila de la tabla para inspeccionar su histograma detallado. La moda se reporta como N/A en variables continuas sin repeticiones significativas.
        </p>
      </div>

      {/* Interactive charts */}
      {activeStats.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {focusedStat && <InteractiveHistogram stat={focusedStat} />}
          <InteractiveBoxplot statsList={activeStats} />
        </div>
      )}
    </div>
  );
};
