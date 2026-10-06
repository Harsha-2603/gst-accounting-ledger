const { db } = require('../dist/database');
const invoiceService = require('../dist/services/invoiceService');
const { askCopilot } = require('../dist/services/aiCopilotService');

async function test() {
  const testInvoice = invoiceService.getInvoices()[0];
  console.log('testInvoice:', testInvoice);
  const query1 = `Why is invoice ${testInvoice ? testInvoice.invoiceNumber : 'INV-0001'} amount ₹${testInvoice ? testInvoice.totalAmount : 11800}?`;
  console.log('query1:', query1);
  const res = await askCopilot(query1);
  console.log('res:', res);
}

test().catch(console.error);
