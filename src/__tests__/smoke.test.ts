import { describe, it, expect } from 'vitest';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

describe('Workspace Store Smoke Test', () => {
  it('initializes with default workspace state', () => {
    const state = useWorkspaceStore.getState();
    expect(state.workspacePath).toBeNull();
    expect(state.editorMode).toBe('raw');
    expect(state.theme).toBe('dark');
  });

  it('toggles editor mode and theme correctly', () => {
    const store = useWorkspaceStore.getState();
    store.setEditorMode('visual');
    expect(useWorkspaceStore.getState().editorMode).toBe('visual');

    store.toggleTheme();
    expect(useWorkspaceStore.getState().theme).toBe('light');
  });
});
