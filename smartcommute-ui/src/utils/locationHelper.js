// frontend/src/utils/locationHelper.js

export const fetchCurrentLocationAndWeather = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject("Geolocation is not supported by your browser");
    } else {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        try {
          // 1. Fetch Weather from OpenWeatherMap (Replace with your free API key)
          const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=YOUR_OPENWEATHER_API_KEY`);
          const weatherData = await weatherRes.json();
          
          const temperature = weatherData.main.temp;
          const condition = weatherData.weather[0].main; // e.g., "Clear", "Rain"

          // 2. Reverse Geocoding: Convert Lat/Lon to a readable address for Uber/Ola
          // Using free OpenStreetMap Nominatim API (No card required)
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
          const geoData = await geoRes.json();
          
          // Extract a clean readable address string
          const pickupAddress = `${geoData.address.suburb || geoData.address.neighbourhood || ''}, ${geoData.address.city || geoData.address.town}, ${geoData.address.state}`.replace(/^, /, '');

          resolve({
            pickupAddress,
            weather: { temperature, condition }
          });

        } catch (error) {
          reject("Failed to fetch location or weather details.");
        }
      }, () => {
        reject("Location permission denied. Please allow GPS access.");
      });
    }
  });
};