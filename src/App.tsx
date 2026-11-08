import React from 'react';
import { AppShell } from './components/layout/AppShell';
import { DetachedPdfWindow } from './components/pdf/DetachedPdfWindow';

export default function App(): React.JSX.Element {
  const isDetached =
    typeof window !== 'undefined' &&
    (window.location.search.includes('window=pdf') ||
      window.location.hash.includes('window=pdf'));

  if (isDetached) {
    return <DetachedPdfWindow />;
  }

  return <AppShell />;
}
