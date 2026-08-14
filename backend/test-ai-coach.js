async function testCoach() {
  console.log("Starting AI Coach test...");
  try {
    const response = await fetch('http://localhost:3000/api/ai/coach', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': '1'
      },
      body: JSON.stringify({
        message: "I want to train my chest today. Give me 2 exercises with sets and reps.",
        history: [],
        context: {
          current_xp: 1000,
          current_rank: "Novice"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error status:', response.status);
      console.error('Error body:', errorText);
      return;
    }

    const data = await response.json();
    console.log('AI Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testCoach();
