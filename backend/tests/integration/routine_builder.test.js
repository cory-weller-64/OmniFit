/**
 * Integration Test: Routine Builder Lifecycle
 * Purpose: Verifies creation, updating, and deletion of routine templates.
 * Part of Dissertation Evidence for Chapter 5.2
 */

const { getDb } = require('../../database');
const API_BASE = 'http://localhost:3000/api';
const USER_ID = '1';

async function runRoutineBuilderTests() {
  console.log("Starting Routine Builder Integration Tests...\n");
  const db = await getDb();

  try {
    // 1. Create Routine
    console.log("Step 1: Creating a new routine...");
    const createRes = await fetch(`${API_BASE}/routines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
      body: JSON.stringify({
        name: "Builder Integration Test",
        notes: "Testing the builder logic",
        exercises: [
          { exercise_id: 1, rest_timer_s: 90, sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }] }
        ]
      })
    });
    const created = await createRes.json();
    console.log(`PASS: Routine created with ID: ${created.id}`);
    const routineId = created.id;

    // 2. Fetch and Verify
    console.log("\nStep 2: Fetching the created routine...");
    const fetchRes = await fetch(`${API_BASE}/routines/${routineId}`, {
      headers: { 'x-user-id': USER_ID }
    });
    const routine = await fetchRes.json();
    console.log(`PASS: Routine fetched. Name: ${routine.name}, Exercises: ${routine.exercises.length}`);
    if (routine.exercises.length !== 1) throw new Error("Exercise count mismatch");

    // 3. Update Routine
    console.log("\nStep 3: Updating the routine (Adding exercise)...");
    const updateRes = await fetch(`${API_BASE}/routines/${routineId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
      body: JSON.stringify({
        name: "Updated Test Routine",
        exercises: [
          { exercise_id: 1, sets: [{ weight: 110, reps: 5 }] },
          { exercise_id: 2, sets: [{ weight: 60, reps: 10 }] }
        ]
      })
    });
    if (!updateRes.ok) throw new Error("Update failed");
    
    const updatedRes = await fetch(`${API_BASE}/routines/${routineId}`, {
      headers: { 'x-user-id': USER_ID }
    });
    const updatedRoutine = await updatedRes.json();
    console.log(`PASS: Routine updated. Exercises: ${updatedRoutine.exercises.length}`);
    if (updatedRoutine.exercises.length !== 2) throw new Error("Update exercise count mismatch");

    // 4. Delete Routine
    console.log("\nStep 4: Deleting the routine...");
    const deleteRes = await fetch(`${API_BASE}/routines/${routineId}`, {
      method: 'DELETE',
      headers: { 'x-user-id': USER_ID }
    });
    if (!deleteRes.ok) throw new Error("Delete failed");
    console.log("PASS: Routine deleted.");

    // Verify deletion
    const verifyDel = await fetch(`${API_BASE}/routines/${routineId}`, {
      headers: { 'x-user-id': USER_ID }
    });
    if (verifyDel.status !== 404) throw new Error("Routine still exists after deletion");
    console.log("PASS: Deletion verified (404 status).");

    console.log("\n--- INTEGRATION SUCCESS: ROUTINE BUILDER VERIFIED ---");

  } catch (error) {
    console.error("\nFAIL: Routine Builder integration test failed:", error.message);
    process.exit(1);
  }
}

runRoutineBuilderTests();
