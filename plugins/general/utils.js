// Implementation note.

// Create the required object.
export function createFormGroup(label, input) {
    const div = document.createElement('div');
    div.className = 'form-group';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    if (input.id) {
        labelEl.setAttribute('for', input.id);
    }
    
    div.appendChild(labelEl);
    div.appendChild(input);
    
    return div;
}

// Create the required object.
export function createRangeInput(config) {
    const { id, min = 0, max = 100, step = 1, value = 50, onChange, label } = config;
    
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '10px';
    container.style.alignItems = 'center';
    
    const input = document.createElement('input');
    input.type = 'range';
    input.id = id;
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    
    // Add the required entry.
    if (label) {
        input.setAttribute('aria-label', label);
    } else {
        input.setAttribute('aria-label', `调整数值从 ${min} 到 ${max}`);
    }
    input.setAttribute('title', `当前值: ${value}, 范围: ${min}-${max}`);
    
    const valueSpan = document.createElement('span');
    valueSpan.id = `${id}-value`;
    valueSpan.textContent = value;
    valueSpan.setAttribute('aria-live', 'polite');
    
    input.addEventListener('input', (e) => {
        const newValue = e.target.value;
        valueSpan.textContent = newValue;
        input.setAttribute('title', `当前值: ${newValue}, 范围: ${min}-${max}`);
        if (onChange) onChange(newValue);
    });
    
    container.appendChild(input);
    container.appendChild(valueSpan);
    
    return container;
}

// Create the required object.
export function createControlSection(title, icon = '') {
    const section = document.createElement('div');
    section.className = 'control-section';
    
    const heading = document.createElement('h3');
    heading.innerHTML = `${icon} ${title}`;
    
    section.appendChild(heading);
    
    return section;
}

// Create the required object.
export function createButtonGroup(buttons) {
    const group = document.createElement('div');
    group.className = 'btn-group';
    
    buttons.forEach(btnConfig => {
        const button = document.createElement('button');
        button.className = btnConfig.primary ? 'btn btn-primary' : 'btn';
        button.id = btnConfig.id || '';
        button.innerHTML = `${btnConfig.icon || ''} ${btnConfig.text}`;
        
        if (btnConfig.onClick) {
            button.addEventListener('click', btnConfig.onClick);
        }
        
        group.appendChild(button);
    });
    
    return group;
}

// Get the required value.
function getBackendPort() {
    // Get the required value (URL).
    const urlParams = new URLSearchParams(window.location.search);
    const backendParam = urlParams.get('backend');
    if (backendParam) {
        return parseInt(backendParam);
    }
    
    // Handle the conditional case.
    const currentPort = parseInt(window.location.port) || 8080;
    return currentPort === 8084 ? 8082 : (currentPort === 8080 ? 8081 : currentPort + 1);
}

// Implementation note.
export async function sendToBackend(endpoint, data) {
    const backendPort = getBackendPort();
    
    try {
        const response = await fetch(`http://localhost:${backendPort}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`后端通信错误 (端口 ${backendPort}):`, error);
        throw error;
    }
}