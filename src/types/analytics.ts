export type SectionId =
  | 'dashboard'
  | 'upload'
  | 'exploration'
  | 'descriptive'
  | 'config'
  | 'simple'
  | 'multiple'
  | 'diagnostics'
  | 'selection'
  | 'predictions'
  | 'comparison'
  | 'interpretation'
  | 'export';

export type VariableKind =
  | 'numeric_continuous'
  | 'numeric_discrete'
  | 'categorical'
  | 'text';

export interface ColumnMeta {
  name: string;
  inferredKind: VariableKind;
  nonNullCount: number;
  nullCount: number;
  nullPct: number;
  uniqueCount: number;
  sampleValues: string[];
  included: boolean;
  isConstant: boolean;
}

export interface DataQualityAlert {
  id: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  recommendation: string;
}

export interface DataQualityReport {
  totalRows: number;
  totalCols: number;
  duplicateRows: number;
  totalNulls: number;
  totalNullPct: number;
  numericColsCount: number;
  categoricalColsCount: number;
  textColsCount: number;
  highNullColumns: string[];
  constantColumns: string[];
  alerts: DataQualityAlert[];
}

export const ECONOMIC_SECTORS = [
  'Financiero y bancario',
  'Comercio y retail',
  'Telecomunicaciones',
  'Salud',
  'Educación',
  'Manufactura e industria',
  'Transporte y logística',
  'Tecnología',
  'Servicios',
  'Agropecuario',
  'Otros',
  'No identificado',
] as const;

export type EconomicSector = (typeof ECONOMIC_SECTORS)[number];

export interface EconomicSectorResult {
  detectedSector: EconomicSector;
  activeSector: EconomicSector;
  confidence: 'Alta' | 'Media' | 'Baja';
  explanation: string;
  matchedKeywords: string[];
  isManualOverride: boolean;
}

export type RawRow = Record<string, string | number | boolean | null | undefined>;

export interface Dataset {
  id: string;
  fileName: string;
  fileFormat: string;
  loadedAt: string;
  rows: RawRow[];
  numericRows: Record<string, number | null>[];
  columns: ColumnMeta[];
  quality: DataQualityReport;
  sector: EconomicSectorResult;
}

export interface DescriptiveStats {
  column: string;
  kind: VariableKind;
  n: number;
  missingCount: number;
  missingPct: number;
  mean: number;
  median: number;
  mode: number | null;
  modeApplicable: boolean;
  modeNote: string;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  iqr: number;
  range: number;
  skewness: number;
  kurtosis: number;
  outliersCount: number;
  values: number[];
}

export type MissingStrategy = 'drop' | 'mean_train' | 'median_train';

export interface RegressionConfig {
  dependentVar: string;
  simpleX: string;
  multipleXs: string[];
  trainRatio: number; // e.g., 0.80
  randomSeed: number;
  missingStrategy: MissingStrategy;
  cvFolds: number;
  isOrderedData: boolean;
}

export interface CoefficientStat {
  name: string;
  isIntercept: boolean;
  estimate: number;
  stdError: number;
  tStat: number;
  pValue: number;
  ciLower: number;
  ciUpper: number;
  standardizedBeta: number | null;
  significant05: boolean;
}

export interface MetricsSet {
  n: number;
  r2: number;
  adjR2: number;
  rmse: number;
  mae: number;
  mse: number;
  mape: number | null;
  mapeValid: boolean;
  mapeReason?: string;
  aic: number;
  bic: number;
}

export type ModelKind =
  | 'simple'
  | 'multiple'
  | 'stepwise_forward'
  | 'stepwise_backward'
  | 'stepwise_bidirectional'
  | 'best_subset';

export interface RegressionModelResult {
  id: string;
  kind: ModelKind;
  label: string;
  dependentVar: string;
  predictors: string[];
  equation: string;
  coefficients: CoefficientStat[];
  trainMetrics: MetricsSet;
  testMetrics: MetricsSet;
  cvRmse: number | null;
  cvR2: number | null;
  cvFoldsUsed: number;
  fStat: number;
  fPValue: number;
  dfModel: number;
  dfResid: number;
  residualStdError: number;
  actualTrain: number[];
  fittedTrain: number[];
  residualsTrain: number[];
  actualTest: number[];
  fittedTest: number[];
  residualsTest: number[];
  testRowIndices: number[];
  trainRowIndices: number[];
  leverageTrain: number[];
  stdResidualsTrain: number[];
  cooksDTrain: number[];
  xtxInverse: number[][];
  imputationValues: Record<string, number>;
  droppedTrainCount: number;
  droppedTestCount: number;
  warnings: string[];
  isValid: boolean;
  errorMessage?: string;
}

export interface VifEntry {
  variable: string;
  vif: number;
  r2Aux: number;
  status: 'Óptimo (< 5)' | 'Moderado (5 - 10)' | 'Severo (>= 10)';
}

export interface InfluentialPoint {
  trainIndex: number;
  originalRowIndex: number;
  actual: number;
  fitted: number;
  residual: number;
  stdResidual: number;
  leverage: number;
  cooksD: number;
  reasons: string[];
}

export interface DiagnosticAlert {
  assumption: string;
  status: 'Cumple' | 'Precaución' | 'Incumple' | 'No aplica';
  summary: string;
  detail: string;
}

export interface DiagnosticsResult {
  modelId: string;
  modelLabel: string;
  normalityJB: {
    statistic: number;
    pValue: number;
    skewness: number;
    excessKurtosis: number;
    passed: boolean;
    interpretation: string;
  };
  homoscedasticityBP: {
    statistic: number;
    df: number;
    pValue: number;
    passed: boolean;
    interpretation: string;
  };
  durbinWatson: {
    statistic: number;
    applicable: boolean;
    interpretation: string;
    caveat: string;
  };
  vif: VifEntry[];
  maxVif: number | null;
  influentialPoints: InfluentialPoint[];
  cooksThreshold: number;
  leverageThreshold: number;
  alerts: DiagnosticAlert[];
}

export interface StepwiseStep {
  step: number;
  action: 'Inicio' | 'Agregar' | 'Eliminar' | 'Final';
  variable: string | null;
  aic: number;
  bic: number;
  adjR2: number;
  pValueAction: number | null;
  predictorsAfter: string[];
}

export interface SubsetCandidate {
  predictors: string[];
  k: number;
  r2: number;
  adjR2: number;
  aic: number;
  bic: number;
  trainRmse: number;
  cvRmse: number | null;
}

export interface AutoSelectionResult {
  forward: {
    steps: StepwiseStep[];
    model: RegressionModelResult | null;
  };
  backward: {
    steps: StepwiseStep[];
    model: RegressionModelResult | null;
  };
  bidirectional: {
    steps: StepwiseStep[];
    model: RegressionModelResult | null;
  };
  bestSubsets: {
    evaluatedCount: number;
    truncatedPredictors: boolean;
    candidates: SubsetCandidate[];
    bestByAdjR2: RegressionModelResult | null;
    bestByBic: RegressionModelResult | null;
  };
}

export interface IndividualPredictionResult {
  predicted: number;
  seMean: number;
  sePred: number;
  ciLower: number;
  ciUpper: number;
  piLower: number;
  piUpper: number;
  confidenceLevel: number;
  extrapolationWarning: string | null;
}

export interface AutomatedInterpretation {
  sections: {
    number: number;
    title: string;
    content: string[];
  }[];
  recommendedModelId: string | null;
  recommendedModelLabel: string;
  recommendationJustification: string[];
  tradeoffsNote: string;
}
