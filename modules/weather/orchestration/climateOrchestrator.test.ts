import { describe, expect, it } from "vitest";
import { buildOrchestrationWindow, decideOrchestrationStatus } from "./climateOrchestrator";

describe("CLIMA 8 orchestrator helpers", () => {
  it("alinha janela em blocos de 30 minutos", () => {
    const window = buildOrchestrationWindow(new Date("2026-08-08T02:17:45.000Z"), 60, 180);
    expect(window.start).toBe("2026-08-08T01:00:00.000Z");
    expect(window.end).toBe("2026-08-08T05:00:00.000Z");
  });

  it("marca success quando todos providers e intervalos fecham com ETo disponivel", () => {
    expect(decideOrchestrationStatus({
      enabledProviders: 4,
      successfulProviders: 4,
      failedProviders: 0,
      intervalsFound: 8,
      consensusCreated: 8,
      etoCreated: 8,
      etoAvailable: 8,
    })).toBe("success");
  });

  it("marca partial com falha de provider, sem cancelar o ciclo", () => {
    expect(decideOrchestrationStatus({
      enabledProviders: 4,
      successfulProviders: 3,
      failedProviders: 1,
      intervalsFound: 8,
      consensusCreated: 8,
      etoCreated: 8,
      etoAvailable: 7,
    })).toBe("partial");
  });

  it("marca failed quando nada novo nem derivado foi produzido", () => {
    expect(decideOrchestrationStatus({
      enabledProviders: 4,
      successfulProviders: 0,
      failedProviders: 4,
      intervalsFound: 0,
      consensusCreated: 0,
      etoCreated: 0,
      etoAvailable: 0,
    })).toBe("failed");
  });
});
