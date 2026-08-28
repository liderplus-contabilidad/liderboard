/**
 * READING A LOGO FROM DISK — the half that touches the DOM, and that is why it is separated from
 * `logos.ts`.
 *
 * Vitest only runs the pure layer, so this split is not a matter of style: everything that can be
 * WRONG —what is rejected, how big the box is, how it is decoded— lives in `logos.ts`, which is
 * tested, and what is left here is only the canvas mechanics, which either work or draw nothing.
 *
 * **It is resized on the way in, not on the way out.** The original can weigh up to 2 MB, and storing
 * it as it is would make the dropdown —which lists ALL clients— load every original each time it is
 * opened. Reduced to `LOGO_MAX_SIDE` it comes down to the order of 100 KB, which is what allows
 * storing it in the client's own row instead of in a separate table.
 *
 * **An SVG goes in and comes out PNG.** Neither exceljs nor pdf-lib embeds it, but the canvas does
 * rasterize it, and doing it here is what saves the user from having to know what format their logo
 * ends up in.
 */
import { checkLogoFile, LOGO_MAX_SIDE, type EntityLogo, type LogoMime } from "@/lib/logos";

/** What a rejection says, in the same words as `checkLogoFile`. */
export class LogoFileError extends Error {}

/**
 * The format it is STORED in. A PNG stays PNG because it can carry transparency, and a JPEG stays
 * JPEG because re-encoding a photo to PNG multiplies its weight. Everything else —today only SVG—
 * lands as PNG, which is the one that keeps the transparent background almost every vector logo
 * brings.
 */
function storedMime(type: string): LogoMime {
  return type === "image/jpeg" ? "image/jpeg" : "image/png";
}

/**
 * An SVG may not declare an intrinsic size, and then `naturalWidth` comes out 0 in some browsers. It
 * is rasterized onto a square canvas of the maximum side instead of failing: an overly square logo is
 * infinitely better than a logo that cannot be uploaded.
 */
function intrinsicSize(image: HTMLImageElement): { width: number; height: number } {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width > 0 && height > 0) {
    return { width, height };
  }
  return { width: LOGO_MAX_SIDE, height: LOGO_MAX_SIDE };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new LogoFileError("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new LogoFileError("El archivo no es una imagen válida."));
    image.src = source;
  });
}

/**
 * The user's file turned into the `EntityLogo` that gets stored: validated, reduced to
 * `LOGO_MAX_SIDE` on its longer side and with its final dimensions measured ONCE, which is what lets
 * the payslip's layout place it without decoding it again.
 */
export async function readLogoFile(file: File): Promise<EntityLogo> {
  const check = checkLogoFile({ type: file.type, size: file.size });
  if (!check.ok) {
    throw new LogoFileError(check.message);
  }

  const source = await readAsDataUrl(file);
  const image = await loadImage(source);
  const intrinsic = intrinsicSize(image);

  // The same `contain` as `fitLogoBox`, but against a square and rounded to whole pixels: a canvas
  // 45.3 px tall does not exist, and the dimensions that are stored have to be the ones the image
  // really has.
  const scale = Math.min(LOGO_MAX_SIDE / intrinsic.width, LOGO_MAX_SIDE / intrinsic.height, 1);
  const width = Math.max(1, Math.round(intrinsic.width * scale));
  const height = Math.max(1, Math.round(intrinsic.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new LogoFileError("No se pudo procesar la imagen.");
  }
  context.drawImage(image, 0, 0, width, height);

  const mime = storedMime(file.type);
  return {
    // A JPEG is re-encoded at 92%: below that, artefacts show on a logo's hard edges.
    dataUrl: canvas.toDataURL(mime, 0.92),
    mime,
    width,
    height,
  };
}
