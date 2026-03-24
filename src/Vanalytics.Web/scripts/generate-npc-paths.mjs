/**
 * Fetches AltanaView NPC model CSV data and generates npc-model-paths.json.
 *
 * Run: node scripts/generate-npc-paths.mjs
 * Output: public/data/npc-model-paths.json
 */

const BASE = 'https://raw.githubusercontent.com/mynameisgonz/AltanaView/master/List/NPC'

// Fetch the index to get category mappings
async function fetchIndex() {
  const res = await fetch(`${BASE}/index.csv`)
  const text = await res.text()
  const entries = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const comma = trimmed.indexOf(',')
    if (comma < 0) continue
    entries.push({
      file: trimmed.slice(0, comma),
      label: trimmed.slice(comma + 1),
    })
  }
  return entries
}

// Convert AltanaView volume number to ROM directory name
function volumeToRomDir(vol) {
  return vol === '1' ? 'ROM' : `ROM${vol}`
}

// Parse a single path reference like "1/3/102" → "ROM/3/102.dat"
function parseSinglePath(ref) {
  const parts = ref.split('/')
  if (parts.length !== 3) return null
  const [vol, folder, file] = parts
  return `${volumeToRomDir(vol)}/${folder}/${file}.dat`
}

// Parse path references with ranges: "1/5/117-123" → multiple paths
function expandPathRef(ref) {
  const parts = ref.split('/')
  if (parts.length !== 3) return []
  const [vol, folder, fileSpec] = parts
  const romDir = volumeToRomDir(vol)

  if (fileSpec.includes('-')) {
    const [startStr, endStr] = fileSpec.split('-')
    const start = parseInt(startStr, 10)
    const end = parseInt(endStr, 10)
    if (isNaN(start) || isNaN(end)) return []
    const paths = []
    for (let i = start; i <= end; i++) {
      paths.push(`${romDir}/${folder}/${i}.dat`)
    }
    return paths
  }

  const path = `${romDir}/${folder}/${fileSpec}.dat`
  return [path]
}

// Parse a CSV line: "pathRefs,Name"
function parseCsvLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return null
  const comma = trimmed.indexOf(',')
  if (comma < 0) return null
  const pathStr = trimmed.slice(0, comma)
  const name = trimmed.slice(comma + 1).trim()
  if (!name || !pathStr) return null

  // Split by semicolons, expand ranges
  const refs = pathStr.split(';')
  const allPaths = []
  for (const ref of refs) {
    allPaths.push(...expandPathRef(ref.trim()))
  }

  return { name, paths: allPaths }
}

async function fetchCategory(file, label) {
  const res = await fetch(`${BASE}/${file}.csv`)
  if (!res.ok) {
    console.warn(`  Failed to fetch ${file}.csv: ${res.status}`)
    return []
  }
  const text = await res.text()
  const models = []

  for (const line of text.split('\n')) {
    const parsed = parseCsvLine(line)
    if (!parsed || parsed.paths.length === 0) continue

    if (parsed.paths.length === 1) {
      // Single model, single entry
      models.push({
        name: parsed.name,
        category: label,
        path: parsed.paths[0],
      })
    } else {
      // Multiple variants — create numbered entries
      for (let i = 0; i < parsed.paths.length; i++) {
        models.push({
          name: parsed.paths.length > 1 ? `${parsed.name} ${i + 1}` : parsed.name,
          category: label,
          path: parsed.paths[i],
        })
      }
    }
  }

  return models
}

async function main() {
  console.log('Fetching AltanaView NPC model index...')
  const categories = await fetchIndex()
  console.log(`Found ${categories.length} categories`)

  const allModels = []

  for (const { file, label } of categories) {
    console.log(`  Fetching ${file}.csv (${label})...`)
    const models = await fetchCategory(file, label)
    console.log(`    → ${models.length} model entries`)
    allModels.push(...models)
  }

  console.log(`\nTotal: ${allModels.length} model entries`)

  // Sort by category, then name
  allModels.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.name.localeCompare(b.name)
  })

  const fs = await import('fs')
  const outPath = new URL('../public/data/npc-model-paths.json', import.meta.url).pathname
  // On Windows, strip leading slash from /C:/...
  const cleanPath = outPath.replace(/^\/([A-Z]:)/, '$1')
  fs.writeFileSync(cleanPath, JSON.stringify(allModels, null, 2))
  console.log(`Wrote ${cleanPath} (${allModels.length} entries)`)
}

main().catch(console.error)
