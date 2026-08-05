/** Parses and evaluates input for amount fields, supporting plain numbers or simple arithmetic
 * expressions (e.g., "=1200*12", "(500+300)/2"). No advanced spreadsheet features like cell
 * references, functions, or percentages are supported. */

import { AMOUNT_PATTERN, parseCurrency } from "./format";

export type AmountResult =
  | {
      ok: true;
      value: number;
      /** True when the input was an operation rather than a plainly written amount — the editor
       * shows the computed result only for these. */
      isFormula: boolean;
    }
  | { ok: false; error: string };

/** Money: the result is rounded to cents, so "=0.1+0.2" is 0.30 and "=1000/3" is 333.33. */
const CENTS = 100;

/** Thrown inside the parser and caught at the entry point — the message is the user-facing copy. */
class CalcError extends Error {}

type Token = { kind: "number"; value: number } | { kind: "op"; op: string };

const NUMBER_AT = new RegExp(`^${AMOUNT_PATTERN}`);
const OPERATORS = new Set(["+", "-", "*", "/", "(", ")"]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;

  while (at < input.length) {
    const char = input[at];

    if (char === " " || char === "\t") {
      at += 1;
      continue;
    }

    if (OPERATORS.has(char)) {
      tokens.push({ kind: "op", op: char });
      at += 1;
      continue;
    }

    const number = NUMBER_AT.exec(input.slice(at));
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0].replace(/,/g, "")) });
      at += number[0].length;
      continue;
    }

    // A comma left over means it did not group three digits — "1,5" or the inverted convention
    // "17.338,85". Naming the convention is more useful than "unexpected character".
    if (char === ",") {
      throw new CalcError("La coma es para los miles: escribe 17,338.85 y los centavos con punto.");
    }
    throw new CalcError(`No entiendo «${char}» en la operación.`);
  }

  return tokens;
}

/**
 * Recursive descent over the usual precedence:
 *   expression := term (("+" | "-") term)*
 *   term       := factor (("*" | "/") factor)*
 *   factor     := ("+" | "-") factor | number | "(" expression ")"
 */
function parse(tokens: Token[]): number {
  let at = 0;

  const peek = (): Token | undefined => tokens[at];

  const eatOp = (...ops: string[]): string | null => {
    const token = peek();
    if (token?.kind === "op" && ops.includes(token.op)) {
      at += 1;
      return token.op;
    }
    return null;
  };

  const factor = (): number => {
    const sign = eatOp("+", "-");
    if (sign) {
      const operand = factor();
      return sign === "-" ? -operand : operand;
    }

    const token = peek();
    if (!token) {
      throw new CalcError("La operación está incompleta.");
    }

    if (token.kind === "number") {
      at += 1;
      return token.value;
    }

    if (token.op === "(") {
      at += 1;
      const inner = expression();
      if (!eatOp(")")) {
        throw new CalcError("Falta cerrar un paréntesis.");
      }
      return inner;
    }

    throw new CalcError(`Falta un número antes de «${token.op}».`);
  };

  const term = (): number => {
    let left = factor();
    for (let op = eatOp("*", "/"); op; op = eatOp("*", "/")) {
      const right = factor();
      if (op === "/" && right === 0) {
        throw new CalcError("No se puede dividir entre cero.");
      }
      left = op === "*" ? left * right : left / right;
    }
    return left;
  };

  const expression = (): number => {
    let left = term();
    for (let op = eatOp("+", "-"); op; op = eatOp("+", "-")) {
      const right = term();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };

  const result = expression();

  const leftover = peek();
  if (leftover) {
    throw new CalcError(
      leftover.kind === "number"
        ? "Falta un operador entre dos números."
        : "Sobra un paréntesis en la operación.",
    );
  }

  return result;
}

/**
 * Evaluates what was typed into an amount field. Returns the error message to show rather than
 * falling back to the previous value: a silent fallback on an unclosed parenthesis looks exactly
 * like a saved edit.
 */
export function evaluateAmount(input: string): AmountResult {
  const trimmed = input.trim();
  const hadEquals = trimmed.startsWith("=");
  const body = hadEquals ? trimmed.slice(1).trim() : trimmed;

  if (body === "") {
    return { ok: false, error: "Escribe un valor o una operación." };
  }

  // "Is this a formula" reuses the existing definition of a plainly written amount instead of
  // adding a third one — so "-500" is a number and "5+5" is not.
  const isFormula = hadEquals || parseCurrency(body) === null;

  let raw: number;
  try {
    raw = parse(tokenize(body));
  } catch (error) {
    if (error instanceof CalcError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  if (!Number.isFinite(raw)) {
    return { ok: false, error: "El resultado no es un número." };
  }

  const rounded = Math.round(raw * CENTS) / CENTS;
  if (!Number.isFinite(rounded)) {
    return { ok: false, error: "El resultado es demasiado grande." };
  }

  // `-0` would render as "-0.00" under a formatter that keeps the sign.
  return { ok: true, value: rounded === 0 ? 0 : rounded, isFormula };
}
