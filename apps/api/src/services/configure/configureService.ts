import { tenorYears, type ConfigureRequest, type ConfigureResponse } from '@mindspark/shared';

export interface ConfigureService {
  configure(request: ConfigureRequest): ConfigureResponse;
}

/** Normalizes validated terms and adds derived values. No persistence yet (repositories come later). */
export function createConfigureService(): ConfigureService {
  return {
    configure(request) {
      const years = tenorYears(request.terms.tenorDays);
      switch (request.productType) {
        case 'ELN':
          return {
            productType: 'ELN',
            terms: request.terms,
            derived: {
              variant: request.terms.barrierPct === undefined ? 'plain' : 'barrier',
              tenorYears: years,
            },
          };
        case 'DCD':
          return { productType: 'DCD', terms: request.terms, derived: { tenorYears: years } };
        case 'CPN':
          return { productType: 'CPN', terms: request.terms, derived: { tenorYears: years } };
      }
    },
  };
}
