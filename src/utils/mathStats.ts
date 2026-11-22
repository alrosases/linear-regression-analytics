import { ColumnMeta, DescriptiveStats, Dataset } from '../types/analytics';

// ============================================================================
// SPECIAL FUNCTIONS & PROBABILITY DISTRIBUTIONS
// ============================================================================

const LANCZOS_COEFFS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lnGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  const zz = z - 1;
  let x = LANCZOS_COEFFS[0];
  for (let i = 1; i < LANCZOS_COEFFS.length; i++) {
    x += LANCZOS_COEFFS[i] / (zz + i);
  }
  const t = zz + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

// Upper regularized incomplete gamma Q(a, x)
export function igammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) {
    // Series representation for P(a, x), return 1 - P
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    const p = sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    return Math.max(0, Math.min(1, 1 - p));
  } else {
    // Continued fraction for Q(a, x)
    const FPMIN = 1e-30;
    let b = x + 1 - a;
    let c = 1 / FPMIN;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= 200; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    return Math.max(0, Math.min(1, Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h));
  }
}

export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const prob =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - prob : prob;
}

// Acklam's inverse normal CDF approximation
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];

  const plow = 0.02425;
  const phigh = 1 - plow;

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= phigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

export function tCdf(t: number, df: number): number {
  if (df <= 0 || !Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const p = 0.5 * ibeta(x, 0.5 * df, 0.5);
  return t >= 0 ? 1 - p : p;
}

export function tPValueTwoTailed(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  if (df <= 0) return 1;
  const x = df / (df + t * t);
  return Math.max(0, Math.min(1, ibeta(x, 0.5 * df, 0.5)));
}

export function tInv(p: number, df: number): number {
  if (p <= 0 || p >= 1 || df <= 0) return NaN;
  if (df > 500) return normInv(p);
  if (p === 0.5) return 0;
  const sign = p < 0.5 ? -1 : 1;
  const target = p < 0.5 ? 1 - p : p;
  let lo = 0;
  let hi = 100;
  while (tCdf(hi, df) < target && hi < 1e6) {
    hi *= 2;
  }
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < target) lo = mid;
    else hi = mid;
  }
  return sign * ((lo + hi) / 2);
}

export function fPValue(f: number, df1: number, df2: number): number {
  if (f <= 0 || df1 <= 0 || df2 <= 0 || !Number.isFinite(f)) return f > 0 ? 0 : 1;
  const x = df2 / (df2 + df1 * f);
  return Math.max(0, Math.min(1, ibeta(x, 0.5 * df2, 0.5 * df1)));
}

export function chi2PValue(chi2: number, df: number): number {
  if (chi2 <= 0 || df <= 0 || !Number.isFinite(chi2)) return 1;
  return igammaQ(0.5 * df, 0.5 * chi2);
}

// ============================================================================
// LINEAR ALGEBRA (GAUSS-JORDAN INVERSION & OLS SOLVER)
// ============================================================================

export function transposeMatrix(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0]?.length ?? 0;
  const T: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

export function multiplyMatrices(A: number[][], B: number[][]): number[][] {
  const r = A.length;
  const k = A[0]?.length ?? 0;
  const c = B[0]?.length ?? 0;
  const C: number[][] = Array.from({ length: r }, () => new Array(c).fill(0));
  for (let i = 0; i < r; i++) {
    for (let m = 0; m < k; m++) {
      const aim = A[i][m];
      if (aim === 0) continue;
      for (let j = 0; j < c; j++) {
        C[i][j] += aim * B[m][j];
      }
    }
  }
  return C;
}

export function invertSymmetricMatrix(M: number[][]): { inverse: number[][] | null; singular: boolean } {
  const n = M.length;
  const aug: number[][] = M.map((row, i) => {
    const identityRow = new Array(n).fill(0);
    identityRow[i] = 1;
    return [...row, ...identityRow];
  });

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    let maxVal = Math.abs(aug[i][i]);
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(aug[r][i]) > maxVal) {
        maxVal = Math.abs(aug[r][i]);
        maxRow = r;
      }
    }

    if (maxVal < 1e-11) {
      return { inverse: null, singular: true };
    }

    if (maxRow !== i) {
      const tmp = aug[i];
      aug[i] = aug[maxRow];
      aug[maxRow] = tmp;
    }

    const pivot = aug[i][i];
    for (let j = 0; j < 2 * n; j++) {
      aug[i][j] /= pivot;
    }

    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = aug[r][i];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) {
        aug[r][j] -= factor * aug[i][j];
      }
    }
  }

  const inv = aug.map((row) => row.slice(n));
  return { inverse: inv, singular: false };
}

/**
 * Solves OLS using X^T X beta = X^T y with standardized QR-like scaling for numerical stability.
 */
export function solveOLS(
  X: number[][],
  y: number[]
): {
  beta: number[];
  xtxInverse: number[][];
  singular: boolean;
} {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  if (n === 0 || p === 0) {
    return { beta: [], xtxInverse: [], singular: true };
  }

  // Column equilibration for numerical conditioning (keeps intercept column 0 scale = 1)
  const scales = new Array(p).fill(1);
  for (let j = 1; j < p; j++) {
    let normSq = 0;
    for (let i = 0; i < n; i++) {
      normSq += X[i][j] * X[i][j];
    }
    const rms = Math.sqrt(normSq / n);
    scales[j] = rms > 1e-12 ? rms : 1;
  }

  const Xs: number[][] = X.map((row) => row.map((v, j) => v / scales[j]));
  const Xt = transposeMatrix(Xs);
  const XtX = multiplyMatrices(Xt, Xs);
  const invRes = invertSymmetricMatrix(XtX);
  if (invRes.singular || !invRes.inverse) {
    return { beta: [], xtxInverse: [], singular: true };
  }

  const Xty = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += Xs[i][j] * y[i];
    }
    Xty[j] = s;
  }

  const betaScaled = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    let s = 0;
    for (let j = 0; j < p; j++) {
      s += invRes.inverse[i][j] * Xty[j];
    }
    betaScaled[i] = s;
  }

  // Unscale beta and (X^T X)^-1
  const beta = betaScaled.map((b, j) => b / scales[j]);
  const xtxInverse = invRes.inverse.map((row, i) =>
    row.map((val, j) => val / (scales[i] * scales[j]))
  );

  return { beta, xtxInverse, singular: false };
}

// ============================================================================
// DESCRIPTIVE STATISTICS & CORRELATIONS
// ============================================================================

export function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function computeDescriptiveStats(dataset: Dataset, colMeta: ColumnMeta): DescriptiveStats {
  const rawVals = dataset.numericRows.map((r) => r[colMeta.name]);
  const missingCount = rawVals.filter((v) => v === null || v === undefined || Number.isNaN(v)).length;
  const valid = rawVals.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  const n = valid.length;
  const total = rawVals.length;
  const missingPct = total > 0 ? (missingCount / total) * 100 : 0;

  if (n === 0) {
    return {
      column: colMeta.name,
      kind: colMeta.inferredKind,
      n: 0,
      missingCount,
      missingPct,
      mean: NaN,
      median: NaN,
      mode: null,
      modeApplicable: false,
      modeNote: 'Sin datos válidos',
      stdDev: NaN,
      variance: NaN,
      min: NaN,
      max: NaN,
      q1: NaN,
      q3: NaN,
      iqr: NaN,
      range: NaN,
      skewness: NaN,
      kurtosis: NaN,
      outliersCount: 0,
      values: [],
    };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const mean = valid.reduce((a, b) => a + b, 0) / n;
  const median = quantileSorted(sorted, 0.5);
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;

  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of valid) {
    const d = x - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }

  const variance = n > 1 ? m2 / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const sigma = Math.sqrt(m2 / n);
  const skewness = sigma > 1e-12 && n > 2 ? (m3 / n) / Math.pow(sigma, 3) : 0;
  const kurtosis = sigma > 1e-12 && n > 3 ? (m4 / n) / Math.pow(sigma, 4) - 3 : 0;

  // Mode calculation: only applicable if repeated values exist & max frequency > 1
  const freq = new Map<number, number>();
  let maxFreq = 0;
  let modeVal: number | null = null;
  let tieCount = 0;

  for (const v of valid) {
    const rounded = colMeta.inferredKind === 'numeric_continuous' ? Number(v.toFixed(4)) : v;
    const f = (freq.get(rounded) ?? 0) + 1;
    freq.set(rounded, f);
    if (f > maxFreq) {
      maxFreq = f;
      modeVal = rounded;
      tieCount = 1;
    } else if (f === maxFreq) {
      tieCount += 1;
    }
  }

  let modeApplicable = true;
  let modeNote = '';
  if (maxFreq <= 1) {
    modeApplicable = false;
    modeVal = null;
    modeNote = 'No aplicable (valores únicos)';
  } else if (tieCount > 3 && colMeta.inferredKind === 'numeric_continuous') {
    modeApplicable = false;
    modeVal = null;
    modeNote = 'Multimodal continua (ver histograma)';
  } else if (tieCount > 1) {
    modeNote = `Multimodal (${tieCount} empates, f=${maxFreq})`;
  } else {
    modeNote = `f = ${maxFreq}`;
  }

  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const outliersCount = valid.filter((v) => v < lowerFence || v > upperFence).length;

  return {
    column: colMeta.name,
    kind: colMeta.inferredKind,
    n,
    missingCount,
    missingPct,
    mean,
    median,
    mode: modeVal,
    modeApplicable,
    modeNote,
    stdDev,
    variance,
    min,
    max,
    q1,
    q3,
    iqr,
    range,
    skewness,
    kurtosis,
    outliersCount,
    values: valid,
  };
}

export function pearsonCorrelation(x: number[], y: number[]): { r: number; n: number; pValue: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  const pairs: [number, number][] = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const xi = x[i];
    const yi = y[i];
    if (Number.isFinite(xi) && Number.isFinite(yi)) {
      sx += xi;
      sy += yi;
      n++;
      pairs.push([xi, yi]);
    }
  }
  if (n < 3) return { r: NaN, n, pValue: NaN };
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (const [xi, yi] of pairs) {
    const dx = xi - mx;
    const dy = yi - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom < 1e-14) return { r: 0, n, pValue: 1 };
  const r = Math.max(-1, Math.min(1, num / denom));
  if (Math.abs(r) >= 0.99999999) return { r, n, pValue: 0 };
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const pValue = tPValueTwoTailed(t, n - 2);
  return { r, n, pValue };
}

export function computeCorrelationMatrix(
  dataset: Dataset,
  colNames: string[]
): {
  columns: string[];
  matrix: number[][];
  pValues: number[][];
  pairCounts: number[][];
} {
  const k = colNames.length;
  const matrix: number[][] = Array.from({ length: k }, () => new Array(k).fill(NaN));
  const pValues: number[][] = Array.from({ length: k }, () => new Array(k).fill(NaN));
  const pairCounts: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));

  const vectors = colNames.map((col) =>
    dataset.numericRows.map((row) => {
      const v = row[col];
      return v === null || v === undefined ? NaN : v;
    })
  );

  for (let i = 0; i < k; i++) {
    matrix[i][i] = 1;
    pValues[i][i] = 0;
    pairCounts[i][i] = vectors[i].filter(Number.isFinite).length;
    for (let j = i + 1; j < k; j++) {
      const res = pearsonCorrelation(vectors[i], vectors[j]);
      matrix[i][j] = res.r;
      matrix[j][i] = res.r;
      pValues[i][j] = res.pValue;
      pValues[j][i] = res.pValue;
      pairCounts[i][j] = res.n;
      pairCounts[j][i] = res.n;
    }
  }

  return { columns: colNames, matrix, pValues, pairCounts };
}

export function formatNum(value: number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (Math.abs(value) > 0 && Math.abs(value) < 0.0001) {
    return value.toExponential(2);
  }
  if (Math.abs(value) >= 1e6) {
    return value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  }
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPValue(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—';
  if (p < 0.0001) return '< 0.0001';
  return p.toFixed(4);
}
