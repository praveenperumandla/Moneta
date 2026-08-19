(() => {
  const devices = {
    'iphone-se': { label: 'iPhone SE', width: 375, height: 667, radius: 38, sat: 20, sab: 0, island: false },
    'iphone-13': { label: 'iPhone 13', width: 390, height: 844, radius: 54, sat: 47, sab: 34, island: false },
    'iphone-16-pro': { label: 'iPhone 16 Pro', width: 402, height: 874, radius: 56, sat: 59, sab: 34, island: true },
    'ipad-mini': { label: 'iPad Mini', width: 744, height: 1133, radius: 24, sat: 24, sab: 20, island: false }
  };
  const fallbackVersion = 'v5.6.3';
  const preferencesKey = 'moneta_developer_preferences';
  const root = document.documentElement;
  const deviceSelect = document.getElementById('device-select');
  const stage = document.getElementById('device-stage');
  const previewFrame = document.getElementById('app-preview');
  const deviceInfo = document.getElementById('info-device');
  const resolutionInfo = document.getElementById('info-resolution');
  const scaleInfo = document.getElementById('info-scale');
  const windowInfo = document.getElementById('info-window');
  const browserInfo = document.getElementById('info-browser');
  const pwaInfo = document.getElementById('info-pwa');
  const versionInfo = document.getElementById('info-version');
  const toolbarVersion = document.getElementById('toolbar-version');
  const satInfo = document.getElementById('info-sat');
  const sabInfo = document.getElementById('info-sab');
  const insetInfo = document.getElementById('info-inset');
  const savedPreferences = (() => {
    try { return JSON.parse(localStorage.getItem(preferencesKey)) || {}; } catch { return {}; }
  })();
  let selectedScale = ['fit', 0.5, 0.75, 1, 1.2].includes(savedPreferences.scale) ? savedPreferences.scale : 1.2;
  let selectedDevice = devices[savedPreferences.device] || devices[deviceSelect.value];
  let displayMode = savedPreferences.mode === 'bare' ? 'bare' : 'pwa';
  let insetMode = ['device', '34', '48', '64', '80'].includes(String(savedPreferences.inset))
    ? String(savedPreferences.inset)
    : '64';

  const setPressed = (selector, value, attribute) => {
    document.querySelectorAll(selector).forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset[attribute] === String(value)));
    });
  };
  const savePreferences = () => {
    try {
      localStorage.setItem(preferencesKey, JSON.stringify({
        device: deviceSelect.value,
        scale: selectedScale,
        mode: displayMode,
        inset: insetMode
      }));
    } catch { /* Storage is optional. */ }
  };
  const fitScale = () => {
    const availableWidth = Math.max(0, stage.clientWidth - 92);
    const availableHeight = Math.max(0, stage.clientHeight - 92);
    return Math.min(1.2, availableWidth / (selectedDevice.width + 24), availableHeight / (selectedDevice.height + 24));
  };
  const updateScale = () => {
    const scale = selectedScale === 'fit' ? fitScale() : selectedScale;
    root.style.setProperty('--preview-scale', Math.max(0.1, scale).toFixed(3));
    scaleInfo.textContent = selectedScale === 'fit' ? `Fit (${Math.round(scale * 100)}%)` : `${Math.round(scale * 100)}%`;
  };
  const getBrowserName = () => {
    const userAgent = navigator.userAgent;
    if (/Edg\//.test(userAgent)) return 'Microsoft Edge';
    if (/OPR\//.test(userAgent)) return 'Opera';
    if (/Firefox\//.test(userAgent)) return 'Firefox';
    if (/Chrome\//.test(userAgent)) return 'Google Chrome';
    if (/Safari\//.test(userAgent)) return 'Safari';
    return 'Unknown';
  };
  const updateInfo = () => {
    deviceInfo.textContent = selectedDevice.label;
    resolutionInfo.textContent = `${selectedDevice.width} × ${selectedDevice.height}`;
    windowInfo.textContent = `${window.innerWidth} × ${window.innerHeight}`;
    browserInfo.textContent = getBrowserName();
    if (displayMode === 'pwa') {
      satInfo.textContent = `${selectedDevice.sat}px`;
      sabInfo.textContent = `${selectedDevice.sab}px`;
      insetInfo.textContent = `${webviewInset()}px stolen`;
    } else {
      satInfo.textContent = '0 (bare)';
      sabInfo.textContent = '0 (bare)';
      insetInfo.textContent = '0 (bare)';
    }
  };
  const updatePwaStatus = async () => {
    if (!('serviceWorker' in navigator)) { pwaInfo.textContent = 'Not Registered'; return; }
    try { pwaInfo.textContent = (await navigator.serviceWorker.getRegistration()) ? 'Registered' : 'Not Registered'; }
    catch { pwaInfo.textContent = 'Not Registered'; }
  };
  const webviewInset = () => {
    if (displayMode === 'bare') return 0;
    if (insetMode === 'device') return selectedDevice.sab;
    return Number(insetMode) || 0;
  };
  const previewSrc = () => {
    if (displayMode === 'bare') return 'index.html?preview=bare';
    return `index.html?pwa-preview=1&sat=${selectedDevice.sat}&sab=${selectedDevice.sab}`;
  };
  const loadPreview = () => {
    if (!previewFrame) return;
    const next = previewSrc();
    const current = previewFrame.getAttribute('src') || '';
    if (current !== next) previewFrame.src = next;
  };
  const setDevice = (deviceId) => {
    selectedDevice = devices[deviceId];
    root.style.setProperty('--device-width', `${selectedDevice.width}px`);
    root.style.setProperty('--device-height', `${selectedDevice.height}px`);
    root.style.setProperty('--device-radius', `${selectedDevice.radius}px`);
    root.style.setProperty('--pwa-sab', `${webviewInset()}px`);
    root.classList.toggle('has-island', !!selectedDevice.island);
    root.classList.toggle('mode-bare', displayMode === 'bare');
    updateScale();
    updateInfo();
    loadPreview();
    savePreferences();
  };

  deviceSelect.value = devices[savedPreferences.device] ? savedPreferences.device : deviceSelect.value;
  deviceSelect.addEventListener('change', (event) => setDevice(event.target.value));
  document.querySelectorAll('[data-scale]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedScale = button.dataset.scale === 'fit' ? 'fit' : Number(button.dataset.scale);
      setPressed('[data-scale]', selectedScale, 'scale');
      updateScale();
      savePreferences();
    });
  });
  document.querySelectorAll('[data-inset]').forEach((button) => {
    button.addEventListener('click', () => {
      insetMode = button.dataset.inset;
      setPressed('[data-inset]', insetMode, 'inset');
      setDevice(deviceSelect.value);
    });
  });
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      displayMode = button.dataset.mode;
      setPressed('[data-mode]', displayMode, 'mode');
      setDevice(deviceSelect.value);
    });
  });
  window.addEventListener('resize', () => { updateScale(); updateInfo(); });

  const loadVersion = async () => {
    try {
      const response = await fetch('VERSION', { cache: 'no-store' });
      if (response.ok) {
        const text = (await response.text()).trim();
        if (text) return text;
      }
    } catch {}
    return fallbackVersion;
  };

  loadVersion().then((displayVersion) => {
    versionInfo.textContent = displayVersion;
    toolbarVersion.textContent = `Moneta ${displayVersion}`;
  });

  setPressed('[data-scale]', selectedScale, 'scale');
  setPressed('[data-mode]', displayMode, 'mode');
  setPressed('[data-inset]', insetMode, 'inset');
  setDevice(deviceSelect.value);
  updatePwaStatus();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', updatePwaStatus);
    navigator.serviceWorker.ready.then(updatePwaStatus).catch(() => {});
  }
  if (previewFrame) {
    previewFrame.addEventListener('load', () => setTimeout(updatePwaStatus, 400));
  }
})();
