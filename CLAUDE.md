# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server on port 3000 (0.0.0.0)
npm run build     # Production build
npm run lint      # Type-check only (tsc --noEmit) — no ESLint configured
npm run preview   # Preview production build
```

There is no test framework configured in this project.

## Environment Setup

Copy `.env.example` to `.env.local` and fill in:
- `GEMINI_API_KEY` — Gemini API key for AI features
- `GOOGLE_MAPS_PLATFORM_KEY` — Google Maps Platform key for the map view

Firebase config lives in `firebase-applet-config.json` (not environment variables). The file in the repo contains placeholder values — real credentials are injected at deploy time by the AI Studio environment.

Both env vars are injected into client-side `process.env` via Vite's `define` config in `vite.config.ts`.

## Architecture

Single-file React 19 SPA (`src/App.tsx`) with tab-based navigation. Despite `react-router-dom` being installed, routing is handled with a simple `activeTab` state string.

**Tech stack:**
- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (no `tailwind.config.js` needed)
- **Firebase** (Google Sign-In auth + Firestore real-time database)
- **Gemini AI** (`@google/genai`) for Disney news, place suggestions, and traffic reports
- **@vis.gl/react-google-maps** for the interactive map
- **motion/react** (Framer Motion) for tab transitions and animations
- **open-meteo.com** for weather (free, no API key)

### Data Flow

`useFamilyLocations` hook (`src/hooks/useFamilyLocations.ts`) is the core of the app — it:
1. Listens to Firebase Auth state
2. Subscribes to Firestore `users` collection (all family members' profiles + locations)
3. Subscribes to each member's `users/{uid}/trails` subcollection (last 50 points, ordered by timestamp)
4. Runs `navigator.geolocation.watchPosition` and writes the current user's location + trail breadcrumbs to Firestore
5. Calculates cumulative trip mileage from trail points using the Haversine formula

AI calls are fire-and-forget in `useEffect` inside `App.tsx`, delegated to `src/services/gemini.ts`. All three functions (`getDisneyNews`, `getPlaceSuggestions`, `getTrafficReport`) request JSON output via `responseMimeType: "application/json"` with Google Search grounding enabled.

### Firestore Collections

| Collection | Purpose |
|---|---|
| `users/{uid}` | Profile (`displayName`, `photoURL`, `email`) + nested `location` object |
| `users/{uid}/trails/{trailId}` | Breadcrumb points with `{lat, lng, timestamp, activity}` |
| `allowed_emails/{email}` | Email allowlist — document existence grants access |
| `alerts/{alertId}` | In-app alerts (read by all allowed users, write by allowed users) |

### Access Control

Access is double-gated: client-side in `App.tsx` (checks `allowed_emails` collection) and enforced by Firestore security rules in `firestore.rules`. The email `gsmastersinc@gmail.com` is hardcoded as the creator/admin in both places. Only email-verified Google accounts can authenticate.

Trail breadcrumbs are saved only when movement exceeds 50m (or 10m after 60s idle). Activity classification: `speed > 4 m/s` → `driving`, `> 0.5 m/s` → `walking`, else `stationary`.

### Proximity Alerts

The proximity check in `App.tsx` uses simple degree-based distance (not Haversine) against coordinates returned by Gemini's place suggestions. Thresholds: `0.072°` for driving (~5 miles), `0.029°` for walking (~2 miles).

### Utilities

- `cn(...classes)` in `src/lib/utils.ts` — `clsx` + `tailwind-merge` for conditional class names. Use this for all conditional Tailwind styling.
- Firebase instances (`auth`, `db`) are exported from `src/lib/firebase.ts`. The `db` export uses the `firestoreDatabaseId` from the config file (not the default database).

### Styling Conventions

Dark slate theme throughout (`bg-slate-950` base). Orange (`orange-500`) is the primary accent for the current user and active states. The `BreadcrumbTrail` component renders Google Maps `Polyline` objects imperatively via a ref — it returns `null` from JSX and manages its own map layer lifecycle in a `useEffect`.
