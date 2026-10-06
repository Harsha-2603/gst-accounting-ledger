import { runApiContractTests } from './contract/apiContract.test';

async function main(): Promise<void> {
  try {
    await runApiContractTests();
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ API CONTRACT SUITE FAILED:', err.message);
    process.exit(1);
  }
}

main();
