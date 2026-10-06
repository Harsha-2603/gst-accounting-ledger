"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const health_test_1 = require("./health.test");
const killerTest1_1 = require("./killerTest1");
const killerTest2_1 = require("./killerTest2");
const killerTest3_1 = require("./killerTest3");
const accountingCore_test_1 = require("./accountingCore.test");
const apiEndpoints_test_1 = require("./apiEndpoints.test");
const aiCopilot_test_1 = require("./aiCopilot.test");
async function runAllTests() {
    console.log('====================================================');
    console.log('🏁 HACKBACK 2026 CLEAN-ROOM BACKEND TEST SUITE');
    console.log('====================================================\n');
    console.log('--- PHASE 1: HEALTH & DATABASE VERIFICATION ---');
    await (0, health_test_1.runHealthTest)();
    console.log('\n--- PHASE 2: FOCUSED ACCOUNTING CORE UNIT TESTS ---');
    await (0, accountingCore_test_1.runAccountingCoreUnitTests)();
    console.log('\n--- PHASE 3: CORE HTTP REST API INTEGRATION TESTS ---');
    await (0, apiEndpoints_test_1.runApiEndpointIntegrationTests)();
    console.log('\n--- PHASE 4: KILLER TESTS CERTIFICATION ---');
    await (0, killerTest1_1.runKillerTest1)();
    await (0, killerTest2_1.runKillerTest2)();
    await (0, killerTest3_1.runKillerTest3)();
    console.log('\n--- PHASE 5: AI ACCOUNTING COPILOT VERIFICATION (DIFFERENTIATOR) ---');
    await (0, aiCopilot_test_1.runAICopilotTests)();
    console.log('\n--- PHASE 6: KILLER TEST REGRESSION SAFETY RE-RUN ---');
    console.log('Re-certifying that AI Copilot and additions caused ZERO double-entry regressions:');
    await (0, killerTest1_1.runKillerTest1)();
    await (0, killerTest2_1.runKillerTest2)();
    await (0, killerTest3_1.runKillerTest3)();
    console.log('\n====================================================');
    console.log('🎉 ALL BACKEND, KILLER & AI TESTS PASSED 100%!');
    console.log('====================================================');
}
runAllTests().catch(err => {
    console.error('\n❌ BACKEND TEST SUITE FAILURE:', err);
    process.exit(1);
});
