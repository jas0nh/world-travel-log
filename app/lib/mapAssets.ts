import { existsSync, statSync } from "node:fs";
import path from "node:path";

export type MapAssetStatus = {
  mode: "pmtiles" | "geojson";
  assets: Record<
    "worldAdm0" | "worldAdm1" | "cities",
    {
      path: string;
      exists: boolean;
      bytes: number | null;
    }
  >;
};

const assetPaths = {
  worldAdm0: "/data/world-adm0.pmtiles",
  worldAdm1: "/data/world-adm1.pmtiles",
  cities: "/data/cities.json"
} as const;

export function getMapAssetStatus(): MapAssetStatus {
  const assets = Object.fromEntries(
    Object.entries(assetPaths).map(([key, publicPath]) => {
      const filePath = path.join(process.cwd(), "public", publicPath);
      const exists = existsSync(filePath);
      return [
        key,
        {
          path: publicPath,
          exists,
          bytes: exists ? statSync(filePath).size : null
        }
      ];
    })
  ) as MapAssetStatus["assets"];

  return {
    mode: assets.worldAdm0.exists && assets.worldAdm1.exists ? "pmtiles" : "geojson",
    assets
  };
}
