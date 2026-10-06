import { runKillerTest1 } from './killerTest1';
import { runKillerTest2 } from './killerTest2';
import { runKillerTest3 } from './killerTest3';

async function main(): Promise<void> {
  console.log('\n====================================================');
  console.log('🏆 HACKBACK 2026 OFFICIAL KILLER TEST SUITE');
  console.log('====================================================\n');

  try {
    await runKillerTest1();
    await runKillerTest2();
    await runKillerTest3();

    console.log('====================================================');
    console.log('🎉 ALL THREE KILLER TESTS PASSED WITH 100% SUCCESS!');
    console.log('====================================================\n');
  } catch (err: any) {
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
