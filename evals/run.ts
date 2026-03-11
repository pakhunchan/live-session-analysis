import { readFileSync, appendFileSync, writeFileSync } from 'fs';
import { parse } from 'yaml';
import { generateRecommendationsTraced } from '../server/langsmith/tracing.js';

interface Assertions {
  min_recommendations?: number;
  max_recommendations?: number;
  is_valid_json_array?: boolean;
  must_mention_any?: string[];
  must_not_contain?: string[];
}

interface EvalCase {
  id: string;
  category: string;
  description: string;
  input: Record<string, unknown>;
  assertions: Assertions;
}

interface EvalResult {
  id: string;
  category: string;
  passed: boolean;
  failures: string[];
  recommendations: string[];
  latencyMs: number;
}

function checkAssertions(recs: string[], assertions: Assertions): string[] {
  const failures: string[] = [];
  const joined = recs.join(' ').toLowerCase();

  if (assertions.is_valid_json_array) {
    if (!Array.isArray(recs) || !recs.every((r) => typeof r === 'string')) {
      failures.push('Not a valid JSON array of strings');
    }
  }

  if (assertions.min_recommendations != null && recs.length < assertions.min_recommendations) {
    failures.push(`Expected >= ${assertions.min_recommendations} recs, got ${recs.length}`);
  }

  if (assertions.max_recommendations != null && recs.length > assertions.max_recommendations) {
    failures.push(`Expected <= ${assertions.max_recommendations} recs, got ${recs.length}`);
  }

  if (assertions.must_mention_any && assertions.must_mention_any.length > 0) {
    const found = assertions.must_mention_any.some((kw) => joined.includes(kw.toLowerCase()));
    if (!found) {
      failures.push(
        `None of [${assertions.must_mention_any.join(', ')}] found in recommendations`,
      );
    }
  }

  if (assertions.must_not_contain) {
    for (const kw of assertions.must_not_contain) {
      if (joined.includes(kw.toLowerCase())) {
        failures.push(`Forbidden keyword "${kw}" found in recommendations`);
      }
    }
  }

  return failures;
}

async function main() {
  const yamlContent = readFileSync(
    new URL('./cases/recommendations.yaml', import.meta.url),
    'utf-8',
  );
  const cases: EvalCase[] = parse(yamlContent);

  console.log(`\nRunning ${cases.length} eval cases...\n`);

  const resultsPath = new URL('./results.jsonl', import.meta.url).pathname;
  writeFileSync(resultsPath, '');

  const results: EvalResult[] = [];
  const categoryStats: Record<string, { pass: number; fail: number }> = {};

  for (const testCase of cases) {
    const start = Date.now();
    let recs: string[] = [];
    let failures: string[] = [];

    try {
      recs = await generateRecommendationsTraced(testCase.input as never);
      failures = checkAssertions(recs, testCase.assertions);
    } catch (err) {
      failures = [`Error: ${(err as Error).message}`];
    }

    const latencyMs = Date.now() - start;
    const passed = failures.length === 0;

    const result: EvalResult = {
      id: testCase.id,
      category: testCase.category,
      passed,
      failures,
      recommendations: recs,
      latencyMs,
    };
    results.push(result);

    // Track category stats
    if (!categoryStats[testCase.category]) {
      categoryStats[testCase.category] = { pass: 0, fail: 0 };
    }
    categoryStats[testCase.category][passed ? 'pass' : 'fail']++;

    // Print result
    const icon = passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  [${icon}] ${testCase.id} (${latencyMs}ms)`);
    if (!passed) {
      for (const f of failures) {
        console.log(`         - ${f}`);
      }
    }

    // Append to JSONL
    appendFileSync(resultsPath, JSON.stringify(result) + '\n');
  }

  // Summary
  console.log('\n--- Summary by Category ---');
  for (const [cat, stats] of Object.entries(categoryStats)) {
    const total = stats.pass + stats.fail;
    console.log(`  ${cat}: ${stats.pass}/${total} passed`);
  }

  const totalPassed = results.filter((r) => r.passed).length;
  console.log(`\nTotal: ${totalPassed}/${results.length} passed\n`);

  if (totalPassed < results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Eval runner failed:', err);
  process.exit(1);
});
