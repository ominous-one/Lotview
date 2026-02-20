import { calculateColorMatchScore } from '../market-pricing';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await testFn();
    return { name, passed: true, duration: Date.now() - start };
  } catch (error) {
    return { 
      name, 
      passed: false, 
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start 
    };
  }
}

function assertEquals(actual: any, expected: any, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

async function runColorScoringTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(await runTest('Exact color match returns 100', async () => {
    assertEquals(calculateColorMatchScore('Black', 'Black'), 100);
    assertEquals(calculateColorMatchScore('white', 'white'), 100);
    assertEquals(calculateColorMatchScore('RED', 'red'), 100);
  }));

  results.push(await runTest('Partial color match (one contains the other) returns 85', async () => {
    assertEquals(calculateColorMatchScore('Jet Black', 'Black'), 85);
    assertEquals(calculateColorMatchScore('Black Leather', 'Black'), 85);
    assertEquals(calculateColorMatchScore('Pearl White', 'White'), 85);
  }));

  results.push(await runTest('Same color family returns 70', async () => {
    assertEquals(calculateColorMatchScore('Jet Black', 'Ebony'), 70);
    assertEquals(calculateColorMatchScore('Pearl White', 'Ivory'), 70);
    assertEquals(calculateColorMatchScore('Silver', 'Graphite'), 70);
    assertEquals(calculateColorMatchScore('Navy', 'Cobalt'), 70);
    assertEquals(calculateColorMatchScore('Tan', 'Beige'), 70);
  }));

  results.push(await runTest('Different colors return 30', async () => {
    assertEquals(calculateColorMatchScore('Black', 'White'), 30);
    assertEquals(calculateColorMatchScore('Red', 'Blue'), 30);
    assertEquals(calculateColorMatchScore('Green', 'Orange'), 30);
  }));

  results.push(await runTest('Missing colors return neutral 50', async () => {
    assertEquals(calculateColorMatchScore(undefined, 'Black'), 50);
    assertEquals(calculateColorMatchScore('Black', undefined), 50);
    assertEquals(calculateColorMatchScore(undefined, undefined), 50);
  }));

  results.push(await runTest('Case insensitivity works correctly', async () => {
    assertEquals(calculateColorMatchScore('BLACK', 'black'), 100);
    assertEquals(calculateColorMatchScore('JET BLACK', 'jet black'), 100);
    assertEquals(calculateColorMatchScore('PEARL WHITE', 'pearl white'), 100);
  }));

  results.push(await runTest('Special characters are stripped', async () => {
    assertEquals(calculateColorMatchScore('Black-Leather', 'BlackLeather'), 100);
    assertEquals(calculateColorMatchScore('Jet/Black', 'JetBlack'), 100);
    assertEquals(calculateColorMatchScore('Pearl (White)', 'PearlWhite'), 100);
  }));

  results.push(await runTest('Whitespace is handled correctly', async () => {
    assertEquals(calculateColorMatchScore('  Black  ', 'Black'), 100);
    assertEquals(calculateColorMatchScore('Black', '  Black  '), 100);
  }));

  results.push(await runTest('Gray/grey variant matches correctly', async () => {
    assertEquals(calculateColorMatchScore('Gray', 'Grey'), 70);
    assertEquals(calculateColorMatchScore('Grey Leather', 'Gray Interior'), 70);
  }));

  results.push(await runTest('Brown family colors match correctly', async () => {
    assertEquals(calculateColorMatchScore('Cognac', 'Saddle'), 70);
    assertEquals(calculateColorMatchScore('Tan', 'Caramel'), 70);
    assertEquals(calculateColorMatchScore('Espresso', 'Mocha'), 70);
  }));

  results.push(await runTest('Weighted color score calculation (60% interior, 40% exterior)', async () => {
    const interiorScore = calculateColorMatchScore('Black', 'Black'); // 100
    const exteriorScore = calculateColorMatchScore('Red', 'Blue'); // 30
    const weightedScore = Math.round(interiorScore * 0.6 + exteriorScore * 0.4);
    assertEquals(weightedScore, 72); // 100*0.6 + 30*0.4 = 60 + 12 = 72
  }));

  return results;
}

async function main() {
  console.log('🎨 Running Interior/Exterior Color Scoring Tests (using real production module)\n');

  const results = await runColorScoringTests();

  console.log('\n📊 Test Results:\n');
  console.log('─'.repeat(80));

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    if (!result.passed && result.error) {
      console.log(`   └─ Error: ${result.error}`);
    }
    result.passed ? passed++ : failed++;
  }

  console.log('─'.repeat(80));
  console.log(`\n📈 Summary: ${passed} passed, ${failed} failed out of ${results.length} tests`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
