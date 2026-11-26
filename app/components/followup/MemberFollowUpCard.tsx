'use client';

import React, { useState } from 'react';
import {
  MessageSquare,
  Phone,
  Calendar,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { tactileTapProps, surfaceEntranceVariants } from '@/lib/motion';
import {
  FollowUpMemberQueueItem,
  MandatedOutcome,
  polishFollowUpDraftAction,
  completeFollowUpTaskAction,
} from '@/app/actions/followup';
import { renderTemplate } from '@/lib/template-engine';
import { mapReasonToTemplateCategory } from '@/lib/absence-radar';
import MessagePreviewBubble from './MessagePreviewBubble';
import TaskOutcomeSelector from './TaskOutcomeSelector';

interface MemberFollowUpCardProps {
  member: FollowUpMemberQueueItem;
  callerName: string;
  onOutcomeLogged: (memberId: string, outcome: MandatedOutcome) => void;
  onToast: (toast: { type: 'success' | 'error' | 'info'; message: string }) => void;
}

export default function MemberFollowUpCard({
  member,
  callerName,
  onOutcomeLogged,
  onToast,
}: MemberFollowUpCardProps) {
  // Generate default warm, direct message draft
  const category = mapReasonToTemplateCategory(member.reason);
  const defaultRendered = renderTemplate(
    category,
    {
      firstName: member.firstName,
      lastName: member.lastName,
      fullName: member.fullName,
      phone: member.phone,
      department: member.subCategory || member.category,
      category: member.category,
      daysAbsent: member.daysAbsent,
      churchName: 'RCCG Jesus Covenant Zone',
    },
    {
      tone: 'CASUAL_YOUTH',
      seed: member.phone || member.firstName,
    }
  );

  // Editable message text state
  const [messageText, setMessageText] = useState<string>(
    member.deterministicDraft || defaultRendered.text
  );
  const [isPolishing, setIsPolishing] = useState(false);
  const [isAiPolished, setIsAiPolished] = useState(false);

  // Outcome submission state
  const [isSubmittingOutcome, setIsSubmittingOutcome] = useState(false);

  // History drawer state
  const [showHistory, setShowHistory] = useState(false);

  // Clean phone digits for WhatsApp and Phone Dialer
  const cleanPhoneDigits = (member.phone || '').replace(/\D/g, '');
  const waPhone = cleanPhoneDigits.startsWith('0')
    ? `234${cleanPhoneDigits.slice(1)}`
    : cleanPhoneDigits.startsWith('234')
    ? cleanPhoneDigits
    : `234${cleanPhoneDigits}`;
  const liveWaMeUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(messageText)}`;
  const telDigits = (member.phone || '').replace(/[^\d+]/g, '');
  const telUrl = `tel:${telDigits || member.phone}`;

  // Handle "Tweak with AI" on demand
  const handlePolishWithAi = async () => {
    setIsPolishing(true);
    try {
      const res = await polishFollowUpDraftAction({
        personId: member.personId,
        baseDraft: messageText,
        tone: 'CASUAL_YOUTH',
      });

      if (res.success && res.text) {
        setMessageText(res.text);
        setIsAiPolished(true);
        onToast({
          type: 'success',
          message: 'Message tweaked with AI! You can edit further before sending.',
        });
      } else {
        onToast({
          type: 'error',
          message: res.error || 'AI tweak unavailable.',
        });
      }
    } catch {
      onToast({
        type: 'error',
        message: 'Could not connect to AI service.',
      });
    } finally {
      setIsPolishing(false);
    }
  };

  // Handle Outcome Submission (Sends record to Admin / Youth President)
  const handleSubmitOutcome = async (outcome: MandatedOutcome, note?: string): Promise<boolean> => {
    setIsSubmittingOutcome(true);
    try {
      const res = await completeFollowUpTaskAction({
        taskId: member.taskId,
        personId: member.personId,
        callerName: callerName || 'Follow-Up Team',
        outcome,
        note,
      });

      if (res.success) {
        onToast({
          type: 'success',
          message: `Logged: ${outcome} for ${member.firstName}. Recorded for Youth President.`,
        });
        onOutcomeLogged(member.personId, outcome);
        return true;
      } else {
        onToast({
          type: 'error',
          message: res.error || 'Failed to record outcome.',
        });
        return false;
      }
    } catch {
      onToast({
        type: 'error',
        message: 'Network error recording outcome.',
      });
      return false;
    } finally {
      setIsSubmittingOutcome(false);
    }
  };

  // Initials for avatar
  const initials = `${member.firstName?.[0] || ''}${member.lastName?.[0] || ''}`.toUpperCase() || 'M';

  // Reason badges
  const reasonBadges: Record<string, { label: string; bg: string; text: string }> = {
    MISSED_1_WEEK: { label: 'Missed 1 Sunday', bg: 'bg-blue-100', text: 'text-blue-900' },
    MISSED_2_WEEKS: { label: 'Missed 2 Sundays', bg: 'bg-amber-100', text: 'text-amber-900' },
    FIRST_TIMER: { label: 'First-Timer', bg: 'bg-emerald-100', text: 'text-emerald-900' },
  };

  const currentBadge = reasonBadges[member.reason] || {
    label: member.reason,
    bg: 'bg-slate-100',
    text: 'text-slate-800',
  };

  return (
    <motion.article
      {...surfaceEntranceVariants}
      className="w-full bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-4 sm:p-5 shadow-xs transition-shadow flex flex-col gap-4"
    >
      {/* Top Header: Identity & Last Seen */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-2xs">
            {initials}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-extrabold text-slate-950 leading-tight">
                {member.fullName}
              </h3>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${currentBadge.bg} ${currentBadge.text}`}>
                {currentBadge.label}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-700 mt-1 flex-wrap">
              <span className="font-semibold text-slate-900 font-mono">
                {member.phone}
              </span>
              <span className="text-slate-500">•</span>
              <span className="inline-flex items-center gap-1 text-[11px]">
                <Calendar className="w-3 h-3 text-slate-700" />
                Last in church: <strong className="text-slate-900">{member.lastAttendanceFormatted}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* History Button Toggle */}
        {member.recentNotes && member.recentNotes.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition-colors ml-auto sm:ml-0 min-h-[36px] cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-slate-700" />
            <span>Past Notes ({member.recentNotes.length})</span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Message Preview & Editable Box */}
      <MessagePreviewBubble
        currentText={messageText}
        isAiPolished={isAiPolished}
        isPolishing={isPolishing}
        onTextChange={(newText) => setMessageText(newText)}
        onPolishWithAi={handlePolishWithAi}
      />

      {/* Action Buttons: Send WhatsApp & Call Member */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {/* 1-Click WhatsApp DM */}
        <motion.a
          {...tactileTapProps}
          href={liveWaMeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs min-h-[44px] cursor-pointer"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Send WhatsApp DM</span>
        </motion.a>

        {/* Call Member (Opens phone dialer without reloading page) */}
        <motion.a
          {...tactileTapProps}
          href={telUrl}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-bold shadow-xs min-h-[44px] cursor-pointer"
        >
          <Phone className="w-4 h-4" />
          <span>Call Member</span>
        </motion.a>
      </div>

      {/* Call History Drawer */}
      <AnimatePresence>
        {showHistory && member.recentNotes && member.recentNotes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2 origin-top"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
              Past Call & Contact Log (Reported to Youth President):
            </span>
            <div className="space-y-1.5">
              {member.recentNotes.map((note) => (
                <div
                  key={note.id}
                  className="bg-white p-2.5 rounded-lg border border-slate-200/80 text-xs flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-900">{note.outcome}</span>
                    <span className="text-slate-700">{note.date} • {note.callerName}</span>
                  </div>
                  {note.note && (
                    <p className="text-slate-700 text-xs italic">
                      &quot;{note.note}&quot;
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Outcome Selector to report back to Admin / Youth President */}
      <TaskOutcomeSelector
        callerName={callerName}
        onSubmitOutcome={handleSubmitOutcome}
        isSubmitting={isSubmittingOutcome}
      />
    </motion.article>
  );
}
