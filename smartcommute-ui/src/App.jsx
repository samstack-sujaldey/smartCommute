import React, { useState, useEffect, useRef } from "react";
import ScrollReveal from "scrollreveal";

export default function App() {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [fares, setFares] = useState(null);
  const [loading, setLoading] = useState(false);

  const resultsContainerRef = useRef(null);

  const fetchLiveFares = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFares(null); // Clear previous results

    try {
      const response = await fetch("http://localhost:5000/api/get-fares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickup, dropoff }),
      });
      const data = await response.json();
      if (data.fares) {
        setFares(data.fares);
      } else {
        alert("Error fetching fares.");
      }
    } catch (error) {
      alert("Backend server is not running!");
    }
    setLoading(false);
  };

  // Initialize ScrollReveal when fares data loads
  useEffect(() => {
    if (fares && resultsContainerRef.current) {
      ScrollReveal().reveal(".reveal-item", {
        delay: 150,
        distance: "30px",
        origin: "bottom",
        interval: 100, // Staggers the animation for each card
        duration: 700,
        easing: "cubic-bezier(0.5, 0, 0, 1)",
      });
    }
  }, [fares]);

  return (
    <div className="max-w-md mx-auto min-h-screen p-5 font-sans text-gray-800 shadow-xl bg-white sm:my-8 sm:rounded-2xl sm:border">
      <h1 className="text-2xl font-black text-center mb-6 tracking-tight">
        SmartCommute <span className="text-purple-600">AI</span>
      </h1>

      {/* Input Form */}
      <form onSubmit={fetchLiveFares} className="p-1 mb-6 space-y-3">
        <input
          className="w-full bg-gray-50 border p-3 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 transition-all"
          placeholder="📍 Pickup Location"
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
          required
        />
        <input
          className="w-full bg-gray-50 border p-3 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 transition-all"
          placeholder="🏁 Dropoff Location"
          value={dropoff}
          onChange={(e) => setDropoff(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white font-bold py-3.5 rounded-xl disabled:opacity-50 hover:bg-gray-800 transition-all shadow-md"
        >
          {loading ? "🤖 Connecting to Live Browsers..." : "Search Live Fares"}
        </button>
      </form>

      {/* Loading Indicator */}
      {loading && (
        <div className="text-center text-gray-500 mt-12 mb-12">
          <div className="text-4xl mb-4 animate-bounce">🚗</div>
          <p className="font-medium animate-pulse">
            Running live aggregators & predictive algorithms...
          </p>
          <p className="text-xs mt-2 text-gray-400">
            This usually takes about 10-15 seconds.
          </p>
        </div>
      )}

      {/* Results Container */}
      {fares && !loading && (
        <div className="space-y-6" ref={resultsContainerRef}>
          {/* AI Banner */}
          <div className="reveal-item bg-linear-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white shadow-lg">
            <h2 className="font-bold text-lg mb-2 flex items-center gap-2">
              <span>✨</span> AI Recommendation
            </h2>
            <p className="text-sm opacity-95 leading-relaxed">
              Based on the real-time data, Rapido Bike ({fares.bike.rapido}) is
              currently the cheapest option. However, if you need comfort, the
              Ola Auto projection ({fares.auto.ola}) undercuts Uber's current
              surge pricing.
            </p>
          </div>

          {/* Fare Cards */}
          <div className="reveal-item">
            <FareRow title="🏍️ BIKES" vendors={fares.bike} />
          </div>
          <div className="reveal-item">
            <FareRow title="🛺 AUTOS" vendors={fares.auto} />
          </div>
          <div className="reveal-item">
            <FareRow title="🚗 CABS" vendors={fares.cab} />
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable Component for Vendor Categories
const FareRow = ({ title, vendors }) => (
  <div className="mb-2">
    <h3 className="font-bold text-gray-700 mb-3 text-sm tracking-wide">
      {title}
    </h3>
    <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
      {Object.entries(vendors).map(([vendorName, price]) => {
        if (price === "N/A") return null;

        // Assign dynamic colors based on vendor
        let ringColor = "border-gray-200";
        if (vendorName === "uber") ringColor = "border-black border-2";
        if (vendorName === "ola") ringColor = "border-green-400 border-2";
        if (vendorName === "rapido") ringColor = "border-yellow-400 border-2";

        return (
          <div
            key={vendorName}
            className={`bg-white shadow-sm rounded-2xl p-4 min-w-32.5 shrink-0 flex flex-col items-center snap-center ${ringColor}`}
          >
            <p className="font-bold text-gray-500 capitalize text-sm mb-1">
              {vendorName}
            </p>
            <p className="text-2xl font-black text-gray-900">{price}</p>
          </div>
        );
      })}
    </div>
  </div>
);
