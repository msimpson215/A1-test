# A1 Professional Asphalt & Sealing — Website

## Files in this project:
- `server.js` — runs the web server
- `package.json` — tells Render what to install
- `public/index.html` — the actual website
- `public/Sams-Club-Parking-Lot-Painting-980x429.jpg` — hero image
- `public/A1_logo.webp` — ADD YOUR LOGO FILE HERE

## How to deploy on Render (free):

1. Go to github.com — create a free account if needed
2. Click **New Repository** — name it `a1-website` — click **Create**
3. Upload ALL files in this folder to the repo (drag and drop)
4. Go to render.com — create a free account
5. Click **New** → **Web Service**
6. Connect your GitHub account → select `a1-website`
7. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start` (or `node server/server.js`)
8. Click **Deploy** — done in 2 minutes
9. Render gives you a live URL like `a1-website.onrender.com`

## To make changes later:
Tell Claude what to change → get updated index.html → 
upload to GitHub → Render auto-republishes
