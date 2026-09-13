# Herd Check

Mobile-first Progressive Web App for a ranch manager doing daily cattle tallies in the field. Tap a cow when you see it. Open a tag to see past times and GPS pins. Scan an eartag with the camera when your hands are full.

No sign-in. No required server. Herd and sighting data stay on the phone.

## What it does

- List cows by eartag, optional name and notes
- Today's tally: tap a cow to count it (timestamp + location when GPS is available)
- Undo today's count
- Cow history with times and a relative location map
- Add / edit / remove eartags (duplicate tags blocked)
- Search and filter: all / missing / counted today
- Sample herd loader, ranch Active-herd loader, and clear-herd reset
- Camera eartag recognition with manual correction
- CSV import and export of the herd
- Installable PWA that keeps working after the first visit with no network

GPS and camera are optional. A failed location fix never blocks a count.

## Run locally

Needs Node 20+ and npm.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run test
npm run build
npm run preview
```

`npm run build` copies the app shell, self-hosted fonts, icons, and on-device OCR assets into `dist/`. Preview that build to test the service worker.

## Install as a PWA

### Android (Chrome / Edge)

1. Open the app once while you have signal (first visit caches the shell, fonts, and OCR pack).
2. Use the in-app **Install** button if it appears, or the browser menu → **Install app** / **Add to Home screen**.
3. Launch **Herd Check** from the home screen. It runs standalone.

### iPhone / iPad (Safari)

1. Open the app in Safari (not an in-app browser).
2. Tap **Share** → **Add to Home Screen**.
3. Confirm the name **Herd Check**.
4. Open it from the home screen. iOS Safari does not show a native install prompt; the first-run banner explains this.

After that first load, airplane mode still opens the tally, counts cows, and stores sightings. Camera OCR also works offline once the Tesseract files have been cached (they download automatically on first visit / first scan).

## How camera OCR works offline

1. **Camera** on the tally screen (or **Scan a tag** while adding a cow) opens the rear camera when the device has one.
2. Line the plastic eartag up in the center box and tap **Read tag**.
3. The frame is cropped to that box, converted to grayscale, contrast-stretched, and thresholded. That helps yellow / orange / white tags with large black digits.
4. [Tesseract.js](https://tesseract.projectnaptha.com/) runs in the browser (WASM + English trained data shipped with the app). Nothing is sent to a cloud vision API.
5. You always confirm or edit the digits. If the tag is already in the herd, one tap counts it today. If it is new, you can add it and count.

If the camera is missing or permission is denied, the same sheet falls back to a typed tag.

OCR files live in `public/tesseract/` (`worker.min.js`, WASM core, `eng.traineddata.gz`). `npm install` copies them from `tesseract.js` and downloads the language pack. The service worker caches them so a later offline launch still has the reader.

## Limitations

- OCR accuracy drops with mud, glare, steep angles, tiny digits, or a tag that is only half in the box. Always check the digits before confirming.
- Tesseract is tuned here for **high-contrast numeric cattle tags**. Letter prefixes and decorative stamps are less reliable.
- Geolocation needs a browser permission and a fix. Counts still save if GPS times out or is denied.
- Data is stored in **IndexedDB on this device / this browser profile**. Clearing site data wipes the herd. Export CSV if you want a backup.
- iOS can evict unused site storage. Opening the installed app now and then keeps it warm.

## Data

IndexedDB database `herd-check` (version 1):

- `cows` — `id`, `tag`, `name`, `notes`, `createdAt`
- `sightings` — `id`, `cowId`, `at`, `lat`, `lng`, `accuracy`
- `meta` — seed flag so a cleared herd stays empty on the next launch

The first visit loads a small sample herd (West Texas–ish demo pins) so you can try the tally immediately. **Clear herd** empties it. **Load sample herd** puts the demo animals back. **Load ranch herd** replaces that demo list with the bundled Active animals from `public/herd-active.csv` (183 unique eartags). Sold, dead, and other non-Active animals are not included.

### Import a CSV

Menu → **Import CSV**, or **Import CSV** on the empty herd screen.

1. Choose **Replace herd** (wipes cows and sightings, then loads the file) or **Merge** (adds tags that are not already in the herd).
2. Pick a `.csv` file from the phone. After import, the app shows how many animals were added, updated, or skipped.

The file needs a `tag` column (`ear_tag` also works). `name` and `notes` are optional. A CattleMax-style export is accepted: `ear_tag` maps to tag, `name` stays name, and notes are built from `animal_type`, `sex`, `electronic_id`, and `status` when those columns are present.

**Merge** keeps existing sighting history. If a tag is already in the herd, name and notes update only when the CSV has a value; blank cells leave the current fields alone. Extra copies of the same tag in one file, and rows with no tag, are skipped.

**Replace herd** and **Load ranch herd** both set the seeded flag so the first-run sample herd does not come back on the next launch.

## Stack

React 19, Vite, TypeScript, Tailwind CSS 4, IndexedDB via `idb`, Tesseract.js, `vite-plugin-pwa`.
