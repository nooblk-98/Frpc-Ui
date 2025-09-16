const AUTO_REFRESH_INTERVAL = 5000;
const THEME_STORAGE_KEY = 'frpc-ui-theme';

const state = {
  config: null,
  status: null,
  ui: {
    proxyFilter: '',
    proxyTypeFilter: 'all',
    autoRefresh: true,
    autoRefreshTimer: null,
    totalProxyCount: 0,
    visibleProxyCount: 0,
    lastStatusAt: null,
    preferencesInitialized: false
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
const protocolSelect = document.getElementById('protocol');
const adminAddrInput = document.getElementById('adminAddr');
const adminPortInput = document.getElementById('adminPort');
const logFileInput = document.getElementById('logFile');
const logLevelSelect = document.getElementById('logLevel');
const logMaxDaysInput = document.getElementById('logMaxDays');
const tlsEnableInput = document.getElementById('tlsEnable');
const tlsServerNameInput = document.getElementById('tlsServerName');
const heartbeatIntervalInput = document.getElementById('heartbeatInterval');
const heartbeatTimeoutInput = document.getElementById('heartbeatTimeout');
const loginFailExitInput = document.getElementById('loginFailExit');
const frpcPathInput = document.getElementById('frpcPath');
const autoStartPreferenceToggle = document.getElementById('autoStart');
const autoRefreshPreferenceToggle = document.getElementById('autoRefreshPreference');
const connectionStatusEl = document.getElementById('connectionStatus');
const themeToggle = document.getElementById('themeToggle');
const themeToggleLabel = document.getElementById('themeToggleLabel');
const themeToggleIcon = document.getElementById('themeToggleIcon');
const proxySearchInput = document.getElementById('proxySearch');
const proxySummary = document.getElementById('proxySummary');
const proxyFilterButtons = document.querySelectorAll('[data-proxy-filter]');
const resetProxyFiltersButton = document.getElementById('resetProxyFilters');
const overviewStatusEl = document.getElementById('overview-status');
const overviewConnectionEl = document.getElementById('overview-connection');
const overviewProxiesEl = document.getElementById('overview-proxies');
const overviewAutoRefreshEl = document.getElementById('overview-auto-refresh');
const overviewAutoStartEl = document.getElementById('overview-auto-start');
const overviewFrpcPathEl = document.getElementById('overview-frpc-path');
const overviewThemeEl = document.getElementById('overview-theme');
const overviewLastRefreshEl = document.getElementById('overview-last-refresh');
const autoRefreshToggle = document.getElementById('autoRefreshToggle');
const restartButton = document.getElementById('restartFrpc');
const clearLogsButton = document.getElementById('clearLogs');
const downloadLogsButton = document.getElementById('downloadLogs');
const refreshButton = document.getElementById('refreshStatus');
const importConfigInput = document.getElementById('importConfig');
const exportJsonButton = document.getElementById('exportJson');
const exportIniButton = document.getElementById('exportIni');
const exportTomlButton = document.getElementById('exportToml');
const copyConfigButton = document.getElementById('copyConfig');
const toolsHint = document.getElementById('toolsHint');
const flashRoot = document.getElementById('flash-root');

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  updateThemeToggle(theme);
  if (state.config) {
    state.config.preferences = state.config.preferences || {};
    state.config.preferences.theme = theme;
  }
  renderOverview();
}

function updateThemeToggle(theme) {
  if (!themeToggleLabel || !themeToggleIcon) {
    return;
  }
  const isDark = theme === 'dark';
  themeToggleLabel.textContent = isDark ? 'Switch to Light' : 'Switch to Dark';
  themeToggleIcon.textContent = isDark ? '🌙' : '☀️';
  if (themeToggle) {
    themeToggle.setAttribute('aria-pressed', String(!isDark));
  }
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

function syncAutoRefreshPreference() {
  if (autoRefreshPreferenceToggle) {
    autoRefreshPreferenceToggle.checked = state.ui.autoRefresh;
  }
  if (state.config) {
    state.config.preferences = state.config.preferences || {};
    state.config.preferences.autoRefresh = state.ui.autoRefresh;
  }
}

function updateAutoRefreshButton() {
  if (!autoRefreshToggle) {
    return;
  }
  autoRefreshToggle.textContent = state.ui.autoRefresh ? 'Pause auto refresh' : 'Resume auto refresh';
  syncAutoRefreshPreference();
  renderOverview();
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

function formatRelativeTime(value) {
  if (!value) {
    return '--';
  }
  const date = value instanceof Date ? value : new Date(value);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) {
    return date.toLocaleTimeString();
  }
  if (diff < 5000) {
    return 'Just now';
  }
  if (diff < 60000) {
    return `${Math.round(diff / 1000)}s ago`;
  }
  if (diff < 3600000) {
    return `${Math.round(diff / 60000)}m ago`;
  }
  return date.toLocaleTimeString();
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
      overview: 'Checking'
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
  state.config.preferences = state.config.preferences || {};
  renderPreferences(true);
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
  if (protocolSelect) {
    const protocol = common.protocol || '';
    protocolSelect.value = protocolSelect.querySelector(`option[value="${protocol}"]`) ? protocol : '';
  }
  if (adminAddrInput) {
    adminAddrInput.value = common.admin_addr || '';
  }
  if (adminPortInput) {
    adminPortInput.value = common.admin_port != null ? common.admin_port : '';
  }
  if (logFileInput) {
    logFileInput.value = common.log_file || '';
  }
  if (logLevelSelect) {
    const level = common.log_level || '';
    logLevelSelect.value = logLevelSelect.querySelector(`option[value="${level}"]`) ? level : '';
  }
  if (logMaxDaysInput) {
    logMaxDaysInput.value = common.log_max_days != null ? common.log_max_days : '';
  }
  if (tlsEnableInput) {
    tlsEnableInput.checked = Boolean(common.tls_enable);
  }
  if (tlsServerNameInput) {
    tlsServerNameInput.value = common.tls_server_name || '';
  }
  if (heartbeatIntervalInput) {
    heartbeatIntervalInput.value = common.heartbeat_interval != null ? common.heartbeat_interval : '';
  }
  if (heartbeatTimeoutInput) {
    heartbeatTimeoutInput.value = common.heartbeat_timeout != null ? common.heartbeat_timeout : '';
  }
  if (loginFailExitInput) {
    loginFailExitInput.checked = Boolean(common.login_fail_exit);
  }
  renderConnectionStatus();
}

function renderPreferences(force = false) {
  if (!state.config) {
    return;
  }
  const preferences = state.config.preferences || {};
  if (frpcPathInput) {
    frpcPathInput.value = state.config.frpcPath || '';
  }
  if (autoStartPreferenceToggle) {
    autoStartPreferenceToggle.checked = preferences.autoStart !== false;
  }
  const desiredAutoRefresh = preferences.autoRefresh !== false;
  if (!state.ui.preferencesInitialized || force) {
    state.ui.autoRefresh = desiredAutoRefresh;
    if (autoRefreshPreferenceToggle) {
      autoRefreshPreferenceToggle.checked = desiredAutoRefresh;
    }
    if (desiredAutoRefresh) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
    state.ui.preferencesInitialized = true;
    updateAutoRefreshButton();
  } else if (autoRefreshPreferenceToggle) {
    autoRefreshPreferenceToggle.checked = state.ui.autoRefresh;
  }
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (!savedTheme && preferences.theme && preferences.theme !== document.body.dataset.theme) {
    applyTheme(preferences.theme);
  }
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
      proxySummary.textContent = 'No forwardings defined yet. Use "Add forwarding" to create one.';
    } else if (visible !== total) {
      const typeLabel = state.ui.proxyTypeFilter === 'all' ? '' : ` filtered by ${state.ui.proxyTypeFilter.toUpperCase()}`;
      proxySummary.textContent = `${visible} of ${total} forwardings${typeLabel} match your search.`;
    } else {
      proxySummary.textContent = `${total} forwardings configured.`;
    }
  }
  if (overviewProxiesEl) {
    overviewProxiesEl.textContent = total;
  }
}

function updateProxyFilterChips() {
  proxyFilterButtons.forEach((button) => {
    const value = button.dataset.proxyFilter || 'all';
    if (value === state.ui.proxyTypeFilter) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });
}

function updateProxyHeader(entry, proxy) {
  if (!entry || !proxy) {
    return;
  }
  const nameEl = entry.querySelector('[data-role="proxy-name"]');
  if (nameEl) {
    nameEl.textContent = proxy.name ? proxy.name : 'New forwarding';
  }
  const typeEl = entry.querySelector('[data-role="proxy-type"]');
  if (typeEl) {
    const type = (proxy.type || 'tcp').toUpperCase();
    typeEl.textContent = type;
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
  const typeFilter = state.ui.proxyTypeFilter;
  const filtered = state.config.proxies.filter((proxy) => {
    const values = Object.values(proxy || {}).join(' ').toLowerCase();
    const matchesSearch = filter ? values.includes(filter) : true;
    if (!matchesSearch) {
      return false;
    }
    if (typeFilter === 'all') {
      return true;
    }
    const proxyType = (proxy.type || 'tcp').toLowerCase();
    return proxyType === typeFilter;
  });

  state.ui.totalProxyCount = total;
  state.ui.visibleProxyCount = filtered.length;
  updateProxyFilterChips();

  filtered.forEach((proxy) => {
    const fragment = proxyTemplate.content.cloneNode(true);
    const entry = fragment.querySelector('.proxy-entry');
    const index = state.config.proxies.indexOf(proxy);
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
    if (removeBtn) {
      removeBtn.addEventListener('click', () => removeProxy(entry.dataset.index));
    }
    const duplicateBtn = fragment.querySelector('[data-action="duplicate"]');
    if (duplicateBtn) {
      duplicateBtn.addEventListener('click', () => duplicateProxy(entry.dataset.index));
    }

    updateProxyHeader(entry, proxy);
    proxiesContainer.appendChild(fragment);
  });

  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = total === 0 ? 'No forwardings defined yet. Use "Add forwarding" to create one.' : 'No forwardings match your filters yet.';
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
    updateProxyHeader(entry, state.config.proxies[index]);
    return;
  }
  const value = event.target.value;
  if (!value) {
    if (field === 'name' || field === 'type') {
      state.config.proxies[index][field] = value;
    } else {
      delete state.config.proxies[index][field];
    }
    updateProxyHeader(entry, state.config.proxies[index]);
    return;
  }
  if (event.target.type === 'number') {
    const numeric = Number(value);
    state.config.proxies[index][field] = Number.isFinite(numeric) ? numeric : value;
  } else {
    state.config.proxies[index][field] = value;
  }
  updateProxyHeader(entry, state.config.proxies[index]);
}

function removeProxy(index) {
  const idx = Number(index);
  if (Number.isNaN(idx)) {
    return;
  }
  state.config.proxies.splice(idx, 1);
  renderProxies();
  flash('Forwarding removed');
}

function duplicateProxy(index) {
  const idx = Number(index);
  if (Number.isNaN(idx) || !state.config.proxies[idx]) {
    return;
  }
  const original = state.config.proxies[idx];
  const clone = { ...original };
  const baseName = `${original.name || 'proxy'}-copy`;
  let newName = baseName;
  let counter = 1;
  const names = new Set(state.config.proxies.map((proxy) => proxy.name));
  while (names.has(newName)) {
    counter += 1;
    newName = `${baseName}-${counter}`;
  }
  clone.name = newName;
  state.config.proxies.splice(idx + 1, 0, clone);
  renderProxies();
  flash('Forwarding duplicated');
}

function addProxy() {
  if (!state.config) {
    state.config = { common: {}, proxies: [], preferences: {} };
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
    state.config = { common: {}, proxies: [], preferences: {} };
  }
  const common = {
    server_addr: serverAddrInput.value.trim(),
    server_port: serverPortInput.value ? Number(serverPortInput.value) : undefined,
    token: tokenInput.value.trim(),
    user: userInput.value.trim(),
    protocol: protocolSelect ? protocolSelect.value : undefined,
    admin_addr: adminAddrInput ? adminAddrInput.value.trim() : undefined,
    admin_port: adminPortInput && adminPortInput.value ? Number(adminPortInput.value) : undefined,
    log_file: logFileInput ? logFileInput.value.trim() : undefined,
    log_level: logLevelSelect ? logLevelSelect.value : undefined,
    log_max_days: logMaxDaysInput && logMaxDaysInput.value !== '' ? Number(logMaxDaysInput.value) : undefined,
    tls_server_name: tlsServerNameInput ? tlsServerNameInput.value.trim() : undefined,
    heartbeat_interval: heartbeatIntervalInput && heartbeatIntervalInput.value !== '' ? Number(heartbeatIntervalInput.value) : undefined,
    heartbeat_timeout: heartbeatTimeoutInput && heartbeatTimeoutInput.value !== '' ? Number(heartbeatTimeoutInput.value) : undefined
  };

  if (tlsEnableInput && tlsEnableInput.checked) {
    common.tls_enable = true;
  }
  if (loginFailExitInput && loginFailExitInput.checked) {
    common.login_fail_exit = true;
  }

  const cleanedCommon = Object.fromEntries(
    Object.entries(common).filter(([_, value]) => value !== undefined && value !== '')
  );

  const proxies = (state.config.proxies || [])
    .map((proxy) => ({ ...proxy }))
    .filter((proxy) => proxy.name && proxy.type);

  const preferences = {
    autoStart: autoStartPreferenceToggle ? autoStartPreferenceToggle.checked : undefined,
    autoRefresh: autoRefreshPreferenceToggle ? autoRefreshPreferenceToggle.checked : state.ui.autoRefresh,
    theme: document.body.dataset.theme || 'dark'
  };

  const cleanedPreferences = Object.fromEntries(
    Object.entries(preferences).filter(([_, value]) => value !== undefined)
  );

  const frpcPath = frpcPathInput ? frpcPathInput.value.trim() : state.config.frpcPath;

  return {
    frpcPath,
    common: cleanedCommon,
    proxies,
    preferences: cleanedPreferences
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
    state.config.proxies = Array.isArray(state.config.proxies) ? state.config.proxies : [];
    state.config.preferences = state.config.preferences || {};
    renderPreferences(true);
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
    state.ui.lastStatusAt = Date.now();
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
    const exitText = `code ${lastExit.code ?? 'null'}, signal ${lastExit.signal ?? 'null'}  ${formatTimestamp(lastExit.timestamp)}`;
    rows.push(`<div class="status-row"><span class="status-label">Last exit</span><span class="status-value muted">${exitText}</span></div>`);
  }
  if (lastError) {
    const errorText = `${lastError.message}  ${formatTimestamp(lastError.timestamp)}`;
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

function buildIniFromConfig(config) {
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
  return lines.join('\n') + '\n';
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

function buildTomlFromConfig(config) {
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
  return lines.join('\n') + '\n';
}

function downloadTextFile(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportConfig(format) {
  if (!state.config) {
    flash('Nothing to export yet');
    return;
  }
  const config = collectConfigFromForm();
  if (format === 'json') {
    downloadTextFile(`frpc-config-${Date.now()}.json`, JSON.stringify(config, null, 2), 'application/json');
    flash('Exported configuration JSON');
    return;
  }
  if (format === 'ini') {
    const ini = buildIniFromConfig(config);
    downloadTextFile(`frpc-config-${Date.now()}.ini`, ini, 'text/plain');
    flash('Exported INI configuration');
    return;
  }
  if (format === 'toml') {
    const toml = buildTomlFromConfig(config);
    downloadTextFile(`frpc-config-${Date.now()}.toml`, toml, 'text/plain');
    flash('Exported TOML configuration');
  }
}

async function copyConfigToClipboard() {
  if (!state.config) {
    flash('Nothing to copy yet');
    return;
  }
  try {
    const config = collectConfigFromForm();
    const text = JSON.stringify(config, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    flash('Configuration copied to clipboard');
  } catch (error) {
    alert(`Unable to copy configuration: ${error.message}`);
  }
}

async function importConfig(file) {
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid configuration file');
    }
    state.config = {
      frpcPath: data.frpcPath || '',
      common: data.common || {},
      proxies: Array.isArray(data.proxies) ? data.proxies : [],
      preferences: data.preferences || {}
    };
    state.ui.preferencesInitialized = false;
    renderPreferences(true);
    renderCommon();
    renderProxies();
    renderOverview();
    if (toolsHint) {
      toolsHint.textContent = 'Configuration loaded. Review the values and click "Save settings" to persist them.';
    }
    flash('Configuration imported');
  } catch (error) {
    alert(`Unable to import configuration: ${error.message}`);
  }
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

  if (overviewAutoStartEl) {
    const autoStartEnabled = !state.config || (state.config.preferences && state.config.preferences.autoStart !== false);
    overviewAutoStartEl.textContent = autoStartEnabled ? 'Enabled' : 'Disabled';
    overviewAutoStartEl.className = `metric-value badge ${autoStartEnabled ? 'success' : 'warning'}`;
  }

  if (overviewFrpcPathEl) {
    const configured = Boolean(state.config && state.config.frpcPath);
    overviewFrpcPathEl.textContent = configured ? 'Configured' : 'Missing';
    overviewFrpcPathEl.className = `metric-value badge ${configured ? 'success' : 'danger'}`;
  }

  if (overviewThemeEl) {
    const theme = document.body.dataset.theme || 'dark';
    const label = theme.charAt(0).toUpperCase() + theme.slice(1);
    overviewThemeEl.textContent = label;
    overviewThemeEl.className = 'metric-value badge muted';
  }

  if (overviewLastRefreshEl) {
    overviewLastRefreshEl.textContent = state.ui.lastStatusAt ? formatRelativeTime(state.ui.lastStatusAt) : '--';
  }
}

function flash(message) {
  const root = flashRoot || document.body;
  const div = document.createElement('div');
  div.className = 'flash';
  div.textContent = message;
  root.appendChild(div);
  requestAnimationFrame(() => {
    div.classList.add('show');
  });
  setTimeout(() => {
    div.classList.remove('show');
    setTimeout(() => div.remove(), 320);
  }, 2200);
}

function handleProxySearch(event) {
  state.ui.proxyFilter = event.target.value.toLowerCase();
  renderProxies();
}

function handleProxyFilterClick(event) {
  const value = event.currentTarget.dataset.proxyFilter || 'all';
  state.ui.proxyTypeFilter = value;
  renderProxies();
}

function resetProxyFilters() {
  state.ui.proxyFilter = '';
  state.ui.proxyTypeFilter = 'all';
  if (proxySearchInput) {
    proxySearchInput.value = '';
  }
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

function updatePreference(key, value) {
  if (!state.config) {
    return;
  }
  state.config.preferences = state.config.preferences || {};
  state.config.preferences[key] = value;
  renderOverview();
}

function init() {
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  if (proxySearchInput) {
    proxySearchInput.addEventListener('input', handleProxySearch);
  }
  proxyFilterButtons.forEach((button) => {
    button.addEventListener('click', handleProxyFilterClick);
  });
  if (resetProxyFiltersButton) {
    resetProxyFiltersButton.addEventListener('click', resetProxyFilters);
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
  if (autoStartPreferenceToggle) {
    autoStartPreferenceToggle.addEventListener('change', () => {
      updatePreference('autoStart', autoStartPreferenceToggle.checked);
    });
  }
  if (autoRefreshPreferenceToggle) {
    autoRefreshPreferenceToggle.addEventListener('change', () => {
      state.ui.autoRefresh = autoRefreshPreferenceToggle.checked;
      if (state.ui.autoRefresh) {
        refreshStatus();
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
      updateAutoRefreshButton();
    });
  }
  if (frpcPathInput) {
    frpcPathInput.addEventListener('input', () => {
      if (!state.config) {
        return;
      }
      state.config.frpcPath = frpcPathInput.value.trim();
      renderOverview();
    });
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
  if (importConfigInput) {
    importConfigInput.addEventListener('change', (event) => {
      const [file] = event.target.files || [];
      importConfig(file);
      importConfigInput.value = '';
    });
  }
  if (exportJsonButton) {
    exportJsonButton.addEventListener('click', () => exportConfig('json'));
  }
  if (exportIniButton) {
    exportIniButton.addEventListener('click', () => exportConfig('ini'));
  }
  if (exportTomlButton) {
    exportTomlButton.addEventListener('click', () => exportConfig('toml'));
  }
  if (copyConfigButton) {
    copyConfigButton.addEventListener('click', () => {
      copyConfigToClipboard();
    });
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
