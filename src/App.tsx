import React from 'react';

export default function App(): React.JSX.Element {
  return (
    <div className="flex h-screen w-screen flex-col bg-canvas text-primary">
      <main className="flex-1 flex items-center justify-center">
        <h1 className="text-xl font-semibold tracking-tight text-accent-primary">LeafForge IDE</h1>
      </main>
    </div>
  );
}
