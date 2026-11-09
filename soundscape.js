(() => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const SOUND_MAP = {
    aurora: { src: "assets/sfx-aurora-laughter.mp3", volume: 0.16, loop: false },
    bloom: { src: "assets/sfx-bloom.mp3", volume: 0.42, loop: false },
    courtyard: { src: "assets/sfx-courtyard-magic.mp3", volume: 0.38, loop: false },
    chamber: { src: "assets/sfx-resonance-crystal.mp3", volume: 0.38, loop: false },
    hands: { src: "assets/sfx-fire.mp3", volume: 0.16, loop: false },
    mourning: { src: "assets/sfx-rain.mp3", volume: 0.27, loop: false }
  };

  const buffers = new Map();
  const loads = new Map();
  const oneShots = new Map();
  let context = null;
  let master = null;
  let muted = false;
  let activeAmbience = null;
  let wantedAmbience = "";
  let ambienceGeneration = 0;
  let pageTimer = 0;
  let pageToken = 0;
  let lastPageKey = "";

  function dispatchAmbience(active) {
    window.dispatchEvent(new CustomEvent("diary-ambience", { detail: { active } }));
  }

  function ensureContext() {
    if (!AudioContextClass) return null;
    if (!context) {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(context.destination);
    }
    if (!document.hidden && context.state === "suspended") context.resume().catch(() => {});
    return context;
  }

  function unlock() {
    if (!ensureContext()) return;
    const silent = context.createBufferSource();
    silent.buffer = context.createBuffer(1, 1, context.sampleRate);
    silent.connect(master);
    silent.start();
    Object.keys(SOUND_MAP).forEach(loadBuffer);
  }

  function loadBuffer(key) {
    if (buffers.has(key)) return Promise.resolve(buffers.get(key));
    if (loads.has(key)) return loads.get(key);
    const config = SOUND_MAP[key];
    if (!config || !ensureContext()) return Promise.resolve(null);

    const request = fetch(config.src, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Audio ${key} non disponibile`);
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        buffers.set(key, buffer);
        loads.delete(key);
        return buffer;
      })
      .catch(() => {
        loads.delete(key);
        return null;
      });
    loads.set(key, request);
    return request;
  }

  function connectSource(buffer, volume, loop = false) {
    if (!ensureContext() || !buffer) return null;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(master);
    return { source, gain };
  }

  function stopOneShot(key) {
    const playing = oneShots.get(key);
    if (!playing) return;
    oneShots.delete(key);
    try { playing.stop(); } catch (_) {}
  }

  function playOnce(key) {
    if (muted || !SOUND_MAP[key]) return;
    const requestToken = Symbol(key);
    oneShots.set(`${key}:request`, requestToken);
    loadBuffer(key).then((buffer) => {
      if (!buffer || muted || oneShots.get(`${key}:request`) !== requestToken) return;
      oneShots.delete(`${key}:request`);
      stopOneShot(key);
      const playing = connectSource(buffer, SOUND_MAP[key].volume, false);
      if (!playing) return;
      oneShots.set(key, playing.source);
      playing.source.addEventListener("ended", () => {
        if (oneShots.get(key) === playing.source) oneShots.delete(key);
      }, { once: true });
      playing.source.start();
    });
  }

  function stopAmbience(fade = 0.55) {
    wantedAmbience = "";
    ambienceGeneration += 1;
    const leaving = activeAmbience;
    activeAmbience = null;
    dispatchAmbience(false);
    if (!leaving || !context) return;
    const now = context.currentTime;
    leaving.gain.gain.cancelScheduledValues(now);
    leaving.gain.gain.setValueAtTime(Math.max(0.0001, leaving.gain.gain.value), now);
    leaving.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    try { leaving.source.stop(now + fade + 0.08); } catch (_) {}
  }

  function startAmbience(key) {
    const config = SOUND_MAP[key];
    if (!config?.loop || wantedAmbience === key) return;
    stopAmbience(0.52);
    wantedAmbience = key;
    const generation = ++ambienceGeneration;

    loadBuffer(key).then((buffer) => {
      if (!buffer || wantedAmbience !== key || generation !== ambienceGeneration) return;
      const playing = connectSource(buffer, 0.0001, true);
      if (!playing) return;
      activeAmbience = { key, ...playing };
      const now = context.currentTime;
      playing.gain.gain.setValueAtTime(0.0001, now);
      playing.gain.gain.exponentialRampToValueAtTime(config.volume, now + 1.05);
      playing.source.start();
      dispatchAmbience(true);
    });
  }

  function clearPage() {
    window.DIARY_MOTION.cancel(pageTimer);
    pageToken += 1;
    stopAmbience(0.42);
    Array.from(oneShots.keys()).forEach((key) => {
      if (String(key).endsWith(":request")) oneShots.delete(key);
      else stopOneShot(key);
    });
    lastPageKey = "";
  }

  function setPage(effects = [], { delay = 1.1, playAccent = true } = {}) {
    window.DIARY_MOTION.cancel(pageTimer);
    const token = ++pageToken;
    const uniqueEffects = Array.from(new Set(effects.filter(Boolean)));
    const key = uniqueEffects.slice().sort().join("|");

    pageTimer = window.DIARY_MOTION.after(() => {
      if (token !== pageToken) return;
      const ambientKey = uniqueEffects.find((effect) => SOUND_MAP[effect]?.loop) || "";
      if (ambientKey) startAmbience(ambientKey);
      else stopAmbience();

      if (playAccent && key !== lastPageKey) {
        uniqueEffects
          .filter((effect) => SOUND_MAP[effect] && !SOUND_MAP[effect].loop)
          .forEach(playOnce);
      }
      lastPageKey = key;
    }, Math.max(0, delay * 1000));
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (!ensureContext() || !master) return;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(muted ? 0 : 0.9, now, 0.055);
  }

  document.addEventListener("visibilitychange", () => {
    if (!context) return;
    if (document.hidden && context.state === "running") context.suspend().catch(() => {});
    else if (!document.hidden && context.state === "suspended") context.resume().catch(() => {});
  });

  window.DIARY_SOUNDS = { unlock, clearPage, setPage, setMuted };
})();
