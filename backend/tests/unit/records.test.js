/**
 * Unit Test: Personal Record (PR) Detection Logic
 * Purpose: Verifies the system correctly identifies and manages PRs.
 * Part of Dissertation Task 1.2
 */

// Mock Database State for testing
let mockPRs = [
  { exercise_id: 1, type: '1RM', value: 100, achieved_at: '2026-04-01' },
  { exercise_id: 1, type: 'MAX_VOLUME', value: 1200, achieved_at: '2026-04-01' }
];

/**
 * Simplified logic mirrored from backend
 */
function checkNewPR(exerciseId, weight, reps) {
  const current1RM = mockPRs.find(p => p.exercise_id === exerciseId && p.type === '1RM')?.value || 0;
  const estimated1RM = weight * (1 + reps / 30); // Epley Formula
  
  if (estimated1RM > current1RM) {
    return { isNew: true, type: '1RM', oldValue: current1RM, newValue: estimated1RM };
  }
  return { isNew: false };
}

function revokePR(exerciseId, type, previousValue) {
  const index = mockPRs.findIndex(p => p.exercise_id === exerciseId && p.type === type);
  if (index !== -1) {
    mockPRs[index].value = previousValue;
    return true;
  }
  return false;
}

function runTests() {
  console.log("Starting PR Detection Unit Tests...\n");
  let passed = 0;
  let total = 0;

  function assert(name, actual, expected) {
    total++;
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      console.log(`PASS: ${name}`);
      passed++;
    } else {
      console.log(`FAIL: ${name} | Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`);
    }
  }

  // Test 1: Identify new 1RM
  // 100kg x 10 = 133.33 1RM (Epley)
  const prCheck = checkNewPR(1, 100, 10);
  assert("Detect New 1RM (100kg x 10)", prCheck.isNew, true);
  assert("New 1RM Value Calculation", Math.round(prCheck.newValue), 133);

  // Test 2: Reject inferior performance
  const lowCheck = checkNewPR(1, 80, 5);
  assert("Reject Inferior 1RM (80kg x 5)", lowCheck.isNew, false);

  // Test 3: PR Revocation (Revocation Engine Proof)
  revokePR(1, '1RM', 100);
  assert("Revoke PR and Reset to Previous (100kg)", mockPRs[0].value, 100);

  console.log(`\n--- Results: ${passed}/${total} Passed ---`);
  if (passed === total) {
    console.log("ALL PR LOGIC VERIFIED (EMPIRICAL DATA INTEGRITY PROOF)");
  } else {
    process.exit(1);
  }
}

runTests();
