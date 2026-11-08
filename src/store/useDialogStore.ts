import { create } from 'zustand';

export interface DialogOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  alertType?: 'info' | 'warning' | 'error' | 'success';
}

export interface ActiveDialog extends DialogOptions {
  id: string;
  type: 'confirm' | 'prompt' | 'alert';
  resolve: (value: any) => void;
}

export interface DialogState {
  currentDialog: ActiveDialog | null;
  openDialog: (
    type: 'confirm' | 'prompt' | 'alert',
    options: DialogOptions
  ) => Promise<any>;
  closeDialog: (result: any) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  currentDialog: null,

  openDialog: (type, options) => {
    return new Promise((resolve) => {
      const dialog: ActiveDialog = {
        ...options,
        id: `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        resolve: (val) => {
          set({ currentDialog: null });
          resolve(val);
        },
      };
      set({ currentDialog: dialog });
    });
  },

  closeDialog: (result) => {
    const current = get().currentDialog;
    if (current) {
      current.resolve(result);
    }
  },
}));
