const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Standard desktop user agent to bypass bot detection
const REAL_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// --- HELPER FUNCTIONS ---

function generateSmartSuggestion(prices, weatherCondition, temperatureC) {
  const getCheapest = (type) => {
    const platformPrices = {
      uber: prices.uber[type],
      ola: prices.ola[type],
      rapido: prices.rapido[type],
    };
    const validPrices = Object.entries(platformPrices).filter(
      ([_, p]) => p !== null,
    );
    if (validPrices.length === 0) return null;
    validPrices.sort((a, b) => a[1] - b[1]);
    return { platform: validPrices[0][0], price: validPrices[0][1] };
  };

  const bestBike = getCheapest("bike");
  const bestAuto = getCheapest("auto");
  const bestCab = getCheapest("cab");

  let suggestion = "";
  let reason = "";

  if (
    weatherCondition.toLowerCase().includes("rain") ||
    weatherCondition.toLowerCase().includes("storm")
  ) {
    if (bestCab) {
      suggestion = `Book a Cab via ${bestCab.platform.toUpperCase()} (₹${bestCab.price})`;
      reason = "It's raining! Avoid bikes and autos to stay dry.";
    } else if (bestAuto) {
      suggestion = `Book an Auto via ${bestAuto.platform.toUpperCase()} (₹${bestAuto.price})`;
      reason = "It's raining. An auto is your best bet.";
    }
  } else if (temperatureC > 35) {
    if (bestCab) {
      suggestion = `Book an AC Cab via ${bestCab.platform.toUpperCase()} (₹${bestCab.price})`;
      reason = `It's burning hot outside (${temperatureC}°C). Get an AC cab.`;
    } else if (bestAuto) {
      suggestion = `Book an Auto via ${bestAuto.platform.toUpperCase()} (₹${bestAuto.price})`;
      reason = `It's ${temperatureC}°C outside. Avoid bikes.`;
    }
  } else {
    if (bestBike) {
      suggestion = `Take a Bike via ${bestBike.platform.toUpperCase()} (₹${bestBike.price})`;
      reason = `Pleasant weather (${temperatureC}°C). A bike is fast and cheap!`;
    } else if (bestAuto) {
      suggestion = `Take an Auto via ${bestAuto.platform.toUpperCase()} (₹${bestAuto.price})`;
      reason = `Perfect weather for an auto ride.`;
    }
  }

  if (!suggestion)
    return {
      title: "No Rides Available",
      description: "Couldn't find active rides.",
    };
  return { title: suggestion, description: reason };
}

// --- SCRAPER FUNCTIONS ---

async function scrapeUber(browser, pickup, dropoff) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(REAL_USER_AGENT);
    const context = browser.defaultBrowserContext();
    await context.overridePermissions("https://m.uber.com", ["geolocation"]);

    console.log("[Uber] Opening new tab in DESKTOP mode...");
    await page.setViewport({ width: 1280, height: 800, isMobile: false });

    try {
      await page.goto("https://m.uber.com/looking", {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
    } catch (gotoError) {
      console.log("[Uber] Base page load settled.");
    }
    await delay(5000);

    console.log("[Uber] Clearing blocking popups...");
    await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll('button, div[role="button"], span'),
      );
      const popupTriggerBtn = buttons.find((btn) => {
        const txt = btn.innerText ? btn.innerText.toLowerCase() : "";
        return (
          txt.includes("got it") ||
          txt.includes("allow location") ||
          txt === "confirm"
        );
      });
      if (popupTriggerBtn) popupTriggerBtn.click();
    });
    await delay(2000);

    let inputs = await page.$$("input");
    if (inputs.length === 0) {
      await page.evaluate(() => {
        const target = Array.from(document.querySelectorAll("*")).find(
          (el) =>
            el.innerText &&
            el.innerText.toLowerCase().includes("where to") &&
            el.children.length === 0,
        );
        if (target) {
          target.click();
          if (target.parentElement) target.parentElement.click();
        }
      });
      await delay(3000);
      inputs = await page.$$("input");
    }

    console.log("[Uber] Processing pickup address...");
    await inputs[0].click({ delay: 50 });
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await inputs[0].type(pickup, { delay: 100 });
    await delay(4000);
    await page.keyboard.press("Enter");
    await delay(3000);

    console.log("[Uber] Processing dropoff address...");
    inputs = await page.$$("input");
    const dropInput = inputs.length > 1 ? inputs[1] : inputs[0];
    await dropInput.click({ delay: 50 });
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await dropInput.type(dropoff, { delay: 100 });
    await delay(4000);
    await page.keyboard.press("Enter");
    await delay(4000);

    console.log("[Uber] Checking for Map Confirmation...");
    await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll('button, div[role="button"]'),
      );
      const confirmBtn = buttons.find((btn) => {
        const txt = btn.innerText ? btn.innerText.toLowerCase() : "";
        return (
          txt.includes("confirm pickup") ||
          txt.includes("confirm destination") ||
          txt === "confirm"
        );
      });
      if (confirmBtn) confirmBtn.click();
    });
    await delay(2000);

    console.log("[Uber] Triggering Final Search...");
    // FIX: Click the top-left corner to dismiss any dropdowns/overlays blocking the button
    await page.mouse.click(10, 10);
    await delay(1000);

    // FIX: More robust search button target
    await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll('button, a, div[role="button"]'),
      );
      const searchBtn = buttons.find((btn) => {
        const txt = (btn.innerText || "").toLowerCase().trim();
        return txt === "search" || txt === "find fares" || txt === "done";
      });
      if (searchBtn) searchBtn.click();
    });

    console.log("[Uber] Waiting for pricing elements to render...");
    await delay(8000);

    const finalPrices = await page.evaluate(() => {
      const mappedData = { bike: null, auto: null, cab: null };
      const priceNodes = Array.from(document.querySelectorAll("*")).filter(
        (el) => {
          const text = el.innerText || el.textContent || "";
          return (
            text.includes("₹") &&
            /\d/.test(text) &&
            !Array.from(el.children).some((c) =>
              (c.innerText || c.textContent || "").includes("₹"),
            )
          );
        },
      );

      priceNodes.forEach((node) => {
        const text = node.innerText || node.textContent || "";
        const match = text.match(/₹\s*([\d,]+)/);
        if (!match) return;
        const value = parseInt(match[1].replace(/,/g, ""), 10);
        if (value < 10) return;

        let curr = node;
        let category = null;
        for (let i = 0; i < 10; i++) {
          if (!curr) break;
          const context = (
            curr.innerText ||
            curr.textContent ||
            ""
          ).toLowerCase();
          if (context.includes("moto") || context.includes("bike")) {
            category = "bike";
            break;
          } else if (context.includes("auto")) {
            category = "auto";
            break;
          } else if (
            context.includes("ubergo") ||
            context.includes("premier") ||
            context.includes("cab") ||
            context.includes("xl")
          ) {
            category = "cab";
            break;
          }
          curr = curr.parentElement;
        }

        if (
          category &&
          (!mappedData[category] || value < mappedData[category])
        ) {
          mappedData[category] = value;
        }
      });
      return mappedData;
    });

    console.log("[Uber] Prices extracted:", finalPrices);
    await page.close();
    return finalPrices;
  } catch (e) {
    console.error("[Uber Scraper Error]:", e.message);
    await page.close();
    return { cab: null, auto: null, bike: null };
  }
}
async function scrapeRapido(browser, pickup, dropoff) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(REAL_USER_AGENT);
    console.log("[Rapido] Opening new tab...");
    await page.setViewport({ width: 1280, height: 800 });

    try {
      await page.goto("https://www.rapido.bike/Home", {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
    } catch (gotoError) {
      console.log("[Rapido] Page load timed out, checking DOM...");
    }

    console.log("[Rapido] Hunting for input boxes...");
    await page.waitForSelector("input", { timeout: 15000 });

    // Fuzzy DOM searching instead of strict placeholder text
    const inputs = await page.$$('input[type="text"]');
    if (inputs.length < 2)
      throw new Error("Could not find enough input boxes on Rapido.");

    console.log("[Rapido] Injecting Pickup...");
    await inputs[0].click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await inputs[0].type(pickup, { delay: 100 });
    await delay(2000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    console.log("[Rapido] Injecting Dropoff...");
    await inputs[1].click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await inputs[1].type(dropoff, { delay: 100 });
    await delay(2000);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    console.log("[Rapido] Searching for Book button...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const bookBtn = btns.find(
        (b) => b.innerText.includes("Book") || b.innerText.includes("Search"),
      );
      if (bookBtn) bookBtn.click();
    });

    console.log("[Rapido] Waiting for results layout panel...");
    await delay(6000);

    const finalPrices = await page.evaluate(() => {
      const mappedData = { bike: null, auto: null, cab: null };
      const priceNodes = Array.from(document.querySelectorAll("*")).filter(
        (el) => {
          const text = el.textContent || "";
          return (
            text.includes("₹") &&
            /\d/.test(text) &&
            !Array.from(el.children).some((c) =>
              (c.textContent || "").includes("₹"),
            )
          );
        },
      );

      priceNodes.forEach((node) => {
        const text = node.textContent || "";
        const matches = [...text.matchAll(/₹\s*(\d+)/g)];
        if (matches.length === 0) return;

        const prices = matches.map((m) => parseInt(m[1], 10));
        const value = text.includes("-")
          ? Math.max(...prices)
          : Math.min(...prices);

        let curr = node;
        let category = null;
        for (let i = 0; i < 8; i++) {
          if (!curr) break;
          const context = (curr.textContent || "").toLowerCase();
          if (context.includes("auto") || context.includes("rickshaw")) {
            category = "auto";
            break;
          } else if (context.includes("cab") || context.includes("car")) {
            category = "cab";
            break;
          } else if (context.includes("bike") || context.includes("moto")) {
            category = "bike";
            break;
          }
          curr = curr.parentElement;
        }

        if (
          category &&
          (!mappedData[category] || value < mappedData[category])
        ) {
          mappedData[category] = value;
        }
      });
      return mappedData;
    });

    console.log("[Rapido] Prices extracted:", finalPrices);
    await page.close();
    return finalPrices;
  } catch (e) {
    console.error("[Rapido Scraper Error]:", e.message);
    await page.close();
    return { cab: null, auto: null, bike: null };
  }
}

async function scrapeOla(browser, pickup, dropoff) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(REAL_USER_AGENT);
    console.log("[Ola] Opening Public Fare Estimator...");
    await page.setViewport({ width: 1280, height: 800 });

    try {
      await page.goto("https://www.olacabs.com", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await delay(4000);
    } catch (gotoError) {
      console.log("[Ola] Page load timed out, checking DOM...");
    }

    // Clear promo popups
    await page.evaluate(() => {
      const closeBtns = Array.from(
        document.querySelectorAll("button, span, img"),
      ).filter((el) => {
        const txt = el.innerText ? el.innerText.toLowerCase() : "";
        return txt === "x" || txt === "close" || txt === "skip";
      });
      if (closeBtns.length > 0) closeBtns[0].click();
      document.body.click();
    });
    await delay(1000);

    // ================= DOM-INJECTED PICKUP SELECTION =================
    console.log("[Ola] Injecting Pickup address...");
    await page.waitForSelector("#textbox1", { timeout: 15000 });
    await page.click("#textbox1", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("#textbox1", pickup, { delay: 100 });

    // Wait for the API to load the dropdown list
    console.log("[Ola] Waiting for Pickup suggestions...");
    await delay(3500);

    // Force a native DOM click on the first suggestion item
    await page.evaluate(() => {
      // Look for Ola's specific pickup list or generic list items
      const listContainer =
        document.querySelector("ul[id*='search_location_list']") || document;
      const items = Array.from(listContainer.querySelectorAll("li, .item"));
      const validItems = items.filter(
        (el) => el.innerText && el.innerText.trim().length > 0,
      );

      if (validItems.length > 0) {
        validItems[0].click(); // Smash the first valid item from the inside
      }
    });
    await delay(1500);

    // ================= DOM-INJECTED DROPOFF SELECTION =================
    console.log("[Ola] Injecting Dropoff address...");
    await page.click("#destination_location", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("#destination_location", dropoff, { delay: 100 });

    // Wait for the API to load the dropdown list
    console.log("[Ola] Waiting for Dropoff suggestions...");
    await delay(3500);

    // Force a native DOM click on the dropoff suggestion
    await page.evaluate(() => {
      // Look explicitly for the dropoff list to avoid clicking the pickup list if it stayed open
      const listContainer =
        document.querySelector("ul[id*='destination_location_list']") ||
        document;
      const items = Array.from(listContainer.querySelectorAll("li, .item"));
      const validItems = items.filter(
        (el) => el.innerText && el.innerText.trim().length > 0,
      );

      if (validItems.length > 0) {
        validItems[0].click(); // Smash the first valid item
      }
    });
    await delay(2000);

    // ================= CLICK SEARCH & CAPTURE TAB =================
    console.log("[Ola] Clicking Search...");
    const pagesBefore = await browser.pages();

    await page.evaluate(() => {
      const searchBtn = Array.from(document.querySelectorAll("button, a")).find(
        (b) => {
          const text = b.textContent ? b.textContent.toLowerCase() : "";
          return (
            text.includes("search ola") ||
            text === "search" ||
            b.getAttribute("event-name") ===
              "desktop_booking_widget_daily_search"
          );
        },
      );
      if (searchBtn) searchBtn.click();
    });

    console.log("[Ola] Waiting for the new booking tab...");
    let newPage = null;
    for (let i = 0; i < 15; i++) {
      await delay(1000);
      const pagesAfter = await browser.pages();
      if (pagesAfter.length > pagesBefore.length) {
        newPage = pagesAfter.find((p) => !pagesBefore.includes(p));
        break;
      }
    }

    if (!newPage) throw new Error("Failed to detect the new Ola booking tab.");

    await newPage.setViewport({ width: 1280, height: 800 });
    await newPage.setUserAgent(REAL_USER_AGENT);
    console.log("[Ola] Switched to new tab successfully!");

    await delay(9000); // Give the full angular/react interface time to load fares

    console.log("[Ola] Extracting prices via Deep Shadow DOM piercing...");
    const finalPrices = await newPage.evaluate(() => {
      const mappedData = { bike: null, auto: null, cab: null };

      function crawlShadowTrees(root) {
        if (!root) return;
        const allElements = root.querySelectorAll("*");

        allElements.forEach((el) => {
          if (el.shadowRoot) crawlShadowTrees(el.shadowRoot);

          const text = el.textContent || "";
          if (!text.includes("₹") || !/\d/.test(text)) return;

          const childHasPrice = Array.from(el.children).some((c) =>
            (c.textContent || "").includes("₹"),
          );
          if (childHasPrice) return;

          const match = text.match(/₹\s*(\d+)/);
          if (!match) return;

          const value = parseInt(match[1], 10);
          if (value < 10) return;

          let curr = el;
          let category = null;

          for (let i = 0; i < 15; i++) {
            if (!curr) break;
            const context = (curr.textContent || "").toLowerCase();

            if (context.includes("bike") || context.includes("moto")) {
              category = "bike";
              break;
            } else if (context.includes("auto")) {
              category = "auto";
              break;
            } else if (
              context.includes("mini") ||
              context.includes("prime") ||
              context.includes("sedan") ||
              context.includes("suv") ||
              context.includes("cab")
            ) {
              category = "cab";
              break;
            }
            curr =
              curr.parentElement ||
              (curr.getRootNode() && curr.getRootNode().host);
          }

          if (category) {
            if (!mappedData[category] || value < mappedData[category]) {
              mappedData[category] = value;
            }
          }
        });
      }

      crawlShadowTrees(document);
      return mappedData;
    });

    console.log("[Ola] Prices extracted:", finalPrices);
    await newPage.close();
    await page.close();
    return finalPrices;
  } catch (e) {
    console.error("[Ola Error]:", e.message);
    try {
      await page.close();
    } catch (err) {}
    return { cab: null, auto: null, bike: null };
  }
}

// --- LOGIN SETUP API ENDPOINT ---
app.post("/api/setup-logins", (req, res) => {
  console.log("\n🚀 Triggering manual login browser...");

  // This executes your setup-logins.js file on the Ubuntu server
  exec("node setup-logins.js", (error, stdout, stderr) => {
    if (error) {
      console.error(`Login Setup Error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, error: "Failed to open login browser." });
    }

    // This response only gets sent AFTER you manually close the Chrome browser
    console.log("✅ Manual login complete. Responding to frontend.");
    res.json({ success: true });
  });
});

// --- MAIN API ENDPOINT ---

app.post("/api/get-fares", async (req, res) => {
  const {
    pickup,
    dropoff,
    weatherCondition = "Clear",
    temperatureC = 25,
  } = req.body;

  if (!pickup || !dropoff)
    return res.status(400).json({ error: "Locations required" });

  let browser;
  try {
    console.log(`\n=== New Request: ${pickup} to ${dropoff} ===`);

    browser = await puppeteer.launch({
      headless: "new",
      userDataDir: "./browser_session",
      defaultViewport: { width: 1280, height: 800 },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--disable-gpu",
        "--disable-notifications",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process, PrivacySandboxSettings4",
        "--disable-site-isolation-trials",
        "--force-color-profile=srgb",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });

    // 🧹 PRE-SCRAPE CLEANUP: Close ALL old tabs from previous crashed sessions
    const existingPages = await browser.pages();
    const dummyPage = await browser.newPage(); // Open a fresh tab to keep the browser alive
    for (let page of existingPages) {
      await page.close().catch(() => {}); // Kill every single old tab
    }

    const [uberData, rapidoData, olaLive] = await Promise.all([
      scrapeUber(browser, pickup, dropoff),
      scrapeRapido(browser, pickup, dropoff),
      scrapeOla(browser, pickup, dropoff),
    ]);

    await browser.close();

    const allPrices = { uber: uberData, ola: olaLive, rapido: rapidoData };

    const marketData = {
      cab: {
        uber: uberData.cab ? `₹${uberData.cab}` : "N/A",
        ola: olaLive.cab ? `₹${olaLive.cab}` : "N/A",
        rapido: rapidoData.cab ? `₹${rapidoData.cab}` : "N/A",
      },
      auto: {
        uber: uberData.auto ? `₹${uberData.auto}` : "N/A",
        ola: olaLive.auto ? `₹${olaLive.auto}` : "N/A",
        rapido: rapidoData.auto ? `₹${rapidoData.auto}` : "N/A",
      },
      bike: {
        uber: uberData.bike ? `₹${uberData.bike}` : "N/A",
        ola: olaLive.bike ? `₹${olaLive.bike}` : "N/A",
        rapido: rapidoData.bike ? `₹${rapidoData.bike}` : "N/A",
      },
    };

    const aiSuggestion = generateSmartSuggestion(
      allPrices,
      weatherCondition,
      temperatureC,
    );

    console.log(
      "=== Final Balanced Tri-Engine Data Compiled Successfully ===\n",
    );

    res.json({
      success: true,
      fares: marketData,
      ai_recommendation: aiSuggestion,
    });
  } catch (error) {
    console.error("Critical Connection Error:", error.message);
    if (browser) await browser.close().catch(() => {}); // Safeguard to prevent zombie processes on crash
    res
      .status(500)
      .json({ error: "Failed to communicate with active browser engine." });
  }
});

app.listen(5000, () =>
  console.log("Semantic Aggregator Backend running on http://localhost:5000"),
);
