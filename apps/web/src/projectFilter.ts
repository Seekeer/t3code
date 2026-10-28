/** Поиск по проектам, который понимает текст, набранный не в той раскладке. */
import { normalizeSearchText } from "./lib/utils";

// Раскладка: номер кириллической буквы на каждую латинскую клавишу. Значения
// заданы кодовыми точками, чтобы файл не зависел от литералов с кириллицей.
const fromCode = String.fromCharCode;
const CYRILLIC_UNIT_BY_LATIN: Readonly<Record<string, number>> = {
  q: 0x439,
  w: 0x446,
  e: 0x443,
  r: 0x43a,
  t: 0x435,
  y: 0x43d,
  u: 0x433,
  i: 0x448,
  o: 0x449,
  p: 0x437,
  a: 0x444,
  s: 0x44b,
  d: 0x432,
  f: 0x430,
  g: 0x43f,
  h: 0x440,
  j: 0x43e,
  k: 0x434,
  l: 0x43b,
  z: 0x44f,
  x: 0x447,
  c: 0x441,
  v: 0x43c,
  b: 0x438,
  n: 0x442,
  m: 0x44c,
  ".": 0x44e,
};

const LATIN_BY_CYRILLIC_UNIT: Record<number, string> = {};
for (const latin of Object.keys(CYRILLIC_UNIT_BY_LATIN)) {
  LATIN_BY_CYRILLIC_UNIT[fromCode(CYRILLIC_UNIT_BY_LATIN[latin]!).codePointAt(0)!] = latin;
}

/** Текст проекта так, как он выглядел бы, если набрать его в кириллице. */
export function toCyrillicLayout(text: string): string {
  let result = "";
  for (const character of text.normalize("NFC").toLowerCase()) {
    const unit = CYRILLIC_UNIT_BY_LATIN[character.toLowerCase()];
    result = `${result}${unit === undefined ? character : fromCode(unit)}`;
  }
  return result;
}

/** Кириллический текст, прочитанный латиницей. */
export function toLatinLayout(text: string): string {
  let result = "";
  for (const character of text.normalize("NFC").toLowerCase()) {
    const latin = LATIN_BY_CYRILLIC_UNIT[character.codePointAt(0) ?? 0];
    result = `${result}${latin ?? character}`;
  }
  return result;
}

/**
 * Тексты, по которым ищется проект: само имя, его запись в кириллице и то, как
 * кириллический запрос читается латиницей.
 */
export function projectSearchTexts(text: string): ReadonlyArray<string> {
  return [text, toCyrillicLayout(text), toLatinLayout(text)];
}

/** Идёт ли проект под запрос хоть в одной раскладке. */
export function projectMatchesQuery(query: string, projectName: string): boolean {
  const needle = normalizeSearchText(query);
  if (needle.length === 0) return true;
  return projectSearchTexts(projectName).some((candidate) =>
    normalizeSearchText(candidate).includes(needle),
  );
}

/** Тексты для поиска без учёта регистра: имя и его чтение в обеих раскладках. */
export function projectSearchKeys(projectName: string): ReadonlyArray<string> {
  return projectSearchTexts(projectName).map(normalizeSearchText);
}

/** Совпадает ли запрос с одной из строк поиска по проекту. */
export function matchesProjectSearchKeys(query: string, keys: ReadonlyArray<string>): boolean {
  const needle = normalizeSearchText(query);
  if (needle.length === 0) return true;
  return keys.some((key) => key.includes(needle));
}
