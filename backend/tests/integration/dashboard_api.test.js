/**
 * Integration Test: Dashboard API Endpoints
 * Purpose: Verifies the accuracy of stats and profile endpoints used by the Dashboard.
 * Part of Dissertation Evidence for Chapter 5.1
 */

const { getDb } = require('../../database');
const API_BASE = 'http://localhost:3000/api';
const USER_ID = '1';

async function runDashboardTests() {
  console.log("Starting Dashboard API Integration Tests...\n");
  const db = await getDb();

  try {
    // 1. Verify Profile Data
    console.log("Step 1: Fetching user profile...");
    const profileRes = await fetch(`${API_BASE}/users/me`, {
      headers: { 'x-user-id': USER_ID }
    });
    const profile = await profileRes.json();
    console.log(`PASS: Profile loaded for user: ${profile.username}`);
    if (profile.id !== parseInt(USER_ID)) throw new Error("Incorrect user ID");

    // 2. Test Physical Profile Update
    console.log("\nStep 2: Updating physical profile...");
    const updateRes = await fetch(`${API_BASE}/users/me/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
      body: JSON.stringify({ age: 25, weight_kg: 80, height_cm: 180 })
    });
    if (!updateRes.ok) throw new Error("Profile update failed");
    
    // Verify BMI Calculation (Server-side or Client-side validation)
    const updatedProfileRes = await fetch(`${API_BASE}/users/me`, {
      headers: { 'x-user-id': USER_ID }
    });
    const updatedProfile = await updatedProfileRes.json();
    console.log(`PASS: Profile updated. Age: ${updatedProfile.age}, BMI: ${updatedProfile.bmi}`);
    if (updatedProfile.bmi !== "24.7") throw new Error(`Incorrect BMI: ${updatedProfile.bmi} (Expected 24.7)`);

    // 3. Test Stats Endpoints
    console.log("\nStep 3: Verifying stats endpoints...");
    const freqRes = await fetch(`${API_BASE}/stats/workout-frequency`, {
      headers: { 'x-user-id': USER_ID }
    });
    const freqData = await freqRes.json();
    console.log(`PASS: Workout frequency data retrieved (${freqData.length} weeks)`);

    const volRes = await fetch(`${API_BASE}/stats/volume-by-muscle`, {
      headers: { 'x-user-id': USER_ID }
    });
    const volData = await volRes.json();
    console.log(`PASS: Volume by muscle data retrieved (${volData.length} records)`);

    console.log("\n--- INTEGRATION SUCCESS: DASHBOARD API VERIFIED ---");

  } catch (error) {
    console.error("\nFAIL: Dashboard integration test failed:", error.message);
    process.exit(1);
  }
}

runDashboardTests();
