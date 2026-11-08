import React, { useEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  label?: string;
  icon?: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  action?: () => void;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x, y });
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Filter actionable items for keyboard navigation
  const actionableIndices = items
    .map((item, idx) => (!item.divider && !item.disabled ? idx : -1))
    .filter((idx) => idx !== -1);

  // Clamp menu coordinates inside viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const padding = 8;
      let newX = x;
      let newY = y;

      if (newX + rect.width > window.innerWidth - padding) {
        newX = Math.max(padding, window.innerWidth - rect.width - padding);
      }
      if (newY + rect.height > window.innerHeight - padding) {
        newY = Math.max(padding, window.innerHeight - rect.height - padding);
      }

      setCoords({ x: newX, y: newY });
    }
  }, [x, y]);

  // Global listeners for click-outside, blur, and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const currentPos = actionableIndices.indexOf(prev);
          const nextPos = (currentPos + 1) % actionableIndices.length;
          return actionableIndices[nextPos] ?? -1;
        });
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const currentPos = actionableIndices.indexOf(prev);
          const nextPos = (currentPos - 1 + actionableIndices.length) % actionableIndices.length;
          return actionableIndices[nextPos] ?? -1;
        });
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          const item = items[focusedIndex];
          if (item && !item.disabled && !item.divider && item.action) {
            item.action();
            onClose();
          }
        }
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('contextmenu', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('contextmenu', handlePointerDown);
    };
  }, [onClose, focusedIndex, actionableIndices, items]);

  return (
    <div
      ref={menuRef}
      style={{
        top: `${coords.y}px`,
        left: `${coords.x}px`,
      }}
      className="fixed z-50 min-w-[210px] max-w-[280px] py-1 px-1 bg-[var(--surface-elevated)]/95 backdrop-blur-md border border-[var(--border-subtle)] shadow-2xl rounded-lg text-xs select-none transition-opacity duration-75 animate-in fade-in zoom-in-95"
      role="menu"
      data-testid="context-menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => {
        if (item.divider) {
          return <div key={`divider-${idx}`} className="h-[1px] bg-[var(--border-subtle)] my-1 mx-1" />;
        }

        const Icon = item.icon;
        const isFocused = focusedIndex === idx;

        return (
          <div
            key={item.label || idx}
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              if (item.disabled) return;
              if (item.action) {
                item.action();
              }
              onClose();
            }}
            onMouseEnter={() => setFocusedIndex(idx)}
            className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
              item.disabled
                ? 'opacity-40 cursor-not-allowed text-[var(--text-muted)]'
                : item.danger
                ? isFocused
                  ? 'bg-rose-500 text-white'
                  : 'text-rose-400 hover:bg-rose-500 hover:text-white'
                : isFocused
                ? 'bg-accent-primary text-white'
                : 'text-[var(--text-primary)] hover:bg-accent-primary hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2 truncate">
              {Icon && (
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    item.danger && !isFocused ? 'text-rose-400' : ''
                  }`}
                />
              )}
              <span className="truncate">{item.label}</span>
            </div>

            {item.shortcut && (
              <span
                className={`text-[10px] font-mono tracking-wider ml-3 ${
                  isFocused ? 'text-white/80' : 'text-[var(--text-muted)]'
                }`}
              >
                {item.shortcut}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
