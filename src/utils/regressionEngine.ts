import {
  AutomatedInterpretation,
  AutoSelectionResult,
  CoefficientStat,
  Dataset,
  DiagnosticAlert,
  DiagnosticsResult,
  IndividualPredictionResult,
  InfluentialPoint,
  MetricsSet,
  MissingStrategy,
  ModelKind,
  RegressionConfig,
  RegressionModelResult,
  StepwiseStep,
  SubsetCandidate,
  VifEntry,
} from '../types/analytics';
import {
  chi2PValue,
  formatNum,
  fPValue,
  quantileSorted,
  solveOLS,
  tInv,
  tPValueTwoTailed,
} from './mathStats';

// Mulberry32 deterministic PRNG
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function splitRowIndices(
  totalRows: number,
  trainRatio: number,
  seed: number,
  preserveOrder: boolean
): { trainIndices: number[]; testIndices: number[] } {
  const indices = Array.from({ length: totalRows }, (_, i) => i);
  if (!preserveOrder) {
    const rng = createRng(seed);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }
  }
  const splitPoint = Math.max(2, Math.min(totalRows - 1, Math.round(totalRows * trainRatio)));
  return {
    trainIndices: indices.slice(0, splitPoint),
    testIndices: indices.slice(splitPoint),
  };
}

interface PreparedSplitData {
  XTrain: number[][];
  yTrain: number[];
  trainRowIndices: number[];
  XTest: number[][];
  yTest: number[];
  testRowIndices: number[];
  imputationValues: Record<string, number>;
  droppedTrainCount: number;
  droppedTestCount: number;
}

/**
 * Prepares design matrices strictly avoiding data leakage:
 * Imputation statistics (mean/median) are fitted ONLY on trainIndices.
 */
function prepareSplitMatrices(
  dataset: Dataset,
  rowIndicesTrain: number[],
  rowIndicesTest: number[],
  dependentVar: string,
  predictors: string[],
  strategy: MissingStrategy
): PreparedSplitData {
  const imputationValues: Record<string, number> = {};

  if (strategy !== 'drop') {
    for (const pred of predictors) {
      const vals: number[] = [];
      for (const idx of rowIndicesTrain) {
        const v = dataset.numericRows[idx]?.[pred];
        if (v !== null && v !== undefined && Number.isFinite(v)) {
          vals.push(v);
        }
      }
      if (vals.length === 0) {
        imputationValues[pred] = 0;
      } else if (strategy === 'mean_train') {
        imputationValues[pred] = vals.reduce((a, b) => a + b, 0) / vals.length;
      } else {
        const sorted = [...vals].sort((a, b) => a - b);
        imputationValues[pred] = quantileSorted(sorted, 0.5);
      }
    }
  }

  const buildRows = (indices: number[], isTrain: boolean) => {
    const X: number[][] = [];
    const y: number[] = [];
    const keptIndices: number[] = [];
    let dropped = 0;

    for (const idx of indices) {
      const row = dataset.numericRows[idx];
      const yVal = row?.[dependentVar];
      // Dependent variable Y must never be imputed
      if (yVal === null || yVal === undefined || !Number.isFinite(yVal)) {
        dropped++;
        continue;
      }

      const xRow = [1]; // intercept
      let missingPred = false;
      for (const pred of predictors) {
        const val = row?.[pred];
        if (val === null || val === undefined || !Number.isFinite(val)) {
          if (strategy === 'drop') {
            missingPred = true;
            break;
          } else {
            xRow.push(imputationValues[pred]);
          }
        } else {
          xRow.push(val);
        }
      }

      if (missingPred) {
        dropped++;
        continue;
      }

      X.push(xRow);
      y.push(yVal);
      keptIndices.push(idx);
    }

    return { X, y, keptIndices, dropped, isTrain };
  };

  const trainData = buildRows(rowIndicesTrain, true);
  const testData = buildRows(rowIndicesTest, false);

  return {
    XTrain: trainData.X,
    yTrain: trainData.y,
    trainRowIndices: trainData.keptIndices,
    XTest: testData.X,
    yTest: testData.y,
    testRowIndices: testData.keptIndices,
    imputationValues,
    droppedTrainCount: trainData.dropped,
    droppedTestCount: testData.dropped,
  };
}

function computeMetrics(
  actual: number[],
  fitted: number[],
  numPredictors: number,
  isTrain: boolean
): MetricsSet {
  const n = actual.length;
  if (n === 0) {
    return {
      n: 0,
      r2: NaN,
      adjR2: NaN,
      rmse: NaN,
      mae: NaN,
      mse: NaN,
      mape: null,
      mapeValid: false,
      mapeReason: 'Sin observaciones suficientes',
      aic: NaN,
      bic: NaN,
    };
  }

  const meanY = actual.reduce((a, b) => a + b, 0) / n;
  let sse = 0;
  let sst = 0;
  let sae = 0;
  let zeroCount = 0;
  let apeSum = 0;

  for (let i = 0; i < n; i++) {
    const err = actual[i] - fitted[i];
    sse += err * err;
    sae += Math.abs(err);
    const dy = actual[i] - meanY;
    sst += dy * dy;
    if (Math.abs(actual[i]) < 1e-9) {
      zeroCount++;
    } else {
      apeSum += Math.abs(err / actual[i]);
    }
  }

  const mse = sse / n;
  const rmse = Math.sqrt(mse);
  const mae = sae / n;
  const r2 = sst > 1e-14 ? 1 - sse / sst : 0;
  const denomAdj = n - numPredictors - 1;
  const adjR2 = denomAdj > 0 ? 1 - ((1 - r2) * (n - 1)) / denomAdj : NaN;

  const k = numPredictors + 1; // parameters including intercept
  const safeSse = Math.max(sse, 1e-12);
  // Gaussian log-likelihood AIC / BIC (note: sigma^2 ML uses SSE/n, k+1 includes variance parameter or k params in statsmodels OLS)
  const aic = isTrain ? n * Math.log(safeSse / n) + 2 * k : NaN;
  const bic = isTrain ? n * Math.log(safeSse / n) + k * Math.log(n) : NaN;

  const mapeValid = zeroCount === 0;
  const mape = mapeValid ? (apeSum / n) * 100 : null;
  const mapeReason = mapeValid
    ? undefined
    : `No calculable: ${zeroCount} observación(es) con Y = 0 (división por cero).`;

  return {
    n,
    r2,
    adjR2,
    rmse,
    mae,
    mse,
    mape,
    mapeValid,
    mapeReason,
    aic,
    bic,
  };
}

function predictMatrix(X: number[][], beta: number[]): number[] {
  return X.map((row) => {
    let sum = 0;
    for (let j = 0; j < beta.length; j++) {
      sum += row[j] * beta[j];
    }
    return sum;
  });
}

function runInternalKFoldCV(
  dataset: Dataset,
  trainIndices: number[],
  dependentVar: string,
  predictors: string[],
  strategy: MissingStrategy,
  kFolds: number
): { cvRmse: number | null; cvR2: number | null; foldsUsed: number } {
  if (trainIndices.length < Math.max(10, predictors.length + 4) || kFolds < 2) {
    return { cvRmse: null, cvR2: null, foldsUsed: 0 };
  }

  const folds = Math.min(kFolds, Math.floor(trainIndices.length / Math.max(3, predictors.length + 2)));
  if (folds < 2) return { cvRmse: null, cvR2: null, foldsUsed: 0 };

  const foldSize = Math.floor(trainIndices.length / folds);
  const allActual: number[] = [];
  const allPred: number[] = [];

  for (let f = 0; f < folds; f++) {
    const start = f * foldSize;
    const end = f === folds - 1 ? trainIndices.length : (f + 1) * foldSize;
    const valIdx = trainIndices.slice(start, end);
    const trIdx = [...trainIndices.slice(0, start), ...trainIndices.slice(end)];

    const prep = prepareSplitMatrices(dataset, trIdx, valIdx, dependentVar, predictors, strategy);
    if (prep.XTrain.length <= predictors.length + 1 || prep.XTest.length === 0) {
      continue;
    }

    const ols = solveOLS(prep.XTrain, prep.yTrain);
    if (ols.singular) continue;

    const preds = predictMatrix(prep.XTest, ols.beta);
    for (let i = 0; i < prep.yTest.length; i++) {
      allActual.push(prep.yTest[i]);
      allPred.push(preds[i]);
    }
  }

  if (allActual.length < 3) return { cvRmse: null, cvR2: null, foldsUsed: 0 };
  const metrics = computeMetrics(allActual, allPred, predictors.length, false);
  return { cvRmse: metrics.rmse, cvR2: metrics.r2, foldsUsed: folds };
}

export function fitRegressionModel(
  dataset: Dataset,
  config: RegressionConfig,
  kind: ModelKind,
  label: string,
  predictors: string[],
  split?: { trainIndices: number[]; testIndices: number[] }
): RegressionModelResult {
  const id = `${kind}-${predictors.join('_')}`;
  const dependentVar = config.dependentVar;

  const invalid = (msg: string): RegressionModelResult => ({
    id,
    kind,
    label,
    dependentVar,
    predictors,
    equation: '',
    coefficients: [],
    trainMetrics: computeMetrics([], [], predictors.length, true),
    testMetrics: computeMetrics([], [], predictors.length, false),
    cvRmse: null,
    cvR2: null,
    cvFoldsUsed: 0,
    fStat: NaN,
    fPValue: NaN,
    dfModel: predictors.length,
    dfResid: 0,
    residualStdError: NaN,
    actualTrain: [],
    fittedTrain: [],
    residualsTrain: [],
    actualTest: [],
    fittedTest: [],
    residualsTest: [],
    testRowIndices: [],
    trainRowIndices: [],
    leverageTrain: [],
    stdResidualsTrain: [],
    cooksDTrain: [],
    xtxInverse: [],
    imputationValues: {},
    droppedTrainCount: 0,
    droppedTestCount: 0,
    warnings: [],
    isValid: false,
    errorMessage: msg,
  });

  if (!dependentVar) return invalid('Selecciona una variable dependiente (Y).');
  if (predictors.length === 0) return invalid('Selecciona al menos una variable independiente (X).');
  if (predictors.includes(dependentVar)) {
    return invalid('La variable dependiente (Y) no puede incluirse como predictora (X).');
  }

  const effectiveSplit =
    split ??
    splitRowIndices(
      dataset.numericRows.length,
      config.trainRatio,
      config.randomSeed,
      config.isOrderedData
    );

  const prep = prepareSplitMatrices(
    dataset,
    effectiveSplit.trainIndices,
    effectiveSplit.testIndices,
    dependentVar,
    predictors,
    config.missingStrategy
  );

  const nTrain = prep.XTrain.length;
  const p = predictors.length;
  const k = p + 1;

  if (nTrain <= k + 1) {
    return invalid(
      `Observaciones de entrenamiento insuficientes (${nTrain} válidas para ${k} parámetros). Reduce predictores, revisa nulos o ajusta el porcentaje de entrenamiento.`
    );
  }

  // Check zero variance in training predictors
  for (let j = 1; j <= p; j++) {
    const colVals = prep.XTrain.map((r) => r[j]);
    const minV = Math.min(...colVals);
    const maxV = Math.max(...colVals);
    if (Math.abs(maxV - minV) < 1e-12) {
      return invalid(
        `La variable "${predictors[j - 1]}" es constante en el conjunto de entrenamiento (varianza cero). Exclúyela del modelo.`
      );
    }
  }

  const ols = solveOLS(prep.XTrain, prep.yTrain);
  if (ols.singular) {
    return invalid(
      'Matriz singular o multicolinealidad perfecta detectada entre las variables independientes. Elimina columnas redundantes o altamente colineales.'
    );
  }

  const fittedTrain = predictMatrix(prep.XTrain, ols.beta);
  const residualsTrain = prep.yTrain.map((y, i) => y - fittedTrain[i]);

  const fittedTest = predictMatrix(prep.XTest, ols.beta);
  const residualsTest = prep.yTest.map((y, i) => y - fittedTest[i]);

  const dfModel = p;
  const dfResid = nTrain - k;
  const sseTrain = residualsTrain.reduce((a, r) => a + r * r, 0);
  const mseResid = sseTrain / dfResid;
  const residualStdError = Math.sqrt(mseResid);

  const meanYTrain = prep.yTrain.reduce((a, b) => a + b, 0) / nTrain;
  const sstTrain = prep.yTrain.reduce((a, y) => a + Math.pow(y - meanYTrain, 2), 0);
  const ssrTrain = Math.max(0, sstTrain - sseTrain);
  const fStat = mseResid > 1e-14 ? (ssrTrain / dfModel) / mseResid : NaN;
  const globalFPVal = Number.isFinite(fStat) ? fPValue(fStat, dfModel, dfResid) : NaN;

  // Compute sd(Y) and sd(X_j) for standardized betas
  const sdY = Math.sqrt(sstTrain / (nTrain - 1));
  const tCrit = tInv(0.975, dfResid);

  const coefNames = ['Intercepto (β₀)', ...predictors];
  const coefficients: CoefficientStat[] = ols.beta.map((est, j) => {
    const varBeta = Math.max(0, mseResid * ols.xtxInverse[j][j]);
    const se = Math.sqrt(varBeta);
    const tStat = se > 1e-14 ? est / se : NaN;
    const pValue = Number.isFinite(tStat) ? tPValueTwoTailed(tStat, dfResid) : NaN;
    const ciLower = est - tCrit * se;
    const ciUpper = est + tCrit * se;

    let stdBeta: number | null = null;
    if (j > 0 && sdY > 1e-12) {
      const meanXj = prep.XTrain.reduce((acc, r) => acc + r[j], 0) / nTrain;
      const ssX = prep.XTrain.reduce((acc, r) => acc + Math.pow(r[j] - meanXj, 2), 0);
      const sdX = Math.sqrt(ssX / (nTrain - 1));
      stdBeta = (est * sdX) / sdY;
    }

    return {
      name: coefNames[j],
      isIntercept: j === 0,
      estimate: est,
      stdError: se,
      tStat,
      pValue,
      ciLower,
      ciUpper,
      standardizedBeta: stdBeta,
      significant05: Number.isFinite(pValue) && pValue < 0.05,
    };
  });

  // Leverage, standardized residuals & Cook's Distance on training set
  const leverageTrain: number[] = new Array(nTrain).fill(0);
  const stdResidualsTrain: number[] = new Array(nTrain).fill(0);
  const cooksDTrain: number[] = new Array(nTrain).fill(0);

  for (let i = 0; i < nTrain; i++) {
    const xi = prep.XTrain[i];
    let hii = 0;
    for (let a = 0; a < k; a++) {
      let rowDot = 0;
      for (let b = 0; b < k; b++) {
        rowDot += ols.xtxInverse[a][b] * xi[b];
      }
      hii += xi[a] * rowDot;
    }
    hii = Math.max(0, Math.min(0.999999, hii));
    leverageTrain[i] = hii;

    const denom = residualStdError * Math.sqrt(Math.max(1e-8, 1 - hii));
    const stdRes = denom > 1e-12 ? residualsTrain[i] / denom : 0;
    stdResidualsTrain[i] = stdRes;
    cooksDTrain[i] = ((stdRes * stdRes) / k) * (hii / Math.max(1e-8, 1 - hii));
  }

  const trainMetrics = computeMetrics(prep.yTrain, fittedTrain, p, true);
  const testMetrics = computeMetrics(prep.yTest, fittedTest, p, false);

  const cv = runInternalKFoldCV(
    dataset,
    effectiveSplit.trainIndices,
    dependentVar,
    predictors,
    config.missingStrategy,
    config.cvFolds
  );

  // Build readable mathematical equation
  const interceptStr = ols.beta[0].toFixed(4);
  const terms = predictors.map((pred, idx) => {
    const b = ols.beta[idx + 1];
    const sign = b >= 0 ? ' + ' : ' - ';
    return `${sign}${Math.abs(b).toFixed(4)}·(${pred})`;
  });
  const equation = `${dependentVar} = ${interceptStr}${terms.join('')}`;

  const warnings: string[] = [];
  if (nTrain < p * 10) {
    warnings.push(
      `Relación observaciones/predictores ajustada (${nTrain} filas de entrenamiento para ${p} variables). Riesgo de sobreajuste.`
    );
  }
  if (prep.droppedTrainCount > 0 || prep.droppedTestCount > 0) {
    warnings.push(
      `Se excluyeron ${prep.droppedTrainCount} fila(s) en entrenamiento y ${prep.droppedTestCount} en prueba por valores faltantes en Y o predictores.`
    );
  }
  if (Number.isFinite(testMetrics.r2) && trainMetrics.r2 - testMetrics.r2 > 0.15) {
    warnings.push(
      `Brecha relevante entre R² de entrenamiento (${(trainMetrics.r2 * 100).toFixed(1)}%) y prueba (${(testMetrics.r2 * 100).toFixed(1)}%), indicativo de posible sobreajuste o heterogeneidad muestral.`
    );
  }

  return {
    id,
    kind,
    label,
    dependentVar,
    predictors,
    equation,
    coefficients,
    trainMetrics,
    testMetrics,
    cvRmse: cv.cvRmse,
    cvR2: cv.cvR2,
    cvFoldsUsed: cv.foldsUsed,
    fStat,
    fPValue: globalFPVal,
    dfModel,
    dfResid,
    residualStdError,
    actualTrain: prep.yTrain,
    fittedTrain,
    residualsTrain,
    actualTest: prep.yTest,
    fittedTest,
    residualsTest,
    testRowIndices: prep.testRowIndices,
    trainRowIndices: prep.trainRowIndices,
    leverageTrain,
    stdResidualsTrain,
    cooksDTrain,
    xtxInverse: ols.xtxInverse,
    imputationValues: prep.imputationValues,
    droppedTrainCount: prep.droppedTrainCount,
    droppedTestCount: prep.droppedTestCount,
    warnings,
    isValid: true,
  };
}

// ============================================================================
// MODULE 8: DIAGNOSTICS & ASSUMPTIONS
// ============================================================================

export function computeDiagnostics(
  dataset: Dataset,
  config: RegressionConfig,
  model: RegressionModelResult
): DiagnosticsResult {
  const n = model.residualsTrain.length;
  const p = model.predictors.length;
  const e = model.residualsTrain;

  // 1. Jarque-Bera Normality Test on training residuals
  const meanE = e.reduce((a, b) => a + b, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const val of e) {
    const d = val - meanE;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  const s2 = m2 / n;
  const skewness = s2 > 1e-14 ? (m3 / n) / Math.pow(s2, 1.5) : 0;
  const excessKurtosis = s2 > 1e-14 ? (m4 / n) / (s2 * s2) - 3 : 0;
  const jbStat = (n / 6) * (skewness * skewness + (excessKurtosis * excessKurtosis) / 4);
  const jbPVal = chi2PValue(jbStat, 2);
  const jbPassed = jbPVal >= 0.05;

  // 2. Breusch-Pagan Homoscedasticity Test (regress e_i^2 on X_train)
  const split = splitRowIndices(
    dataset.numericRows.length,
    config.trainRatio,
    config.randomSeed,
    config.isOrderedData
  );
  const prep = prepareSplitMatrices(
    dataset,
    split.trainIndices,
    split.testIndices,
    model.dependentVar,
    model.predictors,
    config.missingStrategy
  );

  const eSq = e.map((r) => r * r);
  const bpOls = solveOLS(prep.XTrain, eSq);
  let bpStat = 0;
  let bpPVal = 1;
  if (!bpOls.singular) {
    const fittedESq = predictMatrix(prep.XTrain, bpOls.beta);
    const bpMetrics = computeMetrics(eSq, fittedESq, p, true);
    bpStat = Math.max(0, n * bpMetrics.r2);
    bpPVal = chi2PValue(bpStat, p);
  }
  const bpPassed = bpPVal >= 0.05;

  // 3. Durbin-Watson Autocorrelation (only valid when data has meaningful sequence/time order!)
  let dwNum = 0;
  let dwDen = 0;
  for (let i = 0; i < n; i++) {
    dwDen += e[i] * e[i];
    if (i > 0) {
      const diff = e[i] - e[i - 1];
      dwNum += diff * diff;
    }
  }
  const dwStat = dwDen > 1e-14 ? dwNum / dwDen : 2;
  const dwApplicable = config.isOrderedData;
  let dwInterp = '';
  if (!dwApplicable) {
    dwInterp =
      'Datos transversales sin orden secuencial declarado: el estadístico Durbin-Watson no debe interpretarse como prueba formal de autocorrelación temporal.';
  } else if (dwStat < 1.5) {
    dwInterp = `Posible autocorrelación positiva (DW = ${dwStat.toFixed(3)} < 1.50). Los errores consecutivos muestran dependencia serial.`;
  } else if (dwStat > 2.5) {
    dwInterp = `Posible autocorrelación negativa (DW = ${dwStat.toFixed(3)} > 2.50).`;
  } else {
    dwInterp = `Sin evidencia marcada de autocorrelación de primer orden (DW = ${dwStat.toFixed(3)}, cercano a 2.0).`;
  }

  // 4. VIF for Multiple Regression (when p >= 2)
  const vif: VifEntry[] = [];
  if (p >= 2) {
    for (let j = 0; j < p; j++) {
      const targetCol = prep.XTrain.map((row) => row[j + 1]);
      const otherX = prep.XTrain.map((row) => {
        const r = [1];
        for (let m = 0; m < p; m++) {
          if (m !== j) r.push(row[m + 1]);
        }
        return r;
      });
      const auxOls = solveOLS(otherX, targetCol);
      let vifVal = Infinity;
      let r2Aux = 1;
      if (!auxOls.singular) {
        const predAux = predictMatrix(otherX, auxOls.beta);
        const mAux = computeMetrics(targetCol, predAux, p - 1, true);
        r2Aux = Math.max(0, Math.min(0.999999, mAux.r2));
        vifVal = 1 / Math.max(1e-6, 1 - r2Aux);
      }
      const status: VifEntry['status'] =
        vifVal >= 10 ? 'Severo (>= 10)' : vifVal >= 5 ? 'Moderado (5 - 10)' : 'Óptimo (< 5)';
      vif.push({
        variable: model.predictors[j],
        vif: vifVal,
        r2Aux,
        status,
      });
    }
  } else if (p === 1) {
    vif.push({
      variable: model.predictors[0],
      vif: 1,
      r2Aux: 0,
      status: 'Óptimo (< 5)',
    });
  }

  const maxVif = vif.length > 0 ? Math.max(...vif.map((v) => v.vif)) : null;

  // 5. Influential Points (Cook's D > 4/n or |stdRes| > 3 or leverage > 2*(p+1)/n)
  const cooksThreshold = 4 / n;
  const leverageThreshold = (2 * (p + 1)) / n;
  const influentialPoints: InfluentialPoint[] = [];

  for (let i = 0; i < n; i++) {
    const reasons: string[] = [];
    if (model.cooksDTrain[i] > cooksThreshold) {
      reasons.push(`Distancia de Cook (${model.cooksDTrain[i].toFixed(3)} > ${cooksThreshold.toFixed(3)})`);
    }
    if (Math.abs(model.stdResidualsTrain[i]) > 3) {
      reasons.push(`Residuo estandarizado extremo (${model.stdResidualsTrain[i].toFixed(2)})`);
    }
    if (model.leverageTrain[i] > leverageThreshold) {
      reasons.push(`Alto apalancamiento (${model.leverageTrain[i].toFixed(3)} > ${leverageThreshold.toFixed(3)})`);
    }
    if (reasons.length > 0) {
      influentialPoints.push({
        trainIndex: i,
        originalRowIndex: model.trainRowIndices[i],
        actual: model.actualTrain[i],
        fitted: model.fittedTrain[i],
        residual: model.residualsTrain[i],
        stdResidual: model.stdResidualsTrain[i],
        leverage: model.leverageTrain[i],
        cooksD: model.cooksDTrain[i],
        reasons,
      });
    }
  }
  influentialPoints.sort((a, b) => b.cooksD - a.cooksD);

  const alerts: DiagnosticAlert[] = [
    {
      assumption: 'Normalidad de residuos (Jarque-Bera)',
      status: jbPassed ? 'Cumple' : 'Incumple',
      summary: `JB = ${jbStat.toFixed(3)} (p = ${jbPVal < 0.0001 ? '< 0.0001' : jbPVal.toFixed(4)})`,
      detail: jbPassed
        ? 'No se rechaza la hipótesis nula de normalidad en los residuos de entrenamiento. Los intervalos de confianza y pruebas t son confiables.'
        : `Se detecta desviación respecto a la normalidad (asimetría = ${skewness.toFixed(2)}, curtosis en exceso = ${excessKurtosis.toFixed(2)}). Con muestras grandes el TLC mitiga el impacto sobre las medias, pero los intervalos de predicción pueden perder exactitud.`,
    },
    {
      assumption: 'Homocedasticidad (Breusch-Pagan)',
      status: bpPassed ? 'Cumple' : 'Incumple',
      summary: `LM = ${bpStat.toFixed(3)} (p = ${bpPVal < 0.0001 ? '< 0.0001' : bpPVal.toFixed(4)})`,
      detail: bpPassed
        ? 'La varianza de los errores parece aproximadamente constante a lo largo de los valores predichos.'
        : 'Evidencia de heterocedasticidad (varianza no constante del error). Los coeficientes OLS siguen siendo insesgados, pero los errores estándar y valores p clásicos pueden estar sesgados.',
    },
    {
      assumption: 'Independencia de errores (Durbin-Watson)',
      status: !dwApplicable ? 'No aplica' : dwStat >= 1.5 && dwStat <= 2.5 ? 'Cumple' : 'Precaución',
      summary: `DW = ${dwStat.toFixed(3)}`,
      detail: dwInterp,
    },
    {
      assumption: 'No multicolinealidad (VIF)',
      status:
        p < 2
          ? 'Cumple'
          : (maxVif ?? 1) >= 10
            ? 'Incumple'
            : (maxVif ?? 1) >= 5
              ? 'Precaución'
              : 'Cumple',
      summary: p < 2 ? 'No aplica (1 predictor)' : `VIF máximo = ${(maxVif ?? 1).toFixed(2)}`,
      detail:
        p < 2
          ? 'En regresión lineal simple no existe colinealidad entre predictores.'
          : (maxVif ?? 1) >= 10
            ? 'Multicolinealidad severa (VIF >= 10): los errores estándar de los coeficientes afectados están inflados y sus signos pueden volverse inestables.'
            : (maxVif ?? 1) >= 5
              ? 'Multicolinealidad moderada (5 <= VIF < 10): vigila la estabilidad de los coeficientes.'
              : 'Todos los predictores mantienen VIF < 5, indicando colinealidad baja y estimaciones estables.',
    },
    {
      assumption: 'Observaciones influyentes (Distancia de Cook)',
      status: influentialPoints.length === 0 ? 'Cumple' : influentialPoints.length > n * 0.08 ? 'Incumple' : 'Precaución',
      summary: `${influentialPoints.length} observación(es) atípica(s) / influyente(s)`,
      detail:
        influentialPoints.length === 0
          ? `Ninguna observación supera simultáneamente los umbrales de Cook (${cooksThreshold.toFixed(3)}) ni residuos extremos.`
          : `Se detectaron ${influentialPoints.length} punto(s) por encima de los umbrales de diagnóstico (D > ${cooksThreshold.toFixed(3)} o apalancamiento > ${leverageThreshold.toFixed(3)}). Conviene inspeccionarlos para descartar errores de registro.`,
    },
  ];

  return {
    modelId: model.id,
    modelLabel: model.label,
    normalityJB: {
      statistic: jbStat,
      pValue: jbPVal,
      skewness,
      excessKurtosis,
      passed: jbPassed,
      interpretation: alerts[0].detail,
    },
    homoscedasticityBP: {
      statistic: bpStat,
      df: p,
      pValue: bpPVal,
      passed: bpPassed,
      interpretation: alerts[1].detail,
    },
    durbinWatson: {
      statistic: dwStat,
      applicable: dwApplicable,
      interpretation: dwInterp,
      caveat:
        'Durbin-Watson depende estrictamente del orden de las filas. Si tu base de datos es de corte transversal (ej. clientes o sucursales sin secuencia temporal), el ordenamiento es arbitrario y el estadístico no evalúa independencia real.',
    },
    vif,
    maxVif,
    influentialPoints: influentialPoints.slice(0, 25),
    cooksThreshold,
    leverageThreshold,
    alerts,
  };
}

// ============================================================================
// MODULE 10: AUTOMATIC VARIABLE SELECTION (STRICTLY ON TRAINING SPLIT)
// ============================================================================

export function runAutomaticVariableSelection(
  dataset: Dataset,
  config: RegressionConfig,
  candidatePool: string[]
): AutoSelectionResult {
  const split = splitRowIndices(
    dataset.numericRows.length,
    config.trainRatio,
    config.randomSeed,
    config.isOrderedData
  );

  // Filter valid non-constant candidates != dependentVar
  const candidates = candidatePool.filter((c) => c !== config.dependentVar);

  const evalSubsetOnTrain = (preds: string[]) => {
    if (preds.length === 0) {
      // Null model (intercept only) on train
      const prep = prepareSplitMatrices(
        dataset,
        split.trainIndices,
        split.testIndices,
        config.dependentVar,
        [],
        config.missingStrategy
      );
      const n = prep.yTrain.length;
      if (n < 4) return null;
      const meanY = prep.yTrain.reduce((a, b) => a + b, 0) / n;
      const fitted = new Array(n).fill(meanY);
      const m = computeMetrics(prep.yTrain, fitted, 0, true);
      return { aic: m.aic, bic: m.bic, adjR2: 0, r2: 0, trainRmse: m.rmse, pValues: {} as Record<string, number> };
    }

    const res = fitRegressionModel(dataset, config, 'multiple', 'temp', preds, split);
    if (!res.isValid) return null;
    const pValues: Record<string, number> = {};
    for (const c of res.coefficients) {
      if (!c.isIntercept) pValues[c.name] = c.pValue;
    }
    return {
      aic: res.trainMetrics.aic,
      bic: res.trainMetrics.bic,
      adjR2: res.trainMetrics.adjR2,
      r2: res.trainMetrics.r2,
      trainRmse: res.trainMetrics.rmse,
      pValues,
    };
  };

  // 1. FORWARD SELECTION (criterion: lowest p-value < 0.05 & AIC improvement)
  const forwardSteps: StepwiseStep[] = [];
  let currentFwd: string[] = [];
  const baseEval = evalSubsetOnTrain([]);
  if (baseEval) {
    forwardSteps.push({
      step: 0,
      action: 'Inicio',
      variable: null,
      aic: baseEval.aic,
      bic: baseEval.bic,
      adjR2: baseEval.adjR2,
      pValueAction: null,
      predictorsAfter: [],
    });
  }

  let stepNum = 1;
  while (currentFwd.length < candidates.length) {
    let bestVar: string | null = null;
    let bestP = 1;
    let bestMetrics: ReturnType<typeof evalSubsetOnTrain> = null;

    for (const v of candidates) {
      if (currentFwd.includes(v)) continue;
      const trial = evalSubsetOnTrain([...currentFwd, v]);
      if (!trial) continue;
      const pVal = trial.pValues[v] ?? 1;
      if (pVal < bestP) {
        bestP = pVal;
        bestVar = v;
        bestMetrics = trial;
      }
    }

    if (bestVar && bestMetrics && bestP <= 0.05) {
      currentFwd = [...currentFwd, bestVar];
      forwardSteps.push({
        step: stepNum++,
        action: 'Agregar',
        variable: bestVar,
        aic: bestMetrics.aic,
        bic: bestMetrics.bic,
        adjR2: bestMetrics.adjR2,
        pValueAction: bestP,
        predictorsAfter: [...currentFwd],
      });
    } else {
      break;
    }
  }
  if (currentFwd.length === 0 && candidates.length > 0) {
    // Fallback to single lowest p-value predictor so user still sees comparative fit
    let bestSingle = candidates[0];
    let bestP = 1;
    for (const v of candidates) {
      const tr = evalSubsetOnTrain([v]);
      if (tr && (tr.pValues[v] ?? 1) < bestP) {
        bestP = tr.pValues[v] ?? 1;
        bestSingle = v;
      }
    }
    currentFwd = [bestSingle];
  }
  const forwardModel =
    currentFwd.length > 0
      ? fitRegressionModel(
          dataset,
          config,
          'stepwise_forward',
          'Stepwise Forward',
          currentFwd,
          split
        )
      : null;

  // 2. BACKWARD ELIMINATION (criterion: drop highest p-value > 0.05)
  const backwardSteps: StepwiseStep[] = [];
  let currentBwd = [...candidates];
  const initBwd = evalSubsetOnTrain(currentBwd);
  if (initBwd) {
    backwardSteps.push({
      step: 0,
      action: 'Inicio',
      variable: null,
      aic: initBwd.aic,
      bic: initBwd.bic,
      adjR2: initBwd.adjR2,
      pValueAction: null,
      predictorsAfter: [...currentBwd],
    });
  }

  let bwdStep = 1;
  while (currentBwd.length > 1) {
    const currEval = evalSubsetOnTrain(currentBwd);
    if (!currEval) break;
    let worstVar: string | null = null;
    let worstP = -1;
    for (const v of currentBwd) {
      const pVal = currEval.pValues[v] ?? 1;
      if (pVal > worstP) {
        worstP = pVal;
        worstVar = v;
      }
    }
    if (worstVar && worstP > 0.05) {
      currentBwd = currentBwd.filter((v) => v !== worstVar);
      const afterEval = evalSubsetOnTrain(currentBwd);
      if (afterEval) {
        backwardSteps.push({
          step: bwdStep++,
          action: 'Eliminar',
          variable: worstVar,
          aic: afterEval.aic,
          bic: afterEval.bic,
          adjR2: afterEval.adjR2,
          pValueAction: worstP,
          predictorsAfter: [...currentBwd],
        });
      }
    } else {
      break;
    }
  }
  const backwardModel =
    currentBwd.length > 0
      ? fitRegressionModel(
          dataset,
          config,
          'stepwise_backward',
          'Stepwise Backward',
          currentBwd,
          split
        )
      : null;

  // 3. BIDIRECTIONAL STEPWISE (AIC-guided forward + backward pruning on train)
  const bidirSteps: StepwiseStep[] = [];
  let currentBidir: string[] = [];
  let currentAic = baseEval?.aic ?? Infinity;
  if (baseEval) {
    bidirSteps.push({
      step: 0,
      action: 'Inicio',
      variable: null,
      aic: baseEval.aic,
      bic: baseEval.bic,
      adjR2: baseEval.adjR2,
      pValueAction: null,
      predictorsAfter: [],
    });
  }

  let biStep = 1;
  for (let iter = 0; iter < candidates.length * 2; iter++) {
    let improved = false;

    // Try adding best AIC reducer
    let bestAddVar: string | null = null;
    let bestAddAic = currentAic - 1e-6;
    let bestAddEval: ReturnType<typeof evalSubsetOnTrain> = null;

    for (const v of candidates) {
      if (currentBidir.includes(v)) continue;
      const tr = evalSubsetOnTrain([...currentBidir, v]);
      if (tr && tr.aic < bestAddAic) {
        bestAddAic = tr.aic;
        bestAddVar = v;
        bestAddEval = tr;
      }
    }

    if (bestAddVar && bestAddEval) {
      currentBidir = [...currentBidir, bestAddVar];
      currentAic = bestAddAic;
      improved = true;
      bidirSteps.push({
        step: biStep++,
        action: 'Agregar',
        variable: bestAddVar,
        aic: bestAddEval.aic,
        bic: bestAddEval.bic,
        adjR2: bestAddEval.adjR2,
        pValueAction: bestAddEval.pValues[bestAddVar] ?? null,
        predictorsAfter: [...currentBidir],
      });
    }

    // Try removing any variable that improves AIC (or has p > 0.10 and improves AIC)
    if (currentBidir.length > 1) {
      let bestDropVar: string | null = null;
      let bestDropAic = currentAic - 1e-6;
      let bestDropEval: ReturnType<typeof evalSubsetOnTrain> = null;

      for (const v of currentBidir) {
        const nextSet = currentBidir.filter((x) => x !== v);
        const tr = evalSubsetOnTrain(nextSet);
        if (tr && tr.aic < bestDropAic) {
          bestDropAic = tr.aic;
          bestDropVar = v;
          bestDropEval = tr;
        }
      }

      if (bestDropVar && bestDropEval) {
        const prevEval = evalSubsetOnTrain(currentBidir);
        currentBidir = currentBidir.filter((x) => x !== bestDropVar);
        currentAic = bestDropAic;
        improved = true;
        bidirSteps.push({
          step: biStep++,
          action: 'Eliminar',
          variable: bestDropVar,
          aic: bestDropEval.aic,
          bic: bestDropEval.bic,
          adjR2: bestDropEval.adjR2,
          pValueAction: prevEval?.pValues[bestDropVar] ?? null,
          predictorsAfter: [...currentBidir],
        });
      }
    }

    if (!improved) break;
  }

  if (currentBidir.length === 0 && currentFwd.length > 0) {
    currentBidir = [...currentFwd];
  }

  const bidirectionalModel =
    currentBidir.length > 0
      ? fitRegressionModel(
          dataset,
          config,
          'stepwise_bidirectional',
          'Stepwise Bidireccional (AIC)',
          currentBidir,
          split
        )
      : null;

  // 4. BEST SUBSETS REGRESSION (cap at 10 predictors to keep UI responsive < 1024 subsets)
  let subsetPool = [...candidates];
  let truncatedPredictors = false;
  if (subsetPool.length > 10) {
    truncatedPredictors = true;
    // Rank by single-predictor R2 on training split (never test!)
    const ranked = subsetPool
      .map((v) => ({ v, r2: evalSubsetOnTrain([v])?.r2 ?? 0 }))
      .sort((a, b) => b.r2 - a.r2);
    subsetPool = ranked.slice(0, 10).map((r) => r.v);
  }

  const m = subsetPool.length;
  const totalSubsets = (1 << m) - 1;
  const allCandidates: SubsetCandidate[] = [];

  for (let mask = 1; mask <= totalSubsets; mask++) {
    const preds: string[] = [];
    for (let bit = 0; bit < m; bit++) {
      if (mask & (1 << bit)) preds.push(subsetPool[bit]);
    }
    const ev = evalSubsetOnTrain(preds);
    if (!ev || !Number.isFinite(ev.bic)) continue;
    allCandidates.push({
      predictors: preds,
      k: preds.length,
      r2: ev.r2,
      adjR2: ev.adjR2,
      aic: ev.aic,
      bic: ev.bic,
      trainRmse: ev.trainRmse,
      cvRmse: null,
    });
  }

  // Sort by BIC ascending and keep top 12, enriching top 6 with training CV-RMSE
  allCandidates.sort((a, b) => a.bic - b.bic);
  const topCandidates = allCandidates.slice(0, 12);
  for (let i = 0; i < Math.min(6, topCandidates.length); i++) {
    const cv = runInternalKFoldCV(
      dataset,
      split.trainIndices,
      config.dependentVar,
      topCandidates[i].predictors,
      config.missingStrategy,
      config.cvFolds
    );
    topCandidates[i].cvRmse = cv.cvRmse;
  }

  const bestBicSubset = allCandidates[0];
  const bestAdjR2Subset = [...allCandidates].sort((a, b) => b.adjR2 - a.adjR2)[0];

  const bestByBic = bestBicSubset
    ? fitRegressionModel(
        dataset,
        config,
        'best_subset',
        'Best Subset (Mínimo BIC)',
        bestBicSubset.predictors,
        split
      )
    : null;

  const bestByAdjR2 = bestAdjR2Subset
    ? fitRegressionModel(
        dataset,
        config,
        'best_subset',
        'Best Subset (Máximo R² Ajustado)',
        bestAdjR2Subset.predictors,
        split
      )
    : null;

  return {
    forward: { steps: forwardSteps, model: forwardModel },
    backward: { steps: backwardSteps, model: backwardModel },
    bidirectional: { steps: bidirSteps, model: bidirectionalModel },
    bestSubsets: {
      evaluatedCount: allCandidates.length,
      truncatedPredictors,
      candidates: topCandidates,
      bestByAdjR2,
      bestByBic,
    },
  };
}

// ============================================================================
// MODULE 11: INDIVIDUAL PREDICTION WITH CI & PI
// ============================================================================

export function computeIndividualPrediction(
  dataset: Dataset,
  config: RegressionConfig,
  model: RegressionModelResult,
  inputValues: Record<string, number>,
  confidenceLevel = 0.95
): IndividualPredictionResult {
  const x0 = [1, ...model.predictors.map((p) => inputValues[p])];
  let predicted = 0;
  for (let j = 0; j < model.coefficients.length; j++) {
    predicted += model.coefficients[j].estimate * x0[j];
  }

  // Compute leverage x0^T (X^T X)^-1 x0
  const k = x0.length;
  let h0 = 0;
  for (let a = 0; a < k; a++) {
    let dot = 0;
    for (let b = 0; b < k; b++) {
      dot += model.xtxInverse[a][b] * x0[b];
    }
    h0 += x0[a] * dot;
  }
  h0 = Math.max(0, h0);

  const s = model.residualStdError;
  const seMean = s * Math.sqrt(h0);
  const sePred = s * Math.sqrt(1 + h0);
  const alpha = 1 - confidenceLevel;
  const tCrit = tInv(1 - alpha / 2, model.dfResid);

  // Check extrapolation relative to training split
  const split = splitRowIndices(
    dataset.numericRows.length,
    config.trainRatio,
    config.randomSeed,
    config.isOrderedData
  );
  const outOfRange: string[] = [];
  for (const pred of model.predictors) {
    const vals: number[] = [];
    for (const idx of split.trainIndices) {
      const v = dataset.numericRows[idx]?.[pred];
      if (v !== null && v !== undefined && Number.isFinite(v)) vals.push(v);
    }
    if (vals.length > 0) {
      const minV = Math.min(...vals);
      const maxV = Math.max(...vals);
      const val = inputValues[pred];
      if (val < minV || val > maxV) {
        outOfRange.push(`${pred} (${val} fuera de [${formatNum(minV, 2)}, ${formatNum(maxV, 2)}])`);
      }
    }
  }

  return {
    predicted,
    seMean,
    sePred,
    ciLower: predicted - tCrit * seMean,
    ciUpper: predicted + tCrit * seMean,
    piLower: predicted - tCrit * sePred,
    piUpper: predicted + tCrit * sePred,
    confidenceLevel,
    extrapolationWarning:
      outOfRange.length > 0
        ? `Extrapolación detectada en: ${outOfRange.join(', ')}. La linealidad fuera del rango observado puede no sostenerse.`
        : null,
  };
}

// ============================================================================
// MODULE 6 & 12: AUTOMATED STATISTICAL INTERPRETATION & RECOMMENDATION
// ============================================================================

export function buildModelAutoInterpretation(model: RegressionModelResult): string[] {
  if (!model.isValid) return ['El modelo no pudo estimarse con la configuración actual.'];

  const lines: string[] = [];
  const r2Pct = (model.trainMetrics.r2 * 100).toFixed(2);
  const adjR2Pct = (model.trainMetrics.adjR2 * 100).toFixed(2);
  const testR2Pct = Number.isFinite(model.testMetrics.r2)
    ? (model.testMetrics.r2 * 100).toFixed(2)
    : 'N/A';

  lines.push(
    `Capacidad explicativa y global: El modelo explica el ${r2Pct}% de la variabilidad observada de "${model.dependentVar}" en el conjunto de entrenamiento (R² ajustado = ${adjR2Pct}%). En el conjunto de prueba independiente, alcanza un R² de ${testR2Pct}% con un RMSE de ${formatNum(model.testMetrics.rmse, 4)}.`
  );

  if (model.fPValue < 0.05) {
    lines.push(
      `Significancia conjunta: El estadístico F = ${formatNum(model.fStat, 3)} (p = ${model.fPValue < 0.0001 ? '< 0.0001' : model.fPValue.toFixed(4)}) rechaza la hipótesis nula conjunta; al menos uno de los predictores aporta asociación lineal estadísticamente significativa.`
    );
  } else {
    lines.push(
      `Significancia conjunta: El estadístico F = ${formatNum(model.fStat, 3)} (p = ${model.fPValue.toFixed(4)}) no alcanza significancia al 5%; el modelo en bloque no supera de forma estadísticamente concluyente a una predicción constante basada en la media.`
    );
  }

  const sigPreds = model.coefficients.filter((c) => !c.isIntercept && c.significant05);
  const nonSigPreds = model.coefficients.filter((c) => !c.isIntercept && !c.significant05);

  for (const c of model.coefficients.filter((x) => !x.isIntercept)) {
    const dir = c.estimate >= 0 ? 'incremento' : 'disminución';
    const sigText = c.significant05
      ? `estadísticamente significativo (p = ${c.pValue < 0.0001 ? '< 0.0001' : c.pValue.toFixed(4)})`
      : `no significativo estadísticamente al 5% (p = ${c.pValue.toFixed(4)})`;
    const ceteris =
      model.predictors.length > 1 ? ', manteniendo constantes las demás variables del modelo' : '';
    lines.push(
      `• ${c.name}: Por cada unidad adicional en "${c.name}", "${model.dependentVar}" se asocia en promedio con un ${dir} de ${formatNum(Math.abs(c.estimate), 4)} unidades${ceteris}. Este efecto parcial es ${sigText}.`
    );
  }

  if (nonSigPreds.length > 0 && sigPreds.length > 0) {
    lines.push(
      `Nota de parsimonia: ${nonSigPreds.map((x) => x.name).join(', ')} no resulta(n) significativa(s) individualmente al 5%, por lo que conviene evaluar modelos reducidos mediante selección de variables.`
    );
  }

  lines.push(
    'Advertencia metodológica: La significancia estadística (p < 0.05) indica evidencia contra la hipótesis nula de coeficiente cero, pero no equivale automáticamente a relevancia práctica ni demuestra causalidad directa entre X e Y.'
  );

  return lines;
}

export function generateGlobalAutomatedInterpretation(
  dataset: Dataset,
  models: RegressionModelResult[],
  diagnosticsMap: Record<string, DiagnosticsResult>
): AutomatedInterpretation {
  const validModels = models.filter((m) => m.isValid);
  const q = dataset.quality;

  // Score models using balanced econometric criteria (NOT blindly highest train R2!)
  const scored = validModels.map((m) => {
    const diag = diagnosticsMap[m.id];
    const testRmse = Number.isFinite(m.testMetrics.rmse) ? m.testMetrics.rmse : m.trainMetrics.rmse;
    const adjR2 = Number.isFinite(m.trainMetrics.adjR2) ? m.trainMetrics.adjR2 : 0;
    const overfitGap = Math.max(0, m.trainMetrics.r2 - (Number.isFinite(m.testMetrics.r2) ? m.testMetrics.r2 : m.trainMetrics.r2));

    let penalty = 0;
    if (overfitGap > 0.1) penalty += overfitGap * 2.5;
    if (diag) {
      if ((diag.maxVif ?? 1) >= 10) penalty += 0.25;
      else if ((diag.maxVif ?? 1) >= 5) penalty += 0.08;
      if (!diag.homoscedasticityBP.passed) penalty += 0.08;
      if (!diag.normalityJB.passed) penalty += 0.05;
    }
    const nonSigCount = m.coefficients.filter((c) => !c.isIntercept && !c.significant05).length;
    penalty += nonSigCount * 0.04;
    if (m.fPValue >= 0.05) penalty += 0.4;

    // Normalize RMSE relative to mean test RMSE across valid models
    return { model: m, testRmse, adjR2, overfitGap, penalty };
  });

  const minTestRmse =
    scored.length > 0 ? Math.min(...scored.map((s) => Math.max(1e-9, s.testRmse))) : 1;

  const ranked = scored
    .map((s) => {
      const relRmsePenalty = (s.testRmse / minTestRmse - 1) * 0.9;
      const bicList = scored.map((x) => x.model.trainMetrics.bic).filter(Number.isFinite);
      const minBic = bicList.length > 0 ? Math.min(...bicList) : 0;
      const bicDelta = Number.isFinite(s.model.trainMetrics.bic)
        ? Math.min(0.3, Math.max(0, (s.model.trainMetrics.bic - minBic) / Math.max(50, Math.abs(minBic))))
        : 0;
      const compositeScore = s.adjR2 - relRmsePenalty - bicDelta - s.penalty;
      return { ...s, compositeScore };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const winner = ranked[0]?.model ?? null;
  const winnerDiag = winner ? diagnosticsMap[winner.id] : undefined;

  const simpleModel = validModels.find((m) => m.kind === 'simple');
  const multipleModel = validModels.find((m) => m.kind === 'multiple');

  const sections: AutomatedInterpretation['sections'] = [
    {
      number: 1,
      title: 'Calidad y características de la base de datos',
      content: [
        `El archivo "${dataset.fileName}" (${dataset.fileFormat}) contiene ${q.totalRows} observaciones y ${q.totalCols} columnas, clasificado en el sector económico "${dataset.sector.activeSector}".`,
        `Se identificaron ${q.numericColsCount} variables numéricas, ${q.categoricalColsCount} categóricas y ${q.textColsCount} de texto libre. El porcentaje global de celdas faltantes es ${q.totalNullPct.toFixed(2)}% y se detectaron ${q.duplicateRows} fila(s) duplicada(s).`,
      ],
    },
    {
      number: 2,
      title: 'Comportamiento de las variables',
      content: [
        `De las ${dataset.columns.length} columnas totales, ${dataset.columns.filter((c) => c.included).length} fueron habilitadas para el flujo estadístico y predictivo.`,
        q.constantColumns.length > 0
          ? `Se detectaron columnas sin varianza (${q.constantColumns.join(', ')}), las cuales no aportan señal explicativa en regresión.`
          : 'Las variables numéricas activas presentan dispersión válida para estimación estadística.',
      ],
    },
    {
      number: 3,
      title: 'Relaciones entre variables independientes y dependiente',
      content: [
        winner
          ? `Respecto a la variable objetivo "${winner.dependentVar}", las relaciones lineales parciales estimadas reflejan asociaciones direccionales controladas dentro del espacio de predictores (${winner.predictors.join(', ')}).`
          : 'Ejecuta al menos un modelo de regresión para evaluar las relaciones lineales con Y.',
      ],
    },
    {
      number: 4,
      title: 'Resultados de la regresión',
      content: validModels.map(
        (m) =>
          `${m.label}: R² entren. = ${(m.trainMetrics.r2 * 100).toFixed(2)}%, R² ajust. = ${(m.trainMetrics.adjR2 * 100).toFixed(2)}%, RMSE prueba = ${formatNum(m.testMetrics.rmse, 4)}, AIC = ${formatNum(m.trainMetrics.aic, 2)}, BIC = ${formatNum(m.trainMetrics.bic, 2)}.`
      ),
    },
    {
      number: 5,
      title: 'Significancia estadística vs. relevancia práctica',
      content: [
        winner
          ? `En "${winner.label}", ${winner.coefficients.filter((c) => !c.isIntercept && c.significant05).length} de ${winner.predictors.length} predictor(es) presentan p < 0.05 (prueba global F = ${formatNum(winner.fStat, 2)}, p = ${winner.fPValue < 0.0001 ? '< 0.0001' : winner.fPValue.toFixed(4)}).`
          : 'No hay coeficientes evaluados todavía.',
        'Recuerda que un p-valor bajo puede ocurrir en muestras grandes incluso con efectos de magnitud modesta; la relevancia práctica depende de las unidades económicas reales y el tamaño de los coeficientes.',
      ],
    },
    {
      number: 6,
      title: 'Capacidad explicativa',
      content: [
        winner
          ? `El modelo principal logra explicar el ${(winner.trainMetrics.adjR2 * 100).toFixed(2)}% de la varianza de "${winner.dependentVar}" penalizando por el número de parámetros (R² ajustado).`
          : 'Sin modelo ajustado para evaluar capacidad explicativa.',
      ],
    },
    {
      number: 7,
      title: 'Capacidad predictiva fuera de muestra',
      content: [
        winner
          ? `Sobre el conjunto de prueba (datos no vistos durante el ajuste ni la imputación), "${winner.label}" obtiene RMSE = ${formatNum(winner.testMetrics.rmse, 4)}, MAE = ${formatNum(winner.testMetrics.mae, 4)} y R² de prueba = ${(winner.testMetrics.r2 * 100).toFixed(2)}%.${winner.cvRmse !== null ? ` La validación cruzada interna (${winner.cvFoldsUsed} pliegues) arrojó un RMSE promedio de ${formatNum(winner.cvRmse, 4)}.` : ''}`
          : 'No se ha ejecutado evaluación fuera de muestra.',
      ],
    },
    {
      number: 8,
      title: 'Cumplimiento de los supuestos estadísticos',
      content: winnerDiag
        ? winnerDiag.alerts.map((a) => `${a.assumption} [${a.status}]: ${a.summary}. ${a.detail}`)
        : ['Ejecuta el diagnóstico estadístico para auditar normalidad, homocedasticidad, VIF e influencia.'],
    },
    {
      number: 9,
      title: 'Comparación entre alternativas evaluadas',
      content: [
        simpleModel && multipleModel
          ? `Al contrastar Regresión Simple (RMSE prueba = ${formatNum(simpleModel.testMetrics.rmse, 4)}, R² ajust. = ${(simpleModel.trainMetrics.adjR2 * 100).toFixed(2)}%) frente a Regresión Múltiple (RMSE prueba = ${formatNum(multipleModel.testMetrics.rmse, 4)}, R² ajust. = ${(multipleModel.trainMetrics.adjR2 * 100).toFixed(2)}%), se observa ${multipleModel.testMetrics.rmse < simpleModel.testMetrics.rmse ? 'una mejora predictiva en prueba al incorporar múltiples predictores.' : 'que añadir predictores adicionales no redujo el error fuera de muestra, sugiriendo mayor eficiencia en la especificación más parsimoniosa.'}`
          : `Se han comparado ${validModels.length} alternativa(s) de modelado bajo la misma partición entrenamiento/prueba.`,
      ],
    },
    {
      number: 10,
      title: 'Limitaciones del análisis',
      content: [
        'La regresión lineal asume relación aditiva y lineal en los parámetros; relaciones fuertemente no lineales o interacciones omitidas pueden quedar en los residuos.',
        'Los modelos observacionales estiman asociaciones estadísticas y no establecen causalidad sin un diseño experimental o de identificación econométrica específico.',
        'Las predicciones fuera del rango observado en entrenamiento (extrapolación) incrementan sustancialmente la incertidumbre.',
      ],
    },
  ];

  const recommendationJustification: string[] = [];
  if (winner) {
    recommendationJustification.push(
      `Menor o más equilibrado error de predicción fuera de muestra (RMSE prueba = ${formatNum(winner.testMetrics.rmse, 4)}, MAE prueba = ${formatNum(winner.testMetrics.mae, 4)}).`
    );
    recommendationJustification.push(
      `Equilibrio entre ajuste y complejidad: R² ajustado = ${(winner.trainMetrics.adjR2 * 100).toFixed(2)}%, BIC = ${formatNum(winner.trainMetrics.bic, 2)} con ${winner.predictors.length} predictor(es).`
    );
    if (winnerDiag) {
      const passedCount = winnerDiag.alerts.filter((a) => a.status === 'Cumple').length;
      recommendationJustification.push(
        `Diagnóstico de supuestos: ${passedCount} verificación(es) en estado óptimo (VIF máximo = ${winnerDiag.maxVif !== null ? winnerDiag.maxVif.toFixed(2) : '1.00'}).`
      );
    }
    const gap = winner.trainMetrics.r2 - (Number.isFinite(winner.testMetrics.r2) ? winner.testMetrics.r2 : winner.trainMetrics.r2);
    recommendationJustification.push(
      `Control de sobreajuste: diferencia entre R² entrenamiento y prueba de ${(gap * 100).toFixed(2)} puntos porcentuales.`
    );
  }

  return {
    sections,
    recommendedModelId: winner?.id ?? null,
    recommendedModelLabel: winner?.label ?? 'Sin modelo evaluado',
    recommendationJustification,
    tradeoffsNote:
      'Criterio de selección: No se elige automáticamente el modelo con mayor R² de entrenamiento, sino aquel que maximiza la capacidad de generalización en prueba (menor RMSE/MAE), mantiene parsimonia (BIC / R² ajustado) y respeta los supuestos econométricos.',
  };
}
