import { describe, expect, it } from "vite-plus/test";

import { projectMatchesQuery, projectSearchTexts } from "./projectFilter";

// Запросы в кириллице собираются из кодовых точек: раскладка автора файла не
// должна влиять на тест.
const cyrillic = (...units: number[]) => String.fromCodePoint(...units);
const typedFleet = cyrillic(0x430, 0x43b, 0x443, 0x443, 0x435);
const typedT3Code = cyrillic(0x435, 0x33, 0x441, 0x449, 0x432, 0x443);
const typedAdmin = cyrillic(0x444, 0x432, 0x44c, 0x448, 0x442);
const typedFlit = cyrillic(0x444, 0x43b, 0x438, 0x442);

describe("projectMatchesQuery", () => {
  it("finds a project typed on the other layout", () => {
    expect(projectMatchesQuery(typedFleet, "Fleet")).toBe(true);
    expect(projectMatchesQuery(typedT3Code, "t3code")).toBe(true);
    expect(projectMatchesQuery(typedAdmin, "Admin")).toBe(true);
    expect(projectMatchesQuery(typedFleet, "t3code")).toBe(false);
  });

  it("keeps matching the query as typed", () => {
    expect(projectMatchesQuery("fleet", "Fleet")).toBe(true);
    expect(projectMatchesQuery("FLEET", "Fleet")).toBe(true);
    expect(projectMatchesQuery("leet", "Fleet")).toBe(true);
    expect(projectMatchesQuery("flit", "Fleet")).toBe(false);
    expect(projectMatchesQuery(typedFlit, "Fleet")).toBe(false);
  });

  it("keeps every project for an empty query", () => {
    expect(projectMatchesQuery("", "Fleet")).toBe(true);
    expect(projectMatchesQuery("   ", "Fleet")).toBe(true);
    expect(projectMatchesQuery("zzz", "Fleet")).toBe(false);
  });

  it("searches by the Cyrillic spelling of a name", () => {
    const texts = projectSearchTexts("Fleet");
    expect(texts.length).toBe(3);
    expect(texts.some((text) => text.includes(typedFleet))).toBe(true);
  });
});
