"use client";

import { useEffect, useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Rnd } from "react-rnd";

// Worker de pdf.js servido desde un CDN permitido, para no tener que
// empaquetarlo manualmente con Next.js.
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export type SignatureBox = {
  page: number;
  xFrac: number;
  yFrac: number;
  widthFrac: number;
  heightFrac: number;
};

const PAGE_WIDTH = 560;

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
