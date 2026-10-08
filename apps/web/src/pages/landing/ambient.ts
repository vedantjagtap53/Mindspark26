// The maths behind the hero's ambient glyph grid, kept apart from the canvas so it can be tested.
// Everything here is decoration: a grid of small "+" marks that breathes, fades out behind the
// headline so the text stays easy to read, and glows near the pointer.

/** Pixels between glyph centres. */
export const CELL = 28;
/** How far from the pointer a glyph still lights up. */
export const GLOW_RADIUS = 130;
/** The most opaque any glyph ever gets, glow included. Keeps text over the grid readable. */
export const MAX_ALPHA = 0.75;

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/** 0 below `edge0`, 1 above `edge1`, smooth in between. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Columns and rows needed to cover a width by height area, one extra each so edges are filled. */
export function gridSize(width: number, height: number, cell = CELL) {
  return { cols: Math.ceil(width / cell) + 1, rows: Math.ceil(height / cell) + 1 };
}

/** A fixed pseudo-random phase in [0, 2π) per glyph, so glyphs breathe out of step but identically each run. */
export function phaseFor(index: number): number {
  const s = Math.sin(index * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * Math.PI * 2;
}

/**
 * 0 in the middle of the area, where the headline sits, rising to 1 toward the edges. An ellipse, so a
 * wide hero keeps its sides lit and its centre quiet.
 */
export function edgeMask(x: number, y: number, width: number, height: number): number {
  const nx = (x - width / 2) / (width * 0.42);
  const ny = (y - height / 2) / (height * 0.5);
  return smoothstep(0.55, 1.05, Math.hypot(nx, ny));
}

/** 1 at the pointer, falling to 0 at `radius`. */
export function glowAt(dx: number, dy: number, radius = GLOW_RADIUS): number {
  const distance = Math.hypot(dx, dy) / radius;
  return distance >= 1 ? 0 : smoothstep(0, 1, 1 - distance);
}

/** A slow breathing factor between 0.2 and 1. */
export function breath(time: number, phase: number): number {
  return 0.6 + 0.4 * Math.sin(time * 1.4 + phase);
}

/** A small drift, so the grid looks alive without any glyph travelling far. */
export function drift(col: number, row: number, time: number) {
  return {
    dx: 1.4 * Math.sin(0.3 * col + 0.4 * row + time * 0.9),
    dy: 2.2 * Math.sin(0.35 * col + 0.22 * row + time * 1.1),
  };
}

export interface GlyphInput {
  x: number;
  y: number;
  width: number;
  height: number;
  time: number;
  phase: number;
  /** Pointer glow for this glyph, 0 to 1 (see glowAt). */
  glow: number;
}

/** Opacity of one glyph: a faint breathing base that is quiet behind the text, plus the pointer glow. */
export function glyphAlpha({ x, y, width, height, time, phase, glow }: GlyphInput): number {
  const base = 0.22 * breath(time, phase) * edgeMask(x, y, width, height);
  return Math.min(MAX_ALPHA, base + 0.55 * glow);
}
