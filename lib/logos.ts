/**
 * EL LOGO DE UN WORKSPACE — las reglas que pueden estar mal, separadas de las que no.
 *
 * Un logo viaja a tres consumidores que no se parecen en nada: un `<img>` en pantalla, `addImage`
 * de exceljs y `embedPng`/`embedJpg` de pdf-lib. Lo que los reconcilia es guardar el logo como
 * **data URL**, que es lo único que los tres saben leer sin conversión previa — el `<img>` y
 * exceljs lo toman tal cual, y pdf-lib solo necesita los bytes, que `decodeLogoBytes` saca sin
 * tocar el DOM.
 *
 * **Las dimensiones se guardan porque `layout.ts` del comprobante es puro.** Colocar el logo en la
 * hoja exige saber su proporción, y decodificar la imagen para averiguarla obligaría a un canvas —
 * con lo que la promesa de esa capa (afirmar en un test que ninguna caja se sale de la página, sin
 * generar un PDF) se caería. Se miden UNA vez, al subir, y viajan con el logo.
 *
 * Lo que NO vive aquí es leer el archivo y redimensionarlo: eso toca DOM y está en `logo-file.ts`.
 * La partición no es de estilo — Vitest solo corre la capa pura, así que todo lo que pueda estar
 * mal (qué se rechaza, cuánto mide la caja) tiene que estar de este lado para poder probarse.
 */

/** Los dos formatos que pdf-lib sabe embeber. Un SVG llega hasta aquí ya rasterizado a PNG. */
export type LogoMime = "image/png" | "image/jpeg";

export interface EntityLogo {
  /** `data:image/png;base64,…`. Sirve tal cual a un `<img>` y a `wb.addImage` de exceljs. */
  dataUrl: string;
  /** Lo que decide entre `embedPng` y `embedJpg`; la extensión que exceljs pide sale de aquí. */
  mime: LogoMime;
  /** Dimensiones YA redimensionadas, en píxeles. */
  width: number;
  height: number;
}

/** El tope que pidió la firma, sobre el archivo ORIGINAL: se comprueba antes de decodificar nada. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * El lado mayor al que se reduce el logo guardado. 800 px cubre de sobra el mayor de sus tres usos
 * —unos 120 pt en el comprobante, que a 300 dpi son 500 px— y deja un PNG de logo en el orden de
 * los 100 KB, así que el desplegable puede listar treinta clientes sin cargar treinta originales.
 */
export const LOGO_MAX_SIDE = 800;

/**
 * Lo que el `<input type="file">` ofrece y `checkLogoFile` admite. El SVG entra aunque ni exceljs ni
 * pdf-lib lo embeban: se rasteriza al subirlo, que es lo que evita que el usuario tenga que saber
 * en qué formato acaba su logo.
 */
export const LOGO_ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"] as const;

/** El `accept` del input, en la forma que espera el atributo. */
export const LOGO_ACCEPT_ATTRIBUTE = LOGO_ACCEPTED_TYPES.join(",");

export type LogoFileCheck = { ok: true } | { ok: false; message: string };

/** Un tamaño en las palabras del rechazo: «3,4 MB». Un logo nunca baja de los KB. */
export function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) {
    return `${megabytes.toFixed(1).replace(".", ",")} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Si el archivo se puede intentar. Mira el TIPO y el PESO y nada más, porque es lo único que se
 * puede saber sin decodificar — y decodificar un archivo de 40 MB para descubrir que sobra es
 * justamente lo que este tope evita.
 *
 * El mensaje dice el peso REAL: «pesa demasiado» obliga a abrir el explorador de archivos para
 * averiguar cuánto hay que recortar.
 */
export function checkLogoFile(file: { type: string; size: number }): LogoFileCheck {
  if (!(LOGO_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "El logo tiene que ser PNG, JPG o SVG." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return {
      ok: false,
      message: `Pesa ${formatBytes(file.size)}; el máximo es ${formatBytes(LOGO_MAX_BYTES)}.`,
    };
  }
  return { ok: true };
}

export interface LogoBox {
  width: number;
  height: number;
}

/**
 * La caja en la que se dibuja el logo dentro de un hueco: **la única regla de proporción del app**,
 * y la usan las tres superficies. Es un `contain` — entra entero y nunca se recorta, porque un logo
 * recortado deja de ser el logo.
 *
 * NO agranda: un logo más pequeño que su hueco se dibuja a su tamaño, ya que estirarlo solo lo
 * emborrona. Las unidades son las que le pasen (píxeles en el Excel, puntos en el PDF): la razón no
 * tiene unidades, y una segunda versión de esta función por unidad podría divergir de la primera.
 */
export function fitLogoBox(logo: { width: number; height: number }, max: LogoBox): LogoBox {
  if (logo.width <= 0 || logo.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(max.width / logo.width, max.height / logo.height, 1);
  // Recortado contra el hueco además de escalado: `400 * (28/400)` da `28.000000000000004`, y un
  // logo que se sale de su caja por un epsilon rompe justo el invariante del que depende el layout
  // del comprobante. La proporción se desvía en ese mismo epsilon, que no existe en pantalla.
  return {
    width: Math.min(logo.width * scale, max.width),
    height: Math.min(logo.height * scale, max.height),
  };
}

/** La extensión con que exceljs nombra el formato — su vocabulario, no el de los MIME. */
export function logoExtension(logo: EntityLogo): "png" | "jpeg" {
  return logo.mime === "image/jpeg" ? "jpeg" : "png";
}

/** El base64 pelado de un data URL, que es lo que `wb.addImage` de exceljs recibe. */
export function logoBase64(logo: EntityLogo): string {
  const comma = logo.dataUrl.indexOf(",");
  return comma === -1 ? "" : logo.dataUrl.slice(comma + 1);
}

/**
 * Los bytes del logo, para `embedPng`/`embedJpg`. Se decodifica aquí y no en `render.ts` para que
 * la capa que dibuja el PDF siga sin decidir nada — y porque decodificar base64 es exactamente la
 * clase de cosa que se escribe mal una vez y se copia tres.
 */
export function decodeLogoBytes(logo: EntityLogo): Uint8Array {
  const binary = atob(logoBase64(logo));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
