"use strict";
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state = { collections: [], sounds: [] },
  current = null,
  ctx = null,
  media = null,
  buffer = null,
  previewTimer = null,
  loadingToken = 0;
const playing = new Map(),
  cache = new Map();
const seconds = (n) => Number(n).toFixed(2) + "s";
function toast(s) {
  $("toast").textContent = s;
  $("toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").style.display = "none"), 4500);
}
async function audioContext() {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}
function render() {
  const c =
    current === "all"
      ? { name: "All sounds", color: "#a89bff" }
      : state.collections.find((x) => x.id === current);
  $("title").textContent = c?.name || "Your collections";
  $("subtitle").textContent = c
    ? "Tap a pad. Your sounds, on cue."
    : "Your committed sounds, available on every device.";
  $("breadcrumb").textContent = c
    ? "Collections / " + c.name
    : "Workspace / Collections";
  $("modeWrap").hidden = !c;
  $("search").placeholder = c ? "Search sounds…" : "Search collections…";
  $("home").classList.toggle("active", !c);
  $("collections").innerHTML = state.collections
    .map(
      (x) =>
        `<button class="nav ${x.id === current ? "active" : ""}" data-collection="${esc(x.id)}">▱ ${esc(x.name)}</button>`,
    )
    .join("");
  const q = $("search").value.toLowerCase(),
    items = (
      c
        ? state.sounds.filter(
            (x) => current === "all" || x.collectionId === current,
          )
        : state.collections
    ).filter((x) => x.name.toLowerCase().includes(q));
  $("grid").innerHTML = items
    .map((x, i) =>
      c
        ? `<div class="padwrap"><button class="pad ${playing.has(x.id) ? "playing" : ""}" style="--pad:${x.color || c.color}" data-play="${esc(x.id)}"><span class="playicon">${playing.has(x.id) ? "◉" : "▶"}</span><strong>${esc(x.name)}</strong><small>${x.duration ? seconds(x.duration) : "Audio clip"}${i < 9 ? ` <kbd>${i + 1}</kbd>` : ""}</small></button></div>`
        : `<button class="collection" style="--pad:${x.color}" data-collection="${esc(x.id)}"><span class="folder">▱</span><span class="arrow">↗</span><strong>${esc(x.name)}</strong><span>${state.sounds.filter((s) => s.collectionId === x.id).length} sounds</span></button>`,
    )
    .join("");
  $("empty").hidden = items.length > 0;
  $("empty").textContent = q
    ? "No matches."
    : "Add entries to data/sounds.json to populate this collection.";
}
function stopOne(id) {
  const p = playing.get(id);
  if (p) {
    p.cancelled = true;
    if (p.source)
      try {
        p.source.stop();
      } catch {}
    playing.delete(id);
  }
}
function stopAll() {
  for (const id of playing.keys()) stopOne(id);
  $("status").textContent = "Ready when you are.";
  render();
}
async function play(id) {
  const s = state.sounds.find((x) => x.id === id);
  if (!s) return;
  try {
    const ac = await audioContext();
    if (!$("overlap").checked) stopAll();
    else stopOne(id);
    const p = { cancelled: false };
    playing.set(id, p);
    render();
    $("status").textContent = "Loading · " + s.name;
    if (!cache.has(s.file)) {
      cache.set(
        s.file,
        (async () => {
          const r = await fetch(new URL(s.file, document.baseURI));
          if (!r.ok) throw Error(`Could not load ${s.file} (${r.status})`);
          return ac.decodeAudioData(await r.arrayBuffer());
        })(),
      );
    }
    let b;
    try {
      b = await cache.get(s.file);
    } catch (e) {
      cache.delete(s.file);
      throw e;
    }
    if (p.cancelled) return;
    const source = ac.createBufferSource(),
      gain = ac.createGain();
    source.buffer = b;
    gain.gain.value = (s.volume ?? 1) * Number($("volume").value);
    source.connect(gain).connect(ac.destination);
    p.source = source;
    p.gain = gain;
    source.onended = () => {
      if (playing.get(id) === p) {
        playing.delete(id);
        render();
        $("status").textContent = playing.size
          ? "Playing…"
          : "Ready when you are.";
      }
    };
    source.start();
    $("status").textContent = "Playing · " + s.name;
  } catch (e) {
    stopOne(id);
    render();
    toast(e.message);
  }
}
function navigate(id) {
  stopAll();
  current = id;
  $("search").value = "";
  render();
}
$("home").onclick = () => navigate(null);
document.querySelector(".brand").onclick = (e) => {
  e.preventDefault();
  navigate(null);
};
$("allSounds").onclick = () => navigate("all");
$("search").oninput = render;
$("stop").onclick = stopAll;
document.addEventListener("click", (e) => {
  const c = e.target.closest("[data-collection]"),
    p = e.target.closest("[data-play]");
  if (c) navigate(c.dataset.collection);
  if (p) play(p.dataset.play);
});
$("volume").oninput = () => {
  for (const [id, p] of playing)
    if (p.gain)
      p.gain.gain.value =
        (state.sounds.find((s) => s.id === id).volume ?? 1) *
        Number($("volume").value);
};
$("theme").onclick = () => {
  document.body.classList.toggle("light");
  try {
    localStorage.setItem(
      "soundbox-theme",
      document.body.classList.contains("light") ? "light" : "dark",
    );
  } catch {}
};
try {
  if (localStorage.getItem("soundbox-theme") === "light")
    document.body.classList.add("light");
} catch {}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    stopAll();
    stopPreview();
  }
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    $("editor").open
  )
    return;
  if (current && /^[1-9]$/.test(e.key)) {
    const sounds = state.sounds.filter(
      (s) =>
        (current === "all" || s.collectionId === current) &&
        s.name.toLowerCase().includes($("search").value.toLowerCase()),
    );
    if (sounds[Number(e.key) - 1]) play(sounds[Number(e.key) - 1].id);
  }
});
function stopPreview() {
  clearTimeout(previewTimer);
  $("preview").pause();
  $("previewClip").textContent = "▶ Preview selection";
}
function closeEditor() {
  loadingToken++;
  stopPreview();
  const v = $("preview");
  if (v.src) URL.revokeObjectURL(v.src);
  v.removeAttribute("src");
  v.load();
  media = null;
  buffer = null;
  $("editor").close();
}
function openEditor() {
  stopAll();
  $("file").value = "";
  $("importStatus").textContent = "";
  $("editFields").hidden = true;
  $("exportWav").disabled = true;
  $("entry").value = "";
  $("soundCollection").innerHTML = state.collections
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
    .join("");
  $("soundCollection").value = current || state.collections[0]?.id || "";
  $("editor").showModal();
}
$("newTop").onclick = openEditor;
$("extractSide").onclick = openEditor;
$("closeEditor").onclick = closeEditor;
$("editor").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeEditor();
});
async function loadMedia(f) {
  const token = ++loadingToken;
  stopPreview();
  media = null;
  buffer = null;
  $("editFields").hidden = true;
  $("exportWav").disabled = true;
  $("importStatus").textContent = "Decoding audio…";
  const v = $("preview");
  if (v.src) URL.revokeObjectURL(v.src);
  v.src = URL.createObjectURL(f);
  try {
    const ac = await audioContext(),
      b = await ac.decodeAudioData(await f.arrayBuffer());
    if (token !== loadingToken) return;
    buffer = b;
    media = { duration: b.duration };
    $("sourceName").textContent = f.name;
    $("soundName").value = f.name.replace(/\.[^.]+$/, "");
    $("soundColor").value =
      state.collections.find((c) => c.id === $("soundCollection").value)
        ?.color || "#a89bff";
    $("soundVolume").value = 1;
    for (const id of ["startHandle", "endHandle", "startTime", "endTime"])
      $(id).max = b.duration;
    $("startTime").value = 0;
    $("endTime").value = b.duration;
    $("editFields").hidden = false;
    syncTrim();
    drawWave();
    $("exportWav").disabled = false;
    $("importStatus").textContent = "Ready. Select the moment you want.";
  } catch (e) {
    if (token === loadingToken)
      $("importStatus").textContent =
        "This browser cannot extract this file’s audio. Convert the video to WAV/MP3 with a desktop editor first, then import it here.";
  }
}
$("file").onchange = () => {
  if ($("file").files[0]) loadMedia($("file").files[0]);
};
for (const ev of ["dragenter", "dragover"])
  $("drop").addEventListener(ev, (e) => {
    e.preventDefault();
    $("drop").classList.add("dragover");
  });
$("drop").ondragleave = () => $("drop").classList.remove("dragover");
$("drop").ondrop = (e) => {
  e.preventDefault();
  $("drop").classList.remove("dragover");
  if (e.dataTransfer.files[0]) loadMedia(e.dataTransfer.files[0]);
};
function syncTrim(changed = "") {
  if (!media) return;
  const d = media.duration;
  let a = Math.max(0, Math.min(Number($("startTime").value) || 0, d - 0.001)),
    b = Math.max(0.001, Math.min(Number($("endTime").value) || d, d));
  if (b <= a) {
    if (changed === "end") a = Math.max(0, b - 0.001);
    else b = Math.min(d, a + 0.001);
  }
  $("startTime").value = Number(a.toFixed(3));
  $("endTime").value = Number(b.toFixed(3));
  $("startHandle").value = a;
  $("endHandle").value = b;
  $("selection").style.left = (a / d) * 100 + "%";
  $("selection").style.width = ((b - a) / d) * 100 + "%";
  $("clipDuration").textContent = seconds(b - a);
  stopPreview();
  updateEntry();
}
for (const side of ["start", "end"]) {
  $(side + "Time").onchange = () => syncTrim(side);
  $(side + "Handle").oninput = () => {
    $(side + "Time").value = $(side + "Handle").value;
    syncTrim(side);
  };
}
function filename() {
  return (
    ($("soundName")
      .value.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sound") + ".wav"
  );
}
function updateEntry() {
  const s = {
    id: filename().replace(".wav", ""),
    name: $("soundName").value.trim() || "Sound",
    collectionId: $("soundCollection").value,
    file: "audio/" + filename(),
    volume: Number($("soundVolume").value),
    color: $("soundColor").value,
    duration: Number(
      (Number($("endTime").value) - Number($("startTime").value)).toFixed(3),
    ),
  };
  $("entry").value = JSON.stringify(s, null, 2);
  $("gainLabel").textContent = Math.round(s.volume * 100) + "%";
}
for (const id of ["soundName", "soundCollection", "soundColor", "soundVolume"])
  $(id).oninput = updateEntry;
$("previewClip").onclick = async () => {
  if (!buffer) return;
  stopPreview();
  const ac = await audioContext(),
    source = ac.createBufferSource(),
    gain = ac.createGain();
  source.buffer = buffer;
  gain.gain.value = Number($("soundVolume").value);
  source.connect(gain).connect(ac.destination);
  source.start(
    0,
    Number($("startTime").value),
    Number($("endTime").value) - Number($("startTime").value),
  );
  const originalStop = source.stop.bind(source);
  previewSource = source;
  source.onended = () => {
    if (previewSource === source) previewSource = null;
    $("previewClip").textContent = "▶ Preview selection";
  };
  $("previewClip").textContent = "Playing selection…";
};
let previewSource = null;
const stopPreviewBase = stopPreview;
stopPreview = function () {
  stopPreviewBase();
  if (previewSource) {
    try {
      previewSource.stop();
    } catch {}
    previewSource = null;
  }
};
function drawWave() {
  const canvas = $("waveform"),
    w = canvas.clientWidth || 560;
  canvas.width = w * devicePixelRatio;
  canvas.height = 130 * devicePixelRatio;
  const g = canvas.getContext("2d");
  g.scale(devicePixelRatio, devicePixelRatio);
  g.fillStyle = "#a89bff";
  if (!buffer) {
    g.fillRect(0, 64, w, 2);
    return;
  }
  const data = buffer.getChannelData(0),
    bars = Math.floor(w / 4),
    step = Math.max(1, Math.floor(data.length / bars));
  for (let i = 0; i < bars; i++) {
    let peak = 0;
    for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++)
      peak = Math.max(peak, Math.abs(data[j]));
    const h = Math.max(2, peak * 110);
    g.fillRect(i * 4, (130 - h) / 2, 2, h);
  }
}
window.addEventListener("resize", () => {
  if (media) drawWave();
});

function wav(b, start = 0, end = b.duration) {
  const n = Math.max(1, Math.floor((end - start) * b.sampleRate)),
    channels = b.numberOfChannels,
    bytes = new ArrayBuffer(44 + n * channels * 2),
    d = new DataView(bytes);
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) d.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  d.setUint32(4, 36 + n * channels * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, channels, true);
  d.setUint32(24, b.sampleRate, true);
  d.setUint32(28, b.sampleRate * channels * 2, true);
  d.setUint16(32, channels * 2, true);
  d.setUint16(34, 16, true);
  str(36, "data");
  d.setUint32(40, n * channels * 2, true);
  const offset = Math.floor(start * b.sampleRate);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(
        -1,
        Math.min(1, b.getChannelData(c)[i + offset] || 0),
      );
      d.setInt16(
        44 + (i * channels + c) * 2,
        sample < 0 ? sample * 32768 : sample * 32767,
        true,
      );
    }
  return new Blob([bytes], { type: "audio/wav" });
}
function download(blob, name) {
  const a = document.createElement("a"),
    url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

$("exportWav").onclick = () => {
  if (!buffer) return;
  syncTrim();
  download(
    wav(buffer, Number($("startTime").value), Number($("endTime").value)),
    filename(),
  );
  toast("Move the WAV into audio/ and paste the entry into data/sounds.json.");
};
async function init() {
  try {
    const r = await fetch("./data/sounds.json", { cache: "no-store" });
    if (!r.ok) throw Error("Could not load data/sounds.json");
    const data = await r.json();
    if (!Array.isArray(data.collections) || !Array.isArray(data.sounds))
      throw Error("Expected collections and sounds arrays");
    const ids = new Set(),
      colors = (c) => /^#[a-f\d]{6}$/i.test(c);
    for (const c of data.collections) {
      if (
        typeof c.id !== "string" ||
        typeof c.name !== "string" ||
        !colors(c.color) ||
        ids.has(c.id)
      )
        throw Error("Invalid or duplicate collection");
      ids.add(c.id);
    }
    const soundIds = new Set();
    for (const s of data.sounds) {
      if (
        typeof s.id !== "string" ||
        soundIds.has(s.id) ||
        typeof s.name !== "string" ||
        !ids.has(s.collectionId) ||
        typeof s.file !== "string" ||
        !s.file.startsWith("audio/") ||
        s.file.includes("..") ||
        s.file.includes("\\") ||
        (s.volume !== undefined &&
          (!Number.isFinite(s.volume) || s.volume < 0 || s.volume > 3)) ||
        (s.color !== undefined && !colors(s.color))
      )
        throw Error("Invalid sound entry: " + s.id);
      soundIds.add(s.id);
    }
    state = data;
    render();
  } catch (e) {
    $("status").textContent = "Library could not load";
    $("empty").hidden = false;
    $("empty").textContent =
      e.message +
      ". For local use, start serve.py or VS Code Live Server (not file://).";
  }
}
init();
