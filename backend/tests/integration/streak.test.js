/**
 * Integration Test: Streak Logic & Crash Recovery
 * Purpose: Verifies streak incrementing, freeze consumption, and time-based resets.
 * Part of Dissertation Task 2.1 - Empirical Evidence
 */

const { getDb } = require('../../database');
const API_BASE = 'http://localhost:3000/api';
const USER_ID = '1';

async function runStreakTest() {
  console.log("Starting Streak Logic Integration Test...\n");
  const db = await getDb();

  try {
    // 0. Reset User State
    console.log("Step 0: Resetting User 1 to baseline...");
    await db.run('UPDATE users SET current_xp = 0, streak_count = 0, last_workout_at = NULL, streak_freezes = 0 WHERE id = ?', [USER_ID]);

    // 1. Initial Workout (First Streak)
    console.log("\nStep 1: Completing first workout...");
    const w1 = await startAndFinishWorkout("Session 1");
    console.log(`PASS: Streak is now ${w1.streak.count} (Expected: 1)`);
    if (w1.streak.count !== 1) throw new Error("Expected streak 1");

    // 2. Same Day Workout (No increment)
    console.log("\nStep 2: Completing second workout on same day...");
    const w2 = await startAndFinishWorkout("Session 2");
    console.log(`PASS: Streak is now ${w2.streak.count} (Expected: 1)`);
    if (w2.streak.count !== 1) throw new Error("Expected streak 1");

    // 3. Next Day Workout (Increment)
    console.log("\nStep 3: Simulating 24 hours passing...");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await db.run('UPDATE users SET last_workout_at = ? WHERE id = ?', [yesterday.toISOString(), USER_ID]);
    
    const w3 = await startAndFinishWorkout("Session 3");
    console.log(`PASS: Streak is now ${w3.streak.count} (Expected: 2)`);
    if (w3.streak.count !== 2) throw new Error("Expected streak 2");

    // 4. Inactivity (Reset)
    console.log("\nStep 4: Simulating 4 days passing (No Freeze)...");
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
    await db.run('UPDATE users SET last_workout_at = ? WHERE id = ?', [fourDaysAgo.toISOString(), USER_ID]);

    const w4 = await startAndFinishWorkout("Session 4");
    console.log(`PASS: Streak is now ${w4.streak.count} (Expected: 1)`);
    if (w4.streak.count !== 1) throw new Error("Expected streak 1");

    // 5. Inactivity with Freeze (Preserve)
    console.log("\nStep 5: Simulating 4 days passing WITH Freeze...");
    await db.run('UPDATE users SET streak_count = 5, streak_freezes = 1, last_workout_at = ? WHERE id = ?', [fourDaysAgo.toISOString(), USER_ID]);

    const w5 = await startAndFinishWorkout("Session 5");
    console.log(`PASS: Streak is now ${w5.streak.count} (Expected: 5)`);
    console.log(`PASS: Freeze consumed: ${w5.streak.freezeConsumed}`);
    if (w5.streak.count !== 5 || !w5.streak.freezeConsumed) throw new Error("Streak preservation failed");

    console.log("\n--- INTEGRATION SUCCESS: STREAK LOGIC VERIFIED ---");
    console.log("Empirical proof: System correctly handles temporal logic and resource-based state preservation.");

  } catch (error) {
    console.error("\nFAIL: Streak integration test failed:", error.message);
    process.exit(1);
  }
}

async function startAndFinishWorkout(name) {
  const headers = { 'Content-Type': 'application/json', 'x-user-id': USER_ID };
  
  // Start
  const startRes = await fetch(`${API_BASE}/workouts/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name })
  });
  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(`Start workout failed (${startRes.status}): ${text}`);
  }
  const workout = await startRes.json();

  // Add Exercise
  const exRes = await fetch(`${API_BASE}/workouts/${workout.id}/exercises`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ exercise_id: 1, position: 0 })
  });
  if (!exRes.ok) {
    const text = await exRes.text();
    throw new Error(`Add exercise failed (${exRes.status}): ${text}`);
  }
  const performedEx = await exRes.json();

  // Log Set
  const setRes = await fetch(`${API_BASE}/workouts/exercises/${performedEx.id}/sets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ set_number: 1, weight: 60, reps: 10, is_completed: 1 })
  });
  if (!setRes.ok) {
    const text = await setRes.text();
    throw new Error(`Log set failed (${setRes.status}): ${text}`);
  }

  // Finish
  const finishRes = await fetch(`${API_BASE}/workouts/${workout.id}/finish`, {
    method: 'POST',
    headers
  });
  if (!finishRes.ok) {
    const text = await finishRes.text();
    throw new Error(`Finish workout failed (${finishRes.status}): ${text}`);
  }
  return await finishRes.json();
}

runStreakTest();
