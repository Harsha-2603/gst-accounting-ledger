"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const killerTest1_1 = require("./killerTest1");
const killerTest2_1 = require("./killerTest2");
const killerTest3_1 = require("./killerTest3");
async function main() {
    console.log('\n====================================================');
    console.log('🏆 HACKBACK 2026 OFFICIAL KILLER TEST SUITE');
    console.log('====================================================\n');
    try {
        await (0, killerTest1_1.runKillerTest1)();
        await (0, killerTest2_1.runKillerTest2)();
        await (0, killerTest3_1.runKillerTest3)();
        console.log('====================================================');
        console.log('🎉 ALL THREE KILLER TESTS PASSED WITH 100% SUCCESS!');
        console.log('====================================================\n');
    }
    catch (err) {
        console.error('\n====================================================');
        console.error('❌ KILLER TEST SUITE FAILURE DETECTED:');
        console.error(`   ${err.message}`);
        if (err.stack) {
            console.error(`\nStack Trace:\n${err.stack}`);
        }
        console.error('====================================================\n');
        process.exit(1);
    }
}
main();
