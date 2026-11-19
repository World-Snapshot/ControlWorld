// Load the required resource (ControlWave).
class PluginLoader {
    constructor() {
        this.plugins = new Map();
        this.installedPlugins = new Set();
        this.availablePlugins = new Map(); // Manage the plugin state.
        this.pluginOrder = [];
        this.disabledPlugins = this.loadDisabledPlugins();
        
        // Initialize the required state.
        this.initOfficialPlugins();
    }

    loadDisabledPlugins() {
        try {
            const saved = JSON.parse(localStorage.getItem("controlworld_disabled_plugins") || "[]");
            return new Set(Array.isArray(saved) ? saved : []);
        } catch (error) {
            console.warn("Unable to read disabled plugin state:", error);
            return new Set();
        }
    }

    saveDisabledPlugins() {
        localStorage.setItem("controlworld_disabled_plugins", JSON.stringify([...this.disabledPlugins].sort()));
    }

    // Initialize the required state.
    initOfficialPlugins() {
        // Get the required value.
        console.log('🔧 插件列表将从服务器动态加载');
    }

    // Manage the plugin state.
    async registerPlugin(pluginConfig) {
        const { id, name, path, icon, order = 999 } = pluginConfig;
        
        if (this.plugins.has(id)) {
            console.warn(`插件 ${id} 已存在，跳过注册`);
            return false;
        }

        this.plugins.set(id, {
            id,
            name,
            path,
            icon,
            order,
            loaded: false,
            instance: null,
            installed: this.installedPlugins.has(id)
        });

        // Sort the entries (order).
        this.pluginOrder = Array.from(this.plugins.keys()).sort((a, b) => {
            return this.plugins.get(a).order - this.plugins.get(b).order;
        });

        console.log(`✅ 注册插件: ${name} (${id})`);
        return true;
    }

    // Load the required resource.
    async loadPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            console.error(`插件 ${pluginId} 未在注册列表中找到`);
            console.log('已注册插件:', Array.from(this.plugins.keys()));
            return null;
        }

        // Validate the current state.
        if (!this.installedPlugins.has(pluginId)) {
            console.error(`插件 ${pluginId} 未安装`);
            return null;
        }

        if (plugin.loaded) {
            return plugin.instance;
        }

        try {
            console.log(`🔄 正在加载插件: ${plugin.name} from ${plugin.path}`);
            
            // Import the selected data.
            const module = await import(plugin.path);
            if (!module.default) {
                throw new Error('插件文件没有默认导出');
            }
            
            plugin.instance = new module.default();
            plugin.loaded = true;
            
            console.log(`✅ 加载插件成功: ${plugin.name}`);
            return plugin.instance;
        } catch (error) {
            console.error(`❌ 加载插件失败: ${plugin.name}`, error);
            return null;
        }
    }

    // Get the required value.
    getPlugins() {
        return this.pluginOrder.map(id => this.plugins.get(id));
    }

    // Create the required object.
    createPluginTabs(container) {
        const tabButtons = container.querySelector('.tab-buttons');
        const mainContent = container.querySelector('.main-content');
        
        console.log('🔧 创建插件选项卡...');
        console.log('📝 所有注册插件:', this.pluginOrder);
        console.log('📦 已安装插件:', Array.from(this.installedPlugins));
        
        // Manage the plugin state.
        const existingTabs = tabButtons.querySelectorAll('.tab-button:not([data-tab="plugin-management"])');
        existingTabs.forEach(tab => tab.remove());
        
        // Save the current result.
        const savedOrder = this.getSavedPluginOrder();
        
        // Get the required value.
        const installedPluginsMap = new Map();
        this.pluginOrder.forEach(pluginId => {
            const plugin = this.plugins.get(pluginId);
            if (plugin && plugin.installed) {
                installedPluginsMap.set(pluginId, plugin);
            }
        });
        
        // Save the current result.
        let tabIndex = 0;
        
        // Save the current result.
        savedOrder.forEach(pluginId => {
            const plugin = installedPluginsMap.get(pluginId);
            if (plugin) {
                const tabButton = this.createTabButton(plugin, tabIndex === 0);
                const pluginMgmtBtn = tabButtons.querySelector('[data-tab="plugin-management"]');
                tabButtons.insertBefore(tabButton, pluginMgmtBtn);
                installedPluginsMap.delete(pluginId); // Handle the current operation (map).
                tabIndex++;
            }
        });
        
        // Save the current result.
        installedPluginsMap.forEach((plugin, pluginId) => {
            const tabButton = this.createTabButton(plugin, tabIndex === 0);
            const pluginMgmtBtn = tabButtons.querySelector('[data-tab="plugin-management"]');
            tabButtons.insertBefore(tabButton, pluginMgmtBtn);
            tabIndex++;
        });
        
        // Handle the conditional case.
        if (tabIndex === 0) {
            const pluginMgmtBtn = tabButtons.querySelector('[data-tab="plugin-management"]');
            pluginMgmtBtn.classList.add('active');
        }
        
        // Enable this behavior.
        this.enableTabDragAndDrop(tabButtons);
    }
    
    // Create the required object.
    createTabButton(plugin, isActive) {
        const tabButton = document.createElement('button');
        // Create the required object (active, loadPlugin).
        tabButton.className = 'tab-button draggable';
        tabButton.dataset.tab = plugin.id;
        tabButton.innerHTML = plugin.name;
        tabButton.draggable = true;
        return tabButton;
    }
    
    // Save the current result.
    getSavedPluginOrder() {
        const saved = localStorage.getItem('controlwave_plugin_order');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('解析保存的插件顺序失败:', e);
            }
        }
        // Return the resulting value.
        return ['wsm-v1-inference'];
    }
    
    // Enable this behavior.
    enableTabDragAndDrop(tabButtons) {
        let draggedTab = null;
        
        tabButtons.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('draggable')) {
                draggedTab = e.target;
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            }
        });
        
        tabButtons.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('draggable')) {
                e.target.classList.remove('dragging');
            }
        });
        
        tabButtons.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(tabButtons, e.clientX);
            
            if (afterElement == null) {
                // Add the required entry.
                const pluginMgmtBtn = tabButtons.querySelector('[data-tab="plugin-management"]');
                tabButtons.insertBefore(draggedTab, pluginMgmtBtn);
            } else if (afterElement !== draggedTab) {
                tabButtons.insertBefore(draggedTab, afterElement);
            }
        });
        
        tabButtons.addEventListener('drop', (e) => {
            e.preventDefault();
            
            // Get the required value.
            const tabs = [...tabButtons.querySelectorAll('.tab-button.draggable')];
            const newOrder = tabs.map(tab => tab.dataset.tab);
            
            // Save the current result.
            localStorage.setItem('controlwave_plugin_order', JSON.stringify(newOrder));
            console.log('选项卡顺序已更新:', newOrder);
            
            // Update the current state.
            const updateEvent = new CustomEvent('plugin-order-changed', { detail: newOrder });
            window.dispatchEvent(updateEvent);
        });
    }
    
    // Get the required value.
    getDragAfterElement(container, x) {
        const draggableElements = [...container.querySelectorAll('.tab-button.draggable:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // Manage the plugin state.
    async installPlugin(pluginId) {
        const config = this.availablePlugins.get(pluginId);
        if (!config) throw new Error(`Plugin ${pluginId} is not available locally.`);
        this.disabledPlugins.delete(pluginId);
        this.saveDisabledPlugins();
        this.installedPlugins.add(pluginId);
        if (!this.plugins.has(pluginId)) {
            await this.registerPlugin(config);
        }
        const plugin = this.plugins.get(pluginId);
        if (plugin) plugin.installed = true;
        console.log(`Enabled plugin: ${pluginId}`);
        return true;
    }

    // Manage the plugin state.
    async uninstallPlugin(pluginId) {
        this.disabledPlugins.add(pluginId);
        this.saveDisabledPlugins();
        this.installedPlugins.delete(pluginId);
        const plugin = this.plugins.get(pluginId);
        const instance = plugin?.instance;
        if (instance) {
            const cleanup = instance.destroy || instance.dispose || instance.unmount;
            if (typeof cleanup === "function") {
                try { await cleanup.call(instance); } catch (error) { console.warn(`Plugin cleanup failed for ${pluginId}:`, error); }
            }
        }
        this.plugins.delete(pluginId);
        this.pluginOrder = this.pluginOrder.filter(id => id !== pluginId);
        const container = document.getElementById(pluginId);
        if (container) container.remove();
        console.log(`Disabled plugin without deleting files: ${pluginId}`);
        return true;
    }

    // Get the required value.
    getAllAvailablePlugins() {
        return Array.from(this.availablePlugins.values());
    }

    // Get the required value.
    getInstalledPlugins() {
        return this.pluginOrder
            .filter(id => this.installedPlugins.has(id))
            .map(id => this.plugins.get(id) || this.availablePlugins.get(id));
    }

    // Scan the available resources.
    async scanLocalPlugins() {
        try {
            // Scan the available resources (API).
            const response = await fetch('/api/plugins/scan');
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error('Failed to scan plugins');
            }
            
            const { plugins, duplicates } = data;

            // Reconcile deleted or moved local folders instead of retaining stale
            // registry rows from an earlier scan.
            const discoveredIds = new Set(plugins.map(plugin => plugin.id));
            for (const [pluginId, plugin] of this.availablePlugins) {
                if (plugin.isLocal && !discoveredIds.has(pluginId)) {
                    this.availablePlugins.delete(pluginId);
                    this.installedPlugins.delete(pluginId);
                    this.plugins.delete(pluginId);
                    this.pluginOrder = this.pluginOrder.filter(id => id !== pluginId);
                }
            }
            
            // Display the relevant element.
            if (duplicates && duplicates.length > 0) {
                this.showDuplicateWarnings(duplicates);
            }
            
            // Update the current state.
            plugins.forEach(plugin => {
                this.availablePlugins.set(plugin.id, plugin);
                const enabled = !this.disabledPlugins.has(plugin.id);
                plugin.installed = enabled;
                if (enabled) this.installedPlugins.add(plugin.id);
                else this.installedPlugins.delete(plugin.id);
            });
            
            console.log(`🔍 扫描到 ${plugins.length} 个本地插件`);
            console.log(`📦 已安装插件:`, Array.from(this.installedPlugins));
            
            if (duplicates.length > 0) {
                console.warn(`⚠️ 发现 ${duplicates.length} 个重复ID的插件`);
            }
            
            return plugins;
            
        } catch (error) {
            console.error('扫描本地插件失败:', error);
            return [];
        }
    }
    
    // Display the relevant element.
    showDuplicateWarnings(duplicates) {
        // Validate the current state.
        let warningArea = document.getElementById('plugin-warnings');
        
        if (!warningArea) {
            // Create the required object.
            warningArea = document.createElement('div');
            warningArea.id = 'plugin-warnings';
            warningArea.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                width: 350px;
                max-height: 300px;
                overflow-y: auto;
                background: #fff;
                border: 1px solid #ffc107;
                border-radius: 4px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                z-index: 10000;
                font-size: 14px;
            `;
            
            const header = document.createElement('div');
            header.style.cssText = `
                background: #ffc107;
                color: #000;
                padding: 10px 15px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            header.innerHTML = `
                <span>⚠️ Plugin warning</span>
                <button onclick="document.getElementById('plugin-warnings').remove()" style="
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">×</button>
            `;
            
            warningArea.appendChild(header);
            
            const content = document.createElement('div');
            content.id = 'plugin-warnings-content';
            content.style.cssText = 'padding: 15px;';
            warningArea.appendChild(content);
            
            document.body.appendChild(warningArea);
        }
        
        // Update the current state.
        const content = document.getElementById('plugin-warnings-content');
        content.innerHTML = '';
        
        duplicates.forEach(dup => {
            const warning = document.createElement('div');
            warning.style.cssText = 'margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;';
            warning.innerHTML = `
                <strong>Duplicate ID: ${dup.id}</strong><br>
                <small>Folders: ${dup.folders.join(', ')}</small><br>
                <small style="color: #666;">Only the first plugin was loaded</small>
            `;
            content.appendChild(warning);
        });
        
        // Shut down the resource.
        setTimeout(() => {
            const area = document.getElementById('plugin-warnings');
            if (area) {
                area.style.transition = 'opacity 0.3s';
                area.style.opacity = '0';
                setTimeout(() => area.remove(), 300);
            }
        }, 10000);
    }

    // Get the required value.
    async getAllPluginsWithLocal() {
        await this.scanLocalPlugins();
        return Array.from(this.availablePlugins.values());
    }

    // Get the required value.
    getPlugin(pluginId) {
        return this.plugins.get(pluginId);
    }


    // Initialize the required state.
    async initializePluginContent(pluginId, container) {
        const plugin = await this.loadPlugin(pluginId);
        if (!plugin) {
            console.error(`插件 ${pluginId} 加载失败`);
            container.innerHTML = `
                <div class="error-message" style="padding: 50px; text-align: center;">
                    <h3>❌ Plugin failed to load</h3>
                    <p>Plugin ${pluginId} could not be loaded.</p>
                </div>
            `;
            return;
        }

        const applyHostStyle = () => {
            container.classList.add("controlworld-plugin-host");
            container.dataset.pluginStyle = plugin.styleMode || "inherit";
        };
        applyHostStyle();

        // Render the current result. Reapply the contract after render in case a
        // legacy plugin replaced its container class list.
        try {
            await plugin.render(container);
            applyHostStyle();
            console.log(`✅ 插件 ${pluginId} 渲染成功`);
        } catch (error) {
            console.error(`渲染插件失败: ${pluginId}`, error);
            container.innerHTML = `
                <div class="error-message" style="padding: 50px; text-align: center;">
                    <h3>❌ Plugin failed to render</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

// Manage the plugin state.
export class ControlWavePlugin {
    constructor(config) {
        this.id = config.id;
        this.name = config.name;
        this.version = config.version || '1.0.0';
        this.author = config.author || 'Unknown';
        this.description = config.description || '';
        // Plugins inherit ControlWorld typography unless they explicitly opt out.
        this.styleMode = config.styleMode === 'custom' ? 'custom' : 'inherit';
        // Use the default value (Viser, false).
        this.needsViser = config.needsViser || false;
    }

    // Render the current result.
    async render(container) {
        throw new Error('render() must be implemented by the plugin class');
    }


    // Initialize the required state.
    async initialize() {
        // Initialize the required state.
    }

    // Manage the plugin state.
    async destroy() {
        // Implementation note.
    }
}

// Load the required resource.
export const pluginLoader = new PluginLoader();