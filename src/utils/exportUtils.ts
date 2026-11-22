import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AutomatedInterpretation,
  Dataset,
  DescriptiveStats,
  DiagnosticsResult,
  RegressionConfig,
  RegressionModelResult,
} from '../types/analytics';
import { computeCorrelationMatrix, formatNum, formatPValue, normInv } from './mathStats';

// ============================================================================
// SVG TO PNG EXPORT (FOR INTERACTIVE CHARTS)
// ============================================================================

export async function svgElementToPngDataUrl(
  svgEl: SVGSVGElement,
  scale = 2
): Promise<string> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const viewBox = svgEl.getAttribute('viewBox');
  let width = svgEl.clientWidth || 720;
  let height = svgEl.clientHeight || 420;
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      width = parts[2];
      height = parts[3];
    }
  }
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // Ensure dark background rect exists
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#111827');
  clone.insertBefore(bg, clone.firstChild);

  const svgData = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo inicializar el contexto Canvas 2D.'));
        return;
      }
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Error al renderizar el gráfico SVG a PNG.'));
    };
    img.src = url;
  });
}

export async function downloadSvgAsPng(svgEl: SVGSVGElement | null, filename: string): Promise<void> {
  if (!svgEl) return;
  const dataUrl = await svgElementToPngDataUrl(svgEl, 2);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================================================
// EXCEL / CSV EXPORTS
// ============================================================================

function triggerCsvDownload(csvContent: string, filename: string) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function arrayToCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

export function exportDescriptiveStats(stats: DescriptiveStats[], format: 'xlsx' | 'csv', baseName: string) {
  const headers = [
    'Variable', 'Tipo', 'N', 'Faltantes', '% Faltantes', 'Media', 'Mediana', 'Moda',
    'Desv. Estándar', 'Varianza', 'Mínimo', 'Q1', 'Q3', 'Máximo', 'Rango', 'Atípicos (IQR)',
  ];
  const rows = stats.map((s) => [
    s.column,
    s.kind,
    s.n,
    s.missingCount,
    Number(s.missingPct.toFixed(2)),
    Number.isFinite(s.mean) ? Number(s.mean.toFixed(4)) : null,
    Number.isFinite(s.median) ? Number(s.median.toFixed(4)) : null,
    s.mode !== null ? Number(s.mode.toFixed(4)) : s.modeNote,
    Number.isFinite(s.stdDev) ? Number(s.stdDev.toFixed(4)) : null,
    Number.isFinite(s.variance) ? Number(s.variance.toFixed(4)) : null,
    Number.isFinite(s.min) ? Number(s.min.toFixed(4)) : null,
    Number.isFinite(s.q1) ? Number(s.q1.toFixed(4)) : null,
    Number.isFinite(s.q3) ? Number(s.q3.toFixed(4)) : null,
    Number.isFinite(s.max) ? Number(s.max.toFixed(4)) : null,
    Number.isFinite(s.range) ? Number(s.range.toFixed(4)) : null,
    s.outliersCount,
  ]);

  if (format === 'csv') {
    triggerCsvDownload(arrayToCsv(headers, rows), `${baseName}_estadisticas_descriptivas.csv`);
    return;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Descriptivas');
  XLSX.writeFile(wb, `${baseName}_estadisticas_descriptivas.xlsx`);
}

export function exportPredictions(model: RegressionModelResult, format: 'xlsx' | 'csv') {
  const headers = [
    'Índice Original',
    `Real (${model.dependentVar})`,
    `Predicho (${model.dependentVar})`,
    'Residuo (Real - Predicho)',
    'Error Absoluto',
    'Error Porcentual (%)',
  ];
  const rows = model.actualTest.map((actual, i) => {
    const pred = model.fittedTest[i];
    const resid = model.residualsTest[i];
    const absErr = Math.abs(resid);
    const pctErr = Math.abs(actual) > 1e-9 ? (absErr / Math.abs(actual)) * 100 : null;
    return [
      model.testRowIndices[i] + 1,
      Number(actual.toFixed(4)),
      Number(pred.toFixed(4)),
      Number(resid.toFixed(4)),
      Number(absErr.toFixed(4)),
      pctErr !== null ? Number(pctErr.toFixed(2)) : 'N/A (Y=0)',
    ];
  });

  const safeLabel = model.label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (format === 'csv') {
    triggerCsvDownload(arrayToCsv(headers, rows), `predicciones_${safeLabel}.csv`);
    return;
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Predicciones_Prueba');
  XLSX.writeFile(wb, `predicciones_${safeLabel}.xlsx`);
}

export function exportResultsWorkbook(
  dataset: Dataset,
  stats: DescriptiveStats[],
  models: RegressionModelResult[],
  interpretation: AutomatedInterpretation,
  format: 'xlsx' | 'csv'
) {
  const validModels = models.filter((m) => m.isValid);
  const compHeaders = [
    'Modelo', 'Variables (X)', 'N Entren.', 'N Prueba', 'R² Entren.', 'R² Ajust.',
    'R² Prueba', 'RMSE Entren.', 'RMSE Prueba', 'MAE Prueba', 'MSE Prueba', 'MAPE Prueba (%)',
    'AIC', 'BIC', 'F-Stat', 'Valor p (F)',
  ];
  const compRows = validModels.map((m) => [
    m.label,
    m.predictors.join(', '),
    m.trainMetrics.n,
    m.testMetrics.n,
    Number(m.trainMetrics.r2.toFixed(4)),
    Number(m.trainMetrics.adjR2.toFixed(4)),
    Number.isFinite(m.testMetrics.r2) ? Number(m.testMetrics.r2.toFixed(4)) : null,
    Number(m.trainMetrics.rmse.toFixed(4)),
    Number.isFinite(m.testMetrics.rmse) ? Number(m.testMetrics.rmse.toFixed(4)) : null,
    Number.isFinite(m.testMetrics.mae) ? Number(m.testMetrics.mae.toFixed(4)) : null,
    Number.isFinite(m.testMetrics.mse) ? Number(m.testMetrics.mse.toFixed(4)) : null,
    m.testMetrics.mape !== null ? Number(m.testMetrics.mape.toFixed(2)) : 'N/A',
    Number(m.trainMetrics.aic.toFixed(2)),
    Number(m.trainMetrics.bic.toFixed(2)),
    Number(m.fStat.toFixed(3)),
    m.fPValue < 0.0001 ? '< 0.0001' : Number(m.fPValue.toFixed(4)),
  ]);

  if (format === 'csv') {
    triggerCsvDownload(arrayToCsv(compHeaders, compRows), `${dataset.fileName}_comparacion_modelos.csv`);
    return;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([compHeaders, ...compRows]), 'Comparacion_Modelos');

  const coefHeaders = ['Modelo', 'Término', 'Coeficiente', 'Error Estándar', 't-Stat', 'Valor p', 'IC 95% Inf.', 'IC 95% Sup.', 'Beta Estandarizado'];
  const coefRows: (string | number | null)[][] = [];
  for (const m of validModels) {
    for (const c of m.coefficients) {
      coefRows.push([
        m.label,
        c.name,
        Number(c.estimate.toFixed(5)),
        Number(c.stdError.toFixed(5)),
        Number(c.tStat.toFixed(4)),
        c.pValue < 0.0001 ? '< 0.0001' : Number(c.pValue.toFixed(5)),
        Number(c.ciLower.toFixed(5)),
        Number(c.ciUpper.toFixed(5)),
        c.standardizedBeta !== null ? Number(c.standardizedBeta.toFixed(4)) : null,
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([coefHeaders, ...coefRows]), 'Coeficientes');

  const descHeaders = ['Variable', 'N', 'Media', 'Mediana', 'Desv. Est.', 'Mín', 'Q1', 'Q3', 'Máx', 'Faltantes (%)'];
  const descRows = stats.map((s) => [
    s.column, s.n,
    Number.isFinite(s.mean) ? Number(s.mean.toFixed(4)) : null,
    Number.isFinite(s.median) ? Number(s.median.toFixed(4)) : null,
    Number.isFinite(s.stdDev) ? Number(s.stdDev.toFixed(4)) : null,
    Number.isFinite(s.min) ? Number(s.min.toFixed(4)) : null,
    Number.isFinite(s.q1) ? Number(s.q1.toFixed(4)) : null,
    Number.isFinite(s.q3) ? Number(s.q3.toFixed(4)) : null,
    Number.isFinite(s.max) ? Number(s.max.toFixed(4)) : null,
    Number(s.missingPct.toFixed(2)),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([descHeaders, ...descRows]), 'Descriptivas');

  const concRows = [
    ['Modelo Recomendado', interpretation.recommendedModelLabel],
    ['Criterio', interpretation.tradeoffsNote],
    ['---', '---'],
    ...interpretation.sections.flatMap((sec) => [
      [`${sec.number}. ${sec.title}`, ''],
      ...sec.content.map((p) => ['', p]),
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Sección', 'Detalle'], ...concRows]), 'Conclusiones');

  XLSX.writeFile(wb, `${dataset.fileName}_resultados_completos.xlsx`);
}

export function exportConclusionsText(dataset: Dataset, interpretation: AutomatedInterpretation) {
  const lines: string[] = [
    `INFORME ESTADÍSTICO Y ECONOMÉTRICO — ${dataset.fileName}`,
    `Sector económico: ${dataset.sector.activeSector}`,
    `Fecha de generación: ${new Date().toLocaleString('es-ES')}`,
    '',
    `MODELO RECOMENDADO: ${interpretation.recommendedModelLabel}`,
    ...interpretation.recommendationJustification.map((j) => `  - ${j}`),
    '',
    interpretation.tradeoffsNote,
    '',
    ...interpretation.sections.flatMap((s) => [
      `${s.number}. ${s.title.toUpperCase()}`,
      ...s.content,
      '',
    ]),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${dataset.fileName}_conclusiones.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// OFF-SCREEN CANVAS CHART RENDERERS FOR PDF EMBEDDING
// ============================================================================

function renderHistogramCanvas(stat: DescriptiveStats): string {
  const w = 720;
  const h = 360;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, w, h);

  const vals = stat.values;
  const pad = { top: 44, right: 24, bottom: 48, left: 56 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`Distribución (Histograma): ${stat.column}`, pad.left, 26);

  if (vals.length === 0) return canvas.toDataURL('image/png');
  const bins = Math.min(18, Math.max(6, Math.round(Math.sqrt(vals.length))));
  const min = stat.min;
  const max = stat.max === stat.min ? stat.min + 1 : stat.max;
  const step = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of vals) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / step));
    counts[idx]++;
  }
  const maxC = Math.max(1, ...counts);

  // Grid
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ph * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + pw, y);
    ctx.stroke();
  }

  // Bars
  const bw = pw / bins;
  for (let i = 0; i < bins; i++) {
    const bh = (counts[i] / maxC) * ph;
    const x = pad.left + i * bw + 2;
    const y = pad.top + ph - bh;
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(x, y, Math.max(2, bw - 4), bh);
  }

  // Mean line
  const meanX = pad.left + ((stat.mean - min) / (max - min)) * pw;
  ctx.strokeStyle = '#F59E0B';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(meanX, pad.top);
  ctx.lineTo(meanX, pad.top + ph);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '12px sans-serif';
  ctx.fillText(formatNum(min, 2), pad.left, h - 18);
  ctx.fillText(formatNum(max, 2), pad.left + pw - 50, h - 18);
  ctx.fillStyle = '#F59E0B';
  ctx.fillText(`Media: ${formatNum(stat.mean, 2)}`, pad.left + pw - 160, 26);

  return canvas.toDataURL('image/png');
}

function renderHeatmapCanvas(dataset: Dataset, numericCols: string[]): string {
  const cols = numericCols.slice(0, 8);
  const corr = computeCorrelationMatrix(dataset, cols);
  const w = 720;
  const h = 420;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Mapa de Calor — Correlaciones de Pearson (r)', 24, 28);

  const k = cols.length;
  if (k < 2) return canvas.toDataURL('image/png');

  const leftM = 150;
  const topM = 54;
  const gridW = w - leftM - 30;
  const gridH = h - topM - 70;
  const cw = gridW / k;
  const ch = gridH / k;

  for (let i = 0; i < k; i++) {
    ctx.fillStyle = '#CBD5E1';
    ctx.font = '11px sans-serif';
    const label = cols[i].length > 18 ? cols[i].slice(0, 17) + '…' : cols[i];
    ctx.fillText(label, 16, topM + i * ch + ch / 2 + 4);

    for (let j = 0; j < k; j++) {
      const r = corr.matrix[i][j];
      const absR = Number.isFinite(r) ? Math.abs(r) : 0;
      if (r >= 0) {
        ctx.fillStyle = `rgba(14, 165, 233, ${0.15 + 0.75 * absR})`;
      } else {
        ctx.fillStyle = `rgba(244, 63, 94, ${0.15 + 0.75 * absR})`;
      }
      ctx.fillRect(leftM + j * cw + 1, topM + i * ch + 1, cw - 2, ch - 2);

      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 11px monospace';
      const txt = Number.isFinite(r) ? r.toFixed(2) : '—';
      ctx.fillText(txt, leftM + j * cw + cw / 2 - 14, topM + i * ch + ch / 2 + 4);
    }
  }

  return canvas.toDataURL('image/png');
}

function renderScatterDiagnosticCanvas(
  title: string,
  xLabel: string,
  yLabel: string,
  xs: number[],
  ys: number[],
  refLine?: 'zero' | 'identity'
): string {
  const w = 720;
  const h = 360;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, w, h);

  const pad = { top: 44, right: 28, bottom: 48, left: 64 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;

  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(title, pad.left, 26);

  if (xs.length === 0) return canvas.toDataURL('image/png');

  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (refLine === 'identity') {
    minX = minY = Math.min(minX, minY);
    maxX = maxY = Math.max(maxX, maxY);
  }
  if (refLine === 'zero') {
    const absY = Math.max(Math.abs(minY), Math.abs(maxY), 1e-6);
    minY = -absY * 1.1;
    maxY = absY * 1.1;
  }
  if (maxX === minX) maxX = minX + 1;
  if (maxY === minY) maxY = minY + 1;

  const toPxX = (v: number) => pad.left + ((v - minX) / (maxX - minX)) * pw;
  const toPxY = (v: number) => pad.top + ph - ((v - minY) / (maxY - minY)) * ph;

  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.left, pad.top, pw, ph);

  if (refLine === 'zero') {
    const y0 = toPxY(0);
    ctx.strokeStyle = '#F59E0B';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y0);
    ctx.lineTo(pad.left + pw, y0);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (refLine === 'identity') {
    ctx.strokeStyle = '#10B981';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toPxX(minX), toPxY(minX));
    ctx.lineTo(toPxX(maxX), toPxY(maxX));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
  for (let i = 0; i < xs.length; i++) {
    ctx.beginPath();
    ctx.arc(toPxX(xs[i]), toPxY(ys[i]), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#94A3B8';
  ctx.font = '11px sans-serif';
  ctx.fillText(xLabel, pad.left + pw / 2 - 40, h - 14);
  ctx.fillText(yLabel, 8, pad.top + 12);

  return canvas.toDataURL('image/png');
}

// ============================================================================
// MODULE 13: COMPREHENSIVE 15-SECTION PDF REPORT
// ============================================================================

export function generateComprehensivePdfReport(params: {
  reportTitle: string;
  analystName: string;
  dataset: Dataset;
  stats: DescriptiveStats[];
  config: RegressionConfig;
  simpleModel: RegressionModelResult | null;
  multipleModel: RegressionModelResult | null;
  allModels: RegressionModelResult[];
  diagnosticsMap: Record<string, DiagnosticsResult>;
  interpretation: AutomatedInterpretation;
}) {
  const {
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
  } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;

  const addFooterAllPages = () => {
    const pageCount = doc.getNumberOfPages();
    for (let i = 2; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120, 130, 145);
      doc.text(`${reportTitle} — ${dataset.fileName}`, margin, pageH - 8);
      doc.text(`Página ${i} de ${pageCount}`, pageW - margin - 20, pageH - 8);
    }
  };

  let y = 20;
  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 18) {
      doc.addPage();
      y = 18;
    }
  };

  const addSectionTitle = (num: number, title: string) => {
    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(`${num}. ${title}`, margin, y);
    y += 2;
    doc.setDrawColor(14, 165, 233);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
  };

  const addParagraph = (text: string, fontSize = 9.5) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    ensureSpace(lines.length * 4.5 + 3);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 2.5;
  };

  // 1. PORTADA
  doc.setFillColor(11, 15, 23);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(14, 165, 233);
  doc.rect(margin, 42, 28, 1.5, 'F');

  doc.setTextColor(226, 232, 240);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  const coverTitleLines = doc.splitTextToSize(reportTitle, pageW - margin * 2);
  doc.text(coverTitleLines, margin, 58);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(148, 163, 184);
  doc.text('Informe Técnico de Análisis Estadístico, Econometría y Regresión Lineal', margin, 82);

  doc.setFillColor(20, 28, 43);
  doc.roundedRect(margin, 102, pageW - margin * 2, 62, 3, 3, 'F');
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text(`Base de datos analizada: ${dataset.fileName} (${dataset.fileFormat})`, margin + 8, 115);
  doc.text(`Dimensiones: ${dataset.quality.totalRows} filas × ${dataset.quality.totalCols} columnas`, margin + 8, 124);
  doc.text(`Sector económico: ${dataset.sector.activeSector}`, margin + 8, 133);
  doc.text(`Variable dependiente (Y): ${config.dependentVar || 'No configurada'}`, margin + 8, 142);
  doc.text(`Modelo recomendado: ${interpretation.recommendedModelLabel}`, margin + 8, 151);
  doc.text(`Responsable / Analista: ${analystName || 'Analista de Datos'} · Fecha: ${new Date().toLocaleDateString('es-ES')}`, margin + 8, 160);

  // Start content on page 2
  doc.addPage();
  y = 18;

  // 2. DESCRIPCIÓN DE LA BASE DE DATOS
  addSectionTitle(2, 'Descripción de la base de datos');
  addParagraph(
    `El archivo "${dataset.fileName}" (${dataset.fileFormat}) cuenta con ${dataset.quality.totalRows} registros y ${dataset.quality.totalCols} columnas. Se clasificaron ${dataset.quality.numericColsCount} variables numéricas, ${dataset.quality.categoricalColsCount} categóricas y ${dataset.quality.textColsCount} de texto libre.`
  );

  // 3. SECTOR ECONÓMICO IDENTIFICADO
  addSectionTitle(3, 'Sector económico identificado');
  addParagraph(`Sector asignado: ${dataset.sector.activeSector} (Confianza: ${dataset.sector.confidence}${dataset.sector.isManualOverride ? ', ajustado manualmente' : ''}).`);
  addParagraph(dataset.sector.explanation);

  // 4. ANÁLISIS DE CALIDAD DE DATOS
  addSectionTitle(4, 'Análisis de calidad de datos');
  addParagraph(
    `Valores faltantes totales: ${dataset.quality.totalNulls} (${dataset.quality.totalNullPct.toFixed(2)}%). Filas duplicadas: ${dataset.quality.duplicateRows}. Columnas constantes: ${dataset.quality.constantColumns.length > 0 ? dataset.quality.constantColumns.join(', ') : 'Ninguna'}.`
  );
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Severidad', 'Hallazgo', 'Recomendación']],
    body: dataset.quality.alerts.map((a) => [a.severity.toUpperCase(), a.title, a.recommendation]),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // 5. ESTADÍSTICAS DESCRIPTIVAS
  addSectionTitle(5, 'Estadísticas descriptivas');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Variable', 'N', 'Nulos %', 'Media', 'Mediana', 'D.E.', 'Mín', 'Q1', 'Q3', 'Máx']],
    body: stats.map((s) => [
      s.column,
      s.n,
      s.missingPct.toFixed(1) + '%',
      formatNum(s.mean, 2),
      formatNum(s.median, 2),
      formatNum(s.stdDev, 2),
      formatNum(s.min, 2),
      formatNum(s.q1, 2),
      formatNum(s.q3, 2),
      formatNum(s.max, 2),
    ]),
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // 6. GRÁFICOS EXPLORATORIOS
  addSectionTitle(6, 'Gráficos exploratorios');
  const targetStat = stats.find((s) => s.column === config.dependentVar) ?? stats[0];
  if (targetStat) {
    ensureSpace(88);
    const histImg = renderHistogramCanvas(targetStat);
    doc.addImage(histImg, 'PNG', margin, y, pageW - margin * 2, 78);
    y += 83;
  }
  const numCols = dataset.columns
    .filter((c) => c.included && (c.inferredKind === 'numeric_continuous' || c.inferredKind === 'numeric_discrete'))
    .map((c) => c.name);
  if (numCols.length >= 2) {
    ensureSpace(95);
    const heatImg = renderHeatmapCanvas(dataset, numCols);
    doc.addImage(heatImg, 'PNG', margin, y, pageW - margin * 2, 86);
    y += 92;
  }

  // 7. VARIABLES SELECCIONADAS
  addSectionTitle(7, 'Variables seleccionadas');
  addParagraph(
    `Variable dependiente (Y): ${config.dependentVar}. Predictor simple (X): ${config.simpleX}. Predictores múltiples (X): ${config.multipleXs.join(', ')}.`
  );

  // 8. METODOLOGÍA UTILIZADA
  addSectionTitle(8, 'Metodología utilizada');
  addParagraph(
    `Estimación mediante Mínimos Cuadrados Ordinarios (OLS). Partición aleatoria reproducible (${Math.round(config.trainRatio * 100)}% entrenamiento / ${Math.round((1 - config.trainRatio) * 100)}% prueba, semilla ${config.randomSeed}). Estrategia de nulos: "${config.missingStrategy}", ajustada exclusivamente sobre entrenamiento para evitar fuga de información (Data Leakage), más validación cruzada de ${config.cvFolds} pliegues.`
  );

  // 9 & 10. RESULTADOS DE REGRESIÓN Y COEFICIENTES
  addSectionTitle(9, 'Resultados de regresión simple y múltiple');
  const regModels = [simpleModel, multipleModel].filter((m): m is RegressionModelResult => Boolean(m && m.isValid));
  if (regModels.length === 0) {
    addParagraph('No se encontraron modelos válidos ejecutados.');
  } else {
    for (const m of regModels) {
      ensureSpace(35);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      doc.text(m.label, margin, y);
      y += 5;
      addParagraph(`Ecuación: ${m.equation}`, 8.5);
      addParagraph(
        `R² Entrenamiento: ${(m.trainMetrics.r2 * 100).toFixed(2)}% | R² Ajustado: ${(m.trainMetrics.adjR2 * 100).toFixed(2)}% | F = ${formatNum(m.fStat, 3)} (p = ${formatPValue(m.fPValue)}) | RMSE Prueba: ${formatNum(m.testMetrics.rmse, 4)}`,
        8.5
      );
    }

    addSectionTitle(10, 'Coeficientes e intervalos de confianza del 95%');
    for (const m of regModels) {
      ensureSpace(35);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(`Tabla de coeficientes — ${m.label}`, margin, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Término', 'Coeficiente', 'Error Est.', 't', 'Valor p', 'IC 95% Inf.', 'IC 95% Sup.']],
        body: m.coefficients.map((c) => [
          c.name,
          formatNum(c.estimate, 4),
          formatNum(c.stdError, 4),
          formatNum(c.tStat, 3),
          formatPValue(c.pValue),
          formatNum(c.ciLower, 4),
          formatNum(c.ciUpper, 4),
        ]),
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59] },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
  }

  // 11. VALIDACIÓN Y DIAGNÓSTICO DE SUPUESTOS
  addSectionTitle(11, 'Validación y diagnóstico de supuestos');
  const diagTarget = multipleModel?.isValid ? multipleModel : simpleModel?.isValid ? simpleModel : null;
  const diag = diagTarget ? diagnosticsMap[diagTarget.id] : undefined;
  if (diagTarget && diag) {
    addParagraph(`Modelo auditado: ${diag.modelLabel}`);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Supuesto / Prueba', 'Estado', 'Resultado', 'Interpretación']],
      body: diag.alerts.map((a) => [a.assumption, a.status, a.summary, a.detail]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

    ensureSpace(84);
    const residImg = renderScatterDiagnosticCanvas(
      `Residuos vs. Valores Ajustados (${diagTarget.label})`,
      'Valores Ajustados',
      'Residuos',
      diagTarget.fittedTrain,
      diagTarget.residualsTrain,
      'zero'
    );
    doc.addImage(residImg, 'PNG', margin, y, pageW - margin * 2, 74);
    y += 80;

    // Q-Q Plot
    const sortedStd = [...diagTarget.stdResidualsTrain].sort((a, b) => a - b);
    const theoQ = sortedStd.map((_, i) => normInv((i + 0.5) / sortedStd.length));
    ensureSpace(84);
    const qqImg = renderScatterDiagnosticCanvas(
      `Gráfico Q-Q de Residuos Estandarizados (${diagTarget.label})`,
      'Cuantiles Teóricos N(0,1)',
      'Residuos Estandarizados',
      theoQ,
      sortedStd,
      'identity'
    );
    doc.addImage(qqImg, 'PNG', margin, y, pageW - margin * 2, 74);
    y += 80;
  }

  // 12. COMPARACIÓN DE MODELOS
  addSectionTitle(12, 'Comparación de modelos');
  const validAll = allModels.filter((m) => m.isValid);
  if (validAll.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Modelo', 'k', 'R² Entr.', 'R² Ajust.', 'R² Prueba', 'RMSE Prueba', 'MAE Prueba', 'AIC', 'BIC']],
      body: validAll.map((m) => [
        m.label,
        m.predictors.length,
        (m.trainMetrics.r2 * 100).toFixed(1) + '%',
        (m.trainMetrics.adjR2 * 100).toFixed(1) + '%',
        Number.isFinite(m.testMetrics.r2) ? (m.testMetrics.r2 * 100).toFixed(1) + '%' : '—',
        formatNum(m.testMetrics.rmse, 3),
        formatNum(m.testMetrics.mae, 3),
        formatNum(m.trainMetrics.aic, 1),
        formatNum(m.trainMetrics.bic, 1),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // 13. RESULTADOS DE PREDICCIONES
  addSectionTitle(13, 'Resultados de predicciones en conjunto de prueba');
  const predModel = validAll.find((m) => m.id === interpretation.recommendedModelId) ?? diagTarget;
  if (predModel && predModel.actualTest.length > 0) {
    ensureSpace(84);
    const avpImg = renderScatterDiagnosticCanvas(
      `Valores Reales vs. Estimados en Prueba (${predModel.label})`,
      `Real (${predModel.dependentVar})`,
      'Estimado',
      predModel.actualTest,
      predModel.fittedTest,
      'identity'
    );
    doc.addImage(avpImg, 'PNG', margin, y, pageW - margin * 2, 74);
    y += 80;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Fila', 'Real', 'Predicho', 'Residuo', 'Error Abs.']],
      body: predModel.actualTest.slice(0, 15).map((act, i) => [
        predModel.testRowIndices[i] + 1,
        formatNum(act, 3),
        formatNum(predModel.fittedTest[i], 3),
        formatNum(predModel.residualsTest[i], 3),
        formatNum(Math.abs(predModel.residualsTest[i]), 3),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // 14. INTERPRETACIÓN ESTADÍSTICA
  addSectionTitle(14, 'Interpretación estadística integral');
  for (const sec of interpretation.sections.slice(0, 8)) {
    addParagraph(`${sec.number}. ${sec.title}: ${sec.content.join(' ')}`, 9);
  }

  // 15. CONCLUSIONES Y RECOMENDACIONES
  addSectionTitle(15, 'Conclusiones y recomendación final');
  addParagraph(`Modelo recomendado: ${interpretation.recommendedModelLabel}`, 10.5);
  for (const j of interpretation.recommendationJustification) {
    addParagraph(`• ${j}`, 9);
  }
  addParagraph(interpretation.tradeoffsNote, 9);

  addFooterAllPages();
  const safeFile = dataset.fileName.replace(/\.[^.]+$/, '');
  doc.save(`informe_econometrico_${safeFile}.pdf`);
}
