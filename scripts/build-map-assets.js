import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const cacheDir = path.join(root, ".cache", "natural-earth");
const extractDir = path.join(cacheDir, "unzipped");
const buildDir = path.join(cacheDir, "build");
const outputDir = path.join(root, "public", "data");

const adm0 = {
  name: "Natural Earth ADM0",
  url: "https://naturalearth.s3.amazonaws.com/50m_cultural/ne_50m_admin_0_countries.zip",
  zipName: "ne_50m_admin_0_countries.zip",
  shapeName: "ne_50m_admin_0_countries.shp",
  layerName: "adm0",
  geojsonName: "world-adm0.geojson",
  pmtilesName: "world-adm0.pmtiles",
  minZoom: 0,
  maxZoom: 6
};

const adm1 = {
  name: "Natural Earth ADM1",
  url: "https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_1_states_provinces.zip",
  zipName: "ne_10m_admin_1_states_provinces.zip",
  shapeName: "ne_10m_admin_1_states_provinces.shp",
  layerName: "adm1",
  geojsonName: "world-adm1.geojson",
  pmtilesName: "world-adm1.pmtiles",
  minZoom: 2,
  maxZoom: 8
};

const cities = {
  name: "Natural Earth populated places",
  url: "https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_populated_places.zip",
  zipName: "ne_10m_populated_places.zip",
  shapeName: "ne_10m_populated_places.shp",
  layerName: "cities",
  geojsonName: "cities-natural-earth.geojson"
};

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(extractDir, { recursive: true });
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  const missing = ["curl", "unzip", "ogr2ogr", "tippecanoe"].filter((tool) => !hasCommand(tool));
  if (missing.length) {
    console.error(`Missing required command(s): ${missing.join(", ")}`);
    console.error("Install them first, for example:");
    console.error("  brew install gdal tippecanoe");
    console.error("curl and unzip are usually already available on macOS.");
    process.exit(1);
  }

  for (const asset of [adm0, adm1, cities]) {
    download(asset);
    unzip(asset);
    convertToGeoJson(asset);
  }

  buildPmtiles(adm0);
  buildPmtiles(adm1);
  buildCitiesJson();
  writeManifest();
}

function hasCommand(command) {
  return spawnSync("zsh", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

function download(asset) {
  const target = path.join(cacheDir, asset.zipName);
  if (existsSync(target) && statSync(target).size > 0) return;
  run("curl", ["-L", asset.url, "-o", target], `download ${asset.name}`);
}

function unzip(asset) {
  const shapePath = path.join(extractDir, asset.shapeName);
  if (existsSync(shapePath)) return;
  run("unzip", ["-o", path.join(cacheDir, asset.zipName), "-d", extractDir], `unzip ${asset.name}`);
}

function convertToGeoJson(asset) {
  const source = path.join(extractDir, asset.shapeName);
  const target = path.join(buildDir, asset.geojsonName);
  rmSync(target, { force: true });
  run(
    "ogr2ogr",
    [
      "-f",
      "GeoJSON",
      "-t_srs",
      "EPSG:4326",
      "-lco",
      "COORDINATE_PRECISION=5",
      target,
      source
    ],
    `convert ${asset.name} to GeoJSON`
  );
}

function buildPmtiles(asset) {
  if (!asset.pmtilesName) return;
  const source = path.join(buildDir, asset.geojsonName);
  const target = path.join(outputDir, asset.pmtilesName);
  rmSync(target, { force: true });
  run(
    "tippecanoe",
    [
      "-o",
      target,
      "-l",
      asset.layerName,
      "--force",
      "--no-tile-compression",
      "--drop-densest-as-needed",
      "--extend-zooms-if-still-dropping",
      `--minimum-zoom=${asset.minZoom ?? 0}`,
      `--maximum-zoom=${asset.maxZoom ?? 8}`,
      source
    ],
    `build ${asset.pmtilesName}`
  );
}

function buildCitiesJson() {
  const source = path.join(buildDir, cities.geojsonName);
  const target = path.join(outputDir, "cities.json");
  const collection = JSON.parse(readFileSync(source, "utf8"));

  const records = collection.features
    .filter((feature) => feature.geometry.type === "Point" && feature.geometry.coordinates)
    .map((feature) => {
      const properties = feature.properties;
      const [lng, lat] = feature.geometry.coordinates;
      return {
        id: properties.ne_id ? `ne-city-${properties.ne_id}` : undefined,
        name: properties.NAME ?? properties.NAMEASCII ?? properties.name,
        nameEn: properties.NAMEASCII ?? properties.NAME,
        countryCode: properties.ADM0_A3 ?? properties.ISO_A2,
        population: properties.POP_MAX ?? properties.POP_MIN ?? null,
        lat,
        lng
      };
    })
    .filter((city) => city.name && city.countryCode)
    .sort((a, b) => Number(b.population ?? 0) - Number(a.population ?? 0));

  writeFileSync(target, `${JSON.stringify(records)}\n`);
}

function writeManifest() {
  const files = ["world-adm0.pmtiles", "world-adm1.pmtiles", "cities.json"];
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "Natural Earth public domain datasets",
    files: Object.fromEntries(
      files.map((file) => {
        const filePath = path.join(outputDir, file);
        return [file, existsSync(filePath) ? statSync(filePath).size : null];
      })
    )
  };
  writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function run(command, args, label) {
  console.log(`\n${label}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
