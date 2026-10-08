// Touch carousel for phone widths, built on Swiper. Import it through LazyCarousel so Swiper (and its
// CSS) is only downloaded when a carousel is actually shown. No autoplay: the user decides when to
// move, and keyboard (arrow keys) and screen readers are supported through Swiper's Keyboard and
// A11y modules.
import { Children, type ReactNode } from 'react';
import { A11y, Keyboard, Pagination } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/pagination';
import { useReducedMotion } from '../motion/useReducedMotion';

export interface CarouselProps {
  /** Accessible name of the carousel, e.g. "Products". */
  label: string;
  children: ReactNode;
  /** More than 1 shows a peek of the next slide, hinting that it can be swiped. */
  slidesPerView?: number;
  initialSlide?: number;
  onSlideChange?: (index: number) => void;
}

export default function Carousel({
  label,
  children,
  slidesPerView = 1.1,
  initialSlide = 0,
  onSlideChange,
}: CarouselProps) {
  const reduced = useReducedMotion();
  return (
    <Swiper
      className="ms-carousel"
      modules={[Keyboard, A11y, Pagination]}
      slidesPerView={slidesPerView}
      spaceBetween={12}
      initialSlide={initialSlide}
      speed={reduced ? 0 : 300}
      keyboard={{ enabled: true }}
      a11y={{ containerMessage: label }}
      pagination={{ clickable: true }}
      onSlideChange={(swiper) => onSlideChange?.(swiper.activeIndex)}
    >
      {Children.toArray(children).map((child, index) => (
        <SwiperSlide key={index} style={{ height: 'auto' }}>
          {child}
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
