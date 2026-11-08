import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  FileCode,
  Play,
  GitBranch,
  Languages,
  Users,
  Eye,
  Sliders,
  Sparkles,
  Save,
  X,
  RotateCcw,
  Trash2,
  GitCommit,
  ArrowUp,
  ArrowDown,
  GitFork,
  BookOpen,
  Hash,
  Palette,
  ExternalLink,
  Table,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useCompilerStore } from '../../store/useCompilerStore';
import { useGitStore } from '../../store/useGitStore';
import { useCollabStore } from '../../store/useCollabStore';
import { formatErrorDetails } from '../../utils/formatError';
import { logger } from '../../services/logger';
import { collabManager } from '../../services/collabManager';
import {
  writeFileText,
  cleanAuxFiles,
  gitStageAll,
  gitUnstageAll,
  gitPush,
  gitPull,
  gitStatus,
  logoutGithub,
  abortCompilation,
} from '../../services/tauriClient';

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  category: 'Editor' | 'Compiler' | 'Git' | 'BiDi / RTL' | 'Collaboration' | 'View' | 'Files';
  icon: React.ReactNode;
  shortcut?: string;
  keywords?: string[];
  action: () => void | Promise<void>;
}

import type { FileEntry } from '../../types/ipc';
import type { OutlineItem } from '../../types/latex';
import type { RoomConnectionStatus } from '../../types/collab';

export interface CommandPaletteProps {
  isOpenOverride?: boolean;
  editorModeOverride?: 'raw' | 'visual';
  collabStatusOverride?: RoomConnectionStatus;
  filesOverride?: FileEntry[];
  outlineItemsOverride?: OutlineItem[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpenOverride,
  editorModeOverride,
  collabStatusOverride,
  filesOverride,
  outlineItemsOverride,
}) => {
  const storeIsOpen = useWorkspaceStore((s) => s.commandPaletteOpen);
  const isOpen = isOpenOverride !== undefined ? isOpenOverride : storeIsOpen;
  const setIsOpen = useWorkspaceStore((s) => s.setCommandPaletteOpen);

  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const storeFiles = useWorkspaceStore((s) => s.files);
  const files = filesOverride !== undefined ? filesOverride : storeFiles;
  const fileContents = useWorkspaceStore((s) => s.fileContents);
  const storeEditorMode = useWorkspaceStore((s) => s.editorMode);
  const editorMode = editorModeOverride !== undefined ? editorModeOverride : storeEditorMode;
  const storeOutlineItems = useWorkspaceStore((s) => s.outlineItems);
  const outlineItems = outlineItemsOverride !== undefined ? outlineItemsOverride : storeOutlineItems;
  const workspacePath = useWorkspaceStore((s) => s.workspacePath);

  const setEditorMode = useWorkspaceStore((s) => s.setEditorMode);
  const setActiveSidebarTab = useWorkspaceStore((s) => s.setActiveSidebarTab);
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar);
  const toggleTheme = useWorkspaceStore((s) => s.toggleTheme);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);
  const openFile = useWorkspaceStore((s) => s.openFile);
  const closeFile = useWorkspaceStore((s) => s.closeFile);
  const markFileSaved = useWorkspaceStore((s) => s.markFileSaved);
  const setEditorJumpTarget = useWorkspaceStore((s) => s.setEditorJumpTarget);
  const setActiveLineIsRtl = useWorkspaceStore((s) => s.setActiveLineIsRtl);
  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent);

  const setEngine = useCompilerStore((s) => s.setEngine);
  const runCompile = useCompilerStore((s) => s.runCompile);
  const toggleLogDrawer = useCompilerStore((s) => s.toggleLogDrawer);
  const setActiveLogTab = useCompilerStore((s) => s.setActiveLogTab);
  const setLogDrawerOpen = useCompilerStore((s) => s.setLogDrawerOpen);
  const setActiveFontFamily = useCompilerStore((s) => s.setActiveFontFamily);

  const setDeviceModalOpen = useGitStore((s) => s.setDeviceModalOpen);
  const setGitStatus = useGitStore((s) => s.setGitStatus);

  const storeCollabStatus = useCollabStore((s) => s.status);
  const collabStatus = collabStatusOverride !== undefined ? collabStatusOverride : storeCollabStatus;
  const peers = useCollabStore((s) => s.peers);
  const toggleFollowPeer = useCollabStore((s) => s.toggleFollowPeer);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global toggle listener (Cmd/Ctrl + K and Cmd/Ctrl + P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsOpen(!useWorkspaceStore.getState().commandPaletteOpen);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsOpen]);

  // Focus input when opened and reset query
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setSelectedCategory('All');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Helper to insert snippet into active document
  const insertTextAtCursor = useCallback(
    (text: string) => {
      if (!activeFilePath) return;
      const current = fileContents[activeFilePath] ?? '';
      updateFileContent(activeFilePath, current + (current ? '\n' : '') + text);
    },
    [activeFilePath, fileContents, updateFileContent]
  );

  // Build command catalogue
  const commands = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [
      // --- EDITOR ---
      {
        id: 'editor:toggle-mode',
        title: editorMode === 'raw' ? 'Switch to Visual Mode' : 'Switch to Raw Source Mode',
        description: 'Toggle WYSIWYM interactive KaTeX widgets and formatting',
        category: 'Editor',
        icon: <Eye className="w-4 h-4 text-sky-400" />,
        shortcut: '⌘⇧M',
        keywords: ['mode', 'wysiwym', 'raw', 'visual', 'preview'],
        action: () => setEditorMode(editorMode === 'raw' ? 'visual' : 'raw'),
      },
      {
        id: 'editor:save',
        title: 'Save Active Document',
        description: 'Write buffer atomically to disk and trigger background compilation',
        category: 'Editor',
        icon: <Save className="w-4 h-4 text-emerald-400" />,
        shortcut: '⌘S',
        keywords: ['save', 'write', 'disk', 'persist'],
        action: async () => {
          if (activeFilePath) {
            const content = fileContents[activeFilePath] ?? '';
            await writeFileText(activeFilePath, content);
            markFileSaved(activeFilePath);
            runCompile();
          }
        },
      },
      {
        id: 'editor:toggle-rtl',
        title: 'Toggle Paragraph Direction (RTL / LTR)',
        description: 'Switch between Right-to-Left Arabic/Hebrew and Left-to-Right prose',
        category: 'BiDi / RTL',
        icon: <Languages className="w-4 h-4 text-amber-400" />,
        shortcut: '^⌥R',
        keywords: ['rtl', 'ltr', 'direction', 'arabic', 'hebrew', 'bidi'],
        action: () => {
          const current = useWorkspaceStore.getState().activeLineIsRtl;
          setActiveLineIsRtl(!current);
        },
      },
      {
        id: 'editor:close-file',
        title: 'Close Active Tab',
        description: 'Close currently focused document tab',
        category: 'Editor',
        icon: <X className="w-4 h-4 text-rose-400" />,
        shortcut: '⌘W',
        keywords: ['close', 'tab', 'file'],
        action: () => {
          if (activeFilePath) closeFile(activeFilePath);
        },
      },
      {
        id: 'editor:insert-math',
        title: 'Insert KaTeX Inline Math',
        description: 'Insert $...$ equation span at cursor',
        category: 'Editor',
        icon: <Sparkles className="w-4 h-4 text-amber-400" />,
        keywords: ['math', 'katex', 'inline', 'equation', 'formula'],
        action: () => insertTextAtCursor('$E = mc^2$'),
      },
      {
        id: 'editor:insert-equation',
        title: 'Insert Display Equation Environment',
        description: 'Insert \\begin{equation}...\\end{equation} block',
        category: 'Editor',
        icon: <Hash className="w-4 h-4 text-indigo-400" />,
        keywords: ['equation', 'display', 'numbered', 'math'],
        action: () =>
          insertTextAtCursor('\\begin{equation}\n  \\mathcal{L} = \\int \\sqrt{-g} d^4x\n\\end{equation}'),
      },
      {
        id: 'editor:insert-section',
        title: 'Insert Section Heading',
        description: 'Insert \\section{Title}',
        category: 'Editor',
        icon: <FileCode className="w-4 h-4 text-sky-400" />,
        keywords: ['section', 'heading', 'title', 'chapter'],
        action: () => insertTextAtCursor('\\section{New Section}'),
      },
      {
        id: 'editor:insert-table',
        title: 'Insert Tabular Environment',
        description: 'Insert \\begin{tabular}{cc}...\\end{tabular}',
        category: 'Editor',
        icon: <Table className="w-4 h-4 text-cyan-400" />,
        keywords: ['table', 'tabular', 'grid', 'matrix'],
        action: () =>
          insertTextAtCursor(
            '\\begin{tabular}{|l|c|r|}\n  \\hline\n  A & B & C \\\\\n  \\hline\n  1 & 2 & 3 \\\\\n  \\hline\n\\end{tabular}'
          ),
      },
      {
        id: 'editor:insert-cite',
        title: 'Insert BibTeX Citation',
        description: 'Insert \\cite{key} with autocomplete',
        category: 'Editor',
        icon: <BookOpen className="w-4 h-4 text-amber-400" />,
        keywords: ['cite', 'citation', 'bibtex', 'reference'],
        action: () => insertTextAtCursor('\\cite{knuth1984}'),
      },

      // --- COMPILER ---
      {
        id: 'compiler:run',
        title: 'Compile LaTeX Document',
        description: 'Trigger multi-engine compilation and reload PDF viewer',
        category: 'Compiler',
        icon: <Play className="w-4 h-4 text-emerald-400" />,
        shortcut: '⌘B',
        keywords: ['compile', 'build', 'pdf', 'latex', 'tectonic', 'recompile'],
        action: () => runCompile(),
      },
      {
        id: 'compiler:abort',
        title: 'Abort In-Flight Compilation',
        description: 'Cancel any running TeX compilation worker thread',
        category: 'Compiler',
        icon: <X className="w-4 h-4 text-rose-400" />,
        keywords: ['abort', 'cancel', 'stop', 'kill', 'halt'],
        action: async () => {
          await abortCompilation();
        },
      },
      {
        id: 'compiler:engine-tectonic',
        title: 'Select Engine: Tectonic (Auto-CTAN / XeTeX)',
        description: 'Zero-config embedded engine with on-demand package downloading',
        category: 'Compiler',
        icon: <Sliders className="w-4 h-4 text-sky-400" />,
        keywords: ['tectonic', 'engine', 'compiler', 'ctan', 'zero-config'],
        action: () => setEngine('tectonic'),
      },
      {
        id: 'compiler:engine-lualatex',
        title: 'Select Engine: LuaLaTeX',
        description: 'Modern TeX engine with native Lua scripting and Babel RTL support',
        category: 'Compiler',
        icon: <Sliders className="w-4 h-4 text-purple-400" />,
        keywords: ['lualatex', 'lua', 'engine', 'compiler', 'bidi'],
        action: () => setEngine('lualatex'),
      },
      {
        id: 'compiler:engine-xelatex',
        title: 'Select Engine: XeLaTeX',
        description: 'Unicode engine with Fontspec system OpenType font access',
        category: 'Compiler',
        icon: <Sliders className="w-4 h-4 text-blue-400" />,
        keywords: ['xelatex', 'fontspec', 'engine', 'compiler', 'opentype'],
        action: () => setEngine('xelatex'),
      },
      {
        id: 'compiler:engine-pdflatex',
        title: 'Select Engine: pdfLaTeX',
        description: 'Standard fast legacy compiler for IEEE / ACM / arXiv papers',
        category: 'Compiler',
        icon: <Sliders className="w-4 h-4 text-orange-400" />,
        keywords: ['pdflatex', 'arxiv', 'engine', 'compiler', 'legacy'],
        action: () => setEngine('pdflatex'),
      },
      {
        id: 'compiler:clean-aux',
        title: 'Clean Auxiliary Build Artifacts',
        description: 'Remove cached .aux, .log, .out, .synctex.gz, and .fls files',
        category: 'Compiler',
        icon: <Trash2 className="w-4 h-4 text-rose-400" />,
        keywords: ['clean', 'aux', 'purge', 'cache', 'log', 'synctex'],
        action: async () => {
          if (workspacePath) {
            const root = useWorkspaceStore.getState().rootTexFile || 'main.tex';
            await cleanAuxFiles(workspacePath, root);
          }
        },
      },
      {
        id: 'compiler:toggle-logs',
        title: 'Toggle Build Log Drawer',
        description: 'Open or close the bottom LaTeX compiler diagnostics drawer',
        category: 'Compiler',
        icon: <RotateCcw className="w-4 h-4 text-amber-400" />,
        shortcut: '⌥L',
        keywords: ['log', 'drawer', 'errors', 'warnings', 'diagnostics'],
        action: () => toggleLogDrawer(),
      },
      {
        id: 'compiler:view-errors',
        title: 'View Compilation Errors',
        description: 'Open build drawer focused on parsed LaTeX errors',
        category: 'Compiler',
        icon: <X className="w-4 h-4 text-rose-400" />,
        keywords: ['error', 'errors', 'fail', 'diagnostic'],
        action: () => {
          setLogDrawerOpen(true);
          setActiveLogTab('errors');
        },
      },
      {
        id: 'compiler:view-warnings',
        title: 'View Compilation Warnings',
        description: 'Open build drawer focused on reference and bad box warnings',
        category: 'Compiler',
        icon: <RotateCcw className="w-4 h-4 text-amber-400" />,
        keywords: ['warning', 'warnings', 'badbox', 'overfull', 'underfull'],
        action: () => {
          setLogDrawerOpen(true);
          setActiveLogTab('warnings');
        },
      },
      {
        id: 'compiler:view-raw-log',
        title: 'View Raw TeX Console Log',
        description: 'Inspect full verbatim output from the LaTeX compiler',
        category: 'Compiler',
        icon: <FileCode className="w-4 h-4 text-zinc-400" />,
        keywords: ['raw', 'console', 'stdout', 'log'],
        action: () => {
          setLogDrawerOpen(true);
          setActiveLogTab('raw');
        },
      },

      // --- GIT & VERSION CONTROL ---
      {
        id: 'git:refresh',
        title: 'Refresh Git Repository Status',
        description: 'Scan working tree for staged, modified, and untracked files',
        category: 'Git',
        icon: <RotateCcw className="w-4 h-4 text-sky-400" />,
        keywords: ['git', 'status', 'refresh', 'sync'],
        action: async () => {
          if (workspacePath) {
            const st = await gitStatus(workspacePath);
            setGitStatus(st.branch, st.isClean, st.ahead, st.behind, st.staged, st.unstaged);
          }
        },
      },
      {
        id: 'git:stage-all',
        title: 'Git: Stage All Modified Files',
        description: 'Add all workspace file changes to the Git index',
        category: 'Git',
        icon: <GitCommit className="w-4 h-4 text-emerald-400" />,
        keywords: ['git', 'stage', 'add', 'all', 'index'],
        action: async () => {
          if (workspacePath) {
            await gitStageAll(workspacePath);
            const st = await gitStatus(workspacePath);
            setGitStatus(st.branch, st.isClean, st.ahead, st.behind, st.staged, st.unstaged);
          }
        },
      },
      {
        id: 'git:unstage-all',
        title: 'Git: Unstage All Files',
        description: 'Reset index staging area',
        category: 'Git',
        icon: <RotateCcw className="w-4 h-4 text-amber-400" />,
        keywords: ['git', 'unstage', 'reset'],
        action: async () => {
          if (workspacePath) {
            await gitUnstageAll(workspacePath);
            const st = await gitStatus(workspacePath);
            setGitStatus(st.branch, st.isClean, st.ahead, st.behind, st.staged, st.unstaged);
          }
        },
      },
      {
        id: 'git:push',
        title: 'Git: Push to Remote Branch',
        description: 'Push committed changes to GitHub with OAuth Keychain credentials',
        category: 'Git',
        icon: <ArrowUp className="w-4 h-4 text-emerald-400" />,
        keywords: ['git', 'push', 'remote', 'github'],
        action: async () => {
          if (workspacePath) {
            await gitPush(workspacePath);
            const st = await gitStatus(workspacePath);
            setGitStatus(st.branch, st.isClean, st.ahead, st.behind, st.staged, st.unstaged);
          }
        },
      },
      {
        id: 'git:pull',
        title: 'Git: Pull from Remote Branch',
        description: 'Fetch and merge remote changes with 3-way CRDT reconciliation',
        category: 'Git',
        icon: <ArrowDown className="w-4 h-4 text-sky-400" />,
        keywords: ['git', 'pull', 'fetch', 'remote', 'merge'],
        action: async () => {
          if (workspacePath) {
            await gitPull(workspacePath);
            const st = await gitStatus(workspacePath);
            setGitStatus(st.branch, st.isClean, st.ahead, st.behind, st.staged, st.unstaged);
          }
        },
      },
      {
        id: 'git:connect-repo',
        title: 'GitHub: Connect Workspace to Repository',
        description: 'Link this workspace to an existing or new GitHub repository',
        category: 'Git',
        icon: <GitFork className="w-4 h-4 text-accent-primary" />,
        keywords: ['github', 'connect', 'publish', 'remote', 'repo', 'link'],
        action: () => useGitStore.getState().setConnectModalOpen(true),
      },
      {
        id: 'git:auth-login',
        title: 'GitHub: Connect Account (Device Flow)',
        description: 'Authorize with GitHub 8-character device code and store token in OS Keychain',
        category: 'Git',
        icon: <GitFork className="w-4 h-4 text-white" />,
        keywords: ['github', 'auth', 'login', 'device', 'oauth', 'token'],
        action: () => setDeviceModalOpen(true),
      },
      {
        id: 'git:auth-logout',
        title: 'GitHub: Log Out & Revoke Credentials',
        description: 'Remove OAuth token from native OS Keychain',
        category: 'Git',
        icon: <X className="w-4 h-4 text-rose-400" />,
        keywords: ['github', 'logout', 'signout', 'revoke'],
        action: async () => {
          await logoutGithub();
          useGitStore.getState().setUserProfile(null);
        },
      },

      // --- BIDI & RTL TYPOGRAPHY ---
      {
        id: 'bidi:force-rtl',
        title: 'BiDi: Set Paragraph Direction to RTL',
        description: 'Force Right-to-Left writing mode on active line with LTR macro isolation',
        category: 'BiDi / RTL',
        icon: <Languages className="w-4 h-4 text-emerald-400" />,
        keywords: ['bidi', 'rtl', 'arabic', 'hebrew', 'farsi', 'persian'],
        action: () => setActiveLineIsRtl(true),
      },
      {
        id: 'bidi:force-ltr',
        title: 'BiDi: Set Paragraph Direction to LTR',
        description: 'Force Left-to-Right writing mode on active line',
        category: 'BiDi / RTL',
        icon: <Languages className="w-4 h-4 text-sky-400" />,
        keywords: ['bidi', 'ltr', 'english', 'latin'],
        action: () => setActiveLineIsRtl(false),
      },
      {
        id: 'bidi:font-amiri',
        title: 'RTL Typography: Select Amiri Font',
        description: 'Classical Naskh typeface optimized for Arabic typesetting',
        category: 'BiDi / RTL',
        icon: <Palette className="w-4 h-4 text-amber-400" />,
        keywords: ['font', 'amiri', 'naskh', 'arabic'],
        action: () => setActiveFontFamily('Amiri'),
      },
      {
        id: 'bidi:font-scheherazade',
        title: 'RTL Typography: Select Scheherazade New Font',
        description: 'Traditional Arabic font with extended diacritic vocalization',
        category: 'BiDi / RTL',
        icon: <Palette className="w-4 h-4 text-amber-400" />,
        keywords: ['font', 'scheherazade', 'arabic'],
        action: () => setActiveFontFamily('Scheherazade New'),
      },
      {
        id: 'bidi:font-vazirmatn',
        title: 'RTL Typography: Select Vazirmatn Font',
        description: 'Modern legible sans-serif for Persian and Arabic screen display',
        category: 'BiDi / RTL',
        icon: <Palette className="w-4 h-4 text-amber-400" />,
        keywords: ['font', 'vazirmatn', 'farsi', 'persian'],
        action: () => setActiveFontFamily('Vazirmatn'),
      },
      {
        id: 'bidi:font-frank-ruhl',
        title: 'RTL Typography: Select Frank Ruhl Libre Font',
        description: 'Ubiquitous classical serif for Hebrew academic publications',
        category: 'BiDi / RTL',
        icon: <Palette className="w-4 h-4 text-amber-400" />,
        keywords: ['font', 'frank', 'ruhl', 'hebrew'],
        action: () => setActiveFontFamily('Frank Ruhl Libre'),
      },

      // --- COLLABORATION ---
      {
        id: 'collab:toggle-session',
        title:
          collabStatus === 'connected'
            ? 'Collab: Disconnect from Live Session'
            : 'Collab: Connect to Real-Time CRDT Session',
        description: 'WebRTC / WebSocket encrypted P2P document synchronization',
        category: 'Collaboration',
        icon: <Users className="w-4 h-4 text-cyan-400" />,
        keywords: ['collab', 'yjs', 'webrtc', 'p2p', 'coedit', 'room'],
        action: async () => {
          if (collabStatus === 'connected') {
            await collabManager.disconnect();
          } else if (workspacePath) {
            setActiveSidebarTab('collab');
          }
        },
      },
      {
        id: 'collab:follow-peer',
        title: 'Collab: Toggle Follow Mode',
        description: 'Lock viewport to follow cursor and active file of primary collaborator',
        category: 'Collaboration',
        icon: <Eye className="w-4 h-4 text-purple-400" />,
        keywords: ['follow', 'peer', 'collaborator', 'cursor', 'viewport'],
        action: () => {
          if (peers.length > 0 && peers[0]) {
            toggleFollowPeer(peers[0].clientId);
          }
        },
      },

      // --- VIEW & SIDEBAR PANELS ---
      {
        id: 'view:sidebar-files',
        title: 'View: Show File Explorer',
        description: 'Open file tree sidebar panel',
        category: 'View',
        icon: <FolderOpen className="w-4 h-4 text-sky-400" />,
        shortcut: '⌘1',
        keywords: ['view', 'files', 'explorer', 'tree'],
        action: () => setActiveSidebarTab('files'),
      },
      {
        id: 'view:sidebar-outline',
        title: 'View: Show Document Outline',
        description: 'Navigate sections, subsections, and labels',
        category: 'View',
        icon: <Hash className="w-4 h-4 text-indigo-400" />,
        shortcut: '⌘2',
        keywords: ['view', 'outline', 'sections', 'toc'],
        action: () => setActiveSidebarTab('outline'),
      },
      {
        id: 'view:sidebar-git',
        title: 'View: Show Git Control Panel',
        description: 'Stage files, view diffs, and commit changes',
        category: 'View',
        icon: <GitBranch className="w-4 h-4 text-orange-400" />,
        shortcut: '⌘3',
        keywords: ['view', 'git', 'version', 'diff'],
        action: () => setActiveSidebarTab('git'),
      },
      {
        id: 'view:sidebar-collab',
        title: 'View: Show Collaboration Panel',
        description: 'Inspect active peers, follow mode, and committer election',
        category: 'View',
        icon: <Users className="w-4 h-4 text-cyan-400" />,
        shortcut: '⌘4',
        keywords: ['view', 'collab', 'peers', 'room'],
        action: () => setActiveSidebarTab('collab'),
      },
      {
        id: 'view:sidebar-packages',
        title: 'View: Show Packages & Fonts Panel',
        description: 'Configure active compiler, system fonts, and CTAN dependencies',
        category: 'View',
        icon: <Sliders className="w-4 h-4 text-emerald-400" />,
        shortcut: '⌘5',
        keywords: ['view', 'packages', 'fonts', 'ctan', 'engine'],
        action: () => setActiveSidebarTab('packages'),
      },
      {
        id: 'view:toggle-sidebar',
        title: 'View: Toggle Sidebar Collapse',
        description: 'Expand or collapse the left contextual tool panel',
        category: 'View',
        icon: <ExternalLink className="w-4 h-4 text-zinc-400" />,
        shortcut: '⌘B',
        keywords: ['sidebar', 'collapse', 'expand', 'toggle'],
        action: () => toggleSidebar(),
      },
      {
        id: 'view:toggle-theme',
        title: 'View: Toggle Theme (Obsidian Dark / Parchment Light)',
        description: 'Switch between Obsidian Studio and Parchment Precision design tokens',
        category: 'View',
        icon: <Palette className="w-4 h-4 text-amber-400" />,
        shortcut: '⌘T',
        keywords: ['theme', 'dark', 'light', 'obsidian', 'parchment', 'color'],
        action: () => toggleTheme(),
      },
    ];

    // Append workspace files for instant jump
    const fileEntries =
      files.length > 0
        ? files
        : openFiles.map((p) => ({ name: p.split('/').pop() ?? p, path: p, isDirectory: false }));
    for (const f of fileEntries) {
      if (!f.isDirectory) {
        const norm = f.path.replace(/\\/g, '/');
        const fileName = f.name || norm.split('/').pop() || f.path;
        list.push({
          id: `file:${f.path}`,
          title: `Open: ${fileName}`,
          description: norm,
          category: 'Files',
          icon: <FileCode className="w-4 h-4 text-sky-400" />,
          keywords: ['file', 'open', fileName, norm],
          action: () => {
            openFile(f.path);
            setActiveFile(f.path);
          },
        });
      }
    }

    // Append document outline items for instant section navigation
    for (const item of outlineItems) {
      list.push({
        id: `outline:${item.title}:${item.line}`,
        title: `Jump to: ${item.title}`,
        description: `Line ${item.line} (Level ${item.level})`,
        category: 'Editor',
        icon: <Hash className="w-4 h-4 text-indigo-400" />,
        keywords: ['outline', 'section', 'jump', item.title],
        action: () => {
          setEditorJumpTarget({ line: item.line, col: 1 });
        },
      });
    }

    return list;
  }, [
    editorMode,
    activeFilePath,
    fileContents,
    markFileSaved,
    runCompile,
    setActiveLineIsRtl,
    closeFile,
    insertTextAtCursor,
    setEngine,
    workspacePath,
    toggleLogDrawer,
    setLogDrawerOpen,
    setActiveLogTab,
    setGitStatus,
    setDeviceModalOpen,
    setActiveFontFamily,
    collabStatus,
    peers,
    toggleFollowPeer,
    setActiveSidebarTab,
    toggleSidebar,
    toggleTheme,
    files,
    openFiles,
    openFile,
    setActiveFile,
    outlineItems,
    setEditorJumpTarget,
    setEditorMode,
  ]);

  // Filter commands by query & category
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands.filter((cmd) => {
      if (selectedCategory !== 'All' && cmd.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;

      const titleMatch = cmd.title.toLowerCase().includes(q);
      const descMatch = cmd.description?.toLowerCase().includes(q) ?? false;
      const catMatch = cmd.category.toLowerCase().includes(q);
      const keywordMatch = cmd.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false;

      return titleMatch || descMatch || catMatch || keywordMatch;
    });
  }, [commands, query, selectedCategory]);

  // Handle keyboard navigation within palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }

    if (filteredCommands.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        executeCommand(selected);
      }
    }
  };

  const executeCommand = (cmd: CommandItem) => {
    setIsOpen(false);
    try {
      const res = cmd.action();
      if (res && typeof res.then === 'function') {
        void res.catch((err) =>
          logger.error('CommandPalette', 'Command async execution error', {
            commandId: cmd.id,
            error: formatErrorDetails(err),
          })
        );
      }
    } catch (err) {
      logger.error('CommandPalette', 'Command execution error', {
        commandId: cmd.id,
        error: formatErrorDetails(err),
      });
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-command-item]');
    const activeItem = items[selectedIndex] as HTMLElement | undefined;
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const categories = ['All', 'Editor', 'Compiler', 'Git', 'BiDi / RTL', 'Collaboration', 'View', 'Files'];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onClick={() => setIsOpen(false)}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-100"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-2xl bg-[var(--surface-elevated, #161a20)] border border-[var(--border-subtle, #222730)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[520px] text-[var(--text-primary, #e6ecf2)] font-sans"
      >
        {/* Search Input Box */}
        <div className="flex items-center px-4 py-3 border-b border-[var(--border-subtle, #222730)] bg-[var(--surface-editor, #111418)] gap-3 shrink-0">
          <Search className="w-5 h-5 text-accent-primary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search files... (Cmd/Ctrl+K)"
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder-[var(--text-muted, #52525b)] text-[var(--text-primary, #e6ecf2)]"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="p-1 text-[var(--text-muted, #52525b)] hover:text-[var(--text-primary)] rounded"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded shadow-xs">
              ESC
            </kbd>
          )}
        </div>

        {/* Category Pills Row */}
        <div className="flex items-center space-x-1 px-3 py-1.5 border-b border-[var(--border-subtle, #222730)] bg-[var(--surface-elevated, #161a20)] overflow-x-auto shrink-0 select-none">
          {categories.map((cat) => {
            const isSel = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  isSel
                    ? 'bg-accent-primary text-black font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg, rgba(255,255,255,0.05))]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-muted)] space-y-1">
              <Search className="w-8 h-8 mx-auto opacity-40 mb-2" />
              <p className="text-sm font-medium">No matching commands or files found</p>
              <p className="text-xs opacity-75">Try a different search query or select another category</p>
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  data-command-item
                  onClick={() => executeCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-accent-primary/15 text-[var(--text-primary)] border border-accent-primary/30'
                      : 'text-[var(--text-primary)] hover:bg-[var(--hover-bg, rgba(255,255,255,0.04))] border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 mr-2">
                    <span className="shrink-0 p-1.5 rounded-md bg-[var(--surface-editor, #111418)] border border-[var(--border-subtle)]">
                      {cmd.icon}
                    </span>
                    <div className="min-w-0 flex flex-col">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium truncate text-sm">{cmd.title}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-[var(--surface-editor)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                          {cmd.category}
                        </span>
                      </div>
                      {cmd.description && (
                        <span className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                          {cmd.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {cmd.shortcut && (
                      <kbd className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-[var(--surface-editor)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                        {cmd.shortcut}
                      </kbd>
                    )}
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-accent-primary" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="px-4 py-2 border-t border-[var(--border-subtle, #222730)] bg-[var(--surface-editor, #111418)] flex items-center justify-between text-[11px] text-[var(--text-muted)] select-none shrink-0">
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <kbd className="px-1 py-0.5 font-mono text-[10px] bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded">
                ↑
              </kbd>
              <kbd className="px-1 py-0.5 font-mono text-[10px] bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded">
                ↓
              </kbd>
              <span className="ml-1">Navigate</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded">
                ↵
              </kbd>
              <span className="ml-1">Select</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded">
                ESC
              </kbd>
              <span className="ml-1">Close</span>
            </span>
          </div>

          <span className="text-[10px] opacity-75 font-mono">
            {filteredCommands.length} {filteredCommands.length === 1 ? 'action' : 'actions'}
          </span>
        </div>
      </div>
    </div>
  );
};
