const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Modern ChatGPT Style UI Homepage
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nova AI - Gemini Chatbot</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #343541; color: #ececf1; display: flex; flex-direction: column; height: 100vh; }
            header { background: #202123; padding: 15px; text-align: center; border-bottom: 1px solid #4d4d4f; font-size: 18px; font-weight: bold; color: #10a37f; }
            #chat-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
            .message-row { display: flex; width: 100%; justify-content: flex-start; }
            .message-row.user { justify-content: flex-end; }
            .message { max-width: 75%; padding: 15px 20px; border-radius: 12px; font-size: 15px; line-height: 1.6; word-break: break-word; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
            .user .message { background: #10a37f; color: #fff; border-bottom-right-radius: 2px; }
            .bot .message { background: #444654; color: #ececf1; border-bottom-left-radius: 2px; border: 1px solid #565869; }
            #input-area { background: #343541; padding: 20px; border-top: 1px solid #4d4d4f; display: flex; justify-content: center; }
            .input-wrapper { display: flex; width: 100%; max-width: 800px; background: #40414f; border-radius: 8px; border: 1px solid #565869; padding: 8px 12px; box-shadow: 0 0 15px rgba(0,0,0,0.1); }
            input { flex: 1; background: transparent; border: none; color: #fff; font-size: 16px; outline: none; padding: 8px; }
            button { background: #10a37f; color: #white; border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-weight: bold; transition: background 0.2s; }
            button:hover { background: #0d8c6d; }
            .typing { font-style: italic; color: #8e8ea0; }
        </style>
    </head>
    <body>
        <header>Nova AI (Powered by Gemini)</header>
        <div id="chat-container">
            <div class="message-row bot">
                <div class="message">Hello! Main Nova AI hoon. Aaj main aapki kya madad kar sakta hoon?</div>
            </div>
        </div>
        <div id="input-area">
            <div class="input-wrapper">
                <input type="text" id="user-input" placeholder="Message Nova AI..." autocomplete="off">
                <button onclick="sendMessage()">Bhejein</button>
            </div>
        </div>

        <script>
            async function sendMessage() {
                const input = document.getElementById('user-input');
                const chatContainer = document.getElementById('chat-container');
                const text = input.value.trim();
                if (!text) return;

                // User message UI
                chatContainer.innerHTML += \`
                    <div class="message-row user">
                        <div class="message">\${escapeHtml(text)}</div>
                    \</div>\`;
                input.value = '';
                chatContainer.scrollTop = chatContainer.scrollHeight;

                // Typing indicator
                const typingId = 'typing-' + Date.now();
                chatContainer.innerHTML += \`
                    <div class="message-row bot" id="\${typingId}">
                        <div class="message typing">Nova AI soch raha hai...</div>
                    \</div>\`;
                chatContainer.scrollTop = chatContainer.scrollHeight;

                try {
                    const res = await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: text })
                    });
                    const data = await res.json();
                    
                    document.getElementById(typingId).remove();

                    if (data.reply) {
                        chatContainer.innerHTML += \`
                            <div class="message-row bot">
                                <div class="message">\${escapeHtml(data.reply)}</div>
                            \</div>\`;
                    } else {
                        chatContainer.innerHTML += \`
                            <div class="message-row bot">
                                <div class="message" style="color: #ff6b6b;">Error: \${data.error || 'Kuch ghalat ho gaya.'}</div>
                            \</div>\`;
                    }
                } catch (e) {
                    document.getElementById(typingId).remove();
                    chatContainer.innerHTML += \`
                        <div class="message-row bot">
                            <div class="message" style="color: #ff6b6b;">Server connection error.</div>
                        \</div>\`;
                }
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }

            function escapeHtml(text) {
                return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }

            document.getElementById('user-input').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') sendMessage();
            });
        </script>
    </body>
    </html>
    `);
});

// Gemini API Endpoint (Updated with correct v1 format & model)
app.post('/api/chat', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY environment variable set nahi hai.' });
        }

        const userMessage = req.body.message || '';
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: userMessage }]
                }]
            })
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
            const reply = data.candidates[0].content.parts[0].text;
            res.json({ reply });
        } else if (data.error) {
            res.status(500).json({ error: data.error.message || 'Gemini API Error' });
        } else {
            res.status(500).json({ error: 'API se ghalat response mila hai.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server port ${PORT} par chal raha hai.`);
});
