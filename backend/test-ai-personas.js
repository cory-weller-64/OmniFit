async function testPersona(name, userProfile, existingRoutines, message) {
  console.log(`\n--- Testing Persona: ${name} ---`);
  console.log(`Profile: ${JSON.stringify(userProfile)}`);
  console.log(`Query: "${message}"`);

  try {
    const response = await fetch('http://localhost:3000/api/ai/coach', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': '1'
      },
      body: JSON.stringify({
        message: message,
        history: [],
        context: {
          userProfile: userProfile,
          existingRoutines: existingRoutines
        }
      })
    });

    if (!response.ok) {
      console.error(`Error: ${response.status}`);
      return;
    }

    const data = await response.json();
    console.log(`AI Response:\n${data.text}`);
    if (data.suggestions) {
      console.log(`AI Suggestions: ${JSON.stringify(data.suggestions, null, 2)}`);
    }
  } catch (error) {
    console.error(`Failed to test persona ${name}:`, error.message);
  }
}

async function runTests() {
  await testPersona(
    "Senior Beginner",
    { age: 65, weight_kg: 110, height_cm: 175, bmi: "35.9" },
    [],
    "I want to start getting active again. What kind of routine should I do?"
  );
/*
  await testPersona(
    "Young Athlete",
    { age: 22, weight_kg: 80, height_cm: 185, bmi: "23.4" },
    [],
    "I want to pack on muscle as fast as possible. I can train 5 days a week."
  );

  await testPersona(
    "The Specialist",
    { age: 30, weight_kg: 85, height_cm: 180, bmi: "26.2" },
    [
      { 
        name: "Chest Day", 
        exercises: [{ name: "Bench Press", primary_muscle_group: "Chest" }, { name: "Incline Fly", primary_muscle_group: "Chest" }] 
      }
    ],
    "Look at my existing routines and suggest a new one that complements them."
  );
*/
}

runTests();
