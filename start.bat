@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js install nahi hai. https://nodejs.org se LTS version install karein, phir dobara chalayein.
  pause
  exit /b 1
)
if not exist .env (
  echo.
  echo Pehli baar setup.
  echo Free Gemini key yahan se banayein: https://aistudio.google.com/apikey
  echo Key copy kar ke neeche paste karein ^(right-click karne se paste hota hai^) aur Enter dabayein.
  set /p KEY=Gemini key:
  > .env echo GEMINI_API_KEY=%KEY%
  >> .env echo DAILY_LIMIT=60
)
echo.
echo Nova AI shuru ho raha hai... Browser mein kholein: http://localhost:3000
echo Band karne ke liye is window mein Ctrl+C dabayein.
echo.
node server.js
pause
