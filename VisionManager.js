// Restored from script.js with full feature parity and platform compatibility
import { CONFIG } from '../config/config.js';
import { helpers } from '../utils/helpers.js';

export class VisionManager {
	
	
	// 1. Add configuration constants at the top of VisionManager class
	static CONFIG = {
		MAX_RETRIES: 3,
		RETRY_DELAY: 1000,
		CHUNK_SIZE: 1024 * 1024, // 1MB
		MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
		MAX_IMAGE_SIZE: 512,
		MIN_IMAGE_SIZE: 32,
		INITIAL_JPEG_QUALITY: 0.85,
		MIN_JPEG_QUALITY: 0.1,
		PREVIEW_DURATION: 10000,
		CAMERA_INIT_DELAY: 1000
	};	
	
	
	
    constructor(websocketManager, speechManager) {
		this.canvasPool = [];
        this.MAX_POOL_SIZE = 3;
        this.initializeCanvasPool();
        // Manager references
        this.websocket = websocketManager;
        this.speech = speechManager;
        
        // Camera state
        this.cameraStream = null;
        this.videoElement = null;
        this.isProcessing = false;
        
        // Platform detection
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        this.isMobile = /Mobi|Android/i.test(navigator.userAgent);
        
        // Constants
        this.CHUNK_SIZE = 1024 * 1024;  // 1MB chunks
        this.MAX_IMAGE_SIZE = 512;       // Maximum dimension
        this.MIN_IMAGE_SIZE = 32;        // Minimum dimension
        this.IMAGE_QUALITY = 0.85;     // Initial JPEG quality
        this.MIN_QUALITY = 0.1;          // Minimum JPEG quality
        this.MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit
        
        // Processing state
        this.retryCount = 0;
        this.MAX_RETRIES = 3;
        
        // Preview management
        this.previewTimeout = null;
        this.PREVIEW_DURATION = 10000; // 10 seconds
        
        // Resource management
        this.tempCanvas = document.createElement('canvas');
        this.rgbCanvas = document.createElement('canvas');
		// Initialize canvas context
		this.tempCtx = this.tempCanvas.getContext('2d');
		this.rgbCtx = this.rgbCanvas.getContext('2d', { alpha: false });
	}







	    // Missing Function
    initializeCanvasPool() {
        for (let i = 0; i < this.MAX_POOL_SIZE; i++) {
            this.canvasPool.push({
                element: document.createElement('canvas'),
                inUse: false,
                lastUsed: Date.now()
            });
        }
    }

    // Missing Function
    getCanvasFromPool() {
        let canvas = this.canvasPool.find(c => !c.inUse);
        if (!canvas) {
            // Find oldest unused canvas
            canvas = this.canvasPool.reduce((oldest, current) => 
                (!current.inUse && current.lastUsed < oldest.lastUsed) ? current : oldest
            );
        }
        canvas.inUse = true;
        canvas.lastUsed = Date.now();
        canvas.element.width = this.MAX_IMAGE_SIZE;
        canvas.element.height = this.MAX_IMAGE_SIZE;
        return canvas;
    }

    // Missing Function
    releaseCanvasToPool(canvas) {
        const poolCanvas = this.canvasPool.find(c => c.element === canvas.element);
        if (poolCanvas) {
            poolCanvas.inUse = false;
            poolCanvas.element.width = 1;
            poolCanvas.element.height = 1;
        }
    }



    async callWebcamVisionRoutine() {
        console.log("Starting webcam vision routine");
        
        try {
            await this.speech.speakFeedback("Accessing webcam for vision processing.");
            const video = await this.setupCamera();
            
            if (!video) {
                await this.handleCameraError(new Error('Failed to initialize camera'));
                return false;
            }

            this.speech.showStaticWaveform();
            await this.waitForVideoReady(video);
            
            const imageData = await this.captureImage(video);
            this.stopCamera();
            
            if (video.parentNode) {
                document.body.removeChild(video);
            }

            // Remove any existing preview
            const existingPreview = document.getElementById('captured-image-container');
            if (existingPreview) {
                existingPreview.remove();
            }

            // Display and process the image
            this.displayCapturedImage(imageData, true);
            await this.processVisionQuery(imageData);
            return true;

        } catch (error) {
            console.error('Error in vision routine:', error);
            this.cleanup();
            await this.speech.speakFeedback("Error processing image. Please try again.");
            return false;
        }
    }






	async setupCamera() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ 
				video: { 
					facingMode: this.isMobile ? "environment" : "user",
					width: { ideal: this.MAX_IMAGE_SIZE },
					height: { ideal: this.MAX_IMAGE_SIZE }
				} 
			});

			const video = document.createElement('video');
			this.applyPlatformSpecifics(video);
			video.srcObject = stream;
			video.style.display = 'none';
			document.body.appendChild(video);

			// Enhanced iOS/Safari handling
			if (this.isIOS || this.isSafari) {
				video.setAttribute('playsinline', '');
				video.setAttribute('autoplay', '');
				video.setAttribute('muted', '');
            
				await new Promise(resolve => {
					video.onloadedmetadata = () => {
						video.play()
							.then(resolve)
							.catch(error => {
								console.error('iOS video play error:', error);
								resolve(); // Continue even if play fails
							});
					};
				});

				// iOS requires user interaction
				document.body.addEventListener('touchstart', () => {
					video.play().catch(console.error);
				}, { once: true });
			}

			await this.waitForVideoReady(video);
			this.cameraStream = stream;
			this.videoElement = video;
        
			return video;

		} catch (error) {
			console.error('Error accessing camera:', error);
			const message = await this.handleCameraError(error);
			await this.speech.speakFeedback(message);
			return null;
		}
	}








    async handleCameraError(error) {
        console.error('Camera error:', error);
        
        let message = "Camera access needed. Please allow camera access when prompted.";
        
        switch(error.name) {
            case 'NotAllowedError':
                message = "Camera access was denied. Please allow camera access in your browser settings.";
                break;
            case 'NotFoundError':
                message = "No camera found. Please ensure your camera is connected and working.";
                break;
            case 'NotReadableError':
                message = "Camera is in use by another application. Please close other apps using the camera.";
                break;
            case 'OverconstrainedError':
                message = "Camera doesn't meet requirements. Please try a different camera.";
                break;
            case 'AbortError':
                message = "Camera access was interrupted. Please try again.";
                break;
        }
        
        await this.speech.speakFeedback(message);
	    throw new Error(message);

        return false;
    }
	
	
	
	async handleProcessingError(error, operation) {
		console.error(`Error during ${operation}:`, error);
    
		if (this.retryCount >= VisionManager.CONFIG.MAX_RETRIES) {
			throw new Error(`${operation} failed after ${VisionManager.CONFIG.MAX_RETRIES} attempts`);
		}
    
		this.retryCount++;
		await new Promise(resolve => setTimeout(resolve, VisionManager.CONFIG.RETRY_DELAY));
    
		return this.retryOperation(operation);
	}	
	







	
	

    async waitForVideoReady(video) {
        // Give camera time to adjust exposure and focus
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (this.isIOS || this.isSafari) {
            // Additional delay for iOS/Safari camera initialization
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    async captureImage(video) {
        // Set canvas dimensions based on video
        let width = video.videoWidth;
        let height = video.videoHeight;
        
        // Maintain aspect ratio while respecting max size
        if (width > this.MAX_IMAGE_SIZE || height > this.MAX_IMAGE_SIZE) {
            const ratio = Math.min(this.MAX_IMAGE_SIZE / width, this.MAX_IMAGE_SIZE / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
        }

        // Configure temporary canvas
        this.tempCanvas.width = width;
        this.tempCanvas.height = height;
        const tempCtx = this.tempCanvas.getContext('2d');
        
        // Configure RGB canvas
        this.rgbCanvas.width = width;
        this.rgbCanvas.height = height;
        const rgbCtx = this.rgbCanvas.getContext('2d', { alpha: false });

        // Draw white background (required for JPEG)
        rgbCtx.fillStyle = '#FFFFFF';
        rgbCtx.fillRect(0, 0, width, height);
        
        // Draw video frame to temp canvas
        tempCtx.drawImage(video, 0, 0, width, height);
        
        // Draw temp canvas to RGB canvas
        rgbCtx.drawImage(this.tempCanvas, 0, 0);

        // Convert to JPEG with quality adjustment
        let quality = this.INITIAL_QUALITY;
        let imageData = this.rgbCanvas.toDataURL('image/jpeg', quality);
        let size = this.getBase64Size(imageData);

        // Reduce quality if needed to meet size limit
        while (size > this.MAX_FILE_SIZE && quality > this.MIN_QUALITY) {
            quality -= 0.1;
            imageData = this.rgbCanvas.toDataURL('image/jpeg', quality);
            size = this.getBase64Size(imageData);
        }

        // Clear canvases
        this.clearCanvas(this.tempCanvas);
        this.clearCanvas(this.rgbCanvas);

        if (size > this.MAX_FILE_SIZE) {
            throw new Error('Unable to compress image to required size');
        }

        return imageData;
    }







	// 10. Add platform-specific optimizations
	applyPlatformSpecifics(video) {
		if (this.isIOS || this.isSafari) {
			video.setAttribute('playsinline', '');
			video.setAttribute('autoplay', '');
			video.setAttribute('muted', '');
        
			// iOS requires user interaction
			document.body.addEventListener('touchstart', () => {
				video.play().catch(console.error);
			}, { once: true });
		}

		if (this.isMobile) {
			video.style.transform = 'scaleX(-1)';
		}
	}




	// Canvas pooling
	getCanvasFromPool() {
		if (!this.canvasPool) {
			this.canvasPool = [];
		}
		let canvas = this.canvasPool.find(c => !c.inUse);
		if (!canvas) {
			canvas = {
				element: document.createElement('canvas'),
				inUse: false
			};
			this.canvasPool.push(canvas);
		}
		canvas.inUse = true;
		return canvas;
	}

	// Memory management
	manageMemory() {
		if (!this.isProcessing) {
			this.clearCanvas(this.tempCanvas);
			this.clearCanvas(this.rgbCanvas);
			if (this.videoElement && !this.videoElement.srcObject) {
				this.videoElement.remove();
				this.videoElement = null;
			}
		}
	}
















	// Add retakePhoto method:
	retakePhoto() {
		const container = document.getElementById('captured-image-container');
		if (container) {
			container.remove();
		}
		clearTimeout(this.previewTimeout);
		this.callWebcamVisionRoutine();
	}

	// Add manageMemory method:
	manageMemory() {
		if (!this.isProcessing) {
			this.clearCanvas(this.tempCanvas);
			this.clearCanvas(this.rgbCanvas);
        
			if (this.videoElement && !this.videoElement.srcObject) {
				if (this.videoElement.parentNode) {
					this.videoElement.parentNode.removeChild(this.videoElement);
				}
				this.videoElement = null;
			}
		}
	}

	// Add applyPlatformSpecifics method:
	applyPlatformSpecifics(video) {
		if (this.isIOS || this.isSafari) {
			video.setAttribute('playsinline', '');
			video.setAttribute('autoplay', '');
			video.setAttribute('muted', '');
			video.setAttribute('controls', 'false');
        
			document.body.addEventListener('touchstart', () => {
				video.play().catch(error => {
					console.error('iOS video play error:', error);
				});
			}, { once: true });
		}

		if (this.isMobile) {
			video.style.transform = 'scaleX(-1)';
			video.style.webkitTransform = 'scaleX(-1)';
		}
	}

	// Add validateImageFormat method:
	validateImageFormat(imageData) {
		if (!imageData.startsWith('data:image/')) {
			throw new Error('Invalid image format');
		}

		const format = imageData.split(';')[0].split('/')[1];
		const validFormats = ['jpeg', 'jpg', 'png'];
    
		if (!validFormats.includes(format)) {
			throw new Error('Unsupported image format. Please use JPEG or PNG.');
		}

		return format;
	}

	// Add validateImageDimensions method:
	validateImageDimensions(width, height) {
		if (width < this.MIN_IMAGE_SIZE || height < this.MIN_IMAGE_SIZE) {
			throw new Error(`Image too small. Minimum dimensions are ${this.MIN_IMAGE_SIZE}x${this.MIN_IMAGE_SIZE} pixels.`);
		}

		if (width > this.MAX_IMAGE_SIZE * 2 || height > this.MAX_IMAGE_SIZE * 2) {
			throw new Error(`Image too large. Maximum dimensions are ${this.MAX_IMAGE_SIZE * 2}x${this.MAX_IMAGE_SIZE * 2} pixels.`);
		}
	}

	// Add optimizeImageProcessing method:
	optimizeImageProcessing(canvas, ctx, width, height) {
		if ('createImageBitmap' in window) {
			return createImageBitmap(canvas)
				.then(bitmap => {
					ctx.drawImage(bitmap, 0, 0, width, height);
					bitmap.close();
				});
		} else {
			ctx.drawImage(canvas, 0, 0, width, height);
			return Promise.resolve();
		}
	}

	// Add getCanvasFromPool and releaseCanvasToPool methods:
	getCanvasFromPool() {
		if (!this.canvasPool) {
			this.canvasPool = [];
		}

		let canvas = this.canvasPool.find(c => !c.inUse);
		if (!canvas) {
			canvas = {
				element: document.createElement('canvas'),
				inUse: false
			};
			this.canvasPool.push(canvas);
		}

		canvas.inUse = true;
		return canvas;
	}

	releaseCanvasToPool(canvas) {
		const poolCanvas = this.canvasPool.find(c => c.element === canvas);
		if (poolCanvas) {
			poolCanvas.inUse = false;
			poolCanvas.element.width = 1;
			poolCanvas.element.height = 1;
		}
	}

	// Add logImageMetrics method:
	logImageMetrics(imageData) {
		const size = this.getBase64Size(imageData);
		console.log('Image metrics:', {
			size: `${(size / 1024 / 1024).toFixed(2)}MB`,
			format: imageData.split(';')[0].split('/')[1],
			dataLength: imageData.length
		});
	}

	// Add static CONFIG getter:
	static get CONFIG() {
		return {
			CHUNK_SIZE: 1024 * 1024,  // 1MB chunks
			MAX_IMAGE_SIZE: 512,       // Maximum dimension
			MIN_IMAGE_SIZE: 32,        // Minimum dimension
			INITIAL_QUALITY: 0.85,     // Initial JPEG quality
			MIN_QUALITY: 0.1,          // Minimum JPEG quality
			MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB limit
			PREVIEW_DURATION: 10000,   // 10 seconds
			MAX_RETRIES: 3,           // Maximum retry attempts
			RETRY_DELAY: 1000         // Delay between retries
		};
	}










    clearCanvas(canvas) {
        canvas.width = 1;
        canvas.height = 1;
    }

    getBase64Size(base64String) {
        // Remove data URL prefix
        const base64Data = base64String.split(',')[1];
        return (base64Data.length * 3) / 4;
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement = null;
        }
    }







	setupPreviewStyles(container) {
		Object.assign(container.style, {
			position: 'fixed',
			top: '20px',
			right: '20px',
			zIndex: '1000',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center'
		});
	}

	setupImageStyles(image) {
		Object.assign(image.style, {
			maxWidth: '300px',
			border: '2px solid #333',
			borderRadius: '10px',
			marginBottom: '5px'
		});
	}

	createPreviewControls() {
		const controlsDiv = document.createElement('div');
		controlsDiv.className = 'preview-controls';
		controlsDiv.style.textAlign = 'center';
    
		const retakeButton = document.createElement('button');
		retakeButton.textContent = 'Retake';
		retakeButton.className = 'bg-red-500 text-white px-2 py-1 rounded mr-2';
		retakeButton.onclick = () => this.retakePhoto();
    
		controlsDiv.appendChild(retakeButton);
		return controlsDiv;
	}













	// In VisionManager.js
	async handleImageUpload(file) {
		if (!file) {
			throw new Error('No file provided');
		}

		if (!file.type.startsWith('image/')) {
			throw new Error('File must be an image');
		}

		try {
			const imageData = await this.readFileAsDataURL(file);
			const processedImage = await this.processImage(imageData);
        
			if (!processedImage) {
				throw new Error('Image processing failed');
			}

			// Display the processed image
			this.displayCapturedImage(processedImage, false);
			return processedImage;
        
		} catch (error) {
			console.error('Error processing uploaded image:', error);
			throw error;
		}
	}
	
	
	
    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Error reading file: ' + e.target.error));
            reader.readAsDataURL(file);
        });
    }

	async processImage(dataUrl) {
		// Send diagnostic message
		this.websocket.send({
			type: 'sysop_message',
			message: 'VisionManager: Starting image processing...'
		});

		return new Promise((resolve, reject) => {
			const img = new Image();
        
			img.onload = () => {
				try {
					// Process image dimensions
					let width = img.width;
					let height = img.height;

					if (width < this.MIN_IMAGE_SIZE || height < this.MIN_IMAGE_SIZE) {
						throw new Error('Image dimensions too small');
					}

					if (width > this.MAX_IMAGE_SIZE || height > this.MAX_IMAGE_SIZE) {
						const ratio = Math.min(this.MAX_IMAGE_SIZE / width, this.MAX_IMAGE_SIZE / height);
						width = Math.floor(width * ratio);
						height = Math.floor(height * ratio);
					}
	
					// Configure temp canvas
					this.tempCanvas.width = width;
					this.tempCanvas.height = height;
					const tempCtx = this.tempCanvas.getContext('2d');
					tempCtx.drawImage(img, 0, 0, width, height);
	
					// Configure RGB canvas
					this.rgbCanvas.width = width;
					this.rgbCanvas.height = height;
					const rgbCtx = this.rgbCanvas.getContext('2d', { alpha: false });
                
					// Draw white background
					rgbCtx.fillStyle = '#FFFFFF';
					rgbCtx.fillRect(0, 0, width, height);
                
					// Draw image
					rgbCtx.drawImage(this.tempCanvas, 0, 0);

					// Convert to JPEG with quality adjustment
					let quality = this.IMAGE_QUALITY;
					let processedDataUrl = this.rgbCanvas.toDataURL('image/jpeg', quality);
					let finalSize = this.getBase64Size(processedDataUrl);

					// Reduce quality if needed
					while (finalSize > this.MAX_FILE_SIZE && quality > 0.1) {
						quality -= 0.1;
						processedDataUrl = this.rgbCanvas.toDataURL('image/jpeg', quality);
						finalSize = this.getBase64Size(processedDataUrl);
					}

					// Clear canvases
					this.clearCanvas(this.tempCanvas);
					this.clearCanvas(this.rgbCanvas);

					if (finalSize > this.MAX_FILE_SIZE) {
						throw new Error('Unable to compress image to required size');
					}

					resolve(processedDataUrl);

				} catch (error) {
					reject(error);
				}
			};

			img.onerror = () => reject(new Error('Failed to load image'));
			img.src = dataUrl;
		});
	}
	
    displayCapturedImage(imageData, isFromCamera = false) {
        // Only show floating preview for camera captures
        if (isFromCamera) {
            const existingContainer = document.getElementById('captured-image-container');
            if (existingContainer) {
                existingContainer.remove();
            }

            const imageContainer = document.createElement('div');
            imageContainer.id = 'captured-image-container';
            imageContainer.style.position = 'fixed';
            imageContainer.style.top = '20px';
            imageContainer.style.right = '20px';
            imageContainer.style.zIndex = '1000';
            
            // Add preview controls if from camera
            if (isFromCamera) {
                const controlsDiv = document.createElement('div');
                controlsDiv.className = 'preview-controls';
                controlsDiv.style.textAlign = 'center';
                controlsDiv.style.marginTop = '5px';
                
                const retakeButton = document.createElement('button');
                retakeButton.textContent = 'Retake';
                retakeButton.className = 'bg-red-500 text-white px-2 py-1 rounded mr-2';
                retakeButton.onclick = () => this.retakePhoto();
                
                controlsDiv.appendChild(retakeButton);
                imageContainer.appendChild(controlsDiv);
            }

            const image = document.createElement('img');
            image.src = imageData;
            image.style.maxWidth = '300px';
            image.style.border = '2px solid #333';
            image.style.borderRadius = '10px';

            imageContainer.appendChild(image);
            document.body.appendChild(imageContainer);

            // Remove preview after timeout
            clearTimeout(this.previewTimeout);
            this.previewTimeout = setTimeout(() => {
                if (imageContainer.parentNode) {
                    imageContainer.remove();
                }
            }, this.PREVIEW_DURATION);
        }
    }

    async processVisionQuery(imageData) {
        if (!imageData.startsWith('data:image/jpeg')) {
            throw new Error('Image must be in JPEG format');
        }

        const base64Data = imageData.split(',')[1];
        
        const query = {
            type: 'submit_query',
            query: {
                prompt: "Describe this image in detail",
                query_type: "vision",
                model_type: "worker_node",
                model_name: "default_vision_model",
                image: base64Data
            }
        };

        this.websocket.send(query);
        if (this.speech) {
            this.speech.wakeWordState = 'processing';
        }
    }

    retakePhoto() {
        const container = document.getElementById('captured-image-container');
        if (container) {
            container.remove();
        }
        clearTimeout(this.previewTimeout);
        this.callWebcamVisionRoutine();
    }

	cleanup() {
		// Stop camera if active
		this.stopCamera();
    
		// Clear timeouts
		clearTimeout(this.previewTimeout);
    
		// Remove any existing preview
		const container = document.getElementById('captured-image-container');
		if (container) {
			container.remove();
		}
    
		// Clear canvases
		this.clearCanvas(this.tempCanvas);
		this.clearCanvas(this.rgbCanvas);
    
		// Reset state
		this.isProcessing = false;
		this.retryCount = 0;
    
		// Clear video element
		if (this.videoElement) {
			if (this.videoElement.parentNode) {
				this.videoElement.parentNode.removeChild(this.videoElement);
			}
			this.videoElement = null;
		}

		// Additional cleanups from my recommendation
		if (this.cameraStream) {
			this.cameraStream.getTracks().forEach(track => track.stop());
			this.cameraStream = null;
		}

		// Clean up canvas pool
		this.canvasPool.forEach(canvas => {
			if (canvas.element) {
				this.clearCanvas(canvas.element);
				canvas.inUse = false;
			}
		});

		// Reset any active previews
		if (this.activePreview) {
			this.activePreview = null;
		}
	}
    // Memory management
    manageMemory() {
        // Clear unused resources
        if (!this.isProcessing) {
            this.clearCanvas(this.tempCanvas);
            this.clearCanvas(this.rgbCanvas);
            
            if (this.videoElement && !this.videoElement.srcObject) {
                if (this.videoElement.parentNode) {
                    this.videoElement.parentNode.removeChild(this.videoElement);
                }
                this.videoElement = null;
            }
        }
    }

    // Platform specific adjustments
    applyPlatformSpecifics(video) {
        if (this.isIOS || this.isSafari) {
            // iOS and Safari specific attributes
            video.setAttribute('playsinline', '');
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('controls', 'false');
            
            // iOS requires user interaction for media playback
            document.body.addEventListener('touchstart', () => {
                video.play().catch(error => {
                    console.error('iOS video play error:', error);
                });
            }, { once: true });
        }

        if (this.isMobile) {
            // Mobile specific adjustments
            video.style.transform = 'scaleX(-1)'; // Mirror front camera
            video.style.webkitTransform = 'scaleX(-1)';
        }
    }

    // Error handling with recovery
    async handleError(error, operation) {
        console.error(`Error during ${operation}:`, error);
        
        if (this.retryCount < this.MAX_RETRIES) {
            this.retryCount++;
            console.log(`Retrying operation: ${operation} (Attempt ${this.retryCount})`);
            
            // Cleanup before retry
            this.cleanup();
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Retry operation
            switch (operation) {
                case 'camera_setup':
                    return await this.setupCamera();
                case 'image_capture':
                    return await this.captureImage(this.videoElement);
                case 'image_processing':
                    return await this.processImage(error.imageData);
                default:
                    throw new Error(`Unknown operation: ${operation}`);
            }
        } else {
            // Max retries exceeded
            this.retryCount = 0;
            throw new Error(`${operation} failed after ${this.MAX_RETRIES} attempts`);
        }
    }

	validateImageDimensions(width, height) {
		if (width < VisionManager.CONFIG.MIN_IMAGE_SIZE || 
			height < VisionManager.CONFIG.MIN_IMAGE_SIZE) {
			throw new Error('Image dimensions too small');
		}

		if (width > VisionManager.CONFIG.MAX_IMAGE_SIZE * 2 || 
			height > VisionManager.CONFIG.MAX_IMAGE_SIZE * 2) {
			throw new Error('Image dimensions too large');
		}
	}





	// 8. Add enhanced image processing methods
	calculateDimensions(width, height) {
		if (width > VisionManager.CONFIG.MAX_IMAGE_SIZE || 
			height > VisionManager.CONFIG.MAX_IMAGE_SIZE) {
			const ratio = Math.min(
				VisionManager.CONFIG.MAX_IMAGE_SIZE / width,
				VisionManager.CONFIG.MAX_IMAGE_SIZE / height
			);
			return {
				width: Math.floor(width * ratio),
				height: Math.floor(height * ratio)
			};
		}
		return { width, height };
	}


	async processImageDimensions(img, width, height) {
		const canvas = this.getCanvasFromPool();
    
		try {
			// Draw white background (required for JPEG)
			this.rgbCtx.fillStyle = '#FFFFFF';
			this.rgbCtx.fillRect(0, 0, width, height);
        
			// Optimized image drawing
			await this.optimizeImageProcessing(canvas.element, this.rgbCtx, width, height);
        
			// Convert to JPEG with quality adjustment
			let quality = VisionManager.CONFIG.INITIAL_JPEG_QUALITY;
			let processedDataUrl = canvas.element.toDataURL('image/jpeg', quality);
			let size = this.getBase64Size(processedDataUrl);
        
			// Reduce quality if needed
			while (size > VisionManager.CONFIG.MAX_FILE_SIZE && 
				quality > VisionManager.CONFIG.MIN_JPEG_QUALITY) {
				quality -= 0.1;
				processedDataUrl = canvas.element.toDataURL('image/jpeg', quality);
				size = this.getBase64Size(processedDataUrl);
			}
        
			if (size > VisionManager.CONFIG.MAX_FILE_SIZE) {
				throw new Error('Unable to compress image to required size');
			}
        
			return processedDataUrl;
		} finally {
			this.releaseCanvasToPool(canvas);
		}
	}





    validateImageDimensions(width, height) {
        if (width < this.MIN_IMAGE_SIZE || height < this.MIN_IMAGE_SIZE) {
            throw new Error(`Image too small. Minimum dimensions are ${this.MIN_IMAGE_SIZE}x${this.MIN_IMAGE_SIZE} pixels.`);
        }

        if (width > this.MAX_IMAGE_SIZE * 2 || height > this.MAX_IMAGE_SIZE * 2) {
            throw new Error(`Image too large. Maximum dimensions are ${this.MAX_IMAGE_SIZE * 2}x${this.MAX_IMAGE_SIZE * 2} pixels.`);
        }
    }

	// 9. Add performance optimization methods
	async optimizeImageProcessing(canvas, ctx, width, height) {
		if ('createImageBitmap' in window) {
			const bitmap = await createImageBitmap(canvas);
			ctx.drawImage(bitmap, 0, 0, width, height);
			bitmap.close();
		} else {
			ctx.drawImage(canvas, 0, 0, width, height);
		}
	}



	updateProcessingMetrics(startTime) {
		const processingTime = performance.now() - startTime;
		this.processingMetrics.lastProcessingTime = processingTime;
    
		// Update moving average
		this.processingMetrics.avgProcessingTime = 
			(this.processingMetrics.avgProcessingTime * 0.9) + (processingTime * 0.1);
	}














    // Resource pooling
    getCanvasFromPool() {
        // Reuse existing canvas if available
        if (!this.canvasPool) {
            this.canvasPool = [];
        }

        let canvas = this.canvasPool.find(c => !c.inUse);
        if (!canvas) {
            canvas = {
                element: document.createElement('canvas'),
                inUse: false
            };
            this.canvasPool.push(canvas);
        }

        canvas.inUse = true;
        return canvas;
    }

    releaseCanvasToPool(canvas) {
        const poolCanvas = this.canvasPool.find(c => c.element === canvas);
        if (poolCanvas) {
            poolCanvas.inUse = false;
            poolCanvas.element.width = 1;
            poolCanvas.element.height = 1;
        }
    }

    // Debug utilities
    logImageMetrics(imageData) {
        const size = this.getBase64Size(imageData);
        console.log('Image metrics:', {
            size: `${(size / 1024 / 1024).toFixed(2)}MB`,
            format: imageData.split(';')[0].split('/')[1],
            dataLength: imageData.length
        });
    }

    // Constants and configurations
    static get CONFIG() {
        return {
            CHUNK_SIZE: 1024 * 1024,  // 1MB chunks
            MAX_IMAGE_SIZE: 512,       // Maximum dimension
            MIN_IMAGE_SIZE: 32,        // Minimum dimension
            INITIAL_QUALITY: 0.85,     // Initial JPEG quality
            MIN_QUALITY: 0.1,          // Minimum JPEG quality
            MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB limit
            PREVIEW_DURATION: 10000,   // 10 seconds
            MAX_RETRIES: 3,           // Maximum retry attempts
            RETRY_DELAY: 1000         // Delay between retries
        };
    }
}

export default VisionManager;