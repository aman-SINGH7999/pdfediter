// src/app/page.js
'use client'; // 👈 Ye line add karo (pehli line honi chahiye)

import PDFViewer from '@/components/PDFViewer';
import PDFViewerClient from '@/components/PDFViewerClient';

export default function HomePage() {
  return (
    <div>
      <PDFViewerClient />
      {/* <PDFViewer /> */}
    </div>
  );
}