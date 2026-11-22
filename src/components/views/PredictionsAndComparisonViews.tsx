import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Download, Info } from 'lucide-react';
import {
  Dataset,
  DescriptiveStats,
  RegressionConfig,
  RegressionModelResult,
} from '../../types/analytics';
import { formatNum } from '../../utils/mathStats';
import { computeIndividualPrediction } from '../../utils/regressionEngine';
import { exportPredictions, exportResultsWorkbook } from '../../utils/exportUtils';
import { InteractiveScatter } from '../charts/StatisticalCharts';

// ============================================================================
// SECTION 10: PREDICCIONES Y EVALUACIÓN VISUAL (MÓDULO 11)
// ============================================================================

export const PredictionsView: React.FC<{
  dataset: Dataset;
  config: RegressionConfig;
  stats: DescriptiveStats[];
  models: RegressionModelResult[];
}> = ({ dataset, config, stats, models }) => {
  const validModels = models.filter((m) => m.isValid);
  const [selectedId, setSelectedId] = useState<string>(
    validModels.find((m) => m.kind === 'multiple')?.id ?? validModels[0]?.id ?? ''
  );

  const activeModel = validModels.find((m) => m.id === selectedId) ?? validModels[0] ?? null;

  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});

  // Pre-fill manual inputs with variable means when activeModel changes
  useEffect(() => {
    if (!activeModel) return;
    setManualInputs((prev) => {
      const next: Record<string, string> = {};
      for (const p of activeModel.predictors) {
        if (prev[p] !== undefined && prev[p] !== '') {
          next[p] = prev[p];
        } else {
          const st = stats.find((s) => s.column === p);
          next[p] = st && Number.isFinite(st.mean) ? st.mean.toFixed(2) : '0';
        }
      }
      return next;
    });
  }, [activeModel?.id, stats]);

  const manualPrediction = useMemo(() => {
    if (!activeModel) return null;
    const numericInputs: Record<string, number> = {};
    for (const p of activeModel.predictors) {
      const v = Number(manualInputs[p]);
      if (!Number.isFinite(v)) return null;
      numericInputs[p] = v;
    }
    return computeIndividualPrediction(dataset, config, activeModel, numericInputs, 0.95);
  }, [activeModel, manualInputs, dataset, config]);

  if (!activeModel) {
    return (
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-6 text-sm text-slate-400">
        Ejecuta primero un modelo de regresión para generar predicciones sobre el conjunto de prueba y simulaciones individuales.
      </div>
    );
  }

  const actualVsPredPts = activeModel.actualTest.map((act, i) => ({
    x: act,
    y: activeModel.fittedTest[i],
    label: `Fila #${activeModel.testRowIndices[i] + 1}`,
  }));

  const errorPts = activeModel.fittedTest.map((pred, i) => ({
    x: i + 1,
    y: activeModel.residualsTest[i],
    label: `Prueba #${i + 1} (Fila #${activeModel.testRowIndices[i] + 1})`,
  }));

  return (
    <div className="space-y-6">
      {/* Model Selector + Export */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-100">
            Predicciones y evaluación sobre el conjunto de prueba
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {activeModel.testMetrics.n} observaciones de prueba · RMSE = {formatNum(activeModel.testMetrics.rmse, 4)} · MAE = {formatNum(activeModel.testMetrics.mae, 4)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
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
          <button
            type="button"
            onClick={() => exportPredictions(activeModel, 'xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={() => exportPredictions(activeModel, 'csv')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Individual Manual Prediction Simulator (IC vs IP) */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            Simulador de predicción individual (Valores nuevos de X)
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {activeModel.predictors.map((pred) => {
            const st = stats.find((s) => s.column === pred);
            return (
              <div key={pred} className="space-y-1">
                <label className="block text-xs text-slate-300 truncate" title={pred}>
                  {pred}
                </label>
                <input
                  type="number"
                  step="any"
                  value={manualInputs[pred] ?? ''}
                  onChange={(e) =>
                    setManualInputs((prev) => ({ ...prev, [pred]: e.target.value }))
                  }
                  className="w-full bg-[#0B0F17] border border-[#273247] rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-400"
                />
                {st && (
                  <div className="text-[11px] text-slate-500 font-mono">
                    Rango datos: [{formatNum(st.min, 1)}, {formatNum(st.max, 1)}]
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {manualPrediction ? (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 bg-[#0E1420] border border-[#1E293B] rounded-lg">
                <div className="text-xs text-slate-400">
                  Valor estimado puntual ({activeModel.dependentVar})
                </div>
                <div className="mt-1 text-2xl font-bold font-mono text-sky-300">
                  {formatNum(manualPrediction.predicted, 4)}
                </div>
              </div>

              <div className="p-4 bg-[#0E1420] border border-[#1E293B] rounded-lg">
                <div className="text-xs text-slate-400">
                  Intervalo de Confianza 95% (Media esperada E[Y|X])
                </div>
                <div className="mt-1 text-base font-semibold font-mono text-emerald-300">
                  [{formatNum(manualPrediction.ciLower, 3)} , {formatNum(manualPrediction.ciUpper, 3)}]
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Incertidumbre sobre el promedio poblacional en X₀.
                </div>
              </div>

              <div className="p-4 bg-[#0E1420] border border-[#1E293B] rounded-lg">
                <div className="text-xs text-slate-400">
                  Intervalo de Predicción 95% (Nueva observación Y₀)
                </div>
                <div className="mt-1 text-base font-semibold font-mono text-amber-300">
                  [{formatNum(manualPrediction.piLower, 3)} , {formatNum(manualPrediction.piUpper, 3)}]
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Más amplio porque suma la varianza residual individual (σ²).
                </div>
              </div>
            </div>

            {manualPrediction.extrapolationWarning && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2 text-xs text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{manualPrediction.extrapolationWarning}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-amber-300">
            Ingresa valores numéricos válidos en todos los predictores para calcular la estimación.
          </div>
        )}
      </div>

      {/* Visual Evaluation Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <InteractiveScatter
          title="Valores reales frente a valores estimados (Conjunto de prueba)"
          subtitle="La línea discontinua verde representa el ajuste perfecto (Real = Estimado)"
          xLabel={`Valor Real (${activeModel.dependentVar})`}
          yLabel={`Valor Estimado (${activeModel.dependentVar})`}
          points={actualVsPredPts}
          exportName="predicciones_real_vs_estimado"
          referenceLine={{ type: 'identity' }}
        />

        <InteractiveScatter
          title="Errores de predicción en el conjunto de prueba (Y - Ŷ)"
          subtitle="Dispersión de residuos fuera de muestra alrededor de cero"
          xLabel="Observación de prueba (#)"
          yLabel="Error de predicción"
          points={errorPts}
          exportName="predicciones_errores_prueba"
          referenceLine={{ type: 'zero' }}
          pointColor="#A78BFA"
        />
      </div>

      {/* Test Predictions Table */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-100">
            Tabla de valores reales, predichos y errores (Conjunto de prueba)
          </h3>
          {!activeModel.testMetrics.mapeValid && (
            <span className="text-xs text-amber-300 inline-flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              <span>{activeModel.testMetrics.mapeReason}</span>
            </span>
          )}
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 bg-[#111827]">
              <tr className="border-b border-[#1E293B] text-slate-400">
                <th className="py-2 px-3">Fila Original</th>
                <th className="py-2 px-3 text-right">Real (Y)</th>
                <th className="py-2 px-3 text-right">Predicho (Ŷ)</th>
                <th className="py-2 px-3 text-right">Residuo (Y - Ŷ)</th>
                <th className="py-2 px-3 text-right">Error Absoluto</th>
                <th className="py-2 px-3 text-right">Error Porcentual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182131]">
              {activeModel.actualTest.map((act, i) => {
                const pred = activeModel.fittedTest[i];
                const resid = activeModel.residualsTest[i];
                const absErr = Math.abs(resid);
                const pctValid = Math.abs(act) > 1e-9;
                const pct = pctValid ? (absErr / Math.abs(act)) * 100 : null;
                return (
                  <tr key={i} className="hover:bg-[#161F30]">
                    <td className="py-2 px-3 font-mono text-slate-400">
                      #{activeModel.testRowIndices[i] + 1}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-100">
                      {formatNum(act, 4)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sky-300">
                      {formatNum(pred, 4)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono ${
                        resid >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {formatNum(resid, 4)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-200">
                      {formatNum(absErr, 4)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-300">
                      {pct !== null ? `${pct.toFixed(2)}%` : 'N/A (Y=0)'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SECTION 11: COMPARACIÓN DE MODELOS (MÓDULO 9)
// ============================================================================

export const ModelComparisonView: React.FC<{
  dataset: Dataset;
  stats: DescriptiveStats[];
  models: RegressionModelResult[];
  recommendedModelId: string | null;
  interpretation: ReturnType<typeof import('../../utils/regressionEngine').generateGlobalAutomatedInterpretation>;
}> = ({ dataset, stats, models, recommendedModelId, interpretation }) => {
  const validModels = models.filter((m) => m.isValid);

  const metricDocs = [
    {
      name: 'R² y R² Ajustado',
      desc: 'R² mide la proporción de varianza explicada (0 a 1). R² Ajustado penaliza el agregado de variables innecesarias y permite comparar modelos con distinto número de predictores.',
    },
    {
      name: 'AIC y BIC (Entrenamiento)',
      desc: 'Criterios de información basados en verosimilitud. Menor valor indica mejor equilibrio entre ajuste y parsimonia. BIC penaliza la complejidad con mayor fuerza que AIC en muestras grandes.',
    },
    {
      name: 'RMSE, MAE y MSE (Entren. vs Prueba)',
      desc: 'Miden el error promedio de predicción. RMSE penaliza más los errores grandes (misma unidad que Y); MAE mide el error absoluto promedio. La evaluación real de generalización debe hacerse en Prueba.',
    },
    {
      name: 'Error Porcentual (MAPE)',
      desc: 'Error porcentual absoluto medio respecto a Y. Solo es matemáticamente válido cuando ninguna observación de Y es cero.',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-100">
            Tabla comparativa de desempeño estadístico y predictivo
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Diferenciación explícita entre métricas de ajuste (Entrenamiento) y generalización fuera de muestra (Prueba).
          </p>
        </div>
        {validModels.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportResultsWorkbook(dataset, stats, validModels, interpretation, 'xlsx')
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Excel</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportResultsWorkbook(dataset, stats, validModels, interpretation, 'csv')
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        )}
      </div>

      {validModels.length === 0 ? (
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-6 text-sm text-slate-400">
          No hay modelos válidos ejecutados todavía.
        </div>
      ) : (
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-slate-400">
                  <th className="py-2.5 px-2.5">Modelo</th>
                  <th className="py-2.5 px-2.5 text-right">k (X)</th>
                  <th className="py-2.5 px-2.5 text-right">R² Entr.</th>
                  <th className="py-2.5 px-2.5 text-right">R² Ajust.</th>
                  <th className="py-2.5 px-2.5 text-right">AIC</th>
                  <th className="py-2.5 px-2.5 text-right">BIC</th>
                  <th className="py-2.5 px-2.5 text-right">RMSE Entr.</th>
                  <th className="py-2.5 px-2.5 text-right">RMSE Prueba</th>
                  <th className="py-2.5 px-2.5 text-right">MAE Prueba</th>
                  <th className="py-2.5 px-2.5 text-right">MSE Prueba</th>
                  <th className="py-2.5 px-2.5 text-right">MAPE Prueba</th>
                  <th className="py-2.5 px-2.5 text-right">R² Prueba</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#182131]">
                {validModels.map((m) => {
                  const isRec = m.id === recommendedModelId;
                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-[#161F30] ${isRec ? 'bg-sky-500/10' : ''}`}
                    >
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-100">{m.label}</div>
                        <div className="text-[11px] text-slate-400">
                          {isRec ? 'Modelo recomendado' : m.predictors.slice(0, 3).join(', ') + (m.predictors.length > 3 ? '…' : '')}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">
                        {m.predictors.length}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-slate-200">
                        {(m.trainMetrics.r2 * 100).toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-sky-300 font-semibold">
                        {(m.trainMetrics.adjR2 * 100).toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">
                        {formatNum(m.trainMetrics.aic, 1)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">
                        {formatNum(m.trainMetrics.bic, 1)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">
                        {formatNum(m.trainMetrics.rmse, 3)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-emerald-300 font-semibold">
                        {formatNum(m.testMetrics.rmse, 3)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-slate-200">
                        {formatNum(m.testMetrics.mae, 3)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">
                        {formatNum(m.testMetrics.mse, 3)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">
                        {m.testMetrics.mape !== null ? `${m.testMetrics.mape.toFixed(2)}%` : 'N/A'}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-slate-100">
                        {Number.isFinite(m.testMetrics.r2) ? `${(m.testMetrics.r2 * 100).toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Metric Explanations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metricDocs.map((doc) => (
          <div key={doc.name} className="bg-[#111827] border border-[#1E293B] rounded-xl p-4 space-y-1.5">
            <h3 className="text-xs font-semibold text-sky-300">{doc.name}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{doc.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
