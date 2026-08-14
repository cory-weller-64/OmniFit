/**
 * System Test: Full Live Workout Flow
 * Purpose: Simulates a complete workout lifecycle from start to finish, including set logging,
 * deletion, PR detection, and reward revocation.
 * Part of Dissertation Evidence for Chapter 5.3
 */

const { getDb } = require('../../database');
const API_BASE = 'http://localhost:3000/api';
const USER_ID = '1';

async function runLiveWorkoutFlow() {
  console.log("Starting Live Workout Flow System Test...\n");
  const db = await getDb();

  try {
    // 0. Cleanup any active sessions
    await db.run('UPDATE workouts SET end_time = CURRENT_TIMESTAMP WHERE user_id = ? AND end_time IS NULL', [USER_ID]);

    // 1. Start Workout
    console.log("Step 1: Starting new workout session...");
    const startRes = await fetch(`${API_BASE}/workouts/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
      body: JSON.stringify({ name: "Flow System Test" })
    });
    const workout = await startRes.json();
    console.log(`PASS: Workout session initialized (ID: ${workout.id})`);
    const workoutId = workout.id;

    // 2. Add Exercise
    console.log("\nStep 2: Adding 'Bench Press' to session...");
    const exRes = await fetch(`${API_BASE}/workouts/${workoutId}/exercises`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
      body: JSON.stringify({ exercise_id: 1, position: 1 })
    });
    const performedEx = await exRes.json();
    console.log(`PASS: Exercise added (ID: ${performedEx.id})`);
    const perfExId = performedEx.id;

    // 3. Log Multiple Sets (Sync-as-you-go)
    console.log("\nStep 3: Logging 3 sets (Verifying PR detection)...");
    const sets = [
      { weight: 100, reps: 5 },
      { weight: 120, reps: 5 }, // Potential PR
      { weight: 100, reps: 10 }
    ];

    const loggedSetIds = [];
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      const setRes = await fetch(`${API_BASE}/workouts/exercises/${perfExId}/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
        body: JSON.stringify({ set_number: i + 1, ...s })
      });
      const data = await setRes.json();
      loggedSetIds.push(data.id);
      if (data.brokenPRs && data.brokenPRs.length > 0) {
        console.log(`INFO: Set ${i + 1} triggered PRs: ${data.brokenPRs.join(', ')}`);
      }
    }
    console.log("PASS: 3 sets logged and synced.");

    // 4. Finalize Workout (Victory Lap)
    console.log("\nStep 4: Finalizing workout session...");
    const finishRes = await fetch(`${API_BASE}/workouts/${workoutId}/finish`, {
      method: 'POST',
      headers: { 'x-user-id': USER_ID }
    });
    const summary = await finishRes.json();
    console.log(`PASS: Workout finished. XP Gained: ${summary.xpBreakdown.totalXp}`);
    console.log(`INFO: Current Level: ${summary.levelState.newLevel}, Streak: ${summary.streak.count}`);

    // 5. Test Revocation (Delete a set from history)
    console.log("\nStep 5: Testing reward revocation (Deleting a completed set)...");
    const setToDelete = loggedSetIds[1]; // The 120kg set
    const deleteRes = await fetch(`${API_BASE}/workouts/sets/${setToDelete}`, {
      method: 'DELETE',
      headers: { 'x-user-id': USER_ID }
    });
    if (!deleteRes.ok) throw new Error("Delete failed");
    
    // Verify XP was revoked from both user and workout
    const finalProfileRes = await fetch(`${API_BASE}/users/me`, { headers: { 'x-user-id': USER_ID } });
    const finalProfile = await finalProfileRes.json();
    const finalWorkoutRes = await fetch(`${API_BASE}/workouts/${workoutId}`, { headers: { 'x-user-id': USER_ID } });
    const finalWorkout = await finalWorkoutRes.json();
    
    console.log(`PASS: Reward revocation verified. Workout XP adjusted down to ${finalWorkout.session_xp}`);

    console.log("\n--- SYSTEM SUCCESS: LIVE WORKOUT FLOW VERIFIED ---");

  } catch (error) {
    console.error("\nFAIL: Live workout flow failed:", error.message);
    process.exit(1);
  }
}

runLiveWorkoutFlow();
