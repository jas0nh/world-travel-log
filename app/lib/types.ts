import type { DatePrecision, PlaceLevel, VisitStatus as PrismaVisitStatus } from "@prisma/client";

export type PlaceVisitStatus = "NONE" | PrismaVisitStatus;
export type PlaceDisplayStatus = PlaceVisitStatus | "VISITED_WITH_PLANNED_CHILDREN";

export type PlaceDto = {
  id: string;
  name: string;
  nativeName: string | null;
  level: PlaceLevel;
  childLevel: PlaceLevel | null;
  code: string | null;
  isoNumeric: string | null;
  countryCode: string | null;
  lat: number;
  lng: number;
  parentId: string | null;
  totalChildren: number;
  visitedChildren: number;
  plannedChildren: number;
  hasPlannedChildren: boolean;
  visitStatus: PlaceVisitStatus;
  displayStatus: PlaceDisplayStatus;
  visited: boolean;
  visitedAt: string | null;
  datePrecision: DatePrecision;
  visitedYear: number | null;
  visitedMonth: number | null;
  visitedDay: number | null;
  isDerived: boolean;
  note: string | null;
};

export type ProgressDto = {
  parentId: string | null;
  level: PlaceLevel;
  total: number;
  visited: number;
  planned: number;
};

export type OverviewDto = {
  progress: {
    countries: ProgressDto;
    chinaRegions: ProgressDto;
    chinaCities: ProgressDto;
  };
  timeline: {
    year: number | null;
    visits: Array<{
      id: string;
      placeId: string;
      placeName: string;
      placeNativeName: string | null;
      level: PlaceLevel;
      parentName: string | null;
      dateLabel: string;
      datePrecision: DatePrecision;
      note: string | null;
    }>;
  }[];
  recent: Array<{
    id: string;
    placeId: string;
    placeName: string;
    placeNativeName: string | null;
    level: PlaceLevel;
    dateLabel: string;
    datePrecision: DatePrecision;
    note: string | null;
  }>;
};

export type CorrectionVisitDto = {
  id: string;
  isDerived: boolean;
  status: PrismaVisitStatus;
  dateLabel: string;
  datePrecision: DatePrecision;
  visitedAt: string | null;
  visitedYear: number | null;
  visitedMonth: number | null;
  visitedDay: number | null;
  note: string | null;
};

export type CorrectionNodeDto = {
  id: string;
  name: string;
  nativeName: string | null;
  level: PlaceLevel;
  visit: CorrectionVisitDto | null;
  children: CorrectionNodeDto[];
};

export type CorrectionsDto = {
  roots: CorrectionNodeDto[];
  status: PrismaVisitStatus;
  totalVisits: number;
  explicitVisits: number;
  derivedVisits: number;
};

export type MapFeature = {
  type: "Feature";
  id: string;
  properties: {
    id: string;
    name: string;
    nativeName: string | null;
    level: PlaceLevel;
    parentId: string | null;
    visitStatus: PlaceVisitStatus;
    displayStatus: PlaceDisplayStatus;
    visited: boolean;
    totalChildren: number;
    visitedChildren: number;
    plannedChildren: number;
    hasPlannedChildren: boolean;
  };
  geometry:
    | {
        type: "Point";
        coordinates: [number, number];
      }
    | {
        type: "Polygon" | "MultiPolygon";
        coordinates: number[][][] | number[][][][];
      };
};

export type MapLayerDto = {
  type: "FeatureCollection";
  features: MapFeature[];
  attribution: string;
};
