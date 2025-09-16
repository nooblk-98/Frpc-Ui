const state = {
  config: null,
  status: null
};

const proxiesContainer = document.getElementById('proxies');
const proxyTemplate = document.getElementById('proxy-template');
const statusContainer = document.getElementById('status');
const logsContainer = document.getElementById('logs');

const serverAddrInput = document.getElementById('serverAddr');
const serverPortInput = document.getElementById('serverPort');
const tokenInput = document.getElementById('token');
const userInput = document.getElementById('user');
const connectionStatusEl = document.getElementById('connectionStatus');

async function loadConfig() {
  const res = await fetch('/api/config');
  state.config = await res.json();
  state.config.proxies = Array.isArray(state.config.proxies) ? state.config.proxies : [];
  renderCommon();
  renderProxies();
}

function renderCommon() {
  const config = state.config || {};
  const common = config.common || {};
  serverAddrInput.value = common.server_addr || '';
  serverPortInput.value = common.server_port != null ? common.server_port : '';
  tokenInput.value = common.token || '';
  userInput.value = common.user || '';
  renderConnectionStatus();
}

function renderConnectionStatus() {
  if (!connectionStatusEl) {
    return;
  }
  const config = state.config || {};
  const common = config.common || {};
  const serverAddr = (common.server_addr || '').trim();
  const portValue = Number(common.server_port);
  const hasPort = Number.isFinite(portValue) && portValue > 0;

  if (!serverAddr || !hasPort) {
    connectionStatusEl.textContent = 'Server connection: configure server address & port';
    connectionStatusEl.className = 'connection-status muted';
    return;
  }

  const connection = state.status ? state.status.serverConnection : null;
  if (!connection) {
    connectionStatusEl.textContent = 'Server connection: checking...';
    connectionStatusEl.className = 'connection-status muted';
    return;
  }

  if (connection.configured === false) {
    connectionStatusEl.textContent = 'Server connection: configure server address & port';
    connectionStatusEl.className = 'connection-status muted';
    return;
  }

  if (connection.reachable) {
    connectionStatusEl.textContent = 'Server connection: reachable';
    connectionStatusEl.className = 'connection-status success';
    return;
  }

  const detail = connection.message ? ` (${connection.message})` : '';
  connectionStatusEl.textContent = `Server connection: unreachable${detail}`;
  connectionStatusEl.className = 'connection-status error';
}
function renderProxies() {
  proxiesContainer.innerHTML = '';
  if (!state.config || !Array.isArray(state.config.proxies)) {
    return;
  }
  state.config.proxies.forEach((proxy, index) => {
    const fragment = proxyTemplate.content.cloneNode(true);
    const entry = fragment.querySelector('.proxy-entry');
    entry.dataset.index = index;

    fragment.querySelectorAll('[data-field]').forEach((input) => {
      const field = input.dataset.field;
      const value = proxy[field];
      if (input.type === 'checkbox') {
        input.checked = Boolean(value);
      } else {
        input.value = value != null ? value : '';
      }
      input.addEventListener('input', handleProxyFieldChange);
      input.addEventListener('change', handleProxyFieldChange);
    });

    const removeBtn = fragment.querySelector('[data-action="remove"]');
    removeBtn.addEventListener('click', () => removeProxy(index));

    proxiesContainer.appendChild(fragment);
  });

  if (state.config.proxies.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No forwardings defined yet. Use "Add Forwarding" to create one.';
    proxiesContainer.appendChild(empty);
  }
}

function handleProxyFieldChange(event) {
  const field = event.target.dataset.field;
  const entry = event.target.closest('.proxy-entry');
  const index = parseInt(entry.dataset.index, 10);
  if (!state.config.proxies[index]) {
    return;
  }
  if (event.target.type === 'checkbox') {
    if (event.target.checked) {
      state.config.proxies[index][field] = true;
    } else {
      delete state.config.proxies[index][field];
    }
    return;
  }
  const value = event.target.value;
  if (!value) {
    if (field === 'name' || field === 'type') {
      state.config.proxies[index][field] = value;
    } else {
      delete state.config.proxies[index][field];
    }
    return;
  }
  if (event.target.type === 'number') {
    const numeric = Number(value);
    state.config.proxies[index][field] = Number.isFinite(numeric) ? numeric : value;
  } else {
    state.config.proxies[index][field] = value;
  }
}

function removeProxy(index) {
  state.config.proxies.splice(index, 1);
  renderProxies();
}

function addProxy() {
  if (!state.config) {
    state.config = { common: {}, proxies: [] };
  }
  state.config.proxies.push({
    name: '',
    type: 'tcp',
    local_ip: '127.0.0.1'
  });
  renderProxies();
}

function collectConfigFromForm() {
  if (!state.config) {
    state.config = { common: {}, proxies: [] };
  }
  const common = {
    server_addr: serverAddrInput.value.trim(),
    server_port: serverPortInput.value ? Number(serverPortInput.value) : undefined,
    token: tokenInput.value.trim(),
    user: userInput.value.trim()
  };

  const cleanedCommon = Object.fromEntries(
    Object.entries(common).filter(([_, value]) => value !== undefined && value !== '')
  );

  const proxies = (state.config.proxies || [])
    .map((proxy) => ({ ...proxy }))
    .filter((proxy) => proxy.name && proxy.type);

  return {
    common: cleanedCommon,
    proxies
  };
}

async function saveConfig() {
  try {
    const config = collectConfigFromForm();
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to save config');
    }
    state.config = payload;
    renderCommon();
    renderProxies();
    await refreshStatus();
    flash('Configuration saved');
  } catch (error) {
    alert(error.message);
  }
}

async function startFrpc() {
  try {
    const config = collectConfigFromForm();
    const res = await fetch('/api/frpc/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Unable to start frpc');
    }
    state.status = payload;
    await refreshStatus();
    flash('frpc started');
  } catch (error) {
    alert(error.message);
  }
}

async function stopFrpc() {
  try {
    const res = await fetch('/api/frpc/stop', { method: 'POST' });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Unable to stop frpc');
    }
    state.status = payload;
    await refreshStatus();
    flash('frpc stop signal sent');
  } catch (error) {
    alert(error.message);
  }
}

async function refreshStatus() {
  try {
    const res = await fetch('/api/frpc/status');
    state.status = await res.json();
    renderStatus();
    renderLogs();
    renderConnectionStatus();
  } catch (error) {
    console.error('Failed to refresh status', error);
    state.status = null;
    renderStatus();
    renderLogs();
    renderConnectionStatus();
  }
}

function renderStatus() {
  if (!state.status) {
    statusContainer.textContent = 'Status unavailable.';
    return;
  }
  const { running, pid, lastExit, lastError } = state.status;
  const lines = [];
  lines.push(`State: ${running ? 'Running' : 'Stopped'}`);
  if (running && pid) {
    lines.push(`PID: ${pid}`);
  }
  if (lastExit) {
    lines.push(`Last exit: code ${lastExit.code ?? 'null'} signal ${lastExit.signal ?? 'null'} (${lastExit.timestamp})`);
  }
  if (lastError) {
    lines.push(`Last error: ${lastError.message} (${lastError.timestamp})`);
  }
  statusContainer.innerHTML = lines.map((line) => `<div>${line}</div>`).join('');
}

function renderLogs() {
  if (!state.status || !Array.isArray(state.status.logs)) {
    logsContainer.textContent = '';
    return;
  }
  const text = state.status.logs
    .map((entry) => `[${entry.timestamp}] (${entry.source}) ${entry.line}`)
    .join('\n');
  logsContainer.textContent = text;
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

function flash(message) {
  const div = document.createElement('div');
  div.className = 'flash';
  div.textContent = message;
  document.body.appendChild(div);
  requestAnimationFrame(() => {
    div.classList.add('show');
  });
  setTimeout(() => {
    div.classList.remove('show');
    setTimeout(() => div.remove(), 300);
  }, 2000);
}

function init() {
  document.getElementById('addProxy').addEventListener('click', addProxy);
  document.getElementById('saveConfig').addEventListener('click', saveConfig);
  document.getElementById('saveProxies').addEventListener('click', saveConfig);
  document.getElementById('startFrpc').addEventListener('click', startFrpc);
  document.getElementById('stopFrpc').addEventListener('click', stopFrpc);
  document.getElementById('refreshStatus').addEventListener('click', refreshStatus);

  loadConfig();
  refreshStatus();
  setInterval(refreshStatus, 5000);
}

init();













