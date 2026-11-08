import { useDialogStore, type DialogOptions } from '../store/useDialogStore';

export const dialog = {
  confirm(options: DialogOptions | string): Promise<boolean> {
    const opts: DialogOptions =
      typeof options === 'string'
        ? { message: options, title: 'Please Confirm' }
        : options;
    return useDialogStore.getState().openDialog('confirm', opts);
  },

  prompt(options: DialogOptions | string): Promise<string | null> {
    const opts: DialogOptions =
      typeof options === 'string'
        ? { message: options, title: 'Input Required' }
        : options;
    return useDialogStore.getState().openDialog('prompt', opts);
  },

  alert(options: DialogOptions | string): Promise<void> {
    const opts: DialogOptions =
      typeof options === 'string'
        ? { message: options, title: 'Notice' }
        : options;
    return useDialogStore.getState().openDialog('alert', opts);
  },
};

/**
 * Patch window.alert, window.confirm, and window.prompt
 * so that any unexpected calls route into LeafForge's custom UI.
 */
export function initCustomDialogs(): void {
  if (typeof window === 'undefined') return;

  window.alert = (message?: unknown) => {
    dialog.alert(String(message ?? ''));
  };

  window.confirm = (message?: string) => {
    // Native synchronous confirm cannot block modern async JS nicely,
    // but we dispatch our custom async dialog and return true as non-blocking fallback
    dialog.confirm(message ?? 'Are you sure?');
    return true;
  };

  window.prompt = (message?: string, _default?: string) => {
    dialog.prompt({
      message: message ?? '',
      defaultValue: _default,
    });
    return _default ?? null;
  };
}
