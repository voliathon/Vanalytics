/**
 * Generates zone-paths.json with verified FFXI zone geometry DAT paths.
 *
 * Source: Codecomp's FFXI zone DAT file locations gist (verified paths only).
 * Format: volume-folder-file → ROM{n}/{folder}/{file}.dat
 *
 * IMPORTANT: Only includes entries from the verified gist. Do NOT guess
 * additional paths — wrong file IDs load incorrect zone geometry.
 *
 * Run: node scripts/generate-zone-paths.mjs
 * Output: public/data/zone-paths.json
 */

// Verified zone geometry paths from Codecomp gist
// Format in gist: "volume-folder-file,x,y,z,Name"
const ZONE_DATA = [
  // All from gist (volume 1 = ROM/, folder-file)
  { name: 'Qufim Island', path: 'ROM/0/58.dat', expansion: 'Original' },
  { name: 'Beadeaux', path: 'ROM/0/61.dat', expansion: 'Original' },
  { name: 'Qulun Dome', path: 'ROM/0/62.dat', expansion: 'Original' },
  { name: 'Castle Oztroja', path: 'ROM/0/63.dat', expansion: 'Original' },
  { name: 'Altar Room', path: 'ROM/0/64.dat', expansion: 'Original' },
  { name: 'Toraimarai Canal', path: 'ROM/0/65.dat', expansion: 'Original' },
  { name: 'Castle Zvahl Keep', path: 'ROM/0/73.dat', expansion: 'Original' },
  { name: 'Throne Room', path: 'ROM/0/74.dat', expansion: 'Original' },
  { name: 'Maze of Shakhrami', path: 'ROM/0/75.dat', expansion: 'Original' },
  { name: "Crawler's Nest", path: 'ROM/0/76.dat', expansion: 'Original' },
  { name: 'The Eldieme Necropolis', path: 'ROM/0/77.dat', expansion: 'Original' },
  { name: 'Windurst Waters', path: 'ROM/0/78.dat', expansion: 'Original' },
  { name: 'Windurst Walls', path: 'ROM/0/79.dat', expansion: 'Original' },
  { name: 'Port Windurst', path: 'ROM/0/80.dat', expansion: 'Original' },
  { name: 'Windurst Woods', path: 'ROM/0/81.dat', expansion: 'Original' },
  { name: 'Palborough Mines', path: 'ROM/0/88.dat', expansion: 'Original' },
  { name: "Ordelle's Caves", path: 'ROM/0/92.dat', expansion: 'Original' },
  { name: 'Ghelsba Outpost', path: 'ROM/0/95.dat', expansion: 'Original' },
  { name: 'Davoi', path: 'ROM/0/99.dat', expansion: 'Original' },
  { name: 'Monastic Cavern', path: 'ROM/0/100.dat', expansion: 'Original' },
  { name: 'Valkurm Dunes', path: 'ROM/0/102.dat', expansion: 'Original' },
  { name: 'Giddeus', path: 'ROM/0/104.dat', expansion: 'Original' },
  { name: 'Bostaunieux Oubliette', path: 'ROM/0/108.dat', expansion: 'Original' },
  { name: 'Inner Horutoto Ruins', path: 'ROM/0/112.dat', expansion: 'Original' },
  { name: "Port San d'Oria", path: 'ROM/0/113.dat', expansion: 'Original' },
  { name: 'West Ronfaure', path: 'ROM/0/120.dat', expansion: 'Original' },
  { name: 'East Ronfaure', path: 'ROM/0/121.dat', expansion: 'Original' },
  { name: 'North Gustaberg', path: 'ROM/0/123.dat', expansion: 'Original' },
  { name: 'South Gustaberg', path: 'ROM/0/124.dat', expansion: 'Original' },
  { name: 'West Sarutabaruta', path: 'ROM/0/127.dat', expansion: 'Original' },
  { name: 'East Sarutabaruta', path: 'ROM/1/0.dat', expansion: 'Original' },
  { name: 'Fort Ghelsba', path: 'ROM/1/7.dat', expansion: 'Original' },
  { name: 'Zeruhn Mines', path: 'ROM/1/11.dat', expansion: 'Original' },
  { name: 'Gusgen Mines', path: 'ROM/1/16.dat', expansion: 'Original' },
  { name: 'Garlaige Citadel', path: 'ROM/1/17.dat', expansion: 'Original' },
  { name: "Southern San d'Oria", path: 'ROM/1/31.dat', expansion: 'Original' },
  { name: "Northern San d'Oria", path: 'ROM/1/32.dat', expansion: 'Original' },
  { name: "Chateau d'Oraguille", path: 'ROM/1/33.dat', expansion: 'Original' },
  { name: 'Bastok Mines', path: 'ROM/1/34.dat', expansion: 'Original' },
  { name: 'Bastok Markets', path: 'ROM/1/35.dat', expansion: 'Original' },
  { name: 'Port Bastok', path: 'ROM/1/36.dat', expansion: 'Original' },
  { name: 'Metalworks', path: 'ROM/1/37.dat', expansion: 'Original' },
  { name: "Ru'Lude Gardens", path: 'ROM/1/39.dat', expansion: 'Original' },
  { name: 'Upper Jeuno', path: 'ROM/1/40.dat', expansion: 'Original' },
  { name: 'Lower Jeuno', path: 'ROM/1/41.dat', expansion: 'Original' },
  { name: 'Port Jeuno', path: 'ROM/1/42.dat', expansion: 'Original' },
  { name: 'Selbina', path: 'ROM/1/43.dat', expansion: 'Original' },
  { name: 'Mhaura', path: 'ROM/1/44.dat', expansion: 'Original' },
]

// Sort by name
ZONE_DATA.sort((a, b) => a.name.localeCompare(b.name))

console.log(`Total: ${ZONE_DATA.length} verified zone geometry entries`)

const fs = await import('fs')
const outPath = new URL('../public/data/zone-paths.json', import.meta.url).pathname
const cleanPath = outPath.replace(/^\/([A-Z]:)/, '$1')
fs.writeFileSync(cleanPath, JSON.stringify(ZONE_DATA, null, 2))
console.log(`Wrote ${cleanPath}`)
