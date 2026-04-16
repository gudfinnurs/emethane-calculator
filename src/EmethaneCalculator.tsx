/**
 * E-Methane Cost Calculator — Redesigned UI
 * Dark-theme, mobile-first, fully responsive.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ALMERIA_PRESET,
  CIUDAD_REAL_PRESET,
  Parameters,
  Results,
  SensitivityResult,
  calculateEmethaneCost,
  formatEuro,
  parametersToQueryString,
  parseParametersFromQuery,
  runSensitivityAnalysis,
} from './emethaneCost';

// ── Colour palette ──────────────────────────────────────────────────────────

const C = {
  bg:      '#07101f',
  surface: '#0c1828',
  card:    '#101f35',
  card2:   '#142338',
  border:  'rgba(255,255,255,0.07)',
  border2: 'rgba(255,255,255,0.13)',
  text:    '#d4e2f7',
  muted:   '#5a7498',
  muted2:  '#3d5270',
  blue:    '#4a8ff5',
  green:   '#22d3a0',
  amber:   '#f59e0b',
  purple:  '#a78bfa',
  red:     '#f87171',
};

const COST_LINES = [
  { key: 'h2TotalCost',     label: 'Green H₂',           color: '#4a8ff5' },
  { key: 'dacCost',         label: 'DAC CO₂',            color: '#22d3a0' },
  { key: 'methanationCost', label: 'Methanation + buffer',color: '#f59e0b' },
  { key: 'waterCost',       label: 'Water (desal)',       color: '#a78bfa' },
  { key: 'landCost',        label: 'Land lease',          color: '#60a5fa' },
  { key: 'pipelineCost',    label: 'Pipeline spur',       color: '#94a3b8' },
] as const;

// ── Small helpers ────────────────────────────────────────────────────────────

function n(x: number, d = 0) { return x.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }); }
function fillPct(val: number, mn: number, mx: number) { return Math.max(0, Math.min(100, ((val - mn) / (mx - mn)) * 100)); }

// ── Slider ───────────────────────────────────────────────────────────────────

interface SliderProps {
  label: string; value: number; min: number; max: number; step: number;
  unit: string; decimals?: number; onChange: (v: number) => void; tooltip?: string;
}

function Slider({ label, value, min, max, step, unit, decimals = 1, onChange, tooltip }: SliderProps) {
  const pct = fillPct(value, min, max);
  return (
    <div style={{ marginBottom: '2px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px' }}>
        <span title={tooltip} style={{ fontSize: '12px', color: C.muted, cursor: tooltip ? 'help' : undefined }}>
          {label}
          <span style={{ color: C.muted2, fontSize: '10px', marginLeft: '4px' }}>({unit})</span>
        </span>
        <span style={{ fontSize: '14px', fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums', minWidth: '52px', textAlign: 'right' }}>
          {value.toFixed(decimals)}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ background: `linear-gradient(to right, ${C.blue} ${pct}%, #1a2e4a ${pct}%)` }}
      />
    </div>
  );
}

// ── Accordion section ────────────────────────────────────────────────────────

function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
          color: C.text, textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
          <span style={{ fontSize: '15px' }}>{icon}</span> {title}
        </span>
        <span style={{ color: C.muted, fontSize: '11px', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Metric tile ──────────────────────────────────────────────────────────────

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: C.card2, borderRadius: '10px', padding: '12px 14px', border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: '10px', color: C.muted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: C.muted2, marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

// ── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} style={{
      background: C.card2, border: `1px solid ${C.border2}`, borderRadius: '8px',
      padding: '6px 12px', fontSize: '12px', color: copied ? C.green : C.muted,
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
      transition: 'color 0.2s',
    }}>
      {copied ? '✓ Copied' : '🔗 Share'}
    </button>
  );
}

// ── Waterfall chart ──────────────────────────────────────────────────────────

function WaterfallChart({ results }: { results: Results }) {
  const total = results.grandTotalEurYr;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      {COST_LINES.map(({ key, label, color }) => {
        const val = results[key as keyof Results] as number;
        const pct = (val / total) * 100;
        const perMwh = val / results.ch4OutputMwh;
        return (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
              <span style={{ color: C.muted, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, display: 'inline-block', flexShrink: 0 }} />
                {label}
              </span>
              <span style={{ color: C.text, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                €{perMwh.toFixed(1)}/MWh <span style={{ color: C.muted2 }}>({pct.toFixed(0)}%)</span>
              </span>
            </div>
            <div style={{ height: '6px', background: C.card2, borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.3s' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Sensitivity tornado ──────────────────────────────────────────────────────

function Tornado({ items }: { items: SensitivityResult[] }) {
  const top = items.slice(0, 8);
  const maxSwing = top[0]?.swing ?? 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {top.map(s => {
        const barW = (s.swing / maxSwing) * 100;
        const half = s.swing / 2;
        return (
          <div key={s.parameter} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: C.muted, width: '130px', flexShrink: 0, textAlign: 'right' }}>{s.label}</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '100%', height: '8px', background: C.card2, borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  position: 'absolute', top: 0, left: `${50 - barW / 2}%`,
                  width: `${barW}%`, height: '100%',
                  background: `linear-gradient(to right, ${C.blue}, #7cb8ff)`,
                  borderRadius: '4px', transition: 'all 0.3s',
                }} />
                <div style={{ position: 'absolute', top: 0, left: '50%', width: '1px', height: '100%', background: C.muted2 }} />
              </div>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: C.text, width: '52px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              ±€{half.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Calculation trace ────────────────────────────────────────────────────────

function Trace({ p, r }: { p: Parameters; r: Results }) {
  const [open, setOpen] = useState(false);
  const rows: [string, string][] = [
    ['CH₄ output', `${n(r.co2ConsumedTpy)} t CO₂ ÷ (${p.co2PerMwhCh4}/1000) = ${n(r.ch4OutputMwh)} MWh/yr`],
    ['H₂ produced', `${n(r.ch4OutputMwh)} × ${p.h2PerMwhCh4}/1000 = ${n(r.h2ProducedTpy)} t/yr`],
    ['Electricity', `${n(r.h2ProducedTpy)} t × ${p.electrolyzerEfficiency} = ${n(r.electricityMwh)} MWh/yr`],
    ['Electrolyzer size', `${n(r.electricityMwh)} ÷ (8760 × ${(p.solarCapacityFactor * 100).toFixed(1)}%) = ${r.electrolyzerMw.toFixed(0)} MW`],
    ['CRF', `CRF(${(p.plantWacc * 100).toFixed(1)}%, ${p.assetLifeYears}yr) = ${(r.crfPlant * 100).toFixed(3)}%/yr`],
    ['Elz capex', `${r.electrolyzerMw.toFixed(0)} × 1000 × €${p.electrolyzerTic} = ${formatEuro(r.electrolyzerCapex)}`],
    ['H₂ total cost', `${formatEuro(r.electricityCost)} + ${formatEuro(r.electrolyzerAnnuity)} + ${formatEuro(r.electrolyzerOpex)} = ${formatEuro(r.h2TotalCost)}/yr`],
    ['H₂ LCOH', `${formatEuro(r.h2TotalCost)} ÷ ${n(r.h2ProducedKg)} kg = €${r.h2CostPerKg.toFixed(2)}/kg`],
    ['Grand total', `${formatEuro(r.grandTotalEurYr)}/yr ÷ ${n(r.ch4OutputMwh)} MWh = €${r.levelisedCostPerMwh.toFixed(2)}/MWh CH₄`],
  ];
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '8px',
        padding: '8px 14px', fontSize: '12px', color: C.muted, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <span>{open ? '▾' : '▸'}</span> Calculation trace
      </button>
      {open && (
        <div style={{
          marginTop: '10px', background: C.card, border: `1px solid ${C.border}`,
          borderRadius: '10px', padding: '14px', fontFamily: 'monospace', fontSize: '11px',
          color: C.muted, lineHeight: 1.8,
        }}>
          {rows.map(([label, formula]) => (
            <div key={label}>
              <span style={{ color: C.muted2 }}>{label}:</span>{'  '}
              <span dangerouslySetInnerHTML={{ __html: formula.replace(/(<strong>.*?<\/strong>)/g, '$1') }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Preset = 'ciudad-real' | 'almeria' | 'custom';

const PRESETS: { id: Preset; label: string; emoji: string }[] = [
  { id: 'ciudad-real', label: 'Ciudad Real', emoji: '🌞' },
  { id: 'almeria',     label: 'Almería',      emoji: '🏜️' },
  { id: 'custom',      label: 'Custom',       emoji: '✏️' },
];

export function EmethaneCalculator() {
  const [params, setParams] = useState<Parameters>(CIUDAD_REAL_PRESET);
  const [preset, setPreset] = useState<Preset>('ciudad-real');

  // URL sync on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.toString()) { setParams(parseParametersFromQuery(q, CIUDAD_REAL_PRESET)); setPreset('custom'); }
  }, []);

  // URL sync on change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.history.replaceState({}, '', `${window.location.pathname}?${parametersToQueryString(params)}`);
  }, [params]);

  const results = useMemo(() => calculateEmethaneCost(params), [params]);
  const sensitivity = useMemo(() => runSensitivityAnalysis(params, 0.2), [params]);

  const set = <K extends keyof Parameters>(k: K, v: Parameters[K]) => {
    setParams(p => ({ ...p, [k]: v })); setPreset('custom');
  };

  const loadPreset = (id: Preset) => {
    if (id === 'ciudad-real') setParams(CIUDAD_REAL_PRESET);
    else if (id === 'almeria') setParams(ALMERIA_PRESET);
    setPreset(id);
  };

  const cost = results.levelisedCostPerMwh;
  const totalM = (results.grandTotalEurYr / 1e6).toFixed(1);

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', color: C.text }}>

      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(7,16,31,0.93)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${C.border}`,
        padding: 'env(safe-area-inset-top,0) 0 0',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: C.text, letterSpacing: '-0.2px' }}>
              ⚗️ E-methane Calculator
            </div>
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '1px' }}>Solar · Electrolysis · DAC · Methanation</div>
          </div>

          {/* Live cost in header */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '22px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: C.blue, letterSpacing: '-0.5px' }}>
              €{cost.toFixed(1)}
            </span>
            <span style={{ fontSize: '12px', color: C.muted }}>/MWh CH₄</span>
          </div>

          <CopyBtn />
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap' }}>

        {/* ══ LEFT: Parameters ══════════════════════════════════════════════ */}
        <div style={{ width: '100%', maxWidth: '420px', flexShrink: 0 }}>

          {/* Preset selector */}
          <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: '11px', color: C.muted2, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Site preset</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => loadPreset(p.id)}
                  style={{
                    flex: 1, padding: '9px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                    background: preset === p.id ? 'rgba(74,143,245,0.15)' : C.card,
                    border: `1px solid ${preset === p.id ? C.blue : C.border}`,
                    color: preset === p.id ? C.blue : C.muted,
                    boxShadow: preset === p.id ? '0 0 0 1px rgba(74,143,245,0.2)' : 'none',
                  }}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Parameter sections */}
          <Section title="Solar & Electricity" icon="☀️">
            <Slider label="Solar LCOE" unit="€/MWh" value={params.solarLcoe} min={15} max={45} step={0.5} onChange={v => set('solarLcoe', v)} tooltip="Levelised cost of electricity from the dedicated solar plant" />
            <Slider label="Capacity factor" unit="%" value={params.solarCapacityFactor * 100} min={18} max={35} step={0.5} decimals={1} onChange={v => set('solarCapacityFactor', v / 100)} tooltip="Fraction of nameplate capacity actually delivered on average" />
            <Slider label="Electrolyzer efficiency" unit="kWh/kg H₂" value={params.electrolyzerEfficiency} min={45} max={65} step={0.5} onChange={v => set('electrolyzerEfficiency', v)} tooltip="Electricity consumption per kilogram of hydrogen produced" />
          </Section>

          <Section title="Electrolyzer Capex & Financing" icon="⚡">
            <Slider label="Electrolyzer TIC" unit="€/kW" value={params.electrolyzerTic} min={200} max={1800} step={10} decimals={0} onChange={v => set('electrolyzerTic', v)} tooltip="Total installed cost including balance of plant and EPC" />
            <Slider label="Plant WACC" unit="%" value={params.plantWacc * 100} min={3} max={12} step={0.5} onChange={v => set('plantWacc', v / 100)} tooltip="Blended cost of capital for the overall project" />
            <Slider label="Asset life" unit="years" value={params.assetLifeYears} min={15} max={30} step={1} decimals={0} onChange={v => set('assetLifeYears', v)} tooltip="Financial amortisation period" />
          </Section>

          <Section title="Production Scale" icon="🏭" defaultOpen={false}>
            <Slider label="CO₂ captured" unit="kt/yr" value={params.co2CapturedTpy / 1000} min={10} max={500} step={5} decimals={0} onChange={v => set('co2CapturedTpy', v * 1000)} tooltip="DAC plant capacity — drives all other volumes" />
            <Slider label="H₂ per MWh CH₄" unit="kg/MWh" value={params.h2PerMwhCh4} min={30} max={42} step={0.5} onChange={v => set('h2PerMwhCh4', v)} tooltip="Hydrogen stoichiometry — theoretical 32, practical 36" />
            <Slider label="CO₂ per MWh CH₄" unit="kg/MWh" value={params.co2PerMwhCh4} min={160} max={240} step={2} decimals={0} onChange={v => set('co2PerMwhCh4', v)} tooltip="CO₂ stoichiometry — theoretical 180, practical 200" />
          </Section>

          <Section title="DAC Cost" icon="🌬️" defaultOpen={false}>
            <Slider label="DAC cost" unit="€/t CO₂" value={params.dacCostPerTonne} min={50} max={700} step={5} decimals={0} onChange={v => set('dacCostPerTonne', v)} tooltip="All-in levelised cost per tonne CO₂ captured — bundles capex, opex, financing" />
          </Section>

          <Section title="Water, Land & Pipeline" icon="🌊" defaultOpen={false}>
            <Slider label="Water per tonne CO₂" unit="m³/t" value={params.waterM3PerTonneCo2} min={2} max={20} step={0.5} onChange={v => set('waterM3PerTonneCo2', v)} />
            <Slider label="Desal energy" unit="kWh/m³" value={params.desalKwhPerM3} min={0.8} max={5} step={0.1} onChange={v => set('desalKwhPerM3', v)} tooltip="Brackish RO: 1.5. Seawater RO: 3.3." />
            <Slider label="Land lease" unit="€/ha/yr" value={params.landLeaseEurPerHa} min={500} max={4000} step={50} decimals={0} onChange={v => set('landLeaseEurPerHa', v)} />
            <Slider label="Solar land density" unit="ha/MW" value={params.solarHaPerMw} min={0.3} max={0.8} step={0.01} onChange={v => set('solarHaPerMw', v)} />
            <Slider label="Pipeline spur capex" unit="€M" value={params.pipelineSpurCapexEurM} min={0} max={50} step={1} decimals={0} onChange={v => set('pipelineSpurCapexEurM', v)} tooltip="Set 0 if site is already on existing gas trunk" />
          </Section>
        </div>

        {/* ══ RIGHT: Results ════════════════════════════════════════════════ */}
        <div style={{ flex: 1, minWidth: '300px', borderLeft: `1px solid ${C.border}` }}>

          {/* Hero cost banner */}
          <div style={{
            padding: '28px 24px',
            background: `linear-gradient(135deg, rgba(74,143,245,0.1) 0%, rgba(34,211,160,0.05) 100%)`,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Levelised cost of e-CH₄
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <span style={{
                fontSize: '52px', fontWeight: 800, color: C.blue,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-1.5px', lineHeight: 1,
              }}>
                €{cost.toFixed(1)}
              </span>
              <span style={{ fontSize: '18px', color: C.muted, fontWeight: 400 }}>/MWh CH₄</span>
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {[
                { label: 'Annual cost', val: `€${totalM}M/yr` },
                { label: 'H₂ LCOH', val: `€${results.h2CostPerKg.toFixed(2)}/kg` },
                { label: 'Annual CH₄', val: `${n(Math.round(results.ch4OutputMwh / 1000))}k MWh/yr` },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: '10px', color: C.muted2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{m.val}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

            {/* Plant sizing tiles */}
            <div>
              <SectionLabel>Plant sizing</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                <Tile label="Electrolyzer" value={`${n(results.electrolyzerMw, 0)} MW`} sub={`${n(results.fullLoadHours, 0)} hrs/yr`} />
                <Tile label="H₂ produced" value={`${n(results.h2ProducedTpy, 0)} t/yr`} sub={`€${results.h2CostPerKg.toFixed(2)}/kg`} />
                <Tile label="Electricity used" value={`${n(Math.round(results.electricityMwh / 1000))} GWh/yr`} />
                <Tile label="Solar land" value={`${n(results.solarLandHa, 0)} ha`} sub={`≈${(results.solarLandHa / 100).toFixed(1)} km²`} />
                <Tile label="Water demand" value={`${n(Math.round(results.waterM3Yr / 1000))} km³/yr`} sub="desalinated" />
                <Tile label="CH₄ output" value={`${n(Math.round(results.ch4OutputMwh / 1000))}k MWh`} sub="per year" />
              </div>
            </div>

            {/* Cost breakdown */}
            <div>
              <SectionLabel>Cost breakdown</SectionLabel>
              <WaterfallChart results={results} />
            </div>

            {/* Sensitivity */}
            <div>
              <SectionLabel>Sensitivity (±20%)</SectionLabel>
              <Tornado items={sensitivity} />
            </div>

            {/* Calc trace */}
            <div>
              <Trace p={params} r={results} />
            </div>

            {/* Footer */}
            <div style={{ fontSize: '11px', color: C.muted2, borderTop: `1px solid ${C.border}`, paddingTop: '14px', lineHeight: 1.6 }}>
              All calculations run client-side. Shareable URLs encode every slider state.
              Built for Brineworks internal modelling — not investment advice.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '11px', color: C.muted, textTransform: 'uppercase',
      letterSpacing: '0.08em', marginBottom: '12px', display: 'flex',
      alignItems: 'center', gap: '8px',
    }}>
      {children}
      <div style={{ flex: 1, height: '1px', background: C.border }} />
    </div>
  );
}
