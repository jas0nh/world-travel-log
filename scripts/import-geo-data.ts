import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.join(process.cwd(), "public", "data", "generated");

async function download(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  await mkdir(outDir, { recursive: true });
  const bytes = Buffer.from(await response.arrayBuffer());
  const target = path.join(outDir, fileName);
  await writeFile(target, bytes);
  return target;
}

async function main() {
  const country = process.argv[2]?.toUpperCase();

  if (!country) {
    console.log("Usage: npm run import:geo -- CN");
    console.log("Downloads starter source files into public/data/generated.");
    return;
  }

  const restCountries = await download(
    "https://restcountries.com/v3.1/all?fields=name,cca2,cca3,latlng,translations",
    "restcountries.json"
  );

  const geoBoundariesMeta = await download(
    `https://www.geoboundaries.org/api/current/gbOpen/${country}/ADM1/`,
    `geoboundaries-${country}-adm1.json`
  );

  console.log("Downloaded:");
  console.log(restCountries);
  console.log(geoBoundariesMeta);
  console.log("Next step: transform these files into Place rows and simplified GeoJSON layers.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
