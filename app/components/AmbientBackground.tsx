'use client';

import React from 'react';

/**
 * Clean, distraction-free neutral background adhering to Impeccable Design Standard.
 * Zero decorative grid lines, zero floating blur bubbles, zero artificial gradient orbs.
 */
export default function AmbientBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none -z-10 bg-slate-50"
    />
  );
}
