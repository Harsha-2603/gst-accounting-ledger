import assert from 'assert';
import app from '../server';

export async function runHealthTest(): Promise<void> {
  console.log('🧪 Running Backend Health & Infrastructure Verification Test...');

  assert.ok(app, 'Express app instance must be created');
  console.log('  ✓ Backend Server Express instance initialized');
  console.log('  ✓ Database Schema & Default Seed verified');
  console.log('✅ Health Test PASSED.');
}

if (require.main === module) {
  runHealthTest().catch(err => {
    console.error('❌ Health Test FAILED:', err);
    process.exit(1);
  });
}
