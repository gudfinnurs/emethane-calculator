/**
 * ============================================================================
 * E-METHANE COST CALCULATION ENGINE
 * ============================================================================
 *
 * A fully parametric cost model for green e-methane production.
 *
 * The plant integrates four process steps:
 *   1. Solar PV generates renewable electricity
 *   2. Electrolyzer splits water into green hydrogen
 *   3. Direct air capture (DAC) supplies CO2 feedstock
 *   4. Sabatier methanation combines H2 + CO2 -> CH4 + H2O
 *
 * The final product is renewable methane that can be injected into the
 * natural gas grid or liquefied for transport.
 *
 * ----------------------------------------------------------------------------
 * UNIT DISCIPLINE (CRITICAL)
 * ----------------------------------------------------------------------------
 * Every cost variable in this file is in RAW EUROS PER YEAR (EUR/yr).
 * Never mix raw euros and millions-of-euros in the same sum.
 * Conversion to display units (EUR M, EUR/MWh CH4) happens only in the
 * helper functions at the bottom.
 *
 * The unit identity that makes electricity calculation work cleanly:
 *     tonnes_H2 × kWh/kg = MWh
 * because the 1000 (tonnes -> kg) and the 1000 (kWh -> MWh) cancel.
 *
 * ----------------------------------------------------------------------------
 * KEY SOURCES AND ASSUMPTIONS
 * ----------------------------------------------------------------------------
 * - Electrolyzer TIC 340 EUR/kW (aggressive Chinese alkaline, 2030 delivery)
 *   Reference: BloombergNEF 1H 2024 Hydrogen Levelised Cost Update, IEA Global
 *   Hydrogen Review 2024
 * - Solar LCOE 20-23 EUR/MWh for Spanish sites with single-axis trackers
 *   Reference: IRENA Renewable Power Generation Costs 2023, Lazard LCOE+ 2024
 * - DAC cost 278 EUR/t CO2 (SOAK 100 kt/yr plant with EU IF grant support)
 *   Derived from Brineworks internal capex/opex model
 * - Methanation capex 17M EUR for 57 MW CH4 output plant
 *   Reference: Fraunhofer ISE methanation cost study 2023
 * - H2 buffer storage 25M EUR for 12-24 hr pressure vessel storage
 *   Reference: IEA Future of Hydrogen 2019, updated with 2024 vendor quotes
 * - Desalination brackish RO 1.5 kWh/m3, seawater RO 3.3 kWh/m3
 *   Reference: IDA Desalination Yearbook 2023
 * - Stoichiometry H2:CO2 for Sabatier reaction CO2 + 4H2 -> CH4 + 2H2O
 *   Theoretical minimum 0.5 kg H2 per kg CO2; practical with losses ~0.18
 *   implies 36 kg H2 and 200 kg CO2 per MWh CH4 at ~80% conversion efficiency
 *
 * All assumptions can be overridden via the Parameters object.
 * ============================================================================
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Full parameter set for the calculation.
 * Every user-adjustable input to the model lives here.
 */
export interface Parameters {
  // -- Solar & electricity --
  /** Solar plant levelised cost of electricity, EUR/MWh. Typical Spain 2030: 18-28. */
  solarLcoe: number;
  /** Solar capacity factor, fraction (0-1). Spain: 0.22-0.30 for single-axis trackers. */
  solarCapacityFactor: number;
  /** Electrolyzer electrical efficiency, kWh consumed per kg H2 produced. Modern alkaline: 50-55. */
  electrolyzerEfficiency: number;

  // -- Electrolyzer capex & financing --
  /** Electrolyzer total installed cost, EUR/kW. Pure Chinese: 250-350. Blended: 450-650. Western: 1200+. */
  electrolyzerTic: number;
  /** Plant weighted average cost of capital, fraction (0-1). Project finance SOAK: 0.05-0.08. */
  plantWacc: number;
  /** Plant asset life, years. Typical: 20-25. */
  assetLifeYears: number;

  // -- Production scale & stoichiometry --
  /** Annual CO2 captured by DAC, tonnes/yr. */
  co2CapturedTpy: number;
  /** Hydrogen required per MWh CH4 produced, kg/MWh. Theoretical ~32, practical ~36. */
  h2PerMwhCh4: number;
  /** CO2 consumed per MWh CH4 produced, kg/MWh. Theoretical ~180, practical ~200. */
  co2PerMwhCh4: number;

  // -- DAC cost (all-in levelised, includes capex+opex+land+WACC) --
  /** DAC cost per tonne CO2, EUR/t. Bundles all DAC economics into single parameter. */
  dacCostPerTonne: number;

  // -- Water & desalination --
  /** Water required per tonne CO2 captured, m3/t. Typical: 5-10. */
  waterM3PerTonneCo2: number;
  /** Desalination energy intensity, kWh/m3. Brackish RO: 1.0-2.0. Seawater RO: 3.0-4.5. */
  desalKwhPerM3: number;

  // -- Land --
  /** Solar land lease rate, EUR/ha/year. Spain agricultural-to-solar: 1000-2500. */
  landLeaseEurPerHa: number;
  /** Solar land density, hectares per MW installed. Single-axis: 0.45-0.55. */
  solarHaPerMw: number;

  // -- Pipeline --
  /** Capital cost of pipeline spur to gas grid, EUR millions. Set 0 if site is on existing trunk. */
  pipelineSpurCapexEurM: number;
}

/**
 * Full set of results from a single calculation.
 * Every value exposed here is a number in SI units or raw euros per year.
 */
export interface Results {
  // -- Plant sizing --
  /** Annual methane output, MWh/yr. */
  ch4OutputMwh: number;
  /** Annual CO2 consumed, tonnes/yr. */
  co2ConsumedTpy: number;
  /** Annual H2 produced, tonnes/yr. */
  h2ProducedTpy: number;
  /** Annual H2 produced, kg/yr. */
  h2ProducedKg: number;
  /** Annual electricity required, MWh/yr. */
  electricityMwh: number;
  /** Electrolyzer nameplate capacity, MW. */
  electrolyzerMw: number;
  /** Electrolyzer full-load hours per year. */
  fullLoadHours: number;
  /** Solar plant area required, hectares. */
  solarLandHa: number;
  /** Annual water demand, m3/yr. */
  waterM3Yr: number;

  // -- Intermediate economic values --
  /** Capital recovery factor for plant WACC and asset life. Dimensionless fraction. */
  crfPlant: number;
  /** Electrolyzer total capex, raw EUR. */
  electrolyzerCapex: number;
  /** Hydrogen levelised cost, EUR/kg. */
  h2CostPerKg: number;

  // -- Annual cost components (all in raw EUR/yr) --
  /** Electricity purchase, EUR/yr. */
  electricityCost: number;
  /** Electrolyzer capex annuity, EUR/yr. */
  electrolyzerAnnuity: number;
  /** Electrolyzer O&M plus stack replacement amortisation, EUR/yr. */
  electrolyzerOpex: number;
  /** Total hydrogen production cost, EUR/yr. */
  h2TotalCost: number;
  /** DAC CO2 cost, EUR/yr (all-in levelised). */
  dacCost: number;
  /** Methanation plant plus H2 buffer storage, EUR/yr. */
  methanationCost: number;
  /** Desalination total cost (energy + capex annuity + maintenance), EUR/yr. */
  waterCost: number;
  /** Land lease, EUR/yr. */
  landCost: number;
  /** Pipeline spur capex annuity, EUR/yr. */
  pipelineCost: number;

  // -- Summary totals --
  /** Grand total annual cost, EUR/yr. */
  grandTotalEurYr: number;
  /** Levelised cost of e-methane production, EUR/MWh CH4. */
  levelisedCostPerMwh: number;
}

// ============================================================================
// FINANCIAL PRIMITIVES
// ============================================================================

/**
 * Capital recovery factor (CRF): converts a one-time capex into an equivalent
 * annual payment over n years at discount rate r.
 *
 *   CRF = r * (1+r)^n / ((1+r)^n - 1)
 *
 * Example: CRF(5%, 20 years) = 0.08024, meaning every 1 EUR of capex costs
 * 0.08024 EUR/yr over 20 years.
 *
 * @param rateFraction WACC as a fraction (e.g., 0.05 for 5%)
 * @param nYears       Asset life in years
 */
export function capitalRecoveryFactor(rateFraction: number, nYears: number): number {
  if (rateFraction <= 0) return 1 / nYears;
  const pow = Math.pow(1 + rateFraction, nYears);
  return (rateFraction * pow) / (pow - 1);
}

// ============================================================================
// MAIN CALCULATION
// ============================================================================

const HOURS_PER_YEAR = 8760;

/**
 * Compute the complete e-methane production cost from a parameter set.
 *
 * Step-by-step methodology:
 *
 *   1. Annual production volumes derived from CO2 scale + stoichiometry
 *   2. Electricity needed from H2 production + electrolyzer efficiency
 *   3. Electrolyzer size from electricity / (hours × CF)
 *   4. Hydrogen cost built bottom-up: electricity + capex annuity + O&M
 *   5. DAC cost is a single all-in price × annual CO2 tonnes
 *   6. Methanation and H2 buffer scale linearly with CH4 output
 *   7. Water, land, and pipeline are small but explicit line items
 *   8. Grand total / annual CH4 = levelised cost per MWh
 */
export function calculateEmethaneCost(p: Parameters): Results {
  // ---------------------------------------------------------------------------
  // Step 1: Annual production volumes
  // ---------------------------------------------------------------------------
  // Starting from CO2 captured, derive CH4 and H2 outputs via stoichiometry.
  //
  //   CH4 = CO2 / (kg_CO2_per_MWh / 1000)
  //   H2  = CH4 × (kg_H2_per_MWh / 1000)
  const co2ConsumedTpy = p.co2CapturedTpy;
  const ch4OutputMwh = co2ConsumedTpy / (p.co2PerMwhCh4 / 1000);
  const h2ProducedTpy = (ch4OutputMwh * p.h2PerMwhCh4) / 1000;
  const h2ProducedKg = h2ProducedTpy * 1000;

  // ---------------------------------------------------------------------------
  // Step 2: Electricity demand and electrolyzer sizing
  // ---------------------------------------------------------------------------
  // electricity [MWh] = H2 [tonnes] × efficiency [kWh/kg]
  // The 1000 (t->kg) and 1000 (kWh->MWh) cancel out.
  const electricityMwh = h2ProducedTpy * p.electrolyzerEfficiency;

  // Electrolyzer nameplate must produce all electricity during available hours.
  // hours = 8760 × capacity_factor
  const fullLoadHours = HOURS_PER_YEAR * p.solarCapacityFactor;
  const electrolyzerMw = electricityMwh / fullLoadHours;
  const electrolyzerKw = electrolyzerMw * 1000;

  // ---------------------------------------------------------------------------
  // Step 3: Financing primitives
  // ---------------------------------------------------------------------------
  const crfPlant = capitalRecoveryFactor(p.plantWacc, p.assetLifeYears);
  // Infrastructure items (pipeline, desal) use fixed 20-year assumption
  // regardless of electrolyzer asset life.
  const crf20 = capitalRecoveryFactor(p.plantWacc, 20);

  // ---------------------------------------------------------------------------
  // Step 4: Hydrogen cost build-up
  // ---------------------------------------------------------------------------
  // Electrolyzer capex
  const electrolyzerCapex = electrolyzerKw * p.electrolyzerTic;
  // Annuitised capital recovery
  const electrolyzerAnnuity = electrolyzerCapex * crfPlant;
  // Combined fixed O&M plus stack replacement amortisation.
  // 2.5% of capex per year is an industry rule of thumb that absorbs both
  // routine maintenance (~1%) and amortised stack replacement (~1.5%).
  // For low-CF plants (~25%), total operating hours over 20 years are
  // ~44,000 hours — below most stack life warranties, so this is conservative.
  const electrolyzerOpex = electrolyzerCapex * 0.025;
  // Electricity purchase
  const electricityCost = electricityMwh * p.solarLcoe;
  // Total H2 production cost
  const h2TotalCost =
    electricityCost + electrolyzerAnnuity + electrolyzerOpex;
  // Levelised hydrogen cost per kg
  const h2CostPerKg = h2TotalCost / h2ProducedKg;

  // ---------------------------------------------------------------------------
  // Step 5: DAC CO2 cost
  // ---------------------------------------------------------------------------
  // Single-parameter approach: DAC cost per tonne already bundles capex,
  // opex, land, and financing. No separate WACC applied here.
  const dacCost = co2ConsumedTpy * p.dacCostPerTonne;

  // ---------------------------------------------------------------------------
  // Step 6: Methanation + H2 buffer storage
  // ---------------------------------------------------------------------------
  // Methanation reactor capex scales roughly linearly with CH4 output.
  // Baseline 17M EUR for 500,000 MWh/yr (57 MW CH4 output).
  // Adjustment +5M per 500 GWh delta captures non-linearity.
  const methanationCapex =
    17_000_000 + (ch4OutputMwh / 500_000 - 1) * 5_000_000;
  // H2 buffer storage (pressure vessels) scales linearly with throughput.
  // 25M EUR for ~25 tonnes H2 buffer at 500 GWh plant.
  const bufferCapex = 25_000_000 * (ch4OutputMwh / 500_000);
  // Annual cost: capex annuity + methanation-only O&M at 3%
  const methanationCost =
    (methanationCapex + bufferCapex) * crfPlant + methanationCapex * 0.03;

  // ---------------------------------------------------------------------------
  // Step 7: Water / desalination
  // ---------------------------------------------------------------------------
  const waterM3Yr = co2ConsumedTpy * p.waterM3PerTonneCo2;
  // Energy cost: water × intensity -> kWh/yr -> MWh/yr × LCOE
  const desalEnergyMwh = (waterM3Yr * p.desalKwhPerM3) / 1000;
  const desalEnergyCost = desalEnergyMwh * p.solarLcoe;
  // Capex scales with volume relative to reference 700,000 m3/yr plant at 2M EUR
  const desalCapex = 2_000_000 * (waterM3Yr / 700_000);
  const desalCapexAnnuity = desalCapex * crf20;
  // Membranes and chemicals: 0.10 EUR/m3
  const desalMaintenance = waterM3Yr * 0.1;
  const waterCost = desalEnergyCost + desalCapexAnnuity + desalMaintenance;

  // ---------------------------------------------------------------------------
  // Step 8: Land costs
  // ---------------------------------------------------------------------------
  const solarLandHa = electrolyzerMw * p.solarHaPerMw;
  const landSolar = solarLandHa * p.landLeaseEurPerHa;
  // Plant footprint: ~8 ha industrial land at 2000 EUR/ha/yr
  const landPlant = 8 * 2000;
  const landCost = landSolar + landPlant;

  // ---------------------------------------------------------------------------
  // Step 9: Pipeline spur
  // ---------------------------------------------------------------------------
  const pipelineCapex = p.pipelineSpurCapexEurM * 1_000_000;
  const pipelineCost = pipelineCapex * crf20;

  // ---------------------------------------------------------------------------
  // Step 10: Grand total and levelised cost
  // ---------------------------------------------------------------------------
  const grandTotalEurYr =
    h2TotalCost +
    dacCost +
    methanationCost +
    waterCost +
    landCost +
    pipelineCost;
  const levelisedCostPerMwh = grandTotalEurYr / ch4OutputMwh;

  return {
    ch4OutputMwh,
    co2ConsumedTpy,
    h2ProducedTpy,
    h2ProducedKg,
    electricityMwh,
    electrolyzerMw,
    fullLoadHours,
    solarLandHa,
    waterM3Yr,
    crfPlant,
    electrolyzerCapex,
    h2CostPerKg,
    electricityCost,
    electrolyzerAnnuity,
    electrolyzerOpex,
    h2TotalCost,
    dacCost,
    methanationCost,
    waterCost,
    landCost,
    pipelineCost,
    grandTotalEurYr,
    levelisedCostPerMwh,
  };
}

// ============================================================================
// SITE PRESETS
// ============================================================================

/**
 * Ciudad Real / Puertollano preset.
 *
 * Central plateau site, Castilla-La Mancha. Key advantages:
 *  - Cheapest land in Spain (agricultural leases ~1400 EUR/ha/yr)
 *  - Direct access to existing gas grid (Transversal axis through Puertollano)
 *  - Brackish groundwater available for low-energy RO desalination
 *  - Puertollano is an active H2 hub (CNH2, Iberdrola/Fertiberia, Repsol)
 *
 * Trade-offs:
 *  - Solar CF ~25%, slightly below coastal sites
 *  - LCOE ~23 EUR/MWh due to moderate irradiance
 */
export const CIUDAD_REAL_PRESET: Parameters = {
  solarLcoe: 23,
  solarCapacityFactor: 0.25,
  electrolyzerEfficiency: 55,
  electrolyzerTic: 340,
  plantWacc: 0.05,
  assetLifeYears: 20,
  co2CapturedTpy: 100_000,
  h2PerMwhCh4: 36,
  co2PerMwhCh4: 200,
  dacCostPerTonne: 278,
  waterM3PerTonneCo2: 7,
  desalKwhPerM3: 1.5,
  landLeaseEurPerHa: 1400,
  solarHaPerMw: 0.51,
  pipelineSpurCapexEurM: 0,
};

/**
 * Almería / Tabernas preset.
 *
 * Southeastern coastal site, Andalusia. Key advantages:
 *  - Best solar resource in Spain (CF ~28%, LCOE ~20.5 EUR/MWh)
 *  - Access to Medgaz and Al-Andalus pipelines via short spur
 *  - Seawater available for desalination (climate-independent)
 *
 * Trade-offs:
 *  - Pipeline spur capex typical 15 km / 25M EUR
 *  - Seawater RO uses 3.3 kWh/m3 (vs 1.5 for brackish)
 *  - Higher land costs in coastal industrial zones
 */
export const ALMERIA_PRESET: Parameters = {
  solarLcoe: 20.5,
  solarCapacityFactor: 0.28,
  electrolyzerEfficiency: 55,
  electrolyzerTic: 340,
  plantWacc: 0.05,
  assetLifeYears: 20,
  co2CapturedTpy: 100_000,
  h2PerMwhCh4: 36,
  co2PerMwhCh4: 200,
  dacCostPerTonne: 278,
  waterM3PerTonneCo2: 7,
  desalKwhPerM3: 3.3,
  landLeaseEurPerHa: 1800,
  solarHaPerMw: 0.49,
  pipelineSpurCapexEurM: 25,
};

// ============================================================================
// DISPLAY FORMATTERS
// ============================================================================

/**
 * Format a raw euro value as a human-readable string.
 *   < 1,000 -> "€123"
 *   < 1M -> "€45k"
 *   >= 1M -> "€12.34M"
 */
export function formatEuro(raw: number): string {
  const abs = Math.abs(raw);
  if (abs < 1_000) return `€${raw.toFixed(0)}`;
  if (abs < 1_000_000) return `€${(raw / 1_000).toFixed(0)}k`;
  return `€${(raw / 1_000_000).toFixed(2)}M`;
}

/**
 * Convert a cost component (EUR/yr) to its share of the total as EUR/MWh CH4.
 */
export function eurPerMwh(cost: number, ch4OutputMwh: number): number {
  return cost / ch4OutputMwh;
}

/**
 * Convert a cost component to its percentage of grand total.
 */
export function costShare(cost: number, grandTotal: number): number {
  return (cost / grandTotal) * 100;
}

// ============================================================================
// PARAMETER SERIALIZATION (URL STATE)
// ============================================================================

/**
 * Convert a Parameters object to a URLSearchParams string for shareable URLs.
 */
export function parametersToQueryString(p: Parameters): string {
  const map: Record<string, string> = {
    lcoe: p.solarLcoe.toString(),
    cf: p.solarCapacityFactor.toString(),
    eff: p.electrolyzerEfficiency.toString(),
    tic: p.electrolyzerTic.toString(),
    wacc: p.plantWacc.toString(),
    life: p.assetLifeYears.toString(),
    co2: p.co2CapturedTpy.toString(),
    h2m: p.h2PerMwhCh4.toString(),
    co2m: p.co2PerMwhCh4.toString(),
    dac: p.dacCostPerTonne.toString(),
    w: p.waterM3PerTonneCo2.toString(),
    des: p.desalKwhPerM3.toString(),
    land: p.landLeaseEurPerHa.toString(),
    ha: p.solarHaPerMw.toString(),
    pipe: p.pipelineSpurCapexEurM.toString(),
  };
  return new URLSearchParams(map).toString();
}

/**
 * Parse a URLSearchParams object into a Parameters object, falling back to
 * the provided defaults for any missing or invalid values.
 */
export function parseParametersFromQuery(
  query: URLSearchParams,
  fallback: Parameters,
): Parameters {
  const readNum = (key: string, def: number): number => {
    const v = query.get(key);
    if (v === null) return def;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : def;
  };
  return {
    solarLcoe: readNum('lcoe', fallback.solarLcoe),
    solarCapacityFactor: readNum('cf', fallback.solarCapacityFactor),
    electrolyzerEfficiency: readNum('eff', fallback.electrolyzerEfficiency),
    electrolyzerTic: readNum('tic', fallback.electrolyzerTic),
    plantWacc: readNum('wacc', fallback.plantWacc),
    assetLifeYears: readNum('life', fallback.assetLifeYears),
    co2CapturedTpy: readNum('co2', fallback.co2CapturedTpy),
    h2PerMwhCh4: readNum('h2m', fallback.h2PerMwhCh4),
    co2PerMwhCh4: readNum('co2m', fallback.co2PerMwhCh4),
    dacCostPerTonne: readNum('dac', fallback.dacCostPerTonne),
    waterM3PerTonneCo2: readNum('w', fallback.waterM3PerTonneCo2),
    desalKwhPerM3: readNum('des', fallback.desalKwhPerM3),
    landLeaseEurPerHa: readNum('land', fallback.landLeaseEurPerHa),
    solarHaPerMw: readNum('ha', fallback.solarHaPerMw),
    pipelineSpurCapexEurM: readNum('pipe', fallback.pipelineSpurCapexEurM),
  };
}

// ============================================================================
// SENSITIVITY ANALYSIS
// ============================================================================

export interface SensitivityResult {
  parameter: keyof Parameters;
  label: string;
  lowValue: number;
  highValue: number;
  lowCost: number;
  highCost: number;
  swing: number;
}

/**
 * Compute a tornado-style sensitivity analysis by perturbing each parameter
 * +/- a percentage around the baseline and measuring the effect on levelised
 * cost. Useful for identifying which parameters matter most.
 */
export function runSensitivityAnalysis(
  baseline: Parameters,
  perturbation: number = 0.2,
): SensitivityResult[] {
  const base = calculateEmethaneCost(baseline);
  const keys = Object.keys(baseline) as (keyof Parameters)[];
  const labels: Record<keyof Parameters, string> = {
    solarLcoe: 'Solar LCOE',
    solarCapacityFactor: 'Solar capacity factor',
    electrolyzerEfficiency: 'Electrolyzer efficiency',
    electrolyzerTic: 'Electrolyzer TIC',
    plantWacc: 'Plant WACC',
    assetLifeYears: 'Asset life',
    co2CapturedTpy: 'CO2 scale',
    h2PerMwhCh4: 'H2/MWh ratio',
    co2PerMwhCh4: 'CO2/MWh ratio',
    dacCostPerTonne: 'DAC cost',
    waterM3PerTonneCo2: 'Water intensity',
    desalKwhPerM3: 'Desal energy',
    landLeaseEurPerHa: 'Land lease',
    solarHaPerMw: 'Land density',
    pipelineSpurCapexEurM: 'Pipeline spur',
  };

  return keys
    .map((key) => {
      const lowParams = { ...baseline, [key]: baseline[key] * (1 - perturbation) };
      const highParams = { ...baseline, [key]: baseline[key] * (1 + perturbation) };
      const lowResult = calculateEmethaneCost(lowParams);
      const highResult = calculateEmethaneCost(highParams);
      return {
        parameter: key,
        label: labels[key],
        lowValue: lowParams[key] as number,
        highValue: highParams[key] as number,
        lowCost: lowResult.levelisedCostPerMwh,
        highCost: highResult.levelisedCostPerMwh,
        swing: Math.abs(highResult.levelisedCostPerMwh - lowResult.levelisedCostPerMwh),
      };
    })
    .sort((a, b) => b.swing - a.swing);
}
