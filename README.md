# Soundbox — GitHub Pages edition
Plain HTML, CSS and JavaScript. No backend, npm, build step or database.

## 1. Open locally in VS Code
Extract this folder and open it in VS Code. Use the Live Server extension's **Open with Live Server** on index.html, or run `python3 serve.py` in the integrated terminal. The Mac/Windows launchers work too if Python 3 is installed.

Do not double-click index.html: loading the JSON catalog requires an HTTP server. Local preview is only a static file server, not a backend.

## 2. Get an audio snippet from a video
1. Click **Extract a snippet**.
2. Choose your video or audio file.
3. Drag the start/end handles or type seconds, then preview.
4. Enter a name and select a collection/color. Individual volume starts at 100% and can go up to 300%.
5. Click **Download WAV snippet**.
6. Move the downloaded file into the project's `audio` folder.
7. Copy the generated JSON entry into the `sounds` array in `data/sounds.json`.
8. Save, refresh your local preview, commit and push.

Extraction uses your browser's audio decoder. Some video containers/codecs (including some MP4/MOV files) cannot be decoded this way. If you get the conversion message, export WAV audio from your existing video editor first and trim it here. There is no bundled video transcoder. Files are processed locally; the original video is not uploaded or included in the repo. Large files can exhaust browser memory; no artificial 500 MB cap is applied.

Volume is saved as playback gain in the JSON, not baked into the downloaded WAV. 1 means original volume, 1.5 means 150%, 3 means 300%. Excessive boost may distort.

## 3. Add an existing audio file using only VS Code
Put `goal.mp3` in `audio/`. Add this object inside `sounds` in `data/sounds.json`:

```json
{
  "id": "goal",
  "name": "Goal!",
  "collectionId": "starter",
  "file": "audio/goal.mp3",
  "volume": 1,
  "color": "#a89bff"
}
```

Place a comma between objects, but no trailing comma after the last one. IDs must be unique. Filename capitalization must match exactly. Keep paths relative (`audio/goal.mp3`, not `/audio/goal.mp3`) so GitHub repository subpaths work. WAV and MP3 are the simplest playback choices. `duration` is optional and only supplies the pad's duration label; the full file plays.

To add a collection, put this object inside `collections`:

```json
{
  "id": "football",
  "name": "Football",
  "color": "#8ccfc0"
}
```

Then set your sound's `collectionId` to `football`. Rename/reorder/delete by editing the JSON. To reorder pads, reorder their sound objects. To remove a sound, delete its object and optionally its audio file. Color uses six-digit hex.

## 4. Publish with GitHub Pages
1. Create a repository on GitHub (a public repository is the simplest setup).
2. Put the **contents of this folder** in the repository root: index.html, app.js, style.css, data/, audio/, and .nojekyll. Keep the README and local launchers too if useful.
3. Commit and push to main using VS Code Source Control or GitHub Desktop.
4. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → main → /(root) → Save**.
5. When deployment completes, open the URL shown in Pages settings. Future pushes update the site.

Official setup guide: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

The browser cannot write files back into your GitHub repo. The extraction tool only downloads a WAV and prepares an entry; you place them in your local project and commit/push. Uploading a file in the extractor does not publish it. Sounds in a publicly accessible Pages site are downloadable by its visitors, so publish media you can share.

## Playback
Tap a pad to play/restart. Numbers 1–9 trigger the first nine visible sounds. Escape/Stop all stops playback. Enable overlapping sounds to mix pads. Master volume affects all pads; each JSON `volume` affects only that sound. Decoded audio is cached in memory for faster repeat playback; reloading clears this cache.

## Differences from the earlier local edition
The repository is the authoritative library. No IndexedDB workspace or browser backups are used. Existing browser-only sounds are not automatically migrated: export their clips from the old app, put the files in audio/, and add their entries. Only the theme preference is stored locally.

All three example tones are generated demo audio and can be removed. No external fonts, libraries, analytics or network services are loaded; the browser fetches only the site's JSON and media.
