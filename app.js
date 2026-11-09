const pages = window.DIARY_PAGES;
const motion = window.DIARY_MOTION;
const diaryStatus = document.getElementById("diaryStatus");
const assetLoads = new Map();

function loadImage(src) {
  if (assetLoads.has(src)) return assetLoads.get(src);
  const request = new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    let finished = false;
    const timeout = window.setTimeout(() => finish(false), 15000);
    function finish(ready) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      image.onload = image.onerror = null;
      resolve(ready);
    }
    image.onerror = () => finish(false);
    image.onload = async () => {
      try { await image.decode?.(); } catch (_) { /* A loaded image can still be rendered. */ }
      finish(image.naturalWidth > 0);
    };
    image.src = src;
  });
  assetLoads.set(src, request);
  request.then((ready) => { if (!ready) assetLoads.delete(src); });
  return request;
}

async function prepareAssets(pageIndex) {
  const visible = mobile ? [pages[pageIndex]] : pages.slice(pageIndex * 2, pageIndex * 2 + 2);
  const sources = visible.flatMap((page) => page?.image ? [page.image]
    : page?.className?.includes("final-petal-page") ? ["assets/petal-taped-transparent.png"] : []);
  const loadingNote = motion.after(() => { diaryStatus.textContent = "Il ricordo sta affiorando…"; }, 250);
  try {
    await Promise.all([
      ...sources.map(loadImage),
      document.fonts?.ready ? Promise.race([document.fonts.ready, new Promise((resolve) => window.setTimeout(resolve, 1800))]) : null
    ]);
  } finally {
    motion.cancel(loadingNote);
    diaryStatus.textContent = "";
  }
}

function warmNextPages() {
  const nextPages = mobile ? pages.slice(index + 1, index + 3) : pages.slice((index + 1) * 2, (index + 2) * 2);
  nextPages.forEach((page) => { if (page?.image) loadImage(page.image); });
}

function updateNavigation() {
  prev.disabled = busy || index === 0;
  next.disabled = busy || index === maxIndex();
  reader.setAttribute("aria-busy", String(busy));
}
const ambient = document.getElementById("ambient");
const runes = ["ᚨ", "ᚲ", "ᚾ", "ᛟ", "✦", "◇", "ᚱ", "ᛇ"];

for (let i = 0; i < 18; i += 1) {
  const light = document.createElement("i");
  light.className = "wisp";
  light.style.left = `${4 + Math.random() * 92}%`;
  light.style.top = `${9 + Math.random() * 78}%`;
  light.style.setProperty("--d", `${5 + Math.random() * 6}s`);
  light.style.setProperty("--delay", `${-Math.random() * 9}s`);
  light.style.setProperty("--x", `${-40 + Math.random() * 80}px`);
  ambient.appendChild(light);
}

for (let i = 0; i < 11; i += 1) {
  const rune = document.createElement("b");
  rune.className = "rune-spark";
  rune.textContent = runes[i % runes.length];
  rune.style.left = `${7 + Math.random() * 86}%`;
  rune.style.top = `${8 + Math.random() * 82}%`;
  rune.style.setProperty("--d", `${6 + Math.random() * 7}s`);
  rune.style.setProperty("--delay", `${-Math.random() * 10}s`);
  ambient.appendChild(rune);
}

const leftLeaf = document.getElementById("leftLeaf");
const rightLeaf = document.getElementById("rightLeaf");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const counter = document.getElementById("counter");
const progress = document.getElementById("progress");
const soundToggle = document.getElementById("soundToggle");
const musicVolumeInput = document.getElementById("musicVolume");
const musicVolumeOutput = document.getElementById("musicVolumeValue");
const soundtrack = document.getElementById("soundtrack");
const reader = document.getElementById("reader");
const sealedCover = document.getElementById("sealedCover");
const openDiary = document.getElementById("openDiary");
const revelioVoice = document.getElementById("revelioVoice");

let index = 0;
let busy = false;
let opened = false;
let revealing = false;
let muted = false;
let musicVolume = 50;
try {
  const savedVolume = localStorage.getItem("gyrowyn.musicVolume");
  if (savedVolume !== null && savedVolume.trim() !== "" && Number.isFinite(Number(savedVolume))) {
    musicVolume = Math.max(0, Math.min(100, Number(savedVolume)));
  }
} catch (_) { /* Audio controls also work when storage is unavailable. */ }
let musicShouldPlay = false;
let ambienceDucking = false;
let mobile = matchMedia("(max-width:760px)").matches;
const ART_IMAGE_SETTLE_DELAY = 7.05;
const ART_EFFECT_DELAY = 7.3;
const INK_VANISH_DURATION = 1240;

function visiblePageEffects() {
  const visiblePages = mobile
    ? [pages[index]]
    : [pages[index * 2], pages[index * 2 + 1]];
  return visiblePages.filter(Boolean).map((page) => page.effect).filter(Boolean);
}

function queueVisiblePageSound(options) {
  window.DIARY_SOUNDS?.setPage(visiblePageEffects(), options);
}

const mourningRain = `<div class="rain-field">${Array.from({ length: 42 }, (_, i) => {
  const x = (i * 29 + 7) % 100;
  const duration = (0.76 + (i % 8) * 0.11).toFixed(2);
  const delay = (-((i * 17) % 29) / 10).toFixed(1);
  const length = 13 + (i % 6) * 5;
  const drift = -25 - (i % 5) * 8;
  const alpha = (0.28 + (i % 4) * 0.1).toFixed(2);
  return `<i class="rain-drop rain-depth-${i % 3}" style="--rain-x:${x}%;--rain-duration:${duration}s;--rain-delay:${delay}s;--rain-length:${length}px;--rain-drift:${drift}px;--rain-alpha:${alpha}"></i>`;
}).join("")}</div>`;

const mourningSpill = '<div class="rain-spill accumulating-rain" aria-hidden="true"></div>';
const pageRainMemory = new Map();
let activePageRain = null;

// A shuffled grid lets separate drops eventually wet every part of the paper.
const rainPlacements = Array.from({ length: 14 * 20 }, (_, i) => {
  const seed = inkHash(`paper-water:${i}`);
  return {
    x: ((i % 14 + 0.4 + (seed % 100) / 500) / 14) * 100,
    y: ((Math.floor(i / 14) + 0.4 + ((seed >>> 8) % 100) / 500) / 20) * 100,
    rotation: (seed % 25) - 12,
    shape: seed % 3
  };
});
let rainSeed = 7391;
for (let i = rainPlacements.length - 1; i > 0; i -= 1) {
  rainSeed ^= rainSeed << 13;
  rainSeed ^= rainSeed >>> 17;
  rainSeed ^= rainSeed << 5;
  const j = (rainSeed >>> 0) % (i + 1);
  [rainPlacements[i], rainPlacements[j]] = [rainPlacements[j], rainPlacements[i]];
}

function stopPageRain() {
  activePageRain?.stop();
  activePageRain = null;
}

function startPageRain(inner) {
  const layer = inner.querySelector(".accumulating-rain");
  if (!layer || activePageRain?.inner === inner) return;
  stopPageRain();
  const pageKey = inner.dataset.rainPage;
  if (!pageRainMemory.has(pageKey)) pageRainMemory.set(pageKey, []);
  const landed = pageRainMemory.get(pageKey);
  const reducedMotion = motion.reduced();
  if (reducedMotion) return;
  let stopped = false;
  let timer = 0;
  let repeatIndex = 0;
  let fallingDrop = null;
  const animations = new Set();
  layer.replaceChildren();

  function animate(element, frames, options) {
    if (reducedMotion || !element.animate) return;
    const animation = motion.track(element.animate(frames, options));
    animations.add(animation);
    animation.finished.then(() => {
      animations.delete(animation);
      animation.cancel();
    }, () => animations.delete(animation));
  }

  function leaveStain(spot, fresh) {
    const stain = document.createElement("i");
    stain.className = `paper-water-mark water-shape-${spot.shape}`;
    stain.style.left = `${spot.x}%`;
    stain.style.top = `${spot.y}%`;
    stain.style.setProperty("--water-angle", `${spot.rotation}deg`);
    layer.appendChild(stain);
    if (!fresh) return;
    const position = `translate(-50%,-50%) rotate(${spot.rotation}deg)`;
    animate(stain, [
      { opacity: 0.90, transform: `${position} scale(.17)`, offset: 0 },
      { opacity: 1, transform: `${position} scale(.40)`, offset: 0.12 },
      { opacity: 1, transform: `${position} scale(.69)`, offset: 0.46 },
      { opacity: 1, transform: `${position} scale(1)`, offset: 1 }
    ], { duration: 14000, easing: "cubic-bezier(.16,.6,.25,1)", fill: "backwards" });
  }

  // Water is remembered during this visit, including when returning to the page.
  landed.forEach((spot) => leaveStain(spot, false));

  function nextDrop() {
    if (stopped || !inner.isConnected || inner.classList.contains("ink-vanishing")) return;
    if (document.hidden) {
      timer = motion.after(nextDrop, 500);
      return;
    }
    const fresh = landed.length < rainPlacements.length;
    const spot = rainPlacements[fresh ? landed.length : repeatIndex++ % rainPlacements.length];
    const drop = document.createElement("i");
    fallingDrop = drop;
    drop.className = "paper-raindrop";
    drop.style.left = `${spot.x}%`;
    drop.style.top = `${spot.y}%`;
    layer.appendChild(drop);
    const fallTime = reducedMotion ? 0 : 440 + spot.y * 2.8;
    const distance = (layer.clientHeight || 750) * spot.y / 100 + 18;
    animate(drop, [
      { opacity: 0, transform: `translate(-50%,${-distance}px) scaleY(1.35)`, offset: 0 },
      { opacity: 0.95, offset: 0.16 },
      { opacity: 0.95, offset: 0.90 },
      { opacity: 0, transform: "translate(-50%,-50%) scaleY(.55)", offset: 1 }
    ], { duration: fallTime, easing: "cubic-bezier(.38,.05,.72,1)", fill: "backwards" });
    timer = motion.after(() => {
      drop.remove();
      fallingDrop = null;
      if (stopped || !inner.isConnected) return;
      if (fresh) {
        landed.push(spot);
        leaveStain(spot, true);
      }
      timer = motion.after(nextDrop, 230 + spot.shape * 75);
    }, fallTime);
  }

  activePageRain = {
    inner,
    stop() {
      stopped = true;
      motion.cancel(timer);
      fallingDrop?.remove();
      animations.forEach((motion) => motion.cancel());
      animations.clear();
    }
  };
  timer = motion.after(nextDrop, 180);
}

const rageMarks = (number) => `<span class="rage-marks rage-marks-${number % 3}" aria-hidden="true">
  <i class="rage-stroke stroke-one"></i><i class="rage-stroke stroke-two"></i>
  <i class="rage-stroke stroke-three"></i><i class="rage-stroke stroke-four"></i>
</span>`;

function inkHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function styleInkWord(span, word, serial, furious) {
  const hash = inkHash(`${word}:${serial}`);
  const calmTones = [2, 2, 2, 1, 2, 3, 2, 2, 1, 3];
  const furiousTones = [2, 3, 4, 4, 3, 4, 2, 3];
  const tone = furious ? furiousTones[hash % furiousTones.length] : calmTones[hash % calmTones.length];
  span.classList.add("ink-word", `ink-tone-${tone}`);
  span.style.setProperty("--ink-tilt", `${((hash % 9) - 4) * 0.07}deg`);
  span.style.setProperty("--ink-lift", `${(((hash >>> 4) % 7) - 3) * 0.045}px`);
  span.dataset.inkSeed = String(hash % 997);
}

function wrapInkWords(inner) {
  if (!inner || inner.dataset.inkPrepared === "true") return;
  inner.dataset.inkPrepared = "true";
  const furious = inner.classList.contains("rage");
  let serial = 0;

  inner.querySelectorAll(".eyebrow, h2, .prose, .art-caption, .art-date").forEach((block) => {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement.closest(".ink-word, .broken-word, .rage-marks")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(part));
          return;
        }
        const span = document.createElement("span");
        span.textContent = part;
        styleInkWord(span, part, serial, furious);
        serial += 1;
        fragment.appendChild(span);
      });
      node.replaceWith(fragment);
    });
  });

  inner.querySelectorAll(".broken-word").forEach((span) => {
    styleInkWord(span, span.getAttribute("aria-label") || span.textContent, serial, true);
    serial += 1;
  });
}

function textFits(prose) {
  return prose.scrollHeight <= prose.clientHeight + 1;
}

function fitPageText(inner) {
  const prose = inner?.querySelector(".prose");
  if (!prose) return;

  inner.classList.remove("fit-dense", "fit-tight", "fit-emergency", "needs-scroll");
  prose.style.removeProperty("font-size");
  prose.removeAttribute("tabindex");
  prose.removeAttribute("role");
  prose.removeAttribute("aria-label");
  for (const density of ["fit-dense", "fit-tight", "fit-emergency"]) {
    if (textFits(prose)) break;
    inner.classList.add(density);
  }
  // Keep phone text at a readable size; overflowing pages remain scrollable.
  const minimum = mobile ? 16 : 14.5;
  const initialSize = parseFloat(getComputedStyle(prose).fontSize);
  if (!textFits(prose) && initialSize > minimum) {
    let low = minimum;
    let high = initialSize;
    prose.style.fontSize = `${minimum}px`;
    if (textFits(prose)) {
      for (let i = 0; i < 5; i += 1) {
        const candidate = (low + high) / 2;
        prose.style.fontSize = `${candidate}px`;
        if (textFits(prose)) low = candidate;
        else high = candidate;
      }
      prose.style.fontSize = `${low}px`;
    }
  }
  if (!textFits(prose)) {
    inner.classList.add("needs-scroll");
    prose.tabIndex = 0;
    prose.setAttribute("role", "region");
    prose.setAttribute("aria-label", "Testo del diario: scorri per leggere tutta la pagina");
  }
}

function stageInkWords(inner, pageSide, extraDelay) {
  const bounds = inner.getBoundingClientRect();
  const originX = pageSide === "left" ? bounds.right : bounds.left;
  const originY = bounds.top + bounds.height / 2;
  const maxDistance = Math.max(Math.hypot(bounds.width, bounds.height / 2), 1);
  const words = Array.from(inner.querySelectorAll(".ink-word"));
  const measurements = words.map((word) => ({ word, bounds: word.getBoundingClientRect() }));
  let lastDelay = extraDelay;

  measurements.forEach(({ word, bounds: wordBounds }) => {
    const centreX = wordBounds.left + wordBounds.width / 2;
    const centreY = wordBounds.top + wordBounds.height / 2;
    const distance = Math.hypot(centreX - originX, centreY - originY);
    const radialProgress = Math.min(1, distance / maxDistance);
    const seed = Number(word.dataset.inkSeed || 0);
    const individualPause = (seed % 9) * 0.018;
    const delay = extraDelay + 0.14 + radialProgress * 2.72 + individualPause;
    word.style.setProperty("--ink-delay", `${delay.toFixed(3)}s`);
    lastDelay = Math.max(lastDelay, delay);
  });

  return lastDelay;
}

function stageInkVanish(inner, pageSide) {
  const bounds = inner.getBoundingClientRect();
  const originX = pageSide === "left" ? bounds.right : bounds.left;
  const originY = bounds.top + bounds.height / 2;
  const maxDistance = Math.max(Math.hypot(bounds.width, bounds.height / 2), 1);

  const measurements = Array.from(inner.querySelectorAll(".ink-word"), (word) => {
    const style = getComputedStyle(word);
    return { word, bounds: word.getBoundingClientRect(), opacity: style.opacity, transform: style.transform };
  });
  measurements.forEach(({ word, bounds: wordBounds, opacity, transform }) => {
    if (opacity !== undefined) {
      word.style.setProperty("--ink-out-alpha", opacity);
      word.style.setProperty("--ink-out-start", transform);
    }
    const centreX = wordBounds.left + wordBounds.width / 2;
    const centreY = wordBounds.top + wordBounds.height / 2;
    const distance = Math.hypot(centreX - originX, centreY - originY);
    const radialProgress = Math.min(1, distance / maxDistance);
    const seed = Number(word.dataset.inkSeed || 0);
    const delay = (1 - radialProgress) * 0.48 + (seed % 7) * 0.012;
    word.style.setProperty("--ink-out-delay", `${delay.toFixed(3)}s`);
  });
}

function vanishInk(root, side) {
  const inner = root?.querySelector(".ink-page");
  if (!inner) return Promise.resolve();
  cancelInk(inner);
  if (motion.reduced()) return Promise.resolve();
  if (activePageRain?.inner === inner) stopPageRain();

  wrapInkWords(inner);
  const pageSide = side || inner.dataset.inkSide || "right";
  inner.dataset.inkSide = pageSide;
  stageInkVanish(inner, pageSide);
  const fading = Array.from(inner.querySelectorAll(".art-frame,.rain-spill,.closing-relics,.final-petal-relic,.rage-marks,.tear-stain,.ink-blot"), (element) => ({ element, opacity: getComputedStyle(element).opacity }));
  fading.forEach(({ element, opacity }) => element.style.setProperty("--vanish-alpha", opacity));
  inner.classList.add("ink-vanishing");

  return new Promise((resolve) => {
    motion.after(resolve, INK_VANISH_DURATION);
  });
}

const inkLifecycles = new WeakMap();
function cancelInk(inner) {
  inkLifecycles.get(inner)?.forEach((cancel) => cancel());
  inkLifecycles.delete(inner);
}
function inkLater(inner, run, delay) {
  const token = motion.after(() => {
    if (inner.isConnected && !inner.classList.contains("ink-vanishing")) run();
  }, delay);
  inkLifecycles.get(inner)?.push(() => motion.cancel(token));
  return token;
}

function prepareInk(root, { reveal = false, side = null, extraDelay = 0 } = {}) {
  const inner = root?.querySelector(".ink-page");
  if (!inner) return;
  cancelInk(inner);
  inkLifecycles.set(inner, []);
  wrapInkWords(inner);
  fitPageText(inner);
  if (motion.reduced()) { settleInk(root, side); return; }
  inner.classList.remove("ink-revealing", "ink-revealed", "art-image-settled", "art-effects-ready");
  const pageSide = side || inner.dataset.inkSide || "right";
  inner.dataset.inkSide = pageSide;
  if (!reveal) {
    inner.classList.add("ink-pending");
    return;
  }

  const lastWordDelay = stageInkWords(inner, pageSide, extraDelay);
  inner.style.setProperty("--page-reveal-delay", `${(extraDelay + 0.12).toFixed(2)}s`);
  inner.classList.add("ink-pending");

  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!inner.isConnected || !inkLifecycles.has(inner) || inner.classList.contains("ink-vanishing")) return;
    inner.classList.remove("ink-pending");
    inner.classList.add("ink-revealing");

    if (inner.classList.contains("art-page")) {
      const artReveal = inner.querySelector(".memory-image");
      let artSettled = false;
      let fallback = 0;
      const finishArtReveal = () => {
        if (artSettled || !inner.isConnected || inner.classList.contains("ink-vanishing")) return;
        artSettled = true;
        motion.cancel(fallback);
        artReveal?.removeEventListener("animationend", onArtAnimationEnd);
        inner.classList.add("art-image-settled");
        inkLater(inner, () => {
          inner.classList.add("art-effects-ready");
          startPageRain(inner);
          queueVisiblePageSound({ delay: 0, playAccent: true });
        }, (ART_EFFECT_DELAY - ART_IMAGE_SETTLE_DELAY) * 1000);
      };
      const onArtAnimationEnd = (event) => {
        if (event.target === artReveal && event.animationName === "memoryMaterialize") finishArtReveal();
      };
      artReveal?.addEventListener("animationend", onArtAnimationEnd);
      inkLifecycles.get(inner).push(() => artReveal?.removeEventListener("animationend", onArtAnimationEnd));
      // Only a compatibility fallback: the actual CSS completion is authoritative.
      fallback = inkLater(inner, finishArtReveal, (extraDelay + ART_IMAGE_SETTLE_DELAY + 0.3) * 1000);
    }

    const visualSettleDelay = inner.classList.contains("mourning-art")
      ? 16.6 : inner.classList.contains("art-page") ? 9.35
        : inner.classList.contains("final-petal-page") ? 7.2 : 3.85;
    inkLater(inner, () => {
      inner.classList.remove("ink-revealing");
      inner.classList.add("ink-revealed");
    }, Math.max(lastWordDelay + 1.3, extraDelay + visualSettleDelay) * 1000);
  }));
}

function settleInk(root, side = null) {
  const inner = root?.querySelector(".ink-page");
  if (!inner) return;
  cancelInk(inner);
  wrapInkWords(inner);
  fitPageText(inner);
  inner.dataset.inkSide = side || inner.dataset.inkSide || "right";
  inner.classList.remove("ink-pending", "ink-revealing");
  inner.classList.add("ink-revealed");
  if (inner.classList.contains("art-page")) {
    inner.classList.add("art-image-settled", "art-effects-ready");
    startPageRain(inner);
  }
}

function pageMarkup(page, number) {
  if (!page) return '<div class="leaf-inner"></div>';
  if (page.type === "art") {
    return `<div class="leaf-inner ink-page ink-pending ${page.className || ""}" data-ink-side="${number % 2 ? "left" : "right"}" data-rain-page="${number}">
      <span class="art-date">${page.date || ""}</span>
      <div class="art-frame">
        <span class="memory-shadow" aria-hidden="true"></span>
        <span class="memory-image"><img src="${page.image}" decoding="async" alt="${page.alt}" draggable="false"></span>
        <span class="memory-veil" aria-hidden="true"></span>
        ${page.effect === "hands" || page.effect === "chamber" ? `<div class="living-flame flame-${page.effect}" aria-hidden="true"><img src="${page.image}" decoding="async" alt="" draggable="false"></div>` : ""}
        <div class="art-enchantment effect-${page.effect || "memory"}" aria-hidden="true">
          <i class="spell-core"></i><i class="spell-ring ring-one"></i><i class="spell-ring ring-two"></i>
          <i class="magic-mote mote-one"></i><i class="magic-mote mote-two"></i><i class="magic-mote mote-three"></i>
          ${page.effect === "mourning" ? mourningRain : ""}
        </div>
      </div>
      ${page.effect === "mourning" ? mourningSpill : ""}
      <p class="art-caption">${page.caption}</p>
      <span class="page-mark">${number}</span>
    </div>`;
  }
  return `<div class="leaf-inner ink-page ink-pending ${page.className || ""} ${page.title ? "has-heading" : "note-only"}" data-ink-side="${number % 2 ? "left" : "right"}">
    ${page.deco || ""}
    ${(page.className || "").includes("rage") ? rageMarks(number) : ""}
    ${page.eyebrow ? `<div class="eyebrow">${page.eyebrow}</div>` : ""}
    ${page.title ? `<h2>${page.title}</h2>` : ""}
    <div class="prose">${page.html || ""}</div>
    <span class="scroll-cue" aria-hidden="true">Scorri il testo ↓</span>
    ${page.after || ""}
    ${page.hideNumber ? "" : `<span class="page-mark">${number}</span>`}
  </div>`;
}

const pageAt = (pageIndex) => pageMarkup(pages[pageIndex], pageIndex + 1);
const maxIndex = () => mobile ? pages.length - 1 : Math.ceil(pages.length / 2) - 1;

function watchPageImages() {
  document.querySelectorAll(".memory-image>img,.final-petal-relic>img").forEach((image) => {
    const frame = image.closest(".art-frame,.final-petal-relic");
    function showRetry() {
      if (!frame.isConnected || frame.querySelector(".retry-memory")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "retry-memory";
      button.textContent = "Il ricordo non si è caricato. Riprova";
      button.addEventListener("pointerup", (event) => event.stopPropagation());
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        button.disabled = true;
        const src = image.getAttribute("src");
        assetLoads.delete(src);
        if (await loadImage(src)) {
          if (!frame.isConnected) return;
          image.src = src;
          button.remove();
          prepareInk(image.closest(".leaf"), { reveal: true });
        } else {
          button.disabled = false;
          button.textContent = "Il ricordo non è disponibile. Riprova";
        }
      });
      frame.appendChild(button);
    }
    image.addEventListener("error", showRetry);
    image.addEventListener("load", () => frame.querySelector(".retry-memory")?.remove());
    if (image.complete && !image.naturalWidth) showRetry();
  });
}

function render({ reveal = false, extraDelay = 0 } = {}) {
  stopPageRain();
  [leftLeaf, rightLeaf].forEach((leaf) => {
    const inner = leaf.querySelector(".ink-page");
    if (inner) cancelInk(inner);
  });
  if (mobile) {
    rightLeaf.innerHTML = pageAt(index);
    leftLeaf.innerHTML = "";
    if (reveal) prepareInk(rightLeaf, { reveal: true, side: "right", extraDelay });
    else settleInk(rightLeaf, "right");
  } else {
    leftLeaf.innerHTML = pageAt(index * 2);
    rightLeaf.innerHTML = pageAt(index * 2 + 1);
    if (reveal) {
      prepareInk(leftLeaf, { reveal: true, side: "left", extraDelay });
      prepareInk(rightLeaf, { reveal: true, side: "right", extraDelay });
    } else {
      settleInk(leftLeaf, "left");
      settleInk(rightLeaf, "right");
    }
  }

  const max = maxIndex();
  counter.textContent = `${mobile ? "PAGINA" : "FOGLIO"} ${index + 1} DI ${max + 1}`;
  progress.style.width = `${((index + 1) / (max + 1)) * 100}%`;
  updateNavigation();
  watchPageImages();
  warmNextPages();
}

async function turn(direction) {
  const target = index + direction;
  if (!opened || busy || target < 0 || target > maxIndex()) return;
  busy = true;
  updateNavigation();
  try {
    await prepareAssets(target);
    await new Promise((resolve) => motion.after(resolve));
    window.DIARY_SOUNDS?.clearPage();
    const leavingPages = mobile
      ? [vanishInk(rightLeaf, "right")]
      : [vanishInk(leftLeaf, "left"), vanishInk(rightLeaf, "right")];
    await Promise.all(leavingPages);
    index = target;
    render({ reveal: true, extraDelay: 0.12 });
    if (motion.reduced()) queueVisiblePageSound({ delay: 0, playAccent: true });
  } finally {
    busy = false;
    updateNavigation();
    applyResize();
  }
}

function sendMusicCommand(func, args = []) {
  const frame = soundtrack.querySelector("iframe");
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage(JSON.stringify({
    event: "command",
    func,
    args
  }), "*");
}

function applyMusicState() {
  sendMusicCommand("setVolume", [musicPlaybackVolume()]);
  sendMusicCommand(muted || musicVolume === 0 ? "mute" : "unMute");
  if (!muted && musicShouldPlay) sendMusicCommand("playVideo");
}

function musicPlaybackVolume() {
  // The soundtrack is quiet: use 80/100 at the centre and keep headroom above.
  const level = musicVolume <= 50 ? musicVolume * 1.6 : 80 + (musicVolume - 50) * 0.4;
  return Math.round(level * (ambienceDucking ? 0.8 : 1));
}

function showMusicVolume() {
  const value = Math.round(musicVolume);
  musicVolumeInput.value = String(value);
  musicVolumeInput.style.setProperty("--volume-position", `${value}%`);
  musicVolumeOutput.textContent = `${value}%`;
  musicVolumeInput.setAttribute("aria-valuetext", value === 50 ? "50%, livello consigliato" : `${value}%`);
}

musicVolumeInput.addEventListener("input", () => {
  musicVolume = Math.max(0, Math.min(100, Number(musicVolumeInput.value)));
  showMusicVolume();
  try { localStorage.setItem("gyrowyn.musicVolume", String(musicVolume)); } catch (_) {}
  applyMusicState();
});
showMusicVolume();

window.addEventListener("diary-ambience", (event) => {
  ambienceDucking = Boolean(event.detail?.active);
  if (musicShouldPlay) sendMusicCommand("setVolume", [musicPlaybackVolume()]);
});

function startMusicMuted() {
  if (soundtrack.querySelector("iframe")) return;
  soundtrack.innerHTML = `<iframe title="Colonna sonora" width="1" height="1"
    src="https://www.youtube.com/embed/ZuRzTc9ytRc?autoplay=1&mute=1&loop=1&playlist=ZuRzTc9ytRc&controls=0&modestbranding=1&rel=0&enablejsapi=1"
    allow="autoplay; encrypted-media"></iframe>`;
  const frame = soundtrack.querySelector("iframe");
  frame.addEventListener("load", () => {
    frame.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "diary-music" }), "https://www.youtube.com");
    sendMusicCommand("mute");
    if (musicShouldPlay) {
      sendMusicCommand("seekTo", [0, true]);
      applyMusicState();
    }
  }, { once: true });
}

// Apply the current slider value once the embedded player is ready as well.
window.addEventListener("message", (event) => {
  if (event.origin !== "https://www.youtube.com" || event.source !== soundtrack.querySelector("iframe")?.contentWindow) return;
  let data = event.data;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch (_) { return; } }
  if (data?.event === "onReady" && musicShouldPlay) applyMusicState();
});

function releaseMusic() {
  if (musicShouldPlay) return;
  musicShouldPlay = true;
  sendMusicCommand("stopVideo");
  sendMusicCommand("seekTo", [0, true]);
  [90, 420, 980].forEach((delay) => {
    motion.after(applyMusicState, delay);
  });
}

async function openRevealedDiary() {
  if (opened || openingDiary) return;
  openingDiary = true;
  await prepareAssets(index);
  await new Promise((resolve) => motion.after(resolve));
  opened = true;
  applyResize();
  document.body.classList.add("opening");
  render({ reveal: true, extraDelay: 0.5 });
  releaseMusic();
  motion.after(() => {
    document.body.classList.remove("opening", "wand-arriving", "wand-leaving", "spell-cast");
    document.body.classList.add("opened");
    sealedCover.removeAttribute("aria-busy");
  }, motion.reduced() ? 0 : 1250);
}

let openingDiary = false;
function beginRevelio() {
  if (opened || revealing) return;
  revealing = true;
  openDiary.disabled = true;
  sealedCover.setAttribute("aria-busy", "true");
  // Unlock sound within the click. Its load/play result never gates the visuals.
  try { window.DIARY_SOUNDS?.unlock(); } catch (_) {}
  startMusicMuted();
  revelioVoice.currentTime = 0;
  revelioVoice.volume = 0.28;
  revelioVoice.muted = muted;
  revelioVoice.play()?.catch(() => {});

  const wand = document.querySelector(".ritual-wand");
  const ready = wand?.complete && wand.naturalWidth ? Promise.resolve() : loadImage("assets/revelio-wand-v1.webp");
  ready.then(() => {
    motion.after(() => {
      document.body.classList.add("wand-arriving");
      motion.after(() => document.body.classList.add("spell-cast"), motion.reduced() ? 0 : 900);
      motion.after(() => document.body.classList.add("wand-leaving"), motion.reduced() ? 0 : 1700);
      // A single visual timeline, independent of blocked, delayed or missing audio.
      motion.after(openRevealedDiary, motion.reduced() ? 100 : 7400);
    });
  });
}

sealedCover.addEventListener("pointermove", (event) => {
  if (revealing) return;
  const bounds = sealedCover.getBoundingClientRect();
  sealedCover.style.setProperty("--mx", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
  sealedCover.style.setProperty("--my", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
});

sealedCover.addEventListener("pointerleave", () => {
  sealedCover.style.removeProperty("--mx");
  sealedCover.style.removeProperty("--my");
});

openDiary.addEventListener("click", beginRevelio);

soundToggle.addEventListener("click", () => {
  muted = !muted;
  soundToggle.classList.toggle("muted", muted);
  soundToggle.setAttribute("aria-pressed", String(muted));
  soundToggle.setAttribute("aria-label", muted ? "Attiva audio" : "Disattiva audio");
  applyMusicState();
  window.DIARY_SOUNDS?.setMuted(muted);
  revelioVoice.muted = muted;
});

prev.addEventListener("click", () => turn(-1));
next.addEventListener("click", () => turn(1));

document.addEventListener("keydown", (event) => {
  if (!opened) return;
  if (event.target.closest("input,button,select,textarea,[contenteditable=true]")) return;
  if (event.target.closest(".needs-scroll .prose") && ["PageDown", "PageUp"].includes(event.key)) return;
  if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); turn(1); }
  if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); turn(-1); }
});

let pageGesture = null;
reader.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button,input,a") || !event.isPrimary) return;
  const prose = event.target.closest(".prose");
  pageGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, prose, scrollTop: prose?.scrollTop };
});
reader.addEventListener("pointerup", (event) => {
  const gesture = pageGesture;
  pageGesture = null;
  if (!gesture || gesture.id !== event.pointerId || window.getSelection()?.isCollapsed === false) return;
  const distance = event.clientX - gesture.x;
  const vertical = event.clientY - gesture.y;
  if (Math.abs(vertical) > 14 || (gesture.prose && gesture.prose.scrollTop !== gesture.scrollTop)) return;
  if (Math.abs(distance) > 48 && Math.abs(distance) > Math.abs(vertical) * 1.5) turn(distance < 0 ? 1 : -1);
  else if (!mobile && Math.abs(distance) < 10 && event.clientX > innerWidth * 0.73) turn(1);
  else if (!mobile && Math.abs(distance) < 10 && event.clientX < innerWidth * 0.27) turn(-1);
});
reader.addEventListener("pointercancel", () => { pageGesture = null; });

let resizeTimer = 0;
function applyResize() {
  if (busy || (revealing && !opened)) return;
  const nowMobile = matchMedia("(max-width:760px)").matches;
  if (nowMobile !== mobile) {
    const logicalPage = mobile ? index : Math.min(pages.length - 1, index * 2);
    mobile = nowMobile;
    index = mobile ? logicalPage : Math.floor(logicalPage / 2);
    render();
    queueVisiblePageSound({ delay: 0, playAccent: false });
    return;
  }
  [leftLeaf, rightLeaf].forEach((leaf) => leaf.querySelectorAll(".ink-page").forEach(fitPageText));
}
addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(applyResize, 120);
});

if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    leftLeaf.querySelectorAll(".ink-page").forEach(fitPageText);
    rightLeaf.querySelectorAll(".ink-page").forEach(fitPageText);
  });
}

window.addEventListener("diary-motion-preference", () => {
  stopPageRain();
  [leftLeaf, rightLeaf].forEach((leaf) => {
    const inner = leaf.querySelector(".ink-page");
    if (inner && !inner.classList.contains("ink-vanishing")) settleInk(leaf);
  });
});

let resumeVoice = false;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    resumeVoice = !revelioVoice.paused && !revelioVoice.ended;
    if (resumeVoice) revelioVoice.pause();
    if (musicShouldPlay) sendMusicCommand("pauseVideo");
  } else {
    if (resumeVoice) revelioVoice.play()?.catch(() => {});
    resumeVoice = false;
    if (musicShouldPlay) applyMusicState();
  }
});

render();
