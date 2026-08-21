import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SENSORY_AUTO_CONVERT_TO_PCT_CC,
  SENSORY_NOTE_MAX,
  SENSORY_NOTE_MIN,
  SENSORY_NOTE_UNIT,
  buildSensoryInsert,
  combineObservedAt,
  operationalSensoryDisplay,
  resolveSensoryNote,
  validateSensoryDepthCm,
  validateSensoryNote,
} from "./sensory-note";

describe("nota sensorial 1–10 (Etapa G)", () => {
  it("aceita inteiros de 1 a 10 e rejeita o restante", () => {
    expect(validateSensoryNote(1)).toBeNull();
    expect(validateSensoryNote(7)).toBeNull();
    expect(validateSensoryNote(10)).toBeNull();
    expect(validateSensoryNote(0)).not.toBeNull();
    expect(validateSensoryNote(11)).not.toBeNull();
    expect(validateSensoryNote(7.5)).not.toBeNull();
  });

  it("não trata nota 7 como 70% da CC", () => {
    expect(SENSORY_AUTO_CONVERT_TO_PCT_CC).toBe(false);
    expect(SENSORY_NOTE_MIN).toBe(1);
    expect(SENSORY_NOTE_MAX).toBe(10);
    const shown = operationalSensoryDisplay(7);
    expect(shown.note).toBe(7);
    expect(shown.percentCc).toBeNull();
    expect(shown.unit).toContain("1–10");
    expect(shown.note * 10).not.toBe(shown.percentCc);
  });

  it("profundidade é obrigatória e em cm", () => {
    expect(validateSensoryDepthCm(20)).toBeNull();
    expect(validateSensoryDepthCm(null)).not.toBeNull();
    expect(validateSensoryDepthCm(0)).not.toBeNull();
  });
});

describe("resolveSensoryNote", () => {
  it("prefere a nota 1–10 e cai na camada antiga sem converter", () => {
    expect(resolveSensoryNote({ note: 8, layer_1_note: 3 })).toBe(8);
    expect(resolveSensoryNote({ note: null, layer_1_note: 7 })).toBe(7);
    expect(resolveSensoryNote({})).toBeNull();
  });
});

describe("buildSensoryInsert", () => {
  it("grava nota bruta e zera moisture_pct / use_in_balance", () => {
    const row = buildSensoryInsert({
      farmId: "f1",
      pivotId: "p1",
      parcelId: "a1",
      readingDate: "2026-08-20",
      observedAt: combineObservedAt("2026-08-20", "09:30"),
      note: 7,
      depthCm: 20,
      notes: "entre-linha",
    });
    expect(row.note).toBe(7);
    expect(row.depth_cm).toBe(20);
    expect(row.observed_at).toBe("2026-08-20T09:30:00");
    expect(row.use_in_balance).toBe(false);
    expect(row.layer_1_moisture_pct).toBeNull();
    expect(row.layer_2_moisture_pct).toBeNull();
    expect(row.layer_3_moisture_pct).toBeNull();
    expect(row).not.toHaveProperty("moisture_pct_cc");
  });
});

describe("motor não consome sensorial", () => {
  it("pivot-engine não importa nota nem % CC sensorial", () => {
    const src = readFileSync(
      join(__dirname, "../../water-balance/services/pivot-engine.ts"),
      "utf8",
    );
    expect(src.toLowerCase()).not.toMatch(/sensor/);
    expect(src).not.toContain("soil_sensory");
  });
});

describe("lançamento operacional não converte", () => {
  it("a tela de sensorial não importa sensoryNoteToPercentCC", () => {
    const src = readFileSync(
      join(process.cwd(), "app/(app)/lancamentos/sensorial-solo/page.tsx"),
      "utf8",
    );
    expect(src).not.toContain("sensoryNoteToPercentCC");
    expect(src).not.toContain("use_in_balance");
    expect(src).toContain("1–10");
  });
});
