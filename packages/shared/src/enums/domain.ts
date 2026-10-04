// Values named verbatim in PRD.md §3–§7. Field-level shapes (product terms,
// client profile) are intentionally absent until their units and limits are defined.

export const PRODUCT_TYPES = ['ELN', 'DCD', 'CPN'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const SIMULATION_MODES = ['A', 'B'] as const;
export type SimulationMode = (typeof SIMULATION_MODES)[number];

export const ELN_BARRIER_TYPES = ['European', 'American'] as const;
export type ElnBarrierType = (typeof ELN_BARRIER_TYPES)[number];

export const SUITABILITY_VERDICTS = ['Suitable', 'Caution', 'Not suitable'] as const;
export type SuitabilityVerdict = (typeof SUITABILITY_VERDICTS)[number];
