const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return console.error('No GEMINI_API_KEY found in .env');

  try {
    const genAI = new GoogleGenerativeAI(key);
    const models = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro",
      "gemini-flash-latest",
      "gemini-pro-latest"
    ];

    for (const m of models) {
      try {
        const model = genAI.getGenerativeModel({ model: m });
        console.log(`Model ${m} initialized successfully.`);
      } catch (e) {
        console.log(`Model ${m} failed to initialize: ${e.message}`);
      }
    }
  } catch (e) {
    console.error('Error querying models:', e);
  }
}

listModels();
