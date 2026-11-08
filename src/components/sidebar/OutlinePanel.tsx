import React, { useState, useMemo } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { OutlineItem, OutlineItemType } from '../../types/latex';
import {
  ListTree,
  Search,
  Bookmark,
  Hash,
  BookOpen,
  Image,
  Table as TableIcon,
  ChevronRight,
} from 'lucide-react';

/**
 * Pure parsing function to extract outline hierarchy from LaTeX content
 */
export function parseLatexOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = content.split('\n');

  let currentSectionLabel: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const lineNum = i + 1;
    const trimmed = rawLine.trim();

    // Skip commented out lines
    if (trimmed.startsWith('%')) continue;

    // 1. Structural headings
    const headingMatch = trimmed.match(
      /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\{([^}]+)\}/
    );
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      const type = headingMatch[1] as OutlineItemType;
      const title = headingMatch[2].trim();

      let level = 2;
      if (type === 'part') level = 0;
      else if (type === 'chapter') level = 1;
      else if (type === 'section') level = 2;
      else if (type === 'subsection') level = 3;
      else if (type === 'subsubsection') level = 4;
      else if (type === 'paragraph') level = 5;

      items.push({
        id: `heading-${lineNum}-${type}`,
        type,
        title,
        line: lineNum,
        level,
        label: currentSectionLabel,
      });
      continue;
    }

    // 2. Labels
    const labelMatch = trimmed.match(/\\label\{([^}]+)\}/);
    if (labelMatch && labelMatch[1]) {
      const labelKey = labelMatch[1].trim();
      currentSectionLabel = labelKey;
      items.push({
        id: `label-${lineNum}-${labelKey}`,
        type: 'label',
        title: labelKey,
        line: lineNum,
        level: 4,
      });
      continue;
    }

    // 3. Figures & Tables with Captions
    const figMatch = trimmed.match(/\\begin\{(figure|table)\}/);
    if (figMatch && figMatch[1]) {
      const env = figMatch[1];
      // Search subsequent 10 lines for \caption
      let caption = env === 'figure' ? 'Figure' : 'Table';
      for (let j = i; j < Math.min(lines.length, i + 10); j++) {
        const capMatch = lines[j]?.match(/\\caption\{([^}]+)\}/);
        if (capMatch && capMatch[1]) {
          caption = capMatch[1].trim();
          break;
        }
      }

      items.push({
        id: `float-${lineNum}-${env}`,
        type: env === 'figure' ? 'figure' : 'table',
        title: caption,
        line: lineNum,
        level: 3,
      });
    }
  }

  return items;
}

export const OutlinePanel: React.FC = () => {
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const fileContents = useWorkspaceStore((s) => s.fileContents);
  const setEditorJumpTarget = useWorkspaceStore((s) => s.setEditorJumpTarget);

  const [searchQuery, setSearchQuery] = useState('');

  const content = activeFilePath ? (fileContents[activeFilePath] ?? '') : '';

  const outlineItems = useMemo(() => {
    return parseLatexOutline(content);
  }, [content]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return outlineItems;
    const q = searchQuery.toLowerCase();
    return outlineItems.filter(
      (it) => it.title.toLowerCase().includes(q) || it.type.toLowerCase().includes(q)
    );
  }, [outlineItems, searchQuery]);

  const getItemIcon = (type: OutlineItemType) => {
    switch (type) {
      case 'part':
      case 'chapter':
        return <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
      case 'section':
        return <Hash className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
      case 'subsection':
      case 'subsubsection':
      case 'paragraph':
        return <ChevronRight className="w-3 h-3 text-[var(--text-muted)] shrink-0" />;
      case 'label':
        return <Bookmark className="w-3.5 h-3.5 text-pink-400 shrink-0" />;
      case 'figure':
        return <Image className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'table':
        return <TableIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
  };

  const handleJump = (line: number) => {
    setEditorJumpTarget({ line, col: 1 });
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-elevated)] select-none">
      {/* Outline Header */}
      <div className="p-3 border-b border-[var(--border-subtle)] space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <div className="flex items-center space-x-1.5">
            <ListTree className="w-3.5 h-3.5 text-accent-primary" />
            <span>Document Outline</span>
          </div>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--canvas)] border border-[var(--border-subtle)]">
            {outlineItems.length} nodes
          </span>
        </div>

        {/* Search Filter */}
        <div className="relative">
          <Search className="w-3 h-3 text-[var(--text-muted)] absolute left-2 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter sections & labels..."
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-[var(--canvas)] border border-[var(--border-subtle)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-accent-primary"
          />
        </div>
      </div>

      {/* Outline Tree List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {filteredItems.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--text-muted)] italic">
            {outlineItems.length === 0
              ? 'No structural sections found in current document.'
              : 'No matching items.'}
          </div>
        ) : (
          filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleJump(item.line)}
              style={{ paddingLeft: `${Math.max(4, item.level * 12)}px` }}
              className="w-full flex items-center justify-between px-2 py-1 rounded text-xs text-left hover:bg-[var(--hover-bg)] text-[var(--text-primary)] group transition-colors"
            >
              <div className="flex items-center space-x-1.5 truncate pr-2">
                {getItemIcon(item.type)}
                <span
                  className={`truncate ${
                    item.type === 'section' || item.type === 'chapter' || item.type === 'part'
                      ? 'font-medium text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.title}
                </span>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-muted)] opacity-60 group-hover:opacity-100">
                L{item.line}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
