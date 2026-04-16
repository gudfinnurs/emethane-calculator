/**
 * Sanity test — run with:
 *   npx tsx sanity-test.ts
 *
 * Or manually verify by running the calculation and comparing
 * against the expected values for Ciudad Real baseline.
 */

import {
  CIUDAD_REAL_PRESET,
  ALMERIA_PRESET,
  calculateEmethaneCost,
} from './src/emethaneCost';

function check(label: string, actual: number, expected: number, tol: number = 1) {
  const delta = Math.abs(actual - expected);
  const ok = delta <= tol;
  const status = ok ? 'PASS' : 'FAIL';
  console.log(
    `  [${status}] ${label}: actual=${actual.toFixed(2)}, expected~${expected}, delta=${delta.toFixed(2)}`,
  );
}

console.log('\n=== Ciudad Real sanity test ===');
const cr = calculateEmethaneCost(CIUDAD_REAL_PRESET);
check('CH4 output (MWh/yr)', cr.ch4OutputMwh, 500_000, 100);
check('H2 produced (t/yr)', cr.h2ProducedTpy, 18_000, 10);
check('Electricity (MWh/yr)', cr.electricityMwh, 990_000, 100);
check('Electrolyzer MW', cr.electrolyzerMw, 452, 2);
check('H2 LCOH (EUR/kg)', cr.h2CostPerKg, 2.16, 0.1);
check('Total EUR/MWh CH4', cr.levelisedCostPerMwh, 142, 2);

console.log('\n=== Almería sanity test ===');
const alm = calculateEmethaneCost(ALMERIA_PRESET);
check('CH4 output (MWh/yr)', alm.ch4OutputMwh, 500_000, 100);
check('Electrolyzer MW', alm.electrolyzerMw, 404, 2);
check('H2 LCOH (EUR/kg)', alm.h2CostPerKg, 1.93, 0.1);
check('Total EUR/MWh CH4', alm.levelisedCostPerMwh, 138, 3);

console.log('\n=== Output for reference ===');
console.log('Ciudad Real:');
console.log(JSON.stringify(
  {
    levelisedCostPerMwh: cr.levelisedCostPerMwh.toFixed(2),
    h2CostPerKg: cr.h2CostPerKg.toFixed(2),
    electrolyzerMw: cr.electrolyzerMw.toFixed(0),
    grandTotalEurM: (cr.grandTotalEurYr / 1e6).toFixed(2),
  },
  null,
  2,
));
console.log('\nAlmería:');
console.log(JSON.stringify(
  {
    levelisedCostPerMwh: alm.levelisedCostPerMwh.toFixed(2),
    h2CostPerKg: alm.h2CostPerKg.toFixed(2),
    electrolyzerMw: alm.electrolyzerMw.toFixed(0),
    grandTotalEurM: (alm.grandTotalEurYr / 1e6).toFixed(2),
  },
  null,
  2,
));
