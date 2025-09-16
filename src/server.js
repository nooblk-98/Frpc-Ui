const express = require('express');
const path = require('path');
const cors = require('cors');

const { getConfig, saveConfig } = require('./configStore');
const { startFrpc, stopFrpc, getStatusWithConnection, ensureConfigFiles } = require('./frpcManager');

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

app.post('/api/frpc/start', async (req, res) => {
  try {
    startFrpc(req.body || {});
    const status = await getStatusWithConnection();
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/frpc/stop', async (req, res) => {
  try {
    stopFrpc();
    const status = await getStatusWithConnection();
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/frpc/status', async (req, res) => {
  const status = await getStatusWithConnection();
  res.json(status);
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

