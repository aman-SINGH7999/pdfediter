'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';

export default function PDFViewer() {
  const [pdfFile, setPdfFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [signatureImg, setSignatureImg] = useState(null);
  const [addingType, setAddingType] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawing, setCurrentDrawing] = useState([]);
  const [pageDimensions, setPageDimensions] = useState({});
  const [editingTextId, setEditingTextId] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const canvasRefs = useRef({});

  // === Undo/Redo Helpers ===
  const saveState = useCallback((newState) => {
    setUndoStack(prev => [...prev, signatures]);
    setRedoStack([]);
    setSignatures(newState);
  }, [signatures]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, signatures]);
    setSignatures(last);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, signatures]);
    setSignatures(next);
  };

  // === Handlers ===
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file?.type === 'application/pdf') {
      setPdfFile(file);
      setSignatures([]);
      setPageDimensions({});
      setUndoStack([]);
      setRedoStack([]);
    }
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files[0];
    if (file) setSignatureImg(URL.createObjectURL(file));
  };

  const handlePageClick = (pageNum, e) => {
    if (!addingType) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pageDim = pageDimensions[pageNum];
    if (!pageDim || x < 0 || y < 0 || x > pageDim.width || y > pageDim.height) return;

    if (addingType === 'signature' && signatureImg) {
      saveState([
        ...signatures,
        { id: Date.now(), page: pageNum, x, y, type: 'signature', content: signatureImg },
      ]);
      setAddingType(null);
    } else if (addingType === 'text') {
      const newTextId = Date.now();
      saveState([
        ...signatures,
        { id: newTextId, page: pageNum, x, y, type: 'text', content: 'Double-click to edit' },
      ]);
      setAddingType(null);
      setEditingTextId(newTextId);
    }
  };

  // === Drawing Handlers ===
  const startDrawing = (pageNum, e) => {
    if (addingType !== 'draw') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setCurrentDrawing([{ x, y }]);
  };

  const draw = (pageNum, e) => {
    if (!isDrawing || addingType !== 'draw') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentDrawing((prev) => [...prev, { x, y }]);

    const canvas = canvasRefs.current[pageNum];
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const points = [...currentDrawing, { x, y }];
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[points.length - 2].x, points[points.length - 2].y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = (pageNum) => {
    if (!isDrawing || addingType !== 'draw') return;
    if (currentDrawing.length > 1) {
      saveState([
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
  };

  const removeItem = (id) => {
    const newState = signatures.filter(s => s.id !== id);
    saveState(newState);
  };

  const updateTextContent = (id, newText) => {
    const newState = signatures.map(s => s.id === id ? { ...s, content: newText } : s);
    saveState(newState);
    setEditingTextId(null);
  };

  // === DOWNLOAD PDF ===
  const downloadPDF = useCallback(async () => {
    if (!pdfFile || !numPages) return;

    const { jsPDF } = await import('jspdf');
    const loadingTask = pdfjs.getDocument(URL.createObjectURL(pdfFile));
    const pdfDoc = await loadingTask.promise;

    const firstPage = await pdfDoc.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const pdfWidth = viewport.width;
    const pdfHeight = viewport.height;

    const doc = new jsPDF({
      orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
      unit: 'px',
      format: [pdfWidth, pdfHeight],
    });

    for (let i = 1; i <= numPages; i++) {
      if (i > 1) doc.addPage([pdfWidth, pdfHeight]);

      const page = await pdfDoc.getPage(i);
      const scale = 2;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;

      const imgData = canvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

      const items = signatures.filter((s) => s.page === i);
      const pageDim = pageDimensions[i];

      if (pageDim) {
        const scaleX = pdfWidth / pageDim.width;
        const scaleY = pdfHeight / pageDim.height;

        for (const item of items) {
          if (item.type === 'signature') {
            const img = new Image();
            img.src = item.content;
            await new Promise((resolve) => {
              img.onload = () => {
                doc.addImage(
                  img,
                  'PNG',
                  item.x * scaleX,
                  item.y * scaleY,
                  100 * scaleX,
                  50 * scaleY,
                  undefined,
                  'NONE'
                );
                resolve();
              };
            });
          } else if (item.type === 'text') {
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text(item.content, item.x * scaleX, item.y * scaleY + 12);
          } else if (item.type === 'drawing') {
            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(1);
            const points = item.content;
            for (let j = 1; j < points.length; j++) {
              doc.line(
                points[j - 1].x * scaleX,
                points[j - 1].y * scaleY,
                points[j].x * scaleX,
                points[j].y * scaleY
              );
            }
          }
        }
      }
    }

    doc.save('signed-document.pdf');
  }, [pdfFile, numPages, signatures, pageDimensions]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">PDF Editor & Signature Tool</h1>
          <p className="text-gray-600">Upload, sign, annotate, and download your PDF documents</p>

          {/* Upload */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">📄 Upload PDF</label>
              <input type="file" accept=".pdf" onChange={handleFileChange} className="w-full p-2 border rounded" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">✍️ Upload Signature</label>
              <input type="file" accept="image/*" onChange={handleSignatureUpload} className="w-full p-2 border rounded" />
            </div>
          </div>

          {/* Tools */}
          <div className="border-t pt-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAddingType(addingType === 'signature' ? null : 'signature')}
                disabled={!signatureImg}
                className={`px-4 py-2 rounded font-medium ${
                  addingType === 'signature'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                } disabled:opacity-50`}
              >
                ✍️ Signature
              </button>
              <button
                onClick={() => setAddingType(addingType === 'text' ? null : 'text')}
                className={`px-4 py-2 rounded font-medium ${
                  addingType === 'text'
                    ? 'bg-green-600 text-white'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                ✏️ Text
              </button>
              <button
                onClick={() => setAddingType(addingType === 'draw' ? null : 'draw')}
                className={`px-4 py-2 rounded font-medium ${
                  addingType === 'draw'
                    ? 'bg-purple-600 text-white'
                    : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                }`}
              >
                🖊️ Draw
              </button>

              <button
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className="px-4 py-2 rounded font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                ↶ Undo
              </button>
              <button
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="px-4 py-2 rounded font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                ↷ Redo
              </button>

              <button
                onClick={downloadPDF}
                disabled={!pdfFile}
                className="px-4 py-2 rounded font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 ml-auto"
              >
                📥 Download PDF
              </button>
            </div>
            {addingType && (
              <p className="mt-2 text-sm text-yellow-700 bg-yellow-100 p-2 rounded">
                {addingType === 'draw' ? '🖊️ Click and drag to draw' : `→ Click on PDF to place ${addingType}`}
              </p>
            )}
          </div>
        </div>

        {/* PDF Viewer — Fixed container */}
        {pdfFile ? (
          <div className="bg-white rounded-2xl shadow-xl p-6 overflow-auto max-w-full">
            <Document file={pdfFile} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              {Array.from({ length: numPages }, (_, i) => {
                const pageNum = i + 1;
                const items = signatures.filter((s) => s.page === pageNum);
                return (
                  <div key={`page_${pageNum}`} className="mb-8 last:mb-0 inline-block">
                    <div className="mb-2 flex justify-between">
                      <span className="text-sm font-medium">Page {pageNum}</span>
                      {addingType === 'draw' && (
                        <button
                          onClick={() => clearCanvas(pageNum)}
                          className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div
                      className="relative inline-block border rounded overflow-hidden shadow"
                      style={{ cursor: addingType ? 'crosshair' : 'default' }}
                      onClick={(e) => addingType !== 'draw' && handlePageClick(pageNum, e)}
                      onMouseDown={(e) => addingType === 'draw' && startDrawing(pageNum, e)}
                      onMouseMove={(e) => addingType === 'draw' && draw(pageNum, e)}
                      onMouseUp={() => addingType === 'draw' && stopDrawing(pageNum)}
                      onMouseLeave={() => addingType === 'draw' && stopDrawing(pageNum)}
                    >
                      <Page
                        pageNumber={pageNum}
                        scale={1.2}
                        onLoadSuccess={(page) => {
                          setPageDimensions((prev) => ({
                            ...prev,
                            [pageNum]: { width: page.width, height: page.height },
                          }));
                        }}
                      />
                      {pageDimensions[pageNum] && (
                        <canvas
                          ref={(el) => (canvasRefs.current[pageNum] = el)}
                          width={pageDimensions[pageNum].width}
                          height={pageDimensions[pageNum].height}
                          className="absolute top-0 left-0 pointer-events-none"
                        />
                      )}
                      <div className="absolute inset-0 pointer-events-none">
                        {items.map((item) => (
                          <div key={item.id} className="absolute group">
                            {item.type === 'signature' && (
                              <div style={{ left: item.x, top: item.y }} className="relative">
                                <img src={item.content} alt="sig" className="w-28 h-auto" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeItem(item.id);
                                  }}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 pointer-events-auto"
                                >
                                  ×
                                </button>
                              </div>
                            )}
                            {item.type === 'text' && (
                              <div
                                style={{ left: item.x, top: item.y }}
                                className="relative inline-block"
                                onDoubleClick={() => setEditingTextId(item.id)}
                              >
                                {editingTextId === item.id ? (
                                  <input
                                    type="text"
                                    defaultValue={item.content}
                                    autoFocus
                                    className="px-2 py-1 border-2 border-blue-500 rounded focus:outline-none"
                                    onBlur={(e) => updateTextContent(item.id, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        updateTextContent(item.id, e.target.value);
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ minWidth: '100px' }}
                                  />
                                ) : (
                                  <div className="px-2 py-1 bg-yellow-100 border border-yellow-400 rounded text-sm cursor-pointer">
                                    {item.content}
                                  </div>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeItem(item.id);
                                  }}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 pointer-events-auto"
                                >
                                  ×
                                </button>
                              </div>
                            )}
                            {item.type === 'drawing' && (
                              <svg
                                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                                style={{ width: '100%', height: '100%' }}
                              >
                                <polyline
                                  points={item.content.map((p) => `${p.x},${p.y}`).join(' ')}
                                  fill="none"
                                  stroke="#2563eb"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Document>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <div className="text-5xl mb-4">📄</div>
            <h3 className="text-xl font-semibold">Upload a PDF to begin</h3>
          </div>
        )}
      </div>
    </div>
  );
}