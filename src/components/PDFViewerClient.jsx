'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';

export default function PDFViewerClient() {
  const [pdfFile, setPdfFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [signatureImg, setSignatureImg] = useState(null);
  const [addingType, setAddingType] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawing, setCurrentDrawing] = useState([]);
  const [pageDimensions, setPageDimensions] = useState({});
  const [renderScale] = useState(1.5);
  const canvasRefs = useRef({});

  // ✅ UNDO HISTORY
  const [signatureHistory, setSignatureHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // ✅ Helper to manage history + update signatures
  const updateSignatures = useCallback((newSignatures) => {
    const newHistory = signatureHistory.slice(0, historyIndex + 1);
    newHistory.push(newSignatures);
    setSignatureHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setSignatures(newSignatures);
  }, [signatureHistory, historyIndex]);

  // ✅ Cleanup blob URL on unmount or new signature
  useEffect(() => {
    return () => {
      if (signatureImg) URL.revokeObjectURL(signatureImg);
    };
  }, [signatureImg]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file?.type === 'application/pdf') {
      setPdfFile(file);
      setSignatures([]);
      setPageDimensions({});
      setSignatureHistory([[]]);
      setHistoryIndex(0);
    }
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (signatureImg) URL.revokeObjectURL(signatureImg);
      setSignatureImg(URL.createObjectURL(file));
    }
  };

  const handlePageClick = (pageNum, e) => {
    if (!addingType || addingType === 'draw') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pageDim = pageDimensions[pageNum];
    if (!pageDim || x < 0 || y < 0 || x > pageDim.width * renderScale || y > pageDim.height * renderScale) return;

    const normalizedX = x / (pageDim.width * renderScale);
    const normalizedY = y / (pageDim.height * renderScale);

    if (addingType === 'signature' && signatureImg) {
      updateSignatures([
        ...signatures,
        { 
          id: Date.now(), 
          page: pageNum, 
          x: normalizedX, 
          y: normalizedY, 
          type: 'signature', 
          content: signatureImg 
        },
      ]);
      setAddingType(null);
    } else if (addingType === 'text') {
      updateSignatures([
        ...signatures,
        { 
          id: Date.now(), 
          page: pageNum, 
          x: normalizedX, 
          y: normalizedY, 
          type: 'text', 
          content: '', 
          editing: true 
        },
      ]);
      setAddingType(null);
    }
  };

  const startDrawing = (pageNum, e) => {
    if (addingType !== 'draw') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pageDim = pageDimensions[pageNum];
    if (!pageDim) return;

    const normalizedX = x / (pageDim.width * renderScale);
    const normalizedY = y / (pageDim.height * renderScale);

    setIsDrawing(true);
    setCurrentDrawing([{ x: normalizedX, y: normalizedY }]);
  };

  const draw = (pageNum, e) => {
    if (!isDrawing || addingType !== 'draw') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pageDim = pageDimensions[pageNum];
    if (!pageDim) return;

    const normalizedX = x / (pageDim.width * renderScale);
    const normalizedY = y / (pageDim.height * renderScale);

    setCurrentDrawing((prev) => [...prev, { x: normalizedX, y: normalizedY }]);

    const canvas = canvasRefs.current[pageNum];
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const points = [...currentDrawing, { x: normalizedX, y: normalizedY }];
      
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (points.length > 1) {
        const prev = points[points.length - 2];
        const curr = points[points.length - 1];
        ctx.beginPath();
        ctx.moveTo(prev.x * pageDim.width * renderScale, prev.y * pageDim.height * renderScale);
        ctx.lineTo(curr.x * pageDim.width * renderScale, curr.y * pageDim.height * renderScale);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = (pageNum) => {
    if (!isDrawing || addingType !== 'draw') return;
    if (currentDrawing.length > 1) {
      updateSignatures([
        ...signatures,
        { id: Date.now(), page: pageNum, type: 'drawing', content: [...currentDrawing] },
      ]);
    }
    setIsDrawing(false);
    setCurrentDrawing([]);
  };

  const clearCanvas = (pageNum) => {
    const canvas = canvasRefs.current[pageNum];
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    updateSignatures(signatures.filter(s => !(s.page === pageNum && s.type === 'drawing')));
  };

  const removeItem = (id) => {
    updateSignatures(signatures.filter((s) => s.id !== id));
  };

  // ✅ UNDO FUNCTION
  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setSignatures(signatureHistory[newIndex]);
      setHistoryIndex(newIndex);
    }
  };

  const downloadPDF = useCallback(async () => {
    if (!pdfFile || !numPages) return;

    const { jsPDF } = await import('jspdf');
    
    const loadingTask = pdfjs.getDocument(URL.createObjectURL(pdfFile));
    const pdfDoc = await loadingTask.promise;

    const firstPage = await pdfDoc.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const pdfWidth = viewport.width;
    const pdfHeight = viewport.height;

    const mmWidth = (pdfWidth * 25.4) / 72;
    const mmHeight = (pdfHeight * 25.4) / 72;

    const doc = new jsPDF({
      orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [mmWidth, mmHeight],
    });

    const outputScale = 2;

    for (let i = 1; i <= numPages; i++) {
      if (i > 1) {
        doc.addPage([mmWidth, mmHeight]);
      }

      const page = await pdfDoc.getPage(i);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const viewport = page.getViewport({ scale: outputScale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({ canvasContext: ctx, viewport }).promise;

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      doc.addImage(imgData, 'JPEG', 0, 0, mmWidth, mmHeight);

      const items = signatures.filter((s) => s.page === i);
      
      for (const item of items) {
        if (item.type === 'signature') {
          const img = new Image();
          img.src = item.content;
          await new Promise((resolve) => {
            img.onload = () => {
              const xPos = item.x * mmWidth;
              const yPos = item.y * mmHeight;
              const sigWidth = mmWidth * 0.15;
              const sigHeight = sigWidth * 0.5;
              
              doc.addImage(img, 'PNG', xPos, yPos, sigWidth, sigHeight);
              resolve();
            };
            img.onerror = resolve;
          });
        } else if (item.type === 'text') {
          const xPos = item.x * mmWidth;
          const yPos = item.y * mmHeight;
          
          doc.setFontSize(12);
          doc.setTextColor(0, 0, 0);
          doc.text(item.content, xPos, yPos + 4, { maxWidth: 0, baseline: 'top' });
        } else if (item.type === 'drawing') {
          doc.setDrawColor(37, 99, 235);
          doc.setLineWidth(0.3);
          
          const points = item.content;
          for (let j = 1; j < points.length; j++) {
            const x1 = points[j - 1].x * mmWidth;
            const y1 = points[j - 1].y * mmHeight;
            const x2 = points[j].x * mmWidth;
            const y2 = points[j].y * mmHeight;
            
            doc.line(x1, y1, x2, y2);
          }
        }
      }
    }

    doc.save('signed-document.pdf');
  }, [pdfFile, numPages, signatures]);

  return (
  <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-6">
    <div className="max-w-6xl mx-auto">
      {/* ✅ FIXED & COMPACT HEADER */}
      <div 
        className="bg-white rounded-2xl shadow-xl p-4 mb-4 sticky top-0 z-10"
        style={{ 
          maxHeight: '200px',
          overflowY: 'auto' // in case content overflows on small screens
        }}
      >
        <h1 className="text-xl font-bold text-gray-800 mb-1">PDF Editor</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">📄 Upload PDF</label>
            <input 
              type="file" 
              accept=".pdf" 
              onChange={handleFileChange} 
              className="w-full text-xs file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">✍️ Upload Signature</label>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleSignatureUpload} 
              className="w-full text-xs file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer"
            />
          </div>
        </div>

        <div className="border-t pt-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setAddingType(addingType === 'signature' ? null : 'signature')}
              disabled={!signatureImg || !pdfFile}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                addingType === 'signature'
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              ✍️ Signature
            </button>
            <button
              onClick={() => setAddingType(addingType === 'text' ? null : 'text')}
              disabled={!pdfFile}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                addingType === 'text'
                  ? 'bg-green-600 text-white shadow'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              ✏️ Text
            </button>
            <button
              onClick={() => setAddingType(addingType === 'draw' ? null : 'draw')}
              disabled={!pdfFile}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                addingType === 'draw'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              🖊️ Draw
            </button>
            <button
              onClick={handleUndo}
              disabled={historyIndex === 0 || !pdfFile}
              className="px-3 py-1.5 text-xs rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ↩️ Undo
            </button>
            <button
              onClick={downloadPDF}
              disabled={!pdfFile}
              className="px-3 py-1.5 text-xs rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 shadow disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              📥 Download
            </button>
          </div>
          {addingType && (
            <div className="mt-2 p-2 bg-yellow-50 border-l-2 border-yellow-400 rounded text-xs text-yellow-800">
              {addingType === 'draw' 
                ? '🖊️ Click and drag to draw' 
                : `→ Click on PDF to place ${addingType}`}
            </div>
          )}
        </div>
      </div>

      {/* ✅ SCROLLABLE PDF VIEWER (no header scroll) */}
      <div className="pb-8">
        {pdfFile ? (
          <div className="bg-white rounded-2xl shadow-xl p-4">
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                <Document file={pdfFile} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                  {Array.from({ length: numPages }, (_, i) => {
                    const pageNum = i + 1;
                    const items = signatures.filter((s) => s.page === pageNum);
                    const pageDim = pageDimensions[pageNum];
                    
                    return (
                      <div key={`page_${pageNum}`} className="mb-6 last:mb-0">
                        <div className="mb-2 flex justify-between items-center">
                          <span className="text-xs font-medium text-gray-600">
                            Page {pageNum} of {numPages}
                          </span>
                          {addingType === 'draw' && (
                            <button
                              onClick={() => clearCanvas(pageNum)}
                              className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full hover:bg-red-200"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div
                          className="relative inline-block border border-gray-200 rounded-lg overflow-hidden shadow bg-white max-w-full"
                          style={{ cursor: addingType ? 'crosshair' : 'default' }}
                          onClick={(e) => addingType !== 'draw' && handlePageClick(pageNum, e)}
                          onMouseDown={(e) => addingType === 'draw' && startDrawing(pageNum, e)}
                          onMouseMove={(e) => addingType === 'draw' && draw(pageNum, e)}
                          onMouseUp={() => addingType === 'draw' && stopDrawing(pageNum)}
                          onMouseLeave={() => addingType === 'draw' && stopDrawing(pageNum)}
                        >
                          <Page
                            pageNumber={pageNum}
                            scale={renderScale}
                            onLoadSuccess={(page) => {
                              setPageDimensions((prev) => ({
                                ...prev,
                                [pageNum]: { 
                                  width: page.originalWidth, 
                                  height: page.originalHeight 
                                },
                              }));
                            }}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                          />
                          
                          {pageDim && (
                            <canvas
                              ref={(el) => (canvasRefs.current[pageNum] = el)}
                              width={pageDim.width * renderScale}
                              height={pageDim.height * renderScale}
                              className="absolute top-0 left-0 pointer-events-none"
                              style={{ width: '100%', height: '100%' }}
                            />
                          )}
                          
                          <div className="absolute inset-0 pointer-events-none">
                            {pageDim && items.map((item) => {
                              const displayX = item.x * pageDim.width * renderScale;
                              const displayY = item.y * pageDim.height * renderScale;
                              
                              return (
                                <div key={item.id} className="absolute group">
                                  {item.type === 'signature' && (
                                    <div style={{ left: displayX, top: displayY }} className="relative">
                                      <img 
                                        src={item.content} 
                                        alt="signature" 
                                        style={{ 
                                          width: pageDim.width * renderScale * 0.15,
                                          height: 'auto'
                                        }} 
                                      />
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeItem(item.id);
                                        }}
                                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[9px] opacity-0 group-hover:opacity-100 pointer-events-auto hover:bg-red-600 transition-opacity"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  )}
                                  {item.type === 'text' && (
                                    <div style={{ left: displayX, top: displayY }} className="absolute">
                                      {item.editing ? (
                                        <input
                                          autoFocus
                                          defaultValue=""
                                          onBlur={(e) => {
                                            const newText = e.target.value.trim();
                                            if (newText) {
                                              updateSignatures(signatures.map(s =>
                                                s.id === item.id ? { ...s, content: newText, editing: false } : s
                                              ));
                                            } else {
                                              updateSignatures(signatures.filter(s => s.id !== item.id));
                                            }
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') e.target.blur();
                                          }}
                                          className="px-1.5 py-0.5 border border-blue-400 rounded text-xs bg-white"
                                          style={{ minWidth: '60px' }}
                                        />
                                      ) : (
                                        <div
                                          className="px-2 py-1 bg-yellow-100 border border-yellow-400 rounded text-xs font-medium relative"
                                          style={{
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            maxWidth: '180px'
                                          }}
                                        >
                                          {item.content}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removeItem(item.id);
                                            }}
                                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[9px] opacity-0 group-hover:opacity-100 pointer-events-auto hover:bg-red-600 transition-opacity"
                                          >
                                            ×
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {item.type === 'drawing' && (
                                    <svg
                                      className="absolute top-0 left-0 w-full h-full pointer-events-none"
                                      style={{ width: '100%', height: '100%' }}
                                    >
                                      <polyline
                                        points={item.content.map((p) => 
                                          `${p.x * pageDim.width * renderScale},${p.y * pageDim.height * renderScale}`
                                        ).join(' ')}
                                        fill="none"
                                        stroke="#2563eb"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Document>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <div className="text-5xl mb-3">📄</div>
            <h3 className="text-lg font-semibold text-gray-700">No PDF Loaded</h3>
            <p className="text-gray-500 text-sm">Upload a PDF to get started</p>
          </div>
        )}
      </div>
    </div>
  </div>
);
}


