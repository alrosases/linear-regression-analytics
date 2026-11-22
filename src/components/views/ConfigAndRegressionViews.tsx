import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Play,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  Dataset,
  MissingStrategy,
  RegressionConfig,
  RegressionModelResult,
  SectionId,
} from '../../types/analytics';
import { formatNum, formatPValue } from '../../utils/mathStats';
import { buildModelAutoInterpretation } from '../../utils/regressionEngine';
import { InteractiveScatter } from '../charts/StatisticalCharts';

// ============================================================================
// SECTION 5: CONFIGURACIÓN DEL MODELO (MÓDULOS 5 Y 7)
// ============================================================================

export const ModelConfigView: React.FC<{
  dataset: Dataset;
  config: RegressionConfig;
  onChangeConfig: (next: RegressionConfig) => void;
  onRunModels: (targetSection?: SectionId) => void;
}> = ({ dataset, config, onChangeConfig, onRunModels }) => {
  const numericCols = useMemo(
    () =>
      dataset.columns
        .filter(
          (c) =>
            c.included &&
            !c.isConstant &&
            (c.inferredKind === 'numeric_continuous' || c.inferredKind === 'numeric_discrete')
        )
        .map((c) => c.name),
    [dataset]
  );

  const availableX = numericCols.filter((c) => c !== config.dependentVar);

  const handleYChange = (newY: string) => {
    const nextAvail = numericCols.filter((c) => c !== newY);
    const nextSimple = config.simpleX === newY ? (nextAvail[0] ?? '') : config.simpleX;
    const nextMultiple = config.multipleXs.filter((x) => x !== newY);
    onChangeConfig({
      ...config,
      dependentVar: newY,
      simpleX: nextSimple,
      multipleXs: nextMultiple.length >= 2 ? nextMultiple : nextAvail.slice(0, Math.min(4, nextAvail.length)),
    });
  };

  const toggleMultipleX = (col: string) => {
    const exists = config.multipleXs.includes(col);
    const next = exists
      ? config.multipleXs.filter((x) => x !== col)
      : [...config.multipleXs, col];
    onChangeConfig({ ...config, multipleXs: next });
  };

  // Statistical pre-validation checks
  const validationIssues: string[] = [];
  if (!config.dependentVar) validationIssues.push('Falta seleccionar la variable dependiente (Y).');
  if (!config.simpleX) validationIssues.push('Falta seleccionar el predictor (X) para regresión simple.');
  if (config.multipleXs.length < 2) {
    validationIssues.push('La regresión múltiple requiere al menos 2 variables independientes (X).');
  }
  const trainN = Math.round(dataset.quality.totalRows * config.trainRatio);
  if (trainN <= config.multipleXs.length + 2) {
    validationIssues.push(
      `Observaciones insuficientes en entrenamiento (${trainN}) para ${config.multipleXs.length + 1} parámetros.`
    );
  }

  return (
    <div className="space-y-6">
      {/* Variable Selection Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Y variable */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <h2 className="font-display text-sm font-semibold text-slate-100">
            1. Variable dependiente (Y)
          </h2>
          <p className="text-xs text-slate-400">
            Selecciona una única variable numérica objetivo que los modelos buscarán explicar y predecir.
          </p>
          <select
            value={config.dependentVar}
            onChange={(e) => handleYChange(e.target.value)}
            className="w-full bg-[#0B0F17] border border-[#273247] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-400"
          >
            {numericCols.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Simple X */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <h2 className="font-display text-sm font-semibold text-slate-100">
            2. Regresión lineal simple (1 predictor X)
          </h2>
          <p className="text-xs text-slate-400">
            Modelo bivariado Y = β₀ + β₁X. Selecciona la variable independiente principal.
          </p>
          <select
            value={config.simpleX}
            onChange={(e) => onChangeConfig({ ...config, simpleX: e.target.value })}
            className="w-full bg-[#0B0F17] border border-[#273247] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-400"
          >
            {availableX.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Multiple Xs */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              3. Regresión múltiple (2+ predictores X)
            </h2>
            <span className="text-xs font-mono text-sky-300">
              {config.multipleXs.length} selec.
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Selecciona dos o más variables independientes numéricas para estimación simultánea.
          </p>
          <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
            {availableX.map((c) => {
              const checked = config.multipleXs.includes(c);
              return (
                <label
                  key={c}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                    checked
                      ? 'bg-sky-500/15 border-sky-500/40 text-slate-100'
                      : 'bg-[#0E1420] border-[#1E293B] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMultipleX(c)}
                    className="accent-sky-400"
                  />
                  <span className="truncate">{c}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Data Split, Missing Strategy & Zero Data Leakage */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              División de datos, validación cruzada y control de fuga de información
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cualquier imputación o selección de variables se ajusta exclusivamente con los datos de entrenamiento.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Sin fuga de datos (Zero Data Leakage)</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#0E1420] border border-[#1E293B] rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">Entrenamiento / Prueba</span>
              <span className="font-mono text-sky-300">
                {Math.round(config.trainRatio * 100)}% / {Math.round((1 - config.trainRatio) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={90}
              step={5}
              value={Math.round(config.trainRatio * 100)}
              onChange={(e) =>
                onChangeConfig({ ...config, trainRatio: Number(e.target.value) / 100 })
              }
              className="w-full accent-sky-400 cursor-pointer"
            />
            <div className="text-[11px] text-slate-400 font-mono">
              ≈ {trainN} entren. / {dataset.quality.totalRows - trainN} prueba
            </div>
          </div>

          <div className="bg-[#0E1420] border border-[#1E293B] rounded-lg p-4 space-y-2">
            <label htmlFor="missing-strat" className="block text-xs text-slate-300 font-medium">
              Tratamiento de valores faltantes
            </label>
            <select
              id="missing-strat"
              value={config.missingStrategy}
              onChange={(e) =>
                onChangeConfig({ ...config, missingStrategy: e.target.value as MissingStrategy })
              }
              className="w-full bg-[#0B0F17] border border-[#273247] rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            >
              <option value="median_train">Imputar mediana (solo entren.)</option>
              <option value="mean_train">Imputar media (solo entren.)</option>
              <option value="drop">Eliminar filas con nulos</option>
            </select>
          </div>

          <div className="bg-[#0E1420] border border-[#1E293B] rounded-lg p-4 space-y-2">
            <label htmlFor="cv-folds" className="block text-xs text-slate-300 font-medium">
              Validación cruzada (en entren.)
            </label>
            <select
              id="cv-folds"
              value={config.cvFolds}
              onChange={(e) =>
                onChangeConfig({ ...config, cvFolds: Number(e.target.value) })
              }
              className="w-full bg-[#0B0F17] border border-[#273247] rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
            >
              <option value={5}>5 pliegues (5-Fold CV)</option>
              <option value={10}>10 pliegues (10-Fold CV)</option>
              <option value={3}>3 pliegues (3-Fold CV)</option>
              <option value={0}>Desactivada</option>
            </select>
          </div>

          <div className="bg-[#0E1420] border border-[#1E293B] rounded-lg p-4 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.isOrderedData}
                onChange={(e) =>
                  onChangeConfig({ ...config, isOrderedData: e.target.checked })
                }
                className="accent-sky-400 mt-0.5"
              />
              <div>
                <div className="text-xs text-slate-200 font-medium">
                  Observaciones ordenadas (serie temporal)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Activa división cronológica y habilita Durbin-Watson formal.
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Selected Variables Summary & Execution Bar */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-100">
          Resumen de configuración antes de ejecutar
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg">
            <span className="text-slate-400">Variable dependiente (Y):</span>
            <div className="mt-1 font-mono font-semibold text-sky-300">
              {config.dependentVar || 'No seleccionada'}
            </div>
          </div>
          <div className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg">
            <span className="text-slate-400">Regresión Simple (X):</span>
            <div className="mt-1 font-mono font-semibold text-slate-100">
              {config.simpleX || 'No seleccionada'}
            </div>
          </div>
          <div className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg">
            <span className="text-slate-400">Regresión Múltiple (X₁…Xₚ):</span>
            <div className="mt-1 font-mono text-slate-100">
              {config.multipleXs.length > 0 ? config.multipleXs.join(', ') : 'Ninguna'}
            </div>
          </div>
        </div>

        {validationIssues.length > 0 ? (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-1">
            {validationIssues.map((msg, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{msg}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Requisitos estadísticos verificados. Listo para estimar modelos OLS.</span>
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onRunModels('simple')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Ir a Regresión Simple</span>
              </button>
              <button
                type="button"
                onClick={() => onRunModels('multiple')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Ejecutar y ver Regresión Múltiple</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// SECTIONS 6 & 7: RESULTADOS DE REGRESIÓN (SIMPLE Y MÚLTIPLE)
// ============================================================================

const INDICATOR_GLOSSARY: Record<string, string> = {
  'R²': 'Proporción de la varianza de Y explicada por el modelo en el conjunto indicado. Aumenta al agregar variables aunque no aporten señal real.',
  'R² Ajustado': 'Versión penalizada de R² que solo aumenta si el predictor agregado mejora el ajuste más allá de lo esperado por azar.',
  'Estadístico F': 'Prueba global de significancia conjunta (H₀: todos los coeficientes de X son simultáneamente cero). Si p < 0.05, el modelo tiene poder explicativo conjunto.',
  'Error Estándar': 'Mide la incertidumbre de la estimación de cada coeficiente β. Permite construir el estadístico t = β / EE.',
  'Valor p (t)': 'Probabilidad de observar un estadístico t tan extremo si el coeficiente verdadero fuera 0. Valores < 0.05 indican significancia estadística al 5%.',
  'IC 95%': 'Rango dentro del cual se espera que se encuentre el parámetro poblacional β con un 95% de confianza bajo supuestos OLS.',
};

export const RegressionResultView: React.FC<{
  model: RegressionModelResult | null;
  mode: 'simple' | 'multiple';
  onGoConfig: () => void;
}> = ({ model, mode, onGoConfig }) => {
  const [selectedGlossary, setSelectedGlossary] = useState<string>('R² Ajustado');

  if (!model) {
    return (
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-6 space-y-3">
        <h2 className="font-display text-base font-semibold text-slate-100">
          {mode === 'simple' ? 'Regresión lineal simple' : 'Regresión lineal múltiple'}
        </h2>
        <p className="text-sm text-slate-400">
          Aún no se ha configurado un modelo válido para esta vista.
        </p>
        <button
          type="button"
          onClick={onGoConfig}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg cursor-pointer"
        >
          Ir a Configuración del modelo
        </button>
      </div>
    );
  }

  if (!model.isValid) {
    return (
      <div className="bg-[#111827] border border-rose-500/30 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
          <XCircle className="w-5 h-5" />
          <span>No fue posible estimar el modelo ({model.label})</span>
        </div>
        <p className="text-sm text-slate-300">{model.errorMessage}</p>
        <button
          type="button"
          onClick={onGoConfig}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg cursor-pointer"
        >
          Ajustar variables en Configuración
        </button>
      </div>
    );
  }

  const autoInterp = buildModelAutoInterpretation(model);

  const simpleScatterPoints =
    mode === 'simple'
      ? model.actualTrain.map((yVal, i) => ({
          x: (model.fittedTrain[i] - model.coefficients[0].estimate) /
            (Math.abs(model.coefficients[1].estimate) > 1e-12 ? model.coefficients[1].estimate : 1),
          y: yVal,
          label: `Entren. fila #${model.trainRowIndices[i] + 1}`,
        }))
      : [];

  const actualVsFittedPoints = model.actualTest.map((yVal, i) => ({
    x: yVal,
    y: model.fittedTest[i],
    label: `Prueba fila #${model.testRowIndices[i] + 1}`,
  }));

  return (
    <div className="space-y-6">
      {/* Warnings if any */}
      {model.warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-1.5">
          {model.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Mathematical Equation */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-sky-400">
            Ecuación matemática estimada (Mínimos Cuadrados Ordinarios)
          </span>
          <span className="text-xs text-slate-400 font-mono">
            N entren. = {model.trainMetrics.n} · N prueba = {model.testMetrics.n} · gl = ({model.dfModel}, {model.dfResid})
          </span>
        </div>
        <div className="p-3.5 bg-[#0B0F17] border border-[#1E293B] rounded-lg font-mono text-xs sm:text-sm text-slate-100 overflow-x-auto">
          {model.equation}
        </div>
      </div>

      {/* Global Metrics: Train vs Test vs CV */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">R² (Entrenamiento)</div>
          <div className="mt-1 text-lg font-bold font-mono text-slate-100">
            {(model.trainMetrics.r2 * 100).toFixed(2)}%
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">R² Ajustado</div>
          <div className="mt-1 text-lg font-bold font-mono text-sky-300">
            {(model.trainMetrics.adjR2 * 100).toFixed(2)}%
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">Estadístico F (global)</div>
          <div className="mt-1 text-lg font-bold font-mono text-slate-100">
            {formatNum(model.fStat, 2)}
          </div>
          <div className={`text-[11px] font-mono ${model.fPValue < 0.05 ? 'text-emerald-400' : 'text-amber-400'}`}>
            p = {formatPValue(model.fPValue)}
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">RMSE (Entren. / Prueba)</div>
          <div className="mt-1 text-sm font-bold font-mono text-slate-100">
            {formatNum(model.trainMetrics.rmse, 3)} / {formatNum(model.testMetrics.rmse, 3)}
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">R² (Prueba)</div>
          <div className="mt-1 text-lg font-bold font-mono text-emerald-300">
            {Number.isFinite(model.testMetrics.r2) ? `${(model.testMetrics.r2 * 100).toFixed(2)}%` : '—'}
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">
            CV ({model.cvFoldsUsed > 0 ? `${model.cvFoldsUsed}-Fold` : 'N/A'}) RMSE
          </div>
          <div className="mt-1 text-lg font-bold font-mono text-slate-100">
            {model.cvRmse !== null ? formatNum(model.cvRmse, 3) : '—'}
          </div>
        </div>
      </div>

      {/* Coefficients Table + Interactive Glossary */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">
              Coeficientes de regresión, pruebas t e intervalos de confianza (95%)
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Error est. residual (s) = {formatNum(model.residualStdError, 4)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-slate-400">
                  <th className="py-2.5 px-2.5">Término</th>
                  <th className="py-2.5 px-2.5 text-right">Coef. (β)</th>
                  <th className="py-2.5 px-2.5 text-right">Error Est.</th>
                  <th className="py-2.5 px-2.5 text-right">Est. t</th>
                  <th className="py-2.5 px-2.5 text-right">Valor p</th>
                  <th className="py-2.5 px-2.5 text-right">IC 95% Inf.</th>
                  <th className="py-2.5 px-2.5 text-right">IC 95% Sup.</th>
                  <th className="py-2.5 px-2.5 text-right">Beta Est.</th>
                  <th className="py-2.5 px-2.5">Significancia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#182131]">
                {model.coefficients.map((c) => (
                  <tr key={c.name} className="hover:bg-[#161F30]">
                    <td className="py-2.5 px-2.5 font-medium text-slate-100 whitespace-nowrap">
                      {c.name}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono text-sky-300 font-semibold">
                      {formatNum(c.estimate, 4)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">
                      {formatNum(c.stdError, 4)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono text-slate-200">
                      {formatNum(c.tStat, 3)}
                    </td>
                    <td
                      className={`py-2.5 px-2.5 text-right font-mono ${
                        c.significant05 ? 'text-emerald-400 font-semibold' : 'text-amber-300'
                      }`}
                    >
                      {formatPValue(c.pValue)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">
                      {formatNum(c.ciLower, 4)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono text-slate-300">
                      {formatNum(c.ciUpper, 4)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono text-slate-400">
                      {c.standardizedBeta !== null ? formatNum(c.standardizedBeta, 3) : '—'}
                    </td>
                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      {c.isIntercept ? (
                        <span className="text-slate-500">Constante</span>
                      ) : c.significant05 ? (
                        <span className="text-emerald-400 font-medium">Significativa (p &lt; 0.05)</span>
                      ) : (
                        <span className="text-amber-400 font-medium">No significativa</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Indicator Consultation Panel */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <HelpCircle className="w-4 h-4 text-sky-400" />
            <span>Guía de interpretación de indicadores</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(INDICATOR_GLOSSARY).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedGlossary(key)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                  selectedGlossary === key
                    ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                    : 'bg-[#0E1420] border-[#1E293B] text-slate-400 hover:text-slate-200'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
          <div className="p-3.5 bg-[#0E1420] border border-[#1E293B] rounded-lg space-y-1.5">
            <div className="text-xs font-semibold text-slate-100">{selectedGlossary}</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {INDICATOR_GLOSSARY[selectedGlossary]}
            </p>
          </div>
          <div className="pt-1 text-xs text-slate-400 space-y-1">
            <div>
              AIC (entrenamiento): <span className="font-mono text-slate-200">{formatNum(model.trainMetrics.aic, 2)}</span>
            </div>
            <div>
              BIC (entrenamiento): <span className="font-mono text-slate-200">{formatNum(model.trainMetrics.bic, 2)}</span>
            </div>
            <div>
              Significancia global F:{' '}
              <span className={model.fPValue < 0.05 ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                {model.fPValue < 0.05 ? 'Modelo globalmente significativo' : 'No significativo al 5%'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts + Automatic Interpretation */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {mode === 'simple' ? (
          <InteractiveScatter
            title={`Recta de regresión ajustada — ${model.dependentVar} vs. ${model.predictors[0]}`}
            subtitle={`Datos de entrenamiento (${model.trainMetrics.n} obs.) · Pendiente β₁ = ${formatNum(model.coefficients[1].estimate, 4)}`}
            xLabel={model.predictors[0]}
            yLabel={model.dependentVar}
            points={simpleScatterPoints}
            exportName={`regresion_simple_${model.predictors[0]}`}
            referenceLine={{
              type: 'ols',
              intercept: model.coefficients[0].estimate,
              slope: model.coefficients[1].estimate,
            }}
          />
        ) : (
          <InteractiveScatter
            title={`Evaluación en prueba: Valores reales vs. estimados (${model.label})`}
            subtitle={`Conjunto de prueba (${model.testMetrics.n} obs.) · R² prueba = ${Number.isFinite(model.testMetrics.r2) ? (model.testMetrics.r2 * 100).toFixed(2) + '%' : '—'}`}
            xLabel={`Real (${model.dependentVar})`}
            yLabel={`Estimado (${model.dependentVar})`}
            points={actualVsFittedPoints}
            exportName="regresion_multiple_real_vs_estimado"
            referenceLine={{ type: 'identity' }}
          />
        )}

        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Interpretación automática del modelo
          </h3>
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {autoInterp.map((line, i) => (
              <p key={i} className="text-xs text-slate-300 leading-relaxed">
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
