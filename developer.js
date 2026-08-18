(() => {
  const devices = {
    'iphone-se': { label: 'iPhone SE', width: 375, height: 667, radius: 38 },
    'iphone-13': { label: 'iPhone 13', width: 390, height: 844, radius: 54 },
    'iphone-16-pro': { label: 'iPhone 16 Pro', width: 402, height: 874, radius: 56 },
    'ipad-mini': { label: 'iPad Mini', width: 744, height: 1133, radius: 24 }
  };
  const fallbackVersion = 'v5.4.6';
  const preferencesKey = 'moneta_developer_preferences';
  const root = document.documentElement;
  const deviceSelect = document.getElementById('device-select');
  const stage = document.getElementById('device-stage');
  const deviceInfo = document.getElementById('info-device');
  const resolutionInfo = document.getElementById('info-resolution');
  const scaleInfo = document.getElementById('info-scale');
  const orientationInfo = document.getElementById('info-orientation');
  const windowInfo = document.getElementById('info-window');
  const browserInfo = document.getElementById('info-browser');
  const pwaInfo = document.getElementById('info-pwa');
  const versionInfo = document.getElementById('info-version');
  const toolbarVersion = document.getElementById('toolbar-version');
  const savedPreferences = (() => {
    try { return JSON.parse(localStorage.getItem(preferencesKey)) || {}; } catch { return {}; }
  })();
  let selectedScale = ['fit', 0.5, 0.75, 1, 1.2].includes(savedPreferences.scale) ? savedPreferences.scale : 1.2;
  let selectedDevice = devices[savedPreferences.device] || devices[deviceSelect.value];

  const setPressed = (selector, value, attribute) => {
    document.querySelectorAll(selector).forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset[attribute] === String(value)));
    });
  };
  const savePreferences = () => {
    try { localStorage.setItem(preferencesKey, JSON.stringify({ device: deviceSelect.value, scale: selectedScale })); } catch { /* Storage is optional. */ }
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
    resolutionInfo.textContent = `${window.screen.width} × ${window.screen.height}`;
    orientationInfo.textContent = window.screen.orientation?.type
      ? window.screen.orientation.type.replace('-', ' ')
      : (window.innerWidth > window.innerHeight ? 'Landscape' : 'Portrait');
    windowInfo.textContent = `${window.innerWidth} × ${window.innerHeight}`;
    browserInfo.textContent = getBrowserName();
  };
  const updatePwaStatus = async () => {
    if (!('serviceWorker' in navigator)) { pwaInfo.textContent = 'Not Registered'; return; }
    try { pwaInfo.textContent = (await navigator.serviceWorker.getRegistration()) ? 'Registered' : 'Not Registered'; }
    catch { pwaInfo.textContent = 'Not Registered'; }
  };
  const setDevice = (deviceId) => {
    selectedDevice = devices[deviceId];
    root.style.setProperty('--device-width', `${selectedDevice.width}px`);
    root.style.setProperty('--device-height', `${selectedDevice.height}px`);
    root.style.setProperty('--device-radius', `${selectedDevice.radius}px`);
    updateScale();
    updateInfo();
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
  window.addEventListener('resize', () => { updateScale(); updateInfo(); });

  const loadVersion = async () => {
    try {
      const response = await fetch('VERSION', { cache: 'no-store' });
      if (response.ok) {
        const text = (await response.text()).trim();
        if (text) return text;
      }
    } catch {}
    try {
      const response = await fetch('index.html', { cache: 'no-store' });
      if (response.ok) {
        const html = await response.text();
        const match = html.match(/settings-row__meta[^>]*>(v[0-9]+\.[0-9]+\.[0-9]+)</);
        if (match && match[1]) return match[1];
      }
    } catch {}
    return fallbackVersion;
  };

  loadVersion().then((displayVersion) => {
    versionInfo.textContent = displayVersion;
    toolbarVersion.textContent = `Moneta ${displayVersion}`;
  });

  setPressed('[data-scale]', selectedScale, 'scale');
  setDevice(deviceSelect.value);
  updatePwaStatus();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', updatePwaStatus);
    navigator.serviceWorker.ready.then(updatePwaStatus).catch(() => {});
  }
  const previewFrame = document.querySelector('iframe');
  if (previewFrame) {
    previewFrame.addEventListener('load', () => setTimeout(updatePwaStatus, 400));
  }
})();