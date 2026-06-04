const express = require('express');
const path = require('path');

const app = express();
const root = __dirname;

app.use(express.static(root));

app.get('/', (req, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Howard Tree Pros running on http://${HOST}:${PORT}`);
});
