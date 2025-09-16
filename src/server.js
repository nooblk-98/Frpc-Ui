const express = require('express');
const path = require('path');
const cors = require('cors');

const { getConfig, saveConfig } = require('./configStore');
const { startFrpc, stopFrpc, getStatus, ensureConfigFiles } = require('./frpcManager');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

ensureConfigFiles(getConfig());

app.get('/api/config', (req, res) => {
  const config = getConfig();
  res.json(config);
});

app.post('/api/config', (req, res) => {
  try {
    const saved = saveConfig(req.body || {});
    ensureConfigFiles(saved);
    res.json(saved);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/frpc/start', (req, res) => {
  try {
    const status = startFrpc(req.body || {});
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/frpc/stop', (req, res) => {
  try {
    const status = stopFrpc();
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/frpc/status', (req, res) => {
  res.json(getStatus());
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.listen(PORT, () => {
  console.log(`frpc UI server listening on port ${PORT}`);
});
