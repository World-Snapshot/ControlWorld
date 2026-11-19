/* Implementation note (Viser, iframe, absolute). */

class ViserManagerSimple {
    constructor() {
        this.viserPort = null;
        this.sharedIframe = null;
        this.currentPlugin = null;
        this.isLoaded = false;
        this.plugins = new Map();
        this.globalContainer = null;
        this.currentViewport = null;
        this.resizeObserver = null;
        this.currentResizeTarget = null;
        
        console.log('🔧 ViserManager 初始化完成 - 全局覆盖策略 (absolute定位)');
    }

    detectBackendPort() {
        if (this.viserPort) {
            return this.viserPort;
        }

        // Get the required value (URL).
        const urlParams = new URLSearchParams(window.location.search);
        const backendParam = urlParams.get('backend');
        if (backendParam) {
            this.viserPort = parseInt(backendParam);
            console.log(`🔍 从URL参数获取后端端口: ${this.viserPort}`);
            return this.viserPort;
        }
        
        // Handle the conditional case.
        const currentPort = parseInt(window.location.port) || 8080;
        this.viserPort = currentPort === 8084 ? 8082 : (currentPort === 8080 ? 8081 : currentPort + 1);
        
        console.log(`🔍 推断后端端口: ${this.viserPort}`);
        return this.viserPort;
    }

    async testPort(port) {
        // Implementation note.
        try {
            return new Promise((resolve) => {
                // Implementation note (img).
                const testImg = new Image();
                let resolved = false;
                
                testImg.onload = () => {
                    if (!resolved) {
                        resolved = true;
                        resolve(true);
                    }
                };
                
                testImg.onerror = () => {
                    if (!resolved) {
                        resolved = true;
                        // Load the required resource.
                        resolve(true);
                    }
                };
                
                // Implementation note (ms).
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve(false);
                    }
                }, 500);
                
                // Load the required resource.
                testImg.src = `http://localhost:${port}/favicon.ico?t=${Date.now()}`;
            });
        } catch (error) {
            return false;
        }
    }

    async findWorkingBackendPort() {
        // Find the required resource.
        // Define the required parameters (URL).
        const initialPort = this.detectBackendPort();
        console.log(`🔍 测试初始端口: ${initialPort}`);
        
        if (await this.testPort(initialPort)) {
            console.log(`✅ 端口 ${initialPort} 可用`);
            return initialPort;
        }
        
        // Handle the conditional case.
        const commonPorts = [8081, 8082, 8083, 8084];
        console.log(`⚠️ 初始端口 ${initialPort} 不可用，尝试常用端口: ${commonPorts.join(', ')}`);
        
        for (const port of commonPorts) {
            // Note the relevant constraint (iframe).
            if (await this.testPort(port)) {
                console.log(`✅ 找到可用端口: ${port}`);
                this.viserPort = port;
                return port;
            }
        }
        
        console.error(`❌ 无法找到可用的后端端口`);
        throw new Error('无法连接到Viser后端');
    }

    async initializeSharedIframe() {
        if (this.sharedIframe && this.isLoaded) {
            return;
        }

        if (this.sharedIframe && !this.isLoaded) {
            // Load the required resource.
            return new Promise((resolve) => {
                const checkLoaded = () => {
                    if (this.isLoaded) {
                        resolve();
                    } else {
                        setTimeout(checkLoaded, 100);
                    }
                };
                checkLoaded();
            });
        }

        // Define the required parameters (URL).
        let port = this.detectBackendPort();
        console.log(`🎯 使用后端端口: ${port} (来源: URL参数或推断)`);
        
        // Configure the required value.
        
        console.log(`🔄 初始化共享Viser iframe (端口: ${port})`);
        
        return new Promise((resolve, reject) => {
            this.sharedIframe = document.createElement('iframe');
            this.sharedIframe.id = 'shared-viser-iframe';
            this.sharedIframe.title = 'Viser 3D Visualization';
            this.sharedIframe.style.cssText = `
                width: 100%;
                height: 100%;
                border: none;
                background: #001122;
                display: block;
            `;

            // Load the required resource.
            let isResolved = false;
            
            // Implementation note (load).
            this.sharedIframe.addEventListener('load', () => {
                if (!isResolved) {
                    this.isLoaded = true;
                    isResolved = true;
                    console.log(`✅ 共享Viser iframe已加载 (端口: ${port}) - load事件`);
                    resolve();
                }
            });

            this.sharedIframe.addEventListener('error', (event) => {
                if (!isResolved) {
                    isResolved = true;
                    console.error(`❌ 共享Viser iframe加载失败 (端口: ${port})`, event);
                    reject(new Error(`Viser连接失败，端口 ${port}`));
                }
            });
            
            // Implementation note (iframe).
            const pollForLoad = () => {
                try {
                    // Validate the current state (iframe).
                    if (this.sharedIframe.contentDocument || this.sharedIframe.contentWindow) {
                        if (!isResolved) {
                            this.isLoaded = true;
                            isResolved = true;
                            console.log(`✅ 共享Viser iframe已加载 (端口: ${port}) - 轮询检测`);
                            resolve();
                            return;
                        }
                    }
                } catch (e) {
                    // Load the required resource (CORS, iframe).
                    if (e.name === 'SecurityError' && !isResolved) {
                        this.isLoaded = true;
                        isResolved = true;
                        console.log(`✅ 共享Viser iframe已加载 (端口: ${port}) - CORS检测`);
                        resolve();
                        return;
                    }
                }
                
                // Implementation note.
                if (!isResolved) {
                    setTimeout(pollForLoad, 200);
                }
            };
            
            // Manage the current time value.
            const timeoutId = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    console.warn(`⏰ Viser iframe加载超时 (端口: ${port})，但继续使用`);
                    // Start the required service (Viser).
                    this.isLoaded = true;
                    resolve();
                }
            }, 2000);
            
            // Load the required resource (src).
            console.log(`🔗 设置iframe src: http://localhost:${port}`);
            this.sharedIframe.src = `http://localhost:${port}`;
            
            // Implementation note.
            setTimeout(pollForLoad, 100);
        });
    }

    registerPlugin(pluginId, pluginInstance) {
        this.plugins.set(pluginId, pluginInstance);
        console.log(`📝 插件 ${pluginId} 已注册到 ViserManager`);
    }

    unregisterPlugin(pluginId) {
        this.plugins.delete(pluginId);
        console.log(`🗑️ 插件 ${pluginId} 已从 ViserManager 注销`);
    }

    async attachToPlugin(pluginId, targetContainer, loadingElement) {
        try {
            console.log(`🔍 附加共享iframe到插件 ${pluginId}`);
            
            // Initialize the required state (iframe).
            await this.initializeSharedIframe();
            
            // Load the required resource.
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }

            if (!targetContainer) {
                console.error('⚠️ 目标容器不存在');
                return false;
            }

            // Implementation note (absolute, fixed).
            if (!this.globalContainer) {
                // Create the required object (absolute).
                this.globalContainer = document.createElement('div');
                this.globalContainer.id = 'viser-global-container';
                this.globalContainer.style.cssText = `
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: -1;
                    top: 0;
                    left: 0;
                `;
                this.globalContainer.appendChild(this.sharedIframe);
                
                // Add the required entry (main-container).
                const mainContainer = document.querySelector('.main-container') || document.body;
                // Configure the required value (relative, CSS).
                const computedStyle = window.getComputedStyle(mainContainer);
                if (computedStyle.position === 'static') {
                    mainContainer.style.position = 'relative';
                }
                mainContainer.appendChild(this.globalContainer);
                console.log(`🌍 创建了全局iframe容器，使用absolute定位`);
            }
            
            // Implementation note.
            Array.from(targetContainer.children).forEach(child => {
                if (child !== loadingElement) {
                    child.remove();
                }
            });
            
            // Create the required object.
            const viewportWindow = document.createElement('div');
            viewportWindow.className = 'viser-viewport-window';
            viewportWindow.style.cssText = `
                width: 100%;
                height: 100%;
                position: relative;
                overflow: hidden;
            `;
            targetContainer.appendChild(viewportWindow);
            
            // Save the current result.
            this.currentViewport = viewportWindow;
            
            // Update the current state (iframe).
            this.updateIframePosition();
            
            // Register the event listener.
            if (!this.resizeObserver) {
                this.resizeObserver = new ResizeObserver(() => {
                    this.updateIframePosition();
                });
            }
            if (this.currentResizeTarget) {
                this.resizeObserver.unobserve(this.currentResizeTarget);
            }
            this.resizeObserver.observe(viewportWindow);
            this.currentResizeTarget = viewportWindow;
            
            // Update the current state.
            const oldPlugin = this.currentPlugin;
            this.currentPlugin = pluginId;
            
            console.log(`✅ 插件 ${pluginId} 已激活 (从 ${oldPlugin || 'none'})`);
            console.log(`📊 使用全局覆盖策略，iframe跟随容器，状态完全保持`);
            
            return true;
            
        } catch (error) {
            console.error(`❌ 无法附加iframe到插件 ${pluginId}:`, error);
            
            // Display the relevant element.
            if (loadingElement) {
                loadingElement.innerHTML = `
                    <div class="status-indicator" style="background: #f8d7da; color: #721c24; border-color: #f5c6cb;">
                        ❌ Viser 服务器连接失败，请确保后端正在运行在端口 ${this.detectBackendPort()}
                    </div>
                `;
            }
            
            return false;
        }
    }

    sendMessage(message) {
        if (this.sharedIframe && this.sharedIframe.contentWindow && this.isLoaded) {
            this.sharedIframe.contentWindow.postMessage(message, '*');
            console.log(`📤 消息已发送到Viser:`, message.type);
            return true;
        }
        console.warn('⚠️ 无法发送消息，iframe未就绪');
        return false;
    }

    // Manage the plugin state.
    broadcastToPlugins(message) {
        this.plugins.forEach((plugin, id) => {
            if (plugin.onViserMessage && typeof plugin.onViserMessage === 'function') {
                try {
                    plugin.onViserMessage(message);
                } catch (error) {
                    console.error(`插件 ${id} 处理消息时出错:`, error);
                }
            }
        });
    }

    // Update the current state (iframe).
    updateIframePosition() {
        if (!this.globalContainer || !this.currentViewport) return;
        
        const rect = this.currentViewport.getBoundingClientRect();
        const mainContainer = document.querySelector('.main-container') || document.body;
        const mainRect = mainContainer.getBoundingClientRect();
        
        // Compute the required values.
        const scrollTop = mainContainer.scrollTop || 0;
        const scrollLeft = mainContainer.scrollLeft || 0;
        const relativeTop = rect.top - mainRect.top + scrollTop;
        const relativeLeft = rect.left - mainRect.left + scrollLeft;
        
        // Update the current state.
        this.globalContainer.style.cssText = `
            position: absolute;
            width: ${rect.width}px;
            height: ${rect.height}px;
            top: ${relativeTop}px;
            left: ${relativeLeft}px;
            pointer-events: auto;
            z-index: 1;
            visibility: visible;
        `;
        
        // Ensure the required condition holds (iframe).
        if (this.sharedIframe) {
            this.sharedIframe.style.cssText = `
                width: 100%;
                height: 100%;
                border: none;
                display: block;
            `;
        }
        
        console.log(`📐 更新iframe位置: ${relativeLeft}, ${relativeTop}, ${rect.width}x${rect.height}`);
    }

    // Hide the inactive element (iframe).
    hideIframe() {
        if (this.globalContainer) {
            this.globalContainer.style.visibility = 'hidden';
            this.globalContainer.style.pointerEvents = 'none';
            console.log('🙈 隐藏iframe');
        }
        this.currentViewport = null;
    }
    
    // Display the relevant element (iframe, attachToPlugin).
    showIframe() {
        if (this.globalContainer && this.currentViewport) {
            this.updateIframePosition();
            console.log('👁️ 显示iframe');
        }
    }

    // Get the required value.
    getCurrentState() {
        return {
            currentPlugin: this.currentPlugin,
            viserPort: this.viserPort,
            isLoaded: this.isLoaded,
            registeredPlugins: Array.from(this.plugins.keys()),
            hasGlobalContainer: !!this.globalContainer,
            currentViewport: this.currentViewport?.className || 'none'
        };
    }
    
    // Implementation note.
    diagnose() {
        console.log('🔍 ViserManager 诊断信息 (全局覆盖策略):');
        console.log('  - 当前插件:', this.currentPlugin);
        console.log('  - Viser端口:', this.viserPort);
        console.log('  - iframe已加载:', this.isLoaded);
        console.log('  - 注册插件数量:', this.plugins.size);
        console.log('  - 注册插件列表:', Array.from(this.plugins.keys()));
        console.log('  - 全局容器:', this.globalContainer?.id || 'none');
        console.log('  - 当前视口:', this.currentViewport?.className || 'none');
        
        if (this.sharedIframe) {
            console.log('  - iframe父容器:', this.sharedIframe.parentNode?.id || 'none');
            console.log('  - iframe src:', this.sharedIframe.src);
            console.log('  - iframe尺寸:', {
                width: this.sharedIframe.offsetWidth,
                height: this.sharedIframe.offsetHeight
            });
        }
        
        if (this.globalContainer) {
            console.log('  - 全局容器位置:', {
                position: this.globalContainer.style.position,
                top: this.globalContainer.style.top,
                left: this.globalContainer.style.left,
                width: this.globalContainer.style.width,
                height: this.globalContainer.style.height
            });
        }
    }

    // Implementation note.
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        
        if (this.globalContainer) {
            this.globalContainer.remove();
            this.globalContainer = null;
        }
        
        if (this.sharedIframe) {
            this.sharedIframe.remove();
            this.sharedIframe = null;
        }
        
        this.plugins.clear();
        this.isLoaded = false;
        this.currentPlugin = null;
        this.currentViewport = null;
        
        console.log('🗑️ ViserManager 已销毁');
    }
}

// Create the required object.
window.viserManager = window.viserManager || new ViserManagerSimple();

// Implementation note.
window.viserDiagnose = () => window.viserManager.diagnose();

// Export the current data.
export default window.viserManager;