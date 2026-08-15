#!/usr/bin/env node
/**
 * Lightweight documentation gate for dsh-subagent-monitor.
 * Pure Node, zero dependencies. Checks:
 *   1. CHANGELOG top version === package.json version
 *   2. README.md / README.en.md bilingual pairing (when --changed is passed)
 *   3. Relative markdown links resolve to existing files
 *
 * Usage:
 *   node scripts/verify-docs.mjs
 *   node scripts/verify-docs.mjs --changed "README.md ARCHITECTURE.md"
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const fail = (msg) => errors.push(msg)

// --- 1. CHANGELOG / package.json version consistency -------------------------
let pkg
try {
  pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
} catch {
  console.error('verify-docs: package.json is unreadable or invalid JSON')
  process.exit(1)
}
const changelogPath = join(ROOT, 'CHANGELOG.md')
if (!existsSync(changelogPath)) {
  fail('CHANGELOG.md is missing')
} else {
  const changelog = readFileSync(changelogPath, 'utf8')
  const topVersion = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)
  if (!topVersion) fail('CHANGELOG.md: no `## [x.y.z]` version heading found')
  else if (topVersion[1] !== pkg.version) {
    fail(`version mismatch: CHANGELOG top is [${topVersion[1]}], package.json is ${pkg.version}`)
  }
}

// --- 2. bilingual pairing (PR context only) ----------------------------------
const args = process.argv.slice(2)
const changedIdx = args.indexOf('--changed')
if (changedIdx !== -1 && args[changedIdx + 1] && args[changedIdx + 1].trim()) {
  const changed = new Set(args[changedIdx + 1].trim().split(/\s+/))
  const pairs = [['README.md', 'README.en.md']]
  for (const [a, b] of pairs) {
    if (changed.has(a) !== changed.has(b)) {
      fail(`bilingual pairing: ${a} and ${b} must change in the same PR`)
    }
  }
}

// --- 3. relative markdown link check -----------------------------------------
const SCANNED = ['README.md', 'README.en.md', 'ARCHITECTURE.md', 'CHANGELOG.md', 'AGENTS.md']
const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g
for (const file of SCANNED) {
  const filePath = join(ROOT, file)
  if (!existsSync(filePath)) {
    fail(`missing doc file: ${file}`)
    continue
  }
  const text = readFileSync(filePath, 'utf8')
  let inFence = false
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    for (const m of line.matchAll(LINK_RE)) {
      const target = m[2].trim()
      if (!target || /^(https?:|mailto:)/.test(target) || target.startsWith('#')) continue
      const withoutAnchor = target.split('#')[0]
      if (!withoutAnchor) continue
      const resolved = resolve(dirname(filePath), withoutAnchor)
      if (!existsSync(resolved)) fail(`${file}: broken link -> ${target}`)
    }
  }
}

// --- 4. lib freshness (committed bundle must match the current package id) -----
const libClient = join(ROOT, 'lib', 'client.js')
if (existsSync(libClient)) {
  const bundle = readFileSync(libClient, 'utf8')
  if (!bundle.includes(pkg.name)) {
    fail(`lib/client.js is stale (does not contain "${pkg.name}"): run \`npm run build\` and commit lib/`)
  }
} else {
  fail('lib/client.js is missing: run `npm run build` before committing')
}

// --- report -------------------------------------------------------------------
if (errors.length === 0) {
  console.log('verify-docs: OK (version / bilingual pairing / links / lib freshness)')
  process.exit(0)
}
console.error('verify-docs: violations found:')
for (const e of errors) console.error('  - ' + e)
process.exit(1)
