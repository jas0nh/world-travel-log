import type { DatePrecision, PlaceLevel } from "@prisma/client";

export type PlaceDto = {
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
  totalChildren: number;
  visitedChildren: number;
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

export type MapFeature = {
  type: "Feature";
  id: string;
  properties: {
    id: string;
    name: string;
    nativeName: string | null;
    level: PlaceLevel;
    visited: boolean;
    totalChildren: number;
    visitedChildren: number;
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
