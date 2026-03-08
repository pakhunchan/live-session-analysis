import React from 'react';
import DevPanel from './components/DevPanel';

export default function App() {
  return (
    <div style={{ padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Live Session Analysis</h1>
      <DevPanel />
    </div>
  );
}
