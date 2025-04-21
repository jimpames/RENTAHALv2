import { WebSocketManager } from './managers/WebSocketManager.js';
import { SpeechManager } from './managers/SpeechManager.js';
import { GmailManager } from './managers/GmailManager.js';
import { VisionManager } from './managers/VisionManager.js';
import { WeatherManager } from './managers/WeatherManager.js';
import { UIManager } from './managers/UIManager.js';
import { CONFIG } from './config/config.js';
import { helpers } from './utils/helpers.js';
import { StorageService } from './services/StorageService.js';

export class RentAHalApp {
    constructor() {
        this.config = CONFIG;
        this.helpers = helpers;
        this.storage = StorageService;
        
        // Initialize WebSocket with enhanced error handling
        this.websocket = new WebSocketManager();
        this.initializeWebSocket();
        
        // Initialize other managers
        this.speech = new SpeechManager(this.websocket);
        this.vision = new VisionManager(this.websocket, this.speech);
        this.weather = new WeatherManager(this.websocket, this.speech);
        this.gmail = new GmailManager(this.websocket, this.speech);
        
        // Connect managers that need to communicate
        this.speech.vision = this.vision;
        this.speech.weather = this.weather;
        
        // Initialize UI last since it depends on other managers
        this.ui = new UIManager(this.websocket, this.vision, this.speech);
        
        // Initialize state tracking
        this.currentUser = null;
        this.huggingFaceModels = {};
        this.aiWorkers = {};
        this.isProcessing = false;
        this.statsUpdateInterval = null;
        this.wakeWordInitAttempts = 0;
        this.maxWakeWordInitAttempts = 3;
        this.currentQueryType = null;
		
        // Immediately initialize the application
        this.initialize();
		
    }
	
	
    initializeWebSocket() {
        // Register error handler
        this.websocket.registerHandler('error', (error) => {
            this.ui?.displayError(error);
        });
        
        // Register connection status handler
        this.websocket.setStatusCallback((status, isConnected) => {
            this.ui.displayStatus(status);
        });

        // Register system message handlers
        this.websocket.registerHandler('system_stats', (data) => {
            this.ui?.updateSystemStats(data);
        });

        // Enhanced error handling for timeout conditions
        this.websocket.registerHandler('timeout', (messageId) => {
            this.ui?.displayError(CONFIG.INTERFACE.ERRORS.TIMEOUT);
        });
    }

	
	
	
    
    async initialize() {
        try {
            await this.websocket.connect();
			// Then load preferences and check for OAuth callback
            // Load and apply preferences
            if (this.ui && typeof this.ui.loadPreferences === 'function') {
                this.ui.loadPreferences();
            } else {
                console.warn('UI preferences loading not available');
            }
            this.ui.loadPreferences();
            this.gmail.checkForOAuthCallback();
            this.setupWindowListeners();
            this.initializePeriodicUpdates();
            
            const wakeWordPref = this.storage.getItem('wakeWordEnabled');
            if (wakeWordPref) {
                await this.initializeWakeWord();
            }
        } catch (error) {
            console.error("Error during initialization:", error);
            this.ui.displayError("Error initializing application. Please refresh the page.");
        }
    }











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

    registerWebSocketHandlers() {
        this.websocket.registerHandler('user_info', (data) => {
            this.handleUserInfo(data);
        });

        this.websocket.registerHandler('previous_queries', (data) => {
            this.ui.displayPreviousQueries(data);
        });

        this.websocket.registerHandler('query_result', (result, processing_time, cost, result_type) => {
            this.handleQueryResult(result, processing_time, cost, result_type);
        });

        this.websocket.registerHandler('queue_update', (depth, total) => {
            this.ui.updateQueueStatus(depth, total);
        });


		this.websocket.registerHandler('sysop_message', (message) => {
			this.ui.displaySysopMessage(message);
		});

        this.websocket.registerHandler('system_stats', (data) => {
            this.ui.updateSystemStats(data);
        });

        this.websocket.registerHandler('worker_update', (workers) => {
            this.aiWorkers = workers;
            this.ui.handleWorkerUpdate(workers);
        });

        this.websocket.registerHandler('huggingface_update', (models) => {
            this.huggingFaceModels = models;
            this.ui.handleHuggingFaceUpdate(models);
        });

        this.websocket.registerHandler('speech_result', (audio) => {
            this.speech.handleSpeechResult(audio);
        });

        this.websocket.registerHandler('transcription_result', (text) => {
            this.handleTranscriptionResult(text);
        });

        this.websocket.registerHandler('error', (message) => {
            this.ui.displayError(message);
        });
    }

    handleUserInfo(user) {
        this.currentUser = user;
        this.ui.updateUserInfo(user);
        this.ui.updateCumulativeCosts(user);
    }

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

    handleTranscriptionResult(text) {
        if (this.ui.elements.promptInput) {
            this.ui.elements.promptInput.value = text;
            this.ui.displayStatus('Voice input transcribed. You can now submit the query.');
        }
    }

    submitQuery(event) {
        if (event) {
            event.preventDefault();
        }
        
        if (this.ui.validateForm()) {
            this.currentQueryType = this.ui.elements.queryType.value;
            this.ui.submitQuery();
        }
    }

    setupWindowListeners() {
        // Add WebSocket specific window listeners
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden && !this.websocket.isHealthy()) {
                this.websocket.connect();
            }
        });

        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        window.addEventListener('unload', () => {
            this.cleanup();
        });
    }

    
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

    cleanup() {
		if (this.websocket) {
            this.websocket.destroy();
        }
        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
        }
        // ... rest of cleanup
        if (this.speech && this.speech.wakeWordState !== 'inactive') {
            this.speech.deactivateWakeWordMode();
        }

        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
        }

        this.ui.savePreferences();
    }


	
    isWebSocketHealthy() {
        return this.websocket?.isHealthy() || false;
    }


    isWakeWordEnabled() {
        return this.speech && this.speech.wakeWordState !== 'inactive';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.rentAHal = new RentAHalApp();
});

export default RentAHalApp;