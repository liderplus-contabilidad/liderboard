/**
 * THE AMOUNT IN WORDS, as an Ecuadorian bank reads it on a check: upper case, the cents as a
 * fraction of a hundred and the currency at the end — «NUEVE MIL DOSCIENTOS CON 00/100 DÓLARES».
 *
 * It is the one figure of the check that is checked against another (the amount in numbers), and a
 * mismatch voids the check, so it is a pure function with its own tests and never a template.
 *
 * The only rule of the language worth a comment is the APOCOPE: a «uno» that counts thousands or
 * millions is shortened («VEINTIÚN MIL», «UN MILLÓN»), one that closes the figure is not
 * («VEINTIUNO»). That is why `below1000` takes whether it stands before a multiplier.
 */

const UNITS = [
  "CERO",
  "UNO",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
  "DIECISÉIS",
  "DIECISIETE",
  "DIECIOCHO",
  "DIECINUEVE",
  "VEINTE",
  "VEINTIUNO",
  "VEINTIDÓS",
  "VEINTITRÉS",
  "VEINTICUATRO",
  "VEINTICINCO",
  "VEINTISÉIS",
  "VEINTISIETE",
  "VEINTIOCHO",
  "VEINTINUEVE",
] as const;

const TENS = [
  "",
  "",
  "",
  "TREINTA",
  "CUARENTA",
  "CINCUENTA",
  "SESENTA",
  "SETENTA",
  "OCHENTA",
  "NOVENTA",
] as const;

const HUNDREDS = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS",
] as const;

/** The largest amount a check is written for; past it the words would need «MIL MILLONES». */
export const MAX_AMOUNT_IN_WORDS = 999_999_999.99;

/** 1–99. `apocope` shortens a closing «uno» before MIL / MILLÓN. */
function below100(value: number, apocope: boolean): string {
  if (value < 30) {
    if (apocope && value === 1) {
      return "UN";
    }
    if (apocope && value === 21) {
      return "VEINTIÚN";
    }
    return UNITS[value];
  }
  const tens = TENS[Math.floor(value / 10)];
  const unit = value % 10;
  if (unit === 0) {
    return tens;
  }
  return `${tens} Y ${unit === 1 && apocope ? "UN" : UNITS[unit]}`;
}

/** 1–999. */
function below1000(value: number, apocope: boolean): string {
  if (value === 100) {
    return "CIEN";
  }
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts = [hundreds > 0 ? HUNDREDS[hundreds] : "", rest > 0 ? below100(rest, apocope) : ""];
  return parts.filter(Boolean).join(" ");
}

/** A whole number 0–999 999 999 in words. */
export function integerInWords(value: number): string {
  if (value === 0) {
    return UNITS[0];
  }
  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1000);
  const units = value % 1000;

  const parts: string[] = [];
  if (millions > 0) {
    parts.push(millions === 1 ? "UN MILLÓN" : `${below1000(millions, true)} MILLONES`);
  }
  if (thousands > 0) {
    // «MIL», never «UN MIL»: the one before a thousand is silent.
    parts.push(thousands === 1 ? "MIL" : `${below1000(thousands, true)} MIL`);
  }
  if (units > 0) {
    parts.push(below1000(units, false));
  }
  return parts.join(" ");
}

/**
 * `9200` → «NUEVE MIL DOSCIENTOS CON 00/100 DÓLARES». Rounded to the CENT first, and the dollars and
 * cents are read from that one integer — never `Math.floor(amount)` beside `amount % 1`, where
 * `0.29 * 100` is `28.999…` and a check would say 28/100.
 */
export function amountInWords(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const dollars = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${integerInWords(dollars)} CON ${fraction}/100 DÓLARES`;
}
