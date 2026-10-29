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
  let action = 'idle', phase = 'walk', row = 4, frame = 0, x = 0, origin = 0, target = 0, direction = -1;
  let start = performance.now(), raf = 0, destroyed = false, lastDraw = '', lastState = '';
  let lastTick = start, turnUntil = 0;
  const walkSpeed = 34;
  const maxX = () => Math.max(0, stage.clientWidth - actor.offsetWidth);
  const clamp = value => Math.max(0, Math.min(maxX(), value));
  const routeLift = value => { const p = maxX() ? clamp(value) / maxX() : 0; return 8 * (1 - p) + 3 * Math.sin(Math.PI * p); };
  const snapshot = () => ({ action, phase, row, frame, busy: action !== 'idle', x, direction, dialogue: status.textContent, character: pet.id });
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
    const lift = routeLift(x);
    actor.style.left = Math.round(x) + 'px';
    actor.style.transform = `translateY(${-lift.toFixed(2)}px) scaleX(${direction})`;
    bubble.style.bottom = (actor.offsetWidth + lift + 3) + 'px';
    bubble.style.maxWidth = Math.max(1, stage.clientWidth - 16) + 'px';
    const half = bubble.offsetWidth / 2;
    bubble.style.left = Math.round(Math.max(half + 8, Math.min(stage.clientWidth - half - 8, x + actor.offsetWidth / 2))) + 'px';
    treat.style.left = Math.round(clamp(target) + actor.offsetWidth * (direction > 0 ? 0.8 : 0.2)) + 'px';
    treat.style.bottom = (routeLift(target) + 4) + 'px';
  }
  function tick(now) {
    if (destroyed || document.hidden) return;
    // Ignore time spent in a hidden tab; normal motion uses frame deltas so an
    // interaction can finish anywhere on the path without snapping to a start.
    const delta = Math.max(0, Math.min(100, now - lastTick));
    lastTick = now;
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
        const progress = (elapsed - 1600) / 2000;
        x = reducedMotion.matches ? origin : origin + Math.sin(progress * Math.PI) * (target - origin);
        direction = (target >= origin ? 1 : -1) * (progress < 0.5 ? 1 : -1);
      } else { x = origin; draw(3, elapsed, 200); }
      if (elapsed >= timing.danceMs) { action = 'idle'; start = now; }
    } else if (action === 'hello') {
      phase = words = 'hello'; draw(elapsed < 1200 ? 2 : 3, elapsed, 200);
      if (elapsed >= timing.helloMs) { action = 'idle'; start = now; }
    }
    if (action === 'idle') {
      words = 'idle';
      if (reducedMotion.matches || !maxX()) {
        phase = 'sleep'; draw(6, now - start, 420);
      } else if (now < turnUntil) {
        phase = 'turn'; draw(2, now - start, 200);
      } else {
        phase = 'walk';
        x = clamp(x + direction * walkSpeed * delta / 1000);
        if ((x <= 0 && direction < 0) || (x >= maxX() && direction > 0)) {
          direction *= -1;
          turnUntil = now + 650;
        }
        draw(4, now - start, 100);
      }
    }
    const dialogue = action === 'idle' && !reducedMotion.matches ? '原来的小猫：沿着发票底部散步，喵。' : pet.profile.dialogue[words];
    const visibleDialogue = action === 'idle' ? '' : dialogue;
    if (bubble.textContent !== visibleDialogue) bubble.textContent = visibleDialogue;
    if (status.textContent !== dialogue) status.textContent = dialogue;
    place();
    const stateKey = action + ':' + phase + ':' + direction;
    if (stateKey !== lastState) { lastState = stateKey; onState?.(snapshot()); }
    raf = requestAnimationFrame(tick);
  }
  function tickStart() { cancelAnimationFrame(raf); lastTick = performance.now(); tick(lastTick); }
  function run(next) {
    if (destroyed || action !== 'idle') return false;
    action = next; start = performance.now(); origin = x;
    target = clamp(x + direction * 46);
    if (Math.abs(target - x) < 16) { direction *= -1; target = clamp(x + direction * 46); }
    turnUntil = 0; treat.textContent = pet.profile.foodEmoji;
    tickStart(); return true;
  }
  function reset() { if (destroyed) return; action = 'idle'; start = performance.now(); turnUntil = 0; treat.hidden = true; tickStart(); }
  function visibility() { if (document.hidden) cancelAnimationFrame(raf); else tickStart(); }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('resize', place);
  // The card can resize when its skin or surrounding panels change, even when
  // the browser window stays the same size.
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
  observer?.observe(stage);
  x = Math.round(maxX() * 0.65); reset();
  return { feed: () => run('feed'), dance: () => run('dance'), hello: () => run('hello'), reset, getState: snapshot,
    destroy() {
      destroyed = true; cancelAnimationFrame(raf); treat.hidden = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('resize', place);
    },
  };
}
