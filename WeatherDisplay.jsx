import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

const WeatherDisplay = () => {
  const [permissionState, setPermissionState] = useState('initial'); // initial, requesting, granted, denied, error
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(null);
  const API_KEY = 'bf36f5af81025ffc4dbd2c5b046de2b0';

  const requestLocation = async () => {
    setPermissionState('requesting');
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000
        });
      });
      
      setPermissionState('granted');
      await fetchWeather(position.coords.latitude, position.coords.longitude);
    } catch (err) {
      setPermissionState('denied');
      if (err.code === 1) {
        setError('Location access was denied. Please enable location services to get weather information.');
      } else if (err.code === 2) {
        setError('Location information is currently unavailable.');
      } else if (err.code === 3) {
        setError('Location request timed out. Please try again.');
      } else {
        setError('An error occurred while getting location.');
      }
    }
  };

  const fetchWeather = async (lat, lon) => {
    try {
      const [weatherResponse, geoResponse] = await Promise.all([
        fetch(`https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily,alerts&units=imperial&appid=${API_KEY}`),
        fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`)
      ]);

      if (!weatherResponse.ok || !geoResponse.ok) {
        throw new Error('Weather service unavailable');
      }

      const weatherData = await weatherResponse.json();
      const geoData = await geoResponse.json();

      if (weatherData.current && geoData.length > 0) {
        setWeather({
          temperature: Math.round(weatherData.current.temp),
          description: weatherData.current.weather[0].description,
          humidity: weatherData.current.humidity,
          windSpeed: Math.round(weatherData.current.wind_speed),
          city: geoData[0].name,
          state: geoData[0].state
        });
      }
    } catch (err) {
      setError('Unable to fetch weather data. Please try again later.');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-4">
      {permissionState === 'initial' && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Location Permission Required</AlertTitle>
          <AlertDescription>
            To show weather information, we need access to your location.
            <button
              onClick={requestLocation}
              className="mt-2 w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
            >
              Allow Location Access
            </button>
          </AlertDescription>
        </Alert>
      )}

      {permissionState === 'requesting' && (
        <div className="text-center p-4">
          <p>Requesting location access...</p>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {weather && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold mb-4">
            {weather.city}{weather.state ? `, ${weather.state}` : ''}
          </h2>
          <div className="space-y-2">
            <p className="text-4xl font-bold text-blue-600">
              {weather.temperature}°F
            </p>
            <p className="text-lg capitalize">{weather.description}</p>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-gray-600">Humidity</p>
                <p className="text-xl">{weather.humidity}%</p>
              </div>
              <div>
                <p className="text-gray-600">Wind Speed</p>
                <p className="text-xl">{weather.windSpeed} mph</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherDisplay;