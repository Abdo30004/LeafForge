import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Info,
  CheckCircle2,
  FolderInput,
} from 'lucide-react';
import { useDialogStore } from '../../store/useDialogStore';

export const DialogModal: React.FC = () => {
  const currentDialog = useDialogStore((s) => s.currentDialog);
  const closeDialog = useDialogStore((s) => s.closeDialog);

  const [promptValue, setPromptValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (currentDialog) {
      if (currentDialog.type === 'prompt') {
        setPromptValue(currentDialog.defaultValue || '');
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 50);
      } else {
        setTimeout(() => {
          confirmButtonRef.current?.focus();
        }, 50);
      }
    }
  }, [currentDialog]);

  useEffect(() => {
    if (!currentDialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (currentDialog.type === 'prompt') {
          closeDialog(null);
        } else if (currentDialog.type === 'confirm') {
          closeDialog(false);
        } else {
          closeDialog(undefined);
        }
      } else if (e.key === 'Enter' && currentDialog.type !== 'prompt') {
        e.preventDefault();
        e.stopPropagation();
        if (currentDialog.type === 'confirm') {
          closeDialog(true);
        } else {
          closeDialog(undefined);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [currentDialog, closeDialog]);

  if (!currentDialog) return null;

  const {
    type,
    title,
    message,
    placeholder,
    confirmLabel,
    cancelLabel,
    isDestructive,
    alertType,
  } = currentDialog;

  const renderIcon = () => {
    if (type === 'confirm') {
      if (isDestructive) {
        return (
          <div className="w-9 h-9 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
        );
      }
      return (
        <div className="w-9 h-9 rounded-full bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary shrink-0">
          <HelpCircle className="w-5 h-5" />
        </div>
      );
    }

    if (type === 'prompt') {
      return (
        <div className="w-9 h-9 rounded-full bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-primary shrink-0">
          <FolderInput className="w-5 h-5" />
        </div>
      );
    }

    // Alert
    switch (alertType) {
      case 'error':
        return (
          <div className="w-9 h-9 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        );
      case 'warning':
        return (
          <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
        );
      case 'success':
        return (
          <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        );
      default:
        return (
          <div className="w-9 h-9 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
            <Info className="w-5 h-5" />
          </div>
        );
    }
  };

  const defaultTitle = () => {
    if (title) return title;
    if (type === 'confirm') return isDestructive ? 'Delete Item' : 'Confirm Action';
    if (type === 'prompt') return 'Input Required';
    return 'Notification';
  };

  const handleConfirm = () => {
    if (type === 'prompt') {
      closeDialog(promptValue);
    } else if (type === 'confirm') {
      closeDialog(true);
    } else {
      closeDialog(undefined);
    }
  };

  const handleCancel = () => {
    if (type === 'prompt') {
      closeDialog(null);
    } else if (type === 'confirm') {
      closeDialog(false);
    } else {
      closeDialog(undefined);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none">
      <div className="relative w-full max-w-md bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex items-start space-x-3 min-w-0">
            {renderIcon()}
            <div className="min-w-0 pt-0.5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {defaultTitle()}
              </h3>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Body */}
        <div className="px-5 py-2 space-y-3">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed break-words whitespace-pre-wrap select-text">
            {message}
          </p>

          {type === 'prompt' && (
            <div className="pt-1">
              <input
                ref={inputRef}
                type="text"
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
                placeholder={placeholder || 'Enter value...'}
                className="w-full px-3 py-2 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono focus:outline-hidden focus:border-accent-primary placeholder:text-zinc-600 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2 px-5 py-4 mt-2 bg-[var(--canvas)]/40 border-t border-[var(--border-subtle)]">
          {type !== 'alert' && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-3.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--hover-bg)] hover:bg-[var(--border-subtle)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              {cancelLabel || 'Cancel'}
            </button>
          )}

          <button
            ref={confirmButtonRef}
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-xs hover:shadow-rose-500/20'
                : 'bg-accent-primary hover:opacity-90 text-black shadow-xs'
            }`}
          >
            {confirmLabel || (isDestructive ? 'Delete' : type === 'prompt' ? 'OK' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
