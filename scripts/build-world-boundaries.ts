import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { feature } from "topojson-client";

type Topology = Parameters<typeof feature>[0];

type TopoGeometry = {
  id?: string | number;
  properties?: {
    name?: string;
  };
};

type GeoFeature = {
  type: "Feature";
  id?: string | number;
  properties: {
    name?: string;
    isoNumeric: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

type GeoCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

const sourcePath = path.join(
  process.cwd(),
  "node_modules",
  "world-atlas",
  "countries-110m.json"
);
const targetPath = path.join(process.cwd(), "app", "data", "world-countries-110m.geojson");

async function main() {
  const topology = JSON.parse(await readFile(sourcePath, "utf8")) as Topology & {
    objects: {
      countries: {
        type: "GeometryCollection";
        geometries: TopoGeometry[];
      };
    };
  };

  const collection = feature(
    topology as never,
    topology.objects.countries as never
  ) as unknown as GeoCollection;
  collection.features = collection.features
    .filter((item) => item.geometry.type === "Polygon" || item.geometry.type === "MultiPolygon")
    .map((item) => ({
      ...item,
      properties: {
        ...item.properties,
        isoNumeric: String(item.id).padStart(3, "0")
      }
    }));

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(collection)}\n`);
  console.log(`Wrote ${collection.features.length} country boundaries to ${targetPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
