/**
 * ============================================================================
 * E-METHANE COST CALCULATOR — React component
 * ============================================================================
 *
 * A drop-in React component that renders the full interactive calculator.
 * Uses the pure calculation engine from ./emethaneCost.ts
 *
 * Usage:
 *   import { EmethaneCalculator } from './EmethaneCalculator';
 *   export default function Page() { return <EmethaneCalculator />; }
 *
 * Styling: Tailwind CSS classes. If you don't use Tailwind, replace with
 * CSS modules or styled-components — the structure will stay the same.
 *
 * Features implemented:
 *   - 15 parameter sliders grouped into logical sections
 *   - Three site presets (Ciudad Real, Almería, Custom)
 *   - Live-updating result header
 *   - Plant sizing grid (9 tiles)
 *   - Cost build-up table with percentage shares
 *   - Waterfall chart (horizontal stacked bars)
 *   - Sensitivity tornado
 *   - Calculation trace panel for auditability
 *   - URL state sync (shareable links)
 *
 * Extend with: scenario save to localStorage, PDF export, embed mode,
 * benchmark overlay with gas prices, comparison mode for side-by-side views.
 * ============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Parameters,
  Results,
  CIUDAD_REAL_PRESET,
  ALMERIA_PRESET,
  calculateEmethaneCost,
  parametersToQueryString,
  parseParametersFromQuery,
  runSensitivityAnalysis,
  formatEuro,
} from './emethaneCost';

// ============================================================================
// CONTROL PRIMITIVES
// ============================================================================

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  decimals?: number;
  onChange: (v: number) => void;
  tooltip?: string;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  decimals = 1,
  onChange,
  tooltip,
}: SliderProps) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-md border border-neutral-200 bg-white">
      <div className="flex justify-between items-center text-xs text-neutral-600">
        <span title={tooltip}>
          {label} <span className="text-neutral-400 text-[10px]">({unit})</span>
        </span>
        <span className="text-sm font-medium text-neutral-900 tabular-nums">
          {value.toFixed(decimals)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-700"
      />
    </div>
  );
}

interface PresetButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function PresetButton({ label, active, onClick }: PresetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
        active
          ? 'bg-blue-50 text-blue-900 border-blue-300 font-medium'
          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
      }`}
    >
      {label}
    </button>
  );
}

// ============================================================================
// DISPLAY PRIMITIVES
// ============================================================================

interface SizingTileProps {
  label: string;
  value: string;
}

function SizingTile({ label, value }: SizingTileProps) {
  return (
    <div className="bg-neutral-50 rounded-md px-3 py-2">
      <p className="text-[10px] text-neutral-500">{label}</p>
      <p className="text-sm font-medium text-neutral-900 tabular-nums">{value}</p>
    </div>
  );
}

interface CostRowProps {
  label: string;
  sub?: string;
  annualEur: number;
  eurPerMwh: number;
  sharePct: number;
  indent?: boolean;
  bold?: boolean;
}

function CostRow({
  label,
  sub,
  annualEur,
  eurPerMwh,
  sharePct,
  indent = false,
  bold = false,
}: CostRowProps) {
  const fontWeight = bold ? 'font-medium' : '';
  return (
    <tr className={`${indent ? 'text-[10px] text-neutral-500' : 'text-xs'}`}>
      <td className={`py-1.5 px-2 ${indent ? 'pl-6' : ''} ${fontWeight}`}>
        {label}
        {sub && (
          <span className="block text-[10px] text-neutral-400 font-normal">
            {sub}
          </span>
        )}
      </td>
      <td className={`py-1.5 px-2 text-right tabular-nums ${fontWeight}`}>
        {(annualEur / 1_000_000).toFixed(2)}
      </td>
      <td className={`py-1.5 px-2 text-right tabular-nums ${fontWeight}`}>
        {eurPerMwh.toFixed(2)}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">
        {sharePct.toFixed(1)}%
      </td>
    </tr>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

type PresetId = 'ciudad-real' | 'almeria' | 'custom';

export function EmethaneCalculator() {
  // --- State ---
  const [params, setParams] = useState<Parameters>(CIUDAD_REAL_PRESET);
  const [activePreset, setActivePreset] = useState<PresetId>('ciudad-real');

  // --- URL state sync (on mount, read from URL) ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = new URLSearchParams(window.location.search);
    if (query.toString().length > 0) {
      setParams(parseParametersFromQuery(query, CIUDAD_REAL_PRESET));
      setActivePreset('custom');
    }
  }, []);

  // --- URL state sync (on params change, write to URL) ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = parametersToQueryString(params);
    const url = `${window.location.pathname}?${qs}`;
    window.history.replaceState({}, '', url);
  }, [params]);

  // --- Calculation (memoised) ---
  const results: Results = useMemo(() => calculateEmethaneCost(params), [params]);
  const sensitivity = useMemo(() => runSensitivityAnalysis(params, 0.2), [params]);

  // --- Helpers ---
  const updateParam = <K extends keyof Parameters>(key: K, value: Parameters[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setActivePreset('custom');
  };

  const loadPreset = (id: PresetId) => {
    if (id === 'ciudad-real') setParams(CIUDAD_REAL_PRESET);
    else if (id === 'almeria') setParams(ALMERIA_PRESET);
    setActivePreset(id);
  };

  // --- Derived display values ---
  const ch4OutputK = Math.round(results.ch4OutputMwh / 1000);
  const costBreakdown = [
    { label: 'Green H₂', cost: results.h2TotalCost, color: '#185FA5' },
    { label: 'DAC CO₂', cost: results.dacCost, color: '#0F6E56' },
    { label: 'Methanation + buffer', cost: results.methanationCost, color: '#BA7517' },
    {
      label: 'Water + land + pipeline',
      cost: results.waterCost + results.landCost + results.pipelineCost,
      color: '#888780',
    },
  ];

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 font-sans">
      <header className="mb-8">
        <h1 className="text-2xl font-medium text-neutral-900 mb-1">
          E-methane production cost model
        </h1>
        <p className="text-sm text-neutral-500">
          Parametric cost model for integrated solar + electrolysis + DAC +
          methanation plants in Spain. All calculations run client-side.
        </p>
      </header>

      {/* Site presets */}
      <section className="mb-6">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
          Site preset
        </p>
        <div className="flex gap-2">
          <PresetButton
            label="Ciudad Real"
            active={activePreset === 'ciudad-real'}
            onClick={() => loadPreset('ciudad-real')}
          />
          <PresetButton
            label="Almería"
            active={activePreset === 'almeria'}
            onClick={() => loadPreset('almeria')}
          />
          <PresetButton
            label="Custom"
            active={activePreset === 'custom'}
            onClick={() => setActivePreset('custom')}
          />
        </div>
      </section>

      {/* Main result */}
      <section className="mb-8 bg-neutral-50 rounded-lg p-6 text-center">
        <p className="text-xs text-neutral-500 mb-1">
          Total e-CH₄ production cost
        </p>
        <p className="text-4xl font-medium text-neutral-900 tabular-nums">
          €{results.levelisedCostPerMwh.toFixed(1)}
          <span className="text-lg text-neutral-500"> /MWh CH₄</span>
        </p>
        <p className="text-xs text-neutral-400 mt-2 tabular-nums">
          Annual CH₄: {ch4OutputK.toLocaleString()}k MWh · Annual cost:{' '}
          {formatEuro(results.grandTotalEurYr)} · H₂ LCOH: €
          {results.h2CostPerKg.toFixed(2)}/kg
        </p>
      </section>

      {/* Parameter sliders */}
      <section className="mb-8 space-y-6">
        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 pb-1 border-b">
            1. Solar &amp; electricity
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Slider label="Solar LCOE" unit="€/MWh" value={params.solarLcoe} min={15} max={45} step={0.5} onChange={(v) => updateParam('solarLcoe', v)} tooltip="Levelised cost of electricity from the dedicated solar plant" />
            <Slider label="Solar capacity factor" unit="%" value={params.solarCapacityFactor * 100} min={18} max={35} step={0.5} onChange={(v) => updateParam('solarCapacityFactor', v / 100)} tooltip="Fraction of nameplate capacity actually delivered on average" />
            <Slider label="Electrolyzer efficiency" unit="kWh/kg H₂" value={params.electrolyzerEfficiency} min={45} max={65} step={0.5} onChange={(v) => updateParam('electrolyzerEfficiency', v)} tooltip="Electricity consumption per kilogram of hydrogen produced" />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 pb-1 border-b">
            2. Electrolyzer capex &amp; financing
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Slider label="Electrolyzer TIC" unit="€/kW" value={params.electrolyzerTic} min={200} max={1800} step={10} decimals={0} onChange={(v) => updateParam('electrolyzerTic', v)} tooltip="Total installed cost including balance of plant and EPC" />
            <Slider label="Plant WACC" unit="%" value={params.plantWacc * 100} min={3} max={12} step={0.5} onChange={(v) => updateParam('plantWacc', v / 100)} tooltip="Blended cost of capital for the overall project" />
            <Slider label="Asset life" unit="years" value={params.assetLifeYears} min={15} max={30} step={1} decimals={0} onChange={(v) => updateParam('assetLifeYears', v)} tooltip="Financial amortisation period" />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 pb-1 border-b">
            3. Production scale &amp; stoichiometry
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Slider label="CO₂ captured" unit="kt/yr" value={params.co2CapturedTpy / 1000} min={10} max={500} step={5} decimals={0} onChange={(v) => updateParam('co2CapturedTpy', v * 1000)} tooltip="DAC plant capacity" />
            <Slider label="H₂ per MWh CH₄" unit="kg/MWh" value={params.h2PerMwhCh4} min={30} max={42} step={0.5} onChange={(v) => updateParam('h2PerMwhCh4', v)} tooltip="Stoichiometric hydrogen requirement per unit of methane" />
            <Slider label="CO₂ per MWh CH₄" unit="kg/MWh" value={params.co2PerMwhCh4} min={170} max={230} step={1} decimals={0} onChange={(v) => updateParam('co2PerMwhCh4', v)} tooltip="Stoichiometric CO2 requirement per unit of methane" />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 pb-1 border-b">
            4. DAC CO₂ (all-in levelised cost)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Slider label="DAC cost" unit="€/t CO₂" value={params.dacCostPerTonne} min={80} max={600} step={5} decimals={0} onChange={(v) => updateParam('dacCostPerTonne', v)} tooltip="Single all-in levelised cost per tonne CO2 — includes capex, opex, land and WACC" />
            <div className="p-3 rounded-md border border-neutral-200 bg-neutral-50 text-[11px] text-neutral-500 leading-relaxed">
              All-in levelised cost per tonne — capex, opex, land and financing
              already bundled. No separate WACC applied.
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 pb-1 border-b">
            5. Water, land &amp; pipeline
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Slider label="Water per t CO₂" unit="m³/t" value={params.waterM3PerTonneCo2} min={4} max={15} step={0.5} onChange={(v) => updateParam('waterM3PerTonneCo2', v)} />
            <Slider label="Desal energy" unit="kWh/m³" value={params.desalKwhPerM3} min={1} max={4} step={0.1} onChange={(v) => updateParam('desalKwhPerM3', v)} tooltip="Brackish RO ~1.5, seawater RO ~3.3" />
            <Slider label="Pipeline spur" unit="€M" value={params.pipelineSpurCapexEurM} min={0} max={100} step={5} decimals={0} onChange={(v) => updateParam('pipelineSpurCapexEurM', v)} tooltip="Capex of spur pipeline to existing gas grid trunk" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <Slider label="Land lease" unit="€/ha/yr" value={params.landLeaseEurPerHa} min={500} max={3000} step={100} decimals={0} onChange={(v) => updateParam('landLeaseEurPerHa', v)} />
            <Slider label="Land density" unit="ha/MW" value={params.solarHaPerMw} min={0.3} max={0.8} step={0.01} decimals={2} onChange={(v) => updateParam('solarHaPerMw', v)} />
          </div>
        </div>
      </section>

      {/* Plant sizing */}
      <section className="mb-8">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 pb-1 border-b">
          Derived plant sizing
        </p>
        <div className="grid grid-cols-3 gap-2">
          <SizingTile label="CH₄ output" value={`${ch4OutputK.toLocaleString()}k MWh/yr`} />
          <SizingTile label="CO₂ consumed" value={`${Math.round(results.co2ConsumedTpy / 1000).toLocaleString()}k t/yr`} />
          <SizingTile label="H₂ produced" value={`${Math.round(results.h2ProducedTpy).toLocaleString()} t/yr`} />
          <SizingTile label="Electricity" value={`${Math.round(results.electricityMwh / 1000).toLocaleString()}k MWh/yr`} />
          <SizingTile label="Electrolyzer" value={`${results.electrolyzerMw.toFixed(0)} MW nameplate`} />
          <SizingTile label="Full-load hours" value={`${Math.round(results.fullLoadHours).toLocaleString()} hr/yr`} />
          <SizingTile label="Solar land" value={`${Math.round(results.solarLandHa)} ha`} />
          <SizingTile label="Water" value={`${Math.round(results.waterM3Yr / 365).toLocaleString()} m³/day`} />
          <SizingTile label="H₂ LCOH" value={`€${results.h2CostPerKg.toFixed(2)}/kg`} />
        </div>
      </section>

      {/* Cost build-up table */}
      <section className="mb-8">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 pb-1 border-b">
          Cost build-up
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-500 border-b">
              <th className="py-1.5 px-2 text-left font-medium">Component</th>
              <th className="py-1.5 px-2 text-right font-medium">Annual (€M)</th>
              <th className="py-1.5 px-2 text-right font-medium">€/MWh CH₄</th>
              <th className="py-1.5 px-2 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            <CostRow label="Green H₂" sub="electricity + capex annuity + O&M" annualEur={results.h2TotalCost} eurPerMwh={results.h2TotalCost / results.ch4OutputMwh} sharePct={(results.h2TotalCost / results.grandTotalEurYr) * 100} bold />
            <CostRow label="Electricity" sub={`${Math.round(results.electricityMwh).toLocaleString()} MWh × €${params.solarLcoe}/MWh`} annualEur={results.electricityCost} eurPerMwh={results.electricityCost / results.ch4OutputMwh} sharePct={(results.electricityCost / results.grandTotalEurYr) * 100} indent />
            <CostRow label="Electrolyzer annuity" sub={`${results.electrolyzerMw.toFixed(0)} MW × €${params.electrolyzerTic}/kW × CRF`} annualEur={results.electrolyzerAnnuity} eurPerMwh={results.electrolyzerAnnuity / results.ch4OutputMwh} sharePct={(results.electrolyzerAnnuity / results.grandTotalEurYr) * 100} indent />
            <CostRow label="Electrolyzer O&M" sub="2.5% of capex/yr (includes stack replacement)" annualEur={results.electrolyzerOpex} eurPerMwh={results.electrolyzerOpex / results.ch4OutputMwh} sharePct={(results.electrolyzerOpex / results.grandTotalEurYr) * 100} indent />
            <CostRow label="DAC CO₂" sub={`${Math.round(results.co2ConsumedTpy / 1000)}k t × €${params.dacCostPerTonne}/t — all-in levelised`} annualEur={results.dacCost} eurPerMwh={results.dacCost / results.ch4OutputMwh} sharePct={(results.dacCost / results.grandTotalEurYr) * 100} bold />
            <CostRow label="Methanation + buffer" sub="Sabatier reactor + H₂ buffer + O&M" annualEur={results.methanationCost} eurPerMwh={results.methanationCost / results.ch4OutputMwh} sharePct={(results.methanationCost / results.grandTotalEurYr) * 100} bold />
            <CostRow label="Desalination" sub={`${Math.round(results.waterM3Yr / 1000)}k m³/yr · ${params.desalKwhPerM3} kWh/m³`} annualEur={results.waterCost} eurPerMwh={results.waterCost / results.ch4OutputMwh} sharePct={(results.waterCost / results.grandTotalEurYr) * 100} bold />
            <CostRow label="Land" sub={`${Math.round(results.solarLandHa)} ha @ €${params.landLeaseEurPerHa}/ha`} annualEur={results.landCost} eurPerMwh={results.landCost / results.ch4OutputMwh} sharePct={(results.landCost / results.grandTotalEurYr) * 100} bold />
            <CostRow label="Pipeline spur" sub={`€${params.pipelineSpurCapexEurM}M × CRF(20y)`} annualEur={results.pipelineCost} eurPerMwh={results.pipelineCost / results.ch4OutputMwh} sharePct={(results.pipelineCost / results.grandTotalEurYr) * 100} bold />
            <tr className="font-medium bg-neutral-50 border-t">
              <td className="py-2 px-2">Total</td>
              <td className="py-2 px-2 text-right tabular-nums">
                {(results.grandTotalEurYr / 1_000_000).toFixed(2)}
              </td>
              <td className="py-2 px-2 text-right tabular-nums">
                {results.levelisedCostPerMwh.toFixed(2)}
              </td>
              <td className="py-2 px-2 text-right">100.0%</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Waterfall */}
      <section className="mb-8">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 pb-1 border-b">
          Cost waterfall
        </p>
        <div className="bg-white border rounded-lg p-4 space-y-2">
          {costBreakdown.map((item) => {
            const pct = (item.cost / results.grandTotalEurYr) * 100;
            const eurMwh = item.cost / results.ch4OutputMwh;
            return (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-xs text-neutral-600 w-44 shrink-0">
                  {item.label}
                </span>
                <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(0.5, pct)}%`, background: item.color }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums w-16 text-right">
                  €{eurMwh.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Sensitivity tornado */}
      <section className="mb-8">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 pb-1 border-b">
          Sensitivity (±20% on each parameter)
        </p>
        <div className="bg-white border rounded-lg p-4 space-y-1.5">
          {sensitivity.slice(0, 8).map((s) => {
            const maxSwing = sensitivity[0].swing;
            const widthPct = (s.swing / maxSwing) * 100;
            return (
              <div key={s.parameter} className="flex items-center gap-2">
                <span className="text-xs text-neutral-600 w-44 shrink-0">
                  {s.label}
                </span>
                <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-700 rounded-full"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums w-20 text-right">
                  ±€{(s.swing / 2).toFixed(1)}/MWh
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Calculation trace */}
      <section className="mb-8">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 pb-1 border-b">
          Calculation logic
        </p>
        <div className="bg-neutral-50 rounded-md p-3 text-[11px] text-neutral-600 leading-loose font-mono tabular-nums">
          <div>
            CH₄ = {Math.round(results.co2ConsumedTpy).toLocaleString()} t CO₂ ÷ (
            {params.co2PerMwhCh4}/1000) = <strong>{Math.round(results.ch4OutputMwh).toLocaleString()} MWh/yr</strong>
          </div>
          <div>
            H₂ = {Math.round(results.ch4OutputMwh).toLocaleString()} × {params.h2PerMwhCh4}/1000 = <strong>{Math.round(results.h2ProducedTpy).toLocaleString()} t/yr</strong>
          </div>
          <div>
            Electricity = {Math.round(results.h2ProducedTpy).toLocaleString()} t × {params.electrolyzerEfficiency} = <strong>{Math.round(results.electricityMwh).toLocaleString()} MWh/yr</strong>
          </div>
          <div>
            Electrolyzer = {Math.round(results.electricityMwh).toLocaleString()} ÷ (8760 × {(params.solarCapacityFactor * 100).toFixed(1)}%) = <strong>{results.electrolyzerMw.toFixed(0)} MW</strong>
          </div>
          <div>
            CRF({(params.plantWacc * 100).toFixed(1)}%, {params.assetLifeYears}y) = <strong>{(results.crfPlant * 100).toFixed(3)}%/yr</strong>
          </div>
          <div>
            Elz capex = {results.electrolyzerMw.toFixed(0)} × 1000 × €{params.electrolyzerTic} = <strong>{formatEuro(results.electrolyzerCapex)}</strong>
          </div>
          <div>
            Elz annuity = <strong>{formatEuro(results.electrolyzerAnnuity)}/yr</strong>
          </div>
          <div>
            H₂ total = {formatEuro(results.electricityCost)} electricity + {formatEuro(results.electrolyzerAnnuity)} annuity + {formatEuro(results.electrolyzerOpex)} O&M = <strong>{formatEuro(results.h2TotalCost)}/yr</strong>
          </div>
          <div>
            H₂ LCOH = {formatEuro(results.h2TotalCost)} ÷ {Math.round(results.h2ProducedKg).toLocaleString()} kg = <strong>€{results.h2CostPerKg.toFixed(2)}/kg</strong>
          </div>
          <div className="pt-2 mt-2 border-t">
            Grand total = <strong>{formatEuro(results.grandTotalEurYr)}/yr</strong> ÷ {Math.round(results.ch4OutputMwh).toLocaleString()} MWh = <strong>€{results.levelisedCostPerMwh.toFixed(2)}/MWh CH₄</strong>
          </div>
        </div>
      </section>

      <footer className="text-xs text-neutral-400 border-t pt-4">
        All parameters editable. URL updates as you change inputs — share any
        scenario by copying the browser address.
      </footer>
    </div>
  );
}
