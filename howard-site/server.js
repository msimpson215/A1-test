const express = require('express');
const path = require('path');

const app = express();
const root = __dirname;

app.use(express.static(root));

app.get('/', (_, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

const port = process.env.PORT || 10000;
const host = '0.0.0.0';

app.listen(port, host, () => {
  console.log(`Howard's Tree Pros site running on http://${host}:${port}`);
});
