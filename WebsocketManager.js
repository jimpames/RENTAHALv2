// WebSocketManager.js - Fixed implementation incorporating all stability improvements
export class WebSocketManager {
	
	// 1. Add these constants at the top of the WebSocketManager class
	static CONFIG = {
		MAX_QUEUE_SIZE: 100,
		MESSAGE_RETENTION_PERIOD: 300000, // 5 minutes
		MAX_RATE_LIMIT_DELAY: 30000,
		MAX_RECONNECT_ATTEMPTS: 5
	};
	
	
	
	
    constructor() {
		
		
		// Add these new properties
		this.errorCounts = {
			connection: 0,
			message: 0,
			heartbeat: 0
		};

		this.connectionMetrics = {
			lastLatency: 0,
			avgLatency: 0,
			messagesSent: 0,
			messagesReceived: 0,
			lastMessageTime: Date.now()
		};

		this.connectionStatus = 'disconnected';
		this.rateLimitDelay = 1000;
		this.reconnectAttempts = 0;
		
		
        // Core WebSocket state
        this.socket = null;
        this.isConnecting = false;
        this.isConnected = false;
        this.reconnecting = false;

        // Timing and intervals
        this.reconnectInterval = 1000;
        this.reconnectTimer = null;
        this.heartbeatInterval = null;
        this.lastHeartbeat = Date.now();
        this.lastPongTime = Date.now();
        this.lastConnectionAttempt = 0;

        // Message tracking
        this.messageHandlers = new Map();
        this.pendingMessages = new Map();
        this.acknowledgedMessages = new Set();
        this.messageQueue = [];
        this.lastMessageId = 0;

        // Status callback
        this.onStatusChange = null;

        // Constants
        this.MAX_RECONNECT_INTERVAL = 30000;
        this.HEARTBEAT_INTERVAL = 25000;
        this.MIN_RECONNECT_WAIT = 1000;
        this.CONNECTION_TIMEOUT = 5000;
        this.MESSAGE_TIMEOUT = 30000;
    }

    async connect() {
        if (this.isConnecting || (this.socket?.readyState === WebSocket.CONNECTING)) {
            console.log('[WS] Connection attempt already in progress');
            return;
        }

        if (this.socket?.readyState === WebSocket.OPEN) {
            console.log('[WS] WebSocket already connected');
            return;
        }
		
		
		
		if (!this.handleReconnection()) {
			return;
		}
		
		
		
		

        // Prevent rapid reconnection attempts
        const timeSinceLastAttempt = Date.now() - this.lastConnectionAttempt;
        if (timeSinceLastAttempt < this.MIN_RECONNECT_WAIT) {
            console.log('[WS] Too soon to reconnect, waiting...');
            return;
        }

        this.isConnecting = true;
        this.lastConnectionAttempt = Date.now();

        try {
            console.log('[WS] Initiating connection...');
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;
            
            // Clean up existing socket if any
            if (this.socket) {
                this.socket.onopen = this.socket.onmessage = this.socket.onerror = this.socket.onclose = null;
                this.socket.close();
                this.socket = null;
            }

            this.socket = new WebSocket(wsUrl);
            this.setupEventHandlers();
            
            // Set connection timeout
            const connectionTimeout = setTimeout(() => {
                if (this.socket?.readyState !== WebSocket.OPEN) {
                    console.log('[WS] Connection attempt timed out');
                    this.handleConnectionFailure();
                }
            }, this.CONNECTION_TIMEOUT);

            await this.waitForConnection();
            clearTimeout(connectionTimeout);
            
        } catch (error) {
            console.error('[WS] Error establishing connection:', error);
            this.handleConnectionFailure();
        } finally {
            this.isConnecting = false;
        }
    }

    setupEventHandlers() {
        this.socket.onopen = (event) => {
            console.log('[WS] Connection opened');
            this.isConnected = true;
            this.reconnecting = false;
            this.lastHeartbeat = Date.now();
            this.lastPongTime = Date.now();
            
            clearTimeout(this.reconnectTimer);
            this.reconnectInterval = this.MIN_RECONNECT_WAIT;
            
            this.startHeartbeat();
            this.onStatusChange?.('Connected to server', true);
            
            // Process any queued messages
            this.processMessageQueue();
            
            // Get previous queries
            this.send({ type: 'get_previous_queries' });
        };

        this.socket.onclose = (event) => {
            console.log('[WS] Connection closed:', event.code, event.reason);
            this.isConnected = false;
            this.onStatusChange?.('Connection lost. Attempting to reconnect...', false);
            
            this.cleanup();
            
            if (!event.wasClean || event.code === 1006) {
                this.handleConnectionFailure();
            } else {
                this.scheduleReconnection();
            }
        };

        this.socket.onerror = (error) => {
            console.error('[WS] WebSocket error:', error);
            this.onStatusChange?.('WebSocket error occurred', false);
        };






		this.socket.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);
				this.lastPongTime = Date.now();
				this.connectionMetrics.messagesReceived++;

				// Calculate latency for metrics
				if (message.messageId && this.pendingMessages.has(message.messageId)) {
					const sendTime = this.pendingMessages.get(message.messageId);
					this.connectionMetrics.lastLatency = Date.now() - sendTime;
					this.updateAverageLatency();
				}

				// Handle message acknowledgment
				if (message.messageId) {
					this.acknowledgedMessages.set(message.messageId, Date.now());
					this.pendingMessages.delete(message.messageId);
				}

				switch (message.type) {
					case 'pong':
						this.lastHeartbeat = Date.now();
						break;
					case 'rate_limit':
						this.handleRateLimit();
						break;
					default:
						const handler = this.messageHandlers.get(message.type);
						if (handler) {
							try {
								handler(message);
							} catch (handlerError) {
								console.error('[WS] Handler error:', handlerError);
								this.handleError(handlerError, 'handler');
							}
						}
						break;
				}
			} catch (error) {
				console.error('[WS] Error processing message:', error);
				this.handleError(error, 'message');
			}
		};
    }


	// 9. Add connection quality monitoring
	updateAverageLatency() {
		const alpha = 0.2; // Smoothing factor for exponential moving average
		this.connectionMetrics.avgLatency = 
			alpha * this.connectionMetrics.lastLatency + 
			(1 - alpha) * (this.connectionMetrics.avgLatency || this.connectionMetrics.lastLatency);
	}


    startHeartbeat() {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
            if (this.isHealthy()) {
                this.send({ type: 'pong' });
            } else {
                console.log('[WS] Connection unhealthy, initiating reconnect');
                this.forceReconnect();
            }
        }, this.HEARTBEAT_INTERVAL);
    }

    checkHeartbeatTimeout() {
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > this.HEARTBEAT_INTERVAL * 1.5) {
            console.warn('[WS] Heartbeat timeout; reconnecting...');
            this.forceReconnect();
        }
    }

	// 3. Enhanced send method with queue validation
	async send(data) {
		const messageId = this.generateMessageId();
		const message = { ...data, messageId };

		if (this.messageQueue.length >= WebSocketManager.CONFIG.MAX_QUEUE_SIZE) {
			this.onStatusChange?.('Message queue full', false);
			return;
		}

		if (!this.isHealthy()) {
			console.log('[WS] Connection not healthy, queueing message:', message);
			this.messageQueue.push(message);
			await this.connect();
			return;
		}

		try {
			const messageStr = JSON.stringify(message);
			this.socket.send(messageStr);
			this.trackPendingMessage(messageId);
			this.connectionMetrics.messagesSent++;
			this.connectionMetrics.lastMessageTime = Date.now();
			console.log('[WS] Message sent:', message);
		} catch (error) {
			console.error('[WS] Error sending message:', error);
			this.messageQueue.push(message);
			this.handleError(error, 'send');
			this.forceReconnect();
		}
	}
	

	// 4. Add these error handling methods
	handleError(error, type) {
		console.error(`WebSocket ${type} error:`, error);
		this.errorCounts[type] = (this.errorCounts[type] || 0) + 1;
    
		if (this.errorCounts[type] >= 3) {
			this.forceReconnect();
			this.errorCounts[type] = 0;
		}
	}

	handleRateLimit() {
		this.rateLimitDelay = Math.min(
			this.rateLimitDelay * 2, 
			WebSocketManager.CONFIG.MAX_RATE_LIMIT_DELAY
		);
		setTimeout(() => this.processMessageQueue(), this.rateLimitDelay);
	}

	handleReconnection() {
		if (this.reconnectAttempts >= WebSocketManager.CONFIG.MAX_RECONNECT_ATTEMPTS) {
			this.onStatusChange?.('Max reconnection attempts reached', false);
			return false;
		}
		this.reconnectAttempts++;
		return true;
	}



	// 5. Enhanced heartbeat monitoring
	monitorHeartbeat() {
		const now = Date.now();
		const timeSinceLastPong = now - this.lastPongTime;
    
		if (timeSinceLastPong > this.HEARTBEAT_INTERVAL * 2) {
			console.warn('[WS] No heartbeat response, reconnecting...');
			this.handleError({message: 'Heartbeat timeout'}, 'heartbeat');
			this.forceReconnect();
		}
	}

	
	
	// 6. Connection status tracking
	trackConnectionStatus() {
		const previousStatus = this.connectionStatus;
		const currentStatus = this.determineConnectionStatus();
    
		if (previousStatus !== currentStatus) {
			this.onStatusChange?.(currentStatus, this.isConnected);
			this.connectionStatus = currentStatus;
			console.log('[WS] Connection status changed:', currentStatus);
		}
	}
	
	
	
	determineConnectionStatus() {
		if (!this.socket) return 'disconnected';
		if (this.isConnecting) return 'connecting';
		if (this.socket.readyState === WebSocket.OPEN && this.isHealthy()) return 'connected';
		if (this.socket.readyState === WebSocket.CLOSED) return 'disconnected';
		return 'unstable';
	}

	
	
	// 7. Message cleanup and maintenance
	cleanupAcknowledgedMessages() {
		const now = Date.now();
		for (const [messageId, timestamp] of this.acknowledgedMessages.entries()) {
			if (now - timestamp > WebSocketManager.CONFIG.MESSAGE_RETENTION_PERIOD) {
				this.acknowledgedMessages.delete(messageId);
			}
		}
	}
	
	
    trackPendingMessage(messageId) {
        if (this.pendingMessages.has(messageId)) return;
        
        const timeout = setTimeout(() => {
            if (!this.acknowledgedMessages.has(messageId)) {
                this.handleMessageTimeout(messageId);
            }
        }, this.MESSAGE_TIMEOUT);

        this.pendingMessages.set(messageId, timeout);
    }

    handleMessageTimeout(messageId) {
        console.warn('[WS] Message timed out:', messageId);
        this.pendingMessages.delete(messageId);
        
        // Check connection health
        if (!this.isHealthy()) {
            this.forceReconnect();
        }
    }

    async processMessageQueue() {
        while (this.messageQueue.length > 0 && this.isHealthy()) {
            const message = this.messageQueue.shift();
            try {
                await this.send(message);
                await new Promise(resolve => setTimeout(resolve, 100)); // Prevent flooding
            } catch (error) {
                console.error('[WS] Error processing queued message:', error);
                this.messageQueue.unshift(message);
                break;
            }
        }
    }

    handleConnectionFailure() {
        this.cleanup();
        if (this.reconnectInterval < this.MAX_RECONNECT_INTERVAL) {
            this.reconnectInterval = Math.min(this.reconnectInterval * 2, this.MAX_RECONNECT_INTERVAL);
        }
        this.scheduleReconnection();
    }

    scheduleReconnection() {
        if (this.reconnecting) return;
        
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.reconnecting = true;
            if (!this.isConnected && !this.isConnecting) {
                this.connect();
            }
        }, this.reconnectInterval);
    }

    forceReconnect() {
        this.cleanup();
        this.connect();
    }




	// 10. Update cleanup method to include new resources
	cleanup() {
		console.log('[WS] Cleaning up resources');
		clearInterval(this.heartbeatInterval);
		clearTimeout(this.reconnectTimer);
    
		this.pendingMessages.forEach(timeout => clearTimeout(timeout));
		this.pendingMessages.clear();
		this.acknowledgedMessages.clear();
		this.messageQueue = [];
    
		this.errorCounts = {
			connection: 0,
			message: 0,
			heartbeat: 0
		};
    
		this.isConnected = false;
		this.isConnecting = false;
		this.reconnectAttempts = 0;
		this.rateLimitDelay = 1000;
	}


	// 11. Add periodic maintenance tasks
	startMaintenanceTasks() {
		setInterval(() => {
			this.cleanupAcknowledgedMessages();
			this.monitorHeartbeat();
			this.trackConnectionStatus();
		}, 30000); // Run every 30 seconds
	}




    waitForConnection() {
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (this.socket.readyState === WebSocket.OPEN) {
                    clearInterval(checkInterval);
                    resolve();
                } else if (this.socket.readyState === WebSocket.CLOSED || 
                          this.socket.readyState === WebSocket.CLOSING) {
                    clearInterval(checkInterval);
                    reject(new Error('Connection failed'));
                }
            }, 100);
        });
    }

    isHealthy() {
        return this.socket?.readyState === WebSocket.OPEN &&
               (Date.now() - this.lastPongTime) < (this.HEARTBEAT_INTERVAL * 1.5);
    }

    generateMessageId() {
        return `msg_${++this.lastMessageId}_${Date.now()}`;
    }

    registerHandler(messageType, handler) {
        this.messageHandlers.set(messageType, handler);
    }

    setStatusCallback(callback) {
        this.onStatusChange = callback;
    }

    destroy() {
        this.cleanup();
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}