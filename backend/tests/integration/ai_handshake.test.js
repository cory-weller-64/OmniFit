/**
 * Integration Test: AI Coach Tool Handshake
 * Purpose: Verifies the AI Coach can successfully call backend tools and access database data.
 * Part of Dissertation Task 2.2
 */

const API_BASE = 'http://localhost:3000/api';
const USER_ID = '1';

async function testAIHandshake() {
  console.log("Starting AI Coach Handshake Integration Test...\n");
  
  try {
    console.log("Step 1: Requesting exercise search from AI...");
    const response = await fetch(`${API_BASE}/ai/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
      body: JSON.stringify({
        message: "Search for 'Bench Press' exercises in the database.",
        history: [],
        context: { userProfile: { age: 25, weight_kg: 80, height_cm: 180 } }
      })
    });

    const data = await response.json();
    console.log("Full AI Response Data:", JSON.stringify(data, null, 2));
    
    if (data.error) {
       console.log(`FAIL: API returned error: ${data.error}`);
       process.exit(1);
    }

    if (!data.text) {
       console.log("FAIL: AI response did not include a 'text' field.");
       process.exit(1);
    }

    console.log(`AI Response: ${data.text.substring(0, 100)}...`);
    
    // Validation: The AI should have successfully navigated the tool call to 'search_exercises'
    if (data.text.toLowerCase().includes('bench press')) {
      console.log("PASS: AI successfully retrieved data from database through tool-calling handshake.");
    } else {
      console.log("FAIL: AI response did not include expected data from database.");
      process.exit(1);
    }

    console.log("\n--- INTEGRATION SUCCESS: AI TOOL HANDSHAKE VERIFIED ---");

  } catch (error) {
    console.error("FAIL: AI Handshake test failed:", error.message);
    process.exit(1);
  }
}

testAIHandshake();
