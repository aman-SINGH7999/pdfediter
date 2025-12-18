// components/PDFViewerWrapper.tsx
'use client';

import dynamic from 'next/dynamic';
import React from 'react';

const PDFViewerClient = dynamic(() => import('./PDFViewerClient'), {
  ssr: false, // ✅ Important: Disable SSR
  loading: () => (
    <div className="bg-white rounded-2xl shadow-xl p-16 text-center">
      <div className="animate-pulse text-5xl mb-4">📄</div>
      <p className="text-gray-500">Loading PDF editor...</p>
    </div>
  ),
});

export default function PDFViewerWrapper() {
  return <PDFViewerClient />;
}