// The original music-space cat has ten rows, unlike the nine-row imported pets.
// Keep its source frame map: row 6 sleeps, row 4 walks, row 2 stretches.
export function mountOriginalCat({ pet, image, actor, canvas, stage, bubble, treat, status, onState }) {
  const size = pet.pixelSize, context = canvas.getContext('2d');
  if (!context) throw new Error('无法显示小猫');
  canvas.width = canvas.height = size;
  context.imageSmoothingEnabled = false;
  canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;pointer-events:none';
  actor.style.position = bubble.style.position = treat.style.position = 'absolute';
  actor.style.bottom = '0px';
  bubble.style.transform = treat.style.transform = 'translateX(-50%)';
  treat.style.bottom = '4px';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const timing = pet.profile.timing;
  let action = 'idle', phase = 'sleep', row = 6, frame = 0, x = 0, origin = 0, target = 0;
  let start = performance.now(), raf = 0, destroyed = false, lastDraw = '', lastState = '';
  const maxX = () => Math.max(0, stage.clientWidth - actor.offsetWidth);
  const clamp = value => Math.max(0, Math.min(maxX(), value));
  const snapshot = () => ({ action, phase, row, frame, busy: action !== 'idle', x, dialogue: status.textContent, character: pet.id });
  function draw(nextRow, elapsed, duration) {
    row = nextRow;
    const frames = pet.frames[row];
    frame = frames[reducedMotion.matches ? 0 : Math.floor(elapsed / duration) % frames.length];
    const key = row + ':' + frame;
    if (key === lastDraw) return;
    lastDraw = key;
    context.clearRect(0, 0, size, size);
    context.drawImage(image, frame * size, row * size, size, size, 0, 0, size, size);
    // Match the original scene's inset: the top three pixels contain sheet artifacts.
    context.clearRect(0, 0, size, 3);
  }
  function place() {
    x = clamp(x);
    actor.style.left = Math.round(x) + 'px';
    actor.style.transform = '';
    bubble.style.bottom = (actor.offsetWidth + 3) + 'px';
    bubble.style.maxWidth = Math.max(1, stage.clientWidth - 16) + 'px';
    const half = bubble.offsetWidth / 2;
    bubble.style.left = Math.round(Math.max(half + 8, Math.min(stage.clientWidth - half - 8, x + actor.offsetWidth / 2))) + 'px';
    treat.style.left = Math.round(clamp(target) + actor.offsetWidth * 0.8) + 'px';
  }
  function tick(now) {
    if (destroyed || document.hidden) return;
    const elapsed = Math.max(0, now - start);
    let words = 'idle';
    treat.hidden = true;
    if (action === 'feed') {
      if (elapsed < timing.approachMs) {
        phase = words = 'approach';
        x = reducedMotion.matches ? target : origin + (target - origin) * elapsed / timing.approachMs;
        draw(4, elapsed, 80); treat.hidden = false;
      } else if (elapsed < timing.approachMs + timing.eatMs) {
        phase = words = 'eat'; x = target; draw(0, elapsed, 220); treat.hidden = false;
      } else if (elapsed < timing.approachMs + timing.eatMs + timing.happyMs) {
        phase = words = 'happy'; draw(2, elapsed, 200);
      } else { action = 'idle'; start = now; }
    } else if (action === 'dance') {
      phase = words = 'dance';
      if (elapsed < 1600) draw(2, elapsed, 200);
      else if (elapsed < 3600) {
        draw(4, elapsed, 80);
        x = reducedMotion.matches ? origin : origin + Math.sin((elapsed - 1600) / 2000 * Math.PI) * Math.min(48, maxX() - origin);
      } else { x = origin; draw(3, elapsed, 200); }
      if (elapsed >= timing.danceMs) { action = 'idle'; start = now; }
    } else if (action === 'hello') {
      phase = words = 'hello'; draw(elapsed < 1200 ? 2 : 3, elapsed, 200);
      if (elapsed >= timing.helloMs) { action = 'idle'; start = now; }
    }
    if (action === 'idle') {
      const idleElapsed = now - start, stirring = !reducedMotion.matches && idleElapsed % timing.idleCycleMs > timing.idleCycleMs - 2000;
      phase = stirring ? 'stretch' : 'sleep'; words = 'idle';
      draw(stirring ? 2 : 6, idleElapsed, stirring ? 200 : 420);
    }
    // A sleeping cat remains as unobtrusive as the original scene.
    const dialogue = pet.profile.dialogue[words];
    const visibleDialogue = action === 'idle' ? '' : dialogue;
    if (bubble.textContent !== visibleDialogue) bubble.textContent = visibleDialogue;
    if (status.textContent !== dialogue) status.textContent = dialogue;
    place();
    const stateKey = action + ':' + phase;
    if (stateKey !== lastState) { lastState = stateKey; onState?.(snapshot()); }
    raf = requestAnimationFrame(tick);
  }
  function tickStart() { cancelAnimationFrame(raf); tick(performance.now()); }
  function run(next) {
    if (destroyed || action !== 'idle') return false;
    action = next; start = performance.now(); origin = x;
    target = clamp(x + 46); treat.textContent = pet.profile.foodEmoji;
    tickStart(); return true;
  }
  function reset() { if (destroyed) return; action = 'idle'; start = performance.now(); treat.hidden = true; tickStart(); }
  function visibility() { if (document.hidden) cancelAnimationFrame(raf); else tickStart(); }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('resize', place);
  x = Math.round(maxX() * 0.65); reset();
  return { feed: () => run('feed'), dance: () => run('dance'), hello: () => run('hello'), reset, getState: snapshot,
    destroy() {
      destroyed = true; cancelAnimationFrame(raf); treat.hidden = true;
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('resize', place);
    },
  };
}
