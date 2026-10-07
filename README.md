# Paycheck Payoff Planner

A three-step calculator: paycheck, expenses and debts, then a payoff plan with optional investing (6%) and a savings goal (3.5% high-yield savings), then results behind an email wall connected to Kit.

This folder is the live site for Hostinger (PHP + MySQL). The Node.js version is in [`node-version/`](node-version/).

## Files

| File | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The calculator page |
| `subscribe.php` | Saves each signup and its numbers to MySQL |
| `config.example.php` | Template for `config.php` (database login). Copy it to `config.php` on the server. |
| `database.sql` | Tables to import in phpMyAdmin |
| `.htaccess` | Blocks `config.php` and the repository-only files from the web |

`config.php` is never committed (see `.gitignore`), so the database password stays on the server.

## Email signups

The email wall uses Kit's embed form (form 10012089) and Kit's script (`ck.5.js`), so Kit handles the signup in the browser. After Kit confirms, `subscribe.php` saves the signup to the database. Typing `ABCD` in the email box opens the results without subscribing (set in `app.js` as `DEV_CODE`).

## Deploying to Hostinger

1. hPanel → Databases: create a database, then import `database.sql` in phpMyAdmin.
2. hPanel → Advanced → Git: add this repository (branch `main`, folder `public_html`) and turn on auto deployment.
3. In File Manager, copy `config.example.php` to `config.php` and fill in the database login.

Every push to `main` then updates the live site.

## Notes on the math

- Monthly income is pay × 4 (weekly), × 2 (every 2 weeks) or × 1 (monthly).
- The monthly debt payment is the smallest amount that clears every debt within the timeline, with extra money going to the highest-APR debt first.
- "Interest saved" compares that plan with paying only minimums, estimated as each month's interest plus 1% of the balance (at least $25).
- Estimates only, not financial advice.
