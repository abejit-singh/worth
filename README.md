# WORTH.

**What does your life cost?**

WORTH turns your income, expenses, and purchases into a single unit: hours of your life. It's not a budget tracker — it's a reflection on how much of your time you're trading for the things you buy.

No backend, no build step, no dependencies to install. Everything runs client-side and saves to your browser's `localStorage`.

## Live features

- **Financial profile** — enter income, hours worked, and savings to get your real hourly rate.
- **Your Life Cost** — track monthly expenses by category, with totals broken down to the hour.
- **The Time Price** — type the price of anything and watch it convert instantly into hours and working days of your life.
- **Dreams** — set savings goals and see how long they'll actually take, based on what you can put aside each month.
- **What If** — drag spending down category by category and see the monthly, yearly, and 10-year time you'd get back.
- **Lifestyle Modes** — compare a minimal, current, and luxury version of your own spending, scaled from your real numbers.
- **Financial Future** — a simple, adjustable simulation of where your spending leads, with inflation and income growth sliders.
- **WORTH Score** — an internal, illustrative score based on your savings rate, safety net, and income-to-cost ratio.

All numbers are computed live from what you enter — nothing is hardcoded or simulated.

## Running it locally

No installation required.

1. Download `index.html`
2. Open it in any modern browser (double-click, or drag it into a browser window)

An internet connection is used only to load Google Fonts (Inter, Space Grotesk, IBM Plex Mono) on first load; everything else works offline.

## Installing as an app (PWA)

WORTH is a Progressive Web App: once it's hosted over HTTPS (e.g. GitHub Pages), you can install it like a native app, with its own icon (a "W." monogram matching the site's wordmark) and offline support.

- **On mobile**: open the site, then use your browser's "Add to Home Screen" option (Safari: Share → Add to Home Screen; Chrome: menu → Install app).
- **On desktop**: Chrome/Edge will show an install icon in the address bar.

Note: the install prompt and offline caching only activate when the site is served over HTTPS — opening `index.html` directly from disk (`file://`) works for everything except installability and offline mode.

## Privacy

WORTH collects nothing and sends nothing to any server it controls — there is no backend at all.

- **What's stored**: income, expenses, purchases, savings goals, and the settings you enter — saved only in your browser's `localStorage`, under the key `worth_state_v1`.
- **Where it goes**: nowhere. It never leaves your device, and there's no analytics, tracking, or logging of any kind.
- **The one external request**: Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), to load the site's typefaces. Like any font or image load on any website, this exposes your IP address to Google as a normal side effect of the request — WORTH itself doesn't send Google (or anyone) any of your data.
- **Clearing your data**: use the reset button (bottom-left of the site) at any time.

## Tech

Vanilla HTML, CSS and JavaScript in a single file. No frameworks, no build tools, no external JS dependencies. Use the reset button to clear all saved data.

## Disclaimer

WORTH's calculations (hourly income, lifestyle modes, financial future projections, WORTH Score) are simplified illustrations based on the numbers you provide — not financial, tax, or investment advice.

## Copyright

© 2026 Abejit. All rights reserved.

This project is shared publicly on GitHub for portfolio purposes. No license is granted to copy, modify, redistribute, or reuse this code or design — please don't recreate this project. If you'd like to use any part of it, get in touch first.
