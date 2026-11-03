# MyLife OS — Personal Life Management PWA

A private, offline-first personal dashboard for **tasks, expenses, finance, habits, goals, notes, calendar and reports**. Built with plain HTML, CSS and vanilla JavaScript — no build step, no backend, no account. All data stays in your browser (localStorage) and can be exported/imported as JSON.

- Currency: Indian Rupees (₹) with Indian digit grouping (₹1,00,575)
- Dates: `DD MMM YYYY`, timezone **Asia/Kolkata** regardless of device settings
- Works fully offline after the first load (service worker)
- Installable on Android Chrome as a home-screen app

---

## 1. Run it locally

Any static file server works. Service workers need `localhost` or HTTPS.

```bash
cd tracker
python -m http.server 8765
```

Open <http://localhost:8765>. (Node alternative: `npx serve .`)

Opening `index.html` directly from the file system (`file://`) works for a quick look but the service worker and install prompt will not run.

## 2. Deploy to a free HTTPS host (required for "Add to Home Screen")

The project is a folder of static files. Upload it as-is to any of these:

### GitHub Pages (recommended)
1. Create a repository (e.g. `mylifeos`) and push the contents of this folder to it.
2. Repository → **Settings → Pages → Source: Deploy from a branch → `main` / root**.
3. Wait ~1 minute. Your app is live at `https://<username>.github.io/mylifeos/`.

### Netlify / Cloudflare Pages / Vercel
Drag-and-drop the folder (Netlify Drop) or connect the repo. No build command, publish directory = `/`.

> Every time you change files, bump `CACHE` in `sw.js` (e.g. `mylifeos-v1.0.1`) so installed phones fetch the new version. The app shows an "Update ready → Reload" toast when a new version is available.

## 3. Install on Android (Chrome)

1. Open the HTTPS URL in **Chrome** on your phone.
2. Tap the **⋮ menu → "Add to Home screen"** (or "Install app"). Chrome may also show an *Install* banner automatically; the Settings page inside the app has an **Install app** button too.
3. Tap **Install**. The MyLife OS icon appears on your home screen and launches full-screen like a native app.
4. Turn on aeroplane mode and open it — everything still works.

iPhone (Safari): Share → *Add to Home Screen*.

## 4. First use

On first launch the app asks for your name and how much money you currently have in each account (Cash, Bank, UPI, Card). These become **opening balance** transactions. You can change a balance later from **Finance → Set balance**; the difference is recorded as a visible *adjustment* transaction, so your history is never silently rewritten.

## 5. Backup & restore (important!)

Your data lives only in this browser's storage. Clearing Chrome's site data or uninstalling the app deletes it. **Back up regularly.**

**Export:** More → Settings & Backup → **Export JSON**. A file like `mylifeos-backup-2026-11-03.json` is downloaded. Save it to Google Drive / email it to yourself. The app reminds you when a backup is overdue (interval configurable).

**Restore:** Settings → **Import JSON** → choose the file. The file is validated first. You then choose:
- **Merge** — adds records from the backup that are not already present (safe; nothing is overwritten), or
- **Replace** — replaces all data with the backup. You must confirm, and a safety copy of the current data is downloaded first.

**CSV:** Finance → History → *CSV* exports the filtered transactions; Settings → *Transactions CSV* exports everything; Reports → *Download report* gives a summary + transactions for any date range.

**Erase:** Settings → *Erase all data* requires confirming and typing `ERASE`.

## 6. How the money model works

There is **one ledger** (`transactions`). Balances are never stored — they are recomputed from the ledger every time, so editing or deleting any transaction keeps everything consistent. Amounts are stored as integer paise to avoid floating-point drift.

| Type | Effect |
|---|---|
| `opening` | Sets an account's starting balance (one per account) |
| `adjustment` | Manual ± correction, kept visible in history |
| `income` | + account |
| `expense` | − account (this *is* the Expense Tracker record — one entry, one deduction) |
| `transfer` | − from account, + to account; **never** counted as income or expense |

The Expense tab and the Finance tab show the same records; adding an expense in either place deducts exactly once from the chosen account/payment method.

Budgets: an overall monthly budget and per-category limits. Warnings at 80 %, alerts when exceeded (dashboard, finance page and a toast after adding an expense).

## 7. Project layout

```
index.html          app shell (bottom nav, FAB, sheets)
manifest.json       PWA manifest
sw.js               service worker (precache + cache-first)
css/app.css         design tokens, light/dark themes, components
js/util.js          dates (IST), ₹ formatting, helpers
js/db.js            persistent store, validation, import/merge
js/finance.js       ledger engine: balances, queries, budgets, CSV
js/tasks.js         tasks, recurrence, overdue, carry-forward
js/models.js        habits, goals, notes, events, global search
js/charts.js        canvas bar/line/donut charts with tooltips
js/ui.js            router, bottom sheets, dialogs, toasts
js/forms.js         add/edit forms for every record type, quick-add
js/views/*.js       one file per screen
tests/engine.test.js  Node unit tests for the data engine
tools/make-icons.js   regenerates the PNG icons
```

## 8. Tests

```bash
node tests/engine.test.js
```

Covers: IST dates, ₹ formatting, the spec's balance example (25,000 − 150 − 200 − 1,000 − 700 = 22,950), income, transfers (not income/expense), edit/delete recalculation, transparent balance adjustment, validation, budgets, reload reproducibility, CSV, date-wise tasks, completion history, overdue + carry-forward, recurring tasks, habit streaks, goal contributions, notes, import validation/merge and corrupt-data recovery.

## 9. Tips

- Amount fields accept sums: typing `150+200` stores ₹350.
- Tap a transaction or task anywhere to edit or delete it.
- Completing a recurring task automatically creates the next occurrence; the completed one stays in history.
- "Move all to today" carries forward every overdue task.
- Reminders show a toast while the app is open, and a system notification if you enabled notifications in Settings.
- Theme: Auto (follows phone), Light, or Dark — toggle with the ◐ button.
