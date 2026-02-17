#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = '/Users/alaboebai/Alabobai/alabobai-unified/app'
const appShellPath = path.join(ROOT, 'src/components/AppShell.tsx')
const sidebarPath = path.join(ROOT, 'src/components/Sidebar.tsx')

const expected = [
  { key: 'chat', special: 'default-chat' },
  { key: 'command-center', file: 'src/components/CommandCenterView.tsx', marker: 'Command Center' },
  { key: 'autonomous-agents', file: 'src/components/AutonomousAgentView.tsx', marker: 'Autonomous' },
  { key: 'deep-research', file: 'src/components/DeepResearchView.tsx', marker: 'Deep Research' },
  { key: 'privacy-fortress', file: 'src/components/PrivacyFortressView.tsx', marker: 'Privacy Fortress' },
  { key: 'financial-guardian', file: 'src/components/FinancialGuardianView.tsx', marker: 'Financial Guardian' },
  { key: 'creative-studio', file: 'src/components/CreativeStudioView.tsx', marker: 'Creative Studio' },
  { key: 'data-analyst', file: 'src/components/DataAnalystView.tsx', marker: 'Data Analyst' },
  { key: 'integration-hub', file: 'src/components/IntegrationHubView.tsx', marker: 'Integration Hub' },
  { key: 'memory-dashboard', file: 'src/components/MemoryDashboard.tsx', marker: 'Memory Dashboard' },
  { key: 'company-wizard', file: 'src/components/CompanyWizard.tsx' },
  { key: 'company-dashboard', file: 'src/components/CompanyDashboard.tsx' },
]

const appShell = await fs.readFile(appShellPath, 'utf8')
const sidebar = await fs.readFile(sidebarPath, 'utf8')

const results = []

for (const section of expected) {
  if (section.special === 'default-chat') {
    const hasChatFallback = appShell.includes('// Default chat view') && appShell.includes('<ChatPanel />')
    results.push({ section: section.key, pass: hasChatFallback, detail: hasChatFallback ? 'default chat fallback present' : 'chat fallback missing' })
    continue
  }

  const fullPath = path.join(ROOT, section.file)
  let fileText = ''
  let exists = true
  try { fileText = await fs.readFile(fullPath, 'utf8') } catch { exists = false }

  const wiredInAppShell = appShell.includes(`'${section.key}'`)
  const visibleInSidebar = sidebar.includes(section.key)
  const markerFound = exists && (section.marker ? fileText.includes(section.marker) : true)
  const hasDefaultExport = exists && /export\s+default\s+function\s+/m.test(fileText)

  const pass = exists && wiredInAppShell && visibleInSidebar && markerFound && hasDefaultExport
  const issues = []
  if (!exists) issues.push(`missing file ${section.file}`)
  if (exists && !hasDefaultExport) issues.push('missing default exported component function')
  if (!wiredInAppShell) issues.push('not wired in AppShell view map')
  if (!visibleInSidebar) issues.push('not present in Sidebar nav')
  if (!markerFound) issues.push(`marker '${section.marker}' not found`)

  results.push({ section: section.key, pass, detail: issues.length ? issues.join('; ') : 'wired + nav + component export OK' })
}

const passCount = results.filter(r => r.pass).length
const failCount = results.length - passCount

console.log(JSON.stringify({ suite: 'major-sections-smoke', passCount, failCount, results }, null, 2))
if (failCount > 0) process.exit(1)
