/**
 * LEER UN LOGO DEL DISCO — la mitad que toca DOM, y por eso separada de `logos.ts`.
 *
 * Vitest solo corre la capa pura, así que esta partición no es de estilo: todo lo que puede estar
 * MAL —qué se rechaza, cuánto mide la caja, cómo se decodifica— vive en `logos.ts`, que sí se
 * prueba, y aquí queda únicamente la mecánica de canvas, que o funciona o no dibuja nada.
 *
 * **Se redimensiona al entrar, no al salir.** El original puede pesar hasta 2 MB, y guardarlo tal
 * cual haría que el desplegable —que lista TODOS los clientes— cargara todos los originales cada
 * vez que se abre. Reducido a `LOGO_MAX_SIDE` queda en el orden de los 100 KB, que es lo que
 * permite guardarlo en la propia fila del cliente en vez de en una tabla aparte.
 *
 * **El SVG entra y sale PNG.** Ni exceljs ni pdf-lib lo embeben, pero el canvas sí lo rasteriza, y
 * hacerlo aquí es lo que evita que el usuario tenga que saber en qué formato acaba su logo.
 */
import { checkLogoFile, LOGO_MAX_SIDE, type EntityLogo, type LogoMime } from "@/lib/logos";

/** Lo que un rechazo dice, con las mismas palabras que `checkLogoFile`. */
export class LogoFileError extends Error {}

/**
 * El formato en que se GUARDA. Un PNG sigue siendo PNG porque puede llevar transparencia, y un
 * JPEG sigue siendo JPEG porque re-codificar una foto a PNG multiplica su peso. Todo lo demás
 * —hoy solo el SVG— aterriza en PNG, que es el que conserva el fondo transparente que casi todo
 * logo vectorial trae.
 */
function storedMime(type: string): LogoMime {
  return type === "image/jpeg" ? "image/jpeg" : "image/png";
}

/**
 * Un SVG puede no declarar tamaño intrínseco, y entonces `naturalWidth` sale 0 en algunos
 * navegadores. Se rasteriza sobre un lienzo cuadrado del lado máximo en vez de fallar: un logo
 * cuadrado de más es infinitamente mejor que un logo que no se puede subir.
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
 * El archivo del usuario convertido en el `EntityLogo` que se guarda: validado, reducido a
 * `LOGO_MAX_SIDE` de lado mayor y con sus dimensiones finales medidas UNA vez, que es lo que deja
 * al layout del comprobante colocarlo sin volver a decodificarlo.
 */
export async function readLogoFile(file: File): Promise<EntityLogo> {
  const check = checkLogoFile({ type: file.type, size: file.size });
  if (!check.ok) {
    throw new LogoFileError(check.message);
  }

  const source = await readAsDataUrl(file);
  const image = await loadImage(source);
  const intrinsic = intrinsicSize(image);

  // El mismo `contain` que `fitLogoBox`, pero contra un cuadrado y redondeado a píxeles enteros:
  // un canvas de 45,3 px de alto no existe, y las dimensiones que se guardan tienen que ser las
  // que la imagen realmente tiene.
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
    // Un JPEG se re-codifica al 92%: por debajo se ven artefactos en los bordes duros de un logo.
    dataUrl: canvas.toDataURL(mime, 0.92),
    mime,
    width,
    height,
  };
}
