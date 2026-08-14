/**
 * Unit Test: Gamification & XP Logic
 * Purpose: Verifies the core formulas used for XP rewards and Level progression.
 * Part of Dissertation Task 1.1
 */

function calculateXP(volume, sets, bonuses = 0) {
  return Math.floor((volume / 3) + (sets * 50) + bonuses);
}

function calculateLevel(totalXp) {
  return Math.floor(totalXp / 50000) + 1;
}

function calculateProgressPct(totalXp) {
  const xpIntoLevel = totalXp % 50000;
  return (xpIntoLevel / 50000) * 100;
}

function runTests() {
  console.log("Starting Gamification Unit Tests...\n");
  let passed = 0;
  let total = 0;

  function assert(name, actual, expected) {
    total++;
    if (actual === expected) {
      console.log(`PASS: ${name}`);
      passed++;
    } else {
      console.log(`FAIL: ${name} | Expected: ${expected}, Actual: ${actual}`);
    }
  }

  // Test 1: Standard XP Calculation
  // 5000kg volume / 3 = 1666 XP
  // 10 sets * 50 = 500 XP
  // Total = 2166 XP
  assert("Standard XP Calculation (5000kg, 10 sets)", calculateXP(5000, 10), 2166);

  // Test 2: XP with Bonuses
  // 2000kg / 3 = 666 XP
  // 5 sets * 50 = 250 XP
  // Total = 666 + 250 + 200 = 1116
  assert("XP Calculation with PR Bonus", calculateXP(2000, 5, 200), 1116);

  // Test 3: Level 1 Threshold
  assert("Level Calculation (0 XP)", calculateLevel(0), 1);
  assert("Level Calculation (49,999 XP)", calculateLevel(49999), 1);

  // Test 4: Level 2 Threshold
  assert("Level Calculation (50,000 XP)", calculateLevel(50000), 2);
  assert("Level Calculation (120,000 XP)", calculateLevel(120000), 3);

  // Test 5: Progress Percentage
  assert("Progress % (25,000 / 50,000)", calculateProgressPct(25000), 50);
  assert("Progress % (75,000 / 50,000)", calculateProgressPct(75000), 50);

  console.log(`\n--- Results: ${passed}/${total} Passed ---`);
  if (passed === total) {
    console.log("ALL GAMIFICATION LOGIC VERIFIED");
  } else {
    process.exit(1);
  }
}

runTests();
