/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * Enterprise Claymorphic Forecast Fan Chart with Trading Holiday Gaps & Crosshairs
 */

import React, { useState, useRef, useId } from 'react';
import { FanPoint, ProductType, ProductInputs, ELNInputs, DCDInputs } from '../../api/types';

interface FanChartProps {
  fan: FanPoint[];
  product: ProductType;
  inputs: ProductInputs;
  spotPrice: number;
}

export const FanChart: React.FC<FanChartProps> = ({
  fan,
  product,
  inputs,
  spotPrice,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<FanPoint | null>(null);
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);
  const clipId = useId().replace(/:/g, '');
  const fanGradId = useId().replace(/:/g, '');

  if (!fan || fan.length === 0) {
    return null;
  }

  const width = 760;
  const height = 300;
  const margin = { top: 28, right: 90, bottom: 40, left: 68 };

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  let minY = spotPrice * 0.78;
  let maxY = spotPrice * 1.25;

  fan.forEach((pt) => {
    if (pt.actual) {
      minY = Math.min(minY, pt.actual);
      maxY = Math.max(maxY, pt.actual);
    }
    if (pt.p5) minY = Math.min(minY, pt.p5);
    if (pt.p95) maxY = Math.max(maxY, pt.p95);
  });

  let strikeLevel = spotPrice;
  let barrierLevel: number | null = null;

  if (product === 'ELN') {
    const eln = inputs as ELNInputs;
    strikeLevel = spotPrice * (eln.strikePct / 100);
    barrierLevel = spotPrice * (eln.barrierPct / 100);
    if (barrierLevel < minY) minY = barrierLevel * 0.96;
  } else if (product === 'DCD') {
    const dcd = inputs as DCDInputs;
    strikeLevel = dcd.strikeRate;
  }

  const yDomainMin = Math.floor(minY * 0.98);
  const yDomainMax = Math.ceil(maxY * 1.02);

  const getX = (index: number) => {
    return margin.left + (index / (fan.length - 1)) * plotWidth;
  };

  const getY = (val: number) => {
    return margin.top + (1 - (val - yDomainMin) / (yDomainMax - yDomainMin)) * plotHeight;
  };

  const forecastStartIndex = fan.findIndex((p) => !p.isHistorical);

  // Historical path without interpolating holiday gaps
  let historicalPathD = '';
  let inSegment = false;

  fan.forEach((pt, idx) => {
    if (idx >= forecastStartIndex && forecastStartIndex !== -1) return;
    if (pt.isHolidayGap || pt.actual === undefined) {
      inSegment = false;
    } else {
      const x = getX(idx);
      const y = getY(pt.actual);
      if (!inSegment) {
        historicalPathD += ` M ${x.toFixed(1)} ${y.toFixed(1)}`;
        inSegment = true;
      } else {
        historicalPathD += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    }
  });

  // Confidence Band (P5 to P95 forward)
  let fanUpperPath = '';
  let fanLowerPath = '';

  const forwardPoints = fan.slice(forecastStartIndex >= 0 ? forecastStartIndex - 1 : 0);

  forwardPoints.forEach((pt, i) => {
    const originalIndex = (forecastStartIndex >= 0 ? forecastStartIndex - 1 : 0) + i;
    const x = getX(originalIndex);

    const highVal = pt.p95 || pt.actual || spotPrice;
    const lowVal = pt.p5 || pt.actual || spotPrice;

    const yHigh = getY(highVal);
    const yLow = getY(lowVal);

    if (i === 0) {
      fanUpperPath = `M ${x.toFixed(1)} ${yHigh.toFixed(1)}`;
      fanLowerPath = `L ${x.toFixed(1)} ${yLow.toFixed(1)}`;
    } else {
      fanUpperPath += ` L ${x.toFixed(1)} ${yHigh.toFixed(1)}`;
      fanLowerPath = ` L ${x.toFixed(1)} ${yLow.toFixed(1)}` + fanLowerPath;
    }
  });

  const fanAreaD = forwardPoints.length > 1 ? `${fanUpperPath} ${fanLowerPath} Z` : '';

  // Base Path (P50), Low Path, High Path
  let p50PathD = '';
  let lowPathD = '';
  let highPathD = '';

  forwardPoints.forEach((pt, i) => {
    const originalIndex = (forecastStartIndex >= 0 ? forecastStartIndex - 1 : 0) + i;
    const x = getX(originalIndex);

    const val50 = pt.p50 || pt.actual || spotPrice;
    const valLow = pt.lowPath || pt.actual || spotPrice;
    const valHigh = pt.highPath || pt.actual || spotPrice;

    if (i === 0) {
      p50PathD = `M ${x.toFixed(1)} ${getY(val50).toFixed(1)}`;
      lowPathD = `M ${x.toFixed(1)} ${getY(valLow).toFixed(1)}`;
      highPathD = `M ${x.toFixed(1)} ${getY(valHigh).toFixed(1)}`;
    } else {
      p50PathD += ` L ${x.toFixed(1)} ${getY(val50).toFixed(1)}`;
      lowPathD += ` L ${x.toFixed(1)} ${getY(valLow).toFixed(1)}`;
      highPathD += ` L ${x.toFixed(1)} ${getY(valHigh).toFixed(1)}`;
    }
  });

  const yTickCount = 5;
  const yTicks: number[] = [];
  const yStep = (yDomainMax - yDomainMin) / (yTickCount - 1);
  for (let i = 0; i < yTickCount; i++) {
    yTicks.push(Math.round(yDomainMin + i * yStep));
  }

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

    const ratio = (svgX - margin.left) / plotWidth;
    const index = Math.min(fan.length - 1, Math.max(0, Math.round(ratio * (fan.length - 1))));
    const point = fan[index];

    setHoveredPoint(point);
    const yVal = point.actual || point.p50 || spotPrice;
    setCrosshairPos({
      x: getX(index),
      y: getY(yVal),
    });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setCrosshairPos(null);
  };

  return (
    <div className="clay-tile p-5 flex flex-col justify-between">
      {/* Title Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3 mb-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)] block font-sans">
            Stochastic Forecast Fan Chart
          </span>
          <span className="text-xs font-serif text-[var(--ink-primary)]">
            90-Day Market History + 10,000-Path Monte Carlo Simulation (GARCH 1,1)
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--well-bg)] border border-[var(--border-color)] shadow-xs">
            <span className="w-2.5 h-0.5 bg-[var(--ink-primary)]" />
            <span className="text-[var(--ink-primary)]">History</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--well-bg)] border border-[var(--border-color)] shadow-xs">
            <span className="w-2.5 h-2 bg-[var(--chart-area-fill)] opacity-30 rounded-xs" />
            <span className="text-[var(--ink-primary)]">P5–P95 (90% Conf.)</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--well-bg)] border border-[var(--border-color)] shadow-xs">
            <span className="w-2.5 h-1 bg-[var(--chart-payoff-stroke)] rounded-full" />
            <span className="text-[var(--ink-primary)] font-semibold">Median Path</span>
          </div>
        </div>
      </div>

      {/* SVG Container */}
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
            <linearGradient id={fanGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-area-fill)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--chart-area-fill)" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={margin.left}
                  y1={y}
                  x2={width - margin.right}
                  y2={y}
                  stroke="#D4C7AE"
                  strokeWidth={0.8}
                  strokeDasharray="2,2"
                />
                <text
                  x={margin.left - 10}
                  y={y + 3.5}
                  textAnchor="end"
                  className="font-mono text-[9px] fill-[#575757]"
                >
                  {tick.toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Forecast Transition Vertical Divider */}
          {forecastStartIndex > 0 && (
            <g>
              <line
                x1={getX(forecastStartIndex)}
                y1={margin.top}
                x2={getX(forecastStartIndex)}
                y2={height - margin.bottom}
                stroke="#575757"
                strokeWidth={1.2}
                strokeDasharray="4,4"
              />
              <text
                x={getX(forecastStartIndex) - 8}
                y={margin.top + 14}
                textAnchor="end"
                className="font-mono text-[8.5px] fill-[#575757] uppercase tracking-wider"
              >
                ← History
              </text>
              <text
                x={getX(forecastStartIndex) + 8}
                y={margin.top + 14}
                textAnchor="start"
                className="font-mono text-[8.5px] fill-[#2C2C2C] uppercase tracking-wider font-bold"
              >
                Forward Forecast →
              </text>
            </g>
          )}

          {/* Reference Line: Strike */}
          <line
            x1={margin.left}
            y1={getY(strikeLevel)}
            x2={width - margin.right}
            y2={getY(strikeLevel)}
            stroke="#575757"
            strokeWidth={1.2}
            strokeDasharray="3,3"
          />
          <text
            x={width - margin.right + 6}
            y={getY(strikeLevel) + 3}
            className="font-mono text-[8.5px] fill-[#575757] font-semibold"
          >
            STRIKE ({strikeLevel.toLocaleString(undefined, { maximumFractionDigits: 1 })})
          </text>

          {/* Reference Line: Barrier (ELN) */}
          {barrierLevel !== null && (
            <>
              <line
                x1={margin.left}
                y1={getY(barrierLevel)}
                x2={width - margin.right}
                y2={getY(barrierLevel)}
                stroke="#8A2B20"
                strokeWidth={1.5}
                strokeDasharray="3,3"
              />
              <text
                x={width - margin.right + 6}
                y={getY(barrierLevel) + 3}
                className="font-mono text-[8.5px] fill-[#8A2B20] font-bold"
              >
                BARRIER ({barrierLevel.toLocaleString(undefined, { maximumFractionDigits: 1 })})
              </text>
            </>
          )}

          {/* Historical Path */}
          <path
            d={historicalPathD}
            fill="none"
            stroke="#2C2C2C"
            strokeWidth={1.8}
            strokeLinecap="round"
          />

          {/* Forecast P5-P95 Area Band */}
          {fanAreaD && (
            <path
              d={fanAreaD}
              fill={`url(#${fanGradId})`}
              stroke="#575757"
              strokeWidth={0.7}
              strokeDasharray="2,2"
              strokeOpacity={0.6}
            />
          )}

          {/* Stochastic paths */}
          {lowPathD && (
            <path
              d={lowPathD}
              fill="none"
              stroke="#8A2B20"
              strokeWidth={1.2}
              strokeOpacity={0.8}
              strokeDasharray="3,3"
            />
          )}
          {highPathD && (
            <path
              d={highPathD}
              fill="none"
              stroke="#225C36"
              strokeWidth={1.2}
              strokeOpacity={0.8}
              strokeDasharray="3,3"
            />
          )}

          {/* Base median path (P50) */}
          {p50PathD && (
            <path
              d={p50PathD}
              fill="none"
              stroke="#2C2C2C"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
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

          {/* Date Axis Baseline */}
          <line
            x1={margin.left}
            y1={height - margin.bottom}
            x2={width - margin.right}
            y2={height - margin.bottom}
            stroke="#575757"
            strokeWidth={1}
          />

          {[0, Math.floor(fan.length * 0.33), Math.floor(fan.length * 0.66), fan.length - 1].map((idx) => {
            const pt = fan[idx];
            if (!pt) return null;
            return (
              <text
                key={idx}
                x={getX(idx)}
                y={height - margin.bottom + 16}
                textAnchor="middle"
                className="font-mono text-[9px] fill-[#575757]"
              >
                {pt.date}
              </text>
            );
          })}
        </svg>

        {/* Readout strip */}
        <div className="mt-3 p-3 clay-inset flex flex-wrap items-center justify-between text-xs font-mono">
          {hoveredPoint ? (
            <div className="flex items-center gap-4 flex-wrap">
              <span>Date: <strong className="text-[#2C2C2C]">{hoveredPoint.date}</strong></span>
              {hoveredPoint.isHistorical ? (
                hoveredPoint.isHolidayGap ? (
                  <span className="text-[#8C5914] font-bold">[Trading Holiday / Exchange Closed]</span>
                ) : (
                  <span>
                    Close: <strong className="text-[#2C2C2C]">{hoveredPoint.actual?.toLocaleString()}</strong>
                  </span>
                )
              ) : (
                <>
                  <span>
                    Base (P50): <strong className="text-[#2C2C2C]">{hoveredPoint.p50?.toLocaleString()}</strong>
                  </span>
                  <span>
                    P5 Low: <strong className="text-[#8A2B20]">{hoveredPoint.p5?.toLocaleString()}</strong>
                  </span>
                  <span>
                    P95 High: <strong className="text-[#225C36]">{hoveredPoint.p95?.toLocaleString()}</strong>
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className="opacity-60 text-[11px] italic text-[#575757]">
              Hover along time axis to inspect historical prices and simulated forward intervals.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
