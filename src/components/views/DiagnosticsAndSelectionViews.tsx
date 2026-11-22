import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Play,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import {
  AutoSelectionResult,
  DescriptiveStats,
  DiagnosticsResult,
  RegressionModelResult,
} from '../../types/analytics';
import { formatNum, formatPValue } from '../../utils/mathStats';
import {
  InteractiveHistogram,
  InteractiveScatter,
  QQPlotChart,
  StandardizedResidualsChart,
} from '../charts/StatisticalCharts';

// ============================================================================
// SECTION 8: DIAGNÓSTICO ESTADÍSTICO (MÓDULO 8)
// ============================================================================

export const DiagnosticsView: React.FC<{
  models: RegressionModelResult[];
  diagnosticsMap: Record<string, DiagnosticsResult>;
}> = ({ models, diagnosticsMap }) => {
  const validModels = models.filter((m) => m.isValid);
  const [selectedId, setSelectedId] = useState<string>(
    validModels.find((m) => m.kind === 'multiple')?.id ?? validModels[0]?.id ?? ''
  );

  const activeModel = validModels.find((m) => m.id === selectedId) ?? validModels[0] ?? null;
  const diag = activeModel ? diagnosticsMap[activeModel.id] : undefined;

  const residStat = useMemo<DescriptiveStats | null>(() => {
    if (!activeModel) return null;
    const vals = activeModel.residualsTrain;
    const n = vals.length;
    if (n === 0) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
    return {
      column: `Residuos (${activeModel.label})`,
      kind: 'numeric_continuous',
      n,
      missingCount: 0,
      missingPct: 0,
      mean,
      median: sorted[Math.floor(n / 2)],
      mode: null,
      modeApplicable: false,
      modeNote: '',
      stdDev: Math.sqrt(variance),
      variance,
      min: sorted[0],
      max: sorted[n - 1],
      q1: sorted[Math.floor(n * 0.25)],
      q3: sorted[Math.floor(n * 0.75)],
      iqr: sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)],
      range: sorted[n - 1] - sorted[0],
      skewness: diag?.normalityJB.skewness ?? 0,
      kurtosis: diag?.normalityJB.excessKurtosis ?? 0,
      outliersCount: 0,
      values: vals,
    };
  }, [activeModel, diag]);

  if (!activeModel || !diag) {
    return (
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-6 text-sm text-slate-400">
        Ejecuta primero un modelo de regresión simple o múltiple para generar las pruebas de diagnóstico.
      </div>
    );
  }

  const residVsFittedPts = activeModel.fittedTrain.map((fit, i) => ({
    x: fit,
    y: activeModel.residualsTrain[i],
    label: `Entren. fila #${activeModel.trainRowIndices[i] + 1}`,
    highlight:
      activeModel.cooksDTrain[i] > diag.cooksThreshold ||
      Math.abs(activeModel.stdResidualsTrain[i]) > 3,
  }));

  return (
    <div className="space-y-6">
      {/* Model Selector Header */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-100">
            Auditoría de supuestos de regresión lineal
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Pruebas formales y gráficos diagnósticos sobre los residuos del conjunto de entrenamiento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="diag-model" className="text-xs text-slate-400">
            Modelo auditado:
          </label>
          <select
            id="diag-model"
            value={activeModel.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-[#0B0F17] border border-[#273247] rounded-lg px-3 py-1.5 text-xs text-slate-100"
          >
            {validModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Assumption Alerts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {diag.alerts.map((a) => (
          <div key={a.assumption} className="bg-[#111827] border border-[#1E293B] rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-semibold text-slate-100">{a.assumption}</div>
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium shrink-0 ${
                  a.status === 'Cumple'
                    ? 'text-emerald-400'
                    : a.status === 'Precaución'
                      ? 'text-amber-400'
                      : a.status === 'Incumple'
                        ? 'text-rose-400'
                        : 'text-slate-400'
                }`}
              >
                {a.status === 'Cumple' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : a.status === 'Precaución' ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : a.status === 'Incumple' ? (
                  <XCircle className="w-3.5 h-3.5" />
                ) : (
                  <Info className="w-3.5 h-3.5" />
                )}
                <span>{a.status}</span>
              </span>
            </div>
            <div className="text-xs font-mono text-sky-300">{a.summary}</div>
            <p className="text-xs text-slate-400 leading-relaxed">{a.detail}</p>
          </div>
        ))}
      </div>

      {/* Diagnostic Plots (4 required charts) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <InteractiveScatter
          title="1. Residuos frente a valores ajustados"
          subtitle="Evalúa linealidad y homocedasticidad (dispersión uniforme alrededor de 0)"
          xLabel="Valores ajustados (Ŷ)"
          yLabel="Residuos (e)"
          points={residVsFittedPts}
          exportName="diagnostico_residuos_vs_ajustados"
          referenceLine={{ type: 'zero' }}
        />

        {residStat && <InteractiveHistogram stat={residStat} binsCount={14} />}

        <QQPlotChart stdResiduals={activeModel.stdResidualsTrain} modelLabel={activeModel.label} />

        <StandardizedResidualsChart
          stdResiduals={activeModel.stdResidualsTrain}
          cooksD={activeModel.cooksDTrain}
          cooksThreshold={diag.cooksThreshold}
          modelLabel={activeModel.label}
        />
      </div>

      {/* Detailed Tests: Durbin-Watson + VIF + Influential Observations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* VIF Table */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">
              Multicolinealidad — Factor de Inflación de la Varianza (VIF)
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Máx: {diag.maxVif !== null ? diag.maxVif.toFixed(2) : '1.00'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-slate-400">
                  <th className="py-2 px-3">Variable predictora</th>
                  <th className="py-2 px-3 text-right">R² auxiliar</th>
                  <th className="py-2 px-3 text-right">VIF</th>
                  <th className="py-2 px-3">Diagnóstico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#182131]">
                {diag.vif.map((v) => (
                  <tr key={v.variable} className="hover:bg-[#161F30]">
                    <td className="py-2 px-3 font-medium text-slate-200">{v.variable}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-400">
                      {formatNum(v.r2Aux, 4)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-100 font-semibold">
                      {Number.isFinite(v.vif) ? formatNum(v.vif, 3) : '∞'}
                    </td>
                    <td
                      className={`py-2 px-3 font-medium ${
                        v.status.startsWith('Óptimo')
                          ? 'text-emerald-400'
                          : v.status.startsWith('Moderado')
                            ? 'text-amber-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {v.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Durbin-Watson & Formal Statistical Tests Summary */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-100">
            Resumen de pruebas formales (JB, Breusch-Pagan, Durbin-Watson)
          </h3>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg space-y-1">
              <div className="flex justify-between font-semibold text-slate-200">
                <span>Normalidad (Jarque-Bera)</span>
                <span className="font-mono">
                  JB = {formatNum(diag.normalityJB.statistic, 3)} · p = {formatPValue(diag.normalityJB.pValue)}
                </span>
              </div>
              <p className="text-slate-400">
                Asimetría = {formatNum(diag.normalityJB.skewness, 3)} · Curtosis exceso = {formatNum(diag.normalityJB.excessKurtosis, 3)}
              </p>
            </div>

            <div className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg space-y-1">
              <div className="flex justify-between font-semibold text-slate-200">
                <span>Homocedasticidad (Breusch-Pagan)</span>
                <span className="font-mono">
                  LM = {formatNum(diag.homoscedasticityBP.statistic, 3)} · p = {formatPValue(diag.homoscedasticityBP.pValue)}
                </span>
              </div>
              <p className="text-slate-400">Grados de libertad χ² = {diag.homoscedasticityBP.df}</p>
            </div>

            <div className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg space-y-1">
              <div className="flex justify-between font-semibold text-slate-200">
                <span>Autocorrelación (Durbin-Watson)</span>
                <span className="font-mono">
                  DW = {diag.durbinWatson.statistic.toFixed(3)} ({diag.durbinWatson.applicable ? 'Aplicable' : 'Corte transversal'})
                </span>
              </div>
              <p className="text-slate-400">{diag.durbinWatson.caveat}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Influential Observations Table */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-100">
            Observaciones influyentes y atípicas detectadas
          </h3>
          <span className="text-xs font-mono text-slate-400">
            Umbral Cook's D &gt; {diag.cooksThreshold.toFixed(4)} · Apalancamiento h &gt; {diag.leverageThreshold.toFixed(4)}
          </span>
        </div>

        {diag.influentialPoints.length === 0 ? (
          <p className="text-xs text-emerald-400">
            No se detectaron observaciones que excedan los umbrales de influencia de Cook, apalancamiento o residuo estandarizado extremo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-slate-400">
                  <th className="py-2 px-3">Fila Orig.</th>
                  <th className="py-2 px-3 text-right">Real (Y)</th>
                  <th className="py-2 px-3 text-right">Ajustado (Ŷ)</th>
                  <th className="py-2 px-3 text-right">Residuo Est.</th>
                  <th className="py-2 px-3 text-right">Apalanc. (h)</th>
                  <th className="py-2 px-3 text-right">Cook's D</th>
                  <th className="py-2 px-3">Motivo de alerta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#182131]">
                {diag.influentialPoints.map((pt) => (
                  <tr key={pt.originalRowIndex} className="hover:bg-[#161F30]">
                    <td className="py-2 px-3 font-mono text-slate-200">#{pt.originalRowIndex + 1}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-300">{formatNum(pt.actual, 3)}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-300">{formatNum(pt.fitted, 3)}</td>
                    <td className="py-2 px-3 text-right font-mono text-amber-300">{formatNum(pt.stdResidual, 3)}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-300">{formatNum(pt.leverage, 4)}</td>
                    <td className="py-2 px-3 text-right font-mono text-rose-400 font-semibold">{formatNum(pt.cooksD, 4)}</td>
                    <td className="py-2 px-3 text-slate-300">{pt.reasons.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// SECTION 9: SELECCIÓN AUTOMÁTICA DE VARIABLES (MÓDULO 10)
// ============================================================================

export const VariableSelectionView: React.FC<{
  selectionResult: AutoSelectionResult | null;
  candidatePool: string[];
  onRunSelection: () => void;
  onApplyPredictorsToMultiple: (predictors: string[]) => void;
}> = ({ selectionResult, candidatePool, onRunSelection, onApplyPredictorsToMultiple }) => {
  const [activeTab, setActiveTab] = useState<'forward' | 'backward' | 'bidirectional' | 'best'>('bidirectional');

  if (!selectionResult) {
    return (
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="w-5 h-5 text-sky-400" />
          <h2 className="font-display text-base font-semibold text-slate-100">
            Selección automática de variables (Stepwise & Best Subsets)
          </h2>
        </div>
        <p className="text-sm text-slate-300 max-w-2xl">
          Evalúa automáticamente subconjuntos de predictores ({candidatePool.length} variables candidatas)
          utilizando exclusivamente los datos de entrenamiento para prevenir fuga de información y controlar el riesgo de sobreajuste.
        </p>
        <button
          type="button"
          onClick={onRunSelection}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Ejecutar Stepwise y Best Subsets</span>
        </button>
      </div>
    );
  }

  const currentStepwise =
    activeTab === 'forward'
      ? selectionResult.forward
      : activeTab === 'backward'
        ? selectionResult.backward
        : selectionResult.bidirectional;

  return (
    <div className="space-y-6">
      {/* Header + Method Tabs */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Selección automática de variables sin fuga de datos
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Toda la búsqueda (p-valores, AIC, BIC y CV-RMSE) se ejecuta únicamente sobre la partición de entrenamiento.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunSelection}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Recalcular selección</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 p-1 bg-[#0B0F17] border border-[#1E293B] rounded-lg w-fit">
          {[
            { id: 'forward' as const, label: 'Stepwise Forward' },
            { id: 'backward' as const, label: 'Stepwise Backward' },
            { id: 'bidirectional' as const, label: 'Bidireccional (AIC)' },
            { id: 'best' as const, label: 'Best Subsets' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stepwise Views */}
      {activeTab !== 'best' ? (
        <div className="space-y-5">
          {currentStepwise.model && currentStepwise.model.isValid && (
            <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Resultado: {currentStepwise.model.label}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Variables retenidas ({currentStepwise.model.predictors.length}):{' '}
                    <span className="font-mono text-sky-300">
                      {currentStepwise.model.predictors.join(', ')}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onApplyPredictorsToMultiple(currentStepwise.model!.predictors)
                  }
                  className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Adoptar en Regresión Múltiple
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg">
                  <div className="text-slate-400">R² Ajustado</div>
                  <div className="mt-1 font-mono font-bold text-slate-100">
                    {(currentStepwise.model.trainMetrics.adjR2 * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg">
                  <div className="text-slate-400">AIC</div>
                  <div className="mt-1 font-mono font-bold text-slate-100">
                    {formatNum(currentStepwise.model.trainMetrics.aic, 2)}
                  </div>
                </div>
                <div className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg">
                  <div className="text-slate-400">BIC</div>
                  <div className="mt-1 font-mono font-bold text-slate-100">
                    {formatNum(currentStepwise.model.trainMetrics.bic, 2)}
                  </div>
                </div>
                <div className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg">
                  <div className="text-slate-400">RMSE Prueba</div>
                  <div className="mt-1 font-mono font-bold text-emerald-300">
                    {formatNum(currentStepwise.model.testMetrics.rmse, 3)}
                  </div>
                </div>
                <div className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg">
                  <div className="text-slate-400">CV-RMSE (entren.)</div>
                  <div className="mt-1 font-mono font-bold text-sky-300">
                    {currentStepwise.model.cvRmse !== null
                      ? formatNum(currentStepwise.model.cvRmse, 3)
                      : '—'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step-by-step history */}
          <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-100">
              Traza de iteraciones del algoritmo Stepwise
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B] text-slate-400">
                    <th className="py-2 px-3">Paso</th>
                    <th className="py-2 px-3">Acción</th>
                    <th className="py-2 px-3">Variable</th>
                    <th className="py-2 px-3 text-right">Valor p</th>
                    <th className="py-2 px-3 text-right">R² Ajust.</th>
                    <th className="py-2 px-3 text-right">AIC</th>
                    <th className="py-2 px-3 text-right">BIC</th>
                    <th className="py-2 px-3">Conjunto resultante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182131]">
                  {currentStepwise.steps.map((st) => (
                    <tr key={st.step} className="hover:bg-[#161F30]">
                      <td className="py-2 px-3 font-mono text-slate-400">{st.step}</td>
                      <td className="py-2 px-3 font-medium text-slate-200">{st.action}</td>
                      <td className="py-2 px-3 font-mono text-sky-300">{st.variable ?? '—'}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-300">
                        {st.pValueAction !== null ? formatPValue(st.pValueAction) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-200">
                        {(st.adjR2 * 100).toFixed(2)}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-200">
                        {formatNum(st.aic, 2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-200">
                        {formatNum(st.bic, 2)}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-400">
                        {st.predictorsAfter.length > 0 ? st.predictorsAfter.join(', ') : '(Solo intercepto)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Best Subsets View */
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Best Subsets Regression — Mejores combinaciones evaluadas ({selectionResult.bestSubsets.evaluatedCount} subconjuntos)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Ordenados por menor BIC (criterio bayesiano que penaliza sobreajuste con mayor rigor que R²).
              </p>
            </div>
            {selectionResult.bestSubsets.truncatedPredictors && (
              <span className="text-xs text-amber-300">
                Preselección de las 10 candidatas con mayor señal en entrenamiento para acotar complejidad 2ᵖ.
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-slate-400">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Predictores incluidos</th>
                  <th className="py-2.5 px-3 text-right">k</th>
                  <th className="py-2.5 px-3 text-right">R² Entr.</th>
                  <th className="py-2.5 px-3 text-right">R² Ajust.</th>
                  <th className="py-2.5 px-3 text-right">AIC</th>
                  <th className="py-2.5 px-3 text-right">BIC</th>
                  <th className="py-2.5 px-3 text-right">CV-RMSE (Entr.)</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#182131]">
                {selectionResult.bestSubsets.candidates.map((cand, idx) => (
                  <tr key={cand.predictors.join('|')} className="hover:bg-[#161F30]">
                    <td className="py-2.5 px-3 font-mono text-slate-400">#{idx + 1}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-100">
                      {cand.predictors.join(', ')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">{cand.k}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                      {(cand.r2 * 100).toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-sky-300 font-semibold">
                      {(cand.adjR2 * 100).toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                      {formatNum(cand.aic, 2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-300 font-semibold">
                      {formatNum(cand.bic, 2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                      {cand.cvRmse !== null ? formatNum(cand.cvRmse, 3) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => onApplyPredictorsToMultiple(cand.predictors)}
                        className="px-2.5 py-1 text-xs font-medium text-sky-300 hover:text-sky-200 bg-sky-500/10 border border-sky-500/30 rounded-md cursor-pointer whitespace-nowrap"
                      >
                        Aplicar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
