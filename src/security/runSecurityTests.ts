#!/usr/bin/env npx ts-node
/**
 * Security Test Runner
 *
 * Executes all security tests including:
 * - Prompt injection detection
 * - Data leak prevention
 * - Input sanitization
 * - Output filtering
 *
 * Usage: npx ts-node src/security/runSecurityTests.ts
 */

import { runSecurityHarness } from './PromptInjectionGuard'
import { dataLeakPrevention } from './DataLeakPrevention'

async function main() {
  console.log('\n')
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║                                                              ║')
  console.log('║           🔒 ALABOBAI SECURITY HARNESS 🔒                    ║')
  console.log('║                                                              ║')
  console.log('║   Testing prompt injection & data leak protection           ║')
  console.log('║                                                              ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log('\n')

  let totalPassed = 0
  let totalFailed = 0
  let criticalIssues = 0

  // Run Prompt Injection Tests
  console.log('\n\n')
  console.log('┌──────────────────────────────────────────────────────────────┐')
  console.log('│  PART 1: PROMPT INJECTION PROTECTION                        │')
  console.log('└──────────────────────────────────────────────────────────────┘')

  const injectionResults = await runSecurityHarness()

  for (const result of injectionResults) {
    if (result.passed) {
      totalPassed++
    } else {
      totalFailed++
      if (result.severity === 'critical') {
        criticalIssues++
      }
    }
  }

  // Run Data Leak Prevention Tests
  console.log('\n\n')
  console.log('┌──────────────────────────────────────────────────────────────┐')
  console.log('│  PART 2: DATA LEAK PREVENTION                                │')
  console.log('└──────────────────────────────────────────────────────────────┘')

  const dlpResults = await dataLeakPrevention.runTests()
  totalPassed += dlpResults.passed
  totalFailed += dlpResults.failed

  // Final Summary
  console.log('\n\n')
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║                    FINAL SUMMARY                             ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log('\n')

  const total = totalPassed + totalFailed
  const passRate = ((totalPassed / total) * 100).toFixed(1)

  console.log(`  📊 Total Tests:     ${total}`)
  console.log(`  ✅ Passed:          ${totalPassed}`)
  console.log(`  ❌ Failed:          ${totalFailed}`)
  console.log(`  📈 Pass Rate:       ${passRate}%`)

  if (criticalIssues > 0) {
    console.log(`  🚨 Critical Issues: ${criticalIssues}`)
  }

  console.log('\n')

  if (totalFailed === 0) {
    console.log('  ╔════════════════════════════════════════════════════════╗')
    console.log('  ║  🎉 ALL SECURITY TESTS PASSED! Platform is secure.    ║')
    console.log('  ╚════════════════════════════════════════════════════════╝')
  } else if (criticalIssues > 0) {
    console.log('  ╔════════════════════════════════════════════════════════╗')
    console.log('  ║  🚨 CRITICAL: Security vulnerabilities detected!      ║')
    console.log('  ║  Immediate action required.                           ║')
    console.log('  ╚════════════════════════════════════════════════════════╝')
  } else {
    console.log('  ╔════════════════════════════════════════════════════════╗')
    console.log('  ║  ⚠️  Some tests need attention. Review results above. ║')
    console.log('  ╚════════════════════════════════════════════════════════╝')
  }

  console.log('\n')

  // Exit with appropriate code
  process.exit(criticalIssues > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Security harness failed:', error)
  process.exit(1)
})
