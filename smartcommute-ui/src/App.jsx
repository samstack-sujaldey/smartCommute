import React, { useState, useEffect, useRef } from "react";
import ScrollReveal from "scrollreveal";

const LoadingState = () => {
  const [msgIndex, setMsgIndex] = useState(0);

  // Fun messages that create the illusion of active progress
  const messages = [
    "Haggling with Uber drivers... 🚗",
    "Checking traffic for Rapido... 🏍️",
    "Negotiating Ola fares... 🛺",
    "Finding the absolute cheapest ride... 💰",
    "Crunching the final numbers... 🧮",
    "Almost there! 🏁",
  ];

  useEffect(() => {
    // Change the message every 2.5 seconds
    const timer = setInterval(() => {
      setMsgIndex((prev) => Math.min(prev + 1, messages.length - 1));
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="py-12 mb-6 flex flex-col items-center justify-center space-y-5 bg-white rounded-2xl border border-gray-100 shadow-sm reveal-item">
      <div className="relative flex justify-center items-center w-16 h-16">
        {/* Background Track */}
        <div className="absolute w-full h-full border-4 border-gray-100 rounded-full"></div>
        {/* Spinning Blue Ring */}
        <div className="absolute w-full h-full border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
        {/* Bouncing Taxi */}
        <span className="text-2xl animate-bounce mt-1">🚕</span>
      </div>

      {/* Changing Text */}
      <div className="h-6 flex items-center justify-center">
        <p className="text-sm font-bold text-gray-600 tracking-wide animate-pulse transition-all">
          {messages[msgIndex]}
        </p>
      </div>
    </div>
  );
};

// ================= GEOLOCATION & WEATHER HELPER =================
const fetchCurrentLocationAndWeather = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject("Geolocation is not supported by your browser");
    } else {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          try {
            const weatherRes = await fetch(
              `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=2a2ada51459a3287e2c958b8d97902f1`,
            );
            const weatherData = await weatherRes.json();
            const temperature = Math.round(weatherData.main.temp);
            const condition = weatherData.weather[0].main;

            const geoRes = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
            );
            const geoData = await geoRes.json();
            const pickupAddress =
              `${geoData.address.suburb || geoData.address.neighbourhood || ""}, ${geoData.address.city || geoData.address.town || ""}`.replace(
                /^, /,
                "",
              );

            resolve({ pickupAddress, weather: { temperature, condition } });
          } catch (error) {
            reject("Failed to fetch location or weather details.");
          }
        },
        () => reject("Location permission denied. Please allow GPS access."),
      );
    }
  });
};

export default function App() {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [weatherData, setWeatherData] = useState(null);
  const [fares, setFares] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  // New state for the login setup process
  const [setupLoading, setSetupLoading] = useState(false);

  const resultsContainerRef = useRef(null);

  const handleLocateMe = async () => {
    setLocating(true);
    try {
      const { pickupAddress, weather } = await fetchCurrentLocationAndWeather();
      setPickup(pickupAddress);
      setWeatherData(weather);
    } catch (error) {
      alert(error);
    } finally {
      setLocating(false);
    }
  };

  // --- NEW: Trigger Backend Login Script ---
  const handleLoginSetup = async () => {
    setSetupLoading(true);
    try {
      // Note: Change localhost to your Ubuntu IP (e.g., 192.168.1.5) if testing from a phone!
      await fetch("https://smartcommute-n4dk.onrender.com/api/setup-logins", { method: "POST" });
      alert("✅ Session saved successfully! You can now search for rides.");
    } catch (error) {
      alert("Failed to connect to backend to start login setup.");
    }
    setSetupLoading(false);
  };

  const fetchLiveFares = async (e) => {
    if (e) e.preventDefault();
    if (!pickup || !dropoff) return alert("Enter both locations!");

    setLoading(true);
    setFares(null);
    setAiSuggestion(null);

    try {
      const response = await fetch("https://smartcommute-n4dk.onrender.com/api/get-fares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup,
          dropoff,
          weatherCondition: weatherData?.condition || "Clear",
          temperatureC: weatherData?.temperature || 25,
        }),
      });

      const data = await response.json();

      if (data.success && data.fares) {
        setFares(data.fares);
        setAiSuggestion(data.ai_recommendation);
      } else {
        alert("Error fetching fares from backend.");
      }
    } catch (error) {
      console.error(error);
      alert("Backend server is not running or failed!");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (fares && resultsContainerRef.current) {
      ScrollReveal().reveal(".reveal-item", {
        delay: 150,
        distance: "30px",
        origin: "bottom",
        interval: 100,
        duration: 700,
        easing: "cubic-bezier(0.5, 0, 0, 1)",
      });
    }
  }, [fares]);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 text-gray-800 sm:my-8 sm:rounded-[2.5rem] sm:border shadow-2xl overflow-hidden font-sans pb-10">
      {/* --- NEW: LOGIN BANNER --- */}
      <div className="bg-indigo-600 text-white text-xs px-4 py-3 flex items-center justify-between">
        <span className="font-medium">
          ⚠️ Make sure to login to the providers first!
        </span>
        <button
          onClick={handleLoginSetup}
          disabled={setupLoading}
          className="bg-white text-indigo-600 px-3 py-1.5 rounded-full font-bold shadow-sm hover:bg-gray-100 disabled:opacity-50 transition-all"
        >
          {setupLoading ? "Check Server..." : "Login Now"}
        </button>
      </div>

      <div className="flex items-center justify-between p-5 bg-white border-b border-gray-100">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <span className="text-blue-500 text-2xl">📍</span> SmartCommute{" "}
          <span className="text-purple-600">AI</span>
        </h1>
      </div>

      <div className="p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 relative">
          <div className="absolute left-7 top-10 bottom-10 w-0.5 bg-gray-200 z-0"></div>
          <div className="flex items-center gap-3 mb-4 relative z-10">
            <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center shrink-0">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
            </div>
            <div className="flex-1 flex items-center justify-between">
              <div className="flex flex-col w-full">
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
                  Pickup
                </span>
                <input
                  className="w-full bg-transparent outline-none font-medium text-gray-800"
                  placeholder="Enter Pickup Location"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                />
              </div>
              <button
                onClick={handleLocateMe}
                className="text-gray-400 hover:text-black p-2"
              >
                {locating ? "..." : "📍"}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center shrink-0">
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
            </div>
            <div className="flex-1 flex items-center justify-between border-t border-gray-100 pt-3">
              <div className="flex flex-col w-full">
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
                  Drop
                </span>
                <input
                  className="w-full bg-transparent outline-none font-medium text-gray-800"
                  placeholder="Enter Dropoff Location"
                  value={dropoff}
                  onChange={(e) => setDropoff(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* --- FIXED: Button is permanently visible and updates text dynamically --- */}
        {!loading && (
          <button
            onClick={fetchLiveFares}
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-blue-700 mb-6 transition-all"
          >
            {fares ? "Search Again" : "Find Rides"}
          </button>
        )}

        {loading && <LoadingState/>}

        {fares && !loading && (
          <div className="space-y-4" ref={resultsContainerRef}>
            {aiSuggestion && (
              <div className="reveal-item bg-blue-50 rounded-2xl p-5 border border-blue-100 shadow-sm">
                <h2 className="text-xs font-bold text-blue-800 mb-2 uppercase">
                  ✨ AI Recommendation
                </h2>
                <div className="flex items-start gap-3">
                  <div className="text-3xl">
                    {weatherData?.condition?.includes("Rain") ? "🌧️" : "⛅"}
                  </div>
                  <p className="text-sm text-gray-700">
                    {aiSuggestion.description}
                  </p>
                </div>
              </div>
            )}
            <FareRow title="🏍️ BIKES" vendors={fares.bike} />
            <FareRow title="🛺 AUTOS" vendors={fares.auto} />
            <FareRow title="🚗 CABS" vendors={fares.cab} />
          </div>
        )}
      </div>
    </div>
  );
}

const FareRow = ({ title, vendors }) => {
  // Filter out any vendors that failed to return a price
  const activeVendors = Object.entries(vendors).filter(
    ([_, price]) => price !== "N/A",
  );

  if (activeVendors.length === 0) return null;

  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm reveal-item">
      <h3 className="font-bold text-gray-800 text-[15px] mb-3">{title}</h3>
      <div className="flex gap-3 overflow-x-auto hide-scrollbar">
        {activeVendors.map(([vendorName, price]) => (
          <div
            key={vendorName}
            className="border border-gray-100 rounded-xl p-3 min-w-30 flex flex-col items-center"
          >
            <span className="text-[10px] uppercase font-bold text-gray-400">
              {vendorName}
            </span>
            <span className="text-lg font-black text-gray-900">{price}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
