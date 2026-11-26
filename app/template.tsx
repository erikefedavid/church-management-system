'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MOMENTUM_EASE } from '@/lib/motion';

export default function RootTemplate({ children }: { children: React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: MOMENTUM_EASE }}
      className="min-h-full flex flex-col flex-1"
    >
      {children}
    </motion.div>
  );
}

