import React, { useMemo, useState } from 'react';
import { Menu, Upload } from 'lucide-react';
import {
  AutoSelectionResult,
  Dataset,
  DescriptiveStats,
  DiagnosticsResult,
  EconomicSector,
  RegressionConfig,
  RegressionModelResult,
  SectionId,
} from './types/analytics';
import { computeCorrelationMatrix, computeDescriptiveStats } from './utils/mathStats';
import {
  computeDiagnostics,
  fitRegressionModel,
  generateGlobalAutomatedInterpretation,
  runAutomaticVariableSelection,
  splitRowIndices,
} from './utils/regressionEngine';
import { SAMPLE_DATASETS } from './utils/sampleDatasets';
import { NAV_ITEMS, Sidebar } from './components/Sidebar';
import { DashboardView, UploadDataView } from './components/views/DashboardAndUploadViews';
import {
  DescriptiveView,
  ExplorationView,
} from './components/views/ExplorationAndDescriptiveViews';
import {
  ModelConfigView,
  RegressionResultView,
} from './components/views/ConfigAndRegressionViews';
import {
  DiagnosticsView,
  VariableSelectionView,
} from './components/views/DiagnosticsAndSelectionViews';
import {
  ModelComparisonView,
  PredictionsView,
} from './components/views/PredictionsAndComparisonViews';
import {
  ExportReportView,
  InterpretationView,
} from './components/views/InterpretationAndExportViews';

function buildInitialConfigForDataset(ds: Dataset): RegressionConfig {
  const numCols = ds.columns
    .filter(
      (c) =>
        c.included &&
        !c.isConstant &&
        (c.inferredKind === 'numeric_continuous' || c.inferredKind === 'numeric_discrete')
    )
    .map((c) => c.name);

  // Heuristic: prefer last continuous numeric column (not an ID) as default Y
  const nonIdCols = numCols.filter((name) => !/^(id|id_|codigo|index|fila)/i.test(name));
  const pool = nonIdCols.length >= 2 ? nonIdCols : numCols;
  const dependentVar = pool[pool.length - 1] ?? '';
  const predictors = pool.filter((c) => c !== dependentVar);

  // Pick simpleX with highest absolute correlation to Y
  let simpleX = predictors[0] ?? '';
  if (dependentVar && predictors.length > 1) {
    const corr = computeCorrelationMatrix(ds, [dependentVar, ...predictors]);
    let bestAbsR = -1;
    for (let i = 1; i < corr.columns.length; i++) {
      const r = Math.abs(corr.matrix[0][i] ?? 0);
      if (Number.isFinite(r) && r > bestAbsR) {
        bestAbsR = r;
        simpleX = corr.columns[i];
      }
    }
  }

  return {
    dependentVar,
    simpleX,
    multipleXs: predictors.slice(0, Math.min(6, predictors.length)),
    trainRatio: 0.8,
    randomSeed: 2026,
    missingStrategy: 'median_train',
    cvFolds: 5,
    isOrderedData: false,
  };
}

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [config, setConfig] = useState<RegressionConfig>({
    dependentVar: '',
    simpleX: '',
    multipleXs: [],
    trainRatio: 0.8,
    randomSeed: 2026,
    missingStrategy: 'median_train',
    cvFolds: 5,
    isOrderedData: false,
  });

  const [selectionResult, setSelectionResult] = useState<AutoSelectionResult | null>(null);

  const activateDataset = (ds: Dataset, targetSection?: SectionId) => {
    setDataset(ds);
    setConfig(buildInitialConfigForDataset(ds));
    setSelectionResult(null);
    if (targetSection) setActiveSection(targetSection);
  };

  const handleLoadSample = (sampleId: string) => {
    const spec = SAMPLE_DATASETS.find((s) => s.id === sampleId);
    if (!spec) return;
    const ds = spec.build();
    activateDataset(ds, 'dashboard');
  };

  const handleUpdateSector = (sector: EconomicSector) => {
    if (!dataset) return;
    setDataset({
      ...dataset,
      sector: {
        ...dataset.sector,
        activeSector: sector,
        isManualOverride: sector !== dataset.sector.detectedSector,
      },
    });
  };

  const handleToggleColumnInclude = (colName: string) => {
    if (!dataset) return;
    const nextCols = dataset.columns.map((c) =>
      c.name === colName ? { ...c, included: !c.included } : c
    );
    const nextDs: Dataset = { ...dataset, columns: nextCols };
    setDataset(nextDs);

    const activePool = nextCols
      .filter(
        (c) =>
          c.included &&
          !c.isConstant &&
          (c.inferredKind === 'numeric_continuous' || c.inferredKind === 'numeric_discrete')
      )
      .map((c) => c.name);

    const nextMultiple = config.multipleXs.filter((x) => activePool.includes(x));
    const nextSimple = activePool.includes(config.simpleX)
      ? config.simpleX
      : (activePool.find((c) => c !== config.dependentVar) ?? '');
    const nextY = activePool.includes(config.dependentVar)
      ? config.dependentVar
      : (activePool[activePool.length - 1] ?? '');

    setConfig((prev) => ({
      ...prev,
      dependentVar: nextY,
      simpleX: nextSimple,
      multipleXs: nextMultiple,
    }));
    setSelectionResult(null);
  };

  // Compute Descriptive Stats for included numeric columns
  const descriptiveStats = useMemo<DescriptiveStats[]>(() => {
    if (!dataset) return [];
    return dataset.columns
      .filter(
        (c) =>
          c.included &&
          (c.inferredKind === 'numeric_continuous' || c.inferredKind === 'numeric_discrete')
      )
      .map((col) => computeDescriptiveStats(dataset, col));
  }, [dataset]);

  // Deterministic train/test split
  const split = useMemo(() => {
    if (!dataset) return { trainIndices: [], testIndices: [] };
    return splitRowIndices(
      dataset.numericRows.length,
      config.trainRatio,
      config.randomSeed,
      config.isOrderedData
    );
  }, [dataset, config.trainRatio, config.randomSeed, config.isOrderedData]);

  // Simple Linear Regression
  const simpleModel = useMemo<RegressionModelResult | null>(() => {
    if (!dataset || !config.dependentVar || !config.simpleX) return null;
    return fitRegressionModel(
      dataset,
      config,
      'simple',
      `Regresión Lineal Simple (${config.simpleX})`,
      [config.simpleX],
      split
    );
  }, [dataset, config, split]);

  // Multiple Linear Regression
  const multipleModel = useMemo<RegressionModelResult | null>(() => {
    if (!dataset || !config.dependentVar || config.multipleXs.length < 2) return null;
    return fitRegressionModel(
      dataset,
      config,
      'multiple',
      `Regresión Lineal Múltiple (${config.multipleXs.length} vars)`,
      config.multipleXs,
      split
    );
  }, [dataset, config, split]);

  const candidatePool = useMemo(() => {
    if (!dataset) return [];
    return dataset.columns
      .filter(
        (c) =>
          c.included &&
          !c.isConstant &&
          c.name !== config.dependentVar &&
          (c.inferredKind === 'numeric_continuous' || c.inferredKind === 'numeric_discrete') &&
          !/^(id|id_|codigo|index|fila)$/i.test(c.name)
      )
      .map((c) => c.name);
  }, [dataset, config.dependentVar]);

  const handleRunSelection = () => {
    if (!dataset || !config.dependentVar || candidatePool.length === 0) return;
    const res = runAutomaticVariableSelection(dataset, config, candidatePool);
    setSelectionResult(res);
  };

  // Deduplicated list of all valid models across Simple, Multiple, and Selection
  const allModels = useMemo<RegressionModelResult[]>(() => {
    const list: RegressionModelResult[] = [];
    if (simpleModel) list.push(simpleModel);
    if (multipleModel) list.push(multipleModel);
    if (selectionResult) {
      const extras = [
        selectionResult.forward.model,
        selectionResult.backward.model,
        selectionResult.bidirectional.model,
        selectionResult.bestSubsets.bestByBic,
        selectionResult.bestSubsets.bestByAdjR2,
      ].filter((m): m is RegressionModelResult => Boolean(m));
      for (const m of extras) {
        if (!list.some((existing) => existing.id === m.id)) {
          list.push(m);
        }
      }
    }
    return list;
  }, [simpleModel, multipleModel, selectionResult]);

  // Diagnostics Map for all valid models
  const diagnosticsMap = useMemo<Record<string, DiagnosticsResult>>(() => {
    if (!dataset) return {};
    const map: Record<string, DiagnosticsResult> = {};
    for (const m of allModels) {
      if (m.isValid) {
        map[m.id] = computeDiagnostics(dataset, config, m);
      }
    }
    return map;
  }, [dataset, config, allModels]);

  // Global Automated Interpretation & Model Recommendation
  const globalInterpretation = useMemo(() => {
    if (!dataset) return null;
    return generateGlobalAutomatedInterpretation(dataset, allModels, diagnosticsMap);
  }, [dataset, allModels, diagnosticsMap]);

  const currentNavItem = NAV_ITEMS.find((n) => n.id === activeSection);

  const handleConfigChange = (next: RegressionConfig) => {
    setConfig(next);
    setSelectionResult(null);
  };

  const handleApplyPredictors = (predictors: string[]) => {
    setConfig((prev) => ({
      ...prev,
      multipleXs: predictors,
      simpleX: predictors[0] ?? prev.simpleX,
    }));
    setActiveSection(predictors.length === 1 ? 'simple' : 'multiple');
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#E6EDF7] flex">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        hasDataset={Boolean(dataset)}
        datasetName={dataset?.fileName}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean 3-zone SaaS Top Header */}
        <header className="h-14 border-b border-[#1E293B] bg-[#0E1420] px-4 lg:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-300 hover:text-white rounded-lg border border-[#1E293B]"
              aria-label="Abrir menú"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                Econometrix Studio
              </span>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-100 truncate">
                {currentNavItem?.label ?? 'Dashboard'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveSection('upload')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#182235] hover:bg-[#1F2C44] border border-[#28354D] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{dataset ? 'Cambiar datos' : 'Cargar datos'}</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Content Viewport */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <div className="max-w-[1320px] mx-auto">
            {activeSection === 'dashboard' && (
              <DashboardView
                dataset={dataset}
                config={config}
                simpleModel={simpleModel}
                multipleModel={multipleModel}
                diagnosticsMap={diagnosticsMap}
                onNavigate={setActiveSection}
                onLoadSample={handleLoadSample}
              />
            )}

            {activeSection === 'upload' && (
              <UploadDataView
                dataset={dataset}
                onFileParsed={(ds) => activateDataset(ds)}
                onLoadSample={handleLoadSample}
                onUpdateSector={handleUpdateSector}
                onToggleColumnInclude={handleToggleColumnInclude}
                onProceed={() => setActiveSection('exploration')}
              />
            )}

            {dataset && activeSection === 'exploration' && (
              <ExplorationView
                dataset={dataset}
                stats={descriptiveStats}
                config={config}
              />
            )}

            {dataset && activeSection === 'descriptive' && (
              <DescriptiveView dataset={dataset} stats={descriptiveStats} />
            )}

            {dataset && activeSection === 'config' && (
              <ModelConfigView
                dataset={dataset}
                config={config}
                onChangeConfig={handleConfigChange}
                onRunModels={(target) => setActiveSection(target ?? 'multiple')}
              />
            )}

            {dataset && activeSection === 'simple' && (
              <RegressionResultView
                model={simpleModel}
                mode="simple"
                onGoConfig={() => setActiveSection('config')}
              />
            )}

            {dataset && activeSection === 'multiple' && (
              <RegressionResultView
                model={multipleModel}
                mode="multiple"
                onGoConfig={() => setActiveSection('config')}
              />
            )}

            {dataset && activeSection === 'diagnostics' && (
              <DiagnosticsView models={allModels} diagnosticsMap={diagnosticsMap} />
            )}

            {dataset && activeSection === 'selection' && (
              <VariableSelectionView
                selectionResult={selectionResult}
                candidatePool={candidatePool}
                onRunSelection={handleRunSelection}
                onApplyPredictorsToMultiple={handleApplyPredictors}
              />
            )}

            {dataset && activeSection === 'predictions' && (
              <PredictionsView
                dataset={dataset}
                config={config}
                stats={descriptiveStats}
                models={allModels}
              />
            )}

            {dataset && activeSection === 'comparison' && globalInterpretation && (
              <ModelComparisonView
                dataset={dataset}
                stats={descriptiveStats}
                models={allModels}
                recommendedModelId={globalInterpretation.recommendedModelId}
                interpretation={globalInterpretation}
              />
            )}

            {dataset && activeSection === 'interpretation' && globalInterpretation && (
              <InterpretationView
                dataset={dataset}
                interpretation={globalInterpretation}
              />
            )}

            {dataset && activeSection === 'export' && globalInterpretation && (
              <ExportReportView
                dataset={dataset}
                stats={descriptiveStats}
                config={config}
                simpleModel={simpleModel}
                multipleModel={multipleModel}
                allModels={allModels}
                diagnosticsMap={diagnosticsMap}
                interpretation={globalInterpretation}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
