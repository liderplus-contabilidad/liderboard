/**
 * A WORKSPACE'S LOGO — the rules that can be wrong, separated from the ones that cannot.
 *
 * A logo travels to three consumers that are nothing alike: an `<img>` on screen, exceljs'
 * `addImage` and pdf-lib's `embedPng`/`embedJpg`. What reconciles them is storing the logo as a
 * **data URL**, which is the only thing all three can read without prior conversion — the `<img>` and
 * exceljs take it as it is, and pdf-lib only needs the bytes, which `decodeLogoBytes` extracts
 * without touching the DOM.
 *
 * **The dimensions are stored because the payslip's `layout.ts` is pure.** Placing the logo on the
 * page requires knowing its proportion, and decoding the image to find out would require a canvas —
 * with which that layer's promise (asserting in a test that no box falls off the page, without
 * generating a PDF) would collapse. They are measured ONCE, on upload, and travel with the logo.
 *
 * What does NOT live here is reading the file and resizing it: that touches the DOM and is in
 * `logo-file.ts`. The split is not stylistic — Vitest only runs the pure layer, so everything that
 * can be wrong (what is rejected, how big the box is) has to be on this side to be testable.
 */

/** The two formats pdf-lib can embed. An SVG reaches here already rasterized to PNG. */
export type LogoMime = "image/png" | "image/jpeg";

/**
 * A workspace's CENTER logos, by `centerId`. They hang off the client —and not off the center—
 * because a center is not a stored row in either of the two modules that have them: in PyG it is a
 * slug that comes out of the datasets, and in Ocupaciones it is half of the `[hotelId+centerId+year]`
 * key. There is nowhere to put a field of its own.
 *
 * Hanging off the client also gives away the two things that matter: it is deleted in cascade with
 * it, and it SURVIVES reloading the data, because the `centerId` is the same slug before and after.
 */
export type CenterLogos = Record<string, EntityLogo>;

/**
 * The center's logo, or nothing. **That a missing `centerId` returns `undefined` IS the rule**: the
 * Consolidado, the raw month and the report's cover are not a center, so they are left with no second
 * logo without any surface having to write its own case — asking «and what if it is the consolidado?»
 * in four places is exactly how three of them end up answering differently.
 */
export function centerLogoOf(
  logos: CenterLogos | undefined,
  centerId: string | null | undefined,
): EntityLogo | undefined {
  if (!logos || centerId == null) {
    return undefined;
  }
  return logos[centerId];
}

/**
 * `centerId`'s logo set or removed, and the whole registry discarded when it is left empty: a stored
 * `{}` and an absent field say the same thing, and keeping both turns «this client has no center
 * logos» into two different questions.
 */
export function withCenterLogo(
  logos: CenterLogos | undefined,
  centerId: string,
  logo: EntityLogo | null,
): CenterLogos | undefined {
  const next = { ...logos };
  if (logo) {
    next[centerId] = logo;
  } else {
    delete next[centerId];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export interface EntityLogo {
  /** `data:image/png;base64,…`. It serves an `<img>` and exceljs' `wb.addImage` as it is. */
  dataUrl: string;
  /** What decides between `embedPng` and `embedJpg`; the extension exceljs asks for comes from
   *  here. */
  mime: LogoMime;
  /** ALREADY resized dimensions, in pixels. */
  width: number;
  height: number;
}

/** The cap the firm asked for, over the ORIGINAL file: it is checked before decoding anything. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The longer side the stored logo is reduced to. 800 px covers more than enough for the largest of
 * its three uses —some 120 pt on the payslip, which at 300 dpi is 500 px— and leaves a logo PNG in
 * the order of 100 KB, so the dropdown can list thirty clients without loading thirty originals.
 */
export const LOGO_MAX_SIDE = 800;

/**
 * What the `<input type="file">` offers and `checkLogoFile` admits. SVG goes in even though neither
 * exceljs nor pdf-lib embeds it: it is rasterized on upload, which is what saves the user from having
 * to know what format their logo ends up in.
 */
export const LOGO_ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"] as const;

/** The input's `accept`, in the form the attribute expects. */
export const LOGO_ACCEPT_ATTRIBUTE = LOGO_ACCEPTED_TYPES.join(",");

export type LogoFileCheck = { ok: true } | { ok: false; message: string };

/** A size in the rejection's words: «3.4 MB». A logo never drops below KB. */
export function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) {
    return `${megabytes.toFixed(1).replace(".", ",")} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Whether the file can be attempted. It looks at the TYPE and the SIZE and nothing else, because that
 * is all that can be known without decoding — and decoding a 40 MB file to discover it is too big is
 * exactly what this cap avoids.
 *
 * The message states the REAL size: «it is too heavy» forces opening the file browser to find out how
 * much has to be trimmed.
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
 * The box the logo is drawn in inside a gap: **the app's only proportion rule**, and all three
 * surfaces use it. It is a `contain` — it goes in whole and is never cropped, because a cropped logo
 * stops being the logo.
 *
 * It does NOT enlarge: a logo smaller than its gap is drawn at its own size, since stretching it only
 * blurs it. The units are whatever is passed in (pixels in the Excel, points in the PDF): a ratio has
 * no units, and a second version of this function per unit could diverge from the first.
 */
export function fitLogoBox(logo: { width: number; height: number }, max: LogoBox): LogoBox {
  if (logo.width <= 0 || logo.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(max.width / logo.width, max.height / logo.height, 1);
  // Clamped against the gap as well as scaled: `400 * (28/400)` gives `28.000000000000004`, and a
  // logo that overflows its box by an epsilon breaks exactly the invariant the payslip's layout
  // depends on. The proportion deviates by that same epsilon, which does not exist on screen.
  return {
    width: Math.min(logo.width * scale, max.width),
    height: Math.min(logo.height * scale, max.height),
  };
}

/** The extension exceljs names the format with — its vocabulary, not the MIME one. */
export function logoExtension(logo: EntityLogo): "png" | "jpeg" {
  return logo.mime === "image/jpeg" ? "jpeg" : "png";
}

/** The bare base64 of a data URL, which is what exceljs' `wb.addImage` receives. */
export function logoBase64(logo: EntityLogo): string {
  const comma = logo.dataUrl.indexOf(",");
  return comma === -1 ? "" : logo.dataUrl.slice(comma + 1);
}

/**
 * The logo's bytes, for `embedPng`/`embedJpg`. It is decoded here and not in `render.ts` so the layer
 * that draws the PDF keeps deciding nothing — and because decoding base64 is exactly the kind of
 * thing that gets written wrong once and copied three times.
 */
export function decodeLogoBytes(logo: EntityLogo): Uint8Array {
  const binary = atob(logoBase64(logo));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
