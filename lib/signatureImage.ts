// Utilidades de navegador para preparar la imagen de firma antes de
// enviarla al servidor. Todo termina como PNG con fondo transparente y
// recortado al contenido, para que el servidor solo tenga que ajustarlo al
// recuadro manteniendo la proporción.

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
];
export const ACCEPTED_IMAGE_LABEL = "JPG, PNG, WEBP, GIF o BMP";

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
// Las fotos de celular pesan varios MB y Vercel rechaza peticiones de más
// de ~4.5 MB; a este tamaño la firma sigue viéndose nítida en el PDF.
const MAX_SIDE_PX = 1200;

export async function imageFileToSignaturePng(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      `Solo se permiten imágenes (${ACCEPTED_IMAGE_LABEL}). El archivo "${file.name}" no es un formato válido.`
    );
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("La imagen es demasiado grande (máximo 15 MB).");
  }

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);

  removeLightBackground(ctx, width, height);

  const png = trimCanvasToPng(canvas);
  if (!png) {
    throw new Error(
      "No se encontró una firma en la imagen. Usa una foto con la firma en tinta oscura sobre fondo claro."
    );
  }
  return png;
}

// Recorta el lienzo al área que tiene trazos (píxeles no transparentes),
// con un pequeño margen. Devuelve null si el lienzo está vacío.
export function trimCanvasToPng(source: HTMLCanvasElement): string | null {
  const ctx = source.getContext("2d")!;
  const { width, height } = source;
  const { data } = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;

  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03) + 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out
    .getContext("2d")!
    .drawImage(source, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen. Prueba con otro archivo."));
    };
    img.src = url;
  });
}

// Vuelve transparente el papel. El tono del fondo se estima con el brillo
// que tiene la mayoría de los píxeles (percentil 75), así funciona también
// con fotos de papel grisáceo; entre el fondo y la tinta se hace una
// transición suave para que los bordes del trazo no queden dentados.
function removeLightBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const pixelCount = width * height;

  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    histogram[luminance(data[i], data[i + 1], data[i + 2])]++;
  }
  let background = 255;
  let seen = 0;
  for (let l = 0; l < 256; l++) {
    seen += histogram[l];
    if (seen >= pixelCount * 0.75) {
      background = l;
      break;
    }
  }
  // Si la imagen es mayormente oscura no es una firma sobre papel claro;
  // se deja tal cual para no borrar contenido.
  if (background < 150) return;

  const opaqueBelow = Math.max(0, background - 70);
  const clearAbove = background - 15;
  for (let i = 0; i < data.length; i += 4) {
    const l = luminance(data[i], data[i + 1], data[i + 2]);
    if (l >= clearAbove) {
      data[i + 3] = 0;
    } else if (l > opaqueBelow) {
      data[i + 3] = Math.round(data[i + 3] * ((clearAbove - l) / (clearAbove - opaqueBelow)));
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function luminance(r: number, g: number, b: number) {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}
