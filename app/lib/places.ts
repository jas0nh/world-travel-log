import { DatePrecision, PlaceLevel, Prisma, type Visit } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import type { MapFeature, MapLayerDto, OverviewDto, PlaceDto, ProgressDto } from "./types";

const childLevelByParent: Record<PlaceLevel, PlaceLevel | null> = {
  COUNTRY: PlaceLevel.REGION,
  REGION: PlaceLevel.CITY,
  CITY: null
};

const antimeridianIsoNumerics = new Set([
  "242", // Fiji
  "643" // Russia
]);

const cityStateCountryCodes = new Set(["SG"]);
const cityStateCountryIds = new Set(["country-sg"]);
type ChildVisitSummary = { visit: unknown };

export function nextLevel(level?: PlaceLevel | null) {
  if (!level) return PlaceLevel.COUNTRY;
  return childLevelByParent[level];
}

export async function listPlaces(params: {
  level?: PlaceLevel;
  parentId?: string | null;
}) {
  const where: Prisma.PlaceWhereInput = {};

  if (params.parentId) {
    if (cityStateCountryIds.has(params.parentId)) {
      const countryCode = params.parentId.replace("country-", "").toUpperCase();
      return listCityStateCities(countryCode);
    }
    where.parentId = params.parentId;
  } else {
    where.level = params.level ?? PlaceLevel.COUNTRY;
    where.parentId = null;
  }

  const places = await prisma.place.findMany({
    where,
    include: {
      visit: true,
      children: {
        include: { visit: true }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  const cityStateChildren = !params.parentId
    ? await loadCityStateChildren()
    : new Map<string, ChildVisitSummary[]>();

  return places.map<PlaceDto>((place) => {
    const visibleChildren = cityStateChildren.get(place.id);
    const children = visibleChildren ?? place.children;

    return {
      id: place.id,
      name: place.name,
      nativeName: place.nativeName,
      level: place.level,
      code: place.code,
      isoNumeric: place.isoNumeric,
      countryCode: place.countryCode,
      lat: place.lat,
      lng: place.lng,
      parentId: place.parentId,
      totalChildren: children.length,
      visitedChildren: children.filter((child) => child.visit).length,
      visited: Boolean(place.visit),
      visitedAt: place.visit?.visitedAt?.toISOString() ?? null,
      datePrecision: place.visit?.datePrecision ?? DatePrecision.UNKNOWN,
      visitedYear: place.visit?.visitedYear ?? null,
      visitedMonth: place.visit?.visitedMonth ?? null,
      visitedDay: place.visit?.visitedDay ?? null,
      isDerived: place.visit?.isDerived ?? false,
      note: place.visit?.note ?? null
    };
  });
}

export async function getProgress(parentId?: string | null): Promise<ProgressDto> {
  const places = await prisma.place.findMany({
    where: parentId ? { parentId } : { parentId: null, level: PlaceLevel.COUNTRY },
    include: { visit: true }
  });

  return {
    parentId: parentId ?? null,
    level: places[0]?.level ?? PlaceLevel.COUNTRY,
    total: places.length,
    visited: places.filter((place) => place.visit).length
  };
}

export async function getOverview(): Promise<OverviewDto> {
  const [countries, chinaRegions, chinaCities, visits] = await Promise.all([
    prisma.place.findMany({
      where: { parentId: null, level: PlaceLevel.COUNTRY },
      include: { visit: true }
    }),
    prisma.place.findMany({
      where: { parentId: "country-cn", level: PlaceLevel.REGION },
      include: { visit: true }
    }),
    prisma.place.findMany({
      where: { countryCode: "CN", level: PlaceLevel.CITY },
      include: { visit: true }
    }),
    prisma.visit.findMany({
      where: { isDerived: false },
      include: {
        place: {
          include: { parent: true }
        }
      },
      orderBy: [{ visitedYear: "desc" }, { visitedMonth: "desc" }, { visitedDay: "desc" }, { updatedAt: "desc" }]
    })
  ]);

  const visitItems = visits.map((visit) => ({
    id: visit.id,
    placeId: visit.placeId,
    placeName: visit.place.name,
    placeNativeName: visit.place.nativeName,
    level: visit.place.level,
    parentName: visit.place.parent?.nativeName ?? visit.place.parent?.name ?? null,
    dateLabel: formatVisitDate(visit),
    datePrecision: visit.datePrecision,
    note: visit.note
  }));

  const timelineByYear = new Map<number | null, typeof visitItems>();
  for (const [index, item] of visitItems.entries()) {
    const year = visits[index]?.visitedYear ?? null;
    timelineByYear.set(year, [...(timelineByYear.get(year) ?? []), item]);
  }

  return {
    progress: {
      countries: progressFromPlaces(countries, null, PlaceLevel.COUNTRY),
      chinaRegions: progressFromPlaces(chinaRegions, "country-cn", PlaceLevel.REGION),
      chinaCities: progressFromPlaces(chinaCities, "country-cn", PlaceLevel.CITY)
    },
    timeline: [...timelineByYear.entries()]
      .sort(([yearA], [yearB]) => {
        if (yearA === yearB) return 0;
        if (yearA === null) return 1;
        if (yearB === null) return -1;
        return yearB - yearA;
      })
      .map(([year, groupedVisits]) => ({ year, visits: groupedVisits })),
    recent: visitItems.slice(0, 8).map((item) => ({
      id: item.id,
      placeId: item.placeId,
      placeName: item.placeName,
      placeNativeName: item.placeNativeName,
      level: item.level,
      dateLabel: item.dateLabel,
      datePrecision: item.datePrecision,
      note: item.note
    }))
  };
}

function progressFromPlaces(
  places: Array<{ visit: unknown }>,
  parentId: string | null,
  level: PlaceLevel
): ProgressDto {
  return {
    parentId,
    level,
    total: places.length,
    visited: places.filter((place) => place.visit).length
  };
}

async function listCityStateCities(countryCode: string) {
  const places = await prisma.place.findMany({
    where: {
      countryCode,
      level: PlaceLevel.CITY
    },
    include: {
      visit: true,
      children: {
        include: { visit: true }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  return places.map<PlaceDto>((place) => ({
    id: place.id,
    name: place.name,
    nativeName: place.nativeName,
    level: place.level,
    code: place.code,
    isoNumeric: place.isoNumeric,
    countryCode: place.countryCode,
    lat: place.lat,
    lng: place.lng,
    parentId: place.parentId,
    totalChildren: place.children.length,
    visitedChildren: place.children.filter((child) => child.visit).length,
    visited: Boolean(place.visit),
    visitedAt: place.visit?.visitedAt?.toISOString() ?? null,
    datePrecision: place.visit?.datePrecision ?? DatePrecision.UNKNOWN,
    visitedYear: place.visit?.visitedYear ?? null,
    visitedMonth: place.visit?.visitedMonth ?? null,
    visitedDay: place.visit?.visitedDay ?? null,
    isDerived: place.visit?.isDerived ?? false,
    note: place.visit?.note ?? null
  }));
}

async function loadCityStateChildren() {
  const countries = await prisma.place.findMany({
    where: {
      parentId: null,
      level: PlaceLevel.COUNTRY,
      code: { in: [...cityStateCountryCodes] }
    },
    select: { id: true, code: true }
  });

  if (!countries.length) return new Map<string, ChildVisitSummary[]>();

  const children = await prisma.place.findMany({
    where: {
      countryCode: {
        in: countries.map((country) => country.code).filter((code): code is string => Boolean(code))
      },
      level: PlaceLevel.CITY
    },
    include: { visit: true }
  });

  const childrenByCountryId = new Map<string, ChildVisitSummary[]>();
  for (const country of countries) {
    childrenByCountryId.set(
      country.id,
      children.filter((child) => child.countryCode === country.code)
    );
  }

  return childrenByCountryId;
}

export function formatVisitDate(
  visit: Pick<Visit, "datePrecision" | "visitedAt" | "visitedYear" | "visitedMonth" | "visitedDay">
) {
  if (visit.datePrecision === DatePrecision.DAY && visit.visitedYear && visit.visitedMonth && visit.visitedDay) {
    return `${visit.visitedYear}-${padDatePart(visit.visitedMonth)}-${padDatePart(visit.visitedDay)}`;
  }
  if (visit.datePrecision === DatePrecision.MONTH && visit.visitedYear && visit.visitedMonth) {
    return `${visit.visitedYear}-${padDatePart(visit.visitedMonth)}`;
  }
  if (visit.datePrecision === DatePrecision.YEAR && visit.visitedYear) {
    return `${visit.visitedYear}`;
  }
  if (visit.visitedAt) {
    return visit.visitedAt.toISOString().slice(0, 10);
  }
  return "日期未填";
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export async function getBreadcrumb(placeId?: string | null) {
  if (!placeId) return [];

  const chain = [];
  let current = await prisma.place.findUnique({ where: { id: placeId } });

  while (current) {
    chain.unshift(current);
    current = current.parentId
      ? await prisma.place.findUnique({ where: { id: current.parentId } })
      : null;
  }

  return chain.map((place) => ({
    id: place.id,
    name: place.nativeName ?? place.name,
    level: place.level
  }));
}

export async function getMapLayer(parentId?: string | null): Promise<MapLayerDto> {
  const places = await listPlaces({ parentId });
  const geometries = await getBoundaryGeometries(parentId);

  return {
    type: "FeatureCollection",
    attribution:
      "Map data: OpenStreetMap contributors, REST Countries, GeoNames, china-geojson (MIT)",
    features: places.map((place) => ({
      type: "Feature",
      id: place.id,
      properties: {
        id: place.id,
        name: place.name,
        nativeName: place.nativeName,
        level: place.level,
        visited: place.visited,
        totalChildren: place.totalChildren,
        visitedChildren: place.visitedChildren
      },
      geometry: {
        type: "Point",
        coordinates: [place.lng, place.lat]
      },
      ...(geometries.get(place.id)
        ? {
            geometry: geometries.get(place.id)!
          }
        : {})
    }))
  };
}

type BoundaryGeometry = MapFeature["geometry"];

type BoundaryFeature = {
  type: "Feature";
  properties: {
    name?: string;
    isoNumeric?: string;
    ne_id?: number | string;
  };
  geometry: BoundaryGeometry;
};

type BoundaryCollection = {
  type: "FeatureCollection";
  features: BoundaryFeature[];
};

let chinaAdm1Cache: BoundaryCollection | null = null;
let worldCountryCache: BoundaryCollection | null = null;
let worldAdm1Cache: BoundaryCollection | null = null;

async function getBoundaryGeometries(parentId?: string | null) {
  const geometries = new Map<string, BoundaryGeometry>();

  if (!parentId) {
    const boundaries = loadWorldCountryBoundaries();
    const places = await prisma.place.findMany({
      where: { parentId: null, level: PlaceLevel.COUNTRY },
      select: { id: true, isoNumeric: true }
    });
    const placeByIsoNumeric = new Map(
      places
        .filter((place) => place.isoNumeric)
        .map((place) => [place.isoNumeric, place])
    );

    for (const feature of boundaries.features) {
      const isoNumeric = feature.properties.isoNumeric;
      if (!isoNumeric) continue;
      const place = placeByIsoNumeric.get(isoNumeric);
      if (place && isAreaGeometry(feature.geometry)) {
        geometries.set(
          place.id,
          antimeridianIsoNumerics.has(isoNumeric)
            ? unwrapAntimeridianGeometry(feature.geometry)
            : feature.geometry
        );
      }
    }

    return geometries;
  }

  if (parentId !== "country-cn") {
    const boundaries = loadWorldAdm1Boundaries();
    if (!boundaries) return geometries;

    const places = await prisma.place.findMany({
      where: { parentId, level: PlaceLevel.REGION },
      select: { id: true, code: true }
    });
    const placeByCode = new Map(
      places
        .filter((place) => place.code)
        .map((place) => [place.code, place])
    );

    for (const feature of boundaries.features) {
      const neId = feature.properties.ne_id;
      if (!neId) continue;
      const place = placeByCode.get(`ne:${String(neId)}`);
      if (place && isAreaGeometry(feature.geometry)) {
        geometries.set(place.id, feature.geometry);
      }
    }

    return geometries;
  }

  const boundaries = loadChinaAdm1Boundaries();
  const places = await prisma.place.findMany({
    where: { parentId: "country-cn" },
    select: { id: true, nativeName: true, name: true }
  });
  const placeByName = new Map(
    places.flatMap((place) => [
      [place.nativeName, place],
      [place.name, place]
    ])
  );

  for (const feature of boundaries.features) {
    const boundaryName = feature.properties.name;
    if (!boundaryName) continue;
    const place = placeByName.get(boundaryName);
    if (place && isAreaGeometry(feature.geometry)) {
      geometries.set(place.id, feature.geometry);
    }
  }

  return geometries;
}

function loadChinaAdm1Boundaries() {
  if (!chinaAdm1Cache) {
    const filePath = path.join(process.cwd(), "app", "data", "china-adm1.geojson");
    chinaAdm1Cache = JSON.parse(readFileSync(filePath, "utf8")) as BoundaryCollection;
  }
  return chinaAdm1Cache;
}

function loadWorldCountryBoundaries() {
  if (!worldCountryCache) {
    const filePath = path.join(process.cwd(), "app", "data", "world-countries-110m.geojson");
    worldCountryCache = JSON.parse(readFileSync(filePath, "utf8")) as BoundaryCollection;
  }
  return worldCountryCache;
}

function loadWorldAdm1Boundaries() {
  if (worldAdm1Cache) return worldAdm1Cache;

  const filePath = path.join(process.cwd(), ".cache", "natural-earth", "build", "world-adm1.geojson");
  try {
    worldAdm1Cache = JSON.parse(readFileSync(filePath, "utf8")) as BoundaryCollection;
  } catch {
    worldAdm1Cache = null;
  }
  return worldAdm1Cache;
}

function isAreaGeometry(geometry: BoundaryGeometry): geometry is Extract<BoundaryGeometry, { type: "Polygon" | "MultiPolygon" }> {
  return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
}

function unwrapAntimeridianGeometry(
  geometry: Extract<BoundaryGeometry, { type: "Polygon" | "MultiPolygon" }>
) {
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: (geometry.coordinates as number[][][]).map(unwrapRing)
    };
  }

  return {
    ...geometry,
    coordinates: (geometry.coordinates as number[][][][]).map((polygon) => polygon.map(unwrapRing))
  };
}

function unwrapRing(ring: number[][]) {
  if (ring.length < 2) return ring;

  const unwrapped = [ring[0]];
  let previousLng = ring[0][0];

  for (const point of ring.slice(1)) {
    const [lng, lat] = point;
    const candidates = [lng - 360, lng, lng + 360];
    const nextLng = candidates.reduce((best, candidate) =>
      Math.abs(candidate - previousLng) < Math.abs(best - previousLng) ? candidate : best
    );
    unwrapped.push([nextLng, lat]);
    previousLng = nextLng;
  }

  return unwrapped;
}
