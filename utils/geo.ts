export function radiusFromArea(areaHa: number): number {
  return Math.sqrt((areaHa * 10000) / Math.PI);
}
