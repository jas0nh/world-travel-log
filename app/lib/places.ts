import { DatePrecision, PlaceLevel, Prisma, VisitStatus, type Visit } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import { isCityStateCountry } from "./drill-policy";
import { defaultUserId } from "./users";
import type {
  CorrectionNodeDto,
  CorrectionsDto,
  MapFeature,
  MapLayerDto,
  OverviewDto,
  PlaceDisplayStatus,
  PlaceDto,
  PlaceVisitStatus,
  ProgressDto
} from "./types";

const childLevelByParent: Record<PlaceLevel, PlaceLevel | null> = {
  COUNTRY: PlaceLevel.REGION,
  REGION: PlaceLevel.CITY,
  CITY: null
};

const antimeridianIsoNumerics = new Set([
  "242", // Fiji
  "643" // Russia
]);

type ChildVisitSummary = { visits: unknown[] };
type PlaceWithVisit = {
  id: string;
  name: string;
  nativeName: string | null;
  level: PlaceLevel;
  code: string | null;
  isoNumeric: string | null;
  countryCode: string | null;
  lat: number;
  lng: number;
  parentId: string | null;
  children: ChildVisitSummary[];
  visits: Visit[];
};

type VisitSummary = {
  visitStatus: PlaceVisitStatus;
  visited: boolean;
  planned: boolean;
};

export function nextLevel(level?: PlaceLevel | null) {
  if (!level) return PlaceLevel.COUNTRY;
  return childLevelByParent[level];
}

export async function listPlaces(params: {
  level?: PlaceLevel;
  parentId?: string | null;
  userId?: string;
}) {
  const userId = params.userId ?? defaultUserId;
  const where: Prisma.PlaceWhereInput = {};
  const cityStateCountryCodes = await resolveCityStateCountryCodes();
  const cityStateCountryIds = new Set(
    [...cityStateCountryCodes].map((countryCode) => `country-${countryCode.toLowerCase()}`)
  );

  if (params.parentId) {
    if (cityStateCountryIds.has(params.parentId)) {
      const countryCode = params.parentId.replace("country-", "").toUpperCase();
      return listCityStateCities(countryCode, userId);
    }
    where.parentId = params.parentId;
  } else {
    where.level = params.level ?? PlaceLevel.COUNTRY;
    where.parentId = null;
  }

  const places = await prisma.place.findMany({
    where,
    include: {
      visits: { where: { userId } },
      children: {
        include: { visits: { where: { userId } } }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  const cityStateChildren = !params.parentId
    ? await loadCityStateChildren(cityStateCountryCodes, userId)
    : new Map<string, ChildVisitSummary[]>();

  return (places as PlaceWithVisit[]).map<PlaceDto>((place) => {
    const visibleChildren = cityStateChildren.get(place.id);
    const children = visibleChildren ?? place.children;
    const visit = place.visits[0];
    const visitSummary = summarizeVisit(visit);
    const plannedChildren = children.filter((child) => summarizeVisit(child.visits[0] as Visit | undefined).planned).length;
    const hasPlannedChildren = plannedChildren > 0;

    return {
      id: place.id,
      name: place.name,
      nativeName: place.nativeName,
      level: place.level,
      childLevel: getVisibleChildLevel(place.level, place.countryCode, cityStateCountryCodes),
      code: place.code,
      isoNumeric: place.isoNumeric,
      countryCode: place.countryCode,
      lat: place.lat,
      lng: place.lng,
      parentId: place.parentId,
      totalChildren: children.length,
      visitedChildren: children.filter((child) => summarizeVisit(child.visits[0] as Visit | undefined).visited).length,
      plannedChildren,
      hasPlannedChildren,
      visitStatus: visitSummary.visitStatus,
      displayStatus: getDisplayStatus(visitSummary.visitStatus, hasPlannedChildren),
      visited: visitSummary.visited,
      visitedAt: visit?.visitedAt?.toISOString() ?? null,
      datePrecision: visit?.datePrecision ?? DatePrecision.UNKNOWN,
      visitedYear: visit?.visitedYear ?? null,
      visitedMonth: visit?.visitedMonth ?? null,
      visitedDay: visit?.visitedDay ?? null,
      isDerived: visit?.isDerived ?? false,
      note: visit?.note ?? null
    };
  });
}

export async function getProgress(parentId?: string | null, userId = defaultUserId): Promise<ProgressDto> {
  const places = await prisma.place.findMany({
    where: parentId ? { parentId } : { parentId: null, level: PlaceLevel.COUNTRY },
    include: { visits: { where: { userId } } }
  });

  return {
    parentId: parentId ?? null,
    level: places[0]?.level ?? PlaceLevel.COUNTRY,
    total: places.length,
    visited: places.filter((place) => summarizeVisit(place.visits[0] as Visit | undefined).visited).length,
    planned: places.filter((place) => summarizeVisit(place.visits[0] as Visit | undefined).planned).length
  };
}

export async function getOverview(userId = defaultUserId): Promise<OverviewDto> {
  const [countries, chinaRegions, chinaCities, visits] = await Promise.all([
    prisma.place.findMany({
      where: { parentId: null, level: PlaceLevel.COUNTRY },
      include: { visits: { where: { userId } } }
    }),
    prisma.place.findMany({
      where: { parentId: "country-cn", level: PlaceLevel.REGION },
      include: { visits: { where: { userId } } }
    }),
    prisma.place.findMany({
      where: { countryCode: "CN", level: PlaceLevel.CITY },
      include: { visits: { where: { userId } } }
    }),
    prisma.visit.findMany({
      where: { userId, isDerived: false, status: VisitStatus.VISITED },
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

export async function getCorrections(userId = defaultUserId): Promise<CorrectionsDto> {
  const [places, visits] = await Promise.all([
    prisma.place.findMany({
      select: {
        id: true,
        name: true,
        nativeName: true,
        level: true,
        parentId: true,
        sortOrder: true
      }
    }),
    prisma.visit.findMany({
      where: { userId, status: VisitStatus.VISITED },
      include: { place: true },
      orderBy: [{ visitedYear: "desc" }, { visitedMonth: "desc" }, { visitedDay: "desc" }, { updatedAt: "desc" }]
    })
  ]);

  const placeById = new Map(places.map((place) => [place.id, place]));
  const nodeById = new Map<string, CorrectionNodeDto>();
  const roots: CorrectionNodeDto[] = [];

  const ensureNode = (placeId: string): CorrectionNodeDto | null => {
    const place = placeById.get(placeId);
    if (!place) return null;

    const existingNode = nodeById.get(placeId);
    if (existingNode) return existingNode;

    const node: CorrectionNodeDto = {
      id: place.id,
      name: place.name,
      nativeName: place.nativeName,
      level: place.level,
      visit: null,
      children: []
    };
    nodeById.set(place.id, node);

    const parentNode = place.parentId ? ensureNode(place.parentId) : null;
    if (parentNode) {
      if (!parentNode.children.some((child) => child.id === node.id)) parentNode.children.push(node);
    } else if (!roots.some((root) => root.id === node.id)) {
      roots.push(node);
    }

    return node;
  };

  for (const visit of visits) {
    const node = ensureNode(visit.placeId);
    if (!node) continue;
    node.visit = {
      id: visit.id,
      isDerived: visit.isDerived,
      status: visit.status,
      dateLabel: formatVisitDate(visit),
      datePrecision: visit.datePrecision,
      visitedAt: visit.visitedAt?.toISOString() ?? null,
      visitedYear: visit.visitedYear,
      visitedMonth: visit.visitedMonth,
      visitedDay: visit.visitedDay,
      note: visit.note
    };
  }

  const placeOrder = new Map(places.map((place) => [place.id, { sortOrder: place.sortOrder, name: place.name }]));
  const sortNodes = (nodes: CorrectionNodeDto[]) => {
    nodes.sort((left, right) => {
      const leftOrder = placeOrder.get(left.id);
      const rightOrder = placeOrder.get(right.id);
      return (leftOrder?.sortOrder ?? 0) - (rightOrder?.sortOrder ?? 0) || left.name.localeCompare(right.name);
    });
    for (const node of nodes) sortNodes(node.children);
  };

  sortNodes(roots);

  return {
    roots,
    totalVisits: visits.length,
    explicitVisits: visits.filter((visit) => !visit.isDerived).length,
    derivedVisits: visits.filter((visit) => visit.isDerived).length
  };
}

function progressFromPlaces(
  places: Array<{ visits: unknown[] }>,
  parentId: string | null,
  level: PlaceLevel
): ProgressDto {
  return {
    parentId,
    level,
    total: places.length,
    visited: places.filter((place) => summarizeVisit(place.visits[0] as Visit | undefined).visited).length,
    planned: places.filter((place) => summarizeVisit(place.visits[0] as Visit | undefined).planned).length
  };
}

async function listCityStateCities(countryCode: string, userId: string) {
  const places = await prisma.place.findMany({
    where: {
      countryCode,
      level: PlaceLevel.CITY
    },
    include: {
      visits: { where: { userId } },
      children: {
        include: { visits: { where: { userId } } }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  return (places as PlaceWithVisit[]).map<PlaceDto>((place) => {
    const visit = place.visits[0];
    const visitSummary = summarizeVisit(visit);
    const plannedChildren = place.children.filter((child) => summarizeVisit(child.visits[0] as Visit | undefined).planned).length;
    const hasPlannedChildren = plannedChildren > 0;
    return {
      id: place.id,
      name: place.name,
      nativeName: place.nativeName,
      level: place.level,
      childLevel: null,
      code: place.code,
      isoNumeric: place.isoNumeric,
      countryCode: place.countryCode,
      lat: place.lat,
      lng: place.lng,
      parentId: place.parentId,
      totalChildren: place.children.length,
      visitedChildren: place.children.filter((child) => summarizeVisit(child.visits[0] as Visit | undefined).visited).length,
      plannedChildren,
      hasPlannedChildren,
      visitStatus: visitSummary.visitStatus,
      displayStatus: getDisplayStatus(visitSummary.visitStatus, hasPlannedChildren),
      visited: visitSummary.visited,
      visitedAt: visit?.visitedAt?.toISOString() ?? null,
      datePrecision: visit?.datePrecision ?? DatePrecision.UNKNOWN,
      visitedYear: visit?.visitedYear ?? null,
      visitedMonth: visit?.visitedMonth ?? null,
      visitedDay: visit?.visitedDay ?? null,
      isDerived: visit?.isDerived ?? false,
      note: visit?.note ?? null
    };
  });
}

async function loadCityStateChildren(cityStateCountryCodes: Set<string>, userId: string) {
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
    include: { visits: { where: { userId } } }
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

async function resolveCityStateCountryCodes() {
  const [countries, regionGroups, cityGroups] = await Promise.all([
    prisma.place.findMany({
      where: { parentId: null, level: PlaceLevel.COUNTRY },
      select: { code: true }
    }),
    prisma.place.groupBy({
      by: ["countryCode"],
      where: { level: PlaceLevel.REGION },
      _count: { _all: true }
    }),
    prisma.place.groupBy({
      by: ["countryCode"],
      where: { level: PlaceLevel.CITY },
      _count: { _all: true }
    })
  ]);

  const regionCountByCode = new Map(
    regionGroups
      .filter((group) => group.countryCode)
      .map((group) => [group.countryCode as string, group._count._all])
  );
  const cityCountByCode = new Map(
    cityGroups
      .filter((group) => group.countryCode)
      .map((group) => [group.countryCode as string, group._count._all])
  );

  return new Set(
    countries
      .map((country) => country.code)
      .filter((countryCode): countryCode is string => Boolean(countryCode))
      .filter((countryCode) =>
        isCityStateCountry({
          countryCode,
          regionCount: regionCountByCode.get(countryCode) ?? 0,
          cityCount: cityCountByCode.get(countryCode) ?? 0
        })
      )
  );
}

function getVisibleChildLevel(
  level: PlaceLevel,
  countryCode: string | null,
  cityStateCountryCodes: Set<string>
): PlaceLevel | null {
  if (level === PlaceLevel.CITY) return null;
  if (level === PlaceLevel.REGION) return PlaceLevel.CITY;
  if (countryCode && cityStateCountryCodes.has(countryCode)) return PlaceLevel.CITY;
  return PlaceLevel.REGION;
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

function summarizeVisit(visit?: Visit): VisitSummary {
  const visitStatus: PlaceVisitStatus = visit ? visit.status : "NONE";
  return {
    visitStatus,
    visited: visitStatus === VisitStatus.VISITED,
    planned: visitStatus === VisitStatus.PLANNED
  };
}

function getDisplayStatus(visitStatus: PlaceVisitStatus, hasPlannedChildren: boolean): PlaceDisplayStatus {
  if (visitStatus === VisitStatus.VISITED && hasPlannedChildren) return "VISITED_WITH_PLANNED_CHILDREN";
  return visitStatus;
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

export async function getMapLayer(parentId?: string | null, userId = defaultUserId): Promise<MapLayerDto> {
  const places = await listPlaces({ parentId, userId });
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
        parentId: place.parentId,
        visitStatus: place.visitStatus,
        displayStatus: place.displayStatus,
        visited: place.visited,
        totalChildren: place.totalChildren,
        visitedChildren: place.visitedChildren,
        plannedChildren: place.plannedChildren,
        hasPlannedChildren: place.hasPlannedChildren
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
