const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Homepage - Seedha server se design load hoga
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nova AI Chatbot</title>
        <style>
            body { font-family: Arial, sans-serif; background: #0e0e0e; color: #fff; margin: 0; padding: 20px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
            h2 { text-align: center; color: #00ffcc; }
            #chat-container { flex: 1; overflow-y: auto; background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #333; }
            .message { margin-bottom: 12px; padding: 10px; border-radius: 6px; max-width: 80%; line-height: 1.4; }
            .user { background: #007bff; margin-left: auto; text-align: right; }
            .bot { background: #333; margin-right: auto; }
            #input-container { display: flex; gap: 10px; }
            input { flex: 1; padding: 12px; border-radius: 6px; border: 1px solid #444; background: #222; color: #fff; font-size: 16px; }
            button { padding: 12px 20px; background: #00ffcc; color: #000; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
            button:hover { background: #00b386; }
        </style>
    </head>
    <body>
        <h2>Nova AI (Gemini Powered)</h2>
        <div id="chat-container"></div>
        <div id="input-container">
            <input type="text" id="user-input" placeholder="Yahan apna sawal likhein..." autocomplete="off">
            <button onclick="sendMessage()">Bhejein</button>
        </div>

        <script>
            async function sendMessage() {
                const input = document.getElementById('user-input');
                const chatContainer = document.getElementById('chat-container');
                const messageText = input.value.trim();
                if (!messageText) return;

                chatContainer.innerHTML += \`<div class="message user">\${messageText}</div>\`;
                input.value = '';
                chatContainer.scrollTop = chatContainer.scrollHeight;

                try {
                    const response = await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: messageText })
                    });
                    const data = await response.json();
                    
                    if (data.reply) {
                        chatContainer.innerHTML += \`<div class="message bot">\${data.reply}</div>\`;
                    } else {
                        chatContainer.innerHTML += \`<div class="message bot">Error: \${data.error || 'Kuch ghalat ho gaya.'}</div>\`;
                    }
                } catch (e) {
                    chatContainer.innerHTML += \`<div class="message bot">Server se connect nahi ho saka.</div>\`;
                }
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }

            document.getElementById('user-input').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') sendMessage();
            });
        </script>
    </body>
    </html>
    `);
});

// Gemini API Endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY set nahi hai Render environment variables mein.' });
        }

        const userMessage = req.body.message || '';
        
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

app.listen(PORT, () => {
    console.log(`Nova AI server port ${PORT} par chal raha hai.`);
});
