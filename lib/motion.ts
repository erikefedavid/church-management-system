/**
 * Emil Kowalski Motion & Physics Specification
 * Core principles:
 * 1. Momentum deceleration (never ease-in).
 * 2. Scale entrance from 0.95 (never scale from 0).
 * 3. Tactile click feedback under 100ms.
 * 4. Composite-only property animations (transform, opacity).
 */

export const MOMENTUM_EASE = [0.23, 1, 0.32, 1] as const;
export const DRAWER_EASE = [0.32, 0.72, 0, 1] as const;
export const SNAPPY_EASE = [0.16, 1, 0.3, 1] as const;

// Surface transitions (cards, dialogs, step views): 240ms duration
export const surfaceEntranceVariants = {
  initial: {
    opacity: 0,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.24,
      ease: MOMENTUM_EASE,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: {
      duration: 0.16,
      ease: SNAPPY_EASE,
    },
  },
};

// Fade & slide for telemetry/status alerts: 200ms duration
export const alertVariants = {
  initial: {
    opacity: 0,
    y: -8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: MOMENTUM_EASE,
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: 0.14,
      ease: SNAPPY_EASE,
    },
  },
};

// Tactile Tap Feedback props for buttons and actionable cards
export const tactileTapProps = {
  whileTap: { scale: 0.97 },
  transition: { duration: 0.08, ease: MOMENTUM_EASE },
};
