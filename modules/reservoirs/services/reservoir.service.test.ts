import { describe, expect, it } from "vitest";
import {
  calculateAutonomy,
  calculateLevelPercent,
  calculateRechargeTime,
} from "./reservoir.service";

describe("reservoir service", () => {
  it("calculates a bounded stored-volume percentage", () => {
    expect(calculateLevelPercent(250, 1_000)).toBe(25);
    expect(calculateLevelPercent(1_200, 1_000)).toBe(100);
    expect(calculateLevelPercent(50, 0)).toBe(0);
  });

  it("calculates autonomy only from the usable volume", () => {
    expect(calculateAutonomy(850, 250, 100)).toBe(6);
    expect(calculateAutonomy(150, 250, 100)).toBe(0);
    expect(calculateAutonomy(850, 250, 0)).toBe(Infinity);
  });

  it("calculates the time required to refill the capacity deficit", () => {
    expect(calculateRechargeTime(250, 1_000, 150)).toBe(5);
    expect(calculateRechargeTime(1_000, 1_000, 150)).toBe(0);
    expect(calculateRechargeTime(250, 1_000, 0)).toBe(Infinity);
  });
});
