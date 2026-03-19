const express = require('express');
const path = require('path');
const app = express();

// Serve all static files (HTML, images, etc.)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Main route — serve the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`A1 Professional Asphalt site running on port ${PORT}`);
});
