const https = require('https');
require('dotenv').config();

const key = process.env.GEMINI_API_KEY;
if (!key) {
    console.error('No GEMINI_API_KEY found in .env');
    process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            console.log('Available Models:');
            if (parsed.models) {
                parsed.models.forEach(m => {
                    console.log(`- ${m.name}`);
                });
            } else {
                console.log('Error or empty response:', parsed);
            }
        } catch (e) {
            console.error('Failed to parse JSON:', e.message);
            console.log('Raw data:', data);
        }
    });
}).on('error', (err) => {
    console.error('HTTPS Error:', err.message);
});
