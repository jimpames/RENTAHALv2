// Restored from script.js with full feature parity
import { CONFIG } from '../config/config.js';
import { helpers } from '../utils/helpers.js';
import { StorageService } from '../services/StorageService.js';

export class UIManager {
	
	
	// 1. Add these configuration constants at the top of UIManager class
	static CONFIG = {
		MAX_RETRY_ATTEMPTS: 3,
		RETRY_DELAY: 1000,
		PREVIEW_DURATION: 10000,
		MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
		INACTIVITY_TIMEOUT: 15000,
		ANIMATION_FRAME_RATE: 1000 / 60,
		UI_UPDATE_INTERVAL: 100
	};
	
	
	
    constructor(websocketManager, visionManager, speechManager) {
        // Manager references
        this.websocket = websocketManager;
        this.vision = visionManager;
        this.speech = speechManager;
        
		
		
		// UI State tracking
		this.uiState = {
			lastAction: null,
			lastError: null,
			isProcessing: false,
			modalOpen: false,
			activeTab: 'chat',
			pendingUploads: new Set(),
			messageQueue: [],
			processingQueue: false,
			lastUpdateTime: Date.now()
		};
		
		
		
		
		
		
		
		
		
		
		
        // State management
        this.currentUser = null;
        this.aiWorkers = {};
        this.huggingFaceModels = {};
        this.isProcessing = false;
        this.preferences = StorageService.loadPreferences();
        
		
		// Performance optimization
		this.updateQueue = [];
		this.rafScheduled = false;
		this.resizeTimer = null;
		this.updateTimer = null;

		// Resource tracking
		this.audioContext = null;
		this.analyser = null;
		this.animationId = null;
		this.audioQueue = [];
		this.retryCount = 0;
		this.mediaResources = new Set();

		this.initialize();
		
		
		
		
		
		// In UIManager constructor:

		// Register WebSocket handlers
		this.websocket.registerHandler('worker_update', (message) => {
			console.log("Workers received:", message);
    
			if (message && message.workers) {
				this.aiWorkers = message.workers;
				this.updateWorkerList(message.workers);
        
				// Force initial setup
				this.elements.queryType.value = 'chat';
				this.elements.modelType.value = 'worker_node';
				this.handleQueryTypeChange();
				this.updateModelSelect();
			} else {
				console.warn('Malformed worker update message received');
			}
		});




		// Inside UIManager constructor, add this with the other websocket handlers:
		this.websocket.registerHandler('transcription_result', (message) => {
			console.log("Received transcription:", message);
			if (this.elements.promptInput && message.text) {
				this.elements.promptInput.value = message.text;
				this.displayStatus('Voice input transcribed. You can now submit the query.');
			}
		});






		// With the other handlers, after websocket init
		this.websocket.registerHandler('query_result', (result, processing_time, cost, result_type) => {
			console.log("Query result received:", { result, processing_time, cost, result_type });
			this.displayQueryResult(result, processing_time, cost, result_type);
		});


		this.websocket.registerHandler('previous_queries', (queries) => {
			console.log("Previous queries received:", queries);
			this.displayPreviousQueries(queries);
		});


		// In UIManager constructor:

		this.websocket.registerHandler('sysop_message', (message) => {
			const messageElement = document.createElement('div');
			messageElement.textContent = `Sysop Message: ${message.message}`;
			messageElement.className = 'mb-4 p-4 bg-yellow-100 rounded';
			this.elements.results.prepend(messageElement);
		});



		this.websocket.registerHandler('huggingface_update', (models) => {
			console.log("Models received:", models);
			this.huggingFaceModels = models;
			this.updateModelSelect();
			this.handleHuggingFaceUpdate(models);
		});
		
		
        // Audio handling
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.canvasCtx = null;
        this.animationId = null;
        
        // Voice recording state
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        
        // Initialize DOM elements and event handlers
        this.#initializeElements();
        this.#setupEventListeners();
        this.#initializeAccessibility();
        
        // Performance optimization
        this.updateQueue = [];
        this.rafScheduled = false;
        
        // Apply initial preferences
        this.applyPreferences();
    }

    // Complete DOM element initialization restored from script.js lines 142-197
    #initializeElements() {
        this.elements = {
            // User interface elements
            userInfo: document.getElementById('user-info'),
            nicknameInput: document.getElementById('nickname-input'),
            setNicknameButton: document.getElementById('set-nickname'),
            promptInput: document.getElementById('prompt-input'),
            queryType: document.getElementById('query-type'),
            modelType: document.getElementById('model-type'),
            modelSelect: document.getElementById('model-select'),
            
            // File handling elements
            imageUpload: document.getElementById('image-upload'),
            imagePreview: document.getElementById('image-preview'),
            previewImg: document.getElementById('preview-img'),
            imageDropZone: document.getElementById('image-drop-zone'),
            
            // Control elements
            submitQueryButton: document.getElementById('submit-query'),
            voiceInputButton: document.getElementById('voice-input-button'),
            speechOutputCheckbox: document.getElementById('speech-output-checkbox'),
            clearResultsButton: document.getElementById('clear-results'),
            toggleWakeWordButton: document.getElementById('toggle-wake-word'),
            
            // Display elements
            results: document.getElementById('results'),
            queueThermometer: document.getElementById('queue-thermometer'),
            previousQueries: document.getElementById('previous-queries'),
            connectionStatus: document.getElementById('connection-status'),
            audioWaveform: document.getElementById('audioWaveform'),
            
            // System elements
            sysopPanel: document.getElementById('sysop-panel'),
            gmailAuthPrompt: document.getElementById('gmailAuthPrompt'),
            systemStats: document.getElementById('system-stats'),
            workerList: document.getElementById('worker-list'),
            huggingFaceModelList: document.getElementById('huggingface-model-list'),
            userList: document.getElementById('user-list'),
            cumulativeCosts: document.getElementById('cumulative-costs'),
            
            // Admin elements
            sysopMessageInput: document.getElementById('sysop-message-input'),
            sendSysopMessageButton: document.getElementById('send-sysop-message'),
            activeUsersTable: document.getElementById('active-users-table')?.getElementsByTagName('tbody')[0],
            workerHealthDisplay: document.getElementById('worker-health')
        };

        // Validate critical elements
        this.validateElements();
    }


	setupEventHandlers() {
		this.elements.submitQueryButton?.addEventListener('click', this.handleSubmit.bind(this));
		window.addEventListener('resize', this.handleResize.bind(this));
		document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
	}

	handleKeyboardShortcuts(e) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			e.preventDefault();
			this.handleSubmit();
		}
	}

	handleResize() {
		clearTimeout(this.resizeTimer);
		this.resizeTimer = setTimeout(() => {
			this.adjustLayout();
			this.redrawVisualizations();
		}, 250);
	}



	// 3. Add initialization method
	initialize() {
		this.#initializeElements();
		this.#setupEventListeners();
		this.#initializeAccessibility();
		this.setupPerformanceMonitoring();
		this.initializeAudioContext();
		this.loadPreferences();
	}




	// 6. Add missing audio handling methods
	initializeAudioContext() {
		try {
			this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
			this.analyser = this.audioContext.createAnalyser();
			this.analyser.fftSize = 2048;
			this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
		} catch (error) {
			console.error('Error initializing audio context:', error);
		}
	}



	// 8. Add performance monitoring
	setupPerformanceMonitoring() {
		let lastUpdate = performance.now();
    
		const checkPerformance = () => {
			const now = performance.now();
			const timeSinceLastUpdate = now - lastUpdate;
        
			if (timeSinceLastUpdate > UIManager.CONFIG.UI_UPDATE_INTERVAL * 2) {
				console.warn('UI updates are delayed:', timeSinceLastUpdate);
				this.handlePerformanceIssue(timeSinceLastUpdate);
			}
        
			lastUpdate = now;
			requestAnimationFrame(checkPerformance);
		};
    
		requestAnimationFrame(checkPerformance);
	}



	handlePerformanceIssue(delay) {
		// Clear non-essential animations
		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
    
		// Process any pending updates
		if (this.updateQueue.length > 0) {
			this.processUpdates();
		}
    
		console.log('Performance recovery executed for delay:', delay);
	}





	setupChatMode() {
		if (!this.elements.queryType || !this.elements.modelType || !this.elements.modelSelect) {
			console.error('Required elements not found for chat mode');
			return false;
		}

		try {
			this.elements.queryType.value = "chat";
			this.elements.modelType.value = "worker_node";
			this.elements.modelSelect.value = "2070sLABCHAT";
        
			// Handle optional prompt input
			if (this.elements.promptInput) {
				this.elements.promptInput.value = '';
				this.elements.promptInput.disabled = false;
			}

			// Update model selection and trigger change event
			this.updateModelSelect();
			this.elements.queryType.dispatchEvent(new Event('change'));
			return true;
		} catch (error) {
			console.error('Error setting up chat mode:', error);
			return false;
		}
	}

	setupVisionMode() {
		if (!this.elements.queryType || !this.elements.modelType) {
			console.error('Required elements not found for vision mode');
			return false;
		}

		try {
			this.elements.queryType.value = "vision";
			this.elements.modelType.value = "worker_node";
        
			// Handle file upload elements
			if (this.elements.imageUpload) {
				this.elements.imageUpload.style.display = 'block';
			}
        
			if (this.elements.voiceInputButton) {
				this.elements.voiceInputButton.style.display = 'none';
			}
        
			if (this.elements.promptInput) {
				this.elements.promptInput.disabled = false;
			}

			// Update model selection and trigger change event
			this.updateModelSelect();
			this.elements.queryType.dispatchEvent(new Event('change'));
			return true;
		} catch (error) {
			console.error('Error setting up vision mode:', error);
			return false;
		}
	}

	setupImagineMode() {
		if (!this.elements.queryType || !this.elements.modelType || !this.elements.modelSelect) {
			console.error('Required elements not found for imagine mode');
			return false;
		}

		try {
			this.elements.queryType.value = "imagine";
			this.elements.modelType.value = "worker_node";
			this.elements.modelSelect.value = "imagine2060";
        
			// Handle optional prompt input
			if (this.elements.promptInput) {
				this.elements.promptInput.value = '';
				this.elements.promptInput.disabled = false;
			}
        
			// Handle file upload elements
			if (this.elements.imageUpload) {
			this.elements.imageUpload.style.display = 'none';
			}
        
			if (this.elements.voiceInputButton) {
				this.elements.voiceInputButton.style.display = 'none';
			}

			// Update model selection and trigger change event
			this.updateModelSelect();
			this.elements.queryType.dispatchEvent(new Event('change'));
			return true;
		} catch (error) {
			console.error('Error setting up imagine mode:', error);
			return false;
		}
	}

	setupWeatherMode() {
		// Weather mode doesn't require UI updates but we should validate weather service
		try {
			if (!this.weather) {
				console.error('Weather service not available');
				return false;
			}
			return true;
		} catch (error) {
			console.error('Error setting up weather mode:', error);
			return false;
		}
	}

	setupGmailMode() {
		// Gmail mode doesn't require UI updates but we should validate Gmail service
		try {
			if (!window.gmail) {
				console.error('Gmail service not available');
				return false;
			}
			return true;
		} catch (error) {
			console.error('Error setting up Gmail mode:', error);
			return false;
		}
	}

	// Helper method to reset all UI elements to default state
	resetUIElements() {
		try {
			if (this.elements.promptInput) {
				this.elements.promptInput.value = '';
				this.elements.promptInput.disabled = false;
			}
	
			if (this.elements.imageUpload) {
				this.elements.imageUpload.value = '';
				this.elements.imageUpload.style.display = 'none';
			}

			if (this.elements.imagePreview) {
				this.elements.imagePreview.style.display = 'none';
			}

			if (this.elements.voiceInputButton) {
				this.elements.voiceInputButton.style.display = 'none';
			}

			return true;
		} catch (error) {
			console.error('Error resetting UI elements:', error);
			return false;
		}
	}








	// Add to UIManager class
	async toggleWakeWordMode() {
		if (!this.speech) {
			console.error("Speech manager not initialized");
			return;
		}

		try {
			if (this.speech.wakeWordState === 'inactive') {
				await this.speech.activateWakeWordMode();
				this.elements.toggleWakeWordButton.textContent = "Disable Wake Word Mode";
				this.elements.toggleWakeWordButton.classList.remove('bg-blue-500');
				this.elements.toggleWakeWordButton.classList.add('bg-red-500');
			} else {
				this.speech.deactivateWakeWordMode();
				this.elements.toggleWakeWordButton.textContent = "Enable Wake Word Mode";
				this.elements.toggleWakeWordButton.classList.remove('bg-red-500');
				this.elements.toggleWakeWordButton.classList.add('bg-blue-500');
			}
		} catch (error) {
			console.error("Error toggling wake word mode:", error);
			this.displayError("Error toggling wake word mode. Please refresh and try again.");
		}
	}





	async toggleWakeWordMode() {
		if (!this.speech) {
			console.error("Speech manager not initialized");
			return;
		}

		try {
			if (this.speech.wakeWordState === 'inactive') {
				await this.speech.activateWakeWordMode();
				this.elements.toggleWakeWordButton.textContent = "Disable Wake Word Mode";
				this.elements.toggleWakeWordButton.classList.remove('bg-blue-500');
				this.elements.toggleWakeWordButton.classList.add('bg-red-500');
			} else {
				this.speech.deactivateWakeWordMode();
				this.elements.toggleWakeWordButton.textContent = "Enable Wake Word Mode";
				this.elements.toggleWakeWordButton.classList.remove('bg-red-500');
				this.elements.toggleWakeWordButton.classList.add('bg-blue-500');
			}
		} catch (error) {
			console.error("Error toggling wake word mode:", error);
			this.displayError("Error toggling wake word mode. Please try again.");
		}
	}








// Add these methods to UIManager class

	loadPreferences() {
		const preferences = StorageService.loadPreferences();
		if (preferences.theme === 'dark') {
			document.documentElement.classList.add('dark');
		}
    
		if (preferences.fontSize) {
			document.body.style.fontSize = preferences.fontSize;
		}

		if (this.elements.speechOutputCheckbox) {
			this.elements.speechOutputCheckbox.checked = preferences.speechOutput;
		}

		// Check for wakeword preference
		if (preferences.wakeWordEnabled && this.elements.toggleWakeWordButton) {
			this.elements.toggleWakeWordButton.click();
		}
	}

	savePreferences() {
		const preferences = {
			theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
			fontSize: document.body.style.fontSize || '16px',
			speechOutput: this.elements.speechOutputCheckbox?.checked || false,
			wakeWordEnabled: this.speech?.wakeWordState !== 'inactive'
		};
		StorageService.savePreferences(preferences);
	}

	applyPreferences() {
		const preferences = StorageService.loadPreferences();
		if (preferences.theme === 'dark') {
			document.documentElement.classList.add('dark');
		}
		
		if (preferences.fontSize) {
			document.body.style.fontSize = preferences.fontSize;
		}

		if (this.elements.speechOutputCheckbox) {
			this.elements.speechOutputCheckbox.checked = preferences.speechOutput;
		}
	}










	// Form validation
	validateFormData(formData) {
		if (!formData) return false;
		if (!formData.prompt && !formData.image && !formData.audio) return false;
		if (formData.image && !this.validateFileSize(formData.image)) return false;
		return true;
	}

	handleSystemError(error) {
		console.error('System error:', error);
		this.uiState.lastError = error;
		this.displayError(error.message || error, true);
		this.handleErrorRecovery();
	}





	validateFormData(formData) {
		if (!formData) return false;
		if (!formData.prompt && !formData.image && !formData.audio) return false;
		if (formData.image && !this.validateFileSize(formData.image)) return false;
		return true;
	}

	validateFileSize(file) {
		return file.size <= CONFIG.MAX_UPLOAD_SIZE;
	}


	handleSystemError(error) {
		console.error('System error:', error);
		this.uiState.lastError = error;
		this.displayError(error.message || error, true);
		this.handleErrorRecovery();
	}

	handleErrorRecovery() {
		if (++this.retryCount >= UIManager.CONFIG.MAX_RETRY_ATTEMPTS) {
			this.displayError('Maximum retry attempts reached. Please refresh the page.');
			return;
		}

		setTimeout(() => {
			this.enableInterface();
			this.clearPendingUploads();
			if (this.uiState.processingQueue) {
				this.uiState.processingQueue = false;
				this.processMessageQueue();
			}
		}, UIManager.CONFIG.RETRY_DELAY);
	}


	clearPendingUploads() {
		this.uiState.pendingUploads.clear();
		this.updateProgressBars();
	}

	clearMessageQueue() {
		this.messageQueue = [];
		this.processingQueue = false;
	}




	handleFileUpload(file, type) {
		if (!this.validateFileSize(file)) {
			throw new Error('File too large');
		}
    
		this.uiState.pendingUploads.add({
			id: Date.now(),
			file,
			type,
			progress: 0
		});
    
		return this.processUpload(file, type);
	}

	async processUpload(file, type) {
		const chunkSize = 1024 * 1024; // 1MB chunks
		const totalChunks = Math.ceil(file.size / chunkSize);
    
		for (let i = 0; i < totalChunks; i++) {
			const chunk = file.slice(i * chunkSize, (i + 1) * chunkSize);
			await this.sendChunk(chunk, i, totalChunks);
			this.updateUploadProgress(file, (i + 1) / totalChunks);
		}
	}





	adjustLayout() {
		const isMobile = window.innerWidth < 768;
		this.elements.mainContainer?.classList.toggle('mobile-layout', isMobile);
		this.elements.sidebar?.classList.toggle('hidden', isMobile);
	}

	updateProgressBars() {
		this.uiState.pendingUploads.forEach(upload => {
			const progressBar = document.getElementById(`progress-${upload.id}`);
			if (progressBar) {
				progressBar.style.width = `${upload.progress * 100}%`;
			}
		});
	}

	toggleLoadingState(isLoading) {
		this.uiState.isProcessing = isLoading;
		this.elements.submitQueryButton.disabled = isLoading;
		this.elements.loadingIndicator?.classList.toggle('hidden', !isLoading);
	}



	// 9. Add message queue processing
	queueMessage(message) {
		this.uiState.messageQueue.push(message);
		if (!this.uiState.processingQueue) {
			this.processMessageQueue();
		}
	}
	
	
	
	async processMessageQueue() {
		if (this.uiState.processingQueue) return;
		this.uiState.processingQueue = true;
    
		while (this.uiState.messageQueue.length > 0) {
			const message = this.uiState.messageQueue.shift();
			try {
				await this.displayMessage(message);
				await new Promise(resolve => setTimeout(resolve, 100)); // Prevent UI blocking
			} catch (error) {
				console.error('Error processing message:', error);
				this.handleSystemError(error);
			}
		}
    
		this.uiState.processingQueue = false;
	}




	// 10. Update display methods with retry logic
	async displayMessage(message) {
		let attempts = 0;
		while (attempts < UIManager.CONFIG.MAX_RETRY_ATTEMPTS) {
			try {
				const element = this.createMessageElement(message);
				this.scheduleUpdate(() => {
					this.elements.results.prepend(element);
					this.highlightCode(element);
				});
				return;
			} catch (error) {
				console.error(`Display attempt ${attempts + 1} failed:`, error);
				attempts++;
				if (attempts === UIManager.CONFIG.MAX_RETRY_ATTEMPTS) {
					throw error;
				}
				await new Promise(resolve => setTimeout(resolve, UIManager.CONFIG.RETRY_DELAY));
			}
		}
	}




	// 11. Add state management utilities
	handleStateChange(newState) {
		const oldState = { ...this.uiState };
		this.uiState = { ...this.uiState, ...newState };
    
		// Log state changes if in development
		if (process.env.NODE_ENV === 'development') {
			console.log('State change:', {
				old: oldState,
				new: this.uiState,
				changed: Object.keys(newState)
			});
		}
    
		this.updateUIForState(this.uiState);
	}



	updateUIForState(state) {
		// Update UI elements based on state
		this.elements.submitQueryButton.disabled = state.isProcessing;
		this.elements.promptInput.disabled = state.isProcessing || state.modalOpen;
    
		// Update visual indicators
		if (state.isProcessing) {
			this.showLoadingIndicator();
		} else {
			this.hideLoadingIndicator();
		}
    
		// Handle modal state
		if (state.modalOpen) {
			this.disableBackgroundInteraction();
		} else {
			this.enableBackgroundInteraction();
		}
	}



	showLoadingIndicator() {
		// Implementation depends on your UI design
		const indicator = document.createElement('div');
		indicator.className = 'loading-indicator';
		// Add loading animation
		this.elements.mainContainer?.appendChild(indicator);
	}

	hideLoadingIndicator() {
		const indicator = document.querySelector('.loading-indicator');
		indicator?.remove();
	}


	// 12. Add these methods to your existing class
	disableBackgroundInteraction() {
		document.body.style.overflow = 'hidden';
		this.elements.mainContainer?.classList.add('pointer-events-none');
	}

	enableBackgroundInteraction() {
		document.body.style.overflow = '';
		this.elements.mainContainer?.classList.remove('pointer-events-none');
	}



    // Event listener setup restored from script.js lines 458-492
    #setupEventListeners() {
        // Form submission
        if (this.elements.submitQueryButton) {
            this.elements.submitQueryButton.addEventListener('click', (e) => this.handleSubmitQuery(e));
        }

        // Query type changes
        if (this.elements.queryType) {
            this.elements.queryType.addEventListener('change', () => this.handleQueryTypeChange());
        }

        // Model changes
        if (this.elements.modelType) {
            this.elements.modelType.addEventListener('change', () => this.handleModelTypeChange());
        }

        // File handling
        if (this.elements.imageUpload) {
            this.elements.imageUpload.addEventListener('change', (e) => this.handleImageUpload(e));
        }

        // Voice input
        if (this.elements.voiceInputButton) {
            this.elements.voiceInputButton.addEventListener('click', () => this.toggleVoiceRecording());
        }

        // Wake word toggle
        if (this.elements.toggleWakeWordButton) {
            this.elements.toggleWakeWordButton.addEventListener('click', () => this.toggleWakeWordMode());
        }

        // Nickname setting
        if (this.elements.setNicknameButton) {
            this.elements.setNicknameButton.addEventListener('click', () => this.setNickname());
        }

        // Results clearing
        if (this.elements.clearResultsButton) {
            this.elements.clearResultsButton.addEventListener('click', () => this.clearResults());
        }

        // Sysop message sending
        if (this.elements.sendSysopMessageButton) {
            this.elements.sendSysopMessageButton.addEventListener('click', () => this.sendSysopMessage());
        }

        // Drag and drop handling
        if (this.elements.imageDropZone) {
            this.setupDragAndDrop();
        }

        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Window resize handling
        window.addEventListener('resize', () => this.handleResize());
        
        // Visibility change handling
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    }

    // Accessibility initialization restored from script.js lines 1120-1150
    #initializeAccessibility() {
        const ariaLabels = {
            submitQueryButton: 'Submit Query',
            imageUpload: 'Upload Image for Vision Query',
            voiceInputButton: 'Toggle Voice Recording',
            toggleWakeWordButton: 'Toggle Wake Word Mode',
            clearResultsButton: 'Clear Results',
            sysopMessageInput: 'Sysop Message Input',
            sendSysopMessageButton: 'Send Sysop Message'
        };

        Object.entries(ariaLabels).forEach(([elementName, label]) => {
            if (this.elements[elementName]) {
                this.elements[elementName].setAttribute('aria-label', label);
            }
        });

        // Add role attributes
        if (this.elements.results) {
            this.elements.results.setAttribute('role', 'log');
            this.elements.results.setAttribute('aria-live', 'polite');
        }

        if (this.elements.queueThermometer) {
            this.elements.queueThermometer.setAttribute('role', 'progressbar');
        }
    }


	// 4. Add missing form validation methods
	validateForm() {
		const formData = {
			prompt: this.elements.promptInput?.value.trim(),
			image: this.elements.imageUpload?.files[0],
			audio: this.audioChunks
		};

		if (!this.validateFormData(formData)) {
			this.displayError('Please check your input and try again');
			return false;
		}

		const queryType = this.elements.queryType.value;
    
		// Vision query validation
		if (queryType === 'vision') {
			if (!this.elements.imageUpload?.files[0]) {
				this.displayError('Please upload an image for vision queries');
				return false;
			}
			if (!this.validateFileUploads()) {
				return false;
			}
		}

		// Speech query validation
		if (queryType === 'speech' && !formData.prompt) {
			this.displayError('Please record your message first');
			return false;
		}

		// Model selection validation
		if (!this.validateModelSelection()) {
			return false;
		}

		return true;
	}

	validateFormData(formData) {
		if (!formData) return false;
		if (!formData.prompt && !formData.image && !formData.audio) return false;
		
		if (formData.image && !this.validateFileSize(formData.image)) {
			this.displayError('File size exceeds maximum allowed');
			return false;
		}
    
		return true;
	}

	validateFileUploads() {
		const file = this.elements.imageUpload?.files[0];
		if (file) {
			if (!file.type.startsWith('image/')) {
				this.displayError('File must be an image');
				return false;
			}
			if (file.size > UIManager.CONFIG.MAX_FILE_SIZE) {
				this.displayError('File size exceeds maximum allowed (5MB)');
				return false;
			}
		}
		return true;
	}


	    // Missing Error Recovery Function
    async handleFormError(error) {
		console.error('Form error:', error);
		this.uiState.lastError = error;
		this.displayError(error.message || 'An error occurred processing your request');
		this.resetForm();
		this.enableInterface();
	}


	validateModelSelection() {
		if (!this.elements.modelSelect.value) {
			this.displayError('Please select a model');
			return false;
		}
		return true;
	}




	async handleSubmitQuery(event) {
		if (event) {
			event.preventDefault();
		}
    
		// Add missing form validation
		const formData = {
			prompt: this.elements.promptInput.value.trim(),
			image: this.elements.imageUpload?.files[0],
			audio: this.audioChunks
		};

		if (!this.validateFormData(formData)) {
			this.displayError('Please check your input and try again');
			return;
		}

		if (!this.validateForm()) {
			return;
		}

		const query = {
			prompt: this.elements.promptInput.value.trim(),
			query_type: 'chat',  // Force to chat type when submitting speech transcription
			model_type: 'worker_node',
			model_name: '2070sLABCHAT'  // Use default chat model
		};

		try {
			this.disableInterface();

			// Simplify the submission logic - treat transcribed speech as chat
			if (this.elements.queryType.value === 'vision' && this.elements.imageUpload.files[0]) {
				await this.handleVisionQuery(query);
			} else {
				// All other queries, including transcribed speech, go as chat
				await this.websocket.send({
					type: 'submit_query',
					query: query
				});
			}
	
			this.clearForm();
		} catch (error) {
			this.displayError(`Error submitting query: ${error.message}`);
		} finally {
			this.enableInterface();
		}
	}	
	
	
	// In UIManager.js
	async handleVisionQuery(query) {
		try {
			const processedImage = await this.vision.handleImageUpload(this.elements.imageUpload.files[0]);
			if (!processedImage || !processedImage.startsWith('data:image/')) {
				throw new Error('Invalid processed image data');
			}
        
			query.image = processedImage.split(',')[1];  // Remove data URL prefix
			await this.websocket.send({
				type: 'submit_query',
				query: query
			});
		} catch (error) {
			console.error('Error in vision query:', error);
			throw new Error(`Error processing vision query: ${error.message}`);
		}
	}
	
	
    // Interface state management
    disableInterface() {
        this.isProcessing = true;
        Object.values(this.elements).forEach(element => {
            if (element && element.tagName && !element.classList.contains('status-element')) {
                element.disabled = true;
            }
        });
    }

    enableInterface() {
        this.isProcessing = false;
        Object.values(this.elements).forEach(element => {
            if (element && element.tagName && !element.classList.contains('status-element')) {
                element.disabled = false;
            }
        });
    }

    // Display updates with performance optimization
    scheduleUpdate(updateFn) {
        this.updateQueue.push(updateFn);
        if (!this.rafScheduled) {
            this.rafScheduled = true;
            requestAnimationFrame(() => this.processUpdates());
        }
    }

    processUpdates() {
        const updates = this.updateQueue;
        this.updateQueue = [];
        this.rafScheduled = false;
        
        for (const update of updates) {
            update();
        }
    }

    // Display methods restored from script.js lines 810-850
    displayError(message, duration = 5000) {
        const errorElement = document.createElement('div');
        errorElement.textContent = `Error: ${message}`;
        errorElement.className = 'mb-4 p-4 bg-red-100 rounded';
        
        this.scheduleUpdate(() => {
            this.elements.results.prepend(errorElement);
            if (duration) {
                setTimeout(() => errorElement.remove(), duration);
            }
        });
    }

    displayStatus(message) {
        const statusElement = document.createElement('div');
        statusElement.textContent = message;
        statusElement.className = 'mb-4 p-4 bg-blue-100 rounded';
        
        this.scheduleUpdate(() => {
            this.elements.results.prepend(statusElement);
        });
    }

    displaySysopMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.textContent = `Sysop Message: ${message}`;
        messageElement.className = 'mb-4 p-4 bg-yellow-100 rounded';
        
        this.scheduleUpdate(() => {
            this.elements.results.prepend(messageElement);
        });
    }

	displayQueryResult(message) {
		console.log('Processing query result:', message);  // Debug log
    
		const resultElement = document.createElement('div');
    
		// Extract values correctly from the message
		const { result, result_type, processing_time, cost } = message;
    
		if (result_type === 'image') {
			const img = document.createElement('img');
			img.src = 'data:image/png;base64,' + result;
			img.alt = 'Generated Image';
			img.className = 'max-w-full h-auto';
			resultElement.appendChild(img);
		} else {
			// Handle text result
			const resultText = result;
			const formattedResult = this.formatResult(resultText);
			resultElement.innerHTML = `<div class="result-content">${formattedResult}</div>`;
		}

		// Add the processing details with actual values from message
		resultElement.innerHTML += `
			<p><strong>Processing Time:</strong> ${Number(processing_time).toFixed(2)}s</p>
			<p><strong>Cost:</strong> $${Number(cost).toFixed(4)}</p>
		`;
		resultElement.className = 'mb-4 p-4 bg-gray-100 rounded';
    
		this.scheduleUpdate(() => {
			this.elements.results.prepend(resultElement);
			if (typeof Prism !== 'undefined') {
				resultElement.querySelectorAll('pre code').forEach((block) => {
					Prism.highlightElement(block);
				});
			}
		});
	}
	
formatResult(result) {
    if (!result || typeof result !== 'string') return result || '';
    
    return result.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
        return `<pre><code class="language-${language || ''}">${helpers.escapeHtml(code.trim())}</code></pre>`;
    });
}
    // Code highlighting
    highlightCode(element) {
        if (typeof Prism !== 'undefined') {
            element.querySelectorAll('pre code').forEach((block) => {
                Prism.highlightElement(block);
            });
        }
    }

    // Queue status display
    updateQueueStatus(depth, total) {
        if (this.elements.queueThermometer) {
            const percentage = (depth / total) * 100;
            
            this.scheduleUpdate(() => {
                this.elements.queueThermometer.style.width = `${percentage}%`;
                this.elements.queueThermometer.textContent = `Queue: ${depth}`;
                this.elements.queueThermometer.setAttribute('aria-valuenow', depth);
                this.elements.queueThermometer.setAttribute('aria-valuemax', total);
            });
        }
    }

	displayPreviousQueries(message) {
		if (!this.elements.previousQueries) return;

		this.scheduleUpdate(() => {
			this.elements.previousQueries.innerHTML = '';
			const queries = message.data;  // Extract the data array

			if (!queries || queries.length === 0) {
				this.elements.previousQueries.innerHTML = '<p>No previous queries</p>';
				return;
			}

			queries.forEach(query => {
				const queryElement = document.createElement('div');
				queryElement.innerHTML = `
					<p><strong>Prompt:</strong> ${helpers.escapeHtml(query.prompt)}</p>
					<p><strong>Type:</strong> ${query.query_type}</p>
					<p><strong>Model:</strong> ${query.model_type} - ${query.model_name}</p>
					<p><strong>Processing Time:</strong> ${query.processing_time.toFixed(2)}s</p>
					<p><strong>Cost:</strong> $${query.cost.toFixed(4)}</p>
					<p><strong>Timestamp:</strong> ${new Date(query.timestamp).toLocaleString()}</p>
				`;
				queryElement.className = 'mb-4 p-4 bg-gray-100 rounded';
				this.elements.previousQueries.appendChild(queryElement);
			});
		});
	}

	// Query and model handling methods
	handleQueryTypeChange() {
		const queryType = this.elements.queryType.value;
    
		if (queryType === 'vision') {
			this.elements.imageUpload.style.display = 'block';
			this.elements.voiceInputButton.style.display = 'none';
			this.elements.promptInput.disabled = false;
		} else if (queryType === 'speech') {
			this.elements.imageUpload.style.display = 'none';
			this.elements.voiceInputButton.style.display = 'inline-block';
			this.elements.promptInput.disabled = true;
		} else {
			this.elements.imageUpload.style.display = 'none';
			this.elements.voiceInputButton.style.display = 'none';
			this.elements.promptInput.disabled = false;
		}
		this.updateModelTypeOptions();
	}

	handleModelTypeChange() {
		this.updateModelSelect();
	}

	updateModelTypeOptions() {
		const modelType = this.elements.modelType;
		modelType.innerHTML = '';
		const queryType = this.elements.queryType.value;

		if (queryType === 'chat' || queryType === 'speech') {
			this.addOption(modelType, 'worker_node', 'Worker Node');
			this.addOption(modelType, 'huggingface', 'Hugging Face');
			this.addOption(modelType, 'claude', 'Claude');
		} else if (queryType === 'vision') {
			this.addOption(modelType, 'worker_node', 'Worker Node');
			this.addOption(modelType, 'huggingface', 'Hugging Face');
		} else if (queryType === 'imagine') {
			this.addOption(modelType, 'worker_node', 'Worker Node');
		}

		this.handleModelTypeChange();
	}


	updateModelSelect() {
		if (!this.elements.modelSelect) return;
    
		const modelSelect = this.elements.modelSelect;
		const queryType = this.elements.queryType?.value || 'chat';
		const modelType = this.elements.modelType?.value || 'worker_node';
    
		modelSelect.innerHTML = '';
    
		if (modelType === 'worker_node' && Array.isArray(this.aiWorkers)) {
			this.aiWorkers.forEach(worker => {
				if (worker.type === queryType || (queryType === 'speech' && worker.type === 'chat')) {
					this.addOption(modelSelect, worker.name, worker.name);
				}
			});
		} else if (modelType === 'huggingface') {
			Object.values(this.huggingFaceModels).forEach(model => {
				this.addOption(modelSelect, model.name, model.name);
			});
		} else if (modelType === 'claude') {
			this.addOption(modelSelect, 'claude-2.1', 'Claude-2.1');
		}

		// Set default selection if empty
		if (modelSelect.options.length > 0 && !modelSelect.value) {
			modelSelect.selectedIndex = 0;
		}
	}





	addOption(selectElement, value, text) {
		const option = document.createElement('option');
		option.value = value;
		option.textContent = text;
		selectElement.appendChild(option);
	}


















    // State management and preferences
    applyPreferences() {
        if (this.preferences.theme === 'dark') {
		document.documentElement.classList.add('dark');
        }
        
        if (this.preferences.fontSize) {
            document.body.style.fontSize = this.preferences.fontSize;
        }

        if (this.elements.speechOutputCheckbox) {
            this.elements.speechOutputCheckbox.checked = this.preferences.speechOutput;
        }
    }

    savePreferences() {
        const preferences = {
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
            fontSize: document.body.style.fontSize || '16px',
            speechOutput: this.elements.speechOutputCheckbox?.checked || false,
            wakeWordEnabled: this.speech?.wakeWordState !== 'inactive'
        };
        StorageService.savePreferences(preferences);
    }

    // User info management
    updateUserInfo(user) {
        this.currentUser = user;
        
        if (this.elements.userInfo) {
            this.elements.userInfo.textContent = `User: ${user.nickname} (${user.guid})`;
        }

        if (this.elements.sysopPanel) {
            this.elements.sysopPanel.style.display = user.is_sysop ? 'block' : 'none';
            if (user.is_sysop) {
                this.websocket.send({ type: 'get_stats' });
            }
        }

        this.updateCumulativeCosts(user);
    }

    updateCumulativeCosts(user) {
        if (this.elements.cumulativeCosts) {
            this.elements.cumulativeCosts.innerHTML = `
                <p><strong>Total Query Time:</strong> ${user.total_query_time.toFixed(2)}s</p>
                <p><strong>Total Cost:</strong> $${user.total_cost.toFixed(4)}</p>
            `;
        }
    }

    // System stats and worker management
    updateSystemStats(stats) {
        if (this.elements.systemStats) {
            this.scheduleUpdate(() => {
                this.elements.systemStats.innerHTML = `
                    <p><strong>Total Queries:</strong> ${stats.total_queries}</p>
                    <p><strong>Total Processing Time:</strong> ${stats.total_processing_time.toFixed(2)}s</p>
                    <p><strong>Total Cost:</strong> $${stats.total_cost.toFixed(4)}</p>
                    <p><strong>Last Updated:</strong> ${new Date(stats.last_updated).toLocaleString()}</p>
                `;
            });
        }
    }

	updateWorkerList(message) {
		if (!this.elements.workerList) return;

		this.scheduleUpdate(() => {
			this.elements.workerList.innerHTML = '';
			const workers = message.workers;  // Extract the workers array

			if (workers && workers.length > 0) {
				workers.forEach(worker => {
					const workerElement = document.createElement('div');
					workerElement.innerHTML = `
						<p><strong>Name:</strong> ${helpers.escapeHtml(worker.name)}</p>
						<p><strong>Address:</strong> ${helpers.escapeHtml(worker.address)}</p>
						<p><strong>Type:</strong> ${worker.type}</p>
						<p><strong>Health Score:</strong> ${worker.health_score.toFixed(2)}</p>
						<p><strong>Status:</strong> ${worker.is_blacklisted ? 'Blacklisted' : 'Active'}</p>
						<p><strong>Last Active:</strong> ${new Date(worker.last_active).toLocaleString()}</p>
						<button class="remove-worker" data-name="${helpers.escapeHtml(worker.name)}">Remove</button>
					`;
					workerElement.className = `mb-4 p-4 rounded ${helpers.getWorkerStatusClass(worker)}`;
					this.elements.workerList.appendChild(workerElement);
				});

				this.setupWorkerControls();
			}
		});
	}
	
	// In UIManager.js, replace the current handleWorkerUpdate method with:

	handleWorkerUpdate(workers) {
		if (!workers || !Array.isArray(workers)) {
			console.warn('Invalid workers data received');
			return;
		}
    
		this.aiWorkers = workers;
		this.updateWorkerList({ workers }); // Pass workers in expected format
		this.updateModelSelect();
		}
		
		
		
		
		
		
		handleHuggingFaceUpdate(models) {
			this.huggingFaceModels = models;
			this.updateModelSelect();  
		}




    setupWorkerControls() {
        document.querySelectorAll('.remove-worker').forEach(button => {
            button.addEventListener('click', () => {
                const name = button.getAttribute('data-name');
                if (confirm(`Are you sure you want to remove worker ${name}?`)) {
                    this.websocket.send({
                        type: 'remove_worker',
                        worker_name: name
                    });
                }
            });
        });
    }

    // File handling and drag/drop
    setupDragAndDrop() {
        const dropZone = this.elements.imageDropZone;
        if (!dropZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('bg-blue-100');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('bg-blue-100');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files.length) {
                this.elements.imageUpload.files = files;
                this.handleImageUpload({ target: this.elements.imageUpload });
            }
        }, false);
    }

    async handleImageUpload(event) {
		const file = event.target.files[0];
		if (!file) return;

		// Add missing size validation
		if (file.size > this.MAX_FILE_SIZE) {
			this.displayError('File size exceeds maximum allowed');
			return;
		}

		try {
			const processedImage = await this.vision.handleImageUpload(file);
			this.elements.previewImg.src = processedImage;
			this.elements.imagePreview.style.display = 'block';
		} catch (error) {
			console.error('Error processing image:', error);
			this.displayError('Error processing image: ' + error.message);
		}
	}

    // Voice recording handling
    async toggleVoiceRecording() {
        if (!this.isRecording) {
            await this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            
            this.mediaRecorder.ondataavailable = event => {
                this.audioChunks.push(event.data);
            };
            
            this.mediaRecorder.onstop = () => this.sendVoiceQuery();
            
            this.mediaRecorder.start();
            this.isRecording = true;
            
            this.scheduleUpdate(() => {
                this.elements.voiceInputButton.textContent = 'Stop Recording';
                this.elements.voiceInputButton.classList.add('bg-red-500');
                this.elements.voiceInputButton.classList.remove('bg-blue-500');
            });
            
            this.setupAudioVisualization(stream);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            this.displayError('Error accessing microphone. Please ensure you have given permission to use the microphone.');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            this.scheduleUpdate(() => {
                this.elements.voiceInputButton.textContent = 'Start Voice Input';
                this.elements.voiceInputButton.classList.remove('bg-red-500');
                this.elements.voiceInputButton.classList.add('bg-blue-500');
            });
            
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
        }
    }

    // Keyboard shortcuts
    handleKeyboardShortcuts(e) {
        // Submit query: Ctrl/Cmd + Enter
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            this.handleSubmitQuery(e);
        }
        
        // Clear results: Ctrl/Cmd + L
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault();
            this.clearResults();
        }
        
        // Toggle voice: Ctrl/Cmd + Shift + V
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
            e.preventDefault();
            this.toggleVoiceRecording();
        }
        
        // Toggle wake word: Ctrl/Cmd + Shift + W
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'W') {
            e.preventDefault();
            this.toggleWakeWordMode();
        }
    }

    // Utility methods
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    validateElements() {
        const criticalElements = ['submitQueryButton', 'promptInput', 'queryType', 'results'];
        const missingElements = criticalElements.filter(id => !this.elements[id]);
        
        if (missingElements.length > 0) {
            console.error('Critical UI elements missing:', missingElements);
            throw new Error('Critical UI elements missing: ' + missingElements.join(', '));
        }
    }

    clearForm() {
        if (this.elements.promptInput) this.elements.promptInput.value = '';
        if (this.elements.imageUpload) this.elements.imageUpload.value = '';
        if (this.elements.imagePreview) this.elements.imagePreview.style.display = 'none';
        this.audioChunks = [];
    }

    clearResults() {
        if (this.elements.results) {
            this.elements.results.innerHTML = '';
        }
    }

    handleResize() {
        this.adjustLayoutForScreenSize();
        if (this.elements.audioWaveform) {
            this.setupAudioVisualization();
        }
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.cleanup();
        } else {
            this.resume();
        }
    }


	async setupAudioVisualization(stream) {
		if (!this.audioContext) {
			await this.initializeAudioContext();
		}
    
		try {
			const source = this.audioContext.createMediaStreamSource(stream);
			source.connect(this.analyser);
			this.mediaResources.add(source);
			this.drawWaveform();
		} catch (error) {
			console.error('Error setting up audio visualization:', error);
			this.handleSystemError(error);
		}
	}








	drawWaveform() {
		if (!this.analyser || !this.audioWaveform) return;
		this.animationId = requestAnimationFrame(() => this.drawWaveform());
		const bufferLength = this.analyser.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);
		this.analyser.getByteTimeDomainData(dataArray);
		this.updateWaveformDisplay(dataArray, bufferLength);
	}





	async sendVoiceQuery() {
		if (this.audioChunks.length === 0) return;
		const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
		const reader = new FileReader();
		reader.onloadend = () => {
			const base64Audio = reader.result.split(',')[1];
			this.websocket.send({
				type: 'speech_to_text',
				audio: base64Audio
			});
		};
		reader.readAsDataURL(audioBlob);
		this.audioChunks = [];
	}








	// 7. Add resource cleanup methods
	cleanup() {
		// Clear timers
		clearTimeout(this.resizeTimer);
		clearTimeout(this.updateTimer);
		clearTimeout(this.inactivityTimer);
    
		// Stop animations
		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
    
		// Release audio resources
		this.mediaResources.forEach(resource => {
			try {
				resource.disconnect();
			} catch (error) {
				console.error('Error disconnecting media resource:', error);
			}
		});
		this.mediaResources.clear();
    
		if (this.audioContext?.state === 'running') {
			this.audioContext.close();
		}
    
		// Clear queues and state
		this.updateQueue = [];
		this.audioQueue = [];
		this.uiState.pendingUploads.clear();
		this.rafScheduled = false;
    
		// Save current state
		this.savePreferences();
	}
	
	
	
	
	
    resume() {
        if (this.elements.audioWaveform && this.isRecording) {
            this.setupAudioVisualization();
        }
    }

    clearIntervals() {
        // Clear any intervals or timers here
    }

    formatResult(result) {
        return result.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            return `<pre><code class="language-${language || ''}">${helpers.escapeHtml(code.trim())}</code></pre>`;
        });
    }

    adjustLayoutForScreenSize() {
        const mainContent = document.querySelector('main');
        if (mainContent) {
            if (window.innerWidth < 768) {
                mainContent.classList.remove('grid', 'grid-cols-2', 'gap-4');
                mainContent.classList.add('flex', 'flex-col');
            } else {
                mainContent.classList.add('grid', 'grid-cols-2', 'gap-4');
                mainContent.classList.remove('flex', 'flex-col');
            }
        }
    }

    destroy() {
        this.cleanup();
        Object.values(this.elements).forEach(element => {
            if (element && element.remove) {
                element.remove();
            }
        });
        this.elements = {};
    }
}

export default UIManager;