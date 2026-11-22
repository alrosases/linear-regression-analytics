import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Info,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import {
  Dataset,
  DiagnosticsResult,
  ECONOMIC_SECTORS,
  EconomicSector,
  RegressionConfig,
  RegressionModelResult,
  SectionId,
} from '../../types/analytics';
import { formatNum } from '../../utils/mathStats';
import { SAMPLE_DATASETS } from '../../utils/sampleDatasets';

// ============================================================================
// SECTION 1: DASHBOARD / INICIO
// ============================================================================

export const DashboardView: React.FC<{
  dataset: Dataset | null;
  config: RegressionConfig;
  simpleModel: RegressionModelResult | null;
  multipleModel: RegressionModelResult | null;
  diagnosticsMap: Record<string, DiagnosticsResult>;
  onNavigate: (s: SectionId) => void;
  onLoadSample: (id: string) => void;
}> = ({
  dataset,
  config,
  simpleModel,
  multipleModel,
  diagnosticsMap,
  onNavigate,
  onLoadSample,
}) => {
  const activeModel =
    multipleModel?.isValid ? multipleModel : simpleModel?.isValid ? simpleModel : null;
  const activeDiag = activeModel ? diagnosticsMap[activeModel.id] : undefined;

  const passedAssumptions = activeDiag
    ? activeDiag.alerts.filter((a) => a.status === 'Cumple').length
    : 0;
  const evaluatedAssumptions = activeDiag
    ? activeDiag.alerts.filter((a) => a.status !== 'No aplica').length
    : 0;

  if (!dataset) {
    return (
      <div className="space-y-6">
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-medium text-sky-400">
              Análisis Estadístico · Econometría · Regresión Lineal
            </p>
            <h1 className="font-display text-2xl lg:text-3xl font-bold text-slate-100 leading-tight [text-wrap:balance]">
              Plataforma integral para modelado predictivo y diagnóstico econométrico
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Carga tu base de datos en Excel, CSV o TXT para ejecutar exploración estadística,
              regresión lineal simple y múltiple, validación fuera de muestra sin fuga de datos,
              diagnóstico de supuestos e informes ejecutivos en PDF.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('upload')}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Cargar archivo de datos</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 shrink-0 lg:w-80">
            <div className="bg-[#0E1420] border border-[#1E293B] rounded-lg p-3.5">
              <div className="text-xs text-slate-400">Modelos soportados</div>
              <div className="mt-1 text-base font-semibold text-slate-100">OLS Simple y Múltiple</div>
            </div>
            <div className="bg-[#0E1420] border border-[#1E293B] rounded-lg p-3.5">
              <div className="text-xs text-slate-400">Validación</div>
              <div className="mt-1 text-base font-semibold text-slate-100">Train / Test + K-Fold</div>
            </div>
            <div className="bg-[#0E1420] border border-[#1E293B] rounded-lg p-3.5">
              <div className="text-xs text-slate-400">Diagnósticos</div>
              <div className="mt-1 text-base font-semibold text-slate-100">JB, BP, VIF, Cook, DW</div>
            </div>
            <div className="bg-[#0E1420] border border-[#1E293B] rounded-lg p-3.5">
              <div className="text-xs text-slate-400">Exportación</div>
              <div className="mt-1 text-base font-semibold text-slate-100">PDF, Excel, CSV, PNG</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-100">
            O inicia inmediatamente con un conjunto de datos real de demostración
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SAMPLE_DATASETS.map((s) => (
              <div
                key={s.id}
                className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="text-xs text-sky-400 font-medium">{s.sectorHint}</div>
                  <h3 className="text-sm font-semibold text-slate-100">{s.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{s.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onLoadSample(s.id)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Cargar y analizar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">Total de registros</div>
          <div className="mt-1.5 text-xl font-bold font-mono text-slate-100">
            {dataset.quality.totalRows.toLocaleString('es-ES')}
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">Total de variables</div>
          <div className="mt-1.5 text-xl font-bold font-mono text-slate-100">
            {dataset.quality.totalCols}
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">Variables activas</div>
          <div className="mt-1.5 text-xl font-bold font-mono text-slate-100">
            {dataset.columns.filter((c) => c.included).length}
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">Modelo ejecutado</div>
          <div className="mt-1.5 text-sm font-semibold text-sky-300 truncate" title={activeModel?.label}>
            {activeModel ? activeModel.label : 'Sin ejecutar'}
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">R² (Entrenamiento)</div>
          <div className="mt-1.5 text-xl font-bold font-mono text-slate-100">
            {activeModel ? `${(activeModel.trainMetrics.r2 * 100).toFixed(2)}%` : '—'}
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">RMSE (Prueba)</div>
          <div className="mt-1.5 text-xl font-bold font-mono text-slate-100">
            {activeModel ? formatNum(activeModel.testMetrics.rmse, 3) : '—'}
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-4">
          <div className="text-xs text-slate-400">Validación supuestos</div>
          <div className="mt-1.5 text-sm font-semibold text-slate-100">
            {activeDiag
              ? `${passedAssumptions}/${evaluatedAssumptions} óptimos`
              : 'Pendiente'}
          </div>
        </div>
      </div>

      {/* Main Summary Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Estado del flujo analítico
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {dataset.fileName} · {dataset.fileFormat} · Sector: {dataset.sector.activeSector}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('export')}
              className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Generar informe PDF
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                title: '1. Exploración y calidad',
                desc: `${dataset.quality.totalNulls} nulos (${dataset.quality.totalNullPct.toFixed(1)}%) · ${dataset.quality.duplicateRows} duplicados`,
                target: 'exploration' as SectionId,
              },
              {
                title: '2. Estadística descriptiva',
                desc: `${dataset.quality.numericColsCount} variables numéricas perfiladas`,
                target: 'descriptive' as SectionId,
              },
              {
                title: '3. Configuración Y / X',
                desc: `Y: ${config.dependentVar || 'No asignada'} · División ${Math.round(config.trainRatio * 100)}/${Math.round((1 - config.trainRatio) * 100)}`,
                target: 'config' as SectionId,
              },
              {
                title: '4. Modelos Simple y Múltiple',
                desc: activeModel
                  ? `R² ajust.: ${(activeModel.trainMetrics.adjR2 * 100).toFixed(2)}% · F p=${activeModel.fPValue < 0.0001 ? '<0.0001' : activeModel.fPValue.toFixed(4)}`
                  : 'Configura variables para estimar',
                target: 'multiple' as SectionId,
              },
              {
                title: '5. Diagnóstico y selección',
                desc: activeDiag
                  ? `VIF máx: ${activeDiag.maxVif?.toFixed(2) ?? '1.00'} · ${activeDiag.influentialPoints.length} atípicos`
                  : 'Auditoría de supuestos OLS',
                target: 'diagnostics' as SectionId,
              },
              {
                title: '6. Predicciones e interpretación',
                desc: 'Evaluación fuera de muestra e intervalos IC / IP',
                target: 'predictions' as SectionId,
              },
            ].map((step) => (
              <button
                key={step.target}
                type="button"
                onClick={() => onNavigate(step.target)}
                className="text-left p-3.5 bg-[#0E1420] hover:bg-[#161F30] border border-[#1E293B] rounded-lg transition-colors flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200 truncate">{step.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate">{step.desc}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Alertas de calidad y supuestos
          </h2>
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {dataset.quality.alerts.map((a) => (
              <div
                key={a.id}
                className="p-3 bg-[#0E1420] border border-[#1E293B] rounded-lg space-y-1"
              >
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {a.severity === 'error' ? (
                    <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : a.severity === 'warning' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  )}
                  <span className="text-slate-200">{a.title}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{a.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SECTION 2: CARGAR DATOS (MÓDULO 1 & MÓDULO 2)
// ============================================================================

export const UploadDataView: React.FC<{
  dataset: Dataset | null;
  onFileParsed: (ds: Dataset) => void;
  onLoadSample: (id: string) => void;
  onUpdateSector: (sector: EconomicSector) => void;
  onToggleColumnInclude: (colName: string) => void;
  onProceed: () => void;
}> = ({
  dataset,
  onFileParsed,
  onLoadSample,
  onUpdateSector,
  onToggleColumnInclude,
  onProceed,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const { parseUploadedFile } = await import('../../utils/dataParser');
      const ds = await parseUploadedFile(file);
      onFileParsed(ds);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo procesar el archivo.');
    } finally {
      setLoading(false);
    }
  };

  const kindLabel = (k: string) => {
    if (k === 'numeric_continuous') return 'Numérica continua';
    if (k === 'numeric_discrete') return 'Numérica discreta';
    if (k === 'categorical') return 'Categórica';
    return 'Texto libre';
  };

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={`bg-[#111827] border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragging ? 'border-sky-400 bg-sky-500/5' : 'border-[#273247]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt,.tsv,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        <UploadCloud className="w-10 h-10 text-sky-400 mx-auto mb-3" />
        <h2 className="font-display text-lg font-semibold text-slate-100">
          Cargar base de datos tabular
        </h2>
        <p className="text-sm text-slate-400 mt-1 max-w-xl mx-auto">
          Arrastra y suelta o selecciona archivos en formato Excel (<span className="font-mono">.xlsx, .xls</span>),{' '}
          <span className="font-mono">.csv</span>, texto delimitado (<span className="font-mono">.txt, .tsv</span>) o{' '}
          <span className="font-mono">.json</span> tabular.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Procesando archivo...' : 'Seleccionar archivo del equipo'}
          </button>
        </div>
        {errorMsg && (
          <div className="mt-4 max-w-xl mx-auto p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2 text-left">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Quick sample loader */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-100">
            Bases de datos de ejemplo listas para analizar
          </h3>
          <span className="text-xs text-slate-400">Todos los cálculos se ejecutan en tiempo real sobre estos datos</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SAMPLE_DATASETS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onLoadSample(s.id)}
              className="text-left p-3.5 bg-[#0E1420] hover:bg-[#161F30] border border-[#1E293B] rounded-lg transition-colors cursor-pointer space-y-1"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
                <Database className="w-3.5 h-3.5" />
                <span>{s.sectorHint}</span>
              </div>
              <div className="text-xs font-medium text-slate-200">{s.title}</div>
            </button>
          ))}
        </div>
      </div>

      {dataset && (
        <>
          {/* File dimensions & Sector Identification (Module 2) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-5 h-5 text-sky-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{dataset.fileName}</h3>
                    <p className="text-xs text-slate-400">
                      Formato {dataset.fileFormat} · {dataset.quality.totalRows} filas × {dataset.quality.totalCols} columnas
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onProceed}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <span>Explorar datos</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-[#0E1420] border border-[#1E293B] rounded-lg p-3">
                  <div className="text-xs text-slate-400">Numéricas</div>
                  <div className="mt-1 text-lg font-bold font-mono text-slate-100">
                    {dataset.quality.numericColsCount}
                  </div>
                </div>
                <div className="bg-[#0E1420] border border-[#1E293B] rounded-lg p-3">
                  <div className="text-xs text-slate-400">Categóricas / Texto</div>
                  <div className="mt-1 text-lg font-bold font-mono text-slate-100">
                    {dataset.quality.categoricalColsCount + dataset.quality.textColsCount}
                  </div>
                </div>
                <div className="bg-[#0E1420] border border-[#1E293B] rounded-lg p-3">
                  <div className="text-xs text-slate-400">Duplicados</div>
                  <div className="mt-1 text-lg font-bold font-mono text-slate-100">
                    {dataset.quality.duplicateRows}
                  </div>
                </div>
              </div>
            </div>

            {/* Module 2: Economic Sector */}
            <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  Módulo 2: Identificación del sector económico
                </h3>
                <span className="text-xs text-slate-400">
                  Confianza: <strong className="text-slate-200">{dataset.sector.confidence}</strong>
                  {dataset.sector.isManualOverride ? ' · Editado manualmente' : ''}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="text-xs text-slate-400 shrink-0" htmlFor="sector-select">
                  Sector asignado:
                </label>
                <select
                  id="sector-select"
                  value={dataset.sector.activeSector}
                  onChange={(e) => onUpdateSector(e.target.value as EconomicSector)}
                  className="flex-1 bg-[#0B0F17] border border-[#273247] rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-400"
                >
                  {ECONOMIC_SECTORS.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{dataset.sector.explanation}</p>
            </div>
          </div>

          {/* Preview first 5 rows */}
          <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-100">
              Vista previa de las primeras 5 filas
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B] text-slate-400">
                    <th className="py-2 px-3 font-medium">#</th>
                    {dataset.columns.map((c) => (
                      <th key={c.name} className="py-2 px-3 font-medium whitespace-nowrap">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182131]">
                  {dataset.rows.slice(0, 5).map((row, idx) => (
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

          {/* Variables catalog & participation selection */}
          <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Esquema de variables y selección para el análisis
                </h3>
                <p className="text-xs text-slate-400">
                  Marca o desmarca las variables que participarán en las estadísticas descriptivas, correlaciones y selección automática.
                </p>
              </div>
              <span className="text-xs text-emerald-400 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{dataset.columns.filter((c) => c.included).length} seleccionadas</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B] text-slate-400">
                    <th className="py-2 px-3">Incluir</th>
                    <th className="py-2 px-3">Variable</th>
                    <th className="py-2 px-3">Tipo detectado</th>
                    <th className="py-2 px-3 text-right">Válidos</th>
                    <th className="py-2 px-3 text-right">Nulos (%)</th>
                    <th className="py-2 px-3 text-right">Únicos</th>
                    <th className="py-2 px-3">Muestra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182131]">
                  {dataset.columns.map((c) => {
                    const isNum =
                      c.inferredKind === 'numeric_continuous' || c.inferredKind === 'numeric_discrete';
                    return (
                      <tr key={c.name} className="hover:bg-[#161F30]">
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            checked={c.included}
                            disabled={!isNum || c.isConstant}
                            onChange={() => onToggleColumnInclude(c.name)}
                            className="accent-sky-400 w-4 h-4 cursor-pointer disabled:opacity-40"
                          />
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-100">{c.name}</td>
                        <td className="py-2 px-3 text-slate-300">
                          {kindLabel(c.inferredKind)}
                          {c.isConstant ? ' · Constante' : ''}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-200">{c.nonNullCount}</td>
                        <td
                          className={`py-2 px-3 text-right font-mono ${
                            c.nullPct > 15 ? 'text-rose-400' : c.nullCount > 0 ? 'text-amber-400' : 'text-slate-400'
                          }`}
                        >
                          {c.nullCount} ({c.nullPct.toFixed(1)}%)
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-300">{c.uniqueCount}</td>
                        <td className="py-2 px-3 text-slate-400 truncate max-w-xs">
                          {c.sampleValues.join(' · ') || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
