import React, { useState } from 'react';
import { Award, CheckCircle2, FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import {
  AutomatedInterpretation,
  Dataset,
  DescriptiveStats,
  DiagnosticsResult,
  RegressionConfig,
  RegressionModelResult,
} from '../../types/analytics';
import {
  exportConclusionsText,
  exportDescriptiveStats,
  exportPredictions,
  exportResultsWorkbook,
  generateComprehensivePdfReport,
} from '../../utils/exportUtils';

// ============================================================================
// SECTION 12: INTERPRETACIÓN Y CONCLUSIONES (MÓDULO 12)
// ============================================================================

export const InterpretationView: React.FC<{
  dataset: Dataset;
  interpretation: AutomatedInterpretation;
}> = ({ dataset, interpretation }) => {
  return (
    <div className="space-y-6">
      {/* Executive Recommendation Card */}
      <div className="bg-[#111827] border border-sky-500/35 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-sky-400">
              <Award className="w-4 h-4" />
              <span>Recomendación econométrica automática</span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-100">
              Modelo recomendado: {interpretation.recommendedModelLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => exportConclusionsText(dataset, interpretation)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg cursor-pointer whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Descargar conclusiones (.txt)</span>
          </button>
        </div>

        <div className="space-y-2">
          {interpretation.recommendationJustification.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs text-slate-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400 pt-1 border-t border-[#1E293B]">
          {interpretation.tradeoffsNote}
        </p>
      </div>

      {/* 10 Structured Analytical Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {interpretation.sections.map((sec) => (
          <div
            key={sec.number}
            className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-2.5"
          >
            <h3 className="text-sm font-semibold text-slate-100">
              {sec.number}. {sec.title}
            </h3>
            <div className="space-y-1.5">
              {sec.content.map((p, idx) => (
                <p key={idx} className="text-xs text-slate-300 leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// SECTION 13: EXPORTAR INFORME (MÓDULO 13)
// ============================================================================

const PDF_SECTIONS_CHECKLIST = [
  '1. Portada con nombre del análisis',
  '2. Descripción de la base de datos',
  '3. Sector económico identificado',
  '4. Análisis de calidad de datos',
  '5. Estadísticas descriptivas',
  '6. Gráficos exploratorios (Histograma y Heatmap)',
  '7. Variables seleccionadas',
  '8. Metodología utilizada (Train/Test y sin fuga)',
  '9. Resultados de regresión simple y múltiple',
  '10. Coeficientes e intervalos de confianza 95%',
  '11. Validación y diagnóstico de supuestos + gráficos',
  '12. Comparación de modelos',
  '13. Resultados de predicciones en prueba',
  '14. Interpretación estadística integral',
  '15. Conclusiones y recomendación final',
];

export const ExportReportView: React.FC<{
  dataset: Dataset;
  stats: DescriptiveStats[];
  config: RegressionConfig;
  simpleModel: RegressionModelResult | null;
  multipleModel: RegressionModelResult | null;
  allModels: RegressionModelResult[];
  diagnosticsMap: Record<string, DiagnosticsResult>;
  interpretation: AutomatedInterpretation;
}> = ({
  dataset,
  stats,
  config,
  simpleModel,
  multipleModel,
  allModels,
  diagnosticsMap,
  interpretation,
}) => {
  const [reportTitle, setReportTitle] = useState(
    `Análisis Econométrico — ${dataset.fileName.replace(/\.[^.]+$/, '')}`
  );
  const [analystName, setAnalystName] = useState('Equipo de Ciencia de Datos');
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleGeneratePdf = () => {
    setGenerating(true);
    setStatusMsg(null);
    try {
      generateComprehensivePdfReport({
        reportTitle,
        analystName,
        dataset,
        stats,
        config,
        simpleModel,
        multipleModel,
        allModels,
        diagnosticsMap,
        interpretation,
      });
      setStatusMsg('Informe PDF generado y descargado correctamente con los cálculos reales actuales.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Error al generar el informe PDF.');
    } finally {
      setGenerating(false);
    }
  };

  const validModels = allModels.filter((m) => m.isValid);
  const primaryPredModel =
    validModels.find((m) => m.id === interpretation.recommendedModelId) ??
    multipleModel ??
    simpleModel;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* PDF Configuration & Primary Download */}
        <div className="lg:col-span-2 bg-[#111827] border border-[#1E293B] rounded-xl p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Generación de informe ejecutivo completo en PDF
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              El informe compila automáticamente todas las tablas, ecuaciones, gráficos exploratorios y diagnósticos calculados sobre tu base de datos activa.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="rep-title" className="block text-xs text-slate-300 font-medium">
                Título del informe (Portada)
              </label>
              <input
                id="rep-title"
                type="text"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="w-full bg-[#0B0F17] border border-[#273247] rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-400"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rep-analyst" className="block text-xs text-slate-300 font-medium">
                Autor / Analista responsable
              </label>
              <input
                id="rep-analyst"
                type="text"
                value={analystName}
                onChange={(e) => setAnalystName(e.target.value)}
                className="w-full bg-[#0B0F17] border border-[#273247] rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>

          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={generating}
              onClick={handleGeneratePdf}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" />
              <span>{generating ? 'Compilando PDF...' : 'Descargar informe completo en PDF'}</span>
            </button>
          </div>

          {statusMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300">
              {statusMsg}
            </div>
          )}

          {/* Additional Exports */}
          <div className="pt-4 border-t border-[#1E293B] space-y-3">
            <h3 className="text-sm font-semibold text-slate-100">
              Exportaciones complementarias de datos y resultados
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  exportResultsWorkbook(dataset, stats, validModels, interpretation, 'xlsx')
                }
                className="flex items-center justify-between p-3 bg-[#0E1420] hover:bg-[#161F30] border border-[#1E293B] rounded-lg text-xs text-slate-200 cursor-pointer"
              >
                <span>Resultados completos y coeficientes (.xlsx)</span>
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              </button>

              <button
                type="button"
                onClick={() =>
                  exportDescriptiveStats(stats, 'csv', dataset.fileName.replace(/\.[^.]+$/, ''))
                }
                className="flex items-center justify-between p-3 bg-[#0E1420] hover:bg-[#161F30] border border-[#1E293B] rounded-lg text-xs text-slate-200 cursor-pointer"
              >
                <span>Tabla de estadísticas descriptivas (.csv)</span>
                <FileText className="w-4 h-4 text-sky-400" />
              </button>

              {primaryPredModel && primaryPredModel.isValid && (
                <button
                  type="button"
                  onClick={() => exportPredictions(primaryPredModel, 'xlsx')}
                  className="flex items-center justify-between p-3 bg-[#0E1420] hover:bg-[#161F30] border border-[#1E293B] rounded-lg text-xs text-slate-200 cursor-pointer"
                >
                  <span>Predicciones de prueba ({primaryPredModel.label}) (.xlsx)</span>
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                </button>
              )}

              <button
                type="button"
                onClick={() => exportConclusionsText(dataset, interpretation)}
                className="flex items-center justify-between p-3 bg-[#0E1420] hover:bg-[#161F30] border border-[#1E293B] rounded-lg text-xs text-slate-200 cursor-pointer"
              >
                <span>Interpretación y conclusiones (.txt)</span>
                <FileText className="w-4 h-4 text-amber-400" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Nota: Cada gráfico individual en los módulos de Exploración, Regresión, Diagnóstico y Predicciones incluye también un botón dedicado de descarga en formato PNG.
            </p>
          </div>
        </div>

        {/* 15-section checklist */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Estructura del informe PDF (15 secciones)
          </h3>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {PDF_SECTIONS_CHECKLIST.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
