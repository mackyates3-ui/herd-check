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
- Voice tally: say an eartag and the matching cow is counted, offline after the first visit
- Camera eartag recognition with manual correction
- CSV import and export of the herd
- Optional shared tally: two or more phones link with a code and combine checks when they have signal
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

`npm run build` copies the app shell, self-hosted fonts, icons, on-device OCR assets, and the offline speech model into `dist/`. Preview that build to test the service worker.

## Install as a PWA

### Android (Chrome / Edge)

1. Open the app once while you have signal (first visit caches the shell, fonts, OCR pack, and voice model).
2. Use the in-app **Install** button if it appears, or the browser menu → **Install app** / **Add to Home screen**.
3. Launch **Herd Check** from the home screen. It runs standalone.

### iPhone / iPad (Safari)

1. Open the app in Safari (not an in-app browser).
2. Tap **Share** → **Add to Home Screen**.
3. Confirm the name **Herd Check**.
4. Open it from the home screen. iOS Safari does not show a native install prompt; the first-run banner explains this.

After that first load, airplane mode still opens the tally, counts cows, and stores sightings. Camera OCR and voice tally also work offline once their files have been cached (they download automatically on the first visit).

## How camera OCR works offline

1. **Camera** on the tally screen (or **Scan a tag** while adding a cow) opens the rear camera when the device has one.
2. Line the plastic eartag up in the center box and tap **Read tag**.
3. The frame is cropped to that box, converted to grayscale, contrast-stretched, and thresholded. That helps yellow / orange / white tags with large black digits.
4. [Tesseract.js](https://tesseract.projectnaptha.com/) runs in the browser (WASM + English trained data shipped with the app). Nothing is sent to a cloud vision API.
5. You always confirm or edit the digits. If the tag is already in the herd, one tap counts it today. If it is new, you can add it and count.

If the camera is missing or permission is denied, the same sheet falls back to a typed tag.

OCR files live in `public/tesseract/` (`worker.min.js`, WASM core, `eng.traineddata.gz`). `npm install` copies them from `tesseract.js` and downloads the language pack. The service worker caches them so a later offline launch still has the reader.

## How voice tally works offline

Voice is the fast path when the camera OCR is awkward. Tap the round **mic** on the tally screen and keep it open for a run of tags.

1. Say the eartag the way you would read it: `one oh two`, `one hundred two`, `one zero two`, `twenty three ex`, `one oh two yellow double you you`, `blue five red`, `notch`.
2. A clear unique match counts immediately, with a beep, a short vibration, a big tag on screen, and **Undo**.
3. If two animals fit (bare `102` and `102Y WU`), the top candidates are buttons. Tap one.
4. If nothing in the herd fits, the app offers to add the tag it heard. You can edit it first.
5. The same sheet has a type box. If the mic is blocked or missing, that box is the whole flow — search, add, and camera still work as before.

Recognition runs **on the phone** with [Vosk](https://alphacephei.com/vosk/) (`vosk-browser`) and the small US English model. A grammar built from the current herd (plus spoken numbers through 450) keeps it on eartag phrases instead of open dictation. The model is about **40 MB**, unpacked into IndexedDB after the first load. `npm install` downloads it into `public/vosk/` (not committed). The service worker precaches `model.bin` and `words.txt`, so a later visit with no signal still has them. The archive is gzip, but it is not named `.gz`, because browsers and static hosts would unwrap that suffix before Vosk can.

If the model cannot load and the phone is online, the sheet falls back to the browser’s speech recognizer. That path needs a network. Offline, with no cached model, the sheet asks you to type the tag.

The matcher is built around `public/herd-active.csv`: digits with or without leading zeros (`09` is not `9`), letter suffixes (`23 X`, `122B`, `102Y WU`, `420G UW`), and name tags (`NOTCH`, `KERMIT`, `Fiona`, `100 ARCHIE`, `BLUE 5R`). Color words map onto the letter they look like (`yellow` → Y, `blue` → B, `green` → G, `red` → R, `white` → W).

## Share a tally across phones

Each phone still counts with no signal. Sharing is optional. If you never link, or the share service is down, the tally on that phone keeps working by itself.

1. On the first phone, open the menu → **Share tally** → **Create a share code**.
2. Read the code to the other person, or let them scan the QR. The code is the only key to that herd. Don't post it anywhere public.
3. On the second phone, **Share tally** → type the code → **Join herd**. Animals already on that phone are merged in, so clear a sample herd first if you don't want those tags included.
4. The line under the status chip shows **Synced**, **to send**, or **Offline**. **Sync now** pushes and pulls immediately when there is signal.

What gets combined:

- A cow counted on two phones is still one check in today's tally. Both times stay in that cow's history.
- Undo removes that one sighting on every phone. If the other phone also counted the cow, it stays counted.
- A name or notes edit from the phone that saved later wins. Removing an animal wins over an older edit. Counting an animal after it was removed puts it back, because it was seen.
- The same tag added on two phones becomes one animal. Both sightings stay.
- CSV replace removes animals that are not in the file, and that removal is shared. An animal the other phone added after the import stays.

`npm run dev` and `npm run preview` include a local share service that stores herds in `data/sync-herds.json` on this computer (not committed). The deployed site uses a hosted Redis database. Until that is connected, **Create a share code** explains that sharing isn't set up, and counting on the phone is unchanged.

### Connect sharing on Vercel

This is a one-time setup. You do not put passwords in the code.

1. Sign in at [vercel.com](https://vercel.com) and open the **herd-check** project.
2. Go to **Storage** → **Create** → **Upstash Redis** (the free database is enough). Connect it to this project. Vercel fills in two settings for you: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. If you already have an Upstash database instead: open it, copy the **REST URL** and **REST token**, then in Vercel go to **Settings** → **Environment Variables** and add those two names with the copied values. Leave them secret.
4. **Deployments** → **Redeploy** the latest production deployment so the site picks up the new settings.
5. Open the live site, create a share code, and join it from a second phone.

If those two settings are missing, the site still loads and counts. Only the share buttons report that sharing isn't set up.

## Limitations

- OCR accuracy drops with mud, glare, steep angles, tiny digits, or a tag that is only half in the box. Always check the digits before confirming.
- Tesseract is tuned here for **high-contrast numeric cattle tags**. Letter prefixes and decorative stamps are less reliable.
- Voice is tuned for this herd’s tags, not open conversation. Wind, a radio, or two people talking can land on the wrong animal — Undo is on the confirmation. Similar numbers (`102` and `102Y WU`) ask you to tap. A brand-new suffix the grammar has never seen may need one typed entry; after that animal is in the herd, the next listen includes it.
- The speech model is a one-time ~40 MB download. Older phones can run out of memory while it loads. Names that are not in the small English vocabulary will not be recognized until you type them.
- iPhone Safari can start the microphone only from a tap, and only on a site served over HTTPS (or localhost). Add to Home Screen after the first online visit so the model is already stored.
- Geolocation needs a browser permission and a fix. Counts still save if GPS times out or is denied.
- Data is stored in **IndexedDB on this device / this browser profile**. Clearing site data wipes the herd. Export CSV if you want a backup.
- iOS can evict unused site storage. Opening the installed app now and then keeps it warm.

## Data

IndexedDB database `herd-check` (version 1):

- `cows` — `id`, `tag`, `name`, `notes`, `createdAt`, plus `updatedAt` and `deletedAt` when a shared edit or removal needs to sync
- `sightings` — `id`, `cowId`, `at`, `lat`, `lng`, `accuracy`, plus `updatedAt` and `deletedAt` for the same reason
- `meta` — seed flag so a cleared herd stays empty, and (when linked) the share code, pending count, and last sync time

The first visit loads a small sample herd (West Texas–ish demo pins) so you can try the tally immediately. **Clear herd** empties it. **Load sample herd** puts the demo animals back. **Load ranch herd** replaces that demo list with the bundled Active animals from `public/herd-active.csv` (183 unique eartags). Sold, dead, and other non-Active animals are not included.

### Import a CSV

Menu → **Import CSV**, or **Import CSV** on the empty herd screen.

1. Choose **Replace herd** (wipes cows and sightings, then loads the file) or **Merge** (adds tags that are not already in the herd).
2. Pick a `.csv` file from the phone. After import, the app shows how many animals were added, updated, or skipped.

The file needs a `tag` column (`ear_tag` also works). `name` and `notes` are optional. A CattleMax-style export is accepted: `ear_tag` maps to tag, `name` stays name, and notes are built from `animal_type`, `sex`, `electronic_id`, and `status` when those columns are present.

**Merge** keeps existing sighting history. If a tag is already in the herd, name and notes update only when the CSV has a value; blank cells leave the current fields alone. Extra copies of the same tag in one file, and rows with no tag, are skipped.

**Replace herd** and **Load ranch herd** both set the seeded flag so the first-run sample herd does not come back on the next launch.

## Stack

React 19, Vite, TypeScript, Tailwind CSS 4, IndexedDB via `idb`, Tesseract.js, Vosk (`vosk-browser`) for offline speech, `vite-plugin-pwa`. Optional shared tally uses a Vercel function and Upstash Redis.
