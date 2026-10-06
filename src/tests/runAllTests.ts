import { runHealthTest } from './health.test';
import { runKillerTest1 } from './killerTest1';
import { runKillerTest2 } from './killerTest2';
import { runKillerTest3 } from './killerTest3';

import { runAccountingCoreUnitTests } from './accountingCore.test';
import { runApiEndpointIntegrationTests } from './apiEndpoints.test';
import { runAICopilotTests } from './aiCopilot.test';

async function runAllTests(): Promise<void> {
  console.log('====================================================');
  console.log('🏁 HACKBACK 2026 CLEAN-ROOM BACKEND TEST SUITE');
  console.log('====================================================\n');

  console.log('--- PHASE 1: HEALTH & DATABASE VERIFICATION ---');
  await runHealthTest();

  console.log('\n--- PHASE 2: FOCUSED ACCOUNTING CORE UNIT TESTS ---');
  await runAccountingCoreUnitTests();

  console.log('\n--- PHASE 3: CORE HTTP REST API INTEGRATION TESTS ---');
  await runApiEndpointIntegrationTests();

  console.log('\n--- PHASE 4: KILLER TESTS CERTIFICATION ---');
  await runKillerTest1();
  await runKillerTest2();
  await runKillerTest3();

  console.log('\n--- PHASE 5: AI ACCOUNTING COPILOT VERIFICATION (DIFFERENTIATOR) ---');
  await runAICopilotTests();

  console.log('\n--- PHASE 6: KILLER TEST REGRESSION SAFETY RE-RUN ---');
  console.log('Re-certifying that AI Copilot and additions caused ZERO double-entry regressions:');
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

