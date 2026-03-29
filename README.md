# Orbita

Orbita is a mobile-first field tool for placing a live iPhone GPS position on top of a plan image.

The current prototype is designed for CCTV and field technicians who receive store plans and need a faster way to understand where they are relative to the plan while walking the site.

## What It Does

- Loads a plan file from the device.
- Supports PDF and image uploads (`PDF`, `PNG`, `JPG`).
- Renders the first page of the plan for mobile interaction.
- Lets the user calibrate known points between the plan and real-world GPS.
- Draws a live blue location dot on top of the calibrated plan.
- Stores calibration locally in the browser for reuse.

## Current Status

This is a working prototype.

It is already good enough to validate the core concept in the field:

- iPhone geolocation permission flow
- plan loading and rendering
- manual calibration
- live movement of the blue dot over the plan

It is not yet a fully hardened production tool for all technicians. Current limitations include:

- calibration still depends on good point selection
- indoor GPS precision can drift
- there is no shared multi-user calibration backend yet
- the UX can still be simplified for field use

## Tech Stack

- Next.js 16
- React 19
- `pdfjs-dist` for PDF rendering
- Browser Geolocation API for live device position

## Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build production:

```bash
npm run build
```

Run production locally:

```bash
npm start
```

## Environment Variables

Local environment variables live in `.env.local`.

Example:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here
```

Important:

- the current prototype does not actively use the Google Maps SDK yet
- the live location comes from the browser geolocation API
- if this repository is public, restrict or rotate any exposed API keys

## Deploying To Google Cloud Run

Cloud Run is the recommended deployment target for this project if you want stable hosted access inside Google Cloud.

Official quickstart:

- https://cloud.google.com/run/docs/quickstarts/frameworks/deploy-nextjs-service

Typical flow:

```bash
gcloud init
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
gcloud run deploy --source .
```

Cloud Run automatically builds the container from source and returns a stable service URL.

## Suggested Next Improvements

- simplify the calibration flow for technicians
- allow saving calibrations per store/site
- improve accuracy handling and visual feedback
- add optional shared storage for team-wide calibrations
- add a better field test workflow for repeated store visits

## Notes

- temporary local testing files are intentionally ignored
- local test captures and hotel-specific assets should not be committed to the public repository
