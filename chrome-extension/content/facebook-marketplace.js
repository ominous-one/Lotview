console.log('Lotview Auto Poster content script loaded');

let pendingVehicle = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fillForm') {
    fillMarketplaceForm(request.vehicle);
    sendResponse({ success: true });
  }
  return true;
});

async function fillMarketplaceForm(vehicle) {
  console.log('Filling form with vehicle:', vehicle);
  
  showNotification('Filling form...', 'info');

  await waitForPageLoad();

  try {
    const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    await fillField('[aria-label="Title"]', title);
    await fillField('input[placeholder="Title"]', title);

    if (vehicle.price) {
      await fillField('[aria-label="Price"]', vehicle.price.toString());
      await fillField('input[placeholder="Price"]', vehicle.price.toString());
    }

    if (vehicle.year) {
      await selectDropdown('Year', vehicle.year.toString());
    }

    if (vehicle.make) {
      await selectDropdown('Make', vehicle.make);
    }

    if (vehicle.model) {
      await selectDropdown('Model', vehicle.model);
    }

    // Handle mileage (may come as 'mileage' or 'odometer')
    const mileageValue = vehicle.mileage || vehicle.odometer;
    if (mileageValue) {
      await fillField('[aria-label="Mileage"]', mileageValue.toString());
      await fillField('[aria-label="Vehicle mileage"]', mileageValue.toString());
    }

    // Optional fields - fill only if available
    if (vehicle.transmission) {
      const transmissionType = vehicle.transmission.toLowerCase().includes('auto') ? 
        'Automatic transmission' : 'Manual transmission';
      await selectDropdown('Transmission', transmissionType);
    }

    if (vehicle.fuelType) {
      await selectDropdown('Fuel type', vehicle.fuelType);
    }

    // Use 'type' field for body style if available
    if (vehicle.bodyStyle || vehicle.type) {
      await selectDropdown('Body style', vehicle.bodyStyle || vehicle.type);
    }

    if (vehicle.exteriorColor) {
      await selectDropdown('Exterior color', vehicle.exteriorColor);
    }

    if (vehicle.interiorColor) {
      await selectDropdown('Interior color', vehicle.interiorColor);
    }

    const description = generateDescription(vehicle);
    await fillDescription(description);

    if (vehicle.images && vehicle.images.length > 0) {
      await uploadImages(vehicle.images);
    }

    showNotification('Form filled successfully! Review and click Publish.', 'success');

  } catch (error) {
    console.error('Error filling form:', error);
    showNotification('Some fields could not be filled. Please complete manually.', 'warning');
  }
}

async function waitForPageLoad() {
  return new Promise(resolve => {
    if (document.readyState === 'complete') {
      setTimeout(resolve, 1000);
    } else {
      window.addEventListener('load', () => setTimeout(resolve, 1000));
    }
  });
}

async function fillField(selector, value) {
  const input = document.querySelector(selector);
  if (!input) {
    console.log(`Field not found: ${selector}`);
    return false;
  }

  input.focus();
  input.value = value;
  
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  await sleep(100);
  return true;
}

async function selectDropdown(label, value) {
  const labelEls = Array.from(document.querySelectorAll('label, span'));
  const labelEl = labelEls.find(el => 
    el.textContent.trim().toLowerCase().includes(label.toLowerCase())
  );

  if (!labelEl) {
    console.log(`Dropdown label not found: ${label}`);
    return false;
  }

  const container = labelEl.closest('[role="listitem"]') || 
                    labelEl.closest('[role="group"]') || 
                    labelEl.parentElement?.parentElement;
  
  if (!container) {
    console.log(`Dropdown container not found for: ${label}`);
    return false;
  }

  const dropdown = container.querySelector('[role="combobox"], [role="button"], select');
  if (dropdown) {
    dropdown.click();
    await sleep(300);

    const options = document.querySelectorAll('[role="option"], [role="menuitem"]');
    const option = Array.from(options).find(opt => 
      opt.textContent.toLowerCase().includes(value.toLowerCase())
    );

    if (option) {
      option.click();
      await sleep(200);
      return true;
    }
  }

  console.log(`Could not select value "${value}" for dropdown "${label}"`);
  return false;
}

async function fillDescription(description) {
  const descInputs = document.querySelectorAll(
    '[aria-label="Description"], ' +
    '[aria-label="Describe your item"], ' +
    'textarea[placeholder*="escription"], ' +
    '[contenteditable="true"]'
  );

  for (const input of descInputs) {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.focus();
      input.value = description;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(100);
      return true;
    } else if (input.contentEditable === 'true') {
      input.focus();
      input.innerHTML = description.replace(/\n/g, '<br>');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(100);
      return true;
    }
  }

  console.log('Description field not found');
  return false;
}

function generateDescription(vehicle) {
  const parts = [];
  
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  parts.push(title);
  parts.push('');

  if (vehicle.trim) {
    parts.push(`Trim: ${vehicle.trim}`);
  }

  // Handle mileage (may come as 'mileage' or 'odometer')
  const mileageValue = vehicle.mileage || vehicle.odometer;
  if (mileageValue) {
    parts.push(`Mileage: ${mileageValue.toLocaleString()} km`);
  }

  // Use 'type' for vehicle type/body style
  if (vehicle.type) {
    parts.push(`Type: ${vehicle.type}`);
  }

  // Optional fields - only include if available
  if (vehicle.transmission) {
    parts.push(`Transmission: ${vehicle.transmission}`);
  }

  if (vehicle.fuelType) {
    parts.push(`Fuel Type: ${vehicle.fuelType}`);
  }

  if (vehicle.drivetrain) {
    parts.push(`Drivetrain: ${vehicle.drivetrain}`);
  }

  if (vehicle.engine) {
    parts.push(`Engine: ${vehicle.engine}`);
  }

  if (vehicle.exteriorColor) {
    parts.push(`Exterior: ${vehicle.exteriorColor}`);
  }

  if (vehicle.interiorColor) {
    parts.push(`Interior: ${vehicle.interiorColor}`);
  }

  if (vehicle.vin) {
    parts.push('');
    parts.push(`VIN: ${vehicle.vin}`);
  }

  if (vehicle.stockNumber) {
    parts.push(`Stock #: ${vehicle.stockNumber}`);
  }

  parts.push('');
  parts.push('Contact us for more information or to schedule a test drive!');

  if (vehicle.carfaxUrl) {
    parts.push('');
    parts.push(`Carfax Report: ${vehicle.carfaxUrl}`);
  }

  return parts.join('\n');
}

async function uploadImages(imageUrls) {
  const fileInput = document.querySelector('input[type="file"][accept*="image"]');
  
  if (!fileInput) {
    console.log('Image upload input not found');
    showNotification('Please add images manually', 'info');
    return false;
  }

  showNotification('Downloading images...', 'info');

  try {
    const files = [];
    
    for (const url of imageUrls.slice(0, 10)) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const filename = `vehicle-image-${Date.now()}.jpg`;
        const file = new File([blob], filename, { type: 'image/jpeg' });
        files.push(file);
      } catch (e) {
        console.log('Failed to download image:', url);
      }
    }

    if (files.length > 0) {
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      showNotification(`Uploaded ${files.length} images`, 'success');
      return true;
    }
  } catch (error) {
    console.error('Error uploading images:', error);
  }

  return false;
}

function showNotification(message, type = 'info') {
  const existingNotif = document.getElementById('lotview-notification');
  if (existingNotif) {
    existingNotif.remove();
  }

  const colors = {
    info: { bg: '#3b82f6', text: '#fff' },
    success: { bg: '#10b981', text: '#fff' },
    warning: { bg: '#f59e0b', text: '#fff' },
    error: { bg: '#ef4444', text: '#fff' }
  };

  const color = colors[type] || colors.info;

  const notif = document.createElement('div');
  notif.id = 'lotview-notification';
  notif.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${color.bg};
      color: ${color.text};
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: slideIn 0.3s ease;
    ">
      <span style="font-size: 16px;">
        ${type === 'success' ? '✓' : type === 'warning' ? '⚠' : type === 'error' ? '✕' : 'ℹ'}
      </span>
      ${message}
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  notif.appendChild(style);

  document.body.appendChild(notif);

  setTimeout(() => notif.remove(), 5000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
