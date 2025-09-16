const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { getConfig, saveConfig } = require('./configStore');

const DEFAULT_FRPC_PATH = process.env.FRPC_EXEC_PATH || process.env.FRPC_PATH || '';
const CONFIG_DIR = path.join(__dirname, '..', 'data');
const GENERATED_INI = path.join(CONFIG_DIR, 'frpc.generated.ini');
const GENERATED_TOML = path.join(CONFIG_DIR, 'frpc.generated.toml');

let frpcProcess = null;
let lastExit = null;
let lastError = null;
const logs = [];
const MAX_LOG_LINES = 500;

function appendLog(source, message) {
  const lines = message.toString().split(/\r?\n/).filter(Boolean);
  lines.forEach((line) => {
    logs.push({
      timestamp: new Date().toISOString(),
      source,
      line
    });
  });
  if (logs.length > MAX_LOG_LINES) {
    logs.splice(0, logs.length - MAX_LOG_LINES);
  }
}

function buildIni(config) {
  const safeConfig = config || {};
  const common = safeConfig.common || {};
  const proxies = Array.isArray(safeConfig.proxies) ? safeConfig.proxies : [];
  const lines = ['[common]'];
  Object.entries(common).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      lines.push(`${key} = ${value}`);
    }
  });

  proxies.forEach((proxy) => {
    if (!proxy || !proxy.name) {
      return;
    }
    lines.push('');
    lines.push(`[${proxy.name}]`);
    const { name, ...rest } = proxy;
    const type = rest.type || 'tcp';
    lines.push(`type = ${type}`);

    Object.entries(rest).forEach(([key, value]) => {
      if (key === 'type') {
        return;
      }
      if (value !== undefined && value !== null && value !== '') {
        lines.push(`${key} = ${value}`);
      }
    });
  });

  return lines.join(os.EOL) + os.EOL;
}

function formatTomlValue(value) {
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatTomlValue(item)).join(', ')}]`;
  }
  if (value === undefined || value === null) {
    return '""';
  }
  const str = String(value).trim();
  if (!str) {
    return '""';
  }
  if (str.includes(',')) {
    const parts = str
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      return `[${parts.map((part) => formatTomlValue(part)).join(', ')}]`;
    }
  }
  return `"${str.replace(/"/g, '\\"')}"`;
}

function buildToml(config) {
  const safeConfig = config || {};
  const common = safeConfig.common || {};
  const proxies = Array.isArray(safeConfig.proxies) ? safeConfig.proxies : [];
  const lines = ['[common]'];

  Object.entries(common).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      lines.push(`${key} = ${formatTomlValue(value)}`);
    }
  });

  proxies.forEach((proxy) => {
    if (!proxy || !proxy.name) {
      return;
    }
    lines.push('');
    lines.push('[[proxies]]');
    Object.entries({ ...proxy, type: proxy.type || 'tcp' }).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        lines.push(`${key} = ${formatTomlValue(value)}`);
      }
    });
  });

  return lines.join(os.EOL) + os.EOL;
}

function ensureConfigFiles(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const iniBody = buildIni(config);
  const tomlBody = buildToml(config);
  fs.writeFileSync(GENERATED_INI, iniBody, 'utf-8');
  fs.writeFileSync(GENERATED_TOML, tomlBody, 'utf-8');
  return { iniPath: GENERATED_INI, tomlPath: GENERATED_TOML };
}

function startFrpc(overrides) {
  if (frpcProcess) {
    throw new Error('frpc is already running');
  }
  const baseConfig = getConfig();
  const config = overrides ? saveConfig({ ...baseConfig, ...overrides }) : baseConfig;
  const executablePath = config.frpcPath || DEFAULT_FRPC_PATH;
  if (!executablePath) {
    throw new Error('frpcPath is not configured');
  }
  const { iniPath } = ensureConfigFiles(config);
  appendLog('system', `Starting frpc (${executablePath}) with config ${iniPath}`);
  frpcProcess = spawn(executablePath, ['-c', iniPath], {
    cwd: path.dirname(executablePath) || process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  frpcProcess.stdout.on('data', (data) => appendLog('stdout', data));
  frpcProcess.stderr.on('data', (data) => appendLog('stderr', data));

  frpcProcess.on('exit', (code, signal) => {
    appendLog('system', `frpc exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
    lastExit = { code, signal, timestamp: new Date().toISOString() };
    frpcProcess = null;
  });

  frpcProcess.on('error', (error) => {
    appendLog('system', `frpc process error: ${error.message}`);
    lastError = { message: error.message, timestamp: new Date().toISOString() };
  });

  return getStatus();
}

function stopFrpc() {
  if (!frpcProcess) {
    return getStatus();
  }
  frpcProcess.kill();
  appendLog('system', 'Sent termination signal to frpc');
  return getStatus();
}

function getStatus() {
  return {
    running: Boolean(frpcProcess),
    pid: frpcProcess ? frpcProcess.pid : null,
    lastExit,
    lastError,
    logs: [...logs]
  };
}

module.exports = {
  startFrpc,
  stopFrpc,
  getStatus,
  buildIni,
  buildToml,
  ensureConfigFiles,
  GENERATED_INI,
  GENERATED_TOML
};
