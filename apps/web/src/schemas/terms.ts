// Instant form checks with the shared Zod schemas (the same ones the API uses). The browser only
// warns early; the backend re-validates every request and its answer is final.
import { cpnTermsSchema, dcdTermsSchema, elnTermsSchema } from '@mindspark/shared';
import { termsFor, type Forms, type ProductType } from '../state/forms';

const SCHEMAS = { ELN: elnTermsSchema, DCD: dcdTermsSchema, CPN: cpnTermsSchema } as const;

/** Field path (e.g. "barrierPct", "underlying.symbol") → first message. Empty when valid. */
export function termIssues(product: ProductType, forms: Forms): Record<string, string> {
  const parsed = SCHEMAS[product].safeParse(termsFor(product, forms));
  if (parsed.success) return {};
  const issues: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join('.');
    issues[path] ??= issue.message;
  }
  return issues;
}
