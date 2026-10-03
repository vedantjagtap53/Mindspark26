/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * Enterprise Claymorphic Payoff Chart with Interactive Beacon & Floating Pill Tooltip
 */

import React, { useState, useRef, useId } from 'react';
import { ProductType, PayoffCurvePoint, ProductInputs, ELNInputs, DCDInputs, CPNInputs } from '../../api/types';

interface PayoffChartProps {
  product: ProductType;
  inputs: ProductInputs;
  spotPrice: number;
  curve: PayoffCurvePoint[];
}

export const PayoffChart: React.FC<PayoffChartProps> = ({
  product,
  inputs,
  spotPrice,
  curve,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<PayoffCurvePoint | null>(null);
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);
  const clipId = useId();
  const gradId = useId();

  if (!curve || curve.length === 0) {
    return null;
  }

  // ViewBox dimensions
  const width = 760;
  const height = 340;
  const margin = { top: 32, right: 90, bottom: 44, left: 68 };

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  // Domain calculations
  const minPct = -30;
  const maxPct = 30;

  const minReturn = Math.min(...curve.map((p) => p.returnPct), -25);
  const maxReturn = Math.max(...curve.map((p) => p.returnPct), 20);

  const yDomainMin = Math.floor(minReturn / 5) * 5 - 5;
  const yDomainMax = Math.ceil(maxReturn / 5) * 5 + 5;

  const getX = (pct: number) => {
    return margin.left + ((pct - minPct) / (maxPct - minPct)) * plotWidth;
  };

  const getY = (ret: number) => {
    return margin.top + (1 - (ret - yDomainMin) / (yDomainMax - yDomainMin)) * plotHeight;
  };

  const xZero = getX(0);
  const yZero = getY(0);

  // Curve path and area fill
  const pathD = curve.reduce((acc, pt, idx) => {
    const x = getX(pt.underlyingPct);
    const y = getY(pt.returnPct);
    return idx === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `${acc} L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }, '');

  const areaD = `${pathD} L ${getX(30)} ${yZero} L ${getX(-30)} ${yZero} Z`;

  // Reference lines
  let strikePct = 0;
  let barrierPct: number | null = null;
  let breakevenPct: number | null = null;
  let cliffAnnotation: { x: number; y: number; label: string } | null = null;

  if (product === 'ELN') {
    const eln = inputs as ELNInputs;
    strikePct = eln.strikePct - 100;
    barrierPct = eln.barrierPct - 100;
    const couponTotalPct = eln.couponPctPa * (eln.tenorDays / 365);
    breakevenPct = (eln.strikePct * (1 - couponTotalPct / 100)) - 100;

    const cliffPoint = curve.find((p) => p.underlyingPct === Math.round(barrierPct!));
    if (cliffPoint) {
      cliffAnnotation = {
        x: getX(barrierPct),
        y: getY(cliffPoint.returnPct),
        label: `BARRIER CLIFF (${eln.barrierPct}%)`,
      };
    }
  } else if (product === 'DCD') {
    const dcd = inputs as DCDInputs;
    const spot = spotPrice || 83.94;
    strikePct = ((dcd.strikeRate - spot) / spot) * 100;
    const interestTotalPct = dcd.enhancedRatePctPa * (dcd.tenorDays / 365);
    breakevenPct = strikePct + interestTotalPct;
  } else if (product === 'CPN') {
    const cpn = inputs as CPNInputs;
    strikePct = 0;
    breakevenPct = 0;
    if (cpn.capPct) {
      const capPct = cpn.capPct - 100;
      cliffAnnotation = {
        x: getX(capPct),
        y: getY(((cpn.capPct - 100) * cpn.participationPct) / 100),
        label: `CAP (${cpn.capPct}%)`,
      };
    }
  }

  const yStep = yDomainMax - yDomainMin > 40 ? 10 : 5;
  const yTicks: number[] = [];
  for (let val = yDomainMin; val <= yDomainMax; val += yStep) {
    yTicks.push(val);
  }

  const xTicks = [-25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const scaleX = width / rect.width;
    const svgX = mouseX * scaleX;

    if (svgX < margin.left || svgX > width - margin.right) {
      setHoveredPoint(null);
      setCrosshairPos(null);
      return;
    }

    const pct = minPct + ((svgX - margin.left) / plotWidth) * (maxPct - minPct);
    const closest = curve.reduce((prev, curr) => {
      return Math.abs(curr.underlyingPct - pct) < Math.abs(prev.underlyingPct - pct) ? curr : prev;
    });

    setHoveredPoint(closest);
    setCrosshairPos({
      x: getX(closest.underlyingPct),
      y: getY(closest.returnPct),
    });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setCrosshairPos(null);
  };

  return (
    <div className="clay-tile p-5 flex flex-col justify-between">
      {/* Title and Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3 mb-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)] block font-sans">
            Payoff Profile at Maturity
          </span>
          <span className="text-xs font-serif text-[var(--ink-primary)]">
            Net Return % vs Underlying Price Movement ({inputs.tenorDays} Days)
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--well-bg)] border border-[var(--border-color)] shadow-xs">
            <span className="w-2.5 h-1 rounded-full bg-[var(--chart-payoff-stroke)]" />
            <span className="text-[var(--ink-primary)] font-semibold">Payoff Curve</span>
          </div>
          {product === 'ELN' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full clay-badge-unsafe shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[var(--status-breach-text)] animate-pulse" />
              <span>Barrier Level</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--well-bg)] border border-[var(--border-color)] shadow-xs">
            <span className="w-2 h-0.5 border-t border-dashed border-[var(--ink-muted)]" />
            <span className="text-[var(--ink-muted)]">Strike (100%)</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas with Clay Aesthetics */}
      <div className="relative overflow-hidden select-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto cursor-crosshair block"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} rx={8} />
            </clipPath>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-area-fill)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--chart-area-fill)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Background Area Fill */}
          <path d={areaD} fill={`url(#${gradId})`} clipPath={`url(#${clipId})`} />

          {/* Horizontal Gridlines */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            const isZero = tick === 0;
            return (
              <g key={tick}>
                <line
                  x1={margin.left}
                  y1={y}
                  x2={width - margin.right}
                  y2={y}
                  stroke={isZero ? 'var(--chart-payoff-stroke)' : 'var(--chart-grid-stroke)'}
                  strokeWidth={isZero ? 1.4 : 0.8}
                  strokeDasharray={isZero ? 'none' : '3,3'}
                />
                <text
                  x={margin.left - 10}
                  y={y + 3.5}
                  textAnchor="end"
                  className={`font-mono text-[9px] ${isZero ? 'fill-[var(--ink-primary)] font-bold' : 'fill-[var(--ink-muted)]'}`}
                >
                  {tick > 0 ? `+${tick}%` : `${tick}%`}
                </text>
              </g>
            );
          })}

          {/* Vertical Gridlines & X Ticks */}
          {xTicks.map((pct) => {
            const x = getX(pct);
            const isSpot = pct === 0;
            return (
              <g key={pct}>
                <line
                  x1={x}
                  y1={margin.top}
                  x2={x}
                  y2={height - margin.bottom}
                  stroke={isSpot ? '#575757' : '#D4C7AE'}
                  strokeWidth={isSpot ? 1.0 : 0.6}
                />
                <text
                  x={x}
                  y={height - margin.bottom + 16}
                  textAnchor="middle"
                  className={`font-mono text-[9px] ${isSpot ? 'fill-[#2C2C2C] font-bold' : 'fill-[#575757]'}`}
                >
                  {pct === 0 ? 'Spot' : `${pct > 0 ? '+' : ''}${pct}%`}
                </text>
              </g>
            );
          })}

          {/* Reference Line: Strike */}
          {strikePct >= minPct && strikePct <= maxPct && (
            <g>
              <line
                x1={getX(strikePct)}
                y1={margin.top}
                x2={getX(strikePct)}
                y2={height - margin.bottom}
                stroke="#575757"
                strokeWidth={1.2}
                strokeDasharray="4,4"
              />
              <text
                x={getX(strikePct) + 5}
                y={margin.top + 12}
                className="font-mono text-[8.5px] fill-[#575757] font-semibold"
              >
                STRIKE ({product === 'ELN' ? (inputs as ELNInputs).strikePct : 100}%)
              </text>
            </g>
          )}

          {/* Reference Line: Barrier (ELN) */}
          {barrierPct !== null && barrierPct >= minPct && barrierPct <= maxPct && (
            <g>
              <line
                x1={getX(barrierPct)}
                y1={margin.top}
                x2={getX(barrierPct)}
                y2={height - margin.bottom}
                stroke="#8A2B20"
                strokeWidth={1.5}
                strokeDasharray="3,3"
              />
              <text
                x={getX(barrierPct) - 6}
                y={margin.top + 24}
                textAnchor="end"
                className="font-mono text-[8.5px] fill-[#8A2B20] font-bold"
              >
                BARRIER ({(inputs as ELNInputs).barrierPct}%)
              </text>
            </g>
          )}

          {/* Reference Line: Breakeven */}
          {breakevenPct !== null && breakevenPct >= minPct && breakevenPct <= maxPct && (
            <g>
              <line
                x1={getX(breakevenPct)}
                y1={yZero - 12}
                x2={getX(breakevenPct)}
                y2={yZero + 12}
                stroke="#8C5914"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <text
                x={getX(breakevenPct)}
                y={yZero - 16}
                textAnchor="middle"
                className="font-mono text-[8px] fill-[#8C5914] font-bold"
              >
                BREAKEVEN ({breakevenPct > 0 ? '+' : ''}{breakevenPct.toFixed(1)}%)
              </text>
            </g>
          )}

          {/* Payoff Curve Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#2C2C2C"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Product Specific Discontinuity Annotations */}
          {product === 'ELN' && cliffAnnotation && (
            <g>
              {/* Outer beacon pulse */}
              <circle
                cx={cliffAnnotation.x}
                cy={cliffAnnotation.y}
                r={7}
                fill="#822B24"
                opacity={0.2}
                className="animate-ping"
              />
              <circle
                cx={cliffAnnotation.x}
                cy={cliffAnnotation.y}
                r={4}
                fill="#822B24"
                stroke="#FAF9F6"
                strokeWidth={1.5}
              />
              <g transform={`translate(${cliffAnnotation.x - 70}, ${cliffAnnotation.y + 16})`}>
                <rect
                  width={140}
                  height={20}
                  rx={6}
                  fill="#FAF9F6"
                  stroke="rgba(130, 43, 36, 0.4)"
                  strokeWidth={1}
                  className="shadow-sm"
                />
                <text
                  x={70}
                  y={13}
                  textAnchor="middle"
                  className="font-mono text-[8.5px] fill-[#822B24] font-bold"
                >
                  {cliffAnnotation.label}
                </text>
              </g>
            </g>
          )}

          {product === 'DCD' && (
            <g>
              <text
                x={width - margin.right - 10}
                y={margin.top + 45}
                textAnchor="end"
                className="font-mono text-[9px] fill-[#2D4A22] font-semibold"
              >
                CAPPED GAIN (Enhanced Rate) →
              </text>
              <text
                x={margin.left + 15}
                y={height - margin.bottom - 20}
                textAnchor="start"
                className="font-mono text-[9px] fill-[#822B24] font-semibold"
              >
                ← OPEN-ENDED FX CONVERSION LOSS
              </text>
            </g>
          )}

          {product === 'CPN' && (
            <g>
              <text
                x={margin.left + 20}
                y={yZero - 8}
                className="font-mono text-[9px] fill-[#2D4A22] font-semibold"
              >
                PROTECTED CAPITAL FLOOR ({(inputs as CPNInputs).protectionPct}%)
              </text>
              <text
                x={width - margin.right - 10}
                y={margin.top + 40}
                textAnchor="end"
                className="font-mono text-[9px] fill-[#7A1F2B] font-semibold"
              >
                {(inputs as CPNInputs).participationPct}% PARTICIPATION UPSIDE ↗
              </text>
            </g>
          )}

          {/* Interactive Crosshair */}
          {crosshairPos && (
            <g>
              <line
                x1={crosshairPos.x}
                y1={margin.top}
                x2={crosshairPos.x}
                y2={height - margin.bottom}
                stroke="#575757"
                strokeWidth={1}
                strokeDasharray="2,2"
                opacity={0.7}
              />
              <line
                x1={margin.left}
                y1={crosshairPos.y}
                x2={width - margin.right}
                y2={crosshairPos.y}
                stroke="#575757"
                strokeWidth={1}
                strokeDasharray="2,2"
                opacity={0.7}
              />
              {/* Dual ring target */}
              <circle
                cx={crosshairPos.x}
                cy={crosshairPos.y}
                r={6}
                fill="#575757"
                opacity={0.25}
              />
              <circle
                cx={crosshairPos.x}
                cy={crosshairPos.y}
                r={3.5}
                fill="#575757"
                stroke="#FFFFFF"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>

        {/* Hover Readout Clay Capsule */}
        <div className="mt-3 p-3 clay-inset flex flex-wrap items-center justify-between text-xs font-mono">
          {hoveredPoint ? (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                <span>
                  Underlying:{' '}
                  <strong className="text-[#2C2C2C]">
                    {hoveredPoint.underlyingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </strong>{' '}
                  <span className="opacity-70 text-[#575757]">
                    ({hoveredPoint.underlyingPct >= 0 ? '+' : ''}
                    {hoveredPoint.underlyingPct.toFixed(1)}%)
                  </span>
                </span>
                <span>
                  Net Return:{' '}
                  <strong
                    className={
                      hoveredPoint.returnPct > 0
                        ? 'text-[#225C36]'
                        : hoveredPoint.returnPct < 0
                        ? 'text-[#8A2B20]'
                        : 'text-[#2C2C2C]'
                    }
                  >
                    {hoveredPoint.returnPct >= 0 ? '+' : ''}
                    {hoveredPoint.returnPct.toFixed(2)}%
                  </strong>
                </span>
                <span>
                  Payoff Amount:{' '}
                  <strong className="text-[#2C2C2C]">
                    {hoveredPoint.payoffAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </strong>
                </span>
              </div>
              {hoveredPoint.knockedIn !== undefined && (
                <div className="text-[11px]">
                  Barrier:{' '}
                  <span
                    className={`font-semibold ${
                      hoveredPoint.knockedIn ? 'text-[#8A2B20]' : 'text-[#225C36]'
                    }`}
                  >
                    {hoveredPoint.knockedIn ? 'KNOCKED IN (At Risk)' : 'INTACT (Protected)'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="opacity-50 text-[11px] italic">
              Hover over curve for precise terminal level, payoff amount, and barrier status.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
