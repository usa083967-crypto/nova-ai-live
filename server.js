const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Gemini API Endpoint
app.use('/api/chat', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY set nahi hai Render environment variables mein.' });
        }

        const userMessage = req.body.message || '';
        
        // Google Gemini API Call
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userMessage }] }]
            })
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            const reply = data.candidates[0].content.parts[0].text;
            res.json({ reply });
        } else {
            res.status(500).json({ error: 'Gemini API se response hasil karne mein masla hua.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fallback for SPA
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.status(404).json({ error: 'server', message: 'File nahi mili.' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Nova AI server port ${PORT} par chal raha hai.`);
});
