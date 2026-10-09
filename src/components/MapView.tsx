"use client";
import { useEffect, useRef } from "react";
import type { Map as MLMap, GeoJSONSource, Marker } from "maplibre-gl";
import type { Level, Region } from "@/lib/types";

export type Highlight = { rank: number; centroid: [number, number]; area_id: string; kind: "hex" | "region" | "settlement"; region_id?: string };
type Props = {
  level: Level;
  regions: Region[];
  colors: Record<string, string>;
  hexColors: Record<string, string>;
  selectedId: string | null;
  highlights: Highlight[];
  onSelect: (id: string) => void;
  onSelectHex: (h: string) => void;
  onHover: (id: string | null, x: number, y: number) => void;
};

const BOUNDS: Record<Level, [number, number, number, number]> = {
  rayon: [44.75, 38.38, 50.65, 41.92],
  baku_district: [49.28, 39.93, 50.42, 40.62],
};
const SRC: Record<Level, string> = { rayon: "az", baku_district: "baku" };
const POI_COLORS = ["#a8243e", "#2e6b4e", "#7a4e9c", "#b7791f", "#d0864a", "#0f4c5c", "#3d7a8c", "#3d7a8c", "#a8243e", "#a8243e", "#4a5a62", "#7d8a8f", "#2e6b4e", "#2e6b4e", "#0f4c5c", "#9aa4a8"];

const hexToRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerpHex = (a: string, b: string, t: number) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(",")})`;
};
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export default function MapView({ level, regions, colors, hexColors, selectedId, highlights, onSelect, onSelectHex, onHover }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const current = useRef<Record<string, string>>({});
  const anim = useRef<number | null>(null);
  const markers = useRef<{ m: Marker; level: Level; rank: number; el: HTMLDivElement }[]>([]);
  const cb = useRef({ onSelect, onHover, onSelectHex });
  cb.current = { onSelect, onHover, onSelectHex };
  const pins = useRef<Marker[]>([]);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const hexColorsRef = useRef(hexColors);
  hexColorsRef.current = hexColors;
  const hlRef = useRef(highlights);
  hlRef.current = highlights;

  // ---- init ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      mlRef.current = maplibregl;
      if (cancelled || !el.current) return;
      const m = new maplibregl.Map({
        container: el.current,
        style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": css("--map-bg") || "#e3dccb" } }] },
        bounds: BOUNDS[level],
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true, customAttribution: "© OpenStreetMap iştirakçıları · DSK · Open-Meteo" },
        dragRotate: false,
        pitchWithRotate: false,
        minZoom: 5.5,
        maxZoom: 15,
      });
      m.touchZoomRotate.disableRotation();
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.current = m;
      (window as unknown as { __map: MLMap }).__map = m;
      m.on("load", async () => {
        const [az, baku, pois, hexGeo] = await Promise.all([
          fetch("/data/regions-az.geojson").then((r) => r.json()),
          fetch("/data/regions-baku.geojson").then((r) => r.json()),
          fetch("/data/pois-baku.json").then((r) => r.json()),
          fetch("/data/hexes-geo.json").then((r) => r.json()),
        ]);
        const border = css("--map-border") || "#fbf8f1";
        for (const [src, data] of [["az", az], ["baku", baku]] as const) {
          m.addSource(src, { type: "geojson", data, promoteId: "id" });
          m.addLayer({ id: `${src}-shadow`, type: "fill", source: src, paint: { "fill-color": "rgba(24,38,46,0.22)", "fill-translate": [0, 3] } });
          m.addLayer({
            id: `${src}-fill`,
            type: "fill",
            source: src,
            paint: {
              "fill-color": ["coalesce", ["feature-state", "c"], "#d3cbb8"],
              "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.82, 1],
            },
          });
          m.addLayer({ id: `${src}-line`, type: "line", source: src, paint: { "line-color": border, "line-width": src === "az" ? 0.9 : 1.4 } });
          m.addLayer({
            id: `${src}-sel`,
            type: "line",
            source: src,
            filter: ["==", ["get", "id"], ""],
            paint: { "line-color": "#18262e", "line-width": 2.4 },
          });
          m.on("mousemove", `${src}-fill`, (e: import("maplibre-gl").MapLayerMouseEvent) => {
            const id = e.features?.[0]?.properties?.id as string | undefined;
            m.getCanvas().style.cursor = id ? "pointer" : "";
            if (hovered.current && hovered.current !== id) m.setFeatureState({ source: src, id: hovered.current }, { hover: false });
            if (id) m.setFeatureState({ source: src, id }, { hover: true });
            hovered.current = id ?? null;
            cb.current.onHover(id ?? null, e.point.x, e.point.y);
          });
          m.on("mouseleave", `${src}-fill`, () => {
            if (hovered.current) m.setFeatureState({ source: src, id: hovered.current }, { hover: false });
            hovered.current = null;
            m.getCanvas().style.cursor = "";
            cb.current.onHover(null, 0, 0);
          });
          m.on("click", `${src}-fill`, (e: import("maplibre-gl").MapLayerMouseEvent) => {
            const id = e.features?.[0]?.properties?.id as string | undefined;
            if (id) cb.current.onSelect(id);
          });
        }
        // H3 micro-areas (zoomed in): coloured by the active metric, hover + click
        m.addSource("hexes", { type: "geojson", data: hexGeo, promoteId: "id" });
        m.addLayer({ id: "hex-fill", type: "fill", source: "hexes", minzoom: 10.3, paint: { "fill-color": ["coalesce", ["feature-state", "c"], "rgba(0,0,0,0)"], "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10.3, 0, 11, 0.78] } });
        m.addLayer({ id: "hex-line", type: "line", source: "hexes", minzoom: 10.3, paint: { "line-color": border, "line-width": 0.5, "line-opacity": 0.9 } });
        // region outline drawn above the honeycomb so each district reads as its own cut shape
        for (const src of ["az", "baku"]) m.addLayer({ id: `${src}-top`, type: "line", source: src, minzoom: 10.3, paint: { "line-color": border, "line-width": 2.2 } });
        m.addLayer({ id: "hex-hl", type: "line", source: "hexes", filter: ["in", ["get", "id"], ["literal", []]], paint: { "line-color": "#18262e", "line-width": 2.6 } });
        for (const src of ["az", "baku"]) m.addLayer({ id: `${src}-hl`, type: "line", source: src, filter: ["in", ["get", "id"], ["literal", []]], paint: { "line-color": "#0f4c5c", "line-width": 3 } });
        m.on("mousemove", "hex-fill", (e: import("maplibre-gl").MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) cb.current.onHover(`hex:${id}`, e.point.x, e.point.y);
        });
        m.on("click", "hex-fill", (e: import("maplibre-gl").MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) cb.current.onSelectHex(id);
        });
        // Baku POI dots (zoomed in)
        m.addSource("pois", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: pois.pts.map((p: [number, number, number]) => ({ type: "Feature", properties: { c: p[2] }, geometry: { type: "Point", coordinates: [p[0], p[1]] } })),
          },
        });
        m.addLayer({
          id: "pois",
          type: "circle",
          source: "pois",
          minzoom: 11.5,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 11.5, 1.6, 15, 4],
            "circle-color": ["match", ["get", "c"], ...POI_COLORS.flatMap((c, i) => [i, c]), "#888"] as unknown as string,
            "circle-opacity": 0.85,
            "circle-stroke-width": 0.5,
            "circle-stroke-color": border,
          },
        });
        ready.current = true;
        applyLevel(level);
        animateTo(colorsRef.current, true);
        paintHexes(hexColorsRef.current);
        showHighlights(hlRef.current);
        buildLabels(maplibregl);
      });
      m.on("zoom", updateLabels);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hovered = useRef<string | null>(null);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;
  const levelRef = useRef(level);
  levelRef.current = level;
  const regionsRef = useRef(regions);
  regionsRef.current = regions;

  function applyLevel(lv: Level) {
    const m = map.current;
    if (!m || !ready.current) return;
    for (const l of ["rayon", "baku_district"] as Level[]) {
      const vis = l === lv ? "visible" : "none";
      for (const suf of ["shadow", "fill", "line", "sel", "top"]) m.setLayoutProperty(`${SRC[l]}-${suf}`, "visibility", vis);
    }
    m.setLayoutProperty("pois", "visibility", lv === "baku_district" ? "visible" : "none");
    m.fitBounds(BOUNDS[lv], { padding: 24, duration: 900 });
    updateLabels();
  }

  function buildLabels(maplibregl: typeof import("maplibre-gl")) {
    const m = map.current;
    if (!m) return;
    const all = regionsRef.current;
    // largest areas / populations get labels first
    for (const lv of ["rayon", "baku_district"] as Level[]) {
      const rs = all.filter((r) => r.level === lv).sort((a, b) => (b.population.v ?? 0) - (a.population.v ?? 0));
      rs.forEach((r, i) => {
        const div = document.createElement("div");
        div.className = `map-label${i < 8 ? " major" : ""}`;
        div.textContent = r.name;
        const mk = new maplibregl.Marker({ element: div }).setLngLat(r.centroid).addTo(m);
        markers.current.push({ m: mk, level: lv, rank: i, el: div });
      });
    }
    updateLabels();
  }

  function updateLabels() {
    const m = map.current;
    if (!m) return;
    const z = m.getZoom();
    for (const { level: lv, rank, el: d } of markers.current) {
      let show = lv === levelRef.current;
      if (show && lv === "rayon") show = z > 7.6 || rank < (z > 6.9 ? 30 : 12);
      if (show && lv === "baku_district") show = z > 9.9 || rank < (z > 9.2 ? 9 : 6);
      d.style.display = show ? "" : "none";
    }
  }

  function animateTo(target: Record<string, string>, instant = false) {
    const m = map.current;
    if (!m || !ready.current) return;
    if (anim.current) cancelAnimationFrame(anim.current);
    const src = SRC[levelRef.current];
    const rs = regionsRef.current.filter((r) => r.level === levelRef.current);
    const lons = rs.map((r) => r.centroid[0]);
    const minL = Math.min(...lons), span = Math.max(...lons) - minL || 1;
    const from = { ...current.current };
    const DUR = instant ? 1 : 650, STAGGER = instant ? 0 : 550;
    const t0 = performance.now();
    const step = (now: number) => {
      let done = true;
      for (const r of rs) {
        const delay = ((r.centroid[0] - minL) / span) * STAGGER;
        const t = Math.min(1, Math.max(0, (now - t0 - delay) / DUR));
        if (t < 1) done = false;
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const a = from[r.id] ?? target[r.id] ?? "#d3cbb8";
        const b = target[r.id] ?? "#d3cbb8";
        m.setFeatureState({ source: src, id: r.id }, { c: a.startsWith("#") && b.startsWith("#") ? lerpHex(a, b, e) : b });
        if (t >= 1) current.current[r.id] = b;
      }
      if (!done) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }

  function paintHexes(hc: Record<string, string>) {
    const m = map.current;
    if (!m || !ready.current) return;
    for (const [id, c] of Object.entries(hc)) m.setFeatureState({ source: "hexes", id }, { c });
  }

  function showHighlights(hl: Highlight[]) {
    const m = map.current;
    const ml = mlRef.current;
    if (!m || !ml || !ready.current) return;
    pins.current.forEach((p) => p.remove());
    pins.current = [];
    const hexIds = hl.filter((h) => h.kind === "hex").map((h) => h.area_id);
    const regIds = hl.filter((h) => h.kind !== "hex").map((h) => (h.kind === "region" ? h.area_id : h.region_id ?? ""));
    m.setFilter("hex-hl", ["in", ["get", "id"], ["literal", hexIds]]);
    for (const src of ["az", "baku"]) m.setFilter(`${src}-hl`, ["in", ["get", "id"], ["literal", regIds]]);
    if (!hl.length) return;
    for (const h of hl) {
      const el = document.createElement("button");
      el.className = "map-pin";
      el.textContent = String(h.rank);
      el.setAttribute("aria-label", `Tövsiyə ${h.rank}`);
      el.onclick = (ev) => {
        ev.stopPropagation();
        if (h.kind === "hex") cb.current.onSelectHex(h.area_id);
        else cb.current.onSelect(h.kind === "region" ? h.area_id : h.region_id ?? h.area_id);
      };
      pins.current.push(new ml.Marker({ element: el }).setLngLat(h.centroid).addTo(m));
    }
    const xs = hl.map((h) => h.centroid[0]), ys = hl.map((h) => h.centroid[1]);
    m.fitBounds([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], { padding: 80, maxZoom: hl[0].kind === "hex" ? 12.4 : hl[0].kind === "settlement" ? 9.2 : 8.2, duration: 1400, essential: true });
  }

  useEffect(() => {
    paintHexes(hexColors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hexColors]);

  useEffect(() => {
    showHighlights(highlights);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights]);

  useEffect(() => {
    applyLevel(level);
    current.current = {};
    animateTo(colors, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  useEffect(() => {
    animateTo(colors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    for (const l of ["az", "baku"]) m.setFilter(`${l}-sel`, ["==", ["get", "id"], selectedId ?? ""]);
    const r = regionsRef.current.find((x) => x.id === selectedId);
    if (r && r.level === "baku_district" && levelRef.current === "baku_district") m.easeTo({ center: r.centroid, zoom: Math.max(m.getZoom(), 10.6), duration: 700 });
  }, [selectedId]);

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" aria-label="Azərbaycan xəritəsi" role="region" />
    </div>
  );
}

export type { GeoJSONSource };
