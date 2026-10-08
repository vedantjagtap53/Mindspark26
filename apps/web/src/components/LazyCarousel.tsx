import { Children, Suspense, lazy, type ComponentProps } from 'react';

const Carousel = lazy(() => import('./Carousel'));

/**
 * A carousel that loads Swiper on demand. While it loads (and if it fails to load) the slides are
 * shown stacked one under another, so the content is never missing and nothing waits on the library.
 */
export function LazyCarousel(props: ComponentProps<typeof Carousel>) {
  const stacked = (
    <div className="grid grid-cols-1 gap-3">
      {Children.toArray(props.children).map((child, index) => (
        <div key={index}>{child}</div>
      ))}
    </div>
  );
  return (
    <Suspense fallback={stacked}>
      <Carousel {...props} />
    </Suspense>
  );
}
