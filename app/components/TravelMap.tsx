"use client";

import maplibregl, {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  Popup,
  StyleSpecification
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";
import type { MapFeature, MapLayerDto } from "@/app/lib/types";

type Props = {
  layer: MapLayerDto;
  contextLayer: MapLayerDto | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDrill: (id: string) => void;
  onJump: (id: string) => void;
};

const CURRENT_SOURCE = "current-places";
const CONTEXT_SOURCE = "context-countries";
const CONTEXT_FILL = "context-countries-fill";
const CONTEXT_LINE = "context-countries-line";
const CURRENT_FILL = "current-places-fill";
const CURRENT_LINE = "current-places-line";
const CURRENT_CIRCLE = "current-places-circle";
const INTERACTIVE_LAYERS = [CURRENT_FILL, CURRENT_CIRCLE] as const;

let protocolRefCount = 0;
let protocol: Protocol | null = null;

function retainPmtilesProtocol() {
  if (protocolRefCount === 0) {
    protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
  }
  protocolRefCount += 1;
}

function releasePmtilesProtocol() {
  protocolRefCount = Math.max(0, protocolRefCount - 1);
  if (protocolRefCount === 0) {
    maplibregl.removeProtocol("pmtiles");
    protocol = null;
  }
}

export default function TravelMap({
  layer,
  contextLayer,
  selectedId,
  onSelect,
  onDrill,
  onJump
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onDrillRef = useRef(onDrill);
  const onJumpRef = useRef(onJump);
  const initialLayerRef = useRef(layer);
  const initialContextLayerRef = useRef(contextLayer);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    updateSelectedPaint(mapRef.current, selectedId);
  }, [selectedId]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onDrillRef.current = onDrill;
  }, [onDrill]);

  useEffect(() => {
    onJumpRef.current = onJump;
  }, [onJump]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialLayer = initialLayerRef.current;
    retainPmtilesProtocol();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createStyle(initialLayer, initialContextLayerRef.current),
      center: getLayerCenter(initialLayer),
      zoom: 2,
      minZoom: 1.2,
      maxZoom: 10,
      attributionControl: false
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.doubleClickZoom.disable();

    const handleSelect = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const id = getFeatureId(feature);
      if (id) onSelectRef.current(id);
    };

    const handleDrill = (event: MapLayerMouseEvent) => {
      event.preventDefault();
      const feature = event.features?.[0];
      const id = getFeatureId(feature);
      if (id) onDrillRef.current(id);
    };

    const handleJump = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const id = getFeatureId(feature);
      if (id) onJumpRef.current(id);
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseMove = (event: MapLayerMouseEvent) => {
      const properties = event.features?.[0]?.properties as MapFeature["properties"] | undefined;
      if (!properties) return;
      const popup = popupRef.current ?? new Popup({ closeButton: false, closeOnClick: false });
      popupRef.current = popup;
      popup.setLngLat(event.lngLat).setHTML(tooltipHtml(properties)).addTo(map);
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    };

    map.on("load", () => {
      updateSelectedPaint(map, selectedIdRef.current);
      fitLayer(map, initialLayer, false);
    });

    for (const layerId of INTERACTIVE_LAYERS) {
      map.on("click", layerId, handleSelect);
      map.on("dblclick", layerId, handleDrill);
      map.on("mouseenter", layerId, handleMouseEnter);
      map.on("mousemove", layerId, handleMouseMove);
      map.on("mouseleave", layerId, handleMouseLeave);
    }

    map.on("click", CONTEXT_FILL, handleJump);
    map.on("mouseenter", CONTEXT_FILL, handleMouseEnter);
    map.on("mouseleave", CONTEXT_FILL, handleMouseLeave);

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      releasePmtilesProtocol();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateData = () => {
      const source = map.getSource(CURRENT_SOURCE) as GeoJSONSource | undefined;
      source?.setData(toGeoJson(layer));
      updateSelectedPaint(map, selectedIdRef.current);
      fitLayer(map, layer, true);
    };

    if (map.isStyleLoaded()) updateData();
    else map.once("load", updateData);
  }, [layer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateContext = () => {
      const source = map.getSource(CONTEXT_SOURCE) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData(toGeoJson(contextLayer ?? emptyFeatureCollection()));
    };

    if (map.isStyleLoaded()) updateContext();
    else map.once("load", updateContext);
  }, [contextLayer]);

  return <div ref={containerRef} className="mapCanvas" />;
}

function createStyle(layer: MapLayerDto, contextLayer: MapLayerDto | null): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap contributors"
      },
      adm0: {
        type: "vector",
        url: "pmtiles:///data/world-adm0.pmtiles"
      },
      adm1: {
        type: "vector",
        url: "pmtiles:///data/world-adm1.pmtiles"
      },
      [CURRENT_SOURCE]: {
        type: "geojson",
        data: toGeoJson(layer)
      },
      [CONTEXT_SOURCE]: {
        type: "geojson",
        data: toGeoJson(contextLayer ?? emptyFeatureCollection())
      }
    },
    layers: [
      {
        id: "osm",
        type: "raster",
        source: "osm",
        paint: { "raster-opacity": 0.52 }
      },
      {
        id: "adm0-fill",
        type: "fill",
        source: "adm0",
        "source-layer": "adm0",
        paint: {
          "fill-color": "#edf4ef",
          "fill-opacity": 0.2
        }
      },
      {
        id: "adm0-line",
        type: "line",
        source: "adm0",
        "source-layer": "adm0",
        paint: {
          "line-color": "#64746f",
          "line-opacity": 0.35,
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 5, 0.9]
        }
      },
      {
        id: "adm1-line",
        type: "line",
        source: "adm1",
        "source-layer": "adm1",
        minzoom: 2,
        paint: {
          "line-color": "#6b7f79",
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.16, 6, 0.45],
          "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.25, 6, 0.8]
        }
      },
      {
        id: CONTEXT_FILL,
        type: "fill",
        source: CONTEXT_SOURCE,
        filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": 0
        }
      },
      {
        id: CONTEXT_LINE,
        type: "line",
        source: CONTEXT_SOURCE,
        filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
        paint: {
          "line-color": "#94a3b8",
          "line-opacity": 0.22,
          "line-width": 0.8
        }
      },
      {
        id: CURRENT_FILL,
        type: "fill",
        source: CURRENT_SOURCE,
        filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["get", "visited"], false],
            "#14b8a6",
            "#f8fafc"
          ],
          "fill-opacity": [
            "case",
            ["==", ["get", "id"], ""],
            0.48,
            ["boolean", ["get", "visited"], false],
            0.42,
            0.24
          ]
        }
      },
      {
        id: CURRENT_LINE,
        type: "line",
        source: CURRENT_SOURCE,
        filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "id"], ""],
            "#101827",
            ["boolean", ["get", "visited"], false],
            "#0f766e",
            "#475569"
          ],
          "line-opacity": 0.96,
          "line-width": ["case", ["==", ["get", "id"], ""], 2.4, 1.2]
        }
      },
      {
        id: CURRENT_CIRCLE,
        type: "circle",
        source: CURRENT_SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "id"], ""],
            ["case", ["==", ["get", "level"], "CITY"], 13, 17],
            ["case", ["==", ["get", "level"], "CITY"], 8, 12]
          ],
          "circle-color": [
            "case",
            ["boolean", ["get", "visited"], false],
            "#14b8a6",
            "#f8fafc"
          ],
          "circle-opacity": ["case", ["boolean", ["get", "visited"], false], 0.88, 0.75],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "id"], ""],
            "#101827",
            ["boolean", ["get", "visited"], false],
            "#0f766e",
            "#475569"
          ],
          "circle-stroke-width": ["case", ["==", ["get", "id"], ""], 3, 2]
        }
      }
    ]
  };
}

function updateSelectedPaint(map: MapLibreMap | null, selectedId: string | null) {
  if (!map?.getLayer(CURRENT_FILL)) return;
  const selected = selectedId ?? "";

  map.setPaintProperty(CURRENT_FILL, "fill-opacity", [
    "case",
    ["==", ["get", "id"], selected],
    0.48,
    ["boolean", ["get", "visited"], false],
    0.42,
    0.24
  ]);
  map.setPaintProperty(CURRENT_LINE, "line-color", [
    "case",
    ["==", ["get", "id"], selected],
    "#101827",
    ["boolean", ["get", "visited"], false],
    "#0f766e",
    "#475569"
  ]);
  map.setPaintProperty(CURRENT_LINE, "line-width", [
    "case",
    ["==", ["get", "id"], selected],
    2.4,
    1.2
  ]);
  map.setPaintProperty(CURRENT_CIRCLE, "circle-radius", [
    "case",
    ["==", ["get", "id"], selected],
    ["case", ["==", ["get", "level"], "CITY"], 13, 17],
    ["case", ["==", ["get", "level"], "CITY"], 8, 12]
  ]);
  map.setPaintProperty(CURRENT_CIRCLE, "circle-stroke-color", [
    "case",
    ["==", ["get", "id"], selected],
    "#101827",
    ["boolean", ["get", "visited"], false],
    "#0f766e",
    "#475569"
  ]);
  map.setPaintProperty(CURRENT_CIRCLE, "circle-stroke-width", [
    "case",
    ["==", ["get", "id"], selected],
    3,
    2
  ]);
}

function toGeoJson(layer: MapLayerDto) {
  return layer as unknown as FeatureCollection;
}

function emptyFeatureCollection(): MapLayerDto {
  return {
    type: "FeatureCollection",
    attribution: "",
    features: []
  };
}

function fitLayer(map: MapLibreMap, layer: MapLayerDto, animate: boolean) {
  const bounds = getLayerBounds(layer);
  if (!bounds) return;

  map.resize();
  map.fitBounds(bounds, {
    animate,
    padding: 48,
    maxZoom: layer.features.length === 1 ? 5 : 4
  });
}

function getLayerCenter(layer: MapLayerDto): [number, number] {
  const bounds = getLayerBounds(layer);
  if (!bounds) return [15, 22];
  const center = bounds.getCenter();
  return [center.lng, center.lat];
}

function getLayerBounds(layer: MapLayerDto) {
  const bounds = new LngLatBounds();

  for (const feature of layer.features) {
    visitCoordinates(feature.geometry.coordinates, (lng, lat) => bounds.extend([lng, lat]));
  }

  return bounds.isEmpty() ? null : bounds;
}

function visitCoordinates(coordinates: unknown, visitor: (lng: number, lat: number) => void) {
  if (!Array.isArray(coordinates)) return;
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    visitor(coordinates[0], coordinates[1]);
    return;
  }

  for (const child of coordinates) visitCoordinates(child, visitor);
}

function getFeatureId(feature: { properties?: Record<string, unknown> } | undefined) {
  const id = feature?.properties?.id;
  return typeof id === "string" ? id : null;
}

function tooltipHtml(properties: MapFeature["properties"]) {
  const title = escapeHtml(properties.nativeName ?? properties.name);
  const detail =
    properties.totalChildren > 0
      ? `${properties.visitedChildren}/${properties.totalChildren}`
      : properties.visited
        ? "已去过"
        : "未去过";
  return `<strong>${title}</strong><br />${escapeHtml(detail)}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return char;
    }
  });
}
