"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// Servimos el worker desde el propio dominio (en vez de un CDN externo)
// porque algunos navegadores integrados (Gmail, etc. en celular) bloquean
// la carga de workers desde otro origen.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).toString();

const PAGE_WIDTH = 560;

export default function PdfSignatureViewer({
  fileUrl,
  boxPage,
  boxX,
  boxY,
  boxWidth,
  boxHeight,
  boxDisabled,
  boxDone,
  onBoxClick,
}: {
  fileUrl: string;
  boxPage: number;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  boxDisabled: boolean;
  boxDone: boolean;
  onBoxClick: () => void;
}) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(boxPage);
  const [pageSize, setPageSize] = useState({
    width: PAGE_WIDTH,
    height: PAGE_WIDTH * 1.41,
  });

  return (
    <div>
      <div
        className="pdf-page-wrap"
        style={{ width: pageSize.width, height: pageSize.height }}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
          loading={<p>Cargando documento...</p>}
        >
          <Page
            pageNumber={pageNumber}
            width={PAGE_WIDTH}
            onLoadSuccess={(page) => {
              const viewport = page.getViewport({ scale: 1 });
              const scale = PAGE_WIDTH / viewport.width;
              setPageSize({ width: PAGE_WIDTH, height: viewport.height * scale });
            }}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>

        {pageNumber === boxPage && (
          <div
            role="button"
            onClick={onBoxClick}
            className={`sign-box-overlay${boxDisabled ? " sign-box-disabled" : ""}${
              boxDone ? " sign-box-done" : ""
            }`}
            style={{
              left: boxX * pageSize.width,
              top: boxY * pageSize.height,
              width: boxWidth * pageSize.width,
              height: boxHeight * pageSize.height,
            }}
          >
            {boxDone ? "Firmado ✓" : "Toca aquí para firmar"}
          </div>
        )}
      </div>

      {numPages > 1 && (
        <div className="toolbar">
          <button
            type="button"
            className="secondary"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          >
            ← Página anterior
          </button>
          <span>
            Página {pageNumber} de {numPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
          >
            Página siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
