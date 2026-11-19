/* Handle the current operation (WebSocket, ControlWave). */

class ControlWaveWebSocketManager {
    constructor(options = {}) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const defaultUrl = `${protocol}//${window.location.host}/ws`;

        // Configure the connection options.
        this.options = {
            url: options.url || defaultUrl,
            reconnectInterval: options.reconnectInterval || 1000,  // Implementation note.
            maxReconnectInterval: options.maxReconnectInterval || 30000,  // Implementation note.
            reconnectDecay: options.reconnectDecay || 1.5,  // Implementation note.
            timeoutInterval: options.timeoutInterval || 2000,  // Implementation note.
            maxReconnectAttempts: options.maxReconnectAttempts || null,  // Implementation note (null).
            enableMessageQueue: options.enableMessageQueue !== false,  // Enable this behavior.
            maxQueueSize: options.maxQueueSize || 100,  // Implementation note.
            debug: options.debug || false
        };

        // Implementation note.
        this.ws = null;
        this.forcedClose = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.messageQueue = [];
        
        // Implementation note.
        this.readyState = {
            CONNECTING: 0,
            OPEN: 1,
            CLOSING: 2,
            CLOSED: 3,
            RECONNECTING: 4
        };
        this.state = this.readyState.CLOSED;

        // Register the event listener.
        this.eventListeners = {
            open: [],
            close: [],
            error: [],
            message: [],
            reconnecting: [],
            reconnect_failed: []
        };

        // Implementation note.
        this.connect();
    }

    // Implementation note.
    log(...args) {
        if (this.options.debug) {
            console.log('[WebSocketManager]', ...args);
        }
    }

    // Implementation note (WebSocket).
    connect() {
        if (this.state === this.readyState.OPEN || this.state === this.readyState.CONNECTING) {
            this.log('Already connected or connecting');
            return;
        }

        this.log('Connecting to', this.options.url);
        this.state = this.readyState.CONNECTING;
        this.forcedClose = false;

        try {
            this.ws = new WebSocket(this.options.url);
            this.setupEventHandlers();

            // Handle the current operation.
            const timeout = setTimeout(() => {
                if (this.state === this.readyState.CONNECTING) {
                    this.log('Connection timeout');
                    this.ws.close();
                }
            }, this.options.timeoutInterval);

            this.ws.addEventListener('open', () => {
                clearTimeout(timeout);
            });

        } catch (error) {
            this.log('Connection error:', error);
            this.handleReconnect();
        }
    }

    // Handle the current operation.
    setupEventHandlers() {
        this.ws.onopen = (event) => {
            this.log('Connected');
            this.state = this.readyState.OPEN;
            this.reconnectAttempts = 0;
            
            // Send the message.
            this.flushMessageQueue();
            
            // Implementation note.
            this.emit('open', event);
            
            // Register the event listener.
            window.dispatchEvent(new CustomEvent('websocket-connected', {
                detail: { 
                    timestamp: new Date().toISOString(),
                    manager: this
                }
            }));
        };

        this.ws.onclose = (event) => {
            this.log('Disconnected', event.code, event.reason);
            this.state = this.readyState.CLOSED;
            this.ws = null;
            
            this.emit('close', event);
            
            if (!this.forcedClose) {
                this.handleReconnect();
            }
        };

        this.ws.onerror = (event) => {
            this.log('Error:', event);
            this.emit('error', event);
        };

        this.ws.onmessage = (event) => {
            this.emit('message', event);
        };
    }

    // Handle the current operation.
    handleReconnect() {
        if (this.forcedClose) {
            return;
        }

        // Validate the current state.
        if (this.options.maxReconnectAttempts !== null && 
            this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this.log('Max reconnection attempts reached');
            this.emit('reconnect_failed', {
                attempts: this.reconnectAttempts
            });
            return;
        }

        this.state = this.readyState.RECONNECTING;
        this.reconnectAttempts++;

        // Compute the required values.
        const timeout = Math.min(
            this.options.reconnectInterval * Math.pow(this.options.reconnectDecay, this.reconnectAttempts - 1),
            this.options.maxReconnectInterval
        );

        this.log(`Reconnecting in ${timeout}ms (attempt ${this.reconnectAttempts})`);
        
        this.emit('reconnecting', {
            attempt: this.reconnectAttempts,
            delay: timeout
        });

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, timeout);
    }

    // Send the message.
    send(data) {
        const message = typeof data === 'string' ? data : JSON.stringify(data);

        if (this.state === this.readyState.OPEN && this.ws) {
            try {
                this.ws.send(message);
                this.log('Sent:', message);
                return true;
            } catch (error) {
                this.log('Send error:', error);
                this.queueMessage(message);
                return false;
            }
        } else {
            // Implementation note.
            this.queueMessage(message);
            return false;
        }
    }

    // Implementation note.
    queueMessage(message) {
        if (!this.options.enableMessageQueue) {
            this.log('Message dropped (queue disabled):', message);
            return;
        }

        if (this.messageQueue.length >= this.options.maxQueueSize) {
            // Remove the obsolete entry.
            this.messageQueue.shift();
            this.log('Message queue full, dropping oldest message');
        }

        this.messageQueue.push(message);
        this.log('Message queued:', message);
    }

    // Send the message.
    flushMessageQueue() {
        if (!this.options.enableMessageQueue || this.messageQueue.length === 0) {
            return;
        }

        this.log(`Flushing ${this.messageQueue.length} queued messages`);
        
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            try {
                this.ws.send(message);
            } catch (error) {
                this.log('Failed to send queued message:', error);
                // Implementation note.
                this.messageQueue.unshift(message);
                break;
            }
        }
    }

    // Shut down the resource.
    close(code = 1000, reason = '') {
        this.forcedClose = true;
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close(code, reason);
        }
        
        this.state = this.readyState.CLOSED;
        this.messageQueue = [];
    }

    // Implementation note.
    on(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(callback);
        }
    }

    off(event, callback) {
        if (this.eventListeners[event]) {
            const index = this.eventListeners[event].indexOf(callback);
            if (index > -1) {
                this.eventListeners[event].splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Event listener error:', error);
                }
            });
        }
    }

    // Get the required value.
    get isConnected() {
        return this.state === this.readyState.OPEN;
    }

    get isReconnecting() {
        return this.state === this.readyState.RECONNECTING;
    }

    // Maintain backward compatibility.
    get socket() {
        return this.ws;
    }
}

// Create the required object.
if (typeof window !== 'undefined') {
    // Create the required object.
    const wsManager = new ControlWaveWebSocketManager({
        debug: true,
        enableMessageQueue: true,
        maxQueueSize: 50,
        reconnectInterval: 1000,
        maxReconnectInterval: 10000
    });

    // Handle the current operation.
    wsManager.on('message', (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('📨 收到 WebSocket 消息:', data.type);
            
            // Handle the current operation.
            switch(data.type) {
                case 'viser_status':
                    console.log('Viser 状态:', data.active ? '活动' : '未活动', '端口:', data.port);
                    break;
                case 'training_visualization_updated':
                    console.log('训练可视化已更新:', data.status);
                    break;
                case 'plugin_response':
                    // Handle the current operation (plugin_response, sendRequest, responseHandler).
                    // Record the current state.
                    console.log('插件响应:', data.plugin, data.action, data.status);
                    break;
                default:
                    console.log('未知消息类型:', data.type);
            }
        } catch (error) {
            console.error('处理 WebSocket 消息时出错:', error);
        }
    });

    // Maintain backward compatibility.
    window.controlWaveWebSocket = {
        send: (message) => wsManager.send(message),
        get socket() { return wsManager.socket; },
        get isConnected() { return wsManager.isConnected; },
        // Implementation note.
        manager: wsManager,
        // Implementation note (sendRequest).
        sendRequest: (pluginId, data) => {
            const REQUEST_TIMEOUT_MS = 180000; // 3 minutes to accommodate long-running generations
            return new Promise((resolve, reject) => {
                const requestId = `${pluginId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // Implementation note.
                const message = {
                    type: 'plugin_message',
                    plugin: pluginId,
                    requestId: requestId,
                    ...data
                };
                
                // Register the event listener.
                const responseHandler = (event) => {
                    try {
                        const response = JSON.parse(event.data);
                        
                        // Implementation note.
                        if (response.type === 'plugin_response') {
                            console.log(`🔍 收到插件响应 [${response.plugin}]:`, {
                                requestId: response.requestId,
                                expectedId: requestId,
                                match: response.requestId === requestId,
                                status: response.status
                            });
                        }
                        
                        if (response.type === 'plugin_response' && 
                            response.requestId === requestId) {
                            // Register the event listener.
                            wsManager.off('message', responseHandler);
                            
                            console.log('✅ 响应匹配，返回数据:', response);
                            
                            // Handle the current operation.
                            if (response.status === 'success') {
                                resolve(response.response || response);
                            } else {
                                reject(new Error(response.message || 'Plugin error'));
                            }
                        }
                    } catch (error) {
                        // Implementation note (JSON).
                    }
                };
                
                // Add the required entry.
                wsManager.on('message', responseHandler);
                
                // Send the message.
                wsManager.send(message);
                
                // Configure the required value.
                setTimeout(() => {
                    wsManager.off('message', responseHandler);
                    reject(new Error('Request timeout (180s)'));
                }, REQUEST_TIMEOUT_MS);
            });
        }
    };

    // Implementation note.
    window.addEventListener('beforeunload', () => {
        wsManager.close(1001, 'Page unloading');
    });
}
