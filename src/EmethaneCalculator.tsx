/**
 * E-Methane Cost Calculator — Redesigned UI
 * Dark-theme, mobile-first, fully responsive.
 */
import { useEffect, useMemo, useState } from 'react';
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
  unit: string; decimals?: number; onChange: (v: number) => void; info?: string;
}

function Slider({ label, value, min, max, step, unit, decimals = 1, onChange, info }: SliderProps) {
  const [open, setOpen] = useState(false);
  const pct = fillPct(value, min, max);
  return (
    <div style={{ marginBottom: '2px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
        <span style={{ fontSize: '12px', color: C.muted, display: 'flex', alignItems: 'center', gap: '3px' }}>
          {label}
          <span style={{ color: C.muted2, fontSize: '10px', marginLeft: '3px' }}>({unit})</span>
          {info && (
            <button
              onClick={() => setOpen(o => !o)}
              style={{
                background: open ? 'rgba(74,143,245,0.18)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${open ? 'rgba(74,143,245,0.4)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '50%', cursor: 'pointer',
                color: open ? C.blue : C.muted2,
                fontSize: '10px', width: '16px', height: '16px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, lineHeight: 1, padding: 0,
                transition: 'all 0.15s',
              }}
            >?</button>
          )}
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
      {open && info && (
        <div style={{
          marginTop: '8px',
          background: 'rgba(74,143,245,0.06)',
          border: '1px solid rgba(74,143,245,0.18)',
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '11.5px',
          color: '#8bb5e8',
          lineHeight: 1.7,
        }}>
          {info}
        </div>
      )}
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
            <Slider label="Solar LCOE" unit="€/MWh" value={params.solarLcoe} min={15} max={45} step={0.5} onChange={v => set('solarLcoe', v)} info="How much the dedicated solar plant charges per MWh of electricity. Spain's sunny climate and cheap land make it one of the world's cheapest solar locations — €20–23/MWh with single-axis trackers. For comparison: UK offshore wind is ~€60–80/MWh, German solar ~€35/MWh. This is the single largest driver of hydrogen cost, so even small improvements here matter a lot." />
            <Slider label="Capacity factor" unit="%" value={params.solarCapacityFactor * 100} min={18} max={35} step={0.5} decimals={1} onChange={v => set('solarCapacityFactor', v / 100)} info="The fraction of the year the solar plant operates at full output. At 25%, the plant generates power for ~2,190 hours/year (out of 8,760). Southern Spain with single-axis trackers (panels that rotate to follow the sun) achieves 27–30% — among the best in Europe. A higher capacity factor means the same electrolyzer produces more hydrogen per year, reducing cost per kg." />
            <Slider label="Electrolyzer efficiency" unit="kWh/kg H₂" value={params.electrolyzerEfficiency} min={45} max={65} step={0.5} onChange={v => set('electrolyzerEfficiency', v)} info="How much electricity it takes to produce 1 kg of hydrogen by splitting water. The theoretical physics minimum is ~39 kWh/kg. State-of-the-art alkaline electrolyzers in 2024 achieve 50–52 kWh/kg; PEM systems are typically 55–60 kWh/kg. Lower is better — every 1 kWh/kg improvement saves ~€2/MWh of methane at Spanish electricity prices." />
          </Section>

          <Section title="Electrolyzer Capex & Financing" icon="⚡">
            <Slider label="Electrolyzer TIC" unit="€/kW" value={params.electrolyzerTic} min={200} max={1800} step={10} decimals={0} onChange={v => set('electrolyzerTic', v)} info="Total Installed Cost — every euro to get the electrolyzer running: the cell stacks, power electronics, piping, civil works, and EPC contractor margin. Chinese alkaline electrolyzers: €250–350/kW (2030 delivery, default). EU-manufactured: €600–900/kW. Western premium brands today: €1,200+/kW. The default 340 €/kW is an aggressive but realistic 2030 target for Chinese alkaline supply chains (source: BloombergNEF 2024). A 450 MW plant at this cost = ~€153M capex." />
            <Slider label="Plant WACC" unit="%" value={params.plantWacc * 100} min={3} max={12} step={0.5} onChange={v => set('plantWacc', v / 100)} info="Weighted Average Cost of Capital — the blended annual interest rate paid across all debt and equity financing the project. Think of it as 'how expensive is the money'. At 6%, every €100M of capex costs ~€8M/yr to service. EU-backed green hydrogen projects can achieve 4–5% (Innovation Fund grants + cheap EIB debt). Merchant projects without subsidies typically 8–10%. Lower WACC has an outsized impact because the electrolyzer capex is large." />
            <Slider label="Asset life" unit="years" value={params.assetLifeYears} min={15} max={30} step={1} decimals={0} onChange={v => set('assetLifeYears', v)} info="How many years the model amortises capital costs over. Longer life = lower annual capital charge = lower cost per MWh. 20 years is the standard for industrial infrastructure. The electrolyzer stack itself may need replacement at ~80,000 hours (~9 years at 25% CF) — this is captured in the 2.5% O&M rate rather than a separate line item." />
          </Section>

          <Section title="Production Scale" icon="🏭" defaultOpen={false}>
            <Slider label="CO₂ captured" unit="kt/yr" value={params.co2CapturedTpy / 1000} min={10} max={500} step={5} decimals={0} onChange={v => set('co2CapturedTpy', v * 1000)} info="Scale of the Direct Air Capture plant in thousands of tonnes of CO₂ per year. The default 100 kt/yr is a large commercial-scale plant — roughly 10× Climeworks' flagship Mammoth facility in Iceland (which captures ~36,000 t/yr). At 100 kt/yr CO₂ and 200 kg CO₂ per MWh CH₄, you produce ~500,000 MWh of methane/yr (≈ 45 MW average output). This parameter sets the scale of the entire plant." />
            <Slider label="H₂ per MWh CH₄" unit="kg/MWh" value={params.h2PerMwhCh4} min={30} max={42} step={0.5} onChange={v => set('h2PerMwhCh4', v)} info="Hydrogen consumed per MWh of methane produced — set by the Sabatier reaction (CO₂ + 4H₂ → CH₄ + 2H₂O). The theoretical minimum is ~32 kg H₂/MWh CH₄ at 100% conversion. In practice, methanation reactors run at ~80% single-pass conversion with recycling losses, giving ~36 kg/MWh (default). Higher values = more electricity and electrolyzer capacity needed. This number is largely fixed by chemistry and hard to change without fundamentally different reactor designs." />
            <Slider label="CO₂ per MWh CH₄" unit="kg/MWh" value={params.co2PerMwhCh4} min={160} max={240} step={2} decimals={0} onChange={v => set('co2PerMwhCh4', v)} info="CO₂ consumed per MWh of methane produced. Theoretical minimum ~180 kg/MWh at perfect conversion. Practical value ~200 kg/MWh (default) accounting for reactor inefficiency and gas separation losses. For context: burning 1 MWh of fossil natural gas releases ~200 kg CO₂ — so e-methane is roughly carbon-neutral when the CO₂ feedstock is captured from the atmosphere." />
          </Section>

          <Section title="DAC Cost" icon="🌬️" defaultOpen={false}>
            <Slider label="DAC cost" unit="€/t CO₂" value={params.dacCostPerTonne} min={50} max={700} step={5} decimals={0} onChange={v => set('dacCostPerTonne', v)} info="The all-in cost to capture one tonne of CO₂ directly from the atmosphere, including DAC capex, electricity, maintenance, and financing. Current commercial cost (Climeworks, Carbon Engineering): €400–800/t. The default €278/t reflects a 100 kt/yr Brineworks SOAK plant with EU Innovation Fund grant support — achievable by ~2028–30. This is typically the second-largest cost component after hydrogen. Note: DAC needs both electricity and heat; in this model those costs are bundled into the single €/t figure." />
          </Section>

          <Section title="Water, Land & Pipeline" icon="🌊" defaultOpen={false}>
            <Slider label="Water per tonne CO₂" unit="m³/t" value={params.waterM3PerTonneCo2} min={2} max={20} step={0.5} onChange={v => set('waterM3PerTonneCo2', v)} info="Total water consumed per tonne of CO₂ processed, covering both the DAC unit (humidified air contactors need makeup water) and electrolysis (splitting water is literally the process). Electrolysis dominates: ~9 kg H₂O per kg H₂, or ~324 t H₂O per tonne H₂. At 100 kt/yr CO₂ scale, the plant needs roughly 500,000–900,000 m³/yr of water — equivalent to a small town's annual supply. In arid Spain, this water must be desalinated." />
            <Slider label="Desal energy" unit="kWh/m³" value={params.desalKwhPerM3} min={0.8} max={5} step={0.1} onChange={v => set('desalKwhPerM3', v)} info="Electricity needed to produce 1 m³ of clean water by reverse osmosis (RO). The default 1.5 kWh/m³ assumes brackish groundwater — slightly salty well water common in Spain's dry interior (Ciudad Real sits on a semi-arid plateau). Coastal sites using seawater need 3.0–4.5 kWh/m³ because seawater is ~35g salt/L vs brackish ~3–10g/L, requiring much higher pressure. Almería preset uses 3.3 kWh/m³ for seawater. Despite sounding large, desalination is a minor cost: even at 3.3 kWh/m³ it adds only ~€1–2/MWh CH₄." />
            <Slider label="Land lease" unit="€/ha/yr" value={params.landLeaseEurPerHa} min={500} max={4000} step={50} decimals={0} onChange={v => set('landLeaseEurPerHa', v)} info="Annual rent for the solar farm land. In Spain, agricultural land repurposed for solar leases for €1,000–2,500/ha/yr — dry scrubland and non-irrigable plots at the lower end, prime agricultural land at the upper end. A 450 MW solar plant needs ~225 ha (2.25 km²). Even at €2,500/ha/yr, land costs only ~€560k/yr — less than 1% of total annual costs. Land is not a significant cost driver for this model." />
            <Slider label="Solar land density" unit="ha/MW" value={params.solarHaPerMw} min={0.3} max={0.8} step={0.01} onChange={v => set('solarHaPerMw', v)} info="How much land a solar plant uses per MW of installed capacity. Fixed-tilt panels: 0.3–0.4 ha/MW (more panels per hectare but they shade each other). Single-axis trackers (default 0.5 ha/MW): panels rotate east-to-west through the day, generating 15–25% more electricity but needing more space between rows to avoid shading. Bifacial panels on trackers: ~0.45–0.55 ha/MW. The extra land needed for trackers is easily justified by the capacity factor improvement." />
            <Slider label="Pipeline spur capex" unit="€M" value={params.pipelineSpurCapexEurM} min={0} max={50} step={1} decimals={0} onChange={v => set('pipelineSpurCapexEurM', v)} info="One-time capital cost to build a pipeline connecting the plant to the high-pressure natural gas grid. Set to €0 if the site already sits on an existing trunk line (some industrial zones in Spain do). A 10–20 km pipeline spur typically costs €15–30M. Even at €30M, amortised over 20 years at 6% WACC, it adds only ~€2.5M/yr — about €3–5/MWh CH₄. Pipeline is rarely a deciding factor in site selection compared to solar resource and electricity cost." />
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
