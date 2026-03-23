/**
 * Reads the GearSwap README and extracts zone DAT file mappings.
 *
 * Run: node scripts/generate-zone-paths.mjs
 * Output: public/data/zone-paths.json
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const readmePath = path.resolve(__dirname, '../../../../GearSwap/README.md')

const EXPANSION_ORDER = ['Original', 'Zilart', 'Promathia', 'Aht Urhgan']

function summaryToExpansion(summary) {
  const text = summary.replace(/={2,}/g, '').trim()
  if (text.includes('Original')) return 'Original'
  if (text.includes('Zilart')) return 'Zilart'
  if (text.includes('Promathia')) return 'Promathia'
  if (text.includes('Aht Urgan') || text.includes('Aht Urhgan')) return 'Aht Urhgan'
  return null
}

function parseReadme(content) {
  const zones = []

  // Split on <details> blocks
  const detailsRegex = /<details>[\s\S]*?<\/details>/g
  const blocks = content.match(detailsRegex) || []

  for (const block of blocks) {
    // Extract summary text
    const summaryMatch = block.match(/<summary>(.*?)<\/summary>/)
    if (!summaryMatch) continue
    const expansion = summaryToExpansion(summaryMatch[1])
    if (!expansion) continue

    // Extract lines matching ROM[N?]/folder/file.dat -- Zone Name
    const lineRegex = /^(ROM\d*\/\d+\/\d+\.dat)\s+--\s+(.+)$/gm
    let match
    while ((match = lineRegex.exec(block)) !== null) {
      zones.push({
        name: match[2].trim(),
        path: match[1].trim(),
        expansion,
      })
    }
  }

  return zones
}

async function main() {
  console.log(`Reading README from: ${readmePath}`)
  const content = readFileSync(readmePath, 'utf-8')

  const zones = parseReadme(content)
  console.log(`Parsed ${zones.length} zone entries`)

  // Sort by expansion order, then by name
  zones.sort((a, b) => {
    const ei = EXPANSION_ORDER.indexOf(a.expansion)
    const ej = EXPANSION_ORDER.indexOf(b.expansion)
    if (ei !== ej) return ei - ej
    return a.name.localeCompare(b.name)
  })

  // Log counts per expansion
  for (const exp of EXPANSION_ORDER) {
    const count = zones.filter(z => z.expansion === exp).length
    console.log(`  ${exp}: ${count} zones`)
  }

  const fs = await import('fs')
  const outPath = new URL('../public/data/zone-paths.json', import.meta.url).pathname
  const cleanPath = outPath.replace(/^\/([A-Z]:)/, '$1')
  fs.writeFileSync(cleanPath, JSON.stringify(zones, null, 2))
  console.log(`Wrote ${cleanPath} (${zones.length} entries)`)
}

main().catch(console.error)
