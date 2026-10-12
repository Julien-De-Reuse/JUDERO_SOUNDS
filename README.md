# Soundbox
A minimal, responsive, local soundboard. No npm, build step, subscription, account or internet required. Source code is included and editable.

## Open it
Quickest: extract the ZIP, then open **index.html in Chrome or Edge**. Modern desktop browsers usually allow the app to save its data this way. If storage is unavailable, use the local launcher below.

Recommended (stable browser storage address):
- **Mac:** double-click `Start-Soundbox.command`. If macOS does not allow execution, open Terminal in this folder and run `python3 serve.py`.
- **Windows:** double-click `Start-Soundbox.bat`.
- **Linux:** run `python3 serve.py`.
- These launchers require Python 3. If it is not installed, use the direct index.html option or install Python 3 from python.org.
- Open **http://localhost:8765**. Keep the terminal window open while using the app. Ctrl+C stops the server.

Always use the same browser and opening method. File-based and localhost-based storage are separate. Export/import a backup to move your workspace between them. The launcher binds to your computer only; it does not expose your files to your network.

## Use
1. Create a collection, then open it.
2. Add a sound and choose or drop an audio/video file.
3. Drag the waveform start/end handles, or type exact seconds. Preview the selection.
4. Name it, choose a color and volume, then Save sound.
5. Click the full pad to play. Clicking again restarts it. By default, playing a new sound stops the previous one. Enable overlapping sounds if desired.
6. Press **1–9** for the first nine visible pads. **Escape** or Stop all stops playback.
7. Click **•••** to edit, move to another collection, change the trim, export WAV or delete.
8. Drag pads onto each other to reorder on desktop.
9. Toggle light/dark mode with the header button.

The initial Getting started collection contains three generated demo tones. You can rename or delete it.

## Your files and backups
Imported files and collections are stored in **IndexedDB in this browser**, not in the app folder. Originals remain unmodified; saved sounds reference the selected interval. Moving/deleting the original file on your computer after import does not remove the imported copy.

**Use Export backup regularly.** It includes collections, clips and original media in one JSON file. Import backup replaces the current workspace after confirmation. Clearing browser/site data, using private browsing or deleting a browser profile can erase the workspace. Browser data does not sync between devices. Large backups can require significant memory.

## Media support
MP3 and WAV are good choices. M4A and AAC-audio MP4 commonly work. MOV and other formats depend on the codecs your browser supports; a file extension alone does not guarantee support. Unsupported formats produce an error. There is no bundled transcoder.

Audio that the Web Audio API can decode gets a real waveform, accurately scheduled playback and **Export clip WAV**. Other playable media gets a simple timeline and media-element playback; clip boundaries can be less exact. Video imports play their audio on the pads, and show a video preview in the editor. Silent videos produce no sound. WAV export is only available for decodable media.

Files are limited to 500 MB; smaller files are recommended because waveform generation decodes media into memory. Trim is non-destructive and does not reduce stored source size.

## Mobile
The UI adapts to phones/tablets, but this ZIP is designed to run on a desktop. Phone browsers do not generally open a folder of HTML files as an app. To use it on a phone, serve it on an accessible web host or adapt the launcher to your network; each browser has its own data. This version is not an installable PWA and has no cloud sync.

## Project
- index.html — interface
- style.css — responsive themes
- app.js — IndexedDB, audio engine, trim editor, WAV/backup export
- serve.py — optional standard-library Python local server

No third-party libraries, trackers, network calls or external assets are used.
