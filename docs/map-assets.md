# Map Asset Pipeline

The travel records should stay in the database. Boundary geometry should be treated as static map assets.

## Target Files

```text
public/data/world-adm0.pmtiles
public/data/world-adm1.pmtiles
public/data/cities.json
```

Those generated files are ignored by git so large binary tiles do not get committed accidentally.
Intermediate GeoJSON stays in `.cache/natural-earth/build/`.

## Build

```bash
brew install gdal tippecanoe
npm run data:map-assets
```

The script downloads Natural Earth datasets, converts shapefiles with `ogr2ogr`, and builds PMTiles with `tippecanoe`.

## Runtime Contract

`GET /api/map-assets` reports whether PMTiles files exist:

```json
{
  "mode": "pmtiles",
  "assets": {
    "worldAdm0": { "path": "/data/world-adm0.pmtiles", "exists": true, "bytes": 123 },
    "worldAdm1": { "path": "/data/world-adm1.pmtiles", "exists": true, "bytes": 123 },
    "cities": { "path": "/data/cities.json", "exists": true, "bytes": 123 }
  }
}
```

MapLibre GL loads the PMTiles assets as vector boundary layers, while `Place`
and `Visit` continue to drive the current interactive travel state.

## Join Strategy

Map features should expose stable provider metadata:

```json
{
  "provider": "natural-earth",
  "providerId": "ne_id or adm1_code",
  "level": "COUNTRY or REGION",
  "countryCode": "US",
  "name": "California"
}
```

The database should continue to store business state:

```text
Place.provider/providerId/name/level/parentId/lat/lng
Visit.placeId/datePrecision/note
```

On map click, the app can look up or lazily create the matching `Place`, then reuse the current visit workflow.
