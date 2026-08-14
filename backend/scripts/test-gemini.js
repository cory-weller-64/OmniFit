const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error('No GEMINI_API_KEY set in backend/.env');
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: process.env.PRIMARY_MODEL || 'gemini-1.5-flash-latest' });
    const res = await model.generateContent('Provide a 1-sentence fitness tip for hypertrophy.');
    console.log('Gemini API Response:');
    console.log(res.response.text());
  } catch (err) {
    console.error('Gemini API Error:', err.message);
  }
}

testGemini();
