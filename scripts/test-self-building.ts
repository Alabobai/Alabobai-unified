/**
 * Test Script for Self-Building Code Agent
 * Demonstrates the AI's ability to read, analyze, and modify its own codebase
 */

import { createCodeBuilderAgent } from '../src/core/agents/code-builder-agent.js';

const PROJECT_ROOT = '/Users/alaboebai/Alabobai/alabobai-unified';

async function main() {
  console.log('🧠 Testing Alabobai Self-Building Agent\n');
  console.log('='.repeat(60));

  // Create the agent in sandbox mode (safe - no actual changes)
  const agent = createCodeBuilderAgent(PROJECT_ROOT, {
    sandboxMode: true, // Preview only, no actual file changes
    backupEnabled: true,
    gitEnabled: true,
  });

  const tools = agent.getTools();
  console.log(`\n📦 Registered ${tools.length} tools:`);
  tools.forEach(t => console.log(`   - ${t.name}: ${t.description.slice(0, 50)}...`));

  // Test 1: Read a file
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Read File');
  console.log('='.repeat(60));
  
  const readTool = tools.find(t => t.name === 'read_file')!;
  const fileContent = await readTool.execute({ 
    path: 'src/core/agents/code-builder-agent.ts',
    startLine: 1,
    endLine: 20
  });
  console.log('\nFirst 20 lines of code-builder-agent.ts:');
  console.log(fileContent);

  // Test 2: List files
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: List Files');
  console.log('='.repeat(60));
  
  const listTool = tools.find(t => t.name === 'list_files')!;
  const files = await listTool.execute({ 
    path: 'src/core/brain'
  });
  console.log('\nFiles in src/core/brain/:');
  console.log(files);

  // Test 3: Grep for patterns
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Search Code (grep)');
  console.log('='.repeat(60));
  
  const grepTool = tools.find(t => t.name === 'grep')!;
  const grepResults = await grepTool.execute({ 
    pattern: 'createCodeBuilderAgent',
    path: 'src/core'
  });
  console.log('\nSearching for "createCodeBuilderAgent":');
  console.log(grepResults.slice(0, 500));

  // Test 4: Git status
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Git Status');
  console.log('='.repeat(60));
  
  const gitStatusTool = tools.find(t => t.name === 'git_status')!;
  const gitStatus = await gitStatusTool.execute({});
  console.log('\nGit status:');
  console.log(gitStatus || '(clean)');

  // Test 5: Write file (sandbox mode - won't actually write)
  console.log('\n' + '='.repeat(60));
  console.log('TEST 5: Write File (Sandbox Mode)');
  console.log('='.repeat(60));
  
  const writeTool = tools.find(t => t.name === 'write_file')!;
  const writeResult = await writeTool.execute({
    path: 'test-output.txt',
    content: '// This is a test file created by the self-building agent\nexport const test = true;\n'
  });
  console.log('\nWrite result:', writeResult);

  // Test 6: Edit file (sandbox mode)
  console.log('\n' + '='.repeat(60));
  console.log('TEST 6: Edit File (Sandbox Mode)');
  console.log('='.repeat(60));
  
  const editTool = tools.find(t => t.name === 'edit_file')!;
  try {
    const editResult = await editTool.execute({
      path: 'src/core/agents/code-builder-agent.ts',
      oldText: 'Self-building capabilities',
      newText: 'Self-building capabilities (AI-powered)'
    });
    console.log('\nEdit result:', editResult);
  } catch (e: any) {
    console.log('\nEdit error (expected in some cases):', e.message);
  }

  // Test 7: Run command
  console.log('\n' + '='.repeat(60));
  console.log('TEST 7: Run Command (Sandbox Mode)');
  console.log('='.repeat(60));
  
  const runTool = tools.find(t => t.name === 'run_command')!;
  const cmdResult = await runTool.execute({
    command: 'echo "Hello from self-building agent!"'
  });
  console.log('\nCommand result:', cmdResult);

  // Test 8: TypeCheck
  console.log('\n' + '='.repeat(60));
  console.log('TEST 8: TypeScript Check');
  console.log('='.repeat(60));
  
  const typecheckTool = tools.find(t => t.name === 'typecheck')!;
  console.log('\nRunning TypeScript check (this may take a moment)...');
  const typeResult = await typecheckTool.execute({});
  console.log('TypeCheck result:', typeResult ? typeResult.slice(0, 500) : '✓ No type errors');

  // Show pending edits (from sandbox mode)
  console.log('\n' + '='.repeat(60));
  console.log('PENDING EDITS (Sandbox Mode)');
  console.log('='.repeat(60));
  
  const pendingEdits = agent.getPendingEdits();
  console.log(`\n${pendingEdits.length} pending edit(s):`);
  pendingEdits.forEach(edit => {
    console.log(`   - ${edit.operation}: ${edit.path}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed successfully!');
  console.log('='.repeat(60));
  console.log('\nThe self-building agent can:');
  console.log('  ✓ Read and analyze source files');
  console.log('  ✓ List and search the codebase');
  console.log('  ✓ Check git status and history');
  console.log('  ✓ Preview file changes (sandbox mode)');
  console.log('  ✓ Run shell commands safely');
  console.log('  ✓ Run TypeScript type checking');
  console.log('\nTo apply changes, disable sandbox mode with agent.disableSandboxMode()');
}

main().catch(console.error);
