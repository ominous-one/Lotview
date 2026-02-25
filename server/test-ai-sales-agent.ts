/**
 * Test script for the AI Sales Agent.
 *
 * Simulates common customer conversations against the AI agent.
 * Requires a running database with at least one dealership and vehicle.
 *
 * Usage:
 *   npx tsx server/test-ai-sales-agent.ts
 *
 * Environment:
 *   DATABASE_URL must be set, plus OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_* vars.
 */

import { generateSalesResponse, generateFollowUp, type AiSalesRequest } from "./ai-sales-agent";
import { calculatePayments, formatPaymentForChat } from "./ai-payment-calculator";
import { storage } from "./storage";

const DIVIDER = "═".repeat(70);
const THIN = "─".repeat(70);

async function findTestVehicle(dealershipId: number) {
  const { vehicles } = await storage.getVehicles(dealershipId, 1, 0);
  return vehicles[0];
}

async function runTest(label: string, request: AiSalesRequest) {
  console.log(`\n${DIVIDER}`);
  console.log(`TEST: ${label}`);
  console.log(THIN);
  console.log(`Customer: "${request.customerMessage}"`);
  console.log(THIN);

  try {
    const start = Date.now();
    const result = await generateSalesResponse(request);
    const elapsed = Date.now() - start;

    console.log(`AI Reply (${elapsed}ms):`);
    console.log(`  "${result.reply}"`);
    if (result.vehicleName) console.log(`  Vehicle: ${result.vehicleName}`);
    if (result.suggestedAlternatives?.length) {
      console.log(`  Alternatives suggested: ${result.suggestedAlternatives.map(a => `${a.name} ($${a.price.toLocaleString()})`).join(', ')}`);
    }
    console.log(`  Length: ${result.reply.length} chars`);

    // Quality checks
    const warnings: string[] = [];
    if (result.reply.length > 500) warnings.push("WARN: Reply exceeds 500 chars (too long for Messenger)");
    if (/\bAI\b|chatbot|automated|language model/i.test(result.reply)) warnings.push("WARN: Reply mentions AI/bot");
    if (!/[?!.]$/.test(result.reply.trim())) warnings.push("WARN: Reply doesn't end with punctuation");

    if (warnings.length > 0) {
      console.log(`  ${warnings.join('\n  ')}`);
    } else {
      console.log("  PASS: All quality checks passed");
    }

    return result;
  } catch (error: any) {
    console.log(`  ERROR: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log("AI Sales Agent Test Suite");
  console.log(DIVIDER);

  // Find the first dealership
  const allDealerships = await storage.getAllDealerships();
  if (allDealerships.length === 0) {
    console.error("No dealerships found in database. Cannot run tests.");
    process.exit(1);
  }

  const dealership = allDealerships[0];
  console.log(`Dealership: ${dealership.name} (ID: ${dealership.id})`);

  // Find a test vehicle
  const vehicle = await findTestVehicle(dealership.id);
  if (!vehicle) {
    console.error("No vehicles found in inventory. Cannot run tests.");
    process.exit(1);
  }

  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`;
  console.log(`Test Vehicle: ${vehicleName} — $${vehicle.price.toLocaleString()}`);

  // ── Test 1: "Is this still available?" ──
  await runTest('Is this still available?', {
    dealershipId: dealership.id,
    vehicleId: vehicle.id,
    customerMessage: 'Is this still available?',
    customerName: 'Mike',
  });

  // ── Test 2: "What's the lowest you'll go?" ──
  const test2 = await runTest('Price negotiation', {
    dealershipId: dealership.id,
    vehicleId: vehicle.id,
    customerMessage: "What's the lowest you'll go on this?",
    customerName: 'Sarah',
    messageHistory: [
      { role: 'user', content: 'Is this still available?' },
      { role: 'assistant', content: `Hi Sarah! Yes, the ${vehicleName} is available. Would you like to come see it?` },
    ],
  });

  // ── Test 3: "Does it have any accidents?" ──
  await runTest('Accident history inquiry', {
    dealershipId: dealership.id,
    vehicleId: vehicle.id,
    customerMessage: 'Does it have any accidents on the Carfax?',
    customerName: 'James',
  });

  // ── Test 4: "What are the monthly payments?" ──
  await runTest('Payment inquiry', {
    dealershipId: dealership.id,
    vehicleId: vehicle.id,
    customerMessage: 'What would the monthly payments be on this?',
    customerName: 'Priya',
  });

  // ── Test 5: "Can I come see it this weekend?" ──
  await runTest('Schedule viewing', {
    dealershipId: dealership.id,
    vehicleId: vehicle.id,
    customerMessage: 'Can I come see it this weekend? Maybe Saturday afternoon?',
    customerName: 'David',
    messageHistory: [
      { role: 'user', content: 'Is this still available?' },
      { role: 'assistant', content: `Hi David! Yes it is. It's a great vehicle — would you like to come take a look?` },
      { role: 'user', content: 'Yeah definitely. Can I come see it this weekend? Maybe Saturday afternoon?' },
    ],
  });

  // ── Test 6: "I'm looking for something under 30k" ──
  await runTest('Budget-based recommendation', {
    dealershipId: dealership.id,
    vehicleId: vehicle.id,
    customerMessage: "I'm looking for something under 30k, preferably an SUV",
    customerName: 'Emma',
  });

  // ── Test 7: "Is this a good deal?" ──
  await runTest('Value justification', {
    dealershipId: dealership.id,
    vehicleId: vehicle.id,
    customerMessage: "Is this a good deal? It seems a bit pricey compared to others I've seen.",
    customerName: 'Alex',
  });

  // ── Test 8: "I have bad credit, can I still get financed?" ──
  await runTest('Credit concerns', {
    dealershipId: dealership.id,
    vehicleId: vehicle.id,
    customerMessage: "I have bad credit, like around 550. Can I still get financed?",
    customerName: 'Chris',
  });

  // ── Test 9: Follow-up message ──
  console.log(`\n${DIVIDER}`);
  console.log("TEST: Follow-up message (cold conversation)");
  console.log(THIN);
  try {
    const start = Date.now();
    const followUp = await generateFollowUp({
      dealershipId: dealership.id,
      conversationId: 0,
      customerName: 'Mike',
      vehicleName,
      lastMessagePreview: 'Can I come see it this weekend?',
      hoursSinceLastMessage: 26,
    });
    const elapsed = Date.now() - start;
    console.log(`  Follow-up (${elapsed}ms): "${followUp}"`);
    console.log(`  Length: ${followUp.length} chars`);
    console.log("  PASS");
  } catch (error: any) {
    console.log(`  ERROR: ${error.message}`);
  }

  // ── Test 10: Payment calculator unit test ──
  console.log(`\n${DIVIDER}`);
  console.log("TEST: Payment calculator");
  console.log(THIN);
  try {
    const payments = await calculatePayments(dealership.id, vehicle.price, vehicle.year);
    if (payments) {
      console.log(`  Vehicle price: $${payments.vehiclePrice.toLocaleString()}`);
      console.log(`  Credit tier: ${payments.creditTier.tierName} (${payments.creditTier.interestRate / 100}%)`);
      console.log(`  Available terms: ${payments.availableTerms.join(', ')} months`);
      for (const p of payments.payments) {
        console.log(`    ${p.termMonths}mo: $${p.monthlyPayment.toFixed(2)}/mo | $${p.biweeklyPayment.toFixed(2)} bi-weekly`);
      }
      console.log(`  Formatted: ${formatPaymentForChat(vehicle.price, payments.payments[0])}`);
      console.log("  PASS");
    } else {
      console.log("  SKIP: No financing rules configured for this dealership");
    }
  } catch (error: any) {
    console.log(`  ERROR: ${error.message}`);
  }

  console.log(`\n${DIVIDER}`);
  console.log("All tests completed.");
  console.log(DIVIDER);

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
