let selectedVehicle = null;
let allVehicles = [];
let isOnMarketplace = false;
let templateSettings = {
  header: '',
  musts: '',
  footer: '',
  tone: 'professional',
  useEmojis: true
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadTemplateSettings();
  await checkCurrentTab();
  await checkAuth();
  setupEventListeners();
});

async function loadTemplateSettings() {
  const stored = await chrome.storage.sync.get(['templateSettings']);
  if (stored.templateSettings) {
    templateSettings = { ...templateSettings, ...stored.templateSettings };
    document.getElementById('template-header').value = templateSettings.header || '';
    document.getElementById('template-musts').value = templateSettings.musts || '';
    document.getElementById('template-footer').value = templateSettings.footer || '';
    document.getElementById('template-tone').value = templateSettings.tone || 'professional';
    document.getElementById('template-use-emojis').checked = templateSettings.useEmojis !== false;
  }
}

async function saveTemplateSettings() {
  templateSettings = {
    header: document.getElementById('template-header').value,
    musts: document.getElementById('template-musts').value,
    footer: document.getElementById('template-footer').value,
    tone: document.getElementById('template-tone').value,
    useEmojis: document.getElementById('template-use-emojis').checked
  };
  await chrome.storage.sync.set({ templateSettings });
  showToast('Template settings saved!');
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e293b;color:white;padding:10px 20px;border-radius:8px;font-size:13px;z-index:1000;';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    isOnMarketplace = tab?.url?.includes('facebook.com/marketplace/create');
  } catch (e) {
    console.error('Error checking tab:', e);
  }
}

async function checkAuth() {
  const response = await sendMessage({ action: 'getAuthToken' });
  
  if (response?.token && response?.user) {
    showMainView(response.user);
    loadVehicles();
  } else {
    showLoginView();
    const stored = await chrome.storage.sync.get(['apiBaseUrl']);
    if (stored.apiBaseUrl) {
      document.getElementById('server-url').value = stored.apiBaseUrl;
    }
  }
}

function showLoginView() {
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('main-view').style.display = 'none';
  document.getElementById('not-on-marketplace').style.display = 'none';
  document.getElementById('header-user').style.display = 'none';
}

function showMainView(user) {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('main-view').style.display = 'block';
  document.getElementById('not-on-marketplace').style.display = 'none';
  document.getElementById('header-user').style.display = 'flex';
  document.getElementById('header-user-name').textContent = user.firstName || user.email;
}

function setupEventListeners() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  let searchTimeout;
  document.getElementById('vehicle-search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => filterVehicles(e.target.value), 300);
  });

  document.getElementById('fill-form-btn').addEventListener('click', fillMarketplaceForm);
  document.getElementById('clear-selection-btn').addEventListener('click', clearSelection);
  
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  
  document.getElementById('save-template-btn').addEventListener('click', saveTemplateSettings);
  
  document.querySelectorAll('.ai-btn').forEach(btn => {
    btn.addEventListener('click', () => generateAIContent(btn.dataset.type));
  });
  
  document.getElementById('custom-ai-btn').addEventListener('click', generateCustomAIContent);
  document.getElementById('copy-ai-result').addEventListener('click', copyAIResult);
  document.getElementById('append-to-desc').addEventListener('click', appendToDescription);
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
  
  if (tabName === 'ai-tools' && selectedVehicle) {
    updateAIVehicleInfo();
  }
}

function updateAIVehicleInfo() {
  const infoEl = document.getElementById('ai-vehicle-info');
  const nameEl = document.getElementById('ai-vehicle-name');
  
  if (selectedVehicle) {
    nameEl.textContent = `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`;
    infoEl.style.display = 'block';
    document.querySelectorAll('.ai-btn').forEach(btn => btn.disabled = false);
  } else {
    infoEl.style.display = 'none';
    document.querySelectorAll('.ai-btn').forEach(btn => btn.disabled = true);
  }
}

async function generateAIContent(type) {
  if (!selectedVehicle) {
    showToast('Please select a vehicle first');
    return;
  }

  const prompts = {
    engine: 'Write 3-4 compelling bullet points about engine performance, horsepower, fuel economy, and driving dynamics',
    tech: 'Write 3-4 bullet points about technology features: infotainment, Apple CarPlay/Android Auto, displays, connectivity',
    safety: 'Write 3-4 bullet points about safety features: driver assists, airbags, blind spot monitoring, collision avoidance',
    comfort: 'Write 3-4 bullet points about comfort features: heated/ventilated seats, climate control, sunroof, interior luxury',
    history: 'Write 2-3 sentences summarizing the vehicle history: Carfax status, ownership, service records, accidents',
    value: 'Write 2-3 sentences explaining why this vehicle is a great value for buyers'
  };

  const btn = document.querySelector(`.ai-btn[data-type="${type}"]`);
  btn.classList.add('generating');
  btn.disabled = true;

  try {
    const response = await sendMessage({
      action: 'generateAIContent',
      vehicleId: selectedVehicle.id,
      prompt: prompts[type],
      type: type,
      tone: templateSettings.tone,
      useEmojis: templateSettings.useEmojis
    });

    if (response.success && response.content) {
      showAIResult(response.content);
    } else {
      showToast(response.error || 'Failed to generate content');
    }
  } catch (error) {
    showToast('Error generating content');
    console.error(error);
  } finally {
    btn.classList.remove('generating');
    btn.disabled = false;
  }
}

async function generateCustomAIContent() {
  const prompt = document.getElementById('custom-ai-prompt').value.trim();
  if (!prompt) {
    showToast('Please enter a custom prompt');
    return;
  }
  
  if (!selectedVehicle) {
    showToast('Please select a vehicle first');
    return;
  }

  const btn = document.getElementById('custom-ai-btn');
  btn.classList.add('generating');
  btn.disabled = true;
  btn.textContent = 'Generating...';

  try {
    const response = await sendMessage({
      action: 'generateAIContent',
      vehicleId: selectedVehicle.id,
      prompt: prompt,
      type: 'custom',
      tone: templateSettings.tone,
      useEmojis: templateSettings.useEmojis
    });

    if (response.success && response.content) {
      showAIResult(response.content);
    } else {
      showToast(response.error || 'Failed to generate content');
    }
  } catch (error) {
    showToast('Error generating content');
    console.error(error);
  } finally {
    btn.classList.remove('generating');
    btn.disabled = false;
    btn.textContent = 'Generate Custom Content';
  }
}

function showAIResult(content) {
  const resultEl = document.getElementById('ai-result');
  const textEl = document.getElementById('ai-result-text');
  textEl.value = content;
  resultEl.style.display = 'block';
  resultEl.scrollIntoView({ behavior: 'smooth' });
}

function copyAIResult() {
  const text = document.getElementById('ai-result-text').value;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!');
  });
}

function appendToDescription() {
  const aiText = document.getElementById('ai-result-text').value;
  const descEl = document.getElementById('description-preview');
  if (descEl) {
    descEl.value = (descEl.value ? descEl.value + '\n\n' : '') + aiText;
  }
  showToast('Added to description!');
  switchTab('inventory');
}

async function handleLogin(e) {
  e.preventDefault();
  
  const serverUrl = document.getElementById('server-url').value.replace(/\/$/, '');
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  
  errorEl.classList.remove('show');
  btn.disabled = true;
  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-loading').style.display = 'inline';

  try {
    const response = await sendMessage({ action: 'login', email, password, serverUrl });
    
    if (response.success) {
      showMainView(response.user);
      loadVehicles();
    } else {
      errorEl.textContent = response.error || 'Login failed';
      errorEl.classList.add('show');
    }
  } catch (error) {
    errorEl.textContent = error.message || 'Login failed';
    errorEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').style.display = 'inline';
    btn.querySelector('.btn-loading').style.display = 'none';
  }
}

async function handleLogout() {
  await sendMessage({ action: 'logout' });
  showLoginView();
  selectedVehicle = null;
  allVehicles = [];
}

async function loadVehicles() {
  const listEl = document.getElementById('vehicle-list');
  listEl.innerHTML = '<div class="loading">Loading vehicles...</div>';

  try {
    const response = await sendMessage({ action: 'fetchVehicles' });
    
    if (response.success) {
      allVehicles = response.vehicles;
      renderVehicleList(allVehicles);
    } else {
      listEl.innerHTML = `<div class="empty-state">${response.error || 'Failed to load vehicles'}</div>`;
    }
  } catch (error) {
    listEl.innerHTML = `<div class="empty-state">${error.message || 'Failed to load vehicles'}</div>`;
  }
}

function filterVehicles(query) {
  if (!query.trim()) {
    renderVehicleList(allVehicles);
    return;
  }

  const lowerQuery = query.toLowerCase();
  const filtered = allVehicles.filter(v => {
    const title = `${v.year} ${v.make} ${v.model}`.toLowerCase();
    const stockNum = (v.stockNumber || '').toLowerCase();
    const vin = (v.vin || '').toLowerCase();
    return title.includes(lowerQuery) || stockNum.includes(lowerQuery) || vin.includes(lowerQuery);
  });
  
  renderVehicleList(filtered);
}

function renderVehicleList(vehicles) {
  const listEl = document.getElementById('vehicle-list');
  
  if (vehicles.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No vehicles found</div>';
    return;
  }

  listEl.innerHTML = vehicles.map(v => {
    const title = `${v.year} ${v.make} ${v.model}`;
    const price = v.price ? `$${v.price.toLocaleString()}` : 'Price TBD';
    const image = v.images?.[0] || v.imageUrl || '';
    const isSelected = selectedVehicle?.id === v.id;
    const postedLabel = v.postedToMarketplace ? 
      '<span class="vehicle-item-posted">Posted</span>' : '';

    return `
      <div class="vehicle-item ${isSelected ? 'selected' : ''}" data-id="${v.id}">
        <img src="${image}" alt="${title}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 75%22><rect fill=%22%23e2e8f0%22 width=%22100%22 height=%2275%22/><text x=%2250%22 y=%2240%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-size=%2212%22>No Image</text></svg>'">
        <div class="vehicle-item-info">
          <div class="vehicle-item-title">${title}</div>
          <div class="vehicle-item-details">
            <span>${v.odometer ? v.odometer.toLocaleString() + ' km' : ''}</span>
            <span>${v.stockNumber || ''}</span>
          </div>
          <div class="vehicle-item-price">${price}</div>
          ${postedLabel}
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.vehicle-item').forEach(item => {
    item.addEventListener('click', () => selectVehicle(parseInt(item.dataset.id)));
  });
}

function selectVehicle(vehicleId) {
  selectedVehicle = allVehicles.find(v => v.id === vehicleId);
  
  if (!selectedVehicle) return;

  document.querySelectorAll('.vehicle-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.id) === vehicleId);
  });

  const previewEl = document.getElementById('selected-vehicle');
  const title = `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`;
  const price = selectedVehicle.price ? `$${selectedVehicle.price.toLocaleString()}` : 'Price TBD';
  const image = selectedVehicle.images?.[0] || selectedVehicle.imageUrl || '';

  document.getElementById('preview-image').src = image;
  document.getElementById('preview-title').textContent = title;
  document.getElementById('preview-price').textContent = price;
  document.getElementById('description-preview').value = selectedVehicle.description || '';
  previewEl.style.display = 'block';
  
  updateAIVehicleInfo();
}

function clearSelection() {
  selectedVehicle = null;
  document.querySelectorAll('.vehicle-item').forEach(el => {
    el.classList.remove('selected');
  });
  document.getElementById('selected-vehicle').style.display = 'none';
  document.getElementById('ai-result').style.display = 'none';
  updateAIVehicleInfo();
}

async function fillMarketplaceForm() {
  if (!selectedVehicle) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab?.url?.includes('facebook.com/marketplace')) {
    if (confirm('You need to be on Facebook Marketplace to fill the form. Open Marketplace now?')) {
      chrome.tabs.create({ url: 'https://www.facebook.com/marketplace/create/vehicle' });
    }
    return;
  }

  let finalDescription = selectedVehicle.description || '';
  
  if (templateSettings.header) {
    finalDescription = templateSettings.header + '\n\n' + finalDescription;
  }
  if (templateSettings.footer) {
    finalDescription = finalDescription + '\n\n' + templateSettings.footer;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: 'fillForm',
      vehicle: { ...selectedVehicle, description: finalDescription }
    });

    await sendMessage({
      action: 'markAsPosted',
      vehicleId: selectedVehicle.id,
      platform: 'facebook_marketplace'
    });

    window.close();
  } catch (error) {
    console.error('Error filling form:', error);
    alert('Error filling form. Make sure you are on the Facebook Marketplace listing page.');
  }
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}
