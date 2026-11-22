import { EconomicSector, EconomicSectorResult, RawRow } from '../types/analytics';

interface SectorRule {
  sector: EconomicSector;
  keywords: string[];
  description: string;
}

const SECTOR_RULES: SectorRule[] = [
  {
    sector: 'Financiero y bancario',
    keywords: [
      'credito', 'crédito', 'loan', 'prestamo', 'préstamo', 'tasa', 'interes', 'interés',
      'rate', 'banco', 'bank', 'saldo', 'balance', 'riesgo', 'score', 'mora', 'default',
      'hipoteca', 'mortgage', 'inversion', 'inversión', 'retorno', 'activo', 'pasivo',
      'patrimonio', 'cartera', 'deuda', 'debt', 'cuota', 'ingreso_mensual', 'capital', 'fintech',
    ],
    description: 'variables relacionadas con operaciones crediticias, tasas financieras, saldos, riesgo o indicadores bancarios',
  },
  {
    sector: 'Comercio y retail',
    keywords: [
      'venta', 'ventas', 'sales', 'precio', 'price', 'producto', 'product', 'tienda', 'store',
      'cliente', 'customer', 'descuento', 'discount', 'margen', 'margin', 'ticket', 'orden',
      'order', 'carrito', 'inventario', 'stock', 'sku', 'retail', 'ecommerce', 'sucursal',
      'marketing', 'publicidad', 'ad_spend', 'gasto_pub', 'compra', 'unidades', 'revenue',
    ],
    description: 'métricas comerciales de ventas, precios, inventario, gasto en marketing, tiendas o comportamiento de clientes',
  },
  {
    sector: 'Telecomunicaciones',
    keywords: [
      'churn', 'datos', 'mb', 'gb', 'llamada', 'call', 'minuto', 'minute', 'roaming',
      'banda_ancha', 'fibra', 'plan', 'tarifa', 'antena', 'latencia', 'suscripcion', 'suscriptor',
      'telecom', 'movil', 'móvil', 'recarga', 'arpu', 'ancho_banda', 'operador', 'linea',
    ],
    description: 'indicadores de consumo de red, tráfico de datos, planes tarifarios, suscriptores o rotación (churn)',
  },
  {
    sector: 'Salud',
    keywords: [
      'paciente', 'patient', 'edad', 'age', 'bmi', 'imc', 'presion', 'presión', 'glucosa',
      'glucose', 'colesterol', 'cholesterol', 'hospital', 'clinica', 'clínica', 'diagnostico',
      'diagnóstico', 'tratamiento', 'dosis', 'frecuencia_cardiaca', 'heart', 'blood', 'sangre',
      'salud', 'health', 'medico', 'médico', 'peso', 'estatura', 'insulina', 'enfermedad',
    ],
    description: 'parámetros clínicos, biomarcadores, indicadores hospitalarios o variables médicas de pacientes',
  },
  {
    sector: 'Educación',
    keywords: [
      'estudiante', 'student', 'alumno', 'nota', 'calificacion', 'calificación', 'grade',
      'score_exam', 'examen', 'asistencia', 'attendance', 'colegio', 'universidad', 'docente',
      'profesor', 'curso', 'materia', 'semestre', 'beca', 'desercion', 'deserción', 'estudio',
      'study_hours', 'horas_estudio', 'rendimiento_academico', 'matricula', 'matrícula',
    ],
    description: 'variables académicas asociadas a estudiantes, calificaciones, asistencia, horas de estudio o matrícula',
  },
  {
    sector: 'Manufactura e industria',
    keywords: [
      'produccion', 'producción', 'production', 'planta', 'maquina', 'máquina', 'machine',
      'defecto', 'defect', 'lote', 'batch', 'temperatura', 'presion_psi', 'eficiencia', 'oee',
      'turno', 'shift', 'energia', 'energía', 'kwh', 'materia_prima', 'calidad', 'desperdicio',
      'scrap', 'operario', 'linea_ensamble', 'mantenimiento', 'fabrica', 'fábrica', 'ciclo',
    ],
    description: 'variables operativas de planta industrial, maquinaria, lotes de producción, consumo energético o control de calidad',
  },
  {
    sector: 'Transporte y logística',
    keywords: [
      'envio', 'envío', 'shipment', 'flete', 'freight', 'ruta', 'route', 'distancia', 'distance',
      'km', 'millas', 'tiempo_entrega', 'delivery', 'flota', 'vehiculo', 'vehículo', 'camion',
      'camión', 'combustible', 'fuel', 'almacen', 'almacén', 'warehouse', 'carga', 'peso_kg',
      'transito', 'tránsito', 'puerto', 'aduana', 'retraso', 'delay', 'logistica', 'logística',
    ],
    description: 'indicadores de rutas, distancias, tiempos de entrega, consumo de combustible, flota o gestión de carga',
  },
  {
    sector: 'Tecnología',
    keywords: [
      'servidor', 'server', 'cpu', 'ram', 'memoria', 'latencia', 'latency', 'usuario_activo',
      'dau', 'mau', 'saas', 'licencia', 'api', 'requests', 'error_rate', 'uptime', 'cloud',
      'software', 'app', 'sesion', 'sesión', 'conversion', 'conversión', 'trafico_web', 'clics',
    ],
    description: 'métricas digitales de infraestructura, software SaaS, tráfico de usuarios o rendimiento tecnológico',
  },
  {
    sector: 'Servicios',
    keywords: [
      'servicio', 'service', 'soporte', 'ticket_soporte', 'sla', 'satisfaccion', 'satisfacción',
      'nps', 'reserva', 'booking', 'hotel', 'turismo', 'consultoria', 'consultoría', 'tarifa_hora',
      'contrato', 'renovacion', 'renovación', 'atencion', 'atención', 'agente', 'tiempo_respuesta',
    ],
    description: 'indicadores de prestación de servicios, niveles de atención (SLA), satisfacción del cliente o contratos',
  },
  {
    sector: 'Agropecuario',
    keywords: [
      'cultivo', 'crop', 'hectarea', 'hectárea', 'cosecha', 'harvest', 'suelo', 'soil',
      'lluvia', 'rain', 'precipitacion', 'fertilizante', 'riego', 'ganado', 'leche', 'rendimiento_ha',
      'humedad', 'ph_suelo', 'semilla', 'agro', 'finca', 'parcela', 'toneladas', 'plaga',
    ],
    description: 'variables agronómicas o pecuarias como cultivos, hectáreas, precipitación, suelo o rendimientos por cosecha',
  },
];

function normalizeToken(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_');
}

export function classifyEconomicSector(
  columnNames: string[],
  rows: RawRow[],
  fileName: string
): EconomicSectorResult {
  const normalizedCols = columnNames.map(normalizeToken);
  const normalizedFile = normalizeToken(fileName);

  // Sample string cell tokens (up to 40 rows) to enrich context
  const cellTokens: string[] = [];
  const sampleLimit = Math.min(rows.length, 40);
  for (let i = 0; i < sampleLimit; i++) {
    const row = rows[i];
    for (const col of columnNames) {
      const val = row[col];
      if (typeof val === 'string' && val.trim().length > 1 && val.trim().length < 40) {
        cellTokens.push(normalizeToken(val));
      }
    }
  }
  const combinedCorpus = [...normalizedCols, normalizedFile, ...cellTokens].join(' ');

  let bestSector: EconomicSector = 'No identificado';
  let bestScore = 0;
  let bestMatches: string[] = [];
  let bestRule: SectorRule | null = null;

  for (const rule of SECTOR_RULES) {
    let score = 0;
    const matches = new Set<string>();

    for (const kw of rule.keywords) {
      const normKw = normalizeToken(kw);
      // Higher weight if keyword appears in column names or file name
      const colHit = normalizedCols.some((c) => c === normKw || c.includes(normKw));
      const fileHit = normalizedFile.includes(normKw);
      const cellHit = combinedCorpus.includes(normKw);

      if (colHit) {
        score += 3;
        matches.add(kw);
      } else if (fileHit) {
        score += 2;
        matches.add(kw);
      } else if (cellHit) {
        score += 1;
        matches.add(kw);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSector = rule.sector;
      bestMatches = Array.from(matches).slice(0, 6);
      bestRule = rule;
    }
  }

  if (bestScore === 0) {
    return {
      detectedSector: 'No identificado',
      activeSector: 'No identificado',
      confidence: 'Baja',
      explanation:
        'Los nombres de las variables y valores de muestra no presentan coincidencias claras con un sector económico específico. Puedes asignar manualmente el sector correspondiente o mantener "No identificado".',
      matchedKeywords: [],
      isManualOverride: false,
    };
  }

  if (bestScore < 3) {
    return {
      detectedSector: 'Otros',
      activeSector: 'Otros',
      confidence: 'Baja',
      explanation: `Se encontraron señales débiles asociadas a "${bestSector}" (${bestMatches.join(', ')}), insuficientes para una clasificación concluyente, por lo que se asignó "Otros" de forma preventiva.`,
      matchedKeywords: bestMatches,
      isManualOverride: false,
    };
  }

  const confidence: 'Alta' | 'Media' | 'Baja' =
    bestScore >= 8 ? 'Alta' : bestScore >= 4 ? 'Media' : 'Baja';

  return {
    detectedSector: bestSector,
    activeSector: bestSector,
    confidence,
    explanation: `Clasificado en "${bestSector}" (confianza ${confidence.toLowerCase()}) debido a la presencia de ${bestRule?.description}, evidenciado en términos como: ${bestMatches.join(', ')}.`,
    matchedKeywords: bestMatches,
    isManualOverride: false,
  };
}
