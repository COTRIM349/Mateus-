export const DRAWING_KINDS = [
  "talhao",
  "canal",
  "cerca",
  "estrada",
  "reservatorio",
  "anotacao",
] as const;

export type DrawingKind = (typeof DRAWING_KINDS)[number];

export type DrawTool = "polygon" | "polyline" | "marker" | "select";

export type GeoJsonGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "LineString"; coordinates: number[][] }
  | { type: "Point"; coordinates: number[] };

export const DRAWING_KIND_LABELS: Record<DrawingKind, string> = {
  talhao: "Talhão",
  canal: "Canal",
  cerca: "Cerca",
  estrada: "Estrada",
  reservatorio: "Reservatório",
  anotacao: "Anotação",
};

export const DRAWING_KIND_COLORS: Record<DrawingKind, string> = {
  talhao: "#8BC34A",
  canal: "#03A9F4",
  cerca: "#FF9800",
  estrada: "#9E9E9E",
  reservatorio: "#1565C0",
  anotacao: "#E91E63",
};

export const DRAWING_KIND_GEOMETRY: Record<DrawingKind, GeoJsonGeometry["type"]> = {
  talhao: "Polygon",
  canal: "LineString",
  cerca: "LineString",
  estrada: "LineString",
  reservatorio: "Polygon",
  anotacao: "Point",
};

export const DRAWING_KIND_CONFIG: Record<
  DrawingKind,
  { label: string; color: string; geometry: GeoJsonGeometry["type"]; tool: Exclude<DrawTool, "select"> }
> = {
  talhao: { label: "Talhão", color: DRAWING_KIND_COLORS.talhao, geometry: "Polygon", tool: "polygon" },
  canal: { label: "Canal", color: DRAWING_KIND_COLORS.canal, geometry: "LineString", tool: "polyline" },
  cerca: { label: "Cerca", color: DRAWING_KIND_COLORS.cerca, geometry: "LineString", tool: "polyline" },
  estrada: { label: "Estrada", color: DRAWING_KIND_COLORS.estrada, geometry: "LineString", tool: "polyline" },
  reservatorio: {
    label: "Reservatório",
    color: DRAWING_KIND_COLORS.reservatorio,
    geometry: "Polygon",
    tool: "polygon",
  },
  anotacao: { label: "Anotação", color: DRAWING_KIND_COLORS.anotacao, geometry: "Point", tool: "marker" },
};

export interface MapDrawing {
  id: string;
  farmId: string;
  name: string;
  kind: DrawingKind;
  geometry: GeoJsonGeometry;
  color: string | null;
  notes: string | null;
}

const LNG_RANGE = [-180, 180] as const;
const LAT_RANGE = [-90, 90] as const;

function isLngLat(pair: unknown): pair is [number, number] {
  return (
    Array.isArray(pair) &&
    pair.length >= 2 &&
    typeof pair[0] === "number" &&
    typeof pair[1] === "number" &&
    Number.isFinite(pair[0]) &&
    Number.isFinite(pair[1]) &&
    pair[0] >= LNG_RANGE[0] &&
    pair[0] <= LNG_RANGE[1] &&
    pair[1] >= LAT_RANGE[0] &&
    pair[1] <= LAT_RANGE[1]
  );
}

export function validateDrawingGeometry(raw: unknown): { geometry: GeoJsonGeometry; error: string | null } {
  if (!raw || typeof raw !== "object") {
    return { geometry: { type: "Point", coordinates: [0, 0] }, error: "Geometria inválida." };
  }
  const geo = raw as { type?: string; coordinates?: unknown };
  if (geo.type === "Point") {
    if (!isLngLat(geo.coordinates)) return { geometry: { type: "Point", coordinates: [0, 0] }, error: "Ponto sem coordenada válida." };
    return { geometry: { type: "Point", coordinates: [geo.coordinates[0], geo.coordinates[1]] }, error: null };
  }
  if (geo.type === "LineString") {
    const coords = Array.isArray(geo.coordinates) ? geo.coordinates.filter(isLngLat) : [];
    if (coords.length < 2) return { geometry: { type: "LineString", coordinates: [] }, error: "Linha precisa de pelo menos 2 pontos." };
    return { geometry: { type: "LineString", coordinates: coords.map((c) => [c[0], c[1]]) }, error: null };
  }
  if (geo.type === "Polygon") {
    const rings = Array.isArray(geo.coordinates) ? geo.coordinates : [];
    const outer = Array.isArray(rings[0]) ? rings[0].filter(isLngLat) : [];
    if (outer.length < 4) return { geometry: { type: "Polygon", coordinates: [] }, error: "Polígono precisa de pelo menos 3 vértices." };
    const closed = [...outer.map((c) => [c[0], c[1]] as number[])];
    const first = closed[0];
    const last = closed[closed.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) closed.push([first[0], first[1]]);
    return { geometry: { type: "Polygon", coordinates: [closed] }, error: null };
  }
  return { geometry: { type: "Point", coordinates: [0, 0] }, error: "Tipo de geometria não suportado." };
}

export function validateDrawingForKind(
  kind: DrawingKind,
  raw: unknown,
): { ok: boolean; geometry: GeoJsonGeometry; error: string | null } {
  const result = validateDrawingGeometry(raw);
  if (result.error) return { ok: false, ...result };
  const expected = DRAWING_KIND_GEOMETRY[kind];
  if (result.geometry.type !== expected) {
    return {
      ok: false,
      geometry: result.geometry,
      error: `${DRAWING_KIND_LABELS[kind]} exige geometria ${expected}.`,
    };
  }
  return { ok: true, geometry: result.geometry, error: null };
}

export function geometryFromLatLngs(
  tool: Exclude<DrawTool, "select">,
  latlngs: Array<{ lat: number; lng: number }>,
): GeoJsonGeometry | null {
  if (tool === "marker") {
    const p = latlngs[0];
    if (!p) return null;
    return { type: "Point", coordinates: [p.lng, p.lat] };
  }
  if (tool === "polyline") {
    if (latlngs.length < 2) return null;
    return { type: "LineString", coordinates: latlngs.map((p) => [p.lng, p.lat]) };
  }
  if (latlngs.length < 3) return null;
  const ring = latlngs.map((p) => [p.lng, p.lat]);
  ring.push([latlngs[0].lng, latlngs[0].lat]);
  return { type: "Polygon", coordinates: [ring] };
}

export function defaultKindForTool(tool: Exclude<DrawTool, "select">): DrawingKind {
  if (tool === "marker") return "anotacao";
  if (tool === "polyline") return "canal";
  return "talhao";
}

export function mapDbDrawing(row: {
  id: string;
  farm_id: string;
  name: string;
  kind: string;
  geometry: unknown;
  color: string | null;
  notes: string | null;
}): MapDrawing | null {
  if (!(DRAWING_KINDS as readonly string[]).includes(row.kind)) return null;
  const kind = row.kind as DrawingKind;
  const checked = validateDrawingForKind(kind, row.geometry);
  if (!checked.ok) return null;
  return {
    id: row.id,
    farmId: row.farm_id,
    name: row.name.trim() || DRAWING_KIND_LABELS[kind],
    kind,
    geometry: checked.geometry,
    color: row.color,
    notes: row.notes,
  };
}
