import { describe, it, expect, beforeEach } from 'vitest';
import { useDialogStore } from '../store/useDialogStore';
import { dialog } from '../services/dialog';

describe('Custom Modal Dialog Store & Service', () => {
  beforeEach(() => {
    useDialogStore.getState().closeDialog(null);
  });

  it('initializes with closed dialog state', () => {
    const state = useDialogStore.getState();
    expect(state.currentDialog).toBeNull();
  });

  it('opens and resolves confirm dialogs with boolean answer', async () => {
    const confirmPromise = dialog.confirm({
      title: 'Delete Document',
      message: 'Are you sure you want to delete main.tex?',
      confirmLabel: 'Delete',
      isDestructive: true,
    });

    const active = useDialogStore.getState().currentDialog;
    expect(active).not.toBeNull();
    expect(active?.type).toBe('confirm');
    expect(active?.title).toBe('Delete Document');
    expect(active?.isDestructive).toBe(true);

    // Simulate clicking Confirm
    useDialogStore.getState().closeDialog(true);
    const result = await confirmPromise;
    expect(result).toBe(true);
    expect(useDialogStore.getState().currentDialog).toBeNull();
  });

  it('resolves confirm dialog with false when cancelled', async () => {
    const confirmPromise = dialog.confirm({
      title: 'Discard Changes',
      message: 'Discard changes to file?',
    });

    const active = useDialogStore.getState().currentDialog;
    expect(active).not.toBeNull();

    // Simulate clicking Cancel
    useDialogStore.getState().closeDialog(false);
    const result = await confirmPromise;
    expect(result).toBe(false);
    expect(useDialogStore.getState().currentDialog).toBeNull();
  });

  it('opens and resolves prompt dialogs with user input value', async () => {
    const promptPromise = dialog.prompt({
      title: 'Import Asset',
      message: 'Enter file path:',
      placeholder: 'C:\\path\\figure.png',
      defaultValue: 'C:\\test.png',
    });

    const active = useDialogStore.getState().currentDialog;
    expect(active).not.toBeNull();
    expect(active?.type).toBe('prompt');
    expect(active?.defaultValue).toBe('C:\\test.png');

    // Simulate submitting value
    useDialogStore.getState().closeDialog('C:\\photos\\diagram.png');

    const result = await promptPromise;
    expect(result).toBe('C:\\photos\\diagram.png');
    expect(useDialogStore.getState().currentDialog).toBeNull();
  });

  it('resolves prompt dialog with null when cancelled', async () => {
    const promptPromise = dialog.prompt({
      title: 'Import Asset',
      message: 'Enter file path:',
    });

    const active = useDialogStore.getState().currentDialog;
    expect(active).not.toBeNull();

    useDialogStore.getState().closeDialog(null);

    const result = await promptPromise;
    expect(result).toBeNull();
    expect(useDialogStore.getState().currentDialog).toBeNull();
  });

  it('opens and resolves alert dialogs', async () => {
    const alertPromise = dialog.alert({
      title: 'Compilation Notice',
      message: 'Compilation completed with 0 errors.',
    });

    const active = useDialogStore.getState().currentDialog;
    expect(active).not.toBeNull();
    expect(active?.type).toBe('alert');

    useDialogStore.getState().closeDialog(true);
    await alertPromise;
    expect(useDialogStore.getState().currentDialog).toBeNull();
  });
});
