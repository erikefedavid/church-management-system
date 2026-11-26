'use client';

import React from 'react';
import { MessageSquare, Sparkles, Edit3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { tactileTapProps } from '@/lib/motion';

interface MessagePreviewBubbleProps {
  currentText: string;
  isAiPolished?: boolean;
  isPolishing?: boolean;
  onTextChange?: (text: string) => void;
  onPolishWithAi?: () => void;
}

export default function MessagePreviewBubble({
  currentText,
  isAiPolished = false,
  isPolishing = false,
  onTextChange,
  onPolishWithAi,
}: MessagePreviewBubbleProps) {
  return (
    <div className="w-full flex flex-col gap-2">
      {/* Header Bar with AI Regenerate Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
            WhatsApp Message
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
            <Edit3 className="w-2.5 h-2.5" /> Editable
          </span>
          {isAiPolished && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
              <Sparkles className="w-2.5 h-2.5" /> AI Tweaked
            </span>
          )}
        </div>

        {onPolishWithAi && (
          <motion.button
            {...tactileTapProps}
            type="button"
            onClick={onPolishWithAi}
            disabled={isPolishing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-bold disabled:opacity-60 min-h-[38px] cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 text-blue-700 ${isPolishing ? 'animate-spin' : ''}`} />
            <span>{isPolishing ? 'Tweaking with AI...' : 'Tweak with AI'}</span>
          </motion.button>
        )}
      </div>

      {/* WhatsApp Chat Bubble Aesthetic (Editable Textarea) */}
      <div className="relative rounded-2xl bg-emerald-50/70 border border-emerald-200/90 p-3.5 shadow-2xs">
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-1 shadow-2xs">
            <MessageSquare className="w-3 h-3" />
          </div>
          <div className="flex-1 space-y-1.5">
            <textarea
              value={currentText}
              onChange={(e) => onTextChange?.(e.target.value)}
              rows={3}
              placeholder="Type message to send via WhatsApp..."
              className="w-full bg-white border border-emerald-300 rounded-xl p-3 text-xs text-slate-950 leading-relaxed focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden transition-all resize-none overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden min-h-[72px]"
            />
            <div className="flex items-center justify-between text-[10px] text-emerald-900">
              <span>Edit freely before tapping Send</span>
              <span>{currentText.length} characters</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
