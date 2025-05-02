// App.js - Main application orchestrator for RENT A HAL
import { WebSocketManager } from './managers/WebSocketManager.js';
import { SpeechManager } from './managers/SpeechManager.js';
import { GmailManager } from './managers/GmailManager.js';
import { VisionManager } from './managers/VisionManager.js';
import { WeatherManager } from './managers/WeatherManager.js';
import { UIManager } from './managers/UIManager.js';
import { CONFIG } from './config/Config.js';
import { helpers } from './utils/Helpers.js';
import { StorageService } from './services/StorageService.js';
import { EventBus } from './utils/EventBus.js';

export class RentAHalApp {
    constructor() {
        // Initialize core properties
        this.config = CONFIG;
        this.helpers = helpers;
        this.storage = StorageService;
        this.eventBus = new EventBus();
        
        // System state
        this.currentUser = null;
        this.huggingFaceModels = {};
        this.aiWorkers = {};
        this.isProcessing = false;
        this.statsUpdateInterval = null;
        this.wakeWordInitAttempts = 0;
        this.maxWakeWordInitAttempts = 3;
        this.currentQueryType = null;
        
        // Initialize managers in dependency order
        this.initializeManagers();
        
        // Connect event listeners
        this.setupEventListeners();
        
        // Start automatic initialization
        this.initialize();
    }
    
    /**
     * Initialize all manager components with proper dependency injection
     */
    initializeManagers() {
        // Initialize low-level managers first
        this.websocket = new WebSocketManager();
        this.registerWebSocketHandlers();
        
        // Initialize feature managers
        this.speech = new SpeechManager(this.websocket);
        this.vision = new VisionManager(this.websocket, this.speech);
        this.weather = new WeatherManager(this.websocket, this.speech);
        this.gmail = new GmailManager(this.websocket, this.speech);
        
        // Set up interdependencies
        this.speech.setVisionManager(this.vision);
        this.speech.setWeatherManager(this.weather);
        this.speech.setGmailManager(this.gmail);
        
        // Initialize UI last since it depends on other managers
        this.ui = new UIManager(this.websocket, this.vision, this.speech);
        
        // Make global for legacy compatibility (can be removed later)
        window.speechManager = this.speech;
        window.visionManager = this.vision;
        window.gmail = this.gmail;
    }
    
    /**
     * Register all required WebSocket event handlers
     */
    registerWebSocketHandlers() {
        // Register error handler
        this.websocket.registerHandler('error', (error) => {
            this.ui?.displayError(error);
        });
        
        // Register connection status handler
        this.websocket.setStatusCallback((status, isConnected) => {
            this.ui?.displayStatus(status);
        });

        // Register user info handler
        this.websocket.registerHandler('user_info', (data) => {
            this.handleUserInfo(data);
        });

        // Register previous queries handler
        this.websocket.registerHandler('previous_queries', (data) => {
            this.ui?.displayPreviousQueries(data);
        });

        // Register query result handler
        this.websocket.registerHandler('query_result', (result, processing_time, cost, result_type) => {
            this.handleQueryResult(result, processing_time, cost, result_type);
        });

        // Register queue update handler
        this.websocket.registerHandler('queue_update', (depth, total) => {
            this.ui?.updateQueueStatus(depth, total);
        });

        // Register system message handlers
        this.websocket.registerHandler('system_stats', (data) => {
            this.ui?.updateSystemStats(data);
        });

        this.websocket.registerHandler('sysop_message', (message) => {
            this.ui?.displaySysopMessage(message);
        });

        this.websocket.registerHandler('worker_update', (workers) => {
            this.aiWorkers = workers;
            this.ui?.handleWorkerUpdate(workers);
        });

        this.websocket.registerHandler('huggingface_update', (models) => {
            this.huggingFaceModels = models;
            this.ui?.handleHuggingFaceUpdate(models);
        });

        this.websocket.registerHandler('speech_result', (audio) => {
            this.speech.handleSpeechResult(audio);
        });

        this.websocket.registerHandler('transcription_result', (text) => {
            this.handleTranscriptionResult(text);
        });

        // Enhanced error handling with timeout detection
        this.websocket.registerHandler('timeout', (messageId) => {
            this.ui?.displayError(CONFIG.INTERFACE.ERRORS.TIMEOUT);
        });
    }
    
    /**
     * Set up global event listeners
     */
    setupEventListeners() {
        // Window-level event handling
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        window.addEventListener('unload', () => {
            this.cleanup();
        });

        // Document visibility changes
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden && !this.websocket.isHealthy()) {
                this.websocket.connect();
            }
        });
        
        // Global GAPI callback functions
        window.gapiLoaded = () => {
            if (this.gmail) {
                this.gmail.handleGapiLoaded();
            }
        };
        
        window.gisLoaded = () => {
            if (this.gmail) {
                this.gmail.handleGisLoaded();
            }
        };
    }
    
    /**
     * Initialize the application
     */
    async initialize() {
        try {
            // Establish WebSocket connection
            await this.websocket.connect();
            
            // Load preferences after UI is ready
            if (this.ui && typeof this.ui.loadPreferences === 'function') {
                this.ui.loadPreferences();
            } else {
                console.warn('UI preferences loading not available');
            }
            
            // Check for OAuth callback if Gmail is enabled
            this.gmail.checkForOAuthCallback();
            
            // Set up periodic system updates
            this.initializePeriodicUpdates();
            
            // Check for wake word activation
            const wakeWordPref = this.storage.getItem('wakeWordEnabled');
            if (wakeWordPref) {
                await this.initializeWakeWord();
            }
            
            console.log('RENT A HAL initialized successfully');
        } catch (error) {
            console.error("Error during initialization:", error);
            this.ui.displayError("Error initializing application. Please refresh the page.");
        }
    }
    
    /**
     * Initialize wake word detection with retry logic
     */
    async initializeWakeWord() {
        if (this.wakeWordInitAttempts >= this.maxWakeWordInitAttempts) {
            this.storage.setItem('wakeWordEnabled', false);
            this.ui.displayError("Failed to initialize wake word mode after multiple attempts.");
            return;
        }

        this.wakeWordInitAttempts++;

        try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            
            if (this.speech.wakeWordState === 'inactive') {
                const success = await this.speech.activateWakeWordMode();
                if (success) {
                    this.wakeWordInitAttempts = 0;
                    this.ui.updateWakeWordButton(true);
                } else {
                    throw new Error("Wake word activation failed");
                }
            }
        } catch (error) {
            console.error("Error initializing wake word mode:", error);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await this.initializeWakeWord();
        }
    }
    
    /**
     * Toggle wake word mode activation/deactivation
     */
    async toggleWakeWordMode() {
        if (!this.speech) {
            console.error("Speech manager not initialized");
            return false;
        }

        try {
            if (this.speech.wakeWordState === 'inactive') {
                const success = await this.speech.activateWakeWordMode();
                if (success) {
                    this.storage.setItem('wakeWordEnabled', true);
                    return true;
                }
                return false;
            } else {
                this.speech.deactivateWakeWordMode();
                this.storage.setItem('wakeWordEnabled', false);
                return true;
            }
        } catch (error) {
            console.error("Error toggling wake word mode:", error);
            this.ui.displayError("Error toggling wake word mode. Please refresh and try again.");
            return false;
        }
    }
    
    /**
     * Handle user information received from server
     */
    handleUserInfo(user) {
        this.currentUser = user;
        this.ui.updateUserInfo(user);
        this.ui.updateCumulativeCosts(user);
        
        if (user.is_sysop) {
            this.initializePeriodicUpdates();
        }
    }
    
    /**
     * Handle query results
     */
    async handleQueryResult(result, processing_time, cost, result_type) {
        this.isProcessing = false;
        
        if (this.speech.wakeWordState !== 'inactive') {
            if (result_type === 'image') {
                // Only check for weapons in vision mode, not imagine mode
                if (this.currentQueryType === 'vision' && this.helpers.checkForWeapons(result)) {
                    await this.speech.speakFeedback("WEAPON DETECTED - FACILITY LOCKED DOWN - POLICE RESPONDING", 
                        () => this.speech.deactivateWakeWordMode());
                } else {
                    await this.speech.speakFeedback("Image generated successfully.", 
                        () => this.speech.deactivateWakeWordMode());
                }
            } else {
                await this.speech.speakFeedback(result);
            }
        }

        this.ui.displayQueryResult(result, processing_time, cost, result_type);
        this.ui.updateCumulativeCosts(this.currentUser);
    }
    
    /**
     * Handle speech-to-text transcription results
     */
    handleTranscriptionResult(text) {
        if (this.ui.elements.promptInput) {
            this.ui.elements.promptInput.value = text;
            this.ui.displayStatus('Voice input transcribed. You can now submit the query.');
        }
    }
    
    /**
     * Submit a query to the server
     */
    submitQuery(event) {
        if (event) {
            event.preventDefault();
        }
        
        if (this.ui.validateForm()) {
            this.currentQueryType = this.ui.elements.queryType.value;
            this.ui.submitQuery();
        }
    }
    
    /**
     * Schedule periodic updates for system stats
     */
    initializePeriodicUpdates() {
        if (this.currentUser?.is_sysop) {
            if (this.statsUpdateInterval) {
                clearInterval(this.statsUpdateInterval);
            }
            this.statsUpdateInterval = setInterval(() => {
                if (this.websocket.isHealthy()) {
                    this.websocket.send({ type: 'get_stats' });
                }
            }, 30000);
        }
    }
    
    /**
     * Clean up resources when the app is shutting down
     */
    cleanup() {
        if (this.websocket) {
            this.websocket.destroy();
        }
        
        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
        }
        
        if (this.speech && this.speech.wakeWordState !== 'inactive') {
            this.speech.deactivateWakeWordMode();
        }
        
        if (this.ui) {
            this.ui.savePreferences();
        }
        
        // Signal to all managers to perform cleanup
        this.eventBus.publish('app:cleanup');
    }
    
    /**
     * Check if the WebSocket connection is healthy
     */
    isWebSocketHealthy() {
        return this.websocket?.isHealthy() || false;
    }
    
    /**
     * Check if wake word mode is enabled
     */
    isWakeWordEnabled() {
        return this.speech && this.speech.wakeWordState !== 'inactive';
    }
}

// EventBus implementation
export class EventBus {
    constructor() {
        this.events = {};
    }
    
    subscribe(eventName, callback) {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }
        this.events[eventName].push(callback);
        return () => this.unsubscribe(eventName, callback);
    }
    
    publish(eventName, data) {
        if (!this.events[eventName]) {
            return;
        }
        this.events[eventName].forEach(callback => callback(data));
    }
    
    unsubscribe(eventName, callback) {
        if (!this.events[eventName]) {
            return;
        }
        this.events[eventName] = this.events[eventName]
            .filter(cb => cb !== callback);
    }
}

// Create a single entry point for the application
document.addEventListener('DOMContentLoaded', () => {
    window.rentAHal = new RentAHalApp();
});

export default RentAHalApp;