import { runHarnessScenariosTests } from './harness/harnessScenarios.test';

async function main(): Promise<void> {
  try {
    await runHarnessScenariosTests();
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ TEST HARNESS SUITE FAILED:', err.message);
    process.exit(1);
  }
}

main();
