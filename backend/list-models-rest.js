const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return console.error('No Key');

  try {
    const genAI = new GoogleGenerativeAI(key);
    // The listModels method is on the client object in some versions, 
    // but in the JS SDK it might be different.
    // Let's try to use the REST API directly since we have the key.
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await response.json();
    
    console.log('Available Models:');
    if (data.models) {
      data.models.forEach(m => console.log(`- ${m.name} (${m.displayName})`));
    } else {
      console.log('No models found or error:', data);
    }
  } catch (e) {
    console.error(e);
  }
}

listModels();
