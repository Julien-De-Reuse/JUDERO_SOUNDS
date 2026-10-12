"use strict";
const $ = (id) => document.getElementById(id),
  uid = () => crypto.randomUUID(),
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
let db,
  state = { collections: [], sounds: [] },
  current = null,
  editingCollection = null,
  edit = null,
  media = null,
  buffer = null,
  ctx = null,
  previewTimer = null,
  loadingToken = 0;
const playing = new Map(),
  urls = new Map();
const seconds = (n) => Number(n).toFixed(2) + "s";
function toast(s) {
  $("toast").textContent = s;
  $("toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").style.display = "none"), 4200);
}
function request(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function transaction(stores, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, "readwrite");
    try {
      fn(t);
    } catch (e) {
      t.abort();
      reject(e);
    }
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Save cancelled"));
  });
}
const getMedia = (id) =>
  request(db.transaction("media").objectStore("media").get(id));
async function persist(next = state, newMedia = null) {
  await transaction(["data", "media"], (t) => {
    t.objectStore("data").put(next, "state");
    if (newMedia) t.objectStore("media").put(newMedia);
  });
  state = next;
}
async function cleanup() {
  const ids = new Set(state.sounds.map((s) => s.mediaId));
  await transaction(["media"], (t) => {
    const store = t.objectStore("media");
    const r = store.openCursor();
    r.onsuccess = () => {
      const c = r.result;
      if (c) {
        if (!ids.has(c.key)) c.delete();
        c.continue();
      }
    };
  });
  for (const [id, url] of urls) {
    if (!ids.has(id)) {
      URL.revokeObjectURL(url);
      urls.delete(id);
    }
  }
}
function render() {
  const c = state.collections.find((c) => c.id === current);
  if (current && !c) current = null;
  $("title").textContent = c ? c.name : "Your collections";
  $("subtitle").textContent = c
    ? `${state.sounds.filter((s) => s.collectionId === current).length} sounds · Tap a pad, make some noise.`
    : "Every sound, ready for its moment.";
  $("breadcrumb").textContent = c
    ? "Collections / " + c.name
    : "Workspace / Collections";
  $("overline").textContent = c
    ? "YOUR SOUNDS. ON CUE."
    : "A LITTLE ORDER. A LOT OF SOUND.";
  $("newTop").textContent = c ? "+ Add sound" : "+ New collection";
  $("collectionActions").hidden = !c;
  $("modeWrap").hidden = !c;
  $("search").placeholder = c ? "Search sounds…" : "Search collections…";
  $("home").classList.toggle("active", !c);
  $("collections").innerHTML = state.collections
    .map(
      (x) =>
        `<button class="nav ${x.id === current ? "active" : ""}" data-collection="${x.id}"><span style="color:${x.color}">▱</span> ${esc(x.name)}</button>`,
    )
    .join("");
  const q = $("search").value.toLowerCase();
  const items = (
    c
      ? state.sounds.filter((s) => s.collectionId === current)
      : state.collections
  ).filter((x) => x.name.toLowerCase().includes(q));
  $("grid").innerHTML =
    items
      .map((x, i) =>
        c
          ? `<div class="padwrap" draggable="true" data-sound="${x.id}"><button class="pad ${playing.has(x.id) ? "playing" : ""}" style="--pad:${x.color}" data-play="${x.id}"><span class="playicon">${playing.has(x.id) ? "◉" : "▶"}</span><strong>${esc(x.name)}</strong><small>${seconds(x.end - x.start)}${i < 9 ? ` <kbd>${i + 1}</kbd>` : ""}</small></button><button class="editpad" data-edit="${x.id}" aria-label="Edit ${esc(x.name)}">•••</button></div>`
          : `<button class="collection" style="--pad:${x.color}" data-collection="${x.id}"><span class="folder">▱</span><span class="arrow">↗</span><strong>${esc(x.name)}</strong><span>${state.sounds.filter((s) => s.collectionId === x.id).length} sounds</span></button>`,
      )
      .join("") +
    `<button class="collection newcard" id="addCard"><b>+</b><span>${c ? "Add a sound" : "New collection"}</span></button>`;
  $("empty").hidden = !q || items.length > 0;
  $("empty").textContent = "No matches. Try a different search.";
}
function navigate(id) {
  stopAll();
  current = id;
  $("search").value = "";
  render();
}
function collectionDialog(rename = false) {
  editingCollection = rename ? current : null;
  const c = state.collections.find((x) => x.id === editingCollection);
  $("collectionDialogTitle").textContent = rename
    ? "Rename collection"
    : "New collection";
  $("collectionName").value = c?.name || "";
  $("collectionColor").value = c?.color || "#a89bff";
  $("collectionDialog").showModal();
  $("collectionName").focus();
}
$("collectionForm").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("collectionName").value.trim();
  if (!name) return;
  const next = structuredClone(state);
  if (editingCollection) {
    Object.assign(
      next.collections.find((c) => c.id === editingCollection),
      { name, color: $("collectionColor").value },
    );
  } else
    next.collections.push({
      id: uid(),
      name,
      color: $("collectionColor").value,
    });
  try {
    await persist(next);
    $("collectionDialog").close();
    render();
  } catch (e) {
    toast("Could not save: " + e.message);
  }
};
$("home").onclick = () => navigate(null);
document.querySelector(".brand").onclick = (e) => {
  e.preventDefault();
  navigate(null);
};
$("newSide").onclick = () => collectionDialog();
$("newTop").onclick = () => (current ? openEditor() : collectionDialog());
$("rename").onclick = () => collectionDialog(true);
$("deleteCollection").onclick = async () => {
  if (!confirm("Delete this collection and its sounds?")) return;
  try {
    stopAll();
    await persist({
      collections: state.collections.filter((c) => c.id !== current),
      sounds: state.sounds.filter((s) => s.collectionId !== current),
    });
    current = null;
    await cleanup();
    render();
  } catch (e) {
    toast(e.message);
  }
};
document.addEventListener("click", (e) => {
  const close = e.target.closest("[data-close]");
  if (close) $(close.dataset.close).close();
  const c = e.target.closest("[data-collection]");
  if (c) navigate(c.dataset.collection);
  const p = e.target.closest("[data-play]");
  if (p) play(p.dataset.play);
  const ed = e.target.closest("[data-edit]");
  if (ed) openEditor(ed.dataset.edit);
  if (e.target.closest("#addCard")) current ? openEditor() : collectionDialog();
});
$("search").oninput = render;
function stopOne(id) {
  const p = playing.get(id);
  if (p) {
    p.cancelled = true;
    if (p.source) {
      try {
        p.source.stop();
      } catch {}
    }
    if (p.audio) {
      p.audio.pause();
      p.audio.removeAttribute("src");
      p.audio.load();
    }
    clearTimeout(p.timer);
    playing.delete(id);
  }
}
function stopAll() {
  for (const id of playing.keys()) stopOne(id);
  $("status").textContent = "Ready when you are.";
  render();
}
$("stop").onclick = stopAll;
async function audioContext() {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}
async function play(id) {
  const s = state.sounds.find((s) => s.id === id);
  if (!s) return;
  let ac;
  try {
    ac = await audioContext();
  } catch (e) {
    toast(e.message);
    return;
  }
  if (!$("overlap").checked) stopAll();
  else stopOne(id);
  const p = { cancelled: false };
  playing.set(id, p);
  render();
  try {
    const m = await getMedia(s.mediaId);
    if (!m) throw new Error("Source file is missing");
    let decoded;
    try {
      decoded = await ac.decodeAudioData(await m.blob.arrayBuffer());
    } catch {}
    if (p.cancelled) return;
    const done = () => {
      if (playing.get(id) === p) {
        playing.delete(id);
        $("status").textContent = playing.size
          ? `${playing.size} sounds playing`
          : "Ready when you are.";
        render();
      }
    };
    if (decoded) {
      const source = ac.createBufferSource(),
        gain = ac.createGain();
      source.buffer = decoded;
      gain.gain.value = s.volume * Number($("volume").value);
      source.connect(gain).connect(ac.destination);
      p.source = source;
      p.gain = gain;
      source.onended = done;
      source.start(0, s.start, Math.min(s.end, decoded.duration) - s.start);
    } else {
      if (!urls.has(m.id)) urls.set(m.id, URL.createObjectURL(m.blob));
      const a = new Audio(urls.get(m.id));
      p.audio = a;
      a.volume = s.volume * Number($("volume").value);
      await new Promise((res, rej) => {
        a.onloadedmetadata = res;
        a.onerror = () =>
          rej(
            new Error(
              "This media format is not supported. Try MP3, WAV or H.264/AAC MP4.",
            ),
          );
      });
      if (p.cancelled) return;
      a.currentTime = s.start;
      await a.play();
      p.timer = setTimeout(
        () => {
          a.pause();
          done();
        },
        (s.end - s.start) * 1000,
      );
      a.onended = done;
    }
    if (!p.cancelled) $("status").textContent = "Playing · " + s.name;
  } catch (e) {
    stopOne(id);
    render();
    toast(e.message);
  }
}
$("volume").oninput = () => {
  for (const [id, p] of playing) {
    const s = state.sounds.find((s) => s.id === id);
    if (p.gain) p.gain.gain.value = s.volume * Number($("volume").value);
    if (p.audio) p.audio.volume = s.volume * Number($("volume").value);
  }
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    stopAll();
    stopPreview();
  }
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    document.querySelector("dialog[open]")
  )
    return;
  if (current && /^[1-9]$/.test(e.key)) {
    const sounds = state.sounds.filter(
      (s) =>
        s.collectionId === current &&
        s.name.toLowerCase().includes($("search").value.toLowerCase()),
    );
    if (sounds[Number(e.key) - 1]) play(sounds[Number(e.key) - 1].id);
  }
});
$("theme").onclick = () => {
  document.body.classList.toggle("light");
  localStorage.setItem(
    "soundbox-theme",
    document.body.classList.contains("light") ? "light" : "dark",
  );
};
if (localStorage.getItem("soundbox-theme") === "light")
  document.body.classList.add("light");
let dragged = null;
$("grid").ondragstart = (e) => {
  const p = e.target.closest("[data-sound]");
  if (p) {
    dragged = p.dataset.sound;
    e.dataTransfer.setData("text/plain", dragged);
  }
};
$("grid").ondragover = (e) => {
  if (dragged) e.preventDefault();
};
$("grid").ondrop = async (e) => {
  e.preventDefault();
  const target = e.target.closest("[data-sound]")?.dataset.sound;
  if (!dragged || !target || dragged === target) return;
  const next = structuredClone(state),
    from = next.sounds.findIndex((s) => s.id === dragged),
    item = next.sounds.splice(from, 1)[0];
  next.sounds.splice(
    next.sounds.findIndex((s) => s.id === target),
    0,
    item,
  );
  dragged = null;
  try {
    await persist(next);
    render();
  } catch (e) {
    toast(e.message);
  }
};
$("grid").ondragend = () => (dragged = null);
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
  edit = null;
  $("editor").close();
}
$("closeEditor").onclick = closeEditor;
$("editor").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeEditor();
});
async function openEditor(id = null) {
  stopAll();
  edit = id ? state.sounds.find((s) => s.id === id) : null;
  media = null;
  buffer = null;
  $("editorTitle").textContent = edit ? "Edit sound" : "Add a sound";
  $("file").value = "";
  $("importStatus").textContent = "";
  $("editFields").hidden = true;
  $("saveSound").disabled = true;
  $("deleteSound").hidden = !edit;
  $("exportWav").hidden = true;
  $("soundCollection").innerHTML = state.collections
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join("");
  $("soundCollection").value = edit?.collectionId || current;
  $("editor").showModal();
  if (edit) {
    try {
      const m = await getMedia(edit.mediaId);
      if (!$("editor").open) return;
      if (!m) throw new Error("Source file is missing");
      await loadMedia(m);
    } catch (e) {
      $("importStatus").textContent = e.message;
    }
  }
}
async function loadMedia(m) {
  const token = ++loadingToken;
  stopPreview();
  $("editFields").hidden = true;
  $("saveSound").disabled = true;
  $("importStatus").textContent = "Reading your file…";
  try {
    const v = $("preview");
    if (v.src) URL.revokeObjectURL(v.src);
    const url = URL.createObjectURL(m.blob);
    v.src = url;
    await new Promise((resolve, reject) => {
      v.onloadedmetadata = () =>
        Number.isFinite(v.duration) && v.duration > 0
          ? resolve()
          : reject(new Error("Could not read the duration of this file."));
      v.onerror = () =>
        reject(
          new Error(
            "Unsupported media. Try MP3, WAV, M4A or MP4 with AAC audio.",
          ),
        );
    });
    if (token !== loadingToken) return;
    let decoded = null;
    try {
      const ac = await audioContext();
      decoded = await ac.decodeAudioData(await m.blob.arrayBuffer());
    } catch {}
    if (token !== loadingToken) return;
    media = m;
    buffer = decoded;
    media.duration = v.duration;
    $("sourceName").textContent = m.name;
    $("soundName").value = edit?.name || m.name.replace(/\.[^.]+$/, "");
    $("soundColor").value =
      edit?.color ||
      state.collections.find((c) => c.id === current)?.color ||
      "#a89bff";
    $("soundVolume").value = edit?.volume ?? 1;
    for (const id of ["startHandle", "endHandle", "startTime", "endTime"])
      $(id).max = v.duration;
    $("startTime").value = edit && edit.mediaId === m.id ? edit.start : 0;
    $("endTime").value =
      edit && edit.mediaId === m.id
        ? Math.min(edit.end, v.duration)
        : v.duration;
    $("editFields").hidden = false;
    syncTrim();
    drawWave();
    $("exportWav").hidden = !buffer;
    $("saveSound").disabled = false;
    $("importStatus").textContent = buffer
      ? ""
      : "Waveform unavailable for this codec. You can still preview, trim and save.";
  } catch (e) {
    if (token === loadingToken) $("importStatus").textContent = e.message;
  }
}
$("file").onchange = () => {
  const f = $("file").files[0];
  if (f) loadMedia({ id: uid(), name: f.name, blob: f });
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
  const f = e.dataTransfer.files[0];
  if (f) loadMedia({ id: uid(), name: f.name, blob: f });
};
function syncTrim(changed = "") {
  if (!media) return;
  let start = Number($("startTime").value),
    end = Number($("endTime").value),
    duration = media.duration;
  start = Math.max(
    0,
    Math.min(Number.isFinite(start) ? start : 0, duration - 0.01),
  );
  end = Math.max(
    0.01,
    Math.min(Number.isFinite(end) ? end : duration, duration),
  );
  if (end <= start) {
    if (changed === "end") start = Math.max(0, end - 0.01);
    else end = Math.min(duration, start + 0.01);
  }
  $("startTime").value = Math.round(start * 100) / 100;
  $("endTime").value = Math.round(end * 100) / 100;
  $("startHandle").value = start;
  $("endHandle").value = end;
  $("selection").style.left = (start / duration) * 100 + "%";
  $("selection").style.width = ((end - start) / duration) * 100 + "%";
  $("clipDuration").textContent = seconds(end - start);
  stopPreview();
}
for (const side of ["start", "end"]) {
  $(side + "Time").onchange = () => syncTrim(side);
  $(side + "Handle").oninput = () => {
    $(side + "Time").value = $(side + "Handle").value;
    syncTrim(side);
  };
}
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
$("previewClip").onclick = async () => {
  if (!media) return;
  stopPreview();
  const v = $("preview");
  v.currentTime = Number($("startTime").value);
  try {
    await v.play();
    $("previewClip").textContent = "Playing selection…";
    previewTimer = setTimeout(
      stopPreview,
      (Number($("endTime").value) - Number($("startTime").value)) * 1000,
    );
  } catch (e) {
    toast("Preview failed: " + e.message);
  }
};
$("saveSound").onclick = async () => {
  if (!media || !$("soundName").value.trim())
    return toast("Give your sound a name.");
  syncTrim();
  const next = structuredClone(state),
    s = {
      id: edit?.id || uid(),
      name: $("soundName").value.trim(),
      collectionId: $("soundCollection").value,
      mediaId: media.id,
      start: Number($("startTime").value),
      end: Number($("endTime").value),
      color: $("soundColor").value,
      volume: Number($("soundVolume").value),
    };
  if (!s.collectionId) return toast("Create a collection first.");
  const i = next.sounds.findIndex((x) => x.id === s.id);
  if (i >= 0) next.sounds[i] = s;
  else next.sounds.push(s);
  $("saveSound").disabled = true;
  try {
    await persist(next, media);
    current = s.collectionId;
    closeEditor();
    await cleanup();
    render();
    toast("Sound saved.");
  } catch (e) {
    $("saveSound").disabled = false;
    toast("Could not save. Your browser storage may be full. " + e.message);
  }
};
$("deleteSound").onclick = async () => {
  if (!edit || !confirm("Delete this sound?")) return;
  try {
    await persist({
      ...state,
      sounds: state.sounds.filter((s) => s.id !== edit.id),
    });
    closeEditor();
    await cleanup();
    render();
  } catch (e) {
    toast(e.message);
  }
};
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
  if (buffer)
    download(
      wav(buffer, Number($("startTime").value), Number($("endTime").value)),
      ($("soundName").value || "sound").replace(/[^\w\- ]/g, "") + ".wav",
    );
};
$("backup").onclick = async () => {
  try {
    toast("Preparing backup…");
    const files = [];
    for (const id of new Set(state.sounds.map((s) => s.mediaId))) {
      const m = await getMedia(id);
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(m.blob);
      });
      files.push({ id: m.id, name: m.name, data });
    }
    download(
      new Blob(
        [
          JSON.stringify({
            format: "soundbox-backup",
            version: 1,
            state,
            media: files,
          }),
        ],
        { type: "application/json" },
      ),
      "soundbox-backup.json",
    );
    toast("Backup downloaded. Keep it somewhere safe.");
  } catch (e) {
    toast("Backup failed: " + e.message);
  }
};
$("restore").onclick = () => $("backupFile").click();
$("backupFile").onchange = async () => {
  const file = $("backupFile").files[0];
  if (!file) return;
  try {
    const b = JSON.parse(await file.text());
    if (
      b.format !== "soundbox-backup" ||
      b.version !== 1 ||
      !Array.isArray(b.state?.collections) ||
      !Array.isArray(b.state?.sounds) ||
      !Array.isArray(b.media)
    )
      throw new Error("Invalid Soundbox backup");
    const ids = new Set();
    const files = [];
    for (const m of b.media) {
      if (
        typeof m.id !== "string" ||
        typeof m.name !== "string" ||
        !/^data:[^;]*;base64,[A-Za-z0-9+/=\r\n]*$/.test(m.data)
      )
        throw new Error("Invalid media in backup");
      const [header, data] = m.data.split(","),
        bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      files.push({
        id: m.id,
        name: m.name,
        blob: new Blob([bytes], { type: header.slice(5, header.indexOf(";")) }),
      });
      ids.add(m.id);
    }
    const validColor = (c) => /^#[a-f0-9]{6}$/i.test(c);
    for (const c of b.state.collections)
      if (
        typeof c.id !== "string" ||
        typeof c.name !== "string" ||
        !validColor(c.color)
      )
        throw new Error("Invalid collection");
    const collectionIds = new Set(b.state.collections.map((c) => c.id));
    for (const s of b.state.sounds)
      if (
        typeof s.id !== "string" ||
        typeof s.name !== "string" ||
        !ids.has(s.mediaId) ||
        !collectionIds.has(s.collectionId) ||
        !validColor(s.color) ||
        !Number.isFinite(s.start) ||
        !Number.isFinite(s.end) ||
        s.start < 0 ||
        s.end <= s.start ||
        !Number.isFinite(s.volume) ||
        s.volume < 0 ||
        s.volume > 1
      )
        throw new Error("Invalid sound");
    if (
      !confirm(
        "Replace your current workspace with this backup? Export a backup first if you want to keep it.",
      )
    )
      return;
    stopAll();
    await transaction(["data", "media"], (t) => {
      t.objectStore("media").clear();
      for (const m of files) t.objectStore("media").put(m);
      t.objectStore("data").put(b.state, "state");
    });
    state = b.state;
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls.clear();
    current = null;
    render();
    toast("Workspace restored.");
  } catch (e) {
    toast("Restore failed: " + e.message);
  } finally {
    $("backupFile").value = "";
  }
};
async function init() {
  try {
    db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("soundbox-local", 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("data");
        r.result.createObjectStore("media", { keyPath: "id" });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const saved = await request(
      db.transaction("data").objectStore("data").get("state"),
    );
    if (saved) state = saved;
    else {
      const cid = uid();
      state.collections = [
        { id: cid, name: "Getting started", color: "#a89bff" },
      ];
      const sr = 22050,
        files = [];
      for (const [i, name] of [
        "Soft chime",
        "Little signal",
        "Low pulse",
      ].entries()) {
        const data = new Float32Array(sr * 0.6);
        for (let j = 0; j < data.length; j++) {
          const t = j / sr;
          data[j] =
            Math.sin(t * 2 * Math.PI * [660, 880, 220][i]) *
            0.35 *
            Math.exp(-t * 7) *
            Math.min(1, t * 100);
        }
        const fake = {
            sampleRate: sr,
            numberOfChannels: 1,
            duration: 0.6,
            getChannelData: () => data,
          },
          mid = uid();
        files.push({ id: mid, name: name + ".wav", blob: wav(fake) });
        state.sounds.push({
          id: uid(),
          collectionId: cid,
          mediaId: mid,
          name,
          start: 0,
          end: 0.6,
          volume: 1,
          color: ["#a89bff", "#8ccfc0", "#efbf8d"][i],
        });
      }
      await transaction(["data", "media"], (t) => {
        t.objectStore("data").put(state, "state");
        for (const f of files) t.objectStore("media").put(f);
      });
    }
    render();
  } catch (e) {
    toast(
      "Browser storage is unavailable. Open the app through the included local launcher.",
    );
    $("status").textContent = e.message;
  }
}
init();
