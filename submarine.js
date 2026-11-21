(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const canvas = $("oceanCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, R = 19;
  let running = false, paused = false, stopRequested = false, runPromise = null;
  let placementMode = "goal", score = 0, frame = 0;
  let lastLog = "";
  let world;

  function resetWorld() {
    score = 0; frame = 0;
    world = {
      x: 125, y: 270, vx: 0, vy: 0,
      goal: {x: 855, y: 245},
      obstacles: [
        {x: 345, y: 155, w: 66, h: 118},
        {x: 545, y: 320, w: 92, h: 82},
        {x: 735, y: 120, w: 62, h: 130}
      ],
      hull: 100, water: 0, temperature: 25, collisionFlash: 0
    };
    updateMetrics({});
    draw();
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function addLog(message, type) {
    const log = $("simLog");
    const placeholder = log.querySelector(".placeholder");
    if (placeholder) placeholder.remove();
    const row = document.createElement("div");
    row.className = "log-line " + (type || "");
    row.textContent = message;
    log.appendChild(row);
    while (log.children.length > 130) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  function setStatus(message, active) {
    $("simStatus").textContent = message;
    $("simStatusDot").parentElement.classList.toggle("running", Boolean(active));
  }
  function distanceToRect(px, py, rect) {
    const qx = clamp(px, rect.x, rect.x + rect.w);
    const qy = clamp(py, rect.y, rect.y + rect.h);
    const dx = px - qx, dy = py - qy;
    return {distance:Math.hypot(dx,dy), dx, dy, cx:rect.x+rect.w/2, cy:rect.y+rect.h/2};
  }
  function nearestObstacle() {
    let best = {distance:Infinity, cy:world.y};
    for (const rect of world.obstacles) {
      const hit = distanceToRect(world.x, world.y, rect);
      if (hit.distance < best.distance) best = {...hit, rect};
    }
    return best;
  }

  function updateSensors(vars) {
    const nearest = nearestObstacle();
    vars.distFromSeaFloor = Math.max(0, (H - 30 - world.y - R) / 5);
    vars.distFromWaterSurface = Math.max(0, (world.y - 30 - R) / 5);
    vars.distFromGoal = Math.hypot(world.goal.x-world.x, world.goal.y-world.y) / 5;
    vars.distFromObstacle = Math.min(300, nearest.distance / 5);
    vars.motionUp = clamp(Math.max(0,-world.vy) / 4,0,1);
    vars.motionDown = clamp(Math.max(0,world.vy) / 4,0,1);
    vars.motionForward = clamp(Math.max(0,world.vx) / 4,0,1);
    vars.motionBack = clamp(Math.max(0,-world.vx) / 4,0,1);
    vars.hullIntegrity = world.hull;
    vars.waterLevel = world.water;
    vars.engineTemperature = world.temperature;
  }

  function updateMetrics(vars) {
    $("scoreMetric").textContent = String(score);
    $("hullMetric").textContent = Math.round(world.hull) + "%";
    $("waterMetric").textContent = Math.round(world.water) + "%";
    $("tempMetric").textContent = Math.round(world.temperature) + "°";
    $("modeMetric").textContent = !running ? "Standby" : paused ? "Paused" : world.hull < 30 || world.water > 60 ? "Emergency" : "Active";
    $("forwardReadout").textContent = Number(vars.forwardPower || 0).toFixed(2);
    $("reverseReadout").textContent = Number(vars.reversePower || 0).toFixed(2);
    $("riseReadout").textContent = Number(vars.risePower || 0).toFixed(2);
    $("diveReadout").textContent = Number(vars.divePower || 0).toFixed(2);
    $("turnReadout").textContent = Number(vars.turnPower || 0).toFixed(2);
  }

  function simulationFrame(vars, seconds) {
    if (paused) {
      while (paused && !stopRequested) awaitPause();
    }
    if (stopRequested) return;
    const dt = clamp(seconds || 0.05, 0.01, 0.1);
    if (vars.goalReached === true) {
      score++;
      world.goal = {x:clamp(560+Math.random()*390,570,W-45),y:clamp(75+Math.random()*390,70,H-65)};
      addLog("Goal reached. Neural reward recorded.", "good");
    }
    const forward = clamp(Number(vars.forwardPower)||0,0,1);
    const reverse = clamp(Number(vars.reversePower)||0,1);
    const rise = clamp(Number(vars.risePower)||0,0,1);
    const dive = clamp(Number(vars.divePower)||0,0,1);
    const turn = clamp(Number(vars.turnPower)||0,0,1);
    const nearest = nearestObstacle();

    world.vx += (forward - reverse) * 1.35 * dt * 12;
    world.vy += (dive - rise) * 1.05 * dt * 12;
    if (nearest.distance < 125 && turn > 0.12) {
      world.vy += (nearest.cy < world.y ? 1 : -1) * turn * 1.15 * dt * 12;
    }
    world.vx *= 0.985; world.vy *= 0.985;
    const speed = Math.hypot(world.vx,world.vy);
    if (speed > 3.8) { world.vx *= 3.8/speed; world.vy *= 3.8/speed; }
    world.x += world.vx * dt * 60;
    world.y += world.vy * dt * 60;
    world.x = clamp(world.x,35,W-35);

    if (world.y < 48 || world.y > H-48) {
      world.y = clamp(world.y,48,H-48);
      world.vy *= -0.45;
      world.hull = Math.max(0,world.hull-0.12);
    }
    let collided = false;
    for (const rect of world.obstacles) {
      const hit = distanceToRect(world.x,world.y,rect);
      if (hit.distance < R) {
        const nx = hit.distance > 0 ? hit.dx/hit.distance : (world.x < hit.cx ? -1 : 1);
        const ny = hit.distance > 0 ? hit.dy/hit.distance : (world.y < hit.cy ? -1 : 1);
        world.x += nx * (R-hit.distance+1);
        world.y += ny * (R-hit.distance+1);
        world.vx *= -0.45; world.vy *= -0.55;
        collided = true;
      }
    }
    if (collided && frame % 12 === 0) {
      world.hull = Math.max(0,world.hull-3.5);
      world.water = Math.min(100,world.water+5);
      world.collisionFlash = 1;
      addLog("Impact detected by the simulated hull sensors.", "error");
    }
    world.water = clamp(world.water - (Number(vars.bilgePower)||0) * 2.2 * dt * 12,0,100);
    world.water = clamp(world.water + (Number(vars.floodControl)||0) * 0.8 * dt * 12,0,100);
    world.temperature = clamp(world.temperature + (forward+reverse+rise+dive)*0.035 - 0.018,25,120);
    world.collisionFlash *= 0.9;
    frame++;
    updateSensors(vars);
    updateMetrics(vars);
    draw();
  }
  function awaitPause() {
    return new Promise(resolve => setTimeout(resolve, 50));
  }

  function draw() {
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,"#0b4964"); g.addColorStop(.55,"#0b344d"); g.addColorStop(1,"#071e31");
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.save();
    for(let i=0;i<34;i++){
      const x=(i*173+frame*.16)%W, y=(i*89+Math.sin(frame*.012+i)*8)%H;
      ctx.strokeStyle="rgba(151,220,235,.12)";ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(x,y,2+(i%3),0,Math.PI*2);ctx.stroke();
    }
    ctx.fillStyle="#0b2735";ctx.fillRect(0,0,W,30);
    ctx.fillStyle="#244b54";ctx.fillRect(0,H-30,W,30);
    ctx.fillStyle="#3c7780";ctx.fillRect(0,H-32,W,3);
    ctx.fillStyle="rgba(118,211,229,.75)";ctx.fillRect(0,29,W,2);
    ctx.setLineDash([5,8]);ctx.strokeStyle="rgba(150,217,228,.16)";
    ctx.beginPath();ctx.moveTo(0,280);ctx.lineTo(W,280);ctx.stroke();ctx.setLineDash([]);
    for(const rect of world.obstacles){
      ctx.fillStyle="#344653";ctx.strokeStyle="#6b8c96";ctx.lineWidth=2;
      ctx.beginPath();ctx.roundRect(rect.x,rect.y,rect.w,rect.h,8);ctx.fill();ctx.stroke();
      ctx.fillStyle="rgba(158,190,197,.16)";
      for(let y=rect.y+12;y<rect.y+rect.h-5;y+=19){ctx.fillRect(rect.x+8,y,rect.w-16,2);}
    }
    const goal=world.goal;
    ctx.strokeStyle="#7ee6b6";ctx.lineWidth=2;ctx.setLineDash([7,5]);
    ctx.beginPath();ctx.arc(goal.x,goal.y,19+Math.sin(frame*.08)*3,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle="#7ee6b6";ctx.beginPath();ctx.arc(goal.x,goal.y,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#b4f2d4";ctx.font="11px ui-monospace";ctx.fillText("TARGET",goal.x-21,goal.y-29);
    ctx.save();ctx.translate(world.x,world.y);
    ctx.rotate(clamp(world.vy*.09,-.32,.32));
    ctx.fillStyle=world.collisionFlash>.2?"#ff8d8d":"#a6d4df";
    ctx.strokeStyle="#e0f7f8";ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(0,0,30,15,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle="#4b7888";ctx.beginPath();ctx.moveTo(-5,-10);ctx.lineTo(-14,-22);ctx.lineTo(5,-13);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(-5,10);ctx.lineTo(-14,22);ctx.lineTo(5,13);ctx.closePath();ctx.fill();
    ctx.fillStyle="#d9f5f6";ctx.beginPath();ctx.ellipse(15,-2,7,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#3b8294";ctx.beginPath();ctx.ellipse(17,-2,4,4,0,0,Math.PI*2);ctx.fill();
    if(Math.hypot(world.vx,world.vy)>.5){
      ctx.strokeStyle="rgba(141,226,235,.55)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-30,0);ctx.lineTo(-48-Math.random()*8,0);ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle="#d5eaf0";ctx.font="12px ui-monospace";ctx.fillText("NEXIUS SUBMARINE",world.x-49,world.y-34);
    ctx.restore();
    ctx.fillStyle="rgba(5,15,24,.65)";ctx.fillRect(12,12,145,27);
    ctx.fillStyle="#b8dce6";ctx.font="11px ui-monospace";ctx.fillText("DEPTH SIMULATION",22,30);
    ctx.restore();
  }

  async function start() {
    if (running) return;
    stopRequested=false;paused=false;running=true;
    $("startBtn").disabled=true;$("pauseBtn").disabled=false;$("stopBtn").disabled=false;
    $("pauseBtn").textContent="Pause";
    setStatus("Loading Nexius program…",true);
    try {
      const response=await fetch("SubmarineAI.nexius",{cache:"no-store"});
      if(!response.ok)throw new Error("Could not load SubmarineAI.nexius ("+response.status+").");
      const source=await response.text();
      const compiled=NexiusCompiler.compile(source);
      addLog("Compiled SubmarineAI.nexius · "+compiled.instructionCount+" statements.","good");
      setStatus("Running",true);
      runPromise=NexiusCompiler.run(compiled,{
        output:value=>{
          const message=String(value);
          if(message.startsWith("Neural model SubmarineAI ran"))return;
          if(message!==lastLog){addLog(message);lastLog=message;}
        },
        clear:()=>{$("simLog").replaceChildren();lastLog="";},
        isStopped:()=>stopRequested,
        onFrame:async(vars,seconds)=>simulationFrame(vars,seconds)
      },{maxSteps:1000000});
      await runPromise;
      if(stopRequested)addLog("Simulation stopped.");
      setStatus(stopRequested?"Stopped":"Program finished",false);
    } catch(error) {
      addLog((error.line?"Line "+error.line+": ":"")+error.message,"error");
      setStatus("Runtime / compiler error",false);
    } finally {
      running=false;paused=false;runPromise=null;
      $("startBtn").disabled=false;$("pauseBtn").disabled=true;$("stopBtn").disabled=true;
      $("pauseBtn").textContent="Pause";
      updateMetrics({});
    }
  }

  $("startBtn").addEventListener("click",start);
  $("pauseBtn").addEventListener("click",()=>{
    if(!running)return;
    paused=!paused;
    $("pauseBtn").textContent=paused?"Resume":"Pause";
    setStatus(paused?"Paused":"Running",!paused);
    updateMetrics({});
  });
  $("stopBtn").addEventListener("click",()=>{stopRequested=true;paused=false;});
  $("resetBtn").addEventListener("click",()=>{
    if(running){stopRequested=true;paused=false;}
    resetWorld();addLog("Environment reset.");
  });
  $("goalModeBtn").addEventListener("click",()=>{
    placementMode="goal";$("goalModeBtn").classList.add("active");$("obstacleModeBtn").classList.remove("active");
  });
  $("obstacleModeBtn").addEventListener("click",()=>{
    placementMode="obstacle";$("obstacleModeBtn").classList.add("active");$("goalModeBtn").classList.remove("active");
  });
  canvas.addEventListener("click",event=>{
    const rect=canvas.getBoundingClientRect();
    const x=(event.clientX-rect.left)*W/rect.width;
    const y=(event.clientY-rect.top)*H/rect.height;
    if(placementMode==="goal"){
      world.goal={x:clamp(x,55,W-45),y:clamp(y,55,H-55)};
      addLog("Target repositioned.");
    }else{
      world.obstacles.push({x:clamp(x-28,40,W-100),y:clamp(y-28,45,H-100),w:56,h:56});
      addLog("Obstacle added to the environment.");
    }
    draw();
  });
  $("clearLogBtn").addEventListener("click",()=>{$("simLog").replaceChildren();lastLog="";});
  resetWorld();
})();
