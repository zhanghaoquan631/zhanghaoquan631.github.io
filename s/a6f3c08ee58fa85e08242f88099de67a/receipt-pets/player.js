// A small pixel canvas is scaled by the browser with nearest-neighbour rendering.
// Each role keeps its original frame sequence; only the active role animates.
const images = new Map();
export function resolvePetProfile(pet,custom){
  const base=pet.profile;if(!custom||!custom.dialogue||!custom.timing)return base;
  const bounds={approachMs:[500,5000],eatMs:[1000,8000],happyMs:[500,5000],danceMs:[1000,10000],helloMs:[800,7000],idleCycleMs:[4000,60000]};
  if(Object.keys(base.dialogue).some(k=>typeof custom.dialogue[k]!=='string'||!custom.dialogue[k].trim()||Array.from(custom.dialogue[k]).length>80))return base;
  if(Object.entries(bounds).some(([k,[min,max]])=>!Number.isInteger(custom.timing[k])||custom.timing[k]<min||custom.timing[k]>max))return base;
  return {...base,dialogue:{...custom.dialogue},timing:{...custom.timing}};
}
export function loadDesktopPet(pet) {
  if (images.has(pet.id)) return images.get(pet.id);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('角色加载超时')); }, 15000);
    image.onload = () => { clearTimeout(timer); image.naturalWidth ? resolve(image) : reject(new Error('空图片')); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('角色图片暂时无法加载')); };
    image.src = pet.src;
  }).catch(error => { images.delete(pet.id); throw error; });
  images.set(pet.id, promise);
  if (images.size > 12) images.delete(images.keys().next().value);
  return promise;
}

export function mountDesktopPet({pet, image, actor, canvas, stage, bubble, treat, status, profile=pet.profile, onState}) {
  const size = pet.pixelSize;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  actor.style.position = bubble.style.position = treat.style.position = 'absolute';
  actor.style.bottom = '0px';
  canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;pointer-events:none';
  bubble.style.transform = 'translateX(-50%)';
  treat.style.bottom = '8px';
  treat.style.transform = 'translateX(-50%)';
  let persona=resolvePetProfile(pet,profile),words={...persona.dialogue},action='idle',phase='idle',frame=0,row=0;
  let raf = 0, destroyed = false, start = performance.now(), x = 0, fromX = 0, targetX = 0, lastDraw = '', lastState = '';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const dims = () => ({width:stage.clientWidth, size:actor.offsetWidth, max:Math.max(0,stage.clientWidth-actor.offsetWidth)});
  const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,n));
  const snapshot = () => ({action,phase,frame,row,busy:action!=='idle',x,dialogue:bubble.textContent,character:pet.id,timing:persona.timing,motionStyle:persona.motionStyle});
  function emit(){const key=action+':'+phase+':'+bubble.textContent;if(key!==lastState){lastState=key;status.textContent=bubble.textContent;onState?.(snapshot());}}
  function place(lift=0){const d=dims();x=clamp(x,0,d.max);actor.style.left=Math.round(x)+'px';actor.style.transform=`translateY(${-Math.round(lift)}px)`;bubble.style.bottom=(d.size+3)+'px';bubble.style.maxWidth=Math.max(1,d.width-16)+'px';bubble.style.left=Math.round(clamp(x+d.size/2,bubble.offsetWidth/2+8,Math.max(bubble.offsetWidth/2+8,d.width-bubble.offsetWidth/2-8)))+'px';}
  function draw(nextRow,elapsed,fps=6){
    row = nextRow;
    const valid = pet.frames[row]?.length ? pet.frames[row] : pet.frames.find(list=>list.length) || [0];
    if (!pet.frames[row]?.length) row = Math.max(0,pet.frames.findIndex(list=>list.length));
    frame = valid[motion.matches?0:Math.floor(elapsed*fps/1000)%valid.length];
    const key=row+':'+frame;
    if(key===lastDraw)return;lastDraw=key;
    ctx.clearRect(0,0,size,size);ctx.drawImage(image,frame*size,row*size,size,size,0,0,size,size);
  }
  function say(key){bubble.textContent=words[key]||'';}
  function movement(elapsed,celebrating=false){
    if(motion.matches)return {lift:0,sway:0};
    const style=persona.motionStyle,amplitude=persona.amplitude||1,tempo=elapsed*(persona.speed||1);
    const hop=persona.motion?.hopPx||5*amplitude,sway=persona.motion?.swayPx||4*amplitude;
    if(style==='hop'||style==='bounce')return {lift:Math.abs(Math.sin(tempo/190))*hop*(celebrating?1.5:1),sway:Math.sin(tempo/380)*sway};
    if(style==='float'||style==='hover'||style==='swim')return {lift:(Math.sin(tempo/420)+1)*hop*.5,sway:Math.sin(tempo/600)*sway};
    if(style==='prowl')return {lift:Math.abs(Math.sin(tempo/300))*amplitude,sway:Math.sin(tempo/700)*sway};
    if(style==='scuttle')return {lift:Math.abs(Math.sin(tempo/95))*amplitude,sway:Math.sin(tempo/160)*sway};
    if(style==='swagger')return {lift:Math.abs(Math.sin(tempo/330))*2*amplitude,sway:Math.sin(tempo/440)*sway*1.5};
    return {lift:Math.abs(Math.sin(tempo/260))*2*amplitude,sway:Math.sin(tempo/300)*sway};
  }
  function tick(now){
    if(destroyed||document.hidden)return;
    let elapsed=now-start,lift=0;const t=persona.timing,movementNow=movement(elapsed,action==='dance');
    if(action==='feed'){
      if(elapsed<t.approachMs){phase='approach';say('approach');x=fromX+(targetX-fromX)*Math.min(1,elapsed/t.approachMs);lift=movementNow.lift;draw(1,elapsed,7*persona.speed);}
      else if(elapsed<t.approachMs+t.eatMs){phase='eat';say('eat');x=targetX;draw(4,elapsed,5*persona.speed);}
      else if(elapsed<t.approachMs+t.eatMs+t.happyMs){phase='happy';say('happy');draw(6,elapsed,7*persona.speed);lift=movementNow.lift;}
      else{action='idle';phase='idle';start=now;say('idle');}
      treat.hidden=elapsed>=t.approachMs+t.eatMs;treat.style.left=Math.round(targetX+dims().size*.86)+'px';
    }else if(action==='dance'){
      phase='dance';say('dance');draw(['hop','bounce','hover','float'].includes(persona.motionStyle)?7:persona.motionStyle==='prowl'?4:persona.motionStyle==='scuttle'?2:6,elapsed,8*persona.speed);
      x=fromX+movementNow.sway;lift=movementNow.lift;
      if(elapsed>=t.danceMs){action='idle';phase='idle';start=now;say('idle');}
    }else if(action==='hello'){
      phase='hello';say('hello');draw(3,elapsed,6*persona.speed);lift=movementNow.lift*.3;
      if(elapsed>=t.helloMs){action='idle';phase='idle';start=now;say('idle');}
    }else{phase='idle';const cycle=elapsed%t.idleCycleMs,variation=cycle>t.idleCycleMs*.72;draw(variation?(persona.motionStyle==='prowl'?4:persona.motionStyle==='waddle'?5:8):0,elapsed,4*persona.speed);if(variation)lift=movementNow.lift*.3;say('idle');treat.hidden=true;}
    place(lift);emit();raf=requestAnimationFrame(tick);
  }
  function run(next){if(destroyed||action!=='idle')return false;action=phase=next;start=performance.now();fromX=x;targetX=clamp(x+Math.max(28,dims().width*.2),0,Math.max(0,dims().max-10));tickStart();return true;}
  function tickStart(){cancelAnimationFrame(raf);tick(performance.now());}
  function reset(){action=phase='idle';start=performance.now();treat.hidden=true;treat.textContent=persona.foodEmoji;say('idle');tickStart();}
  function visibility(){if(document.hidden)cancelAnimationFrame(raf);else tickStart();}
  function resize(){place();}
  document.addEventListener('visibilitychange',visibility);window.addEventListener('resize',resize);
  x=Math.round(dims().max*.2);reset();
  return {feed:()=>run('feed'),dance:()=>run('dance'),hello:()=>run('hello'),reset,getState:snapshot,
    setProfile(value){persona=resolvePetProfile(pet,value);words={...persona.dialogue};reset();},
    destroy(){destroyed=true;cancelAnimationFrame(raf);treat.hidden=true;actor.style.transform='';document.removeEventListener('visibilitychange',visibility);window.removeEventListener('resize',resize);}
  };
}
