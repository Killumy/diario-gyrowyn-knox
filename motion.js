// One foreground clock keeps CSS effects and scripted cues together after a tab switch.
(() => {
  const tasks = new Map();
  const tracked = new Set();
  let serial = 0;
  let alarm = 0;
  let pausedAt = document.hidden ? performance.now() : null;
  let pausedTime = 0;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const now = () => (pausedAt ?? performance.now()) - pausedTime;

  function arm() {
    window.clearTimeout(alarm);
    if (pausedAt !== null || !tasks.size) return;
    const deadline = Math.min(...Array.from(tasks.values(), (task) => task.at));
    alarm = window.setTimeout(flush, Math.max(0, deadline - now()));
  }

  function flush() {
    if (pausedAt !== null) return;
    const time = now();
    for (const [id, task] of Array.from(tasks)) {
      if (!tasks.has(id) || task.at > time) continue;
      tasks.delete(id);
      task.run();
    }
    arm();
  }

  function after(run, delay = 0) {
    const id = ++serial;
    tasks.set(id, { run, at: now() + Math.max(0, delay) });
    arm();
    return id;
  }

  function cancel(id) {
    tasks.delete(id);
    arm();
  }

  function track(animation) {
    tracked.add(animation);
    if (document.hidden) animation.pause();
    animation.finished.then(() => tracked.delete(animation), () => tracked.delete(animation));
    return animation;
  }

  function visibilityChanged() {
    document.documentElement.classList.toggle('diary-paused', document.hidden);
    if (document.hidden) {
      if (pausedAt === null) pausedAt = performance.now();
      window.clearTimeout(alarm);
      tracked.forEach((animation) => {
        if (animation.playState === 'running') animation.pause();
      });
    } else {
      if (pausedAt !== null) pausedTime += performance.now() - pausedAt;
      pausedAt = null;
      tracked.forEach((animation) => {
        if (animation.playState === 'paused') animation.play();
      });
      arm();
    }
  }

  preference.addEventListener?.('change', () => window.dispatchEvent(new Event('diary-motion-preference')));
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('pageshow', visibilityChanged);
  visibilityChanged();
  window.DIARY_MOTION = { after, cancel, track, reduced: () => preference.matches };
})();
