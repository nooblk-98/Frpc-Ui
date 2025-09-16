const AUTO_REFRESH_INTERVAL = 5000;
const THEME_STORAGE_KEY = 'frpc-ui-theme';

const state = {
  config: null,
  status: null,
  ui: {
    proxyFilter: '',
    autoRefresh: true,
    autoRefreshTimer: null,
    totalProxyCount: 0,
    visibleProxyCount: 0
  }
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
const themeToggle = document.getElementById('themeToggle');
const themeToggleLabel = document.getElementById('themeToggleLabel');
const themeToggleIcon = document.getElementById('themeToggleIcon');
const proxySearchInput = document.getElementById('proxySearch');
const proxySummary = document.getElementById('proxySummary');
const overviewStatusEl = document.getElementById('overview-status');
const overviewConnectionEl = document.getElementById('overview-connection');
const overviewProxiesEl = document.getElementById('overview-proxies');
const overviewAutoRefreshEl = document.getElementById('overview-auto-refresh');
const autoRefreshToggle = document.getElementById('autoRefreshToggle');
const restartButton = document.getElementById('restartFrpc');
const clearLogsButton = document.getElementById('clearLogs');
const downloadLogsButton = document.getElementById('downloadLogs');
const refreshButton = document.getElementById('refreshStatus');

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  updateThemeToggle(theme);
}

function updateThemeToggle(theme) {
  if (!themeToggleLabel || !themeToggleIcon) {
    return;
  }
  const next = theme === 'dark' ? 'Light' : 'Dark';
  themeToggleLabel.textContent = `${next} mode`;
  themeToggleIcon.textContent = theme === 'dark' ? '??' : '??';
}

function toggleTheme() {
  const current = document.body.dataset.theme || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function initializeTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
    return;
  }
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(prefersLight ? 'light' : 'dark');
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (!state.ui.autoRefresh) {
    return;
  }
  state.ui.autoRefreshTimer = setInterval(() => {
    refreshStatus();
  }, AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
  if (state.ui.autoRefreshTimer) {
    clearInterval(state.ui.autoRefreshTimer);
    state.ui.autoRefreshTimer = null;
  }
}

function updateAutoRefreshButton() {
  if (!autoRefreshToggle) {
    return;
  }
  if (state.ui.autoRefresh) {
    autoRefreshToggle.textContent = 'Pause auto refresh';
  } else {
    autoRefreshToggle.textContent = 'Resume auto refresh';
  }
}

function toggleAutoRefresh() {
  state.ui.autoRefresh = !state.ui.autoRefresh;
  if (state.ui.autoRefresh) {
    refreshStatus();
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
  updateAutoRefreshButton();
  renderOverview();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return 'unknown time';
  }
  try {
    return new Date(timestamp).toLocaleString();
  } catch (error) {
    return timestamp;
  }
}

function computeConnectionState() {
  const config = state.config || {};
  const common = config.common || {};
  const serverAddr = (common.server_addr || '').trim();
  const portValue = Number(common.server_port);
  const hasPort = Number.isFinite(portValue) && portValue > 0;

  if (!serverAddr || !hasPort) {
    return {
      text: 'Server connection: configure server address & port',
      badge: 'muted',
      overview: 'Not configured'
    };
  }

  const connection = state.status ? state.status.serverConnection : null;
  if (!connection) {
    return {
      text: 'Server connection: checking...',
      badge: 'muted',
      overview: 'Checking…'
    };
  }

  if (connection.configured === false) {
    return {
      text: 'Server connection: configure server address & port',
      badge: 'muted',
      overview: 'Not configured'
    };
  }

  if (connection.reachable) {
    return {
      text: 'Server connection: reachable',
      badge: 'success',
      overview: 'Reachable'
    };
  }

  const detail = connection.message ? ` (${connection.message})` : '';
  return {
    text: `Server connection: unreachable${detail}`,
    badge: 'danger',
    overview: 'Unreachable'
  };
}

async function loadConfig() {
  const res = await fetch('/api/config');
  state.config = await res.json();
  state.config.proxies = Array.isArray(state.config.proxies) ? state.config.proxies : [];
  renderCommon();
  renderProxies();
  renderOverview();
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
  const { text, badge } = computeConnectionState();
  connectionStatusEl.textContent = text;
  connectionStatusEl.className = `connection-status ${badge}`;
  renderOverview();
}

function updateProxySummary(total, visible) {
  if (proxySummary) {
    if (total === 0) {
      proxySummary.textContent = 'No forwardings defined yet. Use "Add Forwarding" to create one.';
    } else if (visible !== total) {
      proxySummary.textContent = `${visible} of ${total} forwardings match your search.`;
    } else {
      proxySummary.textContent = `${total} forwardings configured.`;
    }
  }
  if (overviewProxiesEl) {
    overviewProxiesEl.textContent = total;
  }
}

function renderProxies() {
  proxiesContainer.innerHTML = '';
  if (!state.config || !Array.isArray(state.config.proxies)) {
    updateProxySummary(0, 0);
    return;
  }

  const total = state.config.proxies.length;
  const filter = state.ui.proxyFilter.trim().toLowerCase();
  const filtered = filter
    ? state.config.proxies.filter((proxy) => {
        const values = Object.values(proxy || {}).join(' ').toLowerCase();
        return values.includes(filter);
      })
    : state.config.proxies.slice();

  state.ui.totalProxyCount = total;
  state.ui.visibleProxyCount = filtered.length;

  filtered.forEach((proxy, index) => {
    const fragment = proxyTemplate.content.cloneNode(true);
    const entry = fragment.querySelector('.proxy-entry');
    entry.dataset.index = state.config.proxies.indexOf(proxy);

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
    removeBtn.addEventListener('click', () => removeProxy(entry.dataset.index));

    proxiesContainer.appendChild(fragment);
  });

  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = total === 0 ? 'No forwardings defined yet. Use "Add Forwarding" to create one.' : 'No forwardings match your search.';
    proxiesContainer.appendChild(empty);
  }

  updateProxySummary(total, filtered.length);
  renderOverview();
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

function removeProxy(index) {\n  const idx = Number(index);\n  if (Number.isNaN(idx)) {\n    return;\n  }\n  state.config.proxies.splice(idx, 1);
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

async function performStart(config, { silent = false } = {}) {
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
  if (!silent) {
    flash('frpc started');
  }
  return payload;
}

async function performStop({ silent = false } = {}) {
  const res = await fetch('/api/frpc/stop', { method: 'POST' });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || 'Unable to stop frpc');
  }
  state.status = payload;
  await refreshStatus();
  if (!silent) {
    flash('frpc stop signal sent');
  }
  return payload;
}

async function startFrpc() {
  try {
    const config = collectConfigFromForm();
    await performStart(config);
  } catch (error) {
    alert(error.message);
  }
}

async function stopFrpc() {
  try {
    await performStop({ silent: false });
  } catch (error) {
    alert(error.message);
  }
}

async function restartFrpc() {
  try {
    const config = collectConfigFromForm();
    await performStop({ silent: true });
    await sleep(400);
    await performStart(config, { silent: true });
    flash('frpc restarted');
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
  if (!statusContainer) {
    return;
  }
  if (!state.status) {
    statusContainer.innerHTML = '<div class="status-grid"><div class="status-row"><span class="status-label">State</span><span class="status-value muted">Unavailable</span></div></div>';
    renderOverview();
    return;
  }
  const { running, pid, lastExit, lastError } = state.status;
  const rows = [];
  rows.push(`<div class="status-row"><span class="status-label">State</span><span class="status-value ${running ? 'success' : 'danger'}">${running ? 'Running' : 'Stopped'}</span></div>`);
  if (pid) {
    rows.push(`<div class="status-row"><span class="status-label">PID</span><span class="status-value">${pid}</span></div>`);
  }
  if (lastExit) {
    const exitText = `code ${lastExit.code ?? 'null'}, signal ${lastExit.signal ?? 'null'} • ${formatTimestamp(lastExit.timestamp)}`;
    rows.push(`<div class="status-row"><span class="status-label">Last exit</span><span class="status-value muted">${exitText}</span></div>`);
  }
  if (lastError) {
    const errorText = `${lastError.message} • ${formatTimestamp(lastError.timestamp)}`;
    rows.push(`<div class="status-row"><span class="status-label">Last error</span><span class="status-value danger">${errorText}</span></div>`);
  }
  statusContainer.innerHTML = `<div class="status-grid">${rows.join('')}</div>`;
  renderOverview();
}

function renderLogs() {
  if (!logsContainer) {
    return;
  }
  if (!state.status || !Array.isArray(state.status.logs)) {
    logsContainer.textContent = '';
    updateLogTools();
    return;
  }
  const text = state.status.logs.map((entry) => `[${entry.timestamp}] (${entry.source}) ${entry.line}`).join('\n');
  logsContainer.textContent = text;
  logsContainer.scrollTop = logsContainer.scrollHeight;
  updateLogTools();
}

function updateLogTools() {
  const hasLogs = Boolean(state.status && Array.isArray(state.status.logs) && state.status.logs.length);
  if (clearLogsButton) {
    clearLogsButton.disabled = !hasLogs;
  }
  if (downloadLogsButton) {
    downloadLogsButton.disabled = !hasLogs;
  }
}

function clearLogs() {
  if (state.status && Array.isArray(state.status.logs)) {
    state.status.logs = [];
  }
  renderLogs();
}

function downloadLogs() {
  if (!state.status || !Array.isArray(state.status.logs) || !state.status.logs.length) {
    flash('No logs available to download');
    return;
  }
  const text = state.status.logs.map((entry) => `[${entry.timestamp}] (${entry.source}) ${entry.line}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `frpc-logs-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderOverview() {
  if (!overviewStatusEl || !overviewConnectionEl || !overviewAutoRefreshEl) {
    return;
  }
  const status = state.status;
  let statusText = 'Unknown';
  let statusClass = 'warning';
  if (status) {
    statusText = status.running ? 'Running' : 'Stopped';
    statusClass = status.running ? 'success' : 'danger';
  }
  overviewStatusEl.textContent = statusText;
  overviewStatusEl.className = `metric-value badge ${statusClass}`;

  const connection = computeConnectionState();
  overviewConnectionEl.textContent = connection.overview;
  overviewConnectionEl.className = `metric-value badge ${connection.badge}`;

  overviewProxiesEl.textContent = state.ui.totalProxyCount;
  overviewAutoRefreshEl.textContent = state.ui.autoRefresh ? 'On' : 'Paused';
  overviewAutoRefreshEl.className = `metric-value badge ${state.ui.autoRefresh ? 'success' : 'warning'}`;
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

function handleProxySearch(event) {
  state.ui.proxyFilter = event.target.value.toLowerCase();
  renderProxies();
}

function handleVisibilityChange() {
  if (document.hidden) {
    stopAutoRefresh();
  } else if (state.ui.autoRefresh) {
    refreshStatus();
    startAutoRefresh();
  }
}

function init() {
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  if (proxySearchInput) {
    proxySearchInput.addEventListener('input', handleProxySearch);
  }
  document.getElementById('addProxy').addEventListener('click', addProxy);
  document.getElementById('saveConfig').addEventListener('click', saveConfig);
  document.getElementById('saveProxies').addEventListener('click', saveConfig);
  document.getElementById('startFrpc').addEventListener('click', startFrpc);
  document.getElementById('stopFrpc').addEventListener('click', stopFrpc);
  if (restartButton) {
    restartButton.addEventListener('click', restartFrpc);
  }
  if (autoRefreshToggle) {
    autoRefreshToggle.addEventListener('click', toggleAutoRefresh);
  }
  if (clearLogsButton) {
    clearLogsButton.addEventListener('click', clearLogs);
  }
  if (downloadLogsButton) {
    downloadLogsButton.addEventListener('click', downloadLogs);
  }
  if (refreshButton) {
    refreshButton.addEventListener('click', () => refreshStatus());
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);

  initializeTheme();
  updateAutoRefreshButton();
  updateLogTools();

  loadConfig();
  refreshStatus();
  startAutoRefresh();
}

init();

