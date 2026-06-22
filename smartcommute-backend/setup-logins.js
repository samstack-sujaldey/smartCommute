const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const REAL_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

(async () => {
  console.log("🚀 Launching Persistent Login Session...");

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: "./browser_session",
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--no-first-run", // 👈 Kills "Welcome to Chrome" tabs
      "--no-default-browser-check",
      "--disable-features=PrivacySandboxSettings4", // 👈 Kills "Privacy" popup tabs
    ],
  });

  try {
    const pages = await browser.pages();

    // REUSE the default tab for Uber instead of creating a new one
    const page1 = pages.length > 0 ? pages[0] : await browser.newPage();
    await page1.setUserAgent(REAL_USER_AGENT);
    await page1.goto("https://m.uber.com/looking", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Open exactly ONE new tab for Ola
    const page2 = await browser.newPage();
    await page2.setUserAgent(REAL_USER_AGENT);
    await page2.goto("https://www.book.olacabs.com", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    console.log("\n✅ EXACTLY 2 TABS OPENED SUCCESSFULLY!");
    console.log("👉 ACTION REQUIRED: Please log into Uber and Ola.");
    console.log(
      "🛑 When you are completely finished, simply CLOSE the browser window manually (Click the X).",
    );

    browser.on("disconnected", () => {
      console.log("\n💾 SESSION SAVED SECURELY! Your logins are now cached.");
      process.exit(0);
    });
  } catch (error) {
    console.error("\n❌ Error loading one of the pages:", error.message);
  }
})();
