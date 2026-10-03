/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * Enterprise Claymorphic Configuration & Client Mandate Panel
 */

import React, { useState, useEffect } from 'react';
import {
  ProductType,
  SimMode,
  ClientProfile,
  ELNInputs,
  DCDInputs,
  CPNInputs,
  ProductInputs,
} from '../api/types';
import { SAVED_PROFILES, SPOT_PRICES } from '../api/mock';
import { Sliders, UserCheck, Play, ChevronDown, ChevronUp, AlertCircle, Sparkles } from 'lucide-react';

interface ConfigPanelProps {
  product: ProductType;
  onSimulate: (
    inputs: ProductInputs,
    profile: ClientProfile,
    mode: SimMode,
    options: {
      trainingWindowYears: number;
      shockPct: number;
      forceFailure: boolean;
      isStaleData: boolean;
    }
  ) => void;
  loading: boolean;
  elapsedSeconds: number;
  initialMode?: SimMode;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  product,
  onSimulate,
  loading,
  elapsedSeconds,
  initialMode = 'FORECAST',
}) => {
  // Mode selection
  const [mode, setMode] = useState<SimMode>(initialMode);
  const [trainingWindowYears, setTrainingWindowYears] = useState<number>(10);
  const [shockPct, setShockPct] = useState<number>(-10);
  const [customShock, setCustomShock] = useState<string>('-10');
  const [forceFailure, setForceFailure] = useState<boolean>(false);
  const [isStaleData, setIsStaleData] = useState<boolean>(false);

  // Client Profile state
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(true);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(SAVED_PROFILES[0].id || 'prof-1');
  const [profile, setProfile] = useState<ClientProfile>({ ...SAVED_PROFILES[0] });

  // ELN state
  const [elnInputs, setElnInputs] = useState<ELNInputs>({
    underlying: 'NIFTY 50',
    currency: 'INR',
    notional: 2500000,
    tenorDays: 180,
    strikePct: 100,
    barrierPct: 85,
    couponPctPa: 9.5,
    barrierType: 'European',
  });

  // DCD state
  const [dcdInputs, setDcdInputs] = useState<DCDInputs>({
    currencyPair: 'USD/INR',
    depositCurrency: 'USD',
    alternateCurrency: 'INR',
    depositAmount: 250000,
    tenorDays: 60,
    strikeRate: 84.10,
    enhancedRatePctPa: 8.5,
  });

  // CPN state
  const [cpnInputs, setCpnInputs] = useState<CPNInputs>({
    underlying: 'NIFTY 50',
    currency: 'INR',
    notional: 5000000,
    tenorDays: 365,
    protectionPct: 100,
    participationPct: 75,
    capPct: 125,
  });

  // Inline Validation Errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const handleProfileSelect = (id: string) => {
    setSelectedProfileId(id);
    const found = SAVED_PROFILES.find((p) => p.id === id);
    if (found) {
      setProfile({ ...found });
    }
  };

  const formatTenorApprox = (days: number) => {
    if (!days || isNaN(days)) return '';
    if (days < 30) return `${days} days`;
    if (days >= 360) {
      const years = (days / 365).toFixed(1);
      return `≈ ${years} year${Number(years) > 1 ? 's' : ''}`;
    }
    const months = Math.round(days / 30);
    return `≈ ${months} month${months > 1 ? 's' : ''}`;
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};

    if (product === 'ELN') {
      if (elnInputs.notional <= 0) {
        errs.notional = 'Notional must be greater than zero.';
      }
      if (elnInputs.tenorDays < 30 || elnInputs.tenorDays > 1095) {
        errs.tenorDays = 'Tenor must be between 30 and 1,095 days.';
      }
      if (elnInputs.barrierPct >= elnInputs.strikePct) {
        errs.barrierPct = `Barrier must be strictly below strike (currently ${elnInputs.barrierPct}% vs ${elnInputs.strikePct}%).`;
      }
      if (elnInputs.couponPctPa <= 0 || elnInputs.couponPctPa > 40) {
        errs.couponPctPa = 'Coupon must be between 0.1% and 40.0% p.a.';
      }
    } else if (product === 'DCD') {
      if (dcdInputs.depositAmount <= 0) {
        errs.depositAmount = 'Deposit amount must be greater than zero.';
      }
      if (dcdInputs.tenorDays < 14 || dcdInputs.tenorDays > 365) {
        errs.tenorDays = 'Tenor must be between 14 and 365 days.';
      }
      if (dcdInputs.strikeRate <= 0) {
        errs.strikeRate = 'Strike rate must be positive.';
      }
      if (dcdInputs.enhancedRatePctPa <= 0 || dcdInputs.enhancedRatePctPa > 30) {
        errs.enhancedRatePctPa = 'Enhanced rate must be between 0.1% and 30.0% p.a.';
      }
    } else {
      if (cpnInputs.notional <= 0) {
        errs.notional = 'Notional must be greater than zero.';
      }
      if (cpnInputs.tenorDays < 90 || cpnInputs.tenorDays > 1095) {
        errs.tenorDays = 'CPN tenor must be between 90 and 1,095 days.';
      }
      if (cpnInputs.protectionPct < 80 || cpnInputs.protectionPct > 100) {
        errs.protectionPct = 'Capital floor must be between 80% and 100%.';
      }
      if (cpnInputs.participationPct <= 0 || cpnInputs.participationPct > 200) {
        errs.participationPct = 'Participation must be between 1% and 200%.';
      }
      if (cpnInputs.capPct !== null && cpnInputs.capPct <= 100) {
        errs.capPct = 'Cap must exceed 100% (or leave uncapped).';
      }
    }

    if (profile.lossTolerancePct < 0 || profile.lossTolerancePct > 100) {
      errs.lossTolerancePct = 'Loss tolerance must be between 0% and 100%.';
    }
    if (profile.investmentHorizonMonths < 1 || profile.investmentHorizonMonths > 120) {
      errs.investmentHorizonMonths = 'Investment horizon must be between 1 and 120 months.';
    }
    if (profile.concentrationPct < 0 || profile.concentrationPct > 100) {
      errs.concentrationPct = 'Portfolio concentration must be between 0% and 100%.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validateForm();
  };

  const handleRunClick = () => {
    const allTouched: Record<string, boolean> = {
      notional: true,
      tenorDays: true,
      barrierPct: true,
      strikePct: true,
      couponPctPa: true,
      depositAmount: true,
      strikeRate: true,
      enhancedRatePctPa: true,
      protectionPct: true,
      participationPct: true,
      capPct: true,
      lossTolerancePct: true,
      investmentHorizonMonths: true,
      concentrationPct: true,
    };
    setTouched(allTouched);

    if (!validateForm()) return;

    const currentInputs: ProductInputs =
      product === 'ELN' ? elnInputs : product === 'DCD' ? dcdInputs : cpnInputs;

    onSimulate(currentInputs, profile, mode, {
      trainingWindowYears,
      shockPct,
      forceFailure,
      isStaleData,
    });
  };

  const isValid = Object.keys(errors).length === 0;
  const liveSpot = SPOT_PRICES[elnInputs.underlying] || 25124.50;

  return (
    <div className="w-full space-y-5 text-[#1B1B1B] text-xs">
      {/* SECTION 1: Product Configuration Clay Card */}
      <section className="clay-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-black/5 pb-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#7A1F2B]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1B1B1B]/70">
              Product Parameters
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#FAF9F6] border border-black/5 text-[#7A1F2B] font-semibold">
            {product === 'ELN' ? 'Reverse Convertible' : product === 'DCD' ? 'Dual Currency' : 'Capital Protected'}
          </span>
        </div>

        {/* ELN Inputs */}
        {product === 'ELN' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                Underlying Equity Index
              </label>
              <div className="clay-inset p-1">
                <select
                  value={elnInputs.underlying}
                  onChange={(e) => setElnInputs({ ...elnInputs, underlying: e.target.value })}
                  className="w-full bg-transparent px-2 py-1 text-xs focus:outline-none font-medium cursor-pointer"
                >
                  <option value="NIFTY 50">NIFTY 50 (Spot: 25,124.50)</option>
                  <option value="S&P 500">S&P 500 (Spot: 5,751.20)</option>
                  <option value="RELIANCE IND.">RELIANCE IND. (Spot: 2,980.40)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                  Currency
                </label>
                <div className="clay-inset p-2 font-mono text-xs text-[#1B1B1B]/60">
                  {elnInputs.currency}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                  Notional (INR)
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    value={elnInputs.notional}
                    onChange={(e) => setElnInputs({ ...elnInputs, notional: Number(e.target.value) })}
                    onBlur={() => handleBlur('notional')}
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
                {touched.notional && errors.notional && (
                  <p className="text-[10px] text-[#822B24] font-mono mt-1">{errors.notional}</p>
                )}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-medium text-[#1B1B1B]/75">
                  Tenor (Calendar Days)
                </label>
                <span className="text-[10px] font-mono text-[#7A1F2B] font-semibold">
                  {formatTenorApprox(elnInputs.tenorDays)}
                </span>
              </div>
              <div className="clay-inset p-1">
                <input
                  type="number"
                  value={elnInputs.tenorDays}
                  onChange={(e) => setElnInputs({ ...elnInputs, tenorDays: Math.floor(Number(e.target.value)) })}
                  onBlur={() => handleBlur('tenorDays')}
                  className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                />
              </div>
              {touched.tenorDays && errors.tenorDays && (
                <p className="text-[10px] text-[#822B24] font-mono mt-1">{errors.tenorDays}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                  Strike % of Spot
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    step="0.5"
                    value={elnInputs.strikePct}
                    onChange={(e) => setElnInputs({ ...elnInputs, strikePct: Number(e.target.value) })}
                    onBlur={() => handleBlur('strikePct')}
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                  Barrier % of Spot
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    step="0.5"
                    value={elnInputs.barrierPct}
                    onChange={(e) => setElnInputs({ ...elnInputs, barrierPct: Number(e.target.value) })}
                    onBlur={() => handleBlur('barrierPct')}
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>
            {touched.barrierPct && errors.barrierPct && (
              <p className="text-[10px] text-[#822B24] font-mono">{errors.barrierPct}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                  Coupon % p.a.
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    step="0.25"
                    value={elnInputs.couponPctPa}
                    onChange={(e) => setElnInputs({ ...elnInputs, couponPctPa: Number(e.target.value) })}
                    onBlur={() => handleBlur('couponPctPa')}
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
                {touched.couponPctPa && errors.couponPctPa && (
                  <p className="text-[10px] text-[#822B24] font-mono mt-1">{errors.couponPctPa}</p>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                  Barrier Type
                </label>
                <div className="clay-inset p-1">
                  <select
                    value={elnInputs.barrierType}
                    onChange={(e) => setElnInputs({ ...elnInputs, barrierType: e.target.value as any })}
                    className="w-full bg-transparent px-2 py-1 text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="European">European (Maturity Only)</option>
                    <option value="American">American (Continuous)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DCD Inputs */}
        {product === 'DCD' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                Currency Pair
              </label>
              <div className="clay-inset p-1">
                <select
                  value={dcdInputs.currencyPair}
                  onChange={(e) => {
                    const pair = e.target.value;
                    const [base, alt] = pair.split('/');
                    setDcdInputs({
                      ...dcdInputs,
                      currencyPair: pair,
                      depositCurrency: base,
                      alternateCurrency: alt,
                      strikeRate: SPOT_PRICES[pair] || 84.10,
                    });
                  }}
                  className="w-full bg-transparent px-2 py-1 text-xs focus:outline-none cursor-pointer"
                >
                  <option value="USD/INR">USD / INR (Base USD, Alt INR @ 83.94)</option>
                  <option value="EUR/USD">EUR / USD (Base EUR, Alt USD @ 1.0850)</option>
                  <option value="GBP/USD">GBP / USD (Base GBP, Alt USD @ 1.3025)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                  Deposit Amount ({dcdInputs.depositCurrency})
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    value={dcdInputs.depositAmount}
                    onChange={(e) => setDcdInputs({ ...dcdInputs, depositAmount: Number(e.target.value) })}
                    onBlur={() => handleBlur('depositAmount')}
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
                {touched.depositAmount && errors.depositAmount && (
                  <p className="text-[10px] text-[#822B24] font-mono mt-1">{errors.depositAmount}</p>
                )}
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-medium text-[#1B1B1B]/75">Tenor (Days)</label>
                  <span className="text-[10px] font-mono text-[#7A1F2B] font-semibold">
                    {formatTenorApprox(dcdInputs.tenorDays)}
                  </span>
                </div>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    value={dcdInputs.tenorDays}
                    onChange={(e) => setDcdInputs({ ...dcdInputs, tenorDays: Math.floor(Number(e.target.value)) })}
                    onBlur={() => handleBlur('tenorDays')}
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
                {touched.tenorDays && errors.tenorDays && (
                  <p className="text-[10px] text-[#822B24] font-mono mt-1">{errors.tenorDays}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                  Strike Rate
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    step="0.05"
                    value={dcdInputs.strikeRate}
                    onChange={(e) => setDcdInputs({ ...dcdInputs, strikeRate: Number(e.target.value) })}
                    onBlur={() => handleBlur('strikeRate')}
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                  Enhanced Rate % p.a.
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    step="0.25"
                    value={dcdInputs.enhancedRatePctPa}
                    onChange={(e) => setDcdInputs({ ...dcdInputs, enhancedRatePctPa: Number(e.target.value) })}
                    onBlur={() => handleBlur('enhancedRatePctPa')}
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CPN Inputs */}
        {product === 'CPN' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                Underlying Index
              </label>
              <div className="clay-inset p-1">
                <select
                  value={cpnInputs.underlying}
                  onChange={(e) => setCpnInputs({ ...cpnInputs, underlying: e.target.value })}
                  className="w-full bg-transparent px-2 py-1 text-xs focus:outline-none cursor-pointer"
                >
                  <option value="NIFTY 50">NIFTY 50 (Spot: 25,124.50)</option>
                  <option value="S&P 500">S&P 500 (Spot: 5,751.20)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
                  Notional (INR)
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    value={cpnInputs.notional}
                    onChange={(e) => setCpnInputs({ ...cpnInputs, notional: Number(e.target.value) })}
                    onBlur={() => handleBlur('notional')}
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-medium text-[#1B1B1B]/75">Tenor (Days)</label>
                  <span className="text-[10px] font-mono text-[#7A1F2B] font-semibold">
                    {formatTenorApprox(cpnInputs.tenorDays)}
                  </span>
                </div>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    value={cpnInputs.tenorDays}
                    onChange={(e) => setCpnInputs({ ...cpnInputs, tenorDays: Math.floor(Number(e.target.value)) })}
                    onBlur={() => handleBlur('tenorDays')}
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-[#1B1B1B]/75 mb-1">
                  Floor %
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    value={cpnInputs.protectionPct}
                    onChange={(e) => setCpnInputs({ ...cpnInputs, protectionPct: Number(e.target.value) })}
                    className="w-full bg-transparent px-1.5 py-1 font-mono text-xs focus:outline-none text-center"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[#1B1B1B]/75 mb-1">
                  Participation %
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    value={cpnInputs.participationPct}
                    onChange={(e) => setCpnInputs({ ...cpnInputs, participationPct: Number(e.target.value) })}
                    className="w-full bg-transparent px-1.5 py-1 font-mono text-xs focus:outline-none text-center"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[#1B1B1B]/75 mb-1">
                  Cap %
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    placeholder="None"
                    value={cpnInputs.capPct === null ? '' : cpnInputs.capPct}
                    onChange={(e) =>
                      setCpnInputs({
                        ...cpnInputs,
                        capPct: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="w-full bg-transparent px-1.5 py-1 font-mono text-xs focus:outline-none text-center"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 2: Client Profile Clay Card */}
      <section className="clay-card p-5 space-y-3">
        <div
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className="flex items-center justify-between cursor-pointer select-none border-b border-black/5 pb-2"
        >
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#7A1F2B]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1B1B1B]/70">
              Client Mandate
            </span>
          </div>
          <button className="text-[#7A1F2B] hover:opacity-80 transition-opacity">
            {isProfileOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Saved Profiles */}
        <div>
          <label className="block text-[11px] font-medium text-[#1B1B1B]/75 mb-1">
            Load Saved Profile
          </label>
          <div className="clay-inset p-1">
            <select
              value={selectedProfileId}
              onChange={(e) => handleProfileSelect(e.target.value)}
              className="w-full bg-transparent px-2 py-1 text-xs focus:outline-none cursor-pointer"
            >
              {SAVED_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isProfileOpen && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-[#1B1B1B]/75 mb-1">
                  Risk Appetite
                </label>
                <div className="clay-inset p-1">
                  <select
                    value={profile.riskAppetite}
                    onChange={(e) => setProfile({ ...profile, riskAppetite: e.target.value as any })}
                    className="w-full bg-transparent px-2 py-1 text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="Conservative">Conservative</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Aggressive">Aggressive</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[#1B1B1B]/75 mb-1">
                  Horizon (Mo)
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    value={profile.investmentHorizonMonths}
                    onChange={(e) =>
                      setProfile({ ...profile, investmentHorizonMonths: Number(e.target.value) })
                    }
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-[#1B1B1B]/75 mb-1">
                  Loss Tolerance %
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    value={profile.lossTolerancePct}
                    onChange={(e) =>
                      setProfile({ ...profile, lossTolerancePct: Number(e.target.value) })
                    }
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[#1B1B1B]/75 mb-1">
                  Portfolio Conc. %
                </label>
                <div className="clay-inset p-1">
                  <input
                    type="number"
                    value={profile.concentrationPct}
                    onChange={(e) =>
                      setProfile({ ...profile, concentrationPct: Number(e.target.value) })
                    }
                    className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: Simulation Mode Clay Card */}
      <section className="clay-card p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-black/5 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#7A1F2B]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1B1B1B]/70">
              Simulation Mode
            </span>
          </div>
        </div>

        {/* Mode Segmented Clay Control */}
        <div className="clay-segmented-track grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setMode('FORECAST')}
            className={`py-2 text-center text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-all duration-200 ${
              mode === 'FORECAST'
                ? 'clay-segmented-active font-bold'
                : 'text-[#1B1B1B]/60 hover:text-[#1B1B1B]'
            }`}
          >
            Mode A: Forecast
          </button>
          <button
            type="button"
            onClick={() => setMode('SHOCK')}
            className={`py-2 text-center text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-all duration-200 ${
              mode === 'SHOCK'
                ? 'clay-segmented-active font-bold'
                : 'text-[#1B1B1B]/60 hover:text-[#1B1B1B]'
            }`}
          >
            Mode B: Shock
          </button>
        </div>

        {/* Mode Specific Controls */}
        {mode === 'FORECAST' ? (
          <div className="space-y-2.5 pt-1">
            <p className="text-[11px] font-mono text-[#1B1B1B]/70 leading-snug">
              Model: GARCH(1,1), Student-t. Calibration: 10Y (5Y opt). Paths: 10,000+.
            </p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-[#1B1B1B]/70">Window:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setTrainingWindowYears(10)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono cursor-pointer transition-all ${
                    trainingWindowYears === 10
                      ? 'bg-[#1B1B1B] text-white shadow-sm'
                      : 'clay-btn-secondary'
                  }`}
                >
                  10 Years
                </button>
                <button
                  type="button"
                  onClick={() => setTrainingWindowYears(5)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono cursor-pointer transition-all ${
                    trainingWindowYears === 5
                      ? 'bg-[#1B1B1B] text-white shadow-sm'
                      : 'clay-btn-secondary'
                  }`}
                >
                  5 Years
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-black/5 flex items-center justify-between text-[10px] text-[#1B1B1B]/60">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceFailure}
                  onChange={(e) => setForceFailure(e.target.checked)}
                  className="rounded-[2px] accent-[#7A1F2B]"
                />
                <span>Simulate failure</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isStaleData}
                  onChange={(e) => setIsStaleData(e.target.checked)}
                  className="rounded-[2px] accent-[#7A1F2B]"
                />
                <span>Stale quote</span>
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <div className="flex justify-between items-center text-[11px] font-mono">
              <span className="text-[#1B1B1B]/70">Spot Reference:</span>
              <strong>{liveSpot.toLocaleString()}</strong>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-[#1B1B1B]/70 mb-1.5">
                Shock Presets
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[-25, -10, 0, 10, 15].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setShockPct(preset);
                      setCustomShock(preset.toString());
                    }}
                    className={`py-1.5 text-center font-mono text-[10px] rounded-lg cursor-pointer transition-all ${
                      shockPct === preset
                        ? 'bg-[#7A1F2B] text-white shadow-[2px_3px_6px_rgba(122,31,43,0.3)]'
                        : 'clay-btn-secondary'
                    }`}
                  >
                    {preset > 0 ? `+${preset}%` : `${preset}%`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-[#1B1B1B]/70 mb-1">
                Custom Shift %
              </label>
              <div className="clay-inset p-1">
                <input
                  type="number"
                  step="0.5"
                  value={customShock}
                  onChange={(e) => {
                    setCustomShock(e.target.value);
                    setShockPct(Number(e.target.value));
                  }}
                  className="w-full bg-transparent px-2 py-1 font-mono text-xs focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Primary Action Button */}
      <div>
        <button
          type="button"
          disabled={!isValid || loading}
          onClick={handleRunClick}
          className={`w-full py-3.5 text-center text-xs font-semibold uppercase tracking-[0.2em] relative overflow-hidden flex items-center justify-center gap-2 cursor-pointer ${
            loading
              ? 'bg-[#E5E2D9] text-[#1B1B1B]/50 cursor-wait rounded-xl shadow-inner'
              : !isValid
              ? 'bg-[#DCD8CF] text-[#1B1B1B]/40 cursor-not-allowed rounded-xl'
              : 'clay-btn-primary'
          }`}
        >
          {loading ? (
            <>
              <div className="absolute inset-0 bg-white/20 animate-wave-bar" />
              <span>Running 10,000 paths… ({elapsedSeconds.toFixed(1)}s)</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run Simulation</span>
            </>
          )}
        </button>

        {loading && (
          <div className="mt-2 text-center font-mono text-[10px] text-[#1B1B1B]/60 animate-pulse">
            Simulating stochastic paths & checking suitability matrices…
          </div>
        )}

        {!isValid && (
          <div className="mt-2 text-center text-[10px] font-mono text-[#822B24] flex items-center justify-center gap-1">
            <AlertCircle className="w-3 h-3" />
            <span>Please resolve configuration errors above.</span>
          </div>
        )}
      </div>
    </div>
  );
};
