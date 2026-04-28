import { PrismaClient, PlaceLevel } from "@prisma/client";
import { createRequire } from "node:module";

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

const fallbackCountries: SeedPlace[] = [
  { id: "country-cn", name: "China", nativeName: "中国", code: "CN", countryCode: "CN", lat: 35, lng: 103 },
  { id: "country-jp", name: "Japan", nativeName: "日本", code: "JP", countryCode: "JP", lat: 36, lng: 138 },
  { id: "country-us", name: "United States", nativeName: "美国", code: "US", countryCode: "US", lat: 39, lng: -98 },
  { id: "country-fr", name: "France", nativeName: "法国", code: "FR", countryCode: "FR", lat: 46, lng: 2 },
  { id: "country-th", name: "Thailand", nativeName: "泰国", code: "TH", countryCode: "TH", lat: 15, lng: 101 }
];

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
  ["city-jp-tokyo", "Tokyo", "东京", "country-jp", 35.6762, 139.6503],
  ["city-jp-osaka", "Osaka", "大阪", "country-jp", 34.6937, 135.5023],
  ["city-us-nyc", "New York", "纽约", "country-us", 40.7128, -74.006],
  ["city-us-sf", "San Francisco", "旧金山", "country-us", 37.7749, -122.4194],
  ["city-fr-paris", "Paris", "巴黎", "country-fr", 48.8566, 2.3522],
  ["city-th-bangkok", "Bangkok", "曼谷", "country-th", 13.7563, 100.5018]
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
  { id: "city-cn-mo-macau", name: "Macau", nativeName: "澳门", countryCode: "MO", lat: 22.1987, lng: 113.5439, parentId: "country-mo" },
  { id: "city-cn-tw-taipei", name: "Taipei", nativeName: "台北", countryCode: "TW", lat: 25.033, lng: 121.5654, parentId: "country-tw" }
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

async function loadCountries(): Promise<SeedPlace[]> {
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

function stripAdministrativeSuffix(name: string) {
  return name.replace(/(特别行政区|地区|盟|自治州|市)$/u, "");
}

async function migrateLegacyChinaCityIds() {
  for (const [legacyId, stableId] of Object.entries(legacyChinaCityIds)) {
    const [legacy, stable] = await Promise.all([
      prisma.place.findUnique({ where: { id: legacyId }, include: { visit: true } }),
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

  const countries = await loadCountries();
  for (const [index, country] of countries.entries()) {
    await upsertPlace({ ...country, sortOrder: index }, PlaceLevel.COUNTRY);
  }

  for (const region of chinaRegions) {
    await upsertPlace(region, PlaceLevel.REGION);
  }

  await migrateLegacyChinaCityIds();

  for (const city of buildChinaCities()) {
    await upsertPlace(city, PlaceLevel.CITY);
  }

  for (const city of internationalCities) {
    await upsertPlace(city, PlaceLevel.CITY);
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
