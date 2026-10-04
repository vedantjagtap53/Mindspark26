/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * Mock Financial Engine and Simulation Service
 */

import {
  ProductType,
  SimMode,
  SimulationResult,
  ClientProfile,
  ProductInputs,
  ELNInputs,
  DCDInputs,
  CPNInputs,
  ScenarioResult,
  DistributionStats,
  FanPoint,
  PayoffCurvePoint,
  SavedSimulationRecord,
  SuitabilityFlag,
  ChatMessage,
  ModelCard,
} from './types';

// Benchmark Reference Data (NIFTY 50 @ 25,124.50 as of early Oct 2026)
export const SPOT_PRICES: Record<string, number> = {
  'NIFTY 50': 25124.50,
  'S&P 500': 5751.20,
  'RELIANCE IND.': 2980.40,
  'USD/INR': 83.94,
  'EUR/USD': 1.0850,
  'GBP/USD': 1.3025,
};

const DUMMY_PROFILE: ClientProfile = {
  name: 'Seeded Profile',
  age: 45,
  riskAppetite: 'Moderate',
  investmentHorizonMonths: 18,
  lossTolerancePct: 15,
  concentrationPct: 18,
  portfolioValue: 25000000, // INR 2.5 Cr
};

// Helper to simulate asynchronous processing latency
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Core Financial Payoff Calculation Engine
 */
function calculatePayoff(
  product: ProductType,
  inputs: ProductInputs,
  terminalSpot: number,
  spot: number
): { payoff: number; returnPct: number; knockedIn?: boolean } {
  if (product === 'ELN') {
    const eln = inputs as ELNInputs;
    const tenorYears = eln.tenorDays / 365;
    const couponTotal = eln.notional * ((eln.couponPctPa / 100) * tenorYears);
    const barrierLevel = spot * (eln.barrierPct / 100);
    const strikeLevel = spot * (eln.strikePct / 100);

    const isKnockedIn = terminalSpot < barrierLevel;

    if (!isKnockedIn) {
      // Barrier intact: full principal + coupon
      const payoff = eln.notional + couponTotal;
      const returnPct = ((payoff - eln.notional) / eln.notional) * 100;
      return { payoff, returnPct, knockedIn: false };
    } else {
      // Barrier breached: downside participation relative to strike + coupon
      const terminalStockValue = eln.notional * (terminalSpot / strikeLevel);
      const payoff = terminalStockValue + couponTotal;
      const returnPct = ((payoff - eln.notional) / eln.notional) * 100;
      return { payoff, returnPct, knockedIn: true };
    }
  } else if (product === 'DCD') {
    const dcd = inputs as DCDInputs;
    const tenorYears = dcd.tenorDays / 365;
    const enhancedInterest = dcd.depositAmount * ((dcd.enhancedRatePctPa / 100) * tenorYears);
    const totalDue = dcd.depositAmount + enhancedInterest;

    // For DCD (USD/INR): strikeRate is INR per USD.
    // If maturity spot <= strikeRate: Investor receives USD deposit + enhanced interest (capped gain)
    // If maturity spot > strikeRate: INR weakened; Depository delivers INR converted at strikeRate.
    // Economic value in deposit currency (USD) = (TotalDue * strikeRate) / terminalSpot
    const isConverted = terminalSpot > dcd.strikeRate;

    if (!isConverted) {
      const payoff = totalDue;
      const returnPct = (enhancedInterest / dcd.depositAmount) * 100;
      return { payoff, returnPct, knockedIn: false };
    } else {
      const payoffInDepositCurrency = (totalDue * dcd.strikeRate) / terminalSpot;
      const returnPct = ((payoffInDepositCurrency - dcd.depositAmount) / dcd.depositAmount) * 100;
      return { payoff: payoffInDepositCurrency, returnPct, knockedIn: true };
    }
  } else {
    // CPN: Capital Protected Note
    const cpn = inputs as CPNInputs;
    const notional = cpn.notional;
    const floorAmount = notional * (cpn.protectionPct / 100);
    const underlyingGainPct = ((terminalSpot - spot) / spot) * 100;

    let cappedGainPct = Math.max(0, underlyingGainPct);
    if (cpn.capPct !== null && cpn.capPct !== undefined) {
      const maxGainAllowed = cpn.capPct - 100;
      cappedGainPct = Math.min(cappedGainPct, maxGainAllowed);
    }

    const participationAmount = notional * (cappedGainPct / 100) * (cpn.participationPct / 100);
    const payoff = floorAmount + participationAmount;
    const returnPct = ((payoff - notional) / notional) * 100;
    return { payoff, returnPct, knockedIn: false };
  }
}

/**
 * Generate historical daily trading prices with genuine holiday/weekend gaps
 */
function generateHistoricalSeries(spot: number): FanPoint[] {
  const points: FanPoint[] = [];
  const totalDays = 90;
  const startDate = new Date(2026, 6, 5); // July 2026

  let currentPrice = spot * 0.94;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dayOfWeek = d.getDay();

    // Weekend gap: Saturday (6) and Sunday (0) are market holidays
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      points.push({
        date: d.toISOString().split('T')[0],
        isHistorical: true,
        isHolidayGap: true,
        actual: undefined,
      });
      continue;
    }

    // Occasional public holiday gap (e.g. 15 Aug Independence Day, 2 Oct Gandhi Jayanti)
    const month = d.getMonth();
    const dateNum = d.getDate();
    if ((month === 7 && dateNum === 15) || (month === 9 && dateNum === 2)) {
      points.push({
        date: d.toISOString().split('T')[0],
        isHistorical: true,
        isHolidayGap: true,
        actual: undefined,
      });
      continue;
    }

    // Daily random walk drift
    const dailyReturn = (Math.sin(i * 0.15) * 0.003) + ((Math.random() - 0.48) * 0.012);
    currentPrice = currentPrice * (1 + dailyReturn);

    // Anchor the last trading day to the exact spot price
    if (i === totalDays - 1) {
      currentPrice = spot;
    }

    points.push({
      date: d.toISOString().split('T')[0],
      isHistorical: true,
      isHolidayGap: false,
      actual: Math.round(currentPrice * 100) / 100,
    });
  }

  return points;
}

/**
 * Generate Forward Forecast Paths and Confidence Fan (Mode A: GARCH Monte Carlo)
 */
function generateForecastFan(
  spot: number,
  tenorDays: number,
  history: FanPoint[]
): { fan: FanPoint[]; lowTerminal: number; baseTerminal: number; highTerminal: number } {
  const fan: FanPoint[] = [...history];
  const stepCount = Math.min(24, Math.max(6, Math.round(tenorDays / 14)));
  const daysPerStep = tenorDays / stepCount;

  const lastHistDate = new Date(2026, 9, 3); // Oct 3, 2026

  // Annualized volatility ~ 14.8% Student-t GARCH
  const annualVol = 0.148;
  const totalYears = tenorDays / 365;

  let lowTerminal = spot;
  let baseTerminal = spot;
  let highTerminal = spot;

  for (let s = 1; s <= stepCount; s++) {
    const forwardDate = new Date(lastHistDate);
    forwardDate.setDate(lastHistDate.getDate() + Math.round(s * daysPerStep));
    const t = (s * daysPerStep) / 365;

    // Student-t fat-tailed confidence bounds
    const p5Multiplier = Math.exp(-1.96 * annualVol * Math.sqrt(t) - 0.5 * annualVol * annualVol * t);
    const p50Multiplier = Math.exp(0.02 * t); // slight median drift
    const p95Multiplier = Math.exp(1.96 * annualVol * Math.sqrt(t) - 0.5 * annualVol * annualVol * t);

    const p5Val = Math.round(spot * p5Multiplier * 100) / 100;
    const p50Val = Math.round(spot * p50Multiplier * 100) / 100;
    const p95Val = Math.round(spot * p95Multiplier * 100) / 100;

    // Sample stochastic paths
    const lowPathVal = Math.round(spot * (1 - 0.16 * Math.sqrt(s / stepCount)) * 100) / 100;
    const basePathVal = Math.round(spot * (1 + 0.03 * (s / stepCount)) * 100) / 100;
    const highPathVal = Math.round(spot * (1 + 0.18 * Math.sqrt(s / stepCount)) * 100) / 100;

    if (s === stepCount) {
      lowTerminal = p5Val;
      baseTerminal = p50Val;
      highTerminal = p95Val;
    }

    fan.push({
      date: forwardDate.toISOString().split('T')[0],
      isHistorical: false,
      p5: p5Val,
      p50: p50Val,
      p95: p95Val,
      lowPath: lowPathVal,
      basePath: basePathVal,
      highPath: highPathVal,
    });
  }

  return { fan, lowTerminal, baseTerminal, highTerminal };
}

/**
 * Generate 60 points for the payoff-at-maturity curve (-30% to +30%)
 */
function generatePayoffCurve(
  product: ProductType,
  inputs: ProductInputs,
  spot: number
): PayoffCurvePoint[] {
  const points: PayoffCurvePoint[] = [];

  for (let pct = -30; pct <= 30; pct += 1) {
    const underlyingPrice = spot * (1 + pct / 100);
    const res = calculatePayoff(product, inputs, underlyingPrice, spot);

    points.push({
      underlyingPct: pct,
      underlyingPrice: Math.round(underlyingPrice * 100) / 100,
      payoffAmount: Math.round(res.payoff * 100) / 100,
      returnPct: Math.round(res.returnPct * 100) / 100,
      knockedIn: res.knockedIn,
    });
  }

  return points;
}

/**
 * Suitability Rules Engine
 * Evaluates the 5 mandatory compliance rules against the relationship manager's inputs
 */
function evaluateSuitability(
  product: ProductType,
  inputs: ProductInputs,
  profile: ClientProfile,
  cases: { low: ScenarioResult; base: ScenarioResult; high: ScenarioResult },
  tenorDays: number
): { verdict: 'SUITABLE' | 'CAUTION' | 'NOT_SUITABLE'; flags: SuitabilityFlag[] } {
  const flags: SuitabilityFlag[] = [];
  const tenorMonths = Math.round(tenorDays / 30.4);

  // 1. Rule: Low-case loss above client loss tolerance
  const lowCaseLossPct = Math.max(0, -cases.low.returnPct);
  if (lowCaseLossPct > profile.lossTolerancePct) {
    flags.push({
      rule: 'Loss Tolerance Exceeded',
      reason: `Projected low-case loss of ${lowCaseLossPct.toFixed(1)}% exceeds client's mandated tolerance limit of ${profile.lossTolerancePct.toFixed(1)}%.`,
      severity: lowCaseLossPct > profile.lossTolerancePct * 1.5 ? 'CRITICAL' : 'WARNING',
    });
  }

  // 2. Rule: ELN knock-in in low or base case
  if (product === 'ELN') {
    if (cases.base.knockedIn) {
      flags.push({
        rule: 'Base-Case Knock-In',
        reason: 'Underlying breaches knock-in barrier under the median base scenario, exposing principal to downside.',
        severity: 'CRITICAL',
      });
    } else if (cases.low.knockedIn) {
      flags.push({
        rule: 'Downside Knock-In Risk',
        reason: `Barrier is breached under the P5 low case (${cases.low.underlyingLevel.toLocaleString()} vs barrier), removing principal protection.`,
        severity: 'WARNING',
      });
    }
  }

  // 3. Rule: Tenor longer than client investment horizon
  if (tenorMonths > profile.investmentHorizonMonths) {
    flags.push({
      rule: 'Horizon Mismatch',
      reason: `Product tenor of ${tenorMonths} months exceeds client stated investment horizon of ${profile.investmentHorizonMonths} months.`,
      severity: 'WARNING',
    });
  }

  // 4. Rule: Concentration above limit (Internal bank prudential limit: 15%)
  if (profile.concentrationPct > 15) {
    flags.push({
      rule: 'Portfolio Concentration',
      reason: `Allocation represents ${profile.concentrationPct.toFixed(1)}% of portfolio, exceeding the 15.0% structured products ceiling.`,
      severity: profile.concentrationPct > 20 ? 'CRITICAL' : 'WARNING',
    });
  }

  // 5. Rule: Product risk above risk appetite
  // ELN and DCD are classified as Higher Risk; CPN is Lower Risk
  if (product === 'ELN' || product === 'DCD') {
    if (profile.riskAppetite === 'Conservative') {
      flags.push({
        rule: 'Risk Appetite Misalignment',
        reason: `${product} carries higher risk rating with contingent capital loss, unsuitable for a Conservative risk profile.`,
        severity: 'CRITICAL',
      });
    } else if (profile.riskAppetite === 'Moderate' && product === 'ELN') {
      const eln = inputs as ELNInputs;
      if (eln.barrierPct > 88) {
        flags.push({
          rule: 'Aggressive Barrier for Moderate Profile',
          reason: `Barrier of ${eln.barrierPct}% provides insufficient cushion (<12%) for a Moderate investor mandate.`,
          severity: 'WARNING',
        });
      }
    }
  }

  // Synthesize Final Verdict
  const hasCritical = flags.some((f) => f.severity === 'CRITICAL');
  const hasWarning = flags.some((f) => f.severity === 'WARNING');

  let verdict: 'SUITABLE' | 'CAUTION' | 'NOT_SUITABLE' = 'SUITABLE';
  if (hasCritical) {
    verdict = 'NOT_SUITABLE';
  } else if (hasWarning) {
    verdict = 'CAUTION';
  }

  return { verdict, flags };
}

/**
 * Generate human-readable narrative explanation tailored to numbers
 */
function generateExplanation(
  product: ProductType,
  inputs: ProductInputs,
  verdict: 'SUITABLE' | 'CAUTION' | 'NOT_SUITABLE',
  cases: { low: ScenarioResult; base: ScenarioResult; high: ScenarioResult },
  spot: number
) {
  let summary = '';
  let bestCase = '';
  let worstCase = '';
  let lossTrigger = '';
  let suitabilityRationale = '';

  if (product === 'ELN') {
    const eln = inputs as ELNInputs;
    summary = `This Equity Linked Note (Reverse Convertible) offers an annualized coupon of ${eln.couponPctPa.toFixed(2)}% over a ${eln.tenorDays}-day tenor, linked to ${eln.underlying}. The client exchanges downside protection below ${eln.barrierPct.toFixed(1)}% of spot for enhanced yield.`;
    bestCase = `If ${eln.underlying} remains at or above the ${eln.barrierPct.toFixed(1)}% barrier (${(spot * (eln.barrierPct / 100)).toLocaleString()}), the note repays 100% of notional plus total coupon of ${cases.base.returnPct.toFixed(2)}% (${eln.currency} ${cases.base.payoffAmount.toLocaleString()}).`;
    worstCase = `If ${eln.underlying} breaches the barrier and closes at the P5 low level of ${cases.low.underlyingLevel.toLocaleString()} (-18.0%), capital protection is extinguished. Payout drops to ${eln.currency} ${cases.low.payoffAmount.toLocaleString()} (a net return of ${cases.low.returnPct.toFixed(2)}%).`;
    lossTrigger = `Losses are triggered whenever the underlying falls below the barrier (${eln.barrierPct}% of spot) at maturity${eln.barrierType === 'American' ? ' or at any continuous intraday observation' : ''}. Downside participation is pegged to the 100% strike.`;
  } else if (product === 'DCD') {
    const dcd = inputs as DCDInputs;
    summary = `This Dual Currency Deposit offers an enhanced deposit rate of ${dcd.enhancedRatePctPa.toFixed(2)}% p.a. on ${dcd.depositCurrency} ${dcd.depositAmount.toLocaleString()} over ${dcd.tenorDays} days, with conversion pegged at ${dcd.strikeRate.toFixed(2)} ${dcd.currencyPair}.`;
    bestCase = `If the alternate currency (${dcd.alternateCurrency}) does not weaken past the strike of ${dcd.strikeRate.toFixed(2)}, the principal is repaid in ${dcd.depositCurrency} with full enhanced interest (${cases.base.returnPct.toFixed(2)}%).`;
    worstCase = `If the alternate currency depreciates sharply, repayment is mandated in ${dcd.alternateCurrency} converted at the historical strike rate. When valued back in ${dcd.depositCurrency}, net return drops to ${cases.low.returnPct.toFixed(2)}%.`;
    lossTrigger = `Losses occur when the exchange rate exceeds the strike rate at maturity, forcing involuntary currency conversion into a weakening currency.`;
  } else {
    const cpn = inputs as CPNInputs;
    summary = `This Capital Protected Note guarantees a minimum principal repayment floor of ${cpn.protectionPct.toFixed(1)}% at maturity, while providing ${cpn.participationPct.toFixed(1)}% upside participation in ${cpn.underlying}${cpn.capPct ? ` capped at ${cpn.capPct}%` : ' with uncapped upside'}.`;
    bestCase = `Under high market growth (+15.0%), the note delivers ${cases.high.returnPct.toFixed(2)}% total return (${cpn.currency} ${cases.high.payoffAmount.toLocaleString()}), monetizing equity upside without risking principal.`;
    worstCase = `Even in a severe market drawdown (-25.0%), capital preservation rules preserve the ${cpn.protectionPct}% floor. Maximum capital at risk is strictly limited to ${(100 - cpn.protectionPct).toFixed(1)}%.`;
    lossTrigger = `Capital loss is contractually bounded at ${(100 - cpn.protectionPct).toFixed(1)}% and occurs only if the underlying finishes below the issue price.`;
  }

  if (verdict === 'SUITABLE') {
    suitabilityRationale = 'Structure satisfies all suitability parameters: downside profile fits the client risk tolerance, tenor conforms to investment horizon, and concentration remains well within prudential bounds.';
  } else if (verdict === 'CAUTION') {
    suitabilityRationale = 'Product is acceptable only with documented supervisory consent: one or more warning thresholds (such as concentration or barrier proximity) are flagged for RM review.';
  } else {
    suitabilityRationale = 'Transaction fails bank suitability criteria. The mismatch between product downside exposure and the client’s conservative mandate or tolerance threshold precludes execution.';
  }

  return { summary, bestCase, worstCase, lossTrigger, suitabilityRationale };
}

/**
 * Public Simulation API Method
 * Called by the UI to execute either Mode A (GARCH Monte Carlo) or Mode B (Manual Shock)
 */
export async function runSimulation(
  product: ProductType,
  mode: SimMode,
  inputs: ProductInputs,
  profile: ClientProfile,
  options?: {
    shockPct?: number;
    trainingWindowYears?: number;
    forceFailure?: boolean;
    isStaleData?: boolean;
  }
): Promise<SimulationResult> {
  // Simulate network/engine processing time
  await sleep(1100);

  if (mode === 'FORECAST' && options?.forceFailure) {
    throw new Error('Forecast service did not return a valid result. No substitute forecast has been generated.');
  }

  let spot = 25124.50;
  let underlyingName = 'NIFTY 50';

  if (product === 'DCD') {
    const dcd = inputs as DCDInputs;
    underlyingName = dcd.currencyPair;
    spot = SPOT_PRICES[dcd.currencyPair] || 83.94;
  } else {
    const p = inputs as ELNInputs;
    underlyingName = p.underlying || 'NIFTY 50';
    spot = SPOT_PRICES[underlyingName] || 25124.50;
  }

  const tenorDays = inputs.tenorDays;

  // 1. History and Forward Fan
  const history = generateHistoricalSeries(spot);
  const { fan, lowTerminal, baseTerminal, highTerminal } = generateForecastFan(spot, tenorDays, history);

  // 2. Scenario points: -25%, -10%, 0%, +10%, +15%
  const scenariosPercentages = [-25, -10, 0, 10, 15];
  const scenarios: ScenarioResult[] = scenariosPercentages.map((pct) => {
    const sLevel = spot * (1 + pct / 100);
    const pRes = calculatePayoff(product, inputs, sLevel, spot);
    return {
      scenarioLabel: `${pct >= 0 ? '+' : ''}${pct}% Shock`,
      underlyingPctChange: pct,
      underlyingLevel: Math.round(sLevel * 100) / 100,
      payoffAmount: Math.round(pRes.payoff * 100) / 100,
      returnPct: Math.round(pRes.returnPct * 100) / 100,
      knockedIn: pRes.knockedIn,
    };
  });

  // 3. Case terminals
  let finalLowTerm = lowTerminal;
  let finalBaseTerm = baseTerminal;
  let finalHighTerm = highTerminal;

  if (mode === 'SHOCK') {
    const shock = options?.shockPct !== undefined ? options.shockPct : -10;
    finalBaseTerm = spot * (1 + shock / 100);
    finalLowTerm = spot * (1 + Math.min(-20, shock - 10) / 100);
    finalHighTerm = spot * (1 + Math.max(10, shock + 10) / 100);
  }

  const lowCalc = calculatePayoff(product, inputs, finalLowTerm, spot);
  const baseCalc = calculatePayoff(product, inputs, finalBaseTerm, spot);
  const highCalc = calculatePayoff(product, inputs, finalHighTerm, spot);

  const cases = {
    low: {
      scenarioLabel: mode === 'FORECAST' ? 'Low Case (P5)' : 'Stressed Shock (-20%)',
      underlyingPctChange: Math.round(((finalLowTerm - spot) / spot) * 1000) / 10,
      underlyingLevel: Math.round(finalLowTerm * 100) / 100,
      payoffAmount: Math.round(lowCalc.payoff * 100) / 100,
      returnPct: Math.round(lowCalc.returnPct * 100) / 100,
      knockedIn: lowCalc.knockedIn,
    },
    base: {
      scenarioLabel: mode === 'FORECAST' ? 'Base Case (P50)' : `Selected Shock (${options?.shockPct || 0}%)`,
      underlyingPctChange: Math.round(((finalBaseTerm - spot) / spot) * 1000) / 10,
      underlyingLevel: Math.round(finalBaseTerm * 100) / 100,
      payoffAmount: Math.round(baseCalc.payoff * 100) / 100,
      returnPct: Math.round(baseCalc.returnPct * 100) / 100,
      knockedIn: baseCalc.knockedIn,
    },
    high: {
      scenarioLabel: mode === 'FORECAST' ? 'High Case (P95)' : 'Favorable Shock (+15%)',
      underlyingPctChange: Math.round(((finalHighTerm - spot) / spot) * 1000) / 10,
      underlyingLevel: Math.round(finalHighTerm * 100) / 100,
      payoffAmount: Math.round(highCalc.payoff * 100) / 100,
      returnPct: Math.round(highCalc.returnPct * 100) / 100,
      knockedIn: highCalc.knockedIn,
    },
  };

  // 4. Headline range
  let headlineRange = '';
  if (mode === 'FORECAST') {
    headlineRange = `Base ${cases.base.returnPct >= 0 ? '+' : ''}${cases.base.returnPct.toFixed(1)}%, likely range ${cases.low.returnPct.toFixed(1)}% to +${cases.high.returnPct.toFixed(1)}%`;
  } else {
    headlineRange = `Manual Shock Terminal Return: ${cases.base.returnPct >= 0 ? '+' : ''}${cases.base.returnPct.toFixed(1)}%`;
  }

  // 5. Payoff curve points for chart
  const payoffCurve = generatePayoffCurve(product, inputs, spot);

  // 6. Suitability flags & verdict
  const suitability = evaluateSuitability(product, inputs, profile, cases, tenorDays);

  // 7. Explanations
  const explanation = generateExplanation(product, inputs, suitability.verdict, cases, spot);

  // 8. Distribution stats (Mode A only)
  let distribution: DistributionStats | undefined;
  if (mode === 'FORECAST') {
    let probLoss = 0.04;
    let probKnockIn: number | undefined;

    if (product === 'ELN') {
      const eln = inputs as ELNInputs;
      probLoss = eln.barrierPct >= 90 ? 0.18 : 0.08;
      probKnockIn = eln.barrierPct >= 90 ? 0.24 : 0.12;
    } else if (product === 'DCD') {
      probLoss = 0.14;
    } else {
      probLoss = (inputs as CPNInputs).protectionPct < 100 ? 0.03 : 0.0;
    }

    distribution = {
      probLoss,
      probKnockIn,
      payoffP5: cases.low.payoffAmount,
      payoffP50: cases.base.payoffAmount,
      payoffP95: cases.high.payoffAmount,
      returnP5: cases.low.returnPct,
      returnP50: cases.base.returnPct,
      returnP95: cases.high.returnPct,
    };
  }

  // 9. Model Card metadata (Mode A only)
  let modelCard: ModelCard | undefined;
  if (mode === 'FORECAST') {
    const trainingWindow = options?.trainingWindowYears === 5 ? 'Oct 2021 – Oct 2026 (5Y)' : 'Oct 2016 – Oct 2026 (10Y)';
    modelCard = {
      model: 'GARCH(1,1), Student-t distribution',
      trainingWindow,
      drift: 'Risk-neutral martingale measure (0.0% drift)',
      asOfDate: '03 Oct 2026 14:12 IST',
      pathsCount: 10000,
      backtest: [
        { horizonMonths: 3, coverageP5P95: 91.8, targetCoverage: 90.0, baseMape: 3.2, naiveMape: 4.8 },
        { horizonMonths: 6, coverageP5P95: 90.4, targetCoverage: 90.0, baseMape: 5.1, naiveMape: 7.4 },
        { horizonMonths: 12, coverageP5P95: 89.6, targetCoverage: 90.0, baseMape: 7.9, naiveMape: 11.2 },
      ],
    };
  }

  return {
    id: `SIM-${Date.now().toString(36).toUpperCase()}`,
    mode,
    asOf: '2026-10-03T14:12:00Z',
    isStale: !!options?.isStaleData,
    product,
    underlyingName,
    spotPrice: spot,
    inputs,
    profile,
    headlineRange,
    cases,
    scenarios,
    payoffCurve,
    distribution,
    fan: mode === 'FORECAST' ? fan : undefined,
    modelCard,
    suitability,
    explanation,
  };
}

/**
 * Pre-seeded sample simulations (One per verdict: SUITABLE, CAUTION, NOT_SUITABLE)
 */
export const SEEDED_SAVED_SIMULATIONS: SavedSimulationRecord[] = [
  {
    id: 'SIM-OCT26-001',
    savedAt: '2026-10-02T16:45:00Z',
    clientName: 'Aarav & Sunita Mehta',
    product: 'ELN',
    underlying: 'NIFTY 50',
    notionalFormatted: 'INR 25,00,000',
    tenorDays: 180,
    verdict: 'CAUTION',
    mode: 'FORECAST',
    result: {
      id: 'SIM-OCT26-001',
      mode: 'FORECAST',
      asOf: '2026-10-02T16:00:00Z',
      isStale: false,
      product: 'ELN',
      underlyingName: 'NIFTY 50',
      spotPrice: 25124.50,
      inputs: {
        underlying: 'NIFTY 50',
        currency: 'INR',
        notional: 2500000,
        tenorDays: 180,
        strikePct: 100,
        barrierPct: 88,
        couponPctPa: 9.5,
        barrierType: 'European',
      },
      profile: DUMMY_PROFILE,
      headlineRange: 'Base +4.7%, likely range -14.2% to +4.7%',
      cases: {
        low: { scenarioLabel: 'Low Case (P5)', underlyingPctChange: -18.0, underlyingLevel: 20602.09, payoffAmount: 2167500, returnPct: -13.3, knockedIn: true },
        base: { scenarioLabel: 'Base Case (P50)', underlyingPctChange: 2.1, underlyingLevel: 25652.11, payoffAmount: 2617500, returnPct: 4.7, knockedIn: false },
        high: { scenarioLabel: 'High Case (P95)', underlyingPctChange: 14.5, underlyingLevel: 28767.55, payoffAmount: 2617500, returnPct: 4.7, knockedIn: false },
      },
      scenarios: [
        { scenarioLabel: '-25% Shock', underlyingPctChange: -25, underlyingLevel: 18843.38, payoffAmount: 1992500, returnPct: -20.3, knockedIn: true },
        { scenarioLabel: '-10% Shock', underlyingPctChange: -10, underlyingLevel: 22612.05, payoffAmount: 2617500, returnPct: 4.7, knockedIn: false },
        { scenarioLabel: '0% Shock', underlyingPctChange: 0, underlyingLevel: 25124.50, payoffAmount: 2617500, returnPct: 4.7, knockedIn: false },
        { scenarioLabel: '+10% Shock', underlyingPctChange: 10, underlyingLevel: 27636.95, payoffAmount: 2617500, returnPct: 4.7, knockedIn: false },
        { scenarioLabel: '+15% Shock', underlyingPctChange: 15, underlyingLevel: 28893.18, payoffAmount: 2617500, returnPct: 4.7, knockedIn: false },
      ],
      payoffCurve: generatePayoffCurve('ELN', {
        underlying: 'NIFTY 50', currency: 'INR', notional: 2500000, tenorDays: 180, strikePct: 100, barrierPct: 88, couponPctPa: 9.5, barrierType: 'European',
      }, 25124.50),
      distribution: {
        probLoss: 0.11,
        probKnockIn: 0.16,
        payoffP5: 2167500,
        payoffP50: 2617500,
        payoffP95: 2617500,
        returnP5: -13.3,
        returnP50: 4.7,
        returnP95: 4.7,
      },
      suitability: {
        verdict: 'CAUTION',
        flags: [
          { rule: 'Portfolio Concentration', reason: 'Allocation represents 18.0% of client portfolio, exceeding internal bank ceiling of 15.0%.', severity: 'WARNING' },
          { rule: 'Downside Knock-In Risk', reason: 'Barrier at 88.0% is breached in the P5 low scenario (20,602 vs 22,109), exposing principal to market downside.', severity: 'WARNING' },
        ],
      },
      explanation: {
        summary: 'ELN structure with European barrier provides 9.5% p.a. coupon. Client retains upside cap at 4.7% absolute return.',
        bestCase: 'Index stays above 22,109 barrier at maturity. Investor receives full INR 25,00,000 principal plus INR 1,17,500 coupon.',
        worstCase: 'Index breaches barrier to close at P5 terminal level (20,602.09). Principal is converted to index shares, generating net loss of -13.3%.',
        lossTrigger: 'European barrier breach evaluated strictly at 180-day maturity.',
        suitabilityRationale: 'Approved with Caution: concentration exceeds standard 15% guideline. Supervisory RM sign-off required prior to order entry.',
      },
      modelCard: {
        model: 'GARCH(1,1), Student-t distribution',
        trainingWindow: 'Oct 2016 – Oct 2026 (10Y)',
        drift: 'Risk-neutral martingale measure (0.0% drift)',
        asOfDate: '02 Oct 2026 16:00 IST',
        pathsCount: 10000,
        backtest: [
          { horizonMonths: 3, coverageP5P95: 91.8, targetCoverage: 90.0, baseMape: 3.2, naiveMape: 4.8 },
          { horizonMonths: 6, coverageP5P95: 90.4, targetCoverage: 90.0, baseMape: 5.1, naiveMape: 7.4 },
          { horizonMonths: 12, coverageP5P95: 89.6, targetCoverage: 90.0, baseMape: 7.9, naiveMape: 11.2 },
        ],
      },
    },
  },
  {
    id: 'SIM-SEP26-042',
    savedAt: '2026-09-28T11:20:00Z',
    clientName: 'Vikram Singhania',
    product: 'CPN',
    underlying: 'NIFTY 50',
    notionalFormatted: 'INR 1,00,00,000',
    tenorDays: 365,
    verdict: 'SUITABLE',
    mode: 'FORECAST',
    result: {
      id: 'SIM-SEP26-042',
      mode: 'FORECAST',
      asOf: '2026-09-28T11:00:00Z',
      isStale: false,
      product: 'CPN',
      underlyingName: 'NIFTY 50',
      spotPrice: 25124.50,
      inputs: {
        underlying: 'NIFTY 50',
        currency: 'INR',
        notional: 10000000,
        tenorDays: 365,
        protectionPct: 100,
        participationPct: 75,
        capPct: 125,
      },
      profile: DUMMY_PROFILE,
      headlineRange: 'Base +3.8%, likely range 0.0% to +14.6%',
      cases: {
        low: { scenarioLabel: 'Low Case (P5)', underlyingPctChange: -19.2, underlyingLevel: 20300.50, payoffAmount: 10000000, returnPct: 0.0, knockedIn: false },
        base: { scenarioLabel: 'Base Case (P50)', underlyingPctChange: 5.1, underlyingLevel: 26405.85, payoffAmount: 10382500, returnPct: 3.8, knockedIn: false },
        high: { scenarioLabel: 'High Case (P95)', underlyingPctChange: 19.5, underlyingLevel: 30023.78, payoffAmount: 11462500, returnPct: 14.6, knockedIn: false },
      },
      scenarios: [
        { scenarioLabel: '-25% Shock', underlyingPctChange: -25, underlyingLevel: 18843.38, payoffAmount: 10000000, returnPct: 0.0, knockedIn: false },
        { scenarioLabel: '-10% Shock', underlyingPctChange: -10, underlyingLevel: 22612.05, payoffAmount: 10000000, returnPct: 0.0, knockedIn: false },
        { scenarioLabel: '0% Shock', underlyingPctChange: 0, underlyingLevel: 25124.50, payoffAmount: 10000000, returnPct: 0.0, knockedIn: false },
        { scenarioLabel: '+10% Shock', underlyingPctChange: 10, underlyingLevel: 27636.95, payoffAmount: 10750000, returnPct: 7.5, knockedIn: false },
        { scenarioLabel: '+15% Shock', underlyingPctChange: 15, underlyingLevel: 28893.18, payoffAmount: 11125000, returnPct: 11.2, knockedIn: false },
      ],
      payoffCurve: generatePayoffCurve('CPN', {
        underlying: 'NIFTY 50', currency: 'INR', notional: 10000000, tenorDays: 365, protectionPct: 100, participationPct: 75, capPct: 125,
      }, 25124.50),
      distribution: {
        probLoss: 0.0,
        probKnockIn: undefined,
        payoffP5: 10000000,
        payoffP50: 10382500,
        payoffP95: 11462500,
        returnP5: 0.0,
        returnP50: 3.8,
        returnP95: 14.6,
      },
      suitability: {
        verdict: 'SUITABLE',
        flags: [],
      },
      explanation: {
        summary: '100% Capital Protected Note with 75% upside participation capped at 25% index gain. Ideal for wealth preservation.',
        bestCase: 'Index rallies +25% or more; client earns capped gain of 18.75% absolute return.',
        worstCase: 'Index crashes; client receives 100% principal back with zero nominal capital destruction.',
        lossTrigger: 'Capital protection is sovereign/issuer guaranteed. No market loss trigger exists.',
        suitabilityRationale: 'Fully aligns with Singhania Family Office conservative mandate: zero capital-at-risk.',
      },
      modelCard: {
        model: 'GARCH(1,1), Student-t distribution',
        trainingWindow: 'Oct 2016 – Oct 2026 (10Y)',
        drift: 'Risk-neutral martingale measure (0.0% drift)',
        asOfDate: '28 Sep 2026 11:00 IST',
        pathsCount: 10000,
        backtest: [
          { horizonMonths: 3, coverageP5P95: 91.8, targetCoverage: 90.0, baseMape: 3.2, naiveMape: 4.8 },
          { horizonMonths: 6, coverageP5P95: 90.4, targetCoverage: 90.0, baseMape: 5.1, naiveMape: 7.4 },
          { horizonMonths: 12, coverageP5P95: 89.6, targetCoverage: 90.0, baseMape: 7.9, naiveMape: 11.2 },
        ],
      },
    },
  },
  {
    id: 'SIM-AUG26-019',
    savedAt: '2026-08-14T09:15:00Z',
    clientName: 'Vikram Singhania',
    product: 'DCD',
    underlying: 'USD/INR',
    notionalFormatted: 'USD 500,000',
    tenorDays: 60,
    verdict: 'NOT_SUITABLE',
    mode: 'SHOCK',
    result: {
      id: 'SIM-AUG26-019',
      mode: 'SHOCK',
      asOf: '2026-08-14T09:00:00Z',
      isStale: false,
      product: 'DCD',
      underlyingName: 'USD/INR',
      spotPrice: 83.94,
      inputs: {
        currencyPair: 'USD/INR',
        depositCurrency: 'USD',
        alternateCurrency: 'INR',
        depositAmount: 500000,
        tenorDays: 60,
        strikeRate: 84.10,
        enhancedRatePctPa: 8.5,
      },
      profile: DUMMY_PROFILE,
      headlineRange: 'Manual Shock Terminal Return: -6.4%',
      cases: {
        low: { scenarioLabel: 'Stressed Shock (-20%)', underlyingPctChange: -4.8, underlyingLevel: 88.30, payoffAmount: 476217, returnPct: -4.8, knockedIn: true },
        base: { scenarioLabel: 'Selected Shock (-10%)', underlyingPctChange: -2.3, underlyingLevel: 86.05, payoffAmount: 488669, returnPct: -2.3, knockedIn: true },
        high: { scenarioLabel: 'Favorable Shock (+15%)', underlyingPctChange: 0.0, underlyingLevel: 83.50, payoffAmount: 506991, returnPct: 1.4, knockedIn: false },
      },
      scenarios: [
        { scenarioLabel: '-25% Shock', underlyingPctChange: -5.0, underlyingLevel: 88.50, payoffAmount: 475141, returnPct: -5.0, knockedIn: true },
        { scenarioLabel: '-10% Shock', underlyingPctChange: -2.0, underlyingLevel: 85.80, payoffAmount: 490093, returnPct: -2.0, knockedIn: true },
        { scenarioLabel: '0% Shock', underlyingPctChange: 0.0, underlyingLevel: 83.94, payoffAmount: 506991, returnPct: 1.4, knockedIn: false },
        { scenarioLabel: '+10% Shock', underlyingPctChange: 1.0, underlyingLevel: 83.10, payoffAmount: 506991, returnPct: 1.4, knockedIn: false },
        { scenarioLabel: '+15% Shock', underlyingPctChange: 2.0, underlyingLevel: 82.26, payoffAmount: 506991, returnPct: 1.4, knockedIn: false },
      ],
      payoffCurve: generatePayoffCurve('DCD', {
        currencyPair: 'USD/INR', depositCurrency: 'USD', alternateCurrency: 'INR', depositAmount: 500000, tenorDays: 60, strikeRate: 84.10, enhancedRatePctPa: 8.5,
      }, 83.94),
      suitability: {
        verdict: 'NOT_SUITABLE',
        flags: [
          { rule: 'Risk Appetite Misalignment', reason: 'DCD entails open-ended FX conversion risk, violating Conservative trust mandate.', severity: 'CRITICAL' },
          { rule: 'Loss Tolerance Exceeded', reason: 'Potential currency conversion loss (-4.8%) approaches client 5.0% absolute stop-loss ceiling.', severity: 'CRITICAL' },
        ],
      },
      explanation: {
        summary: 'Dual Currency Deposit with 8.5% p.a. enhanced yield in USD, linked to USD/INR conversion at 84.10 strike.',
        bestCase: 'INR remains stable or strengthens below 84.10; full USD 500,000 principal plus 1.4% 60-day yield repaid.',
        worstCase: 'INR weakens significantly above strike; deposit is converted to INR at 84.10 and devalued against USD.',
        lossTrigger: 'INR weakening past 84.10 at 60-day maturity fix.',
        suitabilityRationale: 'Strictly prohibited: Conservative profile precludes currency conversion exposure without hedging.',
      },
    },
  },
];

/**
 * Intelligent Mock Follow-up Q&A Response Generator
 * Synthesizes compliant, factually exact RM responses based strictly on the current simulation result
 */
export function getMockChatReply(
  query: string,
  result: SimulationResult
): string {
  const q = query.toLowerCase();
  const spot = result.spotPrice;
  const isEln = result.product === 'ELN';
  const isCpn = result.product === 'CPN';
  const isDcd = result.product === 'DCD';

  if (q.includes('breakeven') || q.includes('break even') || q.includes('zero')) {
    if (isEln) {
      const eln = result.inputs as ELNInputs;
      const couponTotalPct = eln.couponPctPa * (eln.tenorDays / 365);
      const beLevel = spot * (eln.strikePct / 100) * (1 - couponTotalPct / 100);
      return `For this ELN, the effective breakeven level at maturity is ${beLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })} (approx. ${couponTotalPct.toFixed(1)}% below the ${eln.strikePct}% strike). Even if the barrier is breached, the accumulated coupon cushion of ${couponTotalPct.toFixed(2)}% offsets index declines down to this level.`;
    } else if (isDcd) {
      const dcd = result.inputs as DCDInputs;
      const interestPct = dcd.enhancedRatePctPa * (dcd.tenorDays / 365);
      const beRate = dcd.strikeRate * (1 + interestPct / 100);
      return `For this DCD, breakeven in ${dcd.depositCurrency} terms occurs at a maturity exchange rate of ${beRate.toFixed(4)}. Any depreciation beyond this rate produces net negative returns.`;
    } else {
      return `For this 100% CPN, the nominal breakeven is guaranteed at spot. The client never suffers capital depletion at maturity irrespective of index performance.`;
    }
  }

  if (q.includes('downside') || q.includes('worst') || q.includes('crash') || q.includes('loss')) {
    return `Under the simulated low-case scenario (${result.cases.low.scenarioLabel}), ${result.underlyingName} drops to ${result.cases.low.underlyingLevel.toLocaleString()} (${result.cases.low.underlyingPctChange.toFixed(1)}%). The net payoff would be ${result.cases.low.payoffAmount.toLocaleString()} (${result.cases.low.returnPct.toFixed(1)}%). ${
      isEln
        ? 'Because the barrier was breached, the client directly participates in underlying equity losses.'
        : isCpn
        ? 'However, contractual capital protection absorbs the decline, ensuring the principal floor remains intact.'
        : 'The client is converted into the alternate currency at the disadvantageous strike rate.'
    }`;
  }

  if (q.includes('why') || q.includes('suitab') || q.includes('verdict') || q.includes('flag')) {
    if (result.suitability.verdict === 'SUITABLE') {
      return `The simulation is classified as SUITABLE because: (1) client risk appetite (${result.profile.riskAppetite}) accommodates the product structure; (2) product tenor (${result.inputs.tenorDays} days) does not exceed the ${result.profile.investmentHorizonMonths}-month horizon; and (3) portfolio concentration (${result.profile.concentrationPct}%) is within regulatory thresholds.`;
    }
    const reasons = result.suitability.flags.map((f) => `• ${f.rule}: ${f.reason}`).join('\n');
    return `Suitability verdict is ${result.suitability.verdict} due to the following flagged compliance rules:\n${reasons}`;
  }

  if (q.includes('tax') || q.includes('withhold')) {
    return `Structured product coupons are treated as ordinary interest income or capital gains depending on the booking jurisdiction and underlying legal wrapper (Debenture vs Note vs Offshore Deposit). Consult bank tax advisory for client-specific withholding certificate requirements.`;
  }

  if (q.includes('direct') || q.includes('compare') || q.includes('holding') || q.includes('cash')) {
    return `Compared to holding ${result.underlyingName} directly: this structured note caps upside at ${result.cases.high.returnPct.toFixed(1)}% in exchange for either an enhanced yield coupon or downside barrier protection. It outperforms direct equity holdings in flat to moderately bearish markets.`;
  }

  // Default institutional RM assistance response
  return `Regarding ${result.product} (${result.underlyingName}): The active simulation projects a base return of ${result.cases.base.returnPct >= 0 ? '+' : ''}${result.cases.base.returnPct.toFixed(1)}% with a likely P5-P95 distribution range of ${result.cases.low.returnPct.toFixed(1)}% to +${result.cases.high.returnPct.toFixed(1)}%. Suitability rating is ${result.suitability.verdict} for client ${result.profile.name}.`;
}
