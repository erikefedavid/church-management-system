'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string | number;
  sublabel?: string;
  icon?: React.ReactNode;
}

export interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  leadingIcon?: React.ReactNode;
  disabled?: boolean;
}

export default function CustomDropdown({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select an option',
  className = '',
  buttonClassName = '',
  leadingIcon,
  disabled = false,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${isOpen ? 'z-[100]' : 'z-20'} ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1.5">{label}</label>
      )}

      {/* Styled Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-900 shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen ? 'ring-2 ring-blue-500/20 border-blue-500' : ''
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 truncate">
          {leadingIcon}
          {selectedOption ? (
            <div className="flex items-center gap-1.5 truncate">
              {selectedOption.icon}
              <span className="truncate">{selectedOption.label}</span>
              {selectedOption.badge !== undefined && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {selectedOption.badge}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </button>

      {/* Styled Options Popover */}
      {isOpen && (
        <div className="absolute z-[200] left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl py-1.5 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400 text-center">No options available</div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/80 text-blue-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-50 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {option.icon}
                    <div className="truncate">
                      <div className="truncate">{option.label}</div>
                      {option.sublabel && (
                        <div className="text-[10px] text-slate-400 font-normal truncate">
                          {option.sublabel}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {option.badge !== undefined && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          isSelected
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {option.badge}
                      </span>
                    )}
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
