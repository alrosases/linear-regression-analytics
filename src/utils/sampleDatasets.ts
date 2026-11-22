import { Dataset, RawRow } from '../types/analytics';
import { buildDatasetFromRows } from './dataParser';

export interface SampleDatasetSpec {
  id: string;
  title: string;
  sectorHint: string;
  description: string;
  fileName: string;
  build: () => Dataset;
}

function seededRand(seed: number): () => number {
  let a = seed;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randNorm(rng: () => number): number {
  const u1 = Math.max(1e-9, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export const SAMPLE_DATASETS: SampleDatasetSpec[] = [
  {
    id: 'retail_marketing',
    title: 'Ventas Omnicanal y Marketing (Comercio y Retail)',
    sectorHint: 'Comercio y retail',
    description: '180 sucursales con inversión publicitaria, tráfico en tienda, descuento promedio, ticket y ventas mensuales.',
    fileName: 'ventas_retail_omnicanal.csv',
    build: () => {
      const rng = seededRand(4201);
      const regions = ['Norte', 'Centro', 'Sur', 'Occidente'];
      const rows: RawRow[] = [];
      for (let i = 1; i <= 180; i++) {
        const inversionPublicidad = 15 + rng() * 85; // miles USD
        const traficoTienda = Math.round(450 + inversionPublicidad * 14 + randNorm(rng) * 160);
        const descuentoProm = Number((2 + rng() * 18).toFixed(2));
        const vendedores = Math.round(4 + (traficoTienda / 400) + rng() * 5);
        const satisfaccion = Number(Math.min(10, Math.max(4.5, 6.8 + 0.12 * vendedores - 0.03 * descuentoProm + randNorm(rng) * 0.5)).toFixed(2));
        const ruido = randNorm(rng) * 9.5;
        const ventasMensuales = Number(
          Math.max(
            25,
            24.5 +
              1.68 * inversionPublicidad +
              0.042 * traficoTienda +
              2.85 * vendedores -
              1.15 * descuentoProm +
              3.4 * satisfaccion +
              ruido
          ).toFixed(2)
        );
        rows.push({
          id_sucursal: i,
          region: regions[i % regions.length],
          inversion_publicidad_kusd: i === 27 ? null : Number(inversionPublicidad.toFixed(2)),
          trafico_mensual_clientes: traficoTienda,
          vendedores_activos: vendedores,
          descuento_promedio_pct: descuentoProm,
          indice_satisfaccion: satisfaccion,
          ventas_mensuales_kusd: ventasMensuales,
        });
      }
      return buildDatasetFromRows(rows, 'ventas_retail_omnicanal.csv', 'CSV');
    },
  },
  {
    id: 'credit_scoring',
    title: 'Cartera Crediticia y Riesgo (Financiero y Bancario)',
    sectorHint: 'Financiero y bancario',
    description: '210 solicitantes de crédito con ingresos, endeudamiento, antigüedad laboral, tasa y monto aprobado.',
    fileName: 'cartera_credito_bancario.xlsx',
    build: () => {
      const rng = seededRand(8812);
      const segmentos = ['Preferente', 'Estándar', 'Pyme'];
      const rows: RawRow[] = [];
      for (let i = 1; i <= 210; i++) {
        const ingresoAnual = Number((22 + rng() * 110).toFixed(2));
        const antiguedadAnos = Math.round(1 + rng() * 20);
        const ratioDeuda = Number((10 + rng() * 45).toFixed(2));
        const scoreCrediticio = Math.round(
          Math.min(850, Math.max(480, 560 + 1.4 * ingresoAnual - 2.1 * ratioDeuda + 3.2 * antiguedadAnos + randNorm(rng) * 28))
        );
        const tasaInteres = Number(
          Math.max(5.5, 22.5 - 0.018 * scoreCrediticio + 0.06 * ratioDeuda + randNorm(rng) * 0.7).toFixed(2)
        );
        const montoCredito = Number(
          Math.max(
            5,
            -18 + 0.62 * ingresoAnual + 0.085 * scoreCrediticio - 0.48 * ratioDeuda + 0.45 * antiguedadAnos + randNorm(rng) * 6.5
          ).toFixed(2)
        );
        rows.push({
          solicitud_id: `CR-${1000 + i}`,
          segmento_cliente: segmentos[i % segmentos.length],
          ingreso_anual_kusd: ingresoAnual,
          antiguedad_laboral_anos: antiguedadAnos,
          ratio_deuda_ingreso_pct: ratioDeuda,
          score_crediticio: scoreCrediticio,
          tasa_interes_anual_pct: i === 55 || i === 120 ? null : tasaInteres,
          monto_credito_aprobado_kusd: montoCredito,
        });
      }
      return buildDatasetFromRows(rows, 'cartera_credito_bancario.xlsx', 'XLSX');
    },
  },
  {
    id: 'manufacturing_oee',
    title: 'Eficiencia de Planta y Energía (Manufactura)',
    sectorHint: 'Manufactura e industria',
    description: '150 lotes de producción industrial con velocidad de línea, temperatura, horas de mantenimiento y producción por turno.',
    fileName: 'produccion_planta_industrial.csv',
    build: () => {
      const rng = seededRand(3319);
      const turnos = ['Mañana', 'Tarde', 'Noche'];
      const rows: RawRow[] = [];
      for (let i = 1; i <= 150; i++) {
        const velocidadLinea = Number((65 + rng() * 35).toFixed(1));
        const temperaturaHorno = Number((175 + 0.45 * velocidadLinea + randNorm(rng) * 4.2).toFixed(2));
        const horasOperacion = Number((6 + rng() * 10).toFixed(2));
        const defectosPct = Number(Math.max(0.2, 0.8 + 0.035 * Math.max(0, velocidadLinea - 85) + randNorm(rng) * 0.45).toFixed(2));
        const consumoKwh = Number((120 + 4.8 * velocidadLinea + 28 * horasOperacion + randNorm(rng) * 18).toFixed(1));
        const produccionUnidades = Number(
          Math.max(
            200,
            -95 + 11.4 * velocidadLinea + 82 * horasOperacion - 35 * defectosPct + randNorm(rng) * 32
          ).toFixed(0)
        );
        rows.push({
          lote_id: i,
          turno: turnos[i % turnos.length],
          velocidad_linea_rpm: velocidadLinea,
          temperatura_horno_c: temperaturaHorno,
          horas_operacion: horasOperacion,
          tasa_defectos_pct: defectosPct,
          consumo_energia_kwh: consumoKwh,
          produccion_unidades: produccionUnidades,
        });
      }
      return buildDatasetFromRows(rows, 'produccion_planta_industrial.csv', 'CSV');
    },
  },
];
