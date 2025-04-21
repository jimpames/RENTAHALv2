export class WeatherManager {
    constructor(websocketManager, speechManager) {
        this.websocket = websocketManager;
        this.speech = speechManager;
        this.container = null;
        this.API_KEY = 'bf36f5af81025ffc4dbd2c5b046de2b0';
        this.permissionPending = false;
    }

    async getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: 20000,
                    maximumAge: 300000
                });
            } else {
                reject(new Error("Geolocation is not supported by this browser."));
            }
        });
    }

    async processWeatherCommand() {
        try {
            // First check if we have permission
            const permission = await navigator.permissions.query({ name: 'geolocation' });
            if (permission.state === 'denied') {
                await this.speech.speakFeedback("Location access is required for weather information. Please enable location access in your settings.");
                await this.speech.cycleToMainMenu();
                return;
            }

            await this.speech.speakFeedback("Getting weather information...");
            const position = await this.getCurrentPosition();
            const weatherData = await this.fetchWeatherData(position.coords.latitude, position.coords.longitude);
            await this.handleWeatherData(weatherData);

        } catch (error) {
            await this.speech.speakFeedback("Unable to access location. " + error.message);
            await this.speech.cycleToMainMenu();
        }
    }

    async fetchWeatherData(lat, lon) {
        try {
            const [weatherResponse, geoResponse] = await Promise.all([
                fetch(`https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily,alerts&units=imperial&appid=${this.API_KEY}`),
                fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${this.API_KEY}`)
            ]);

            if (!weatherResponse.ok) throw new Error(`Weather API error: ${weatherResponse.status}`);
            if (!geoResponse.ok) throw new Error(`Geo API error: ${geoResponse.status}`);

            const weatherData = await weatherResponse.json();
            const geoData = await geoResponse.json();

            return {
                temperature: Math.round(weatherData.current.temp),
                description: weatherData.current.weather[0].description,
                humidity: weatherData.current.humidity,
                windSpeed: Math.round(weatherData.current.wind_speed),
                city: geoData[0].name,
                state: geoData[0].state
            };
        } catch (error) {
            throw new Error('Unable to fetch weather information');
        }
    }

    async handleWeatherData(weatherData) {
        if (!weatherData) {
            await this.speech.speakFeedback("Sorry, I couldn't get the weather information.");
            await this.speech.cycleToMainMenu();
            return;
        }

        const location = weatherData.state ? 
            `${weatherData.city}, ${weatherData.state}` : 
            weatherData.city;

        const weatherMessage = 
            `The current weather in ${location} is ${weatherData.description}. ` +
            `The temperature is ${weatherData.temperature} degrees Fahrenheit. ` +
            `Humidity is ${weatherData.humidity}% and wind speed is ${weatherData.windSpeed} miles per hour.`;

        await this.speech.speakFeedback(weatherMessage);
        await this.speech.cycleToMainMenu();
    }
}

export default WeatherManager;