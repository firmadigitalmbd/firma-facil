import { PDFDocument } from "pdf-lib";

/**
 * Inserta una imagen de firma (PNG en base64) dentro de un PDF, en la
 * posición indicada como fracciones (0 a 1) relativas al tamaño de la
 * página. box_y se mide desde ARRIBA de la página (como en pantalla),
 * por eso se convierte al sistema de coordenadas de PDF (que mide desde
 * abajo).
 */
export async function embedSignatureInPdf(params: {
  pdfBytes: Uint8Array | ArrayBuffer;
  signaturePngBase64: string; // data URL o base64 puro
  page: number; // 1-indexado
  x: number; // fracción 0-1
  y: number; // fracción 0-1, desde arriba
  width: number; // fracción 0-1
  height: number; // fracción 0-1
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(params.pdfBytes);
  const pages = pdfDoc.getPages();
  const pageIndex = Math.min(Math.max(params.page - 1, 0), pages.length - 1);
  const targetPage = pages[pageIndex];
  const { width: pageWidth, height: pageHeight } = targetPage.getSize();

  const base64 = params.signaturePngBase64.includes(",")
    ? params.signaturePngBase64.split(",")[1]
    : params.signaturePngBase64;
  const pngBytes = Buffer.from(base64, "base64");
  const pngImage = await pdfDoc.embedPng(pngBytes);

  const boxWidthPt = params.width * pageWidth;
  const boxHeightPt = params.height * pageHeight;
  const boxXPt = params.x * pageWidth;
  // y viene desde arriba; PDF mide desde abajo, así que:
  const boxYPtFromTop = params.y * pageHeight;
  const boxYPt = pageHeight - boxYPtFromTop - boxHeightPt;

  targetPage.drawImage(pngImage, {
    x: boxXPt,
    y: boxYPt,
    width: boxWidthPt,
    height: boxHeightPt,
  });

  return pdfDoc.save();
}
