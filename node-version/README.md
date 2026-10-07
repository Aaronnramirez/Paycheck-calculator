# Paycheck Payoff Planner

A three-step calculator:

1. **Money in & out**: take-home pay per paycheck, monthly expenses and debts (each section unblurs once the one before it is filled in).
2. **Your plan**: a payoff timeline of up to 5 years with magnetic markers, plus optional investing (6% a year) and a savings goal (3.5% high-yield savings).
3. **Your numbers**: interest saved, the monthly debt payment, investment and savings growth, and a debt-free date. Visitors enter their email to see this page; the email is added to a Kit form.

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer. There are no dependencies to install.

```bash
npm start
```

Then open http://localhost:3000.

## Settings

Set these as environment variables (see `.env.example`):

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `KIT_FORM_ID` | `10012089` | Kit form that receives signups |
| `DEV_CODE` | `ABCD` | Typing this in the email box opens the results without subscribing. Set it to an empty value to turn it off. |

On Node 20.6 or newer you can keep them in a `.env` file and run `node --env-file=.env server.js`.

## How the email wall works

The browser sends the email to `POST /api/subscribe` on this server. The server checks it, then forwards it to `https://app.kit.com/forms/<KIT_FORM_ID>/subscriptions` as `email_address`, the same field Kit's embed form uses. Kit's own confirmation or welcome emails follow the form's settings in Kit.

If Kit can't be reached, the visitor still sees their results and the error is logged on the server.

## Project layout

```
server.js          Node server: static files + /api/subscribe
public/index.html  Page markup
public/styles.css  Styles (light and dark themes)
public/app.js      Calculator logic, page flow and email wall
```

## Notes on the math

- Monthly income is pay × 4 (weekly), × 2 (every 2 weeks) or × 1 (monthly).
- The monthly debt payment is the smallest amount that clears every debt within the timeline, with extra money going to the highest-APR debt first.
- "Interest saved" compares that plan with paying only minimums, estimated as each month's interest plus 1% of the balance (at least $25).
- Estimates only, not financial advice.
