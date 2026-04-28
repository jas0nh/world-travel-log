# Generated Map Assets

This directory is the stable public mount point for map assets.

Generated public files live in this directory and are intentionally ignored by git:

- `world-adm0.pmtiles`
- `world-adm1.pmtiles`
- `cities.json`
- `manifest.json`

Build them locally with:

```bash
brew install gdal tippecanoe
npm run data:map-assets
```

The source datasets are Natural Earth public domain downloads:

- ADM0: `ne_50m_admin_0_countries`
- ADM1: `ne_10m_admin_1_states_provinces`
- Cities: `ne_10m_populated_places`

The script keeps intermediate GeoJSON under `.cache/natural-earth/build/` so the
app serves PMTiles instead of full raw geometry. `Place` and `Visit` remain the
source of truth for travel state.
