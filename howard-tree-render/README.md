# Howard Tree Pros — Render deploy bundle

Copy **all files in this folder** to the root of https://github.com/msimpson215/howardtreepros and push to `main`.

Then in Render (service **howardtreepros**):

| Setting | Value |
|---------|--------|
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

Redeploy. The site should load at `https://howardtreepros.onrender.com`.

Replace `(314) 555-0100` in `index.html` with your real number.
