# Travel Map

A personal travel map app built with Next.js, Prisma, SQLite, and MapLibre GL.

This public repository contains the app code, geographic seed/import scripts, and static map asset pipeline. It does **not** include personal visit history, local databases, backups, or runtime logs.

## What it does

- Browse the world at country level, then drill into regions and cities
- Track visited places with flexible date precision: year, month, day, or unknown
- Mark future travel plans separately from visited places
- Show a travel overview panel with progress, planned counts, timeline groups, and recent records
- Correct visited and planned records from a focused correction workspace
- Load boundary data through PMTiles instead of pushing large raw GeoJSON into the browser

## Tech stack

- Next.js 16
- React 19
- Prisma
- SQLite
- MapLibre GL
- PMTiles

## Privacy and data policy

This repo is prepared for public sharing.

- Personal visit data is stored only in the local SQLite database
- Local databases, backups, logs, build output, and browser artifacts are ignored by git
- The seed script only creates place data and map metadata
- Public map assets are generated from Natural Earth and related open datasets

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create your local env file:

```bash
cp .env.example .env
```

3. Create the database schema:

```bash
npm run db:push
```

4. Seed places:

```bash
npm run db:seed
```

5. Start the app:

```bash
npm run dev
```

The default app entry is `http://localhost:3000`.
This local workspace also has a launchd production service on `http://localhost:8378`.

## Map asset pipeline

Build vector map assets locally with:

```bash
brew install gdal tippecanoe
npm run data:map-assets
```

This generates:

- `public/data/world-adm0.pmtiles`
- `public/data/world-adm1.pmtiles`
- `public/data/cities.json`

Intermediate conversion files stay under `.cache/natural-earth/` and are not part of the public repo.

## Data model

- `Place`: countries, regions, and cities
- `Visit`: per-user place state, optional notes, and visited date fields
- `VisitStatus`: `VISITED` for completed trips and `PLANNED` for future destinations
- `MapLayerCache`: cached layer metadata

`PLANNED` records do not count toward visited progress or travel timelines. Parent
places can still show a mixed display state when they are already visited and have
planned child destinations.

## Useful scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:push
npm run db:seed
npm run data:map-assets
```

## Notes

- The app can run with only database-seeded places
- PMTiles assets are optional but recommended for better map scalability
- The local launch script used in this workspace serves the production app on port `8378`, but that is a machine-specific deployment detail, not a requirement for contributors
