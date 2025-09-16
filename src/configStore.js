const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');

const defaultConfig = () => ({
  frpcPath: '',
  common: {
    server_addr: '',
    server_port: 7000,
    token: '',
    user: ''
  },
  proxies: []
});

function ensureStore() {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig(), null, 2));
  }
}

function getConfig() {
  try {
    ensureStore();
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    const fallback = defaultConfig();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function saveConfig(config) {
  ensureStore();
  const merged = {
    ...defaultConfig(),
    ...config,
    common: {
      ...defaultConfig().common,
      ...(config.common || {})
    },
    proxies: Array.isArray(config.proxies) ? config.proxies : []
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = {
  getConfig,
  saveConfig,
  CONFIG_PATH
};
