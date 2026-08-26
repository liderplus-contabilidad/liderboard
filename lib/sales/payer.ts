/**
 * Empresa o persona, y cómo se rotula cada una.
 *
 * El archivo trae 956 pagadores mezclados: aseguradoras con su razón social y pacientes con su
 * nombre y sus dos apellidos. La app guarda los dos ENTEROS —una cifra cuyo dueño no se guardó
 * deja de ser trazable contra el reporte— y decide AQUÍ, en la capa de lectura, cuál se nombra en
 * pantalla. Que sea una sola función es lo que hace que la regla no se pueda saltar por una vista:
 * la tarjeta, su gemela en tabla y el informe pasan todos por ella.
 *
 * **Es una heurística y está SESGADA a propósito.** Se clasifica como persona por defecto y solo
 * se sale de ahí con evidencia POSITIVA de empresa, porque los dos errores no cuestan lo mismo:
 * una aseguradora tomada por paciente sale sin nombre —un rótulo pobre—, mientras que un paciente
 * tomado por aseguradora sale con su nombre en la pantalla y en el papel, que es justo lo que esto
 * existe para impedir. Si la lista resulta insuficiente, la salida es un interruptor explícito y
 * no más heurística (design.md, «Empresa contra persona se decide por FORMA»).
 */

/** Marcas societarias: nadie las lleva en su cédula. */
const LEGAL_MARKS = [
  "sa",
  "s a",
  "ca",
  "c a",
  "cia",
  "compania",
  "ltda",
  "limitada",
  "sas",
  "srl",
  "corp",
  "inc",
];

/**
 * Palabras del SECTOR que un nombre de persona no lleva. Es la mitad que hace falta porque las
 * aseguradoras del archivo real casi nunca escriben su forma societaria: `SALUDSA`,
 * `BMI IGUALAS MEDICAS`, `MEDIECUADOR HUMANA`, `PLAN VITAL`, `CONFIAMED`. Se comparan como
 * SUBCADENA y no como palabra suelta a propósito: `CONFIAMED` y `MEDIECUADOR` llevan `med` pegado
 * a otra cosa, que es como se construyen los nombres comerciales del ramo.
 */
const SECTOR_MARKS = [
  "seguro",
  "asegurad",
  "salud",
  "medic",
  "med ",
  "prepagad",
  "igualas",
  "hospital",
  "clinic",
  "sanitas",
  "fundacion",
  "cooperativa",
  "asociacion",
  "instituto",
  "banco",
  "empresa",
  "iess",
  "issfa",
  "isspol",
  "ministerio",
  "municipio",
  "plan ",
  "vital",
  "humana",
];

/** Sin acentos, en minúsculas y con los espacios internos colapsados. */
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type PayerKind = "empresa" | "particular";

/**
 * La clasificación, en tres pasos y en este orden:
 *
 *   1. Un nombre de UNA sola palabra es una empresa: una persona llega siempre con al menos un
 *      apellido y un nombre. Es lo que reconoce `SALUDSA` y `CONFIAMED` sin listarlos.
 *   2. Una marca societaria o del sector es una empresa.
 *   3. Todo lo demás es una persona — el caso por defecto, que es el seguro.
 */
export function classifyPayer(name: string): PayerKind {
  const normalized = normalize(name);
  if (normalized === "") {
    // Sin nombre no hay nada que proteger ni que nombrar; tratarlo como particular es lo que evita
    // que una fila en blanco se rotule como si fuera una empresa del archivo.
    return "particular";
  }
  const words = normalized.split(" ");
  if (words.length === 1) {
    return "empresa";
  }
  // La marca societaria se busca como PALABRA (`sa` está dentro de «rosa»); la del sector, como
  // subcadena, que es como se escriben los nombres comerciales del ramo.
  if (words.some((word) => LEGAL_MARKS.includes(word.replace(/\./g, "")))) {
    return "empresa";
  }
  // El espacio final de la cadena normalizada deja que `"plan "` y `"med "` casen también cuando la
  // palabra cierra el nombre.
  const haystack = `${normalized} `;
  if (SECTOR_MARKS.some((mark) => haystack.includes(mark))) {
    return "empresa";
  }
  return "particular";
}

/**
 * El rótulo de pantalla. Una empresa va con lo que trae el archivo; una persona, con un ordinal
 * que la identifica DENTRO de la lectura sin decir quién es — «Particular · 1» es el mayor de los
 * particulares del periodo, y no un número de historia clínica.
 *
 * El ordinal lo pone quien construye la lista (`derive.ts`), porque es posicional: depende del
 * periodo que se esté leyendo, y calcularlo aquí exigiría que esta función viera la lista entera.
 */
export function payerLabel(name: string, kind: PayerKind, ordinal: number): string {
  return kind === "empresa" ? name.trim() : `Particular · ${ordinal}`;
}
