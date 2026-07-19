# Switchboard

A 24/7 AI phone agent for local service businesses — auto repair, HVAC, plumbing. Answers the calls the shop misses, books the job, and reports what it caught.

**Status:** built · deployed

---

## What it includes

- **Live dispatch board** — calls as they're handled, in real time
- **ROI calculator** — what missed calls are costing a shop
- **Admin console** — per-shop configuration and management
- **Call ingestion** — n8n and Twilio pipeline feeding call outcomes back into the dashboard
- **Lead capture** — marketing front end for the product itself

## Why this domain

I work in an auto-service environment day to day and I've built the software for it. The customer for this product is the customer I already understand: a shop owner who loses revenue every time the phone rings while everyone's under a hood.

## Security

Built with per-client data scoping enforced on the server — a client can only ever reach their own records, regardless of what the request asks for (IDOR-proof). Passwords are bcrypt-hashed; sessions are httpOnly cookies with CSRF tokens; rate limiting and no account enumeration on auth routes.

## Stack

Next.js · TypeScript · Twilio · n8n · Retell
