// Manage the plugin state (ControlWave).
import { pluginLoader } from './plugin-loader.js';
import viserManager from './general/viser-manager.js';

// Handle the current operation (plugin-loader, scanLocalPlugins).
const PLUGIN_CONFIG = [];

// Initialize the required state.
async function initializePluginSystem() {
    console.log('🔧 初始化插件系统...');
    
    // Initialize the required state (Viser).
    console.log('📋 使用简化的 Viser 管理器，将在需要时初始化');
    
    // Scan the available resources.
    const localPlugins = await pluginLoader.scanLocalPlugins();
    for (const plugin of localPlugins) {
        if (!plugin.installed) continue;
        await pluginLoader.registerPlugin({
            id: plugin.id,
            name: plugin.name,
            path: plugin.path,
            icon: plugin.icon,
            order: plugin.order || 999
        });
    }
    
    // Create the required object.
    const tabsContainer = document.querySelector('.tabs-container');
    pluginLoader.createPluginTabs(tabsContainer);
    
    // Configure the required value.
    setupTabSwitching();
    
    // Load the required resource.
    const firstVisibleTab = document.querySelector('.tab-button.draggable');
    if (firstVisibleTab) {
        const pluginId = firstVisibleTab.dataset.tab;
        await loadPlugin(pluginId);
    } else {
        // Display the relevant element.
        const pluginMgmtTab = document.querySelector('[data-tab="plugin-management"]');
        if (pluginMgmtTab) {
            pluginMgmtTab.click();
        }
    }
    
    // Update the current state.
    await updatePluginManagement();
    
    // Register the event listener.
    setupGlobalMessageHandling();
    
    console.log('✅ 插件系统初始化完成');
}

// Configure the required value.
function setupTabSwitching() {
    // Implementation note.
    const tabsContainer = document.querySelector('.tabs-container');
    
    tabsContainer.addEventListener('click', async (e) => {
        // Validate the current state.
        const button = e.target.closest('.tab-button');
        if (!button) return;
        
        e.preventDefault();
        const targetTab = button.dataset.tab;
        
        // Update the current state.
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');
        
        // Hide the inactive element.
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
        });
        
        // Handle the conditional case.
        if (targetTab === 'plugin-management') {
            // Display the relevant element.
            const pluginMgmt = document.getElementById('plugin-management');
            pluginMgmt.classList.add('active');
            pluginMgmt.style.display = 'flex';
            // Hide the inactive element (Viser, iframe, D).
            viserManager.hideIframe();
        } else {
            // Hide the inactive element.
            const pluginMgmt = document.getElementById('plugin-management');
            pluginMgmt.classList.remove('active');
            pluginMgmt.style.display = 'none';
            
            // Load the required resource.
            await loadPlugin(targetTab);
            
            // Validate the current state (Viser).
            const plugin = pluginLoader.getPlugin(targetTab);
            const pluginInstance = plugin?.instance;
            const needsViser = pluginInstance?.needsViser === true;
            
            console.log(`🔍 插件 ${targetTab} 可视化需求检查:`, {
                hasPlugin: !!plugin,
                hasInstance: !!pluginInstance,
                needsViser: needsViser,
                rawNeedsViser: pluginInstance?.needsViser
            });
            
            if (needsViser) {
                // Manage the plugin state (Viser).
                console.log(`🔄 切换Viser到插件: ${targetTab}`);
                const pluginContainer = document.getElementById(targetTab);
                const targetContainer = pluginContainer?.querySelector('.visualization-content');
                const loadingElement = pluginContainer?.querySelector('[id*="loading"]');
                
                console.log(`🔍 选项卡切换 - 插件 ${targetTab} 容器状态:`, {
                    pluginContainer: !!pluginContainer,
                    targetContainer: !!targetContainer,
                    loadingElement: !!loadingElement,
                    needsViser: true
                });
                
                if (targetContainer) {
                    try {
                        await viserManager.attachToPlugin(targetTab, targetContainer, loadingElement);
                        
                        // Switch to the selected state.
                        if (window.controlWaveWebSocket && window.controlWaveWebSocket.isConnected) {
                            console.log(`📡 通知后端切换到插件: ${targetTab}`);
                            window.controlWaveWebSocket.send({
                                type: 'plugin_message',
                                plugin: 'viser_backend',
                                action: 'switch_plugin',
                                data: { plugin_id: targetTab }
                            });
                        }
                    } catch (error) {
                        console.error(`❌ 选项卡切换时附加Viser失败:`, error);
                    }
                } else {
                    console.warn(`⚠️ 选项卡切换 - 插件 ${targetTab} 没有可视化容器`);
                }
            } else {
                // Hide the inactive element (Viser).
                console.log(`📝 插件 ${targetTab} 不需要Viser可视化，隐藏iframe`);
                viserManager.hideIframe();
            }
        }
    });
}

// Load the required resource.
async function loadPlugin(pluginId) {
    const mainContent = document.querySelector('.main-content');
    
    // Update the current state.
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeTab = document.querySelector(`[data-tab="${pluginId}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Hide the inactive element.
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    
    // Hide the inactive element.
    const pluginMgmt = document.getElementById('plugin-management');
    if (pluginMgmt) {
        pluginMgmt.classList.remove('active');
        pluginMgmt.style.display = 'none';
    }
    
    // Validate the current state.
    let pluginContainer = document.getElementById(pluginId);
    if (!pluginContainer) {
        pluginContainer = document.createElement('div');
        pluginContainer.id = pluginId;
        pluginContainer.className = 'tab-content';
        mainContent.appendChild(pluginContainer);
    }
    
    // Manage the plugin state.
    pluginContainer.classList.add('active');
    pluginContainer.style.display = 'flex';
    
    // Load the required resource.
    await pluginLoader.initializePluginContent(pluginId, pluginContainer);
    
    // Handle the conditional case (Viser).
    const isActiveTab = document.querySelector(`[data-tab="${pluginId}"]`)?.classList.contains('active');
    const plugin = pluginLoader.getPlugin(pluginId);
    const pluginInstance = plugin?.instance;
    const needsViser = pluginInstance?.needsViser;
    
    console.log(`🔍 检查插件 ${pluginId} 是否需要附加Viser:`, {
        isActiveTab,
        needsViser,
        hasVisualizationContent: !!pluginContainer.querySelector('.visualization-content')
    });
    
    if (isActiveTab && needsViser) {
        console.log(`🎯 ${pluginId} 是活跃插件且需要Viser，附加Viser...`);
        const targetContainer = pluginContainer.querySelector('.visualization-content');
        const loadingElement = pluginContainer.querySelector('[id*="loading"]');
        if (targetContainer) {
            try {
                await viserManager.attachToPlugin(pluginId, targetContainer, loadingElement);
            } catch (error) {
                console.error(`❌ 附加Viser到插件 ${pluginId} 失败:`, error);
            }
        } else {
            console.warn(`⚠️ 插件 ${pluginId} 没有找到 .visualization-content 容器`);
        }
    } else if (isActiveTab && !needsViser) {
        console.log(`📝 插件 ${pluginId} 是活跃插件但不需要Viser，隐藏iframe`);
        viserManager.hideIframe();
    }
}

// Use the default value.
const DEFAULT_PLUGIN_ORDER = [
    'wsm-v1-inference'
];

// Save the current result.
function getSavedPluginOrder() {
    const saved = localStorage.getItem('controlwave_plugin_order');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('解析保存的插件顺序失败:', e);
        }
    }
    return DEFAULT_PLUGIN_ORDER;
}

// Save the current result.
function savePluginOrder(order) {
    localStorage.setItem('controlwave_plugin_order', JSON.stringify(order));
}

// Update the current state.
async function updatePluginManagement() {
    const tableBody = document.getElementById('plugin-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    // Scan the available resources.
    const allPlugins = await pluginLoader.getAllPluginsWithLocal();

    // Keep visible tabs and the management registry on one source of truth,
    // including plugins discovered after the initial page load.
    for (const plugin of allPlugins) {
        if (pluginLoader.installedPlugins.has(plugin.id) && !pluginLoader.getPlugin(plugin.id)) {
            await pluginLoader.registerPlugin(plugin);
        }
    }

    const tabsContainer = document.querySelector(".tabs-container");
    if (tabsContainer) pluginLoader.createPluginTabs(tabsContainer);
    
    allPlugins.forEach(plugin => {
        const row = createPluginTableRow(plugin);
        tableBody.appendChild(row);
    });
    
    // Update the current state.
    updateDefaultPluginsList();
    
    // Register the event listener.
    setupPluginManagementEvents();
}

// Update the current state.
function updateDefaultPluginsList() {
    const listContainer = document.getElementById('default-plugins-list');
    if (!listContainer) return;
    
    const savedOrder = getSavedPluginOrder();
    const installedPlugins = pluginLoader.getInstalledPlugins();
    
    // Implementation note.
    listContainer.innerHTML = '';
    
    // Display the relevant element.
    savedOrder.forEach(pluginId => {
        const plugin = installedPlugins.find(p => p.id === pluginId);
        if (plugin) {
            const item = createSortableItem(plugin);
            listContainer.appendChild(item);
        }
    });
    
    // Enable this behavior.
    enableDragAndDrop(listContainer);
}

// Create the required object.
function createSortableItem(plugin) {
    const item = document.createElement('div');
    item.className = 'sortable-item';
    item.draggable = true;
    item.dataset.pluginId = plugin.id;
    
    item.innerHTML = `
        <span class="drag-handle">≡</span>
        <span class="plugin-name">${plugin.name}</span>
        <span class="plugin-id">(${plugin.id})</span>
    `;
    
    return item;
}

// Enable this behavior.
function enableDragAndDrop(container) {
    let draggedElement = null;
    
    container.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('sortable-item')) {
            draggedElement = e.target;
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', e.target.innerHTML);
        }
    });
    
    container.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('sortable-item')) {
            e.target.classList.remove('dragging');
        }
    });
    
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        
        if (afterElement == null) {
            container.appendChild(draggedElement);
        } else {
            container.insertBefore(draggedElement, afterElement);
        }
    });
    
    container.addEventListener('drop', (e) => {
        e.preventDefault();
        
        // Save the current result.
        const items = [...container.querySelectorAll('.sortable-item')];
        const newOrder = items.map(item => item.dataset.pluginId);
        savePluginOrder(newOrder);
        
        // Create the required object.
        const tabsContainer = document.querySelector('.tabs-container');
        pluginLoader.createPluginTabs(tabsContainer);
        
        console.log('插件顺序已更新:', newOrder);
    });
}

// Get the required value.
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.sortable-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Create the required object.
function createPluginTableRow(plugin) {
    const row = document.createElement('tr');
    const isInstalled = pluginLoader.installedPlugins.has(plugin.id);
    
    row.innerHTML = `
        <td>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>${plugin.name}</span>
                ${plugin.isOfficial ? '<span class="plugin-status official">Official</span>' : ''}
                ${plugin.isLocal ? '<span class="plugin-status local">Local</span>' : ''}
            </div>
        </td>
        <td>${plugin.version}</td>
        <td>${plugin.author}</td>
        <td>
            <span class="plugin-status ${isInstalled ? 'installed' : 'not-installed'}">
                ${isInstalled ? 'Installed' : 'Available to install'}
            </span>
        </td>
        <td>
            ${plugin.repository ? `<a href="${plugin.repository}" target="_blank" class="repository-link">${getShortUrl(plugin.repository)}</a>` : (plugin.isLocal ? '<span class="repository-link">Local folder</span>' : 'N/A')}
        </td>
        <td>
            ${createActionButtons(plugin.id, isInstalled)}
        </td>
    `;
    
    return row;
}

// Create the required object.
function createActionButtons(pluginId, isInstalled) {
    if (isInstalled) {
        return `<button class="action-btn uninstall" onclick="handleUninstallPlugin('${pluginId}')">Uninstall</button>`;
    } else {
        return `<button class="action-btn install" onclick="handleInstallPlugin('${pluginId}')">Install</button>`;
    }
}

// Get the required value (URL).
function getShortUrl(url) {
    try {
        const urlObj = new URL(url);
        const parts = urlObj.pathname.split('/');
        if (parts.length >= 3) {
            return `${parts[1]}/${parts[2]}`;
        }
        return urlObj.hostname;
    } catch (e) {
        return url.substring(0, 30) + '...';
    }
}

// Configure the required value.
function setupPluginManagementEvents() {
    // Implementation note (URL).
    const installFromUrlBtn = document.getElementById('install-from-url-btn');
    const installLocalBtn = document.getElementById('install-local-btn');
    const refreshBtn = document.getElementById('refresh-plugins-btn');
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    
    if (installFromUrlBtn) {
        installFromUrlBtn.onclick = handleInstallFromUrl;
    }
    
    if (installLocalBtn) {
        installLocalBtn.onclick = handleInstallLocal;
    }
    
    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            await updatePluginManagement();
            console.log('🔄 插件列表已刷新（包含本地扫描）');
        };
    }
    
    if (clearCacheBtn) {
        clearCacheBtn.onclick = () => {
            localStorage.removeItem('controlwave_plugins');
            console.log('🗑️ 插件缓存已清除');
        };
    }
}

// Handle the current operation (URL).
async function handleInstallFromUrl() {
    const urlInput = document.getElementById('plugin-url');
    const url = urlInput.value.trim();
    
    if (!url) {
        alert('Enter a valid URL.');
        return;
    }
    
    try {
        console.log(`Installing plugin from URL: ${url}`);
        
        // Load the required resource.
        const installBtn = document.getElementById('install-from-url-btn');
        const originalText = installBtn.textContent;
        installBtn.textContent = 'Installing...';
        installBtn.disabled = true;
        
        // Invoke the required handler (API).
        const response = await fetch('/api/plugins/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });
        
        const result = await response.json();
        
        if (result.status === 'not_implemented') {
            // Use a temporary value.
            alert('Automatic download is unavailable for this URL.\n\nManual installation:\n1. Download the repository.\n2. Copy the plugin folder into plugins/.\n3. Refresh the registry.');
        } else if (result.status === 'success') {
            await pluginLoader.installPlugin(result.pluginId);
            alert("Plugin installed.\n\nID: " + result.pluginId + "\nName: " + result.pluginName);
            urlInput.value = '';
            
            // Update the current state.
            await updatePluginManagement();
            
            // Create the required object.
            const tabsContainer = document.querySelector('.tabs-container');
            pluginLoader.createPluginTabs(tabsContainer);
        } else {
            alert('Installation failed: ' + (result.message || 'Unknown error'));
        }
        
        // Implementation note.
        installBtn.textContent = originalText;
        installBtn.disabled = false;
        
    } catch (error) {
        console.error('Failed to install plugin:', error);
        alert('Failed to install plugin: ' + error.message);
        
        // Implementation note.
        const installBtn = document.getElementById('install-from-url-btn');
        installBtn.textContent = 'Install from URL';
        installBtn.disabled = false;
    }
}

// Handle the current operation.
async function handleInstallLocal() {
    // Validate the current state (File, System, Access, API).
    if ('showDirectoryPicker' in window) {
        try {
            const directoryHandle = await window.showDirectoryPicker();
            
            // Validate the current state.
            const isValidPlugin = await validatePluginDirectory(directoryHandle);
            
            if (isValidPlugin) {
                // Copy the required data (API, plugins).
                alert("Plugin folder \"" + directoryHandle.name + "\" is valid. Copy it into plugins/ and refresh the registry to make it available.");
            } else {
                alert('The selected folder is not a valid plugin. It must contain index.js and a compatible plugin export.');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Unable to select folder:', error);
                alert('Unable to select folder: ' + error.message);
            }
        }
    } else {
        // Manage the required filesystem resource.
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.multiple = true;
        
        input.addEventListener('change', (event) => {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;
            
            // Validate the current state (index.js).
            const hasIndexJs = files.some(file => file.name === 'index.js');
            
            if (hasIndexJs) {
                const folderName = files[0].webkitRelativePath.split('/')[0];
                alert("Plugin folder \"" + folderName + "\" is valid. Copy it into plugins/ and refresh the registry to make it available.");
            } else {
                alert('The selected folder is not a valid plugin; index.js is required.');
            }
        });
        
        input.click();
    }
}

// Validate the current state.
async function validatePluginDirectory(directoryHandle) {
    try {
        // Validate the current state (index.js).
        const indexJsHandle = await directoryHandle.getFileHandle('index.js');
        
        // Validate the current state.
        const file = await indexJsHandle.getFile();
        const content = await file.text();
        
        // Validate the current state.
        const hasPluginClass = content.includes('ControlWavePlugin') || content.includes('export default');
        
        return hasPluginClass;
    } catch (error) {
        return false;
    }
}

// Handle the current operation.
async function handleInstallPlugin(pluginId) {
    try {
        await pluginLoader.installPlugin(pluginId);
        const tabsContainer = document.querySelector(".tabs-container");
        pluginLoader.createPluginTabs(tabsContainer);
        await updatePluginManagement();
        alert(`Plugin "${pluginId}" is now installed and visible in ControlWorld.`);
    } catch (error) {
        console.error("Failed to install plugin:", error);
        alert("Failed to install plugin: " + error.message);
    }
}

// Handle the current operation.
async function handleUninstallPlugin(pluginId) {
    const message = `Disable plugin "${pluginId}" in ControlWorld?\n\nThe local plugin folder and every file inside it will be retained. The plugin will remain listed as available to install.`;
    if (!confirm(message)) return;
    const wasActive = document.querySelector(`.tab-button.active`)?.dataset.tab === pluginId;
    const buttons = document.querySelectorAll(`button[onclick="handleUninstallPlugin('${pluginId}')"]`);
    buttons.forEach(button => { button.textContent = "Disabling..."; button.disabled = true; });
    try {
        await pluginLoader.uninstallPlugin(pluginId);
        const tabsContainer = document.querySelector(".tabs-container");
        pluginLoader.createPluginTabs(tabsContainer);
        await updatePluginManagement();
        if (wasActive) document.querySelector(`[data-tab="plugin-management"]`)?.click();
        alert(`Plugin "${pluginId}" was disabled. Its local files were not deleted.`);
    } catch (error) {
        console.error("Failed to disable plugin:", error);
        alert("Failed to disable plugin: " + error.message);
    } finally {
        buttons.forEach(button => { button.textContent = "Uninstall"; button.disabled = false; });
    }
}

// Handle the current operation.
function setupGlobalMessageHandling() {
    // Register the event listener (Viser, iframe).
    window.addEventListener('message', (event) => {
        // Ensure the required condition holds (Viser).
        if (event.origin.includes('localhost') && event.data) {
            // Manage the plugin state.
            viserManager.broadcastToPlugins(event.data);
            
            // Handle the current operation.
            if (event.data.type === 'cameraStateChange' || event.data.type === 'sceneStateChange') {
                console.log('🔄 Viser 状态变化，广播给所有插件:', event.data);
            }
        }
    });
    
    console.log('📡 全局消息处理已设置');
}

// Export the current data.
window.handleInstallPlugin = handleInstallPlugin;
window.handleUninstallPlugin = handleUninstallPlugin;

// Register the event listener.
window.addEventListener('plugin-order-changed', (event) => {
    const newOrder = event.detail;
    // Update the current state.
    updateDefaultPluginsList();
    console.log('插件顺序已同步更新:', newOrder);
});

// Initialize the required state.
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the required state.
    if (typeof initializeApp === 'function') {
        initializeApp();
    }
    
    // Initialize the required state.
    initializePluginSystem();
});