'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Users,
  Loader2,
} from 'lucide-react';
import {
  parseMembersFileAction,
  importMembersAction,
  ParsedMemberRow,
} from '../actions/admin';

export interface ImportMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
  onImported?: () => void;
}

export default function ImportMembersModal({
  isOpen,
  onClose,
  onSuccessToast,
  onErrorToast,
  onImported,
}: ImportMembersModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [previewRows, setPreviewRows] = useState<ParsedMemberRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  if (!isOpen) return null;

  function resetState() {
    setFileName('');
    setPreviewRows([]);
    setParseError(null);
    setParsing(false);
    setImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleFileSelected(file: File) {
    setParseError(null);
    setParsing(true);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await parseMembersFileAction(formData);
      if (res.success && res.members && res.members.length > 0) {
        setPreviewRows(res.members);
      } else {
        setPreviewRows([]);
        setParseError(res.error || 'Could not extract any member rows from this file.');
      }
    } catch {
      setPreviewRows([]);
      setParseError('Failed to read the selected file.');
    } finally {
      setParsing(false);
    }
  }

  function handleRemoveRow(index: number) {
    setPreviewRows((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleConfirmImport() {
    if (previewRows.length === 0) return;

    setImporting(true);
    try {
      const res = await importMembersAction(previewRows);
      if (res.success) {
        onSuccessToast(
          res.message || `Imported ${res.totalProcessed ?? previewRows.length} Youth members.`
        );
        if (onImported) onImported();
        handleClose();
      } else {
        onErrorToast(res.error || 'Failed to import members.');
      }
    } catch {
      onErrorToast('An unexpected error occurred during import.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div
        className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col"
        style={{
          transition: 'transform 220ms cubic-bezier(0.23, 1, 0.32, 1), opacity 220ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Import Youth Members</h3>
              <p className="text-xs text-slate-500 font-medium">
                Upload Excel (.xlsx, .xls, .csv) or Word (.docx) to add or update members
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close modal"
            className="min-w-11 min-h-11 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer active:scale-[0.97]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* File Upload Dropzone */}
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-5 text-center transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.docx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelected(file);
              }}
              className="hidden"
              id="import-members-file-input"
            />

            <div className="flex flex-col items-center gap-2.5">
              <div className="flex items-center gap-2 text-blue-600">
                <FileSpreadsheet className="w-6 h-6" />
                <FileText className="w-6 h-6 text-indigo-600" />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">
                  {fileName ? `Selected: ${fileName}` : 'Choose an Excel or Word file'}
                </p>
                <p className="text-xs text-slate-500">
                  Columns or lines with <strong>First Name, Last Name, Phone</strong> and optional{' '}
                  <strong>Birthday / DOB</strong>
                </p>
              </div>

              <label
                htmlFor="import-members-file-input"
                className="mt-1 inline-flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer active:scale-[0.97]"
              >
                {parsing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Reading File...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>{previewRows.length > 0 ? 'Choose Another File' : 'Select File'}</span>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Parse Error */}
          {parseError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Could not read members</p>
                <p className="text-rose-700 mt-0.5">{parseError}</p>
              </div>
            </div>
          )}

          {/* Preview Table */}
          {previewRows.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">
                    Preview: {previewRows.length} Youth Member{previewRows.length === 1 ? '' : 's'} Ready
                  </span>
                </div>
                <span className="text-[11px] font-medium text-slate-500">
                  Duplicates by phone or name will update automatically
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                      <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Name</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3">Birthday</th>
                        <th className="py-2.5 px-3 text-right">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {previewRows.map((row, idx) => (
                        <tr key={`${row.firstName}-${row.lastName}-${idx}`} className="hover:bg-slate-50/70">
                          <td className="py-2 px-3 text-slate-400 font-semibold">{idx + 1}</td>
                          <td className="py-2 px-3 font-bold text-slate-900">
                            {row.firstName} {row.lastName}
                          </td>
                          <td className="py-2 px-3">
                            {row.phone === 'NO-PHONE' ? (
                              <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                                No Phone
                              </span>
                            ) : (
                              <span className="font-mono text-slate-700 font-medium">
                                {row.phone}{' '}
                                <span className="text-slate-400 text-[10px]">({row.phoneLast4})</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {row.birthdayDisplay || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(idx)}
                              aria-label={`Remove ${row.firstName} ${row.lastName}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2.5 min-h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={previewRows.length === 0 || importing || parsing}
            onClick={handleConfirmImport}
            className="px-5 py-2.5 min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-2 cursor-pointer active:scale-[0.97]"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Confirm Import {previewRows.length > 0 ? `(${previewRows.length})` : ''}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
