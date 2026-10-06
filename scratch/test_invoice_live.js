// Test script for complete Sales Invoice flow against running server
const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('🚀 Running Sales Invoice End-to-End Verification...');
  const baseUrl = '127.0.0.1';
  const port = 3000;

  // 1. Fetch Customers
  const custRes = await request({
    hostname: baseUrl, port, path: '/api/customers', method: 'GET'
  });
  console.log(`Fetched ${custRes.data.length} customers.`);
  const mhCustomer = custRes.data.find(c => (c.state_code || c.stateCode) === '27') || custRes.data[0];
  const gjCustomer = custRes.data.find(c => (c.state_code || c.stateCode) === '24') || custRes.data[1];
  console.log(`Intra-state customer: ${mhCustomer.name} (${mhCustomer.state_code || mhCustomer.stateCode})`);
  console.log(`Inter-state customer: ${gjCustomer.name} (${gjCustomer.state_code || gjCustomer.stateCode})`);

  // 2. Fetch Items
  const itemsRes = await request({
    hostname: baseUrl, port, path: '/api/items', method: 'GET'
  });
  const testItem = itemsRes.data[0];
  console.log(`Test Item: ${testItem.name} (HSN: ${testItem.hsn_code || testItem.hsnCode}, Rate: ${testItem.gst_rate || testItem.gstRate}%)`);

  // 3. Test INTRA-STATE INVOICE Creation
  console.log('\n--- TEST 1: INTRA-STATE INVOICE CREATION ---');
  const intraNum = `INV-INTRA-${Date.now().toString().slice(-6)}`;
  const intraPayload = {
    customerId: mhCustomer.id,
    invoiceNumber: intraNum,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 15*86400000).toISOString().split('T')[0],
    placeOfSupply: '27',
    lines: [
      {
        itemId: testItem.id,
        description: 'Industrial Packaging Paper (Intra-State)',
        hsnCode: testItem.hsn_code || testItem.hsnCode || '4802',
        quantity: 10,
        unitPrice: 10000,
        taxRate: 18
      }
    ],
    deliver: true
  };
  const intraRes = await request({
    hostname: baseUrl, port, path: '/api/invoices', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, intraPayload);

  if (intraRes.status !== 201) {
    throw new Error(`Failed to create intra-state invoice: ${JSON.stringify(intraRes.data)}`);
  }
  const intraInv = intraRes.data;
  console.log(`✓ Intra invoice created: ${intraInv.invoiceNumber}`);
  console.log(`  Subtotal: ₹${intraInv.subtotal}, CGST: ₹${intraInv.cgstAmount}, SGST: ₹${intraInv.sgstAmount}, IGST: ₹${intraInv.igstAmount}, Total: ₹${intraInv.totalAmount}`);
  if (Number(intraInv.cgstAmount) !== 9000 || Number(intraInv.sgstAmount) !== 9000 || Number(intraInv.igstAmount) !== 0) {
    throw new Error(`Intra-state GST dual split mismatch! CGST: ${intraInv.cgstAmount}, SGST: ${intraInv.sgstAmount}, IGST: ${intraInv.igstAmount}`);
  }
  console.log('✓ Intra-state GST dual split verified: 50% CGST (₹9,000) + 50% SGST (₹9,000) and 0% IGST.');

  // 4. Test INTER-STATE INVOICE Creation
  console.log('\n--- TEST 2: INTER-STATE INVOICE CREATION ---');
  const interNum = `INV-INTER-${Date.now().toString().slice(-6)}`;
  const interPayload = {
    customerId: gjCustomer.id,
    invoiceNumber: interNum,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 15*86400000).toISOString().split('T')[0],
    placeOfSupply: '24',
    lines: [
      {
        itemId: testItem.id,
        description: 'Industrial Packaging Paper (Inter-State)',
        hsnCode: testItem.hsn_code || testItem.hsnCode || '4802',
        quantity: 10,
        unitPrice: 10000,
        taxRate: 18
      }
    ],
    deliver: true
  };
  const interRes = await request({
    hostname: baseUrl, port, path: '/api/invoices', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, interPayload);

  if (interRes.status !== 201) {
    throw new Error(`Failed to create inter-state invoice: ${JSON.stringify(interRes.data)}`);
  }
  const interInv = interRes.data;
  console.log(`✓ Inter invoice created: ${interInv.invoiceNumber}`);
  console.log(`  Subtotal: ₹${interInv.subtotal}, CGST: ₹${interInv.cgstAmount}, SGST: ₹${interInv.sgstAmount}, IGST: ₹${interInv.igstAmount}, Total: ₹${interInv.totalAmount}`);
  if (Number(interInv.cgstAmount) !== 0 || Number(interInv.sgstAmount) !== 0 || Number(interInv.igstAmount) !== 18000) {
    throw new Error(`Inter-state GST mismatch! CGST: ${interInv.cgstAmount}, SGST: ${interInv.sgstAmount}, IGST: ${interInv.igstAmount}`);
  }
  console.log('✓ Inter-state GST verified: 100% IGST (₹18,000) and 0% CGST/SGST.');

  // 5. Test DRAFT INVOICE CREATION & DELIVER
  console.log('\n--- TEST 3: DRAFT INVOICE CREATION AND DELIVER FLOW ---');
  const draftNum = `INV-DRAFT-${Date.now().toString().slice(-6)}`;
  const draftPayload = {
    ...intraPayload,
    invoiceNumber: draftNum,
    deliver: false
  };
  const draftRes = await request({
    hostname: baseUrl, port, path: '/api/invoices', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, draftPayload);
  const draftInv = draftRes.data;
  console.log(`✓ Draft invoice created: ${draftInv.invoiceNumber}, Status: ${draftInv.status}`);
  if (draftInv.status !== 'DRAFT') {
    throw new Error(`Expected draft status DRAFT, got ${draftInv.status}`);
  }

  // Deliver the draft invoice
  const deliverRes = await request({
    hostname: baseUrl, port, path: `/api/invoices/${draftInv.id}/deliver`, method: 'POST'
  });
  console.log(`✓ Delivered draft invoice. Status: ${deliverRes.data.status}`);
  if (deliverRes.data.status !== 'DELIVERED') {
    throw new Error(`Expected delivered status DELIVERED, got ${deliverRes.data.status}`);
  }

  // 6. Test INVOICE DETAILS & TRANSACTION GL AUDIT
  console.log('\n--- TEST 4: INVOICE DETAILS & JOURNAL AUDIT TRAIL ---');
  const detailRes = await request({
    hostname: baseUrl, port, path: `/api/invoices/${intraInv.id}`, method: 'GET'
  });
  console.log(`✓ Details fetched for ${detailRes.data.invoiceNumber}. Lines count: ${detailRes.data.lines.length}`);
  
  // Lookup transactions for this invoice
  const txRes = await request({
    hostname: baseUrl, port, path: `/api/transactions?referenceId=${intraInv.id}`, method: 'GET'
  });
  const txList = txRes.data.transactions || txRes.data;
  console.log(`✓ Transactions linked to invoice: ${txList.length} journal entry/entries.`);
  if (txList.length === 0) {
    throw new Error('Expected GL journal transaction linked to invoice referenceId!');
  }

  // 7. Test IMMUTABLE VOID FLOW
  console.log('\n--- TEST 5: IMMUTABLE VOID FLOW ---');
  const voidRes = await request({
    hostname: baseUrl, port, path: `/api/invoices/${intraInv.id}/void`, method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { reason: 'Customer requested cancellation during verification test' });

  console.log(`✓ Void API response status: ${voidRes.status}, Invoice status: ${voidRes.data.status}`);
  if (voidRes.data.status !== 'VOIDED') {
    throw new Error(`Expected invoice status VOIDED, got ${voidRes.data.status}`);
  }
  console.log(`  Reversal Journal Entry: ${voidRes.data.reversalJournalEntryId}`);

  // Test already voided error
  const repeatVoidRes = await request({
    hostname: baseUrl, port, path: `/api/invoices/${intraInv.id}/void`, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { reason: 'Second void attempt' }
  }, { reason: 'Second void attempt' });
  console.log(`✓ Duplicate void attempt rejected with HTTP ${repeatVoidRes.status}: "${repeatVoidRes.data.error || repeatVoidRes.data.message}"`);
  if (repeatVoidRes.status !== 400) {
    throw new Error(`Expected 400 Bad Request for repeated void, got ${repeatVoidRes.status}`);
  }

  // 8. Test VALIDATION & ERROR STATES
  console.log('\n--- TEST 6: BACKEND VALIDATION & ERROR STATES ---');
  // Duplicate Invoice Number (409)
  const dupRes = await request({
    hostname: baseUrl, port, path: '/api/invoices', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { ...interPayload, invoiceNumber: interNum }
  }, { ...interPayload, invoiceNumber: interNum });
  console.log(`✓ Duplicate invoice number rejected with HTTP ${dupRes.status}: "${dupRes.data.error || dupRes.data.message}"`);
  if (dupRes.status !== 409) {
    throw new Error(`Expected 409 Conflict for duplicate invoice number, got ${dupRes.status}`);
  }

  // Invalid quantity <= 0 (400)
  const badQtyPayload = {
    ...interPayload,
    invoiceNumber: `INV-BADQTY-${Date.now().toString().slice(-6)}`,
    lines: [{ ...interPayload.lines[0], quantity: 0 }]
  };
  const badQtyRes = await request({
    hostname: baseUrl, port, path: '/api/invoices', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: badQtyPayload
  }, badQtyPayload);
  console.log(`✓ Invalid quantity <= 0 rejected with HTTP ${badQtyRes.status}: "${badQtyRes.data.error || badQtyRes.data.message}"`);
  if (badQtyRes.status !== 400) {
    throw new Error(`Expected 400 Bad Request for invalid quantity, got ${badQtyRes.status}`);
  }

  // Invalid customer (400 or 404)
  const badCustPayload = {
    ...interPayload,
    customerId: 'non-existent-customer-id',
    invoiceNumber: `INV-BADCUST-${Date.now().toString().slice(-6)}`
  };
  const badCustRes = await request({
    hostname: baseUrl, port, path: '/api/invoices', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: badCustPayload
  }, badCustPayload);
  console.log(`✓ Invalid customer rejected with HTTP ${badCustRes.status}: "${badCustRes.data.error || badCustRes.data.message}"`);
  if (badCustRes.status !== 400 && badCustRes.status !== 404) {
    throw new Error(`Expected 400/404 for invalid customer, got ${badCustRes.status}`);
  }

  console.log('\n======================================================');
  console.log('🎉 ALL SALES INVOICE FLOW VERIFICATION TESTS PASSED!');
  console.log('======================================================');
}

run().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
