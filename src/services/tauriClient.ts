import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { FileEntry, FsChangeEvent, LogEntry, LogLevel } from '../types/ipc';
import type {
  AuthStatusResponse,
  CollaboratorPermission,
  GithubDeviceCode,
  GithubRepoSummary,
  GithubUserProfile,
  GitRepoStatus,
  PollTokenResponse,
  PullResult,
  ReconcileResult,
} from '../types/git';
import type {
  CompilationResult,
  EngineInfo,
  LatexEngine,
  LspCompletionItem,
  LspHoverResult,
  LspStatus,
  MagicComments,
  SyncTexCoordinate,
  SyncTexInverseResult,
  SystemFontInfo,
} from '../types/latex';

export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export async function openFolder(path?: string): Promise<string | null> {
  return invoke<string | null>('open_folder', { path });
}

export async function listFiles(dirPath: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('list_files', { dirPath });
}

export async function readFileText(path: string): Promise<string> {
  if (!isTauriEnvironment()) {
    return '';
  }
  return invoke<string>('read_file_text', { path });
}

export async function readFileBinary(path: string): Promise<Uint8Array> {
  if (!isTauriEnvironment()) {
    return new Uint8Array();
  }
  const bytes = await invoke<number[]>('read_file_binary', { path });
  return new Uint8Array(bytes);
}

export async function writeFileText(path: string, content: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('write_file_text', { path, content });
}

export async function createFile(path: string): Promise<void> {
  return invoke<void>('create_file', { path });
}

export async function createDir(path: string): Promise<void> {
  return invoke<void>('create_dir', { path });
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  return invoke<void>('rename_path', { oldPath, newPath });
}

export async function deletePath(path: string): Promise<void> {
  return invoke<void>('delete_path', { path });
}

export async function duplicateFile(sourcePath: string): Promise<string> {
  if (!isTauriEnvironment()) {
    return `${sourcePath}_copy`;
  }
  return invoke<string>('duplicate_file', { sourcePath });
}

export async function revealInExplorer(targetPath: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const { revealItemInDir, openPath } = await import('@tauri-apps/plugin-opener');
    if (typeof revealItemInDir === 'function') {
      await revealItemInDir(targetPath);
      return;
    }
    const parentDir = targetPath.replace(/[/\\][^/\\]+$/, '');
    await openPath(parentDir);
  } catch {
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(targetPath);
    } catch {
      // ignore
    }
  }
}

export async function openExternalPath(targetPath: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const { openPath } = await import('@tauri-apps/plugin-opener');
    await openPath(targetPath);
  } catch {
    // ignore
  }
}

export async function importBinaryAsset(targetDir: string, sourcePath: string): Promise<string> {
  return invoke<string>('import_binary_asset', { targetDir, sourcePath });
}

export async function watchDirectory(dirPath: string): Promise<void> {
  return invoke<void>('watch_directory', { dirPath });
}

export async function unwatchDirectory(): Promise<void> {
  return invoke<void>('unwatch_directory');
}

export async function onFsChange(callback: (event: FsChangeEvent) => void): Promise<UnlistenFn> {
  return listen<FsChangeEvent>('workspace://fs-change', (e) => {
    callback(e.payload);
  });
}

// LSP Client IPC bridges
export async function lspStart(rootPath?: string): Promise<LspStatus> {
  if (!isTauriEnvironment()) {
    return {
      running: true,
      server: 'Embedded TeX Mock Service',
      binary_found: false,
      message: 'Running in browser preview mode',
    };
  }
  return invoke<LspStatus>('lsp_start', { rootPath });
}

export async function lspStop(): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('lsp_stop');
}

export async function lspStatus(): Promise<LspStatus> {
  if (!isTauriEnvironment()) {
    return {
      running: true,
      server: 'Embedded TeX Mock Service',
      binary_found: false,
      message: 'Running in browser preview mode',
    };
  }
  return invoke<LspStatus>('lsp_status');
}

export async function lspDidOpen(uri: string, text: string, version = 1): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('lsp_did_open', { uri, text, version });
}

export async function lspDidChange(uri: string, text: string, version = 1): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('lsp_did_change', { uri, text, version });
}

export async function lspCompletion(
  uri: string,
  line: number,
  character: number
): Promise<LspCompletionItem[]> {
  if (!isTauriEnvironment()) return [];
  return invoke<LspCompletionItem[]>('lsp_completion', { uri, line, character });
}

export async function lspHover(
  uri: string,
  line: number,
  character: number
): Promise<LspHoverResult | null> {
  if (!isTauriEnvironment()) return null;
  return invoke<LspHoverResult | null>('lsp_hover', { uri, line, character });
}

// Compiler & Multi-Engine Pool IPC bridges
export async function compileDocument(
  projectDir: string,
  rootFile: string,
  engineOverride?: LatexEngine,
  usePreambleCache = true
): Promise<CompilationResult> {
  if (!isTauriEnvironment()) {
    return {
      success: true,
      engine: engineOverride || 'tectonic',
      durationMs: 42,
      pdfPath: `${projectDir}/${rootFile.replace(/\.tex$/, '.pdf')}`,
      diagnostics: [],
      logOutput: 'Mock browser compile successful.',
    };
  }
  return invoke<CompilationResult>('compile_document', {
    projectDir,
    rootFile,
    engineOverride,
    usePreambleCache,
  });
}

export async function detectEngines(): Promise<EngineInfo[]> {
  if (!isTauriEnvironment()) {
    return [
      {
        engine: 'tectonic',
        name: 'Tectonic (Auto-CTAN / XeTeX)',
        available: true,
        version: '0.15.0',
        supportsSynctex: true,
        supportsFmtCache: false,
      },
      {
        engine: 'lualatex',
        name: 'LuaLaTeX',
        available: false,
        supportsSynctex: true,
        supportsFmtCache: true,
      },
      {
        engine: 'xelatex',
        name: 'XeLaTeX',
        available: false,
        supportsSynctex: true,
        supportsFmtCache: true,
      },
      {
        engine: 'pdflatex',
        name: 'pdfLaTeX',
        available: false,
        supportsSynctex: true,
        supportsFmtCache: true,
      },
    ];
  }
  return invoke<EngineInfo[]>('detect_engines');
}

export async function abortCompilation(): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  return invoke<boolean>('abort_compilation');
}

export async function cleanAuxFiles(projectDir: string, rootFile: string): Promise<string[]> {
  if (!isTauriEnvironment()) return [];
  return invoke<string[]>('clean_aux_files', { projectDir, rootFile });
}

export async function parseMagicComments(filePath: string): Promise<MagicComments> {
  if (!isTauriEnvironment()) return {};
  return invoke<MagicComments>('parse_magic_comments', { filePath });
}

// SyncTeX Bridges
export async function synctexForward(
  projectDir: string,
  rootFile: string,
  file: string,
  line: number,
  column: number
): Promise<SyncTexCoordinate | null> {
  if (!isTauriEnvironment()) {
    return { page: 1, x: 72, y: 150, width: 250, height: 18 };
  }
  return invoke<SyncTexCoordinate | null>('synctex_forward', {
    projectDir,
    rootFile,
    file,
    line,
    column,
  });
}

export async function synctexInverse(
  projectDir: string,
  rootFile: string,
  page: number,
  x: number,
  y: number
): Promise<SyncTexInverseResult | null> {
  if (!isTauriEnvironment()) {
    return { file: rootFile, line: 1, column: 1 };
  }
  return invoke<SyncTexInverseResult | null>('synctex_inverse', {
    projectDir,
    rootFile,
    page,
    x,
    y,
  });
}

// Font Discovery Bridges
export async function listSystemFonts(): Promise<SystemFontInfo[]> {
  if (!isTauriEnvironment()) {
    return [
      {
        family: 'Amiri',
        postscriptName: 'Amiri-Regular',
        style: 'Normal',
        weight: 400,
        isMonospace: false,
      },
      {
        family: 'JetBrains Mono',
        postscriptName: 'JetBrainsMono-Regular',
        style: 'Normal',
        weight: 400,
        isMonospace: true,
      },
    ];
  }
  return invoke<SystemFontInfo[]>('list_system_fonts');
}

export async function listFontFamilies(): Promise<string[]> {
  if (!isTauriEnvironment()) {
    return ['Amiri', 'JetBrains Mono', 'Inter', 'Scheherazade New', 'Frank Ruhl Libre'];
  }
  return invoke<string[]>('list_font_families');
}

// GitHub OAuth Device Flow & Keychain Bridges
export async function startGithubDeviceFlow(clientId?: string): Promise<GithubDeviceCode> {
  if (!isTauriEnvironment()) {
    return {
      deviceCode: 'mock-device-code-12345',
      userCode: 'WDJB-MJHT',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 900,
      interval: 5,
    };
  }
  return invoke<GithubDeviceCode>('start_github_device_flow', { clientId });
}

export async function pollGithubDeviceToken(
  clientId: string | undefined,
  deviceCode: string
): Promise<PollTokenResponse> {
  if (!isTauriEnvironment()) {
    const mockProfile: GithubUserProfile = {
      username: 'octocat',
      name: 'Mona Lisa Octocat',
      avatarUrl: 'https://github.com/github.png',
      email: 'octocat@github.com',
    };
    return {
      status: 'success',
      accessToken: 'mock_gho_token',
      profile: mockProfile,
    };
  }
  return invoke<PollTokenResponse>('poll_github_device_token', { clientId, deviceCode });
}

export async function getGithubAuthStatus(): Promise<AuthStatusResponse> {
  if (!isTauriEnvironment()) {
    let saved: GithubUserProfile | null = null;
    try {
      const raw = localStorage.getItem('leafforge:github-user-profile');
      if (raw) saved = JSON.parse(raw) as GithubUserProfile;
    } catch {
      // ignore
    }
    return {
      authenticated: saved !== null,
      profile: saved,
    };
  }
  return invoke<AuthStatusResponse>('get_github_auth_status');
}

export async function getGithubUserProfile(): Promise<GithubUserProfile | null> {
  if (!isTauriEnvironment()) {
    try {
      const raw = localStorage.getItem('leafforge:github-user-profile');
      if (raw) return JSON.parse(raw) as GithubUserProfile;
    } catch {
      // ignore
    }
    return null;
  }
  return invoke<GithubUserProfile | null>('get_github_user_profile');
}

export async function logoutGithub(): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('logout_github');
}

export async function listGithubUserRepos(): Promise<GithubRepoSummary[]> {
  if (!isTauriEnvironment()) {
    return [
      {
        id: 101,
        name: 'latex-paper',
        fullName: 'octocat/latex-paper',
        private: false,
        htmlUrl: 'https://github.com/octocat/latex-paper',
        cloneUrl: 'https://github.com/octocat/latex-paper.git',
        defaultBranch: 'main',
        description: 'Collaborative academic paper on deep learning in LaTeX',
        updatedAt: new Date().toISOString(),
      },
      {
        id: 102,
        name: 'thesis-templates',
        fullName: 'octocat/thesis-templates',
        private: true,
        htmlUrl: 'https://github.com/octocat/thesis-templates',
        cloneUrl: 'https://github.com/octocat/thesis-templates.git',
        defaultBranch: 'main',
        description: 'Private graduate thesis template repository',
        updatedAt: new Date().toISOString(),
      },
    ];
  }
  return invoke<GithubRepoSummary[]>('list_github_user_repos');
}

export async function createGithubRepo(
  name: string,
  privateRepo = true,
  description?: string
): Promise<GithubRepoSummary> {
  if (!isTauriEnvironment()) {
    return {
      id: 999,
      name,
      fullName: `octocat/${name}`,
      private: privateRepo,
      htmlUrl: `https://github.com/octocat/${name}`,
      cloneUrl: `https://github.com/octocat/${name}.git`,
      defaultBranch: 'main',
      description: description || null,
      updatedAt: new Date().toISOString(),
    };
  }
  return invoke<GithubRepoSummary>('create_github_repo', {
    name,
    private: privateRepo,
    description,
  });
}

export async function verifyRepoCollaborator(
  owner: string,
  repo: string,
  username: string
): Promise<CollaboratorPermission> {
  if (!isTauriEnvironment()) {
    return { permission: 'admin', canWrite: true, canRead: true };
  }
  return invoke<CollaboratorPermission>('verify_repo_collaborator', { owner, repo, username });
}

export async function getOrCreateRoomKey(projectDir: string): Promise<string> {
  if (!isTauriEnvironment()) {
    return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  }
  return invoke<string>('get_or_create_room_key', { projectDir });
}

// Native Git Engine (libgit2) Bridges
export async function gitIsRepo(projectDir: string): Promise<boolean> {
  if (!isTauriEnvironment()) return true;
  return invoke<boolean>('git_is_repo', { projectDir });
}

export async function gitInit(projectDir: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('git_init', { projectDir });
}

export async function gitSetRemote(
  projectDir: string,
  url: string,
  remoteName?: string
): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('git_set_remote', { projectDir, url, remoteName });
}

export async function gitStatus(projectDir: string): Promise<GitRepoStatus> {
  if (!isTauriEnvironment()) {
    return {
      isRepo: true,
      branch: 'main',
      isClean: true,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
    };
  }
  return invoke<GitRepoStatus>('git_status', { projectDir });
}

export async function gitDiff(
  projectDir: string,
  filePath?: string,
  staged = false
): Promise<string> {
  if (!isTauriEnvironment()) {
    return `diff --git a/${filePath || 'file.tex'} b/${filePath || 'file.tex'}\n@@ -1,3 +1,3 @@\n-Old Line\n+New Line`;
  }
  return invoke<string>('git_diff', { projectDir, filePath, staged });
}

export async function gitStage(projectDir: string, filePath: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('git_stage', { projectDir, filePath });
}

export async function gitUnstage(projectDir: string, filePath: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('git_unstage', { projectDir, filePath });
}

export async function gitStageAll(projectDir: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('git_stage_all', { projectDir });
}

export async function gitUnstageAll(projectDir: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('git_unstage_all', { projectDir });
}

export async function gitCommit(
  projectDir: string,
  message: string,
  authorName?: string,
  authorEmail?: string
): Promise<string> {
  if (!isTauriEnvironment()) {
    return '0123456789abcdef0123456789abcdef01234567';
  }
  return invoke<string>('git_commit', {
    projectDir,
    message,
    authorName,
    authorEmail,
  });
}

export async function gitClone(
  url: string,
  targetPath: string,
  branch?: string
): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('git_clone', { url, targetPath, branch });
}

export async function gitPush(
  projectDir: string,
  remoteName?: string,
  branch?: string
): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('git_push', { projectDir, remoteName, branch });
}

export async function gitPull(
  projectDir: string,
  remoteName?: string,
  branch?: string
): Promise<PullResult> {
  if (!isTauriEnvironment()) {
    return {
      success: true,
      upToDate: true,
      fastForward: false,
      message: 'Already up to date.',
    };
  }
  return invoke<PullResult>('git_pull', { projectDir, remoteName, branch });
}

export async function gitListBranches(projectDir: string): Promise<string[]> {
  if (!isTauriEnvironment()) {
    return ['main', 'feat/draft-section'];
  }
  return invoke<string[]>('git_list_branches', { projectDir });
}

export async function gitCheckoutBranch(
  projectDir: string,
  branchName: string,
  create = false
): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('git_checkout_branch', { projectDir, branchName, create });
}

export async function gitReconcile3Way(
  base: string,
  crdt: string,
  remote: string
): Promise<ReconcileResult> {
  if (!isTauriEnvironment()) {
    if (crdt === remote || remote === base) {
      return { clean: true, mergedText: crdt, hasConflicts: false, conflictCount: 0 };
    }
    if (crdt === base) {
      return { clean: true, mergedText: remote, hasConflicts: false, conflictCount: 0 };
    }
    return {
      clean: false,
      mergedText: `<<<<<<< LIVE SESSION (CRDT)\n${crdt}\n=======\n${remote}\n>>>>>>> INCOMING GIT COMMIT`,
      hasConflicts: true,
      conflictCount: 1,
    };
  }
  return invoke<ReconcileResult>('git_reconcile_3way', { base, crdt, remote });
}

export async function gitGetRemoteUrl(
  projectDir: string,
  remoteName?: string
): Promise<string | null> {
  if (!isTauriEnvironment()) {
    return null;
  }
  return invoke<string | null>('git_get_remote_url', { projectDir, remoteName });
}

export function parseGithubOwnerRepo(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const trimmed = url.trim();
  const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (httpsMatch && httpsMatch[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (sshMatch && sshMatch[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  return null;
}

// App Logging IPC Wrappers
export async function writeLogEntry(
  level: LogLevel,
  target: string,
  message: string,
  details?: string
): Promise<void> {
  if (!isTauriEnvironment()) {
    console.log(`[${level}] [${target}] ${message}`, details || '');
    return;
  }
  return invoke<void>('write_log_entry', { level, target, message, details });
}

export async function getRecentLogs(limit?: number): Promise<LogEntry[]> {
  if (!isTauriEnvironment()) {
    return [];
  }
  return invoke<LogEntry[]>('get_recent_logs', { limit });
}

export async function getLogFilePath(): Promise<string> {
  if (!isTauriEnvironment()) {
    return 'in-memory-browser.log';
  }
  return invoke<string>('get_log_file_path');
}

export async function clearAppLogs(): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('clear_app_logs');
}

export async function openLogFile(): Promise<void> {
  if (!isTauriEnvironment()) return;
  return invoke<void>('open_log_file');
}
