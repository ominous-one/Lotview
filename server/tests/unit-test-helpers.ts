interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export async function runTest(name: string, testFn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await testFn();
    return { name, passed: true, duration: Date.now() - start };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function printTestResults(results: TestResult[]): { passed: number; failed: number } {
  console.log("\n📊 Test Results:\n");
  console.log("─".repeat(80));

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.passed ? "✅" : "❌";
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    if (!result.passed && result.error) {
      console.log(`   └─ Error: ${result.error}`);
    }
    result.passed ? passed++ : failed++;
  }

  console.log("─".repeat(80));
  console.log(`\n📈 Summary: ${passed} passed, ${failed} failed out of ${results.length} tests`);

  return { passed, failed };
}
