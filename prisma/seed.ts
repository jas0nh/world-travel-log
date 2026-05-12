import { PrismaClient, PlaceLevel } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { recomputeDerivedVisits } from "../app/lib/visit-logic";
import { appUsers, defaultUserId } from "../app/lib/users";

const prisma = new PrismaClient();
const require = createRequire(import.meta.url);

type RestCountry = {
  name: { common: string };
  cca2: string;
  cca3: string;
  ccn3?: string;
  latlng?: [number, number];
  translations?: {
    zho?: { common?: string };
  };
};

type ProvinceCityItem = {
  code: string;
  name: string;
  province: string;
};

type ChinaGeoJson = Record<
  string,
  {
    features: Array<{
      properties: {
        name?: string;
        cp?: [number, number];
      };
    }>;
  }
>;

type NaturalEarthAdm1Collection = {
  features: Array<{
    properties: {
      ne_id?: number;
      iso_a2?: string;
      adm0_a3?: string;
      adm1_code?: string;
      name?: string;
      name_en?: string;
      name_zh?: string;
      latitude?: number;
      longitude?: number;
    };
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: number[][][] | number[][][][];
    };
  }>;
};

type NaturalEarthCitiesCollection = {
  features: Array<{
    properties: {
      NAME?: string;
      NAMEASCII?: string;
      ADM0_A3?: string;
      ADM1NAME?: string;
      ISO_A2?: string;
      POP_MAX?: number;
      NE_ID?: number;
    };
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
  }>;
};

type SeedPlace = {
  id: string;
  name: string;
  nativeName?: string;
  code?: string;
  isoNumeric?: string;
  countryCode?: string;
  lat: number;
  lng: number;
  parentId?: string | null;
  sortOrder?: number;
};

type CountrySeed = SeedPlace & {
  alpha3: string;
};

type RegionMatcher = {
  parentId: string;
  geometry: NaturalEarthAdm1Collection["features"][number]["geometry"];
  bbox: [number, number, number, number];
  names: Set<string>;
};

function toSeedPlace(country: CountrySeed): SeedPlace {
  return {
    id: country.id,
    name: country.name,
    nativeName: country.nativeName,
    code: country.code,
    isoNumeric: country.isoNumeric,
    countryCode: country.countryCode,
    lat: country.lat,
    lng: country.lng,
    parentId: country.parentId,
    sortOrder: country.sortOrder
  };
}

const fallbackCountries: CountrySeed[] = [
  { id: "country-cn", name: "China", nativeName: "中国", code: "CN", alpha3: "CHN", countryCode: "CN", lat: 35, lng: 103 },
  { id: "country-jp", name: "Japan", nativeName: "日本", code: "JP", alpha3: "JPN", countryCode: "JP", lat: 36, lng: 138 },
  { id: "country-us", name: "United States", nativeName: "美国", code: "US", alpha3: "USA", countryCode: "US", lat: 39, lng: -98 },
  { id: "country-fr", name: "France", nativeName: "法国", code: "FR", alpha3: "FRA", countryCode: "FR", lat: 46, lng: 2 },
  { id: "country-th", name: "Thailand", nativeName: "泰国", code: "TH", alpha3: "THA", countryCode: "TH", lat: 15, lng: 101 }
];

const cityStateCountryCodes = new Set(["SG"]);

const nativeNameOverrides: Record<string, string> = {
  CN: "中国",
  JP: "日本",
  US: "美国",
  FR: "法国",
  TH: "泰国",
  SG: "新加坡",
  TW: "台湾",
  HK: "香港",
  MO: "澳门",
  KR: "韩国",
  GB: "英国",
  DE: "德国",
  IT: "意大利",
  ES: "西班牙",
  AU: "澳大利亚",
  CA: "加拿大"
};

const chinaRegionRows = [
  ["bj", "110000", "Beijing", "北京", 39.9042, 116.4074],
  ["tj", "120000", "Tianjin", "天津", 39.3434, 117.3616],
  ["he", "130000", "Hebei", "河北", 38.0428, 114.5149],
  ["sx", "140000", "Shanxi", "山西", 37.8706, 112.5489],
  ["nm", "150000", "Inner Mongolia", "内蒙古", 40.8175, 111.7652],
  ["ln", "210000", "Liaoning", "辽宁", 41.8057, 123.4315],
  ["jl", "220000", "Jilin", "吉林", 43.8378, 126.5496],
  ["hl", "230000", "Heilongjiang", "黑龙江", 45.8038, 126.5349],
  ["sh", "310000", "Shanghai", "上海", 31.2304, 121.4737],
  ["js", "320000", "Jiangsu", "江苏", 32.0603, 118.7969],
  ["zj", "330000", "Zhejiang", "浙江", 30.2741, 120.1551],
  ["ah", "340000", "Anhui", "安徽", 31.8612, 117.2857],
  ["fj", "350000", "Fujian", "福建", 26.0745, 119.2965],
  ["jx", "360000", "Jiangxi", "江西", 28.682, 115.8582],
  ["sd", "370000", "Shandong", "山东", 36.6683, 117.0204],
  ["ha", "410000", "Henan", "河南", 34.7466, 113.6254],
  ["hb", "420000", "Hubei", "湖北", 30.5928, 114.3055],
  ["hn", "430000", "Hunan", "湖南", 28.2282, 112.9388],
  ["gd", "440000", "Guangdong", "广东", 23.1291, 113.2644],
  ["gx", "450000", "Guangxi", "广西", 22.817, 108.3669],
  ["hi", "460000", "Hainan", "海南", 20.044, 110.1999],
  ["cq", "500000", "Chongqing", "重庆", 29.563, 106.5516],
  ["sc", "510000", "Sichuan", "四川", 30.5728, 104.0668],
  ["gz", "520000", "Guizhou", "贵州", 26.647, 106.6302],
  ["yn", "530000", "Yunnan", "云南", 25.0389, 102.7183],
  ["xz", "540000", "Tibet", "西藏", 29.65, 91.1],
  ["sn", "610000", "Shaanxi", "陕西", 34.3416, 108.9398],
  ["gs", "620000", "Gansu", "甘肃", 36.0611, 103.8343],
  ["qh", "630000", "Qinghai", "青海", 36.6171, 101.7782],
  ["nx", "640000", "Ningxia", "宁夏", 38.4872, 106.2309],
  ["xj", "650000", "Xinjiang", "新疆", 43.8256, 87.6168],
  ["hk", "810000", "Hong Kong", "香港", 22.3193, 114.1694],
  ["mo", "820000", "Macau", "澳门", 22.1987, 113.5439],
  ["tw", "710000", "Taiwan", "台湾", 23.6978, 120.9605]
] as const;

const chinaRegions: SeedPlace[] = chinaRegionRows.map(([code, adminCode, name, nativeName, lat, lng], index) => ({
  id: `region-cn-${code}`,
  name,
  nativeName,
  code: adminCode,
  countryCode: "CN",
  lat,
  lng,
  parentId: "country-cn",
  sortOrder: index
}));

const internationalCities: SeedPlace[] = [
  ["city-jp-tokyo", "Tokyo", "东京", "region-jp-1159311135", 35.6762, 139.6503],
  ["city-jp-osaka", "Osaka", "大阪", "region-jp-1159308417", 34.6937, 135.5023],
  ["city-us-nyc", "New York", "纽约", "region-us-1159312155", 40.7128, -74.006],
  ["city-us-sf", "San Francisco", "旧金山", "region-us-1159308415", 37.7749, -122.4194],
  ["city-fr-paris", "Paris", "巴黎", "region-fr-1159316799", 48.8566, 2.3522],
  ["city-th-bangkok", "Bangkok", "曼谷", "region-th-1159308197", 13.7563, 100.5018]
].map(([id, name, nativeName, parentId, lat, lng], index) => ({
  id: id as string,
  name: name as string,
  nativeName: nativeName as string,
  countryCode: (id as string).split("-")[1]?.toUpperCase(),
  lat: lat as number,
  lng: lng as number,
  parentId: parentId as string,
  sortOrder: index
}));

const regionIdByProvincePrefix = new Map(
  chinaRegionRows.map(([regionCode, adminCode]) => [adminCode.slice(0, 2), `region-cn-${regionCode}`])
);
const regionByAdminCode = new Map(chinaRegions.map((region) => [region.code, region]));

const legacyChinaCityIds: Record<string, string> = {
  "city-cn-bj-beijing": "city-cn-110000",
  "city-cn-tj-tianjin": "city-cn-120000",
  "city-cn-sh-shanghai": "city-cn-310000",
  "city-cn-cq-chongqing": "city-cn-500000",
  "city-cn-gd-guangzhou": "city-cn-440100",
  "city-cn-gd-shenzhen": "city-cn-440300",
  "city-cn-gd-zhuhai": "city-cn-440400",
  "city-cn-zj-hangzhou": "city-cn-330100",
  "city-cn-js-nanjing": "city-cn-320100",
  "city-cn-sc-chengdu": "city-cn-510100",
  "city-cn-fj-xiamen": "city-cn-350200"
};

const nonMainlandLegacyCities: SeedPlace[] = [
  { id: "city-cn-hk-hongkong", name: "Hong Kong", nativeName: "香港", countryCode: "HK", lat: 22.3193, lng: 114.1694, parentId: "country-hk" },
  { id: "city-cn-mo-macau", name: "Macau", nativeName: "澳门", countryCode: "MO", lat: 22.1987, lng: 113.5439, parentId: "region-mo-1159315653" },
  { id: "city-cn-tw-taipei", name: "Taipei", nativeName: "台北", countryCode: "TW", lat: 25.033, lng: 121.5654, parentId: "region-tw-1159310405" }
];

const cityGeoNameAliases: Record<string, string> = {
  襄阳市: "襄樊市",
  毕节市: "毕节地区",
  铜仁市: "铜仁地区",
  日喀则市: "日喀则地区",
  昌都市: "昌都地区",
  林芝市: "林芝地区",
  山南市: "山南地区",
  那曲市: "那曲地区",
  海东市: "海东地区",
  吐鲁番市: "吐鲁番地区",
  哈密市: "哈密地区"
};

const cityPointFallbacks: Record<string, [number, number]> = {
  三沙市: [112.338, 16.832]
};

async function loadCountries(): Promise<CountrySeed[]> {
  try {
    const response = await fetch(
      "https://restcountries.com/v3.1/all?fields=name,cca2,cca3,ccn3,latlng,translations"
    );
    if (!response.ok) throw new Error(`REST Countries returned ${response.status}`);
    const countries = (await response.json()) as RestCountry[];
    return countries
      .filter((country) => country.cca2 && country.latlng?.length === 2)
      .map((country, index) => ({
        id: `country-${country.cca2.toLowerCase()}`,
        name: country.name.common,
        nativeName: nativeNameOverrides[country.cca2] ?? country.translations?.zho?.common,
        code: country.cca2,
        alpha3: country.cca3,
        isoNumeric: country.ccn3,
        countryCode: country.cca2,
        lat: country.latlng![0],
        lng: country.latlng![1],
        sortOrder: index
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.warn("Falling back to bundled country seed:", error);
    return fallbackCountries;
  }
}

function buildChinaCities(): SeedPlace[] {
  const cityData = require("province-city-china/dist/city.json") as ProvinceCityItem[];
  const chinaGeoJson = require("china-geojson") as ChinaGeoJson;
  const geoPointByName = new Map<string, [number, number]>();

  for (const collection of Object.values(chinaGeoJson)) {
    for (const feature of collection.features) {
      const { name, cp } = feature.properties;
      if (name && cp) geoPointByName.set(name, cp);
    }
  }

  const prefectureCities = cityData
    .filter((city) => !city.name.includes("直辖县级行政区划"))
    .map<SeedPlace>((city, index) => {
    const point =
      geoPointByName.get(city.name) ??
      geoPointByName.get(cityGeoNameAliases[city.name]) ??
      cityPointFallbacks[city.name];
    const parentId = regionIdByProvincePrefix.get(city.province);
    if (!point || !parentId) {
      throw new Error(`Missing city seed data for ${city.name} (${city.code})`);
    }
    const [lng, lat] = point;
    return {
      id: `city-cn-${city.code}`,
      name: stripAdministrativeSuffix(city.name),
      nativeName: city.name,
      code: city.code,
      countryCode: "CN",
      lat,
      lng,
      parentId,
      sortOrder: index
    };
  });

  const municipalities = ["110000", "120000", "310000", "500000"].map<SeedPlace>((code, index) => {
    const region = regionByAdminCode.get(code);
    if (!region) throw new Error(`Missing municipality region ${code}`);
    return {
      id: `city-cn-${code}`,
      name: region.name,
      nativeName: region.nativeName,
      code,
      countryCode: "CN",
      lat: region.lat,
      lng: region.lng,
      parentId: region.id,
      sortOrder: -100 + index
    };
  });

  return [...municipalities, ...prefectureCities];
}

function buildGlobalRegions(countries: CountrySeed[]) {
  const filePath = path.join(process.cwd(), ".cache", "natural-earth", "build", "world-adm1.geojson");
  if (!existsSync(filePath)) {
    console.warn("Skipping global ADM1 seed: .cache/natural-earth/build/world-adm1.geojson not found");
    return [];
  }

  const collection = JSON.parse(readFileSync(filePath, "utf8")) as NaturalEarthAdm1Collection;
  const countryIdByCode = new Map(
    countries
      .filter((country) => country.code)
      .map((country) => [country.code!, country.id])
  );
  const sortOrderByCountry = new Map<string, number>();

  return collection.features.flatMap<SeedPlace>((feature) => {
    const neId = feature.properties.ne_id;
    const countryCode = feature.properties.iso_a2?.toUpperCase();
    const parentId = countryCode ? countryIdByCode.get(countryCode) : null;
    const lat = feature.properties.latitude;
    const lng = feature.properties.longitude;

    if (!neId || !countryCode || !parentId || countryCode === "CN" || cityStateCountryCodes.has(countryCode)) return [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

    const nextSortOrder = sortOrderByCountry.get(parentId) ?? 0;
    sortOrderByCountry.set(parentId, nextSortOrder + 1);

    return [
      {
        id: `region-${countryCode.toLowerCase()}-${neId}`,
        name: feature.properties.name_en ?? feature.properties.name ?? `ADM1 ${neId}`,
        nativeName: feature.properties.name_zh ?? undefined,
        code: `ne:${String(neId)}`,
        countryCode,
        lat: Number(lat),
        lng: Number(lng),
        parentId,
        sortOrder: nextSortOrder
      }
    ];
  });
}

function buildGlobalCities(countries: CountrySeed[], globalRegions: SeedPlace[]) {
  const filePath = path.join(process.cwd(), ".cache", "natural-earth", "build", "cities-natural-earth.geojson");
  if (!existsSync(filePath)) {
    console.warn("Skipping global city seed: .cache/natural-earth/build/cities-natural-earth.geojson not found");
    return [];
  }

  const collection = JSON.parse(readFileSync(filePath, "utf8")) as NaturalEarthCitiesCollection;
  const countryIdByAlpha3 = new Map(countries.map((country) => [country.alpha3, country.id]));
  const countryCodeByAlpha3 = new Map(countries.map((country) => [country.alpha3, country.code ?? null]));
  const countryHasRegions = new Set(globalRegions.map((region) => region.parentId).filter((value): value is string => Boolean(value)));
  const regionMatchers = buildRegionMatchers(globalRegions);
  const sortOrderByParent = new Map<string, number>();
  const seededCityKeys = new Set(
    [...internationalCities, ...nonMainlandLegacyCities].map((city) =>
      `${city.countryCode ?? ""}:${normalizeForMatch(city.name)}`
    )
  );
  const cityIdOverrides = new Map<string, string>([
    ["JPN:tokyo", "city-jp-tokyo"],
    ["JPN:osaka", "city-jp-osaka"],
    ["USA:new-york", "city-us-nyc"],
    ["USA:san-francisco", "city-us-sf"],
    ["FRA:paris", "city-fr-paris"],
    ["THA:bangkok", "city-th-bangkok"],
    ["SGP:singapore", "city-ne-1159151627"],
    ["TWN:taipei", "city-cn-tw-taipei"],
    ["MAC:macau", "city-cn-mo-macau"],
    ["HKG:hong-kong", "city-cn-hk-hongkong"]
  ]);
  const cityNativeNameOverrides = new Map<string, string>([
    ["SGP:singapore", "新加坡"],
    ["MCO:monaco", "摩纳哥"]
  ]);

  return collection.features.flatMap<SeedPlace>((feature) => {
    const alpha3 = feature.properties.ADM0_A3?.toUpperCase();
    const countryId = alpha3 ? countryIdByAlpha3.get(alpha3) : null;
    const countryCode = alpha3 ? countryCodeByAlpha3.get(alpha3) : null;
    const cityName = feature.properties.NAMEASCII ?? feature.properties.NAME;
    const nativeName = feature.properties.NAME ?? feature.properties.NAMEASCII;
    const neId = feature.properties.NE_ID;

    if (!alpha3 || !countryId || !countryCode || !cityName || !nativeName || !neId) return [];
    if (countryCode === "CN") return [];

    const cityKey = `${alpha3}:${normalizeForMatch(cityName)}`;
    if (seededCityKeys.has(`${countryCode}:${normalizeForMatch(cityName)}`)) return [];

    const [lng, lat] = feature.geometry.coordinates;
    const parentId = resolveCityParent({
      countryId,
      countryHasRegions: countryHasRegions.has(countryId),
      alpha3,
      countryCode,
      lat,
      lng,
      adm1Name: feature.properties.ADM1NAME,
      matchers: regionMatchers
    });

    if (!parentId) return [];
    const nextSortOrder = sortOrderByParent.get(parentId) ?? 0;
    sortOrderByParent.set(parentId, nextSortOrder + 1);

    return [
      {
        id: cityIdOverrides.get(cityKey) ?? `city-ne-${neId}`,
        name: cityName,
        nativeName: cityNativeNameOverrides.get(cityKey) ?? nativeName,
        code: `ne:${String(neId)}`,
        countryCode,
        lat,
        lng,
        parentId,
        sortOrder: nextSortOrder
      }
    ];
  });
}

function resolveCityParent(params: {
  countryId: string;
  countryHasRegions: boolean;
  alpha3: string;
  countryCode: string;
  lat: number;
  lng: number;
  adm1Name?: string;
  matchers: Map<string, RegionMatcher[]>;
}) {
  if (cityStateCountryCodes.has(params.countryCode)) return params.countryId;
  if (!params.countryHasRegions) return params.countryId;

  const countryMatchers = params.matchers.get(params.alpha3) ?? [];
  const normalizedAdm1 = normalizeRegionName(params.adm1Name);

  if (normalizedAdm1) {
    const matchedByName = countryMatchers.find((matcher) => matcher.names.has(normalizedAdm1));
    if (matchedByName) return matchedByName.parentId;
  }

  for (const matcher of countryMatchers) {
    if (!pointInBounds(params.lng, params.lat, matcher.bbox)) continue;
    if (pointInGeometry(params.lng, params.lat, matcher.geometry)) {
      return matcher.parentId;
    }
  }

  return null;
}

function buildRegionMatchers(globalRegions: SeedPlace[]) {
  const filePath = path.join(process.cwd(), ".cache", "natural-earth", "build", "world-adm1.geojson");
  const collection = JSON.parse(readFileSync(filePath, "utf8")) as NaturalEarthAdm1Collection;
  const regionByCode = new Map(globalRegions.map((region) => [region.code, region]));
  const matchers = new Map<string, RegionMatcher[]>();

  for (const feature of collection.features) {
    const neId = feature.properties.ne_id;
    const alpha3 = feature.properties.adm0_a3?.toUpperCase();
    const region = neId ? regionByCode.get(`ne:${String(neId)}`) : null;
    if (!alpha3 || !region) continue;

    const countryMatchers = matchers.get(alpha3) ?? [];
    countryMatchers.push({
      parentId: region.id,
      geometry: feature.geometry,
      bbox: computeBBox(feature.geometry.coordinates),
      names: new Set(
        [region.name, region.nativeName, feature.properties.name, feature.properties.name_en]
          .map(normalizeRegionName)
          .filter((value): value is string => Boolean(value))
      )
    });
    matchers.set(alpha3, countryMatchers);
  }

  return matchers;
}

function stripAdministrativeSuffix(name: string) {
  return name.replace(/(特别行政区|地区|盟|自治州|市)$/u, "");
}

function normalizeForMatch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRegionName(value?: string | null) {
  if (!value) return null;

  return normalizeForMatch(
    value
      .replace(
        /\b(prefecture|province|state|metropolis|district|county|region|department|governorate|oblast|municipality|city)\b/gi,
        ""
      )
      .replace(/\s+/g, " ")
      .trim()
  );
}

function computeBBox(coordinates: unknown): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  visitNestedCoordinates(coordinates, (lng, lat) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  });

  return [minLng, minLat, maxLng, maxLat];
}

function visitNestedCoordinates(coordinates: unknown, visitor: (lng: number, lat: number) => void) {
  if (!Array.isArray(coordinates)) return;
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    visitor(coordinates[0], coordinates[1]);
    return;
  }

  for (const child of coordinates) visitNestedCoordinates(child, visitor);
}

function pointInBounds(lng: number, lat: number, bbox: [number, number, number, number]) {
  return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function pointInGeometry(
  lng: number,
  lat: number,
  geometry: NaturalEarthAdm1Collection["features"][number]["geometry"]
) {
  if (geometry.type === "Polygon") {
    return pointInPolygon(lng, lat, geometry.coordinates as number[][][]);
  }

  return (geometry.coordinates as number[][][][]).some((polygon) => pointInPolygon(lng, lat, polygon));
}

function pointInPolygon(lng: number, lat: number, polygon: number[][][]) {
  if (!polygon.length) return false;
  if (!pointInRing(lng, lat, polygon[0])) return false;

  for (let index = 1; index < polygon.length; index += 1) {
    if (pointInRing(lng, lat, polygon[index])) return false;
  }

  return true;
}

function pointInRing(lng: number, lat: number, ring: number[][]) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

async function migrateLegacyChinaCityIds() {
  for (const [legacyId, stableId] of Object.entries(legacyChinaCityIds)) {
    const [legacy, stable] = await Promise.all([
      prisma.place.findUnique({ where: { id: legacyId } }),
      prisma.place.findUnique({ where: { id: stableId } })
    ]);
    if (!legacy || stable) continue;
    await prisma.place.update({
      where: { id: legacyId },
      data: { id: stableId }
    });
  }

  for (const city of nonMainlandLegacyCities) {
    const existing = await prisma.place.findUnique({ where: { id: city.id } });
    if (!existing) continue;
    await upsertPlace(city, PlaceLevel.CITY);
  }
}

async function upsertPlace(place: SeedPlace, level: PlaceLevel) {
  await prisma.place.upsert({
    where: { id: place.id },
    create: { ...place, level },
    update: { ...place, level }
  });
}

async function main() {
  await prisma.mapLayerCache.deleteMany();

  for (const user of appUsers) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: user,
      update: user
    });
  }

  const countries = await loadCountries();
  for (const [index, country] of countries.entries()) {
    await upsertPlace({ ...toSeedPlace(country), sortOrder: index }, PlaceLevel.COUNTRY);
  }

  for (const region of chinaRegions) {
    await upsertPlace(region, PlaceLevel.REGION);
  }

  const globalRegions = buildGlobalRegions(countries);
  for (const region of globalRegions) {
    await upsertPlace(region, PlaceLevel.REGION);
  }

  await migrateLegacyChinaCityIds();

  for (const city of buildChinaCities()) {
    await upsertPlace(city, PlaceLevel.CITY);
  }

  for (const city of internationalCities) {
    await upsertPlace(city, PlaceLevel.CITY);
  }

  for (const city of buildGlobalCities(countries, globalRegions)) {
    await upsertPlace(city, PlaceLevel.CITY);
  }

  await prisma.$transaction(async (tx) => {
    await recomputeDerivedVisits(tx, defaultUserId);
  });

  const invalidCities = await prisma.place.findMany({
    where: {
      level: PlaceLevel.CITY,
      parent: {
        level: PlaceLevel.COUNTRY,
        children: {
          some: {
            level: PlaceLevel.REGION
          }
        }
      },
      id: {
        notIn: ["city-cn-hk-hongkong", "city-ne-1159151627"]
      }
    },
    include: {
      parent: true
    },
    take: 20
  });

  if (invalidCities.length) {
    throw new Error(
      `City rows still hanging under countries with regions: ${invalidCities
        .map((city) => `${city.id}->${city.parentId}`)
        .join(", ")}`
    );
  }

  await prisma.mapLayerCache.create({
    data: {
      id: "starter-sources",
      level: PlaceLevel.COUNTRY,
      source: "REST Countries + bundled starter ADM data",
      attribution: "OpenStreetMap contributors, REST Countries, Natural Earth, GeoNames, geoBoundaries, china-geojson, province-city-china",
      dataPath: "prisma/seed.ts"
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
