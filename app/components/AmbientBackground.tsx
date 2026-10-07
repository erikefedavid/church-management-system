'use client';

import React from 'react';

export default function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Top Right Subtle Blue Orb */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-400/15 rounded-full blur-3xl animate-float-slow" />

      {/* Center Left Sky Blue Orb */}
      <div className="absolute top-1/3 -left-32 w-80 h-80 bg-sky-300/15 rounded-full blur-3xl animate-float-reverse" />

      {/* Bottom Center Indigo Glow */}
      <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl animate-pulse-glow" />

      {/* Subtle Dot Grid Overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, #1e3a8a 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
    </div>
  );
}
