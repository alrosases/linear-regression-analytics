import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import {
  ColumnMeta,
  DataQualityAlert,
  DataQualityReport,
  Dataset,
  RawRow,
  VariableKind,
} from '../types/analytics';
import { classifyEconomicSector } from './sectorClassifier';

function parseNumericValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'boolean') return null;

  const str = String(raw).trim();
  if (
    str === '' ||
    str.toLowerCase() === 'na' ||
    str.toLowerCase() === 'nan' ||
    str.toLowerCase() === 'null' ||
    str.toLowerCase() === 'n/a' ||
    str === '-' ||
    str === '--'
  ) {
    return null;
  }

  // Handle currency/percentage symbols carefully
  let cleaned = str.replace(/[$€£¥%]/g, '').replace(/\s+/g, '');

  // Handle thousands/decimal formats (e.g., 1,234.56 vs 1.234,56)
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (/^-?\d+,\d+$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function inferColumnMetadata(
  name: string,
  rows: RawRow[],
  numericRows: Record<string, number | null>[]
): { meta: ColumnMeta; formatIssues: number } {
  let nonNullCount = 0;
  let nullCount = 0;
  let numericSuccess = 0;
  let integerCount = 0;
  let formatIssues = 0;
  const uniqueSet = new Set<string>();
  const sampleValues: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i][name];
    const isEmpty =
      raw === null ||
      raw === undefined ||
      (typeof raw === 'string' &&
        ['', 'na', 'nan', 'null', 'n/a', '-', '--'].includes(raw.trim().toLowerCase()));

    if (isEmpty) {
      nullCount++;
      numericRows[i][name] = null;
      continue;
    }

    nonNullCount++;
    const strVal = String(raw).trim();
    uniqueSet.add(strVal);
    if (sampleValues.length < 4 && !sampleValues.includes(strVal)) {
      sampleValues.push(strVal);
    }

    const numVal = parseNumericValue(raw);
    if (numVal !== null) {
      numericSuccess++;
      numericRows[i][name] = numVal;
      if (Number.isInteger(numVal)) integerCount++;
      if (typeof raw === 'string' && /[$€£¥%,]/.test(raw)) {
        formatIssues++;
      }
    } else {
      numericRows[i][name] = null;
    }
  }

  const total = rows.length;
  const nullPct = total > 0 ? (nullCount / total) * 100 : 0;
  const numericRatio = nonNullCount > 0 ? numericSuccess / nonNullCount : 0;

  let inferredKind: VariableKind;
  if (numericRatio >= 0.85 && numericSuccess > 0) {
    const intRatio = integerCount / numericSuccess;
    if (intRatio === 1 && uniqueSet.size <= Math.max(20, total * 0.25)) {
      inferredKind = 'numeric_discrete';
    } else {
      inferredKind = 'numeric_continuous';
    }
  } else {
    // Distinguish categorical vs free text
    const avgLen =
      sampleValues.length > 0
        ? sampleValues.reduce((acc, s) => acc + s.length, 0) / sampleValues.length
        : 0;
    const uniqueRatio = nonNullCount > 0 ? uniqueSet.size / nonNullCount : 0;

    if (uniqueSet.size <= 30 || (uniqueRatio < 0.35 && avgLen < 35)) {
      inferredKind = 'categorical';
    } else {
      inferredKind = 'text';
    }
  }

  const isConstant = uniqueSet.size <= 1;

  return {
    meta: {
      name,
      inferredKind,
      nonNullCount,
      nullCount,
      nullPct,
      uniqueCount: uniqueSet.size,
      sampleValues,
      included: inferredKind === 'numeric_continuous' || inferredKind === 'numeric_discrete',
      isConstant,
    },
    formatIssues,
  };
}

function buildQualityReport(
  rows: RawRow[],
  columns: ColumnMeta[],
  formatIssueCols: string[]
): DataQualityReport {
  const totalRows = rows.length;
  const totalCols = columns.length;

  // Duplicate row check
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const row of rows) {
    const sig = columns.map((c) => String(row[c.name] ?? '')).join('\u0001');
    if (seen.has(sig)) duplicateRows++;
    else seen.add(sig);
  }

  const totalNulls = columns.reduce((acc, c) => acc + c.nullCount, 0);
  const totalCells = totalRows * totalCols;
  const totalNullPct = totalCells > 0 ? (totalNulls / totalCells) * 100 : 0;

  const numericColsCount = columns.filter(
    (c) => c.inferredKind === 'numeric_continuous' || c.inferredKind === 'numeric_discrete'
  ).length;
  const categoricalColsCount = columns.filter((c) => c.inferredKind === 'categorical').length;
  const textColsCount = columns.filter((c) => c.inferredKind === 'text').length;

  const highNullColumns = columns.filter((c) => c.nullPct > 15).map((c) => c.name);
  const constantColumns = columns.filter((c) => c.isConstant).map((c) => c.name);

  const alerts: DataQualityAlert[] = [];

  if (totalRows < 30) {
    alerts.push({
      id: 'low-sample-size',
      severity: 'warning',
      title: `Tamaño muestral reducido (${totalRows} observaciones)`,
      detail:
        'Al dividir los datos en entrenamiento y prueba, el número de grados de libertad puede resultar bajo para modelos múltiples.',
      recommendation:
        'Limita la cantidad de variables predictoras simultáneas (idealmente al menos 10–15 observaciones por predictor) o evalúa regresión lineal simple.',
    });
  }

  if (duplicateRows > 0) {
    alerts.push({
      id: 'duplicates',
      severity: 'warning',
      title: `${duplicateRows} fila(s) duplicada(s) detectada(s)`,
      detail:
        'Registros idénticos pueden sesgar los errores estándar, inflar artificialmente el R² y provocar fuga si caen en entrenamiento y prueba.',
      recommendation:
        'Verifica si los duplicados representan observaciones repetidas válidas o errores de captura antes de ajustar el modelo.',
    });
  }

  if (highNullColumns.length > 0) {
    alerts.push({
      id: 'high-nulls',
      severity: 'error',
      title: `${highNullColumns.length} variable(s) con más del 15% de valores nulos`,
      detail: `Columnas afectadas: ${highNullColumns.join(', ')}.`,
      recommendation:
        'Considera excluir estas variables del análisis o utilizar imputación ajustada exclusivamente en el conjunto de entrenamiento.',
    });
  } else if (totalNulls > 0) {
    alerts.push({
      id: 'moderate-nulls',
      severity: 'info',
      title: `${totalNulls} valores faltantes detectados (${totalNullPct.toFixed(2)}% del total)`,
      detail: 'Existen celdas vacías o marcadas como NA/NULL en la base cargada.',
      recommendation:
        'Configura la estrategia de manejo de nulos (eliminación por pares o imputación por media/mediana de entrenamiento) en Configuración del modelo.',
    });
  }

  if (constantColumns.length > 0) {
    alerts.push({
      id: 'constant-cols',
      severity: 'warning',
      title: `${constantColumns.length} variable(s) constante(s) o sin varianza`,
      detail: `Columnas sin variación: ${constantColumns.join(', ')}.`,
      recommendation:
        'Las columnas constantes producen colinealidad exacta con el intercepto y deben permanecer excluidas de la regresión.',
    });
  }

  if (formatIssueCols.length > 0) {
    alerts.push({
      id: 'format-inconsistencies',
      severity: 'info',
      title: 'Caracteres de moneda, porcentaje o separadores detectados',
      detail: `Se normalizaron formatos numéricos en: ${formatIssueCols.join(', ')}.`,
      recommendation:
        'Revisa la vista previa para confirmar que los valores decimales y de miles fueron interpretados con precisión.',
    });
  }

  if (numericColsCount < 2) {
    alerts.push({
      id: 'insufficient-numeric',
      severity: 'error',
      title: 'Variables numéricas insuficientes para regresión lineal',
      detail: `Solo se detectaron ${numericColsCount} variable(s) numérica(s).`,
      recommendation:
        'La regresión lineal requiere al menos una variable dependiente numérica (Y) y una independiente numérica (X).',
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'clean-dataset',
      severity: 'info',
      title: 'Base de datos íntegra y sin anomalías estructurales',
      detail: 'No se detectaron valores nulos, filas duplicadas ni columnas constantes.',
      recommendation: 'Puedes continuar directamente al análisis descriptivo y exploratorio.',
    });
  }

  return {
    totalRows,
    totalCols,
    duplicateRows,
    totalNulls,
    totalNullPct,
    numericColsCount,
    categoricalColsCount,
    textColsCount,
    highNullColumns,
    constantColumns,
    alerts,
  };
}

export function buildDatasetFromRows(
  rows: RawRow[],
  fileName: string,
  fileFormat: string
): Dataset {
  if (!rows || rows.length === 0) {
    throw new Error('El archivo no contiene registros tabulares válidos.');
  }

  // Collect all unique column headers preserving first-seen order
  const colSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const trimmed = key.trim();
      if (trimmed) colSet.add(trimmed);
    }
  }
  const colNames = Array.from(colSet);
  if (colNames.length < 2) {
    throw new Error('Se requieren al menos 2 columnas para construir análisis estadísticos y modelos.');
  }

  // Normalize row keys
  const normalizedRows: RawRow[] = rows.map((r) => {
    const obj: RawRow = {};
    for (const col of colNames) {
      obj[col] = r[col] !== undefined ? r[col] : r[col.trim()];
    }
    return obj;
  });

  const numericRows: Record<string, number | null>[] = normalizedRows.map(() => ({}));
  const columns: ColumnMeta[] = [];
  const formatIssueCols: string[] = [];

  for (const col of colNames) {
    const { meta, formatIssues } = inferColumnMetadata(col, normalizedRows, numericRows);
    columns.push(meta);
    if (formatIssues > 0) formatIssueCols.push(col);
  }

  const quality = buildQualityReport(normalizedRows, columns, formatIssueCols);
  const sector = classifyEconomicSector(colNames, normalizedRows, fileName);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName,
    fileFormat,
    loadedAt: new Date().toISOString(),
    rows: normalizedRows,
    numericRows,
    columns,
    quality,
    sector,
  };
}

export async function parseUploadedFile(file: File): Promise<Dataset> {
  const lower = file.name.toLowerCase();
  const ext = lower.split('.').pop() ?? '';

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('El libro de Excel no contiene hojas.');
    }
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<RawRow>(worksheet, {
      defval: null,
      raw: true,
    });
    return buildDatasetFromRows(rows, file.name, ext.toUpperCase());
  }

  if (ext === 'json') {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.data)
        ? parsed.data
        : null;
    if (!arr) {
      throw new Error('El archivo JSON debe contener un arreglo de objetos tabulares.');
    }
    return buildDatasetFromRows(arr as RawRow[], file.name, 'JSON');
  }

  // CSV, TXT, TSV, DAT
  const text = await file.text();
  if (!text.trim()) {
    throw new Error('El archivo está vacío.');
  }

  return new Promise<Dataset>((resolve, reject) => {
    Papa.parse<RawRow>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      delimitersToGuess: [',', ';', '\t', '|'],
      complete: (results) => {
        try {
          if (!results.data || results.data.length === 0) {
            reject(new Error('No se encontraron filas válidas en el archivo de texto/CSV.'));
            return;
          }
          const fmt = ext === 'txt' ? 'TXT' : ext === 'tsv' ? 'TSV' : 'CSV';
          resolve(buildDatasetFromRows(results.data, file.name, fmt));
        } catch (err) {
          reject(err);
        }
      },
      error: (err: Error) => {
        reject(new Error(`Error al leer el archivo: ${err.message}`));
      },
    });
  });
}
