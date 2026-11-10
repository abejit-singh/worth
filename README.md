# WORTH.

**What does your life cost?**

WORTH turns your income, expenses and purchases into a single unit: hours of your life. It is not a budget tracker. It is a reflection on how much of your time you trade for the things you buy.

No backend, no build step, no dependencies to install. Everything runs client-side and saves to your browser's `localStorage`.

## Live features

- **Financial profile.** Enter income, hours worked and savings to get your hourly rate. The formula is shown under the result.
- **Your Life Cost.** Monthly expenses by category, with the total broken down per year, per day and per hour.
- **The Time Price.** Type the price of anything and watch it convert instantly into hours and working days of your life. Keep a list to compare purchases.
- **Dreams.** Goals with a price, shown as hours of work, working days and how long they take to afford at the amount you can save each month.
- **What If.** Drag each category down to a new target and see what you'd get back per month, per year and over ten years, in money and in hours.
- **Lifestyle Modes.** A minimal, current and luxury version of your own spending, each with yearly cost, required income and hours of work.
- **Financial Future.** An adjustable projection to ages 30, 40, 50, 60 and beyond. Sliders set inflation, salary growth, lifestyle growth and monthly savings. A chart shows money spent and saved, and a note says if and when spending would overtake income.
- **WORTH Score.** An internal, illustrative score from your savings rate, emergency runway and income-to-cost ratio, with each factor explained.
- **The Big Number.** What your life costs per month, per year, and in hours of work per year.

All numbers are computed live from what you enter. Nothing is hardcoded or simulated.

## How the numbers are calculated

| Figure | Formula |
| --- | --- |
| Hourly income | monthly income × 12 ÷ (hours per week × weeks per year) |
| Time price | price ÷ hourly income; working days = hours ÷ (hours per week ÷ 5) |
| Daily / hourly cost | yearly expenses ÷ 365, then ÷ 24 (around the clock, not just working time) |
| Time to afford | price ÷ monthly saving amount, rounded up to whole months |
| Required income | yearly cost ÷ 0.8 (a 20% margin for taxes and saving, as a rule of thumb) |
| Projection | each year, spending grows by inflation and lifestyle growth, income by salary growth, and savings by your monthly amount. No investment returns are assumed. |
| WORTH Score | 55% savings rate + 25% emergency runway (savings ÷ six months of expenses) + 20% income-to-cost ratio |

## Running it locally

No installation required.

1. Download the repository (on GitHub: **Code → Download ZIP**) and unzip it.
2. Open `index.html` in any modern browser (double-click, or drag it into a browser window). `style.css` and `script.js` need to stay in the same folder.

An internet connection is used only to load Google Fonts (Inter, Space Grotesk, IBM Plex Mono) on first load. Everything else works offline.

## Installing as an app (PWA)

WORTH is a Progressive Web App. Once it's hosted over HTTPS (for example on GitHub Pages), you can install it like a native app, with its own icon (a "W." monogram matching the site's wordmark) and offline support.

- **On mobile:** open the site, then use your browser's "Add to Home Screen" option (Safari: Share → Add to Home Screen; Chrome: menu → Install app).
- **On desktop:** Chrome and Edge show an install icon in the address bar.

When you're online the page is always loaded fresh, so updates appear immediately. The saved copy is only used offline. The install prompt and offline mode only activate over HTTPS. Opening `index.html` directly from disk (`file://`) works for everything else.

## Privacy

WORTH collects nothing and sends nothing to any server it controls. There is no backend at all.

- **What's stored:** your profile (age, income, savings, working hours, currency), expenses, purchases, dreams and the settings you choose. It is saved only in your browser's `localStorage`, under the key `worth_state_v1`.
- **Where it goes:** nowhere. It never leaves your device. There's no analytics, tracking, cookies or logging of any kind.
- **The one external request:** Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), to load the site's typefaces. Like any font or image load on any website, this exposes your IP address to Google as a normal side effect of the request. WORTH itself doesn't send Google, or anyone, any of your data.
- **Security:** a Content Security Policy lets the page run only its own `script.js` and blocks any outside script or connection. All text you type is escaped before it is displayed, and saved data is validated every time it loads.
- **Clearing your data:** use the reset button (bottom-left of the site) at any time.

## Tech

Vanilla HTML, CSS and JavaScript in three plain, fully commented files. No frameworks, no build tools, no external JavaScript. The projection chart is drawn directly as SVG.

| File | Purpose |
| --- | --- |
| `index.html` | The page: the markup of every section |
| `style.css` | All the styles, organised by section, with a contents list at the top |
| `script.js` | All the behaviour: state and saving, calculations, rendering, events |
| `manifest.json` | App name, colours and icons for installation |
| `service-worker.js` | Offline support and instant updates |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png` | App icons |

## Disclaimer

WORTH's calculations (hourly income, lifestyle modes, financial projections, WORTH Score) are simplified illustrations based on the numbers you provide. They are not financial, tax or investment advice, and the WORTH Score is not a credit score or a scientific measure.

## Copyright

© 2026 Abejit. All rights reserved.

This project is shared publicly on GitHub for portfolio purposes. No license is granted to copy, modify, redistribute or reuse this code or design. Please don't recreate this project. If you'd like to use any part of it, get in touch first.
