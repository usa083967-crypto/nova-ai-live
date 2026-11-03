#!/usr/bin/env bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js install nahi hai. https://nodejs.org se LTS version install karein."
  exit 1
fi
if [ ! -f .env ]; then
  echo "Pehli baar setup."
  echo "Free Gemini key yahan se banayein: https://aistudio.google.com/apikey"
  read -r -p "Gemini key: " KEY
  printf 'GEMINI_API_KEY=%s\nDAILY_LIMIT=60\n' "$KEY" > .env
fi
echo "Nova AI shuru ho raha hai... Browser mein kholein: http://localhost:3000"
node server.js
