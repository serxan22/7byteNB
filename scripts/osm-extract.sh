#!/usr/bin/env bash
# Filters the Geofabrik Azerbaijan extract into thematic GeoJSONSeq files (cached; skips existing).
set -euo pipefail
cd "$(dirname "$0")/.."
PBF=data/raw/azerbaijan-latest.osm.pbf
O=data/raw/osm
mkdir -p "$O"

run() { # name, export-flags, filters...
  local name=$1 flags=$2; shift 2
  if [ -s "$O/$name.geojsonseq" ]; then echo "skip $name"; return; fi
  osmium tags-filter "$PBF" "$@" -o "$O/$name.osm.pbf" --overwrite
  osmium export "$O/$name.osm.pbf" $flags -f geojsonseq -o "$O/$name.geojsonseq" --overwrite -a type,id
  echo "$name: $(wc -l < "$O/$name.geojsonseq") features"
}

run boundaries "--geometry-types=polygon" r/boundary=administrative
run pois "" \
  nwr/amenity=pharmacy,marketplace,restaurant,cafe,fast_food,school,kindergarten,university,college,hospital,clinic,doctors,bank,atm,fuel \
  nwr/shop=supermarket,convenience,greengrocer,mall \
  nwr/leisure=sports_centre,fitness_centre,stadium,park \
  nwr/station=subway nwr/railway=station nwr/highway=bus_stop
run roads "--geometry-types=linestring" \
  w/highway=primary,secondary,tertiary,unclassified,residential,living_street,track,trunk,motorway
run landcover "--geometry-types=polygon" \
  wr/landuse=forest,farmland,orchard,vineyard,residential,industrial,meadow,grass,farmyard \
  wr/natural=wood,water,wetland,beach,sand,scrub,grassland,heath
run coastline "--geometry-types=linestring" w/natural=coastline

# Bus / minibus routes: relations are not exported as geometry -> OPL for custom parsing
if [ ! -s "$O/routes.opl" ]; then
  osmium tags-filter "$PBF" r/route=bus,minibus,share_taxi,trolleybus -o "$O/routes.osm.pbf" --overwrite
  osmium cat "$O/routes.osm.pbf" -f opl -o "$O/routes.opl" --overwrite
  echo "routes: $(grep -c '^r' "$O/routes.opl") relations"
fi
ls -la "$O"
