// Local development server. Production runs the same routes via api/index.js on Vercel.
const path = require('path');
const app = require('../api/index');
const express = require('express');

// Serve built frontend statically if available
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));
app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) res.status(200).send('SkyWin API Server is running.');
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`SkyWin running on http://localhost:${PORT} (Aviator: global synchronized engine)`);
});
