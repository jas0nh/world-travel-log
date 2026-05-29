"use client";

import maplibregl, {
  ExpressionSpecification,
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  Popup,
  FilterSpecification,
  StyleSpecification
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import { Crosshair, Globe2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import type { FeatureCollection } from "geojson";
import type { MapFeature, MapLayerDto } from "@/app/lib/types";

type Props = {
  layer: MapLayerDto;
  contextLayer: MapLayerDto | null;
  selectedId: string | null;
  skipFitToken: number;
  onSelect: (id: string) => void;
  onDrill: (id: string) => void;
  onJump: (id: string) => void;
  onBack: () => void;
  onWorld: () => void;
};

const CURRENT_SOURCE = "current-places";
const CONTEXT_SOURCE = "context-countries";
const CONTEXT_FILL = "context-countries-fill";
const CONTEXT_LINE = "context-countries-line";
const CURRENT_FILL = "current-places-fill";
const CURRENT_LINE = "current-places-line";
const CURRENT_CIRCLE = "current-places-circle";
const INTERACTIVE_LAYERS = [CURRENT_FILL, CURRENT_CIRCLE] as const;
const AREA_FILTER: FilterSpecification = ["==", "$type", "Polygon"];
const POINT_FILTER: FilterSpecification = ["==", "$type", "Point"];
const NON_COUNTRY_POINT_FILTER: FilterSpecification = ["all", POINT_FILTER, ["!=", "level", "COUNTRY"]];
const HIT_TOLERANCE = 22;

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
  skipFitToken,
  onSelect,
  onDrill,
  onJump,
  onBack,
  onWorld
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onDrillRef = useRef(onDrill);
  const onJumpRef = useRef(onJump);
  const onBackRef = useRef(onBack);
  const onWorldRef = useRef(onWorld);
  const layerRef = useRef(layer);
  const layerViewKeyRef = useRef(getLayerViewKey(layer));
  const skipFitTokenRef = useRef(skipFitToken);
  const initialLayerRef = useRef(layer);
  const initialContextLayerRef = useRef(contextLayer);

  useEffect(() => {
    layerRef.current = layer;
    selectedIdRef.current = selectedId;
    updateSelectedPaint(mapRef.current, selectedId);
  }, [layer, selectedId]);

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
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    onWorldRef.current = onWorld;
  }, [onWorld]);

  useEffect(() => {
    skipFitTokenRef.current = skipFitToken;
  }, [skipFitToken]);

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

    const findCurrentFeature = (event: MapLayerMouseEvent) => {
      const exactFeature = map.queryRenderedFeatures(event.point, {
        layers: [CURRENT_CIRCLE, CURRENT_FILL]
      })[0];
      if (exactFeature) return exactFeature;

      const nearbyFeature = map.queryRenderedFeatures(
        [
          [event.point.x - HIT_TOLERANCE, event.point.y - HIT_TOLERANCE],
          [event.point.x + HIT_TOLERANCE, event.point.y + HIT_TOLERANCE]
        ],
        { layers: [CURRENT_CIRCLE, CURRENT_FILL] }
      )[0];

      return nearbyFeature ?? event.features?.[0];
    };

    const handleSelect = (event: MapLayerMouseEvent) => {
      const feature = findCurrentFeature(event);
      const id = getFeatureId(feature);
      if (id) onSelectRef.current(id);
    };

    const handleDrill = (event: MapLayerMouseEvent) => {
      event.preventDefault();
      const feature = findCurrentFeature(event);
      const id = getFeatureId(feature);
      if (id) onDrillRef.current(id);
    };

    const handleJump = (event: MapLayerMouseEvent) => {
      if (isPointLayer(layerRef.current)) return;

      const currentFeature = findCurrentFeature(event);
      if (getFeatureId(currentFeature)) return;

      const feature = event.features?.[0];
      const id = getFeatureId(feature);
      if (id) onJumpRef.current(id);
    };

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      if (!hasParentView(layerRef.current)) return;

      const currentFeature = map.queryRenderedFeatures(event.point, {
        layers: [CURRENT_CIRCLE, CURRENT_FILL]
      })[0];
      if (getFeatureId(currentFeature)) return;

      onBackRef.current();
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseMove = (event: MapLayerMouseEvent) => {
      const feature = findCurrentFeature(event);
      const properties = feature?.properties as MapFeature["properties"] | undefined;
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
    map.on("click", handleMapClick);
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
      const nextViewKey = getLayerViewKey(layer);
      if (layerViewKeyRef.current !== nextViewKey) {
        if (skipFitTokenRef.current > 0) {
          skipFitTokenRef.current = 0;
        } else {
          fitLayer(map, layer, true);
        }
        layerViewKeyRef.current = nextViewKey;
      }
    };

    if (map.getSource(CURRENT_SOURCE)) updateData();
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

    if (map.getSource(CONTEXT_SOURCE)) updateContext();
    else map.once("load", updateContext);
  }, [contextLayer]);

  const stopControlEvent = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleWorldClick = (event: MouseEvent) => {
    stopControlEvent(event);
    if (hasParentView(layerRef.current)) {
      onWorldRef.current();
      return;
    }
    if (mapRef.current) fitLayer(mapRef.current, layerRef.current, true);
  };

  const handleRecenterClick = (event: MouseEvent) => {
    stopControlEvent(event);
    if (mapRef.current) fitSelectedOrLayer(mapRef.current, layerRef.current, selectedIdRef.current);
  };

  return (
    <div ref={containerRef} className="mapCanvas">
      <div className="mapQuickControls" aria-label="地图快捷操作">
        <button
          type="button"
          title="回到世界地图"
          aria-label="回到世界地图"
          onClick={handleWorldClick}
          onMouseDown={stopControlEvent}
          onDoubleClick={stopControlEvent}
        >
          <Globe2 size={17} />
        </button>
        <button
          type="button"
          title="居中当前选中区域"
          aria-label="居中当前选中区域"
          onClick={handleRecenterClick}
          onMouseDown={stopControlEvent}
          onDoubleClick={stopControlEvent}
        >
          <Crosshair size={17} />
        </button>
      </div>
    </div>
  );
}

function createStyle(layer: MapLayerDto, contextLayer: MapLayerDto | null): StyleSpecification {
  const fillColor: ExpressionSpecification = ["match", ["get", "displayStatus"], "VISITED", "#14b8a6", "PLANNED", "#f59e0b", "VISITED_WITH_PLANNED_CHILDREN", "#0b5d57", "#f8fafc"];
  const lineColor: ExpressionSpecification = ["match", ["get", "displayStatus"], "VISITED", "#0f766e", "PLANNED", "#b45309", "VISITED_WITH_PLANNED_CHILDREN", "#b45309", "#475569"];
  const circleColor: ExpressionSpecification = ["match", ["get", "displayStatus"], "VISITED", "#14b8a6", "PLANNED", "#f59e0b", "VISITED_WITH_PLANNED_CHILDREN", "#0b5d57", "#f8fafc"];
  const fillOpacity: ExpressionSpecification = [
    "case",
    ["==", ["get", "id"], ""],
    0.48,
    ["match", ["get", "displayStatus"], "VISITED", true, "PLANNED", true, "VISITED_WITH_PLANNED_CHILDREN", true, false],
    0.42,
    0.24
  ];

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
        filter: AREA_FILTER,
        paint: {
          "fill-color": "#ffffff",
          "fill-opacity": 0
        }
      },
      {
        id: CONTEXT_LINE,
        type: "line",
        source: CONTEXT_SOURCE,
        filter: AREA_FILTER,
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
        filter: AREA_FILTER,
        paint: {
          "fill-color": fillColor,
          "fill-opacity": fillOpacity
        }
      },
      {
        id: CURRENT_LINE,
        type: "line",
        source: CURRENT_SOURCE,
        filter: AREA_FILTER,
        paint: {
          "line-color": lineColor,
          "line-opacity": 0.96,
          "line-width": ["case", ["==", ["get", "id"], ""], 2.4, 1.2]
        }
      },
      {
        id: CURRENT_CIRCLE,
        type: "circle",
        source: CURRENT_SOURCE,
        filter: NON_COUNTRY_POINT_FILTER,
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "id"], ""],
            ["case", ["==", ["get", "level"], "CITY"], 13, 17],
            ["case", ["==", ["get", "level"], "CITY"], 8, 12]
          ],
          "circle-color": circleColor,
          "circle-opacity": [
            "case",
            ["match", ["get", "displayStatus"], "VISITED", true, "PLANNED", true, "VISITED_WITH_PLANNED_CHILDREN", true, false],
            0.88,
            0.75
          ],
          "circle-stroke-color": lineColor,
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
    ["match", ["get", "displayStatus"], "VISITED", true, "PLANNED", true, "VISITED_WITH_PLANNED_CHILDREN", true, false],
    0.42,
    0.24
  ]);
  map.setPaintProperty(CURRENT_LINE, "line-color", [
    "case",
    ["==", ["get", "id"], selected],
    "#101827",
    ["match", ["get", "displayStatus"], "VISITED", "#0f766e", "PLANNED", "#b45309", "VISITED_WITH_PLANNED_CHILDREN", "#b45309", "#475569"]
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
    ["match", ["get", "displayStatus"], "VISITED", "#0f766e", "PLANNED", "#b45309", "VISITED_WITH_PLANNED_CHILDREN", "#b45309", "#475569"]
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

function getLayerViewKey(layer: MapLayerDto) {
  return layer.features.map((feature) => feature.id).join("|");
}

function emptyFeatureCollection(): MapLayerDto {
  return {
    type: "FeatureCollection",
    attribution: "",
    features: []
  };
}

function isPointLayer(layer: MapLayerDto) {
  return layer.features.some((feature) => feature.geometry.type === "Point");
}

function hasParentView(layer: MapLayerDto) {
  return layer.features.some((feature) => Boolean(feature.properties.parentId));
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

function fitSelectedOrLayer(map: MapLibreMap, layer: MapLayerDto, selectedId: string | null) {
  const selectedFeature = selectedId ? layer.features.find((feature) => feature.id === selectedId) : null;
  const bounds = selectedFeature ? getFeatureBounds(selectedFeature) : getLayerBounds(layer);
  if (!bounds) return;

  map.resize();
  map.fitBounds(bounds, {
    animate: true,
    padding: selectedFeature ? 76 : 48,
    maxZoom: selectedFeature ? 6 : layer.features.length === 1 ? 5 : 4
  });
}

function getFeatureBounds(feature: MapFeature) {
  const bounds = new LngLatBounds();
  visitCoordinates(feature.geometry.coordinates, (lng, lat) => bounds.extend([lng, lat]));
  return bounds.isEmpty() ? null : bounds;
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
      ? `${properties.visitedChildren}/${properties.totalChildren} 已到访${properties.plannedChildren ? ` · ${properties.plannedChildren} 个计划中` : ""}`
      : properties.visitStatus === "VISITED"
        ? "已到访"
        : properties.visitStatus === "PLANNED"
          ? "计划中"
          : "未标记";
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
