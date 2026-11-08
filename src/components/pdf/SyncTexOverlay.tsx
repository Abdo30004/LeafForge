import React, { useEffect, useState } from 'react';
import type { SyncTexCoordinate } from '../../types/latex';

export interface SyncTexOverlayProps {
  coordinate: SyncTexCoordinate | null;
  scale: number;
  pageWidth: number;
  pageHeight: number;
}

export const SyncTexOverlay: React.FC<SyncTexOverlayProps> = ({
  coordinate,
  scale,
  pageWidth: _pageWidth,
  pageHeight: _pageHeight,
}) => {
  const [visible, setVisible] = useState(coordinate !== null);

  useEffect(() => {
    if (!coordinate) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
    }, 1400);

    return () => clearTimeout(timer);
  }, [coordinate]);

  if (!visible || !coordinate) return null;

  // In PDF coordinates:
  // Usually SyncTeX returns coordinates with origin top-left or bottom-left depending on driver.
  // Standard PDF.js viewport has top-left (0,0) and scale applied.
  const left = coordinate.x * scale;
  const top = coordinate.y * scale;
  const width = Math.max(coordinate.width * scale, 40);
  const height = Math.max(coordinate.height * scale, 16);

  return (
    <div
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
      className="absolute z-30 pointer-events-none rounded border-2 border-amber-400 bg-amber-400/30 shadow-[0_0_15px_rgba(251,191,36,0.5)] ring-4 ring-amber-400/20 animate-pulse transition-all duration-300"
      data-testid="synctex-highlight-overlay"
    />
  );
};
