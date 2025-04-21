
    // Config.js updates
export const CONFIG = {
    WEBSOCKET: {
        // WebSocket configuration
        RECONNECT_INTERVAL: 1000,
        MAX_RECONNECT_INTERVAL: 30000,
        HEARTBEAT_INTERVAL: 25000,
        HEARTBEAT_TIMEOUT: 35000,
        MESSAGE_TIMEOUT: 30000,
        RETRY_RESET_TIMEOUT: 300000,
        MAX_QUEUE_SIZE: 100,
        MAX_RETRY_ATTEMPTS: 5,
        RETRY_BACKOFF_MULTIPLIER: 2,
        HEALTH_CHECK_INTERVAL: 60000
    },
    INTERFACE: {
        STATUS: {
            CONNECTED: 'Connected to server',
            DISCONNECTED: 'Connection lost. Attempting to reconnect...',
            ERROR: 'WebSocket error occurred',
            MAX_RETRIES: 'Connection failed after maximum retry attempts'
        },
        ERRORS: {
            QUEUE_FULL: 'Message queue full',
            SOCKET_CLOSED: 'WebSocket not open',
            TIMEOUT: 'Message timeout',
            CONNECTION_FAILED: 'Connection failed'
        }
    },
    // ... rest of existing CONFIG
    GMAIL: {
        // Gmail API configuration
        CLIENT_ID: '833397170915-hu6iju9klda3tio75sc8sgr01mpi74lq.apps.googleusercontent.com',
        API_KEY: 'AIzaSyBYQtY9Y3GVOdQLBrySPOTEnpLXT7mJuGk',
        DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest',
        SCOPES: 'https://www.googleapis.com/auth/gmail.readonly',
        REDIRECT_URI: 'https://rentahal.com/static/oauth-callback.html'
    },
    WAKE_WORD: {
        TRIGGER: 'computer',
        MODES: ['chat', 'vision', 'imagine', 'weather', 'gmail'],
        TIMEOUT: 15000,
        PROMPT_TIMEOUT: 15000
    },
    AUDIO: {
        // Audio processing configuration
        FFT_SIZE: 2048,
        MAX_BARK_WORDS: 20
    },
    VISION: {
        // Vision processing configuration
        CHUNK_SIZE: 1024 * 1024, // 1MB chunks
        MAX_IMAGE_SIZE: {
            width: 512,
            height: 512
        }
    },
    UI: {
        // UI-related constants
        DEFAULT_CHAT_MODEL: '2070sLABCHAT',
        DEFAULT_MODEL_TYPE: 'worker_node'
    }
};

export const WORKER_TYPES = {
    CHAT: 'chat',
    VISION: 'vision',
    IMAGINE: 'imagine'
};

export const MODEL_TYPES = {
    WORKER_NODE: 'worker_node',
    HUGGINGFACE: 'huggingface',
    CLAUDE: 'claude'
};

export const QUERY_TYPES = {
    CHAT: 'chat',
    VISION: 'vision',
    IMAGINE: 'imagine',
    SPEECH: 'speech'
};
