// Qazax rayonu relation is incomplete in the Geofabrik extract (a member way lies outside it),
// so osmium drops it. Re-assemble outer rings from available ways; close any open chain with a straight segment.
import fs from "node:fs";

const opl = fs.readFileSync("data/raw/osm/qazax.opl", "utf8").split("\n").filter(Boolean);
const field = (parts, ch) => parts.find((p) => p[0] === ch)?.slice(1) ?? "";
const nodes = new Map(), ways = new Map();
let members = [];
for (const line of opl) {
  const parts = line.split(" ");
  if (line[0] === "n") nodes.set(parts[0], [parseFloat(field(parts, "x")), parseFloat(field(parts, "y"))]);
  if (line[0] === "w") ways.set(parts[0], field(parts, "N").split(",").filter(Boolean));
  if (line[0] === "r") members = field(parts, "M").split(",").map((m) => m.split("@"));
}
let segs = members.filter(([id, role]) => id[0] === "w" && role === "outer" && ways.has(id)).map(([id]) => ways.get(id).map((n) => nodes.get(n)).filter(Boolean));
const key = (p) => p.join(",");
const rings = [];
while (segs.length) {
  let ring = segs.shift();
  let grown = true;
  while (grown && key(ring[0]) !== key(ring.at(-1))) {
    grown = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (key(s[0]) === key(ring.at(-1))) ring = ring.concat(s.slice(1));
      else if (key(s.at(-1)) === key(ring.at(-1))) ring = ring.concat(s.slice(0, -1).reverse());
      else if (key(s.at(-1)) === key(ring[0])) ring = s.concat(ring.slice(1));
      else if (key(s[0]) === key(ring[0])) ring = s.slice(1).reverse().concat(ring);
      else continue;
      segs.splice(i, 1);
      grown = true;
      break;
    }
  }
  if (key(ring[0]) !== key(ring.at(-1))) ring.push(ring[0]);
  if (ring.length >= 4) rings.push(ring);
}
const feature = {
  type: "Feature",
  properties: { "name:az": "Qazax rayonu", name: "Qazax rayonu", admin_level: "6", repaired: true },
  geometry: { type: "MultiPolygon", coordinates: rings.map((r) => [r]) },
};
fs.writeFileSync("data/raw/osm/qazax.geojson", JSON.stringify(feature));
console.log(`qazax.geojson: ${rings.length} rings, sizes ${rings.map((r) => r.length).join(",")}`);
