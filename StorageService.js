export class StorageService {
    static setItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    static getItem(key) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return null;
        }
    }

    static removeItem(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error('Error removing from localStorage:', error);
        }
    }

    static savePreferences(preferences) {
        this.setItem('userPreferences', preferences);
    }

    static loadPreferences() {
        return this.getItem('userPreferences') || {
            theme: 'light',
            speechOutput: false,
            wakeWordEnabled: false,
            fontSize: '16px'
        };
    }

    static setGmailToken(token) {
        this.setItem('gmail_access_token', token);
    }

    static getGmailToken() {
        return this.getItem('gmail_access_token');
    }

    static clearGmailToken() {
        this.removeItem('gmail_access_token');
    }

    static updateUserStats(stats) {
        this.setItem('userStats', stats);
    }

    static getUserStats() {
        return this.getItem('userStats') || {
            totalQueries: 0,
            totalCost: 0,
            totalTime: 0
        };
    }
}
