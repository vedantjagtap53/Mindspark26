import { ProductCards } from '../components/dashboard/ProductCards';
import { TermsEditor } from '../components/products/TermsEditor';
import type { Forms, ProductType } from '../state/forms';

interface Props {
  product: ProductType;
  onProduct: (p: ProductType) => void;
  forms: Forms;
  onForms: (f: Forms) => void;
}

export function StructurePage({ product, onProduct, forms, onForms }: Props) {
  return (
    <div className="space-y-5">
      <ProductCards product={product} onProduct={onProduct} />
      <TermsEditor product={product} forms={forms} onForms={onForms} />
    </div>
  );
}
