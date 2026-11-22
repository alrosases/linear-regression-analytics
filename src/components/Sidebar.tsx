import React from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  GitCompare,
  Home,
  Layers,
  LineChart,
  Search,
  Settings2,
  Sparkles,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { SectionId } from '../types/analytics';

interface SidebarProps {
  activeSection: SectionId;
  onSelectSection: (section: SectionId) => void;
  hasDataset: boolean;
  datasetName?: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const NAV_ITEMS: {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresData?: boolean;
}[] = [
  { id: 'dashboard', label: 'Dashboard / Inicio', icon: Home },
  { id: 'upload', label: 'Cargar datos', icon: Upload },
  { id: 'exploration', label: 'Exploración de datos', icon: Search, requiresData: true },
  { id: 'descriptive', label: 'Análisis descriptivo', icon: BarChart3, requiresData: true },
  { id: 'config', label: 'Configuración del modelo', icon: Settings2, requiresData: true },
  { id: 'simple', label: 'Regresión lineal simple', icon: TrendingUp, requiresData: true },
  { id: 'multiple', label: 'Regresión lineal múltiple', icon: Layers, requiresData: true },
  { id: 'diagnostics', label: 'Diagnóstico estadístico', icon: Activity, requiresData: true },
  { id: 'selection', label: 'Selección de variables', icon: CheckCircle2, requiresData: true },
  { id: 'predictions', label: 'Predicciones', icon: LineChart, requiresData: true },
  { id: 'comparison', label: 'Comparación de modelos', icon: GitCompare, requiresData: true },
  { id: 'interpretation', label: 'Interpretación y conclusiones', icon: Sparkles, requiresData: true },
  { id: 'export', label: 'Exportar informe', icon: FileDown, requiresData: true },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  hasDataset,
  datasetName,
  mobileOpen,
  onCloseMobile,
}) => {
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-[264px] shrink-0 bg-[#0E1420] border-r border-[#1E293B] flex flex-col transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 py-4 border-b border-[#1E293B]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <span className="font-display text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
              Econometrix Studio
            </span>
          </div>
          {datasetName && (
            <p className="mt-2.5 text-xs text-slate-400 truncate" title={datasetName}>
              Base activa: <span className="text-slate-200 font-medium">{datasetName}</span>
            </p>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5" aria-label="Módulos de análisis">
          {NAV_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const disabled = Boolean(item.requiresData && !hasDataset);

            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onSelectSection(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[13px] font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                    : disabled
                      ? 'text-slate-600 cursor-not-allowed border border-transparent'
                      : 'text-slate-300 hover:bg-[#161F30] hover:text-slate-100 border border-transparent cursor-pointer'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {idx + 1}. {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
