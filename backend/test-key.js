require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  try {
    console.log('KEY:', process.env.GEMINI_API_KEY);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const result = await model.generateContent('Hi');
    console.log('Response:', result.response.text());
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
