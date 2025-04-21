// Restored from script.js with full feature parity and platform compatibility
import { CONFIG } from '../config/config.js';
import { helpers } from '../utils/helpers.js';

export class SpeechManager {
	
	
	// 1. Add these configuration constants at the top of SpeechManager class
	static CONFIG = {
		RECOGNITION_TIMEOUT: 20000,
		INACTIVITY_TIMEOUT: 15000,
		MAX_RECOGNITION_RESETS: 3,
		RECOGNITION_RESET_INTERVAL: 60000,
		RETRY_DELAY: 1000,
		AUDIO_FFT_SIZE: 2048,
		SMOOTHING_TIME_CONSTANT: 0.8,
		MIN_DECIBELS: -90,
		MAX_DECIBELS: -10
	};	
	
	
	
	
    constructor(websocketManager) {
        // Manager reference
        this.websocket = websocketManager;
        
        // Feature manager references (set by App.js)
        this.vision = null;
        this.weather = null;
        
        // Recognition state
        this.recognition = null;
        this.wakeWordState = 'inactive'; // inactive, listening, menu, prompt, processing, gmail
        this.isListening = false;
        this.isSystemSpeaking = false;
        this.recognitionPaused = false;
        this.lastRecognitionReset = Date.now();
        this.recognitionResetCount = 0;
        this.recognitionTimeout = null;
        this.MAX_RECOGNITION_RESETS = 3;
        this.RECOGNITION_RESET_INTERVAL = 60000; // 1 minute

        // Platform detection
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        this.isMobile = /Mobi|Android/i.test(navigator.userAgent);
        
        // Audio visualization
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.canvasCtx = null;
        this.animationId = null;
        this.visualizationMode = 'waveform';
        this.visualizationSettings = {
            fftSize: 2048,
            smoothingTimeConstant: 0.8
        };
        
        // Audio elements
        this.audioWaveform = document.getElementById('audioWaveform');
        this.setupPersistentAudio();
        
        // Audio queue management
        this.audioQueue = [];
        this.isAudioPlaying = false;
        this.currentAudio = null;
		this.persistentAudio = new Audio();
        this.setupAudioHandling();  // Missing setup
        this.currentPlaybackRetries = 0;
        this.MAX_PLAYBACK_RETRIES = 3;
        
        // State tracking
        this.inactivityCount = 0;
        this.inactivityTimer = null;
        this.promptInactivityCount = 0;
        this.promptInactivityTimer = null;

        // Error tracking
        this.errorCounts = {
            noSpeech: 0,
            audioCapture: 0,
            network: 0,
            aborted: 0
        };
        this.lastError = null;
        this.lastErrorTime = null;

        // Initialize canvas if available
        if (this.audioWaveform) {
            this.canvasCtx = this.audioWaveform.getContext('2d');
            this.setupCanvasResizing();
        }
    }


	    // Missing Function
    setupAudioHandling() {
        this.persistentAudio.addEventListener('ended', () => this.playNextAudio());
        this.persistentAudio.addEventListener('error', (error) => this.handleAudioError(error));
        document.body.appendChild(this.persistentAudio);
    }



    // Core initialization
    setupPersistentAudio() {
        this.persistentAudio = new Audio();
        this.persistentAudio.addEventListener('ended', () => this.playNextAudio());
        this.persistentAudio.addEventListener('error', (error) => this.handleAudioError(error));
        document.body.appendChild(this.persistentAudio);
    }





    setupCanvasResizing() {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                this.audioWaveform.width = width;
                this.audioWaveform.height = height;
                if (this.isListening) {
                    this.updateVisualization();
                }
            }
        });
        resizeObserver.observe(this.audioWaveform);
    }


	// 4. Enhanced audio context setup
	async setupAudioContext() {
		try {
			if (!this.audioContext) {
				this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
			}
        
			if (this.audioContext.state === 'suspended') {
				await this.audioContext.resume();
			}
        
			this.analyser = this.audioContext.createAnalyser();
			this.analyser.fftSize = SpeechManager.CONFIG.AUDIO_FFT_SIZE;
			this.analyser.smoothingTimeConstant = SpeechManager.CONFIG.SMOOTHING_TIME_CONSTANT;
			this.analyser.minDecibels = SpeechManager.CONFIG.MIN_DECIBELS;
			this.analyser.maxDecibels = SpeechManager.CONFIG.MAX_DECIBELS;
        
			this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const source = this.audioContext.createMediaStreamSource(stream);
			source.connect(this.analyser);
        
			return true;
		} catch (error) {
			console.error('Error setting up audio context:', error);
			this.handleError(error, 'audio');
			return false;
		}
	}






	// 6. Add comprehensive error handling
	handleError(error, type) {
		console.error(`Speech ${type} error:`, error);
		this.errorCounts[type] = (this.errorCounts[type] || 0) + 1;
    
		if (this.errorCounts[type] >= SpeechManager.CONFIG.MAX_RECOGNITION_RESETS) {
			this.handleCriticalError(type);
			return;
		}
    
		this.attemptRecovery(type);
	}



	handleCriticalError(type) {
		this.deactivateWakeWordMode();
		this.errorCounts[type] = 0;
		this.speakFeedback("I'm having trouble with speech recognition. Please try again later.");
	}

	async attemptRecovery(type) {
		switch(type) {
			case 'recognition':
				await this.restartRecognition();
				break;
			case 'audio':
				await this.reinitializeAudio();
				break;
			case 'synthesis':
				await this.restartSpeechSynthesis();
				break;
		}
	}




	// 7. Add enhanced command handling
	async handleCommand(command) {
		this.recognitionLastCommand = command;
		clearTimeout(this.commandRetryTimer);
    
		if (!command) {
			await this.handleEmptyCommand();
			return;
		}
    
		try {
			if (command.includes("stop") || command.includes("goodbye")) {
				this.deactivateWakeWordMode();
				return;
			}
        
			switch (this.wakeWordState) {
				case 'chat':
					await this.handleChatCommand(command);
					break;
				case 'menu':
					await this.handleMenuCommand(command);
					break;
				case 'prompt':
					await this.handlePromptInput(command);
					break;
				case 'gmail':
					await this.handleGmailCommand(command);
					break;
				default:
					await this.handleUnknownState(command);
			}
		} catch (error) {
			console.error("Error handling command:", error);
			this.handleError(error, 'recognition');
		}
	}





	// 8. Add state transition handling
	async handleStateTransition(newState, message = '') {
		const oldState = this.wakeWordState;
		this.wakeWordState = newState;
    
		// Clear any existing timers
		clearTimeout(this.inactivityTimer);
		clearTimeout(this.promptInactivityTimer);
    
		// Setup state-specific behaviors
		switch (newState) {
			case 'listening':
				await this.setupListeningState();
				break;
			case 'menu':
				await this.setupMenuState();
				break;
			case 'processing':
				await this.setupProcessingState();
				break;
			case 'inactive':
				await this.cleanupState();
				break;
		}
    
		// Provide feedback if specified
		if (message) {
			await this.speakFeedback(message);
		}
    
		console.log(`State transition: ${oldState} -> ${newState}`);
	}






	async initializeRecognition() {
		console.log("[DEBUG] Initializing speech recognition");
        
		// Stop existing recognition if any
		if (this.recognition) {
			try {
				this.recognition.stop();
			} catch (e) {
				console.log("[DEBUG] Error stopping existing recognition:", e);
			}
		}

		const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SpeechRecognition) {
			console.error("[ERROR] Speech recognition not supported in this browser");
			return false;
		}

		// Create new recognition instance BEFORE setting up handlers
		this.recognition = new SpeechRecognition();
    
		// iOS-specific settings
		if (this.isIOS) {
			this.recognition.continuous = false;
			this.recognition.interimResults = false;
		} else {
			this.recognition.continuous = true;
			this.recognition.interimResults = true;
		}
    
		this.recognition.lang = 'en-US';
    
		// Now setup handlers after this.recognition is defined
		this.setupRecognitionHandlers();
    
		return true;
	}






	setupRecognitionConfig() {
		// Platform-specific configurations
		if (this.isIOS || this.isSafari) {
			this.recognition.continuous = false;
			this.recognition.interimResults = false;
		} else {
			this.recognition.continuous = true;
			this.recognition.interimResults = true;
		}
    
		this.recognition.lang = 'en-US';
		this.recognition.maxAlternatives = 1;
	}










	setupRecognitionHandlers() {
		// Change from using bare 'recognition' to 'this.recognition'
		this.recognition.onstart = () => {
			console.log("[DEBUG] Recognition started");
			this.isListening = true;
			this.showWaveform();
			clearTimeout(this.recognitionTimeout);
		};

		this.recognition.onend = () => {
			console.log("[DEBUG] Recognition ended");
			this.isListening = false;
        
			if (this.wakeWordState !== 'inactive' && !this.recognitionPaused) {
				console.log("[DEBUG] Restarting recognition");
				setTimeout(() => {
					if (!this.isSystemSpeaking && !this.isListening) {
						try {
							this.startListening();
						} catch (error) {
							console.error("Error restarting recognition:", error);
						}
					}
				}, 250);
			} else {
				this.hideWaveform();
			}
		};

		this.recognition.onerror = (event) => {
			this.handleRecognitionError(event);
		};

		this.recognition.onresult = (event) => {
			this.handleRecognitionResult(event);
		};
	}
	






	// 3. Add enhanced initialization methods
	initializeCanvasContext() {
		if (this.audioWaveform) {
			this.canvasCtx = this.audioWaveform.getContext('2d');
			this.setupCanvasResizing();
		}
	}















	
	
	async handleRecognitionError(event) {
		console.error("[ERROR] Recognition error:", event.error);
		this.isListening = false;
		this.lastError = event.error;
		this.lastErrorTime = Date.now();

		if (this.isIOS && event.error === 'not-allowed') {
			await this.speakFeedback("Please enable microphone access in your iOS settings.");
			return;
		}
    
		switch(event.error) {
			case 'no-speech':
				this.errorCounts.noSpeech++;
				if (this.errorCounts.noSpeech < 3) {
					setTimeout(() => {
						if (!this.isSystemSpeaking && !this.recognitionPaused) {
							this.startListening();
						}
					}, 100);
				} else {
					await this.handleRecovery('no-speech');
				}
				break;
            
			case 'audio-capture':
				this.errorCounts.audioCapture++;
				await this.handleRecovery('audio-capture');
				break;
            
			case 'network':
				this.errorCounts.network++;
				await this.handleRecovery('network');
				break;
            
			case 'aborted':
				this.errorCounts.aborted++;
				if (!this.recognitionPaused) {
					setTimeout(() => {
						if (!this.isSystemSpeaking) {
							this.startListening();
						}
					}, 100);
				}
				break;
            
			default:
				await this.handleRecovery('unknown');
		}
	}



	async handleRecognitionResult(event) {
		if (this.isSystemSpeaking) {
			console.log("[DEBUG] System is speaking, ignoring input");
			return;
		}

		try {
			const lastResult = event.results[event.results.length - 1];
			if (!lastResult.isFinal) return;
        
			const transcript = lastResult[0].transcript.trim().toLowerCase();
			console.log("[DEBUG] Heard:", transcript);

			if (this.recognitionPaused) {
				console.log("[DEBUG] Recognition paused, ignoring input");
				return;
			}

			// Handle wake word in listening state
			if (transcript.includes("computer") && this.wakeWordState === 'listening') {
				this.recognitionPaused = true;
				await this.handleWakeWord();
				this.recognitionPaused = false;
				return;
			}

			// Handle different states
			switch (this.wakeWordState) {
				case 'menu':
					this.recognitionPaused = true;
					await this.handleMenuCommand(transcript);
					this.recognitionPaused = false;
					break;
				case 'chat':
					await this.handleChatCommand(transcript);
					break;
				case 'prompt':
					await this.handlePromptInput(transcript);
					break;
				case 'gmail':
					await this.handleGmailCommand(transcript);
					break;
			}
		} catch (error) {
			console.error("[ERROR] Error processing recognition result:", error);
			this.recognitionPaused = false;
			await this.handleRecovery('processing');
		}
	}





	// In SpeechManager.js, add/update:
	async activateWakeWordMode() {
		if (this.wakeWordState !== 'inactive') {
			console.log("[DEBUG] Wake word mode already active");
			return false;
		}

		console.log("[DEBUG] Activating wake word mode");
		this.wakeWordState = 'listening';
    
		if (await this.initializeRecognition()) {
			this.showWaveform();
			await this.speakFeedback("Wake word mode activated. Say 'computer' to start.");
			this.startListening();
			return true;
		}
		return false;
	}









    deactivateWakeWordMode() {
        console.log("[DEBUG] Deactivating wake word mode");
        this.wakeWordState = 'inactive';
        this.recognitionPaused = true;
        
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (error) {
                console.error("[ERROR] Error stopping recognition:", error);
            }
        }

        this.hideWaveform();
        this.cleanup();
    }

    // Audio Visualization
    setupAudioVisualization() {
        console.log("[DEBUG] Setting up audio visualization");
        if (!this.audioWaveform) {
            console.error("[ERROR] Audio waveform canvas not found");
            return;
        }

        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.visualizationSettings.fftSize;
            this.analyser.smoothingTimeConstant = this.visualizationSettings.smoothingTimeConstant;
            
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);

            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    const source = this.audioContext.createMediaStreamSource(stream);
                    source.connect(this.analyser);
                    this.updateVisualization();
                })
                .catch(err => {
                    console.error('[ERROR] Error accessing microphone:', err);
                    this.handleRecovery('audio-capture');
                });
        } catch (error) {
            console.error('[ERROR] Error setting up audio visualization:', error);
            this.handleRecovery('visualization');
        }
    }







	async handleRecovery(errorType) {
		console.log("[DEBUG] Handling recovery for:", errorType);
		const resetCount = ++this.recognitionResetCount;
		const timeSinceLastReset = Date.now() - this.lastRecognitionReset;

		if (timeSinceLastReset > this.RECOGNITION_RESET_INTERVAL) {
			this.recognitionResetCount = 1;
		}

		if (resetCount >= this.MAX_RECOGNITION_RESETS) {
			await this.speakFeedback("I'm having trouble understanding. Please try again later.");
			this.deactivateWakeWordMode();
			return;
		}

		// Error-specific recovery logic
		switch(errorType) {
			case 'no-speech':
				await this.speakFeedback("I didn't hear anything. Please try again.");
				break;
			case 'audio-capture':
				await this.speakFeedback("I couldn't access the microphone. Please check your settings.");
				break;
			// Add other error cases
		}
	}

	// Platform-specific audio setup
	setupPlatformAudio() {
		if (this.isIOS || this.isSafari) {
			// iOS-specific audio setup
			this.recognition.continuous = false;
			this.recognition.interimResults = false;
		} else {
			this.recognition.continuous = true;
			this.recognition.interimResults = true;
		}
	}




	validateAudioSettings() {
		return {
			continuous: !this.isIOS && !this.isSafari,
			interimResults: !this.isIOS && !this.isSafari,
			maxAlternatives: 1,
			lang: 'en-US'
		};
	}





	async handleModeTransition(mode) {
		console.log(`[DEBUG] Transitioning to ${mode} mode`);
    
		try {
			// Update wake word state
			this.wakeWordState = mode;
        
			// Handle different modes
			switch (mode) {
				case 'chat':
					document.getElementById('query-type').value = "chat";
					document.getElementById('model-type').value = "worker_node";
					document.getElementById('model-select').value = "2070sLABCHAT";
					if (document.getElementById('prompt-input')) {
						document.getElementById('prompt-input').value = '';
					}
					await this.speakFeedback("Chat mode activated.");
					break;

				case 'vision':
					document.getElementById('query-type').value = "vision";
					document.getElementById('model-type').value = "worker_node";
					await this.speakFeedback("Vision mode activated. Starting camera...");
					if (this.vision) {
						const success = await this.vision.callWebcamVisionRoutine();
						if (!success) {
							throw new Error("Camera access failed");
						}
					}
					break;

				case 'imagine':
					document.getElementById('query-type').value = "imagine";
					document.getElementById('model-type').value = "worker_node";
					document.getElementById('model-select').value = "imagine2060";
					if (document.getElementById('prompt-input')) {
						document.getElementById('prompt-input').value = '';
					}
					await this.speakFeedback("Imagine mode activated.");
					break;

				case 'weather':
					if (this.weather) {
						await this.speakFeedback("Getting weather information...");
						await this.weather.processWeatherCommand();
					} else {
						throw new Error("Weather service not available");
					}
					break;

				case 'gmail':
					await this.speakFeedback("Accessing Gmail...");
					if (window.gmail) {
						await window.gmail.initiateGmailAuth();
					} else {
						throw new Error("Gmail service not available");
					}
					break;

				default:
					throw new Error(`Unknown mode: ${mode}`);
			}

		} catch (error) {
			console.error(`[ERROR] Error transitioning to ${mode} mode:`, error);
			this.wakeWordState = 'listening';
			await this.speakFeedback(`Error activating ${mode} mode. Please try again.`);
			await this.cycleToMainMenu();
		}

		// Update UI if needed after mode change
		if (document.getElementById('query-type')) {
			const event = new Event('change');
			document.getElementById('query-type').dispatchEvent(event);
		}
	}












    updateVisualization() {
        if (!this.analyser || !this.audioWaveform || !this.canvasCtx) {
            return;
        }

        this.animationId = requestAnimationFrame(() => this.updateVisualization());

        const bufferLength = this.analyser.frequencyBinCount;
        this.analyser.getByteTimeDomainData(this.dataArray);

        this.canvasCtx.fillStyle = 'rgb(200, 200, 200)';
        this.canvasCtx.fillRect(0, 0, this.audioWaveform.width, this.audioWaveform.height);

        this.canvasCtx.lineWidth = 2;
        this.canvasCtx.strokeStyle = 'rgb(0, 0, 0)';
        this.canvasCtx.beginPath();

        const sliceWidth = this.audioWaveform.width * 1.0 / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = this.dataArray[i] / 128.0;
            const y = v * this.audioWaveform.height / 2;

            if (i === 0) {
                this.canvasCtx.moveTo(x, y);
            } else {
                this.canvasCtx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.canvasCtx.lineTo(this.audioWaveform.width, this.audioWaveform.height / 2);
        this.canvasCtx.stroke();
    }
	
	
	
	
	

    // Audio Queue Management
    async addToAudioQueue(audioData) {
        this.audioQueue.push(audioData);
        if (!this.isAudioPlaying) {
            await this.playNextAudio();
        }
    }

    // Required playNextAudio implementation
    async playNextAudio() {
        if (this.audioQueue.length === 0) {
            this.isAudioPlaying = false;
            this.currentAudio = null;
            this.currentPlaybackRetries = 0;
            return;
        }

        try {
            this.isAudioPlaying = true;
            const audioData = this.audioQueue.shift();
            this.currentAudio = this.persistentAudio;
            this.currentAudio.src = audioData;
            await this.currentAudio.play();
            this.currentPlaybackRetries = 0;
        } catch (error) {
            console.error("[ERROR] Audio playback error:", error);
            if (this.currentPlaybackRetries < this.MAX_PLAYBACK_RETRIES) {
                this.currentPlaybackRetries++;
                this.audioQueue.unshift(this.currentAudio.src);
                setTimeout(() => this.playNextAudio(), 1000);
            } else {
                this.handleAudioError(error);
            }
        }
    }
	
	
    // Missing Function
    handleAudioError(error) {
        console.error("[ERROR] Audio playback error:", error);
        this.isAudioPlaying = false;
        this.currentAudio = null;
        this.currentPlaybackRetries = 0;
        this.playNextAudio();
    }
	
	
    // Speech Synthesis
    async speakFeedback(message, callback) {
        if (!message) return;

        return new Promise((resolve) => {
            console.log("[DEBUG] Speaking feedback:", message);
            this.isSystemSpeaking = true;
            this.recognitionPaused = true;

            const utterance = new SpeechSynthesisUtterance(message);
            
            utterance.onend = async () => {
                console.log("[DEBUG] Finished speaking");
                this.isSystemSpeaking = false;
                this.recognitionPaused = false;
                if (callback) await callback();
                resolve();
                
                // Resume listening after brief delay
                setTimeout(() => {
                    if (this.wakeWordState !== 'inactive') {
                        this.startListening();
                    }
                }, 250);
            };

            utterance.onerror = (error) => {
                console.error("[ERROR] Speech synthesis error:", error);
                this.isSystemSpeaking = false;
                this.recognitionPaused = false;
                if (callback) callback();
                resolve();
                this.handleRecovery('synthesis');
            };

            window.speechSynthesis.speak(utterance);
        });
    }

    // Command Handling
    async handleWakeWord() {
        console.log("[DEBUG] Processing wake word");
        await this.speakFeedback("Yes? What would you like to do?");
        this.wakeWordState = 'menu';
    }

	async handleMenuCommand(command) {
		console.log("[DEBUG] Processing menu command:", command);
		if (!command) return;

		if (command.includes("goodbye")) {
			this.deactivateWakeWordMode();
			return;
		}

		// Temporarily pause recognition during command processing
		this.recognitionPaused = true;
		try {
			// Check for each mode command
			if (command.includes("chat")) {
				await this.handleModeTransition('chat');
			} else if (command.includes("vision")) {
				await this.handleModeTransition('vision');
			} else if (command.includes("imagine")) {
				await this.handleModeTransition('imagine');
			} else if (command.includes("weather")) {
				if (this.weather) {
					await this.handleModeTransition('weather');
				} else {
					await this.speakFeedback("Weather service is not available at the moment.");
					await this.cycleToMainMenu();
				}
			} else if (command.includes("gmail")) {
				if (window.gmail) {
					await this.handleModeTransition('gmail');
				} else {
					await this.speakFeedback("Gmail service is not available at the moment.");
					await this.cycleToMainMenu();
				}
			} else {
				await this.speakFeedback("I didn't recognize that command. Available commands are: chat, vision, imagine, weather, or Gmail.");
			}
		} catch (error) {
			console.error("[ERROR] Error in menu command handler:", error);
			await this.speakFeedback("An error occurred processing your command. Please try again.");
			await this.cycleToMainMenu();
		} finally {
			this.recognitionPaused = false;
			if (this.wakeWordState !== 'inactive') {
				await this.startListening();
			}
		}
	}	
	
	async cycleToMainMenu() {
		this.wakeWordState = 'listening';
		await this.speakFeedback("Say computer for a new command, or goodbye to exit.");
		await this.startListening();
	}
	
	
    async handleChatCommand(command) {
        const promptInput = document.getElementById('prompt-input');
        
        if (command.includes("computer")) {
            if (promptInput && promptInput.value.trim()) {
                document.getElementById('submit-query')?.click();
                this.wakeWordState = 'listening';
                await this.speakFeedback("Query submitted.");
                await this.cycleToMainMenu();
            }
            return;
        }

        if (command.includes("backspace")) {
            if (promptInput) {
                promptInput.value = '';
                await this.speakFeedback("Input cleared. Please speak your message.");
            }
            return;
        }

        if (promptInput) {
            // Deduplicate words and update input
            const words = command.split(' ');
            const uniqueWords = [...new Set(words)];
            const cleanCommand = uniqueWords.join(' ');
            promptInput.value = cleanCommand;
            console.log("[DEBUG] Updated chat input:", promptInput.value);
        }
    }

    async handlePromptInput(command) {
        clearTimeout(this.promptInactivityTimer);
        
        if (command.includes("computer")) {
            this.wakeWordState = 'processing';
            this.hideWaveform();
            this.showStaticWaveform();
            
            const promptInput = document.getElementById('prompt-input');
            if (promptInput && promptInput.value.trim()) {
                document.getElementById('submit-query')?.click();
            }
            
            this.promptInactivityCount = 0;
        } else if (command.includes("backspace")) {
            const promptInput = document.getElementById('prompt-input');
            if (promptInput) {
                promptInput.value = '';
            }
            this.promptInactivityCount = 0;
            await this.speakFeedback("Prompt erased. ");
        } else if (command.trim() === '') {
            this.promptInactivityCount++;
            if (this.promptInactivityCount >= 2) {
                this.wakeWordState = 'listening';
                this.promptInactivityCount = 0;
                await this.cycleToMainMenu();
            } else {
                await this.speakFeedback(" ");
            }
        } else {
            const promptInput = document.getElementById('prompt-input');
            if (promptInput) {
                promptInput.value = (promptInput.value + ' ' + command).trim();
            }
            this.promptInactivityCount = 0;
            await this.speakFeedback(". ");
        }
        
        this.startPromptInactivityTimer();
    }

    async handleVisionMode() {
        if (this.vision) {
            try {
                const success = await this.vision.callWebcamVisionRoutine();
                if (!success) {
                    await this.speakFeedback("Camera access failed. Please try again.");
                    await this.cycleToMainMenu();
                }
            } catch (error) {
                console.error("[ERROR] Vision mode error:", error);
                this.wakeWordState = 'listening';
                await this.speakFeedback("An error occurred in vision mode. Please try again.");
                await this.cycleToMainMenu();
            }
        }
    }

    // Mode Setup
    async setupChatMode() {
        const queryType = document.getElementById('query-type');
        const modelType = document.getElementById('model-type');
        const modelSelect = document.getElementById('model-select');
        const promptInput = document.getElementById('prompt-input');
        
        if (queryType) queryType.value = "chat";
        if (modelType) modelType.value = "worker_node";
        if (modelSelect) modelSelect.value = "2070sLABCHAT";
        if (promptInput) promptInput.value = '';
    }

    async setupVisionMode() {
        const queryType = document.getElementById('query-type');
        const modelType = document.getElementById('model-type');
        
        if (queryType) queryType.value = "vision";
        if (modelType) modelType.value = "worker_node";
    }

    async setupImagineMode() {
        const queryType = document.getElementById('query-type');
        const modelType = document.getElementById('model-type');
        const modelSelect = document.getElementById('model-select');
        const promptInput = document.getElementById('prompt-input');
        
        if (queryType) queryType.value = "imagine";
        if (modelType) modelType.value = "worker_node";
        if (modelSelect) modelSelect.value = "imagine2060";
        if (promptInput) promptInput.value = '';
    }

    // Timer Management
    startPromptInactivityTimer() {
        clearTimeout(this.promptInactivityTimer);
        this.promptInactivityTimer = setTimeout(() => {
            this.handlePromptInput('');
        }, 15000);
    }

    startInactivityTimer() {
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = setTimeout(() => {
            this.handleTopLevelCommand('');
        }, 15000);
    }

    // Recovery and Error Handling
    async handleRecovery(errorType) {
        console.log("[DEBUG] Handling recovery for:", errorType);
        
        const resetCount = ++this.recognitionResetCount;
        const timeSinceLastReset = Date.now() - this.lastRecognitionReset;

        if (timeSinceLastReset > this.RECOGNITION_RESET_INTERVAL) {
            this.recognitionResetCount = 1;
        }

        if (resetCount >= this.MAX_RECOGNITION_RESETS) {
            await this.speakFeedback("I'm having trouble understanding. Please try again later.");
            this.deactivateWakeWordMode();
            return;
        }

        switch(errorType) {
            case 'no-speech':
                await this.speakFeedback("I didn't hear anything. Please try again.");
                break;
            case 'audio-capture':
                await this.speakFeedback("I couldn't access the microphone. Please check your settings.");
                break;
            case 'network':
                await this.speakFeedback("Network error. Please check your connection.");
                break;
            case 'synthesis':
                // Don't speak on synthesis error, just restart recognition
                break;
            default:
                await this.speakFeedback("There was an error. Please try again.");
        }

        this.lastRecognitionReset = Date.now();
        if (this.wakeWordState !== 'inactive') {
            this.startListening();
        }
    }

    // State Management
    async cycleToMainMenu() {
        this.wakeWordState = 'listening';
        await this.speakFeedback("Say computer for a new command, or goodbye to exit.");
        await this.startListening();
    }

    // UI Handling
    showWaveform() {
        if (this.audioWaveform) {
            this.audioWaveform.style.display = 'block';
            if (!this.analyser) {
                this.setupAudioVisualization();
            }
        }
    }

    hideWaveform() {
        if (this.audioWaveform) {
            this.audioWaveform.style.display = 'none';
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        }
    }

    showStaticWaveform() {
        if (this.audioWaveform && this.canvasCtx) {
            const width = this.audioWaveform.width;
            const height = this.audioWaveform.height;
            
            this.canvasCtx.clearRect(0, 0, width, height);
            this.canvasCtx.beginPath();
            
            for (let x = 0; x < width; x++) {
                const y = height / 2 + Math.sin((x / width) * Math.PI * 2) * (height / 4);
                if (x === 0) {
                    this.canvasCtx.moveTo(x, y);
                } else {
                    this.canvasCtx.lineTo(x, y);
                }
            }
            
            this.canvasCtx.strokeStyle = 'black';
            this.canvasCtx.lineWidth = 2;
            this.canvasCtx.stroke();
        }
    }

	// 10. Add resource cleanup methods
	cleanup() {
		// Stop recognition
		if (this.recognition) {
			try {
				this.recognition.stop();
			} catch (e) {
				console.error("Error stopping recognition:", e);
			}
		}
    
		// Clear timers
		clearTimeout(this.inactivityTimer);
		clearTimeout(this.promptInactivityTimer);
		clearTimeout(this.commandRetryTimer);
		clearTimeout(this.recognitionTimeout);
    
		// Stop visualization
		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
    
		// Cleanup audio context
		if (this.audioContext?.state === 'running') {
			this.audioContext.close();
		}
    
		// Reset state
		this.isListening = false;
		this.isSystemSpeaking = false;
		this.recognitionPaused = false;
		this.wakeWordState = 'inactive';
    
		// Clear error counts
		this.errorCounts = {
			recognition: 0,
			audio: 0,
			synthesis: 0
		};
	}
	
	




	// 11. Add platform-specific optimizations
	setupPlatformSpecifics() {
		if (this.isIOS || this.isSafari) {
			// iOS-specific setup
			this.setupIOSOptimizations();
		} else if (this.isMobile) {
			// Mobile-specific setup
			this.setupMobileOptimizations();
		}
	}

	setupIOSOptimizations() {
		// Handle iOS audio session
		document.addEventListener('touchstart', () => {
			if (this.audioContext?.state === 'suspended') {
				this.audioContext.resume();
			}
		}, { once: true });
	}

	setupMobileOptimizations() {
		// Handle mobile-specific audio processing
		if (this.analyser) {
			this.analyser.smoothingTimeConstant = 0.6; // Reduced for better mobile performance
		}
	}

	// 12. Add these utility methods
	async waitForNextCommand(timeout = SpeechManager.CONFIG.RECOGNITION_TIMEOUT) {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				resolve("timeout");
			}, timeout);

			const handleResult = (event) => {
				clearTimeout(timer);
				const last = event.results.length - 1;
				const command = event.results[last][0].transcript.trim().toLowerCase();
				this.recognition.removeEventListener('result', handleResult);
				resolve(command);
			};

			this.recognition.addEventListener('result', handleResult);

			if (this.recognition.state !== 'listening') {
				this.startListening();
			}
		});
	}

	async speakAndListen(message, callback) {
		await this.speakFeedback(message);
		if (this.isWakeWordModeActive) {
			await this.startListening();
			if (callback) {
				const command = await this.waitForNextCommand();
				callback(command);
			}
		}
	}







	
	
	
    // Utility Methods
	async startListening() {
		if (this.isSystemSpeaking || this.recognitionPaused) {
			console.log("[DEBUG] Cannot start listening - system speaking or paused");
			return;
		}

		try {
			if (this.recognition?.state === 'running') {
				return; // Already listening
			}

			if (!this.recognition) {
				await this.initializeRecognition();
			}

			await this.recognition.start();
			this.isListening = true;
			console.log("[DEBUG] Started listening");
		} catch (error) {
			if (error.message.includes('already started')) {
				console.log("[DEBUG] Recognition already started");
				return;
			}
			console.error("[ERROR] Error starting recognition:", error);
			await this.initializeRecognition();
			try {
				await this.recognition.start();
			} catch (retryError) {
				console.error("[ERROR] Error on retry:", retryError);
				await this.handleRecovery('recognition');
			}
		}
	}	
	
	
	
	
}

export default SpeechManager;