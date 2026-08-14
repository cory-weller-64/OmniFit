const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testQuotas() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return console.error('No Key');

  const modelsToTest = [
    { name: "gemini-1.5-flash", version: "v1beta" },
    { name: "gemini-1.5-flash", version: "v1" },
    { name: "gemini-1.5-flash-8b", version: "v1beta" },
    { name: "gemini-1.5-flash-8b", version: "v1" },
    { name: "gemini-2.0-flash", version: "v1" },
    { name: "gemini-2.0-flash-lite", version: "v1" },
    { name: "gemini-flash-latest", version: "v1beta" }
  ];

  for (const m of modelsToTest) {
    console.log(`\nTesting ${m.name} on ${m.version}...`);
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: m.name }, { apiVersion: m.version });
      const result = await model.generateContent("hi");
      const response = await result.response;
      console.log(`✅ SUCCESS: ${response.text().substring(0, 20)}...`);
    } catch (e) {
      console.log(`❌ FAILED: ${e.message.split('\n')[0]}`);
    }
  }
}

testQuotas();
