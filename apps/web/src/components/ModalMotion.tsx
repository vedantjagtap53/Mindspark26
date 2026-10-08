import type { ComponentProps } from 'react';
import * as m from 'framer-motion/m';
import { duration, easeOut } from '../motion/tokens';

const timing = { duration: duration.base, ease: easeOut };

/**
 * Backdrop and panel for the modal windows that are not printed (Runs, Compare). Wrap the modal in
 * AnimatePresence where it is shown so the exit plays before it unmounts. The memo print overlays
 * deliberately do not use these: a document being printed must never be caught mid-fade.
 */
export function ModalBackdrop(props: ComponentProps<typeof m.div>) {
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={timing}
      {...props}
    />
  );
}

export function ModalPanel(props: ComponentProps<typeof m.div>) {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.97, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 6 }}
      transition={timing}
      {...props}
    />
  );
}
