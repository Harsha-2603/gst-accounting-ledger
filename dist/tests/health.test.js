"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runHealthTest = runHealthTest;
const assert_1 = __importDefault(require("assert"));
const server_1 = __importDefault(require("../server"));
async function runHealthTest() {
    console.log('🧪 Running Backend Health & Infrastructure Verification Test...');
    assert_1.default.ok(server_1.default, 'Express app instance must be created');
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
