import { runHealthTest } from './health.test';
import { runKillerTest1 } from './killerTest1';
import { runKillerTest2 } from './killerTest2';
import { runKillerTest3 } from './killerTest3';

import { runAccountingCoreUnitTests } from './accountingCore.test';
import { runApiEndpointIntegrationTests } from './apiEndpoints.test';
import { runHarnessScenariosTests } from './harness/harnessScenarios.test';
import { runApiContractTests } from './contract/apiContract.test';
import { runAICopilotTests } from './aiCopilot.test';

async function runAllTests(): Promise<void> {
  console.log('====================================================');
  console.log('🏁 HACKBACK 2026 CLEAN-ROOM BACKEND TEST SUITE');
  console.log('====================================================\n');

  console.log('--- PHASE 1: HEALTH & DATABASE VERIFICATION ---');
  await runHealthTest();

  console.log('\n--- PHASE 2: FOCUSED ACCOUNTING CORE UNIT TESTS ---');
  await runAccountingCoreUnitTests();

  console.log('\n--- PHASE 3: TEST HARNESS & REUSABLE SCENARIOS FIXTURES ---');
  await runHarnessScenariosTests();

  console.log('\n--- PHASE 4: FULL API CONTRACT & INTEGRATION TESTS ---');
  await runApiContractTests();

  console.log('\n--- PHASE 5: KILLER TESTS CERTIFICATION ---');
  await runKillerTest1();
  await runKillerTest2();
  await runKillerTest3();

  console.log('\n--- PHASE 6: AI ACCOUNTING COPILOT VERIFICATION (DIFFERENTIATOR) ---');
  await runAICopilotTests();

  console.log('\n--- PHASE 7: KILLER TEST REGRESSION SAFETY RE-RUN ---');
  console.log('Re-certifying that all test suites and additions caused ZERO double-entry regressions:');
  await runKillerTest1();
  await runKillerTest2();
  await runKillerTest3();

  console.log('\n====================================================');
  console.log('🎉 ALL BACKEND, KILLER & AI TESTS PASSED 100%!');
  console.log('====================================================');
}

runAllTests().catch(err => {
  console.error('\n❌ BACKEND TEST SUITE FAILURE:', err);
  process.exit(1);
});

