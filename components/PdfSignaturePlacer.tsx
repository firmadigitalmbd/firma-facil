"use client";

import { useEffect, useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Rnd } from "react-rnd";

// Servimos el worker desde el propio dominio (en vez de un CDN externo)
// porque algunos navegadores integrados (Gmail, etc. en celular) bloquean
// la carga de workers desde otro origen.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).toString();

export type SignatureBox = {
  page: number;
  xFrac: number;
  yFrac: number;
  widthFrac: number;
  heightFrac: number;
};

const PAGE_WIDTH = 560;

const corner = {
  width: 14,
  height: 14,
  borderRadius: "50%",
  background: "#2563eb",
  border: "2px solid #fff",
  boxShadow: "0 0 0 1px #2563eb",
};
const edge = {
  background: "#2563eb",
  opacity: 0.6,
};
const RESIZE_HANDLE_STYLES = {
  topLeft: { ...corner, marginLeft: -7, marginTop: -7 },
  topRight: { ...corner, marginRight: -7, marginTop: -7 },
  bottomLeft: { ...corner, marginLeft: -7, marginBottom: -7 },
  bottomRight: { ...corner, marginRight: -7, marginBottom: -7 },
  top: { ...edge, height: 4, marginTop: -2 },
  bottom: { ...edge, height: 4, marginBottom: -2 },
  left: { ...edge, width: 4, marginLeft: -2 },
  right: { ...edge, width: 4, marginRight: -2 },
};

export default function PdfSignaturePlacer({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (box: SignatureBox) => void;
}) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState({ width: PAGE_WIDTH, height: PAGE_WIDTH * 1.41 });
  const [box, setBox] = useState({ x: 40, y: 40, width: 180, height: 70 });

  const emit = useCallback(
    (nextBox: typeof box, page: number, size: typeof pageSize) => {
      onChange({
        page,
        xFrac: nextBox.x / size.width,
        yFrac: nextBox.y / size.height,
        widthFrac: nextBox.width / size.width,
        heightFrac: nextBox.height / size.height,
      });
    },
    [onChange]
  );

  useEffect(() => {
    emit(box, pageNumber, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, pageNumber]);

  if (!file) return null;

  return (
    <div>
      <div
        className="pdf-page-wrap"
        style={{ width: pageSize.width, height: pageSize.height }}
      >
        <Document
          file={file}
          onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
          loading={<p>Cargando documento...</p>}
        >
          <Page
            pageNumber={pageNumber}
            width={PAGE_WIDTH}
            onLoadSuccess={(page) => {
              const viewport = page.getViewport({ scale: 1 });
              const scale = PAGE_WIDTH / viewport.width;
              setPageSize({
                width: PAGE_WIDTH,
                height: viewport.height * scale,
              });
            }}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>

        <Rnd
          size={{ width: box.width, height: box.height }}
          position={{ x: box.x, y: box.y }}
          bounds="parent"
          minWidth={40}
          minHeight={24}
          resizeHandleStyles={RESIZE_HANDLE_STYLES}
          onDragStop={(_e, d) => {
            const next = { ...box, x: d.x, y: d.y };
            setBox(next);
            emit(next, pageNumber, pageSize);
          }}
          onResizeStop={(_e, _dir, ref, _delta, pos) => {
            const next = {
              width: parseInt(ref.style.width, 10),
              height: parseInt(ref.style.height, 10),
              x: pos.x,
              y: pos.y,
            };
            setBox(next);
            emit(next, pageNumber, pageSize);
          }}
        >
          <div className="sign-box">Firma aquí</div>
        </Rnd>
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

      <p className="hint">
        Arrastra el recuadro azul a donde debe ir la firma y usa la esquina
        para agrandarlo o achicarlo.
      </p>
    </div>
  );
}
