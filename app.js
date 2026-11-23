const $ = id => document.getElementById(id);
const video = $("video");
let stream = null, currentLocation = null, motionTimer = null, previousFrame = null;
let motionHits = 0, lastAlertAt = 0;
let events = [];
try { events = JSON.parse(localStorage.getItem("vigiaEvents") || "[]"); if (!Array.isArray(events)) events=[]; } catch (_) { events=[]; }

function setStatus(title, detail) {$("systemStatus").textContent=title;$("statusDetail").textContent=detail;}
function renderHistory() {
  $("eventCount").textContent=events.length;$("exportData").disabled=!events.length;$("clearData").disabled=!events.length;
  const area=$("history");
  if(!events.length){area.className="history-empty";area.textContent="Todavía no hay observaciones guardadas.";return;}
  area.className="";area.replaceChildren();
  events.slice().reverse().forEach(item=>{
    const article=document.createElement("article");article.className="event";
    const title=document.createElement("strong");title.textContent=item.category;
    const time=document.createElement("small");time.textContent=(item.date||"Fecha desconocida")+(item.coords?" · GPS "+item.coords:" · Sin GPS");
    const note=document.createElement("p");note.textContent=item.notes||"Sin notas adicionales.";
    article.append(title,time,note);
    if(item.photo){const img=document.createElement("img");img.src=item.photo;img.alt="Fotografía de evidencia";article.append(img);}
    area.append(article);
  });
}
function persist(){try{localStorage.setItem("vigiaEvents",JSON.stringify(events));renderHistory();}catch(e){alert("Almacenamiento lleno. Exporta tus evidencias y elimina algunos registros antiguos.");}}
function addEvent(category,notes,photo=null){
  events.push({id:String(Date.now())+"-"+Math.random().toString(16).slice(2),category,notes,photo,date:new Date().toLocaleString(),coords:currentLocation?`${currentLocation.lat.toFixed(6)}, ${currentLocation.lon.toFixed(6)}`:null});
  persist();
}
$("startCamera").addEventListener("click",async()=>{
  if(!navigator.mediaDevices?.getUserMedia){alert("La cámara necesita HTTPS. Abre VIGÍA desde GitHub Pages.");return;}
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    video.srcObject=stream;video.style.display="block";$("cameraPlaceholder").style.display="none";$("takePhoto").disabled=false;$("toggleMotion").disabled=false;$("startCamera").textContent="Cámara activa";
    setStatus("Observación activa","Cámara trasera encendida en este dispositivo.");
  }catch(e){alert("No se pudo abrir la cámara. Revisa los permisos de Chrome.");}
});
$("takePhoto").addEventListener("click",()=>{
  if(!video.videoWidth)return;
  const canvas=$("photoCanvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext("2d").drawImage(video,0,0);
  addEvent("Fotografía de observación","Captura manual desde cámara.",canvas.toDataURL("image/jpeg",0.68));
});
$("getLocation").addEventListener("click",()=>{
  if(!navigator.geolocation){$("gpsStatus").textContent="GPS no disponible";return;}
  $("gpsStatus").textContent="Buscando ubicación…";
  navigator.geolocation.getCurrentPosition(pos=>{
    currentLocation={lat:pos.coords.latitude,lon:pos.coords.longitude};
    const c=`${currentLocation.lat.toFixed(6)}, ${currentLocation.lon.toFixed(6)}`;
    $("gpsStatus").textContent="Ubicación obtenida";$("coordinates").textContent=c+` · Precisión aprox. ${Math.round(pos.coords.accuracy)} m`;
    $("mapLink").hidden=false;$("openMap").href=`https://www.openstreetmap.org/?mlat=${currentLocation.lat}&mlon=${currentLocation.lon}#map=16/${currentLocation.lat}/${currentLocation.lon}`;
  },()=>{$("gpsStatus").textContent="No se pudo obtener la ubicación";$("coordinates").textContent="Comprueba permisos y activa la ubicación del teléfono.";},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
});
$("saveObservation").addEventListener("click",()=>{addEvent($("category").value,$("notes").value.trim());$("notes").value="";alert("Observación guardada en este dispositivo.");});

function motionStep(){
  if(!video.videoWidth||video.readyState<2)return;
  const c=document.createElement("canvas");c.width=96;c.height=54;
  const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(video,0,0,c.width,c.height);
  const pixels=ctx.getImageData(0,0,c.width,c.height).data;
  const gray=new Uint8Array(c.width*c.height);
  for(let i=0,j=0;i<pixels.length;i+=4,j++)gray[j]=(pixels[i]*3+pixels[i+1]*4+pixels[i+2])/8;
  if(previousFrame){
    let changed=0,total=gray.length;
    for(let i=0;i<total;i++)if(Math.abs(gray[i]-previousFrame[i])>34)changed++;
    const ratio=changed/total;
    if(ratio>0.075)motionHits++;else motionHits=Math.max(0,motionHits-1);
    if(motionHits>=3&&Date.now()-lastAlertAt>15000){
      lastAlertAt=Date.now();motionHits=0;
      $("motionStatus").textContent="¡Cambio de imagen detectado!";
      $("motionDetail").textContent="Revisa la cámara: puede ser cualquier movimiento o cambio de luz.";
      setStatus("Revisar movimiento","Aviso experimental: no identifica qué objeto se movió.");
      if(navigator.vibrate)navigator.vibrate([120,80,120]);
    } else if(ratio<=0.075){
      $("motionStatus").textContent="Observando cambios de imagen";
      $("motionDetail").textContent="Sin cambio notable en este instante.";
    }
  }
  previousFrame=gray;
}
$("toggleMotion").addEventListener("click",()=>{
  if(motionTimer){clearInterval(motionTimer);motionTimer=null;previousFrame=null;motionHits=0;$("toggleMotion").textContent="Activar aviso";$("motionStatus").textContent="Análisis de movimiento apagado";$("motionDetail").textContent="No identifica drones; solo compara cambios entre imágenes.";return;}
  motionHits=0;previousFrame=null;lastAlertAt=0;motionTimer=setInterval(motionStep,650);
  $("toggleMotion").textContent="Desactivar aviso";$("motionStatus").textContent="Analizando cambios de imagen";$("motionDetail").textContent="Aviso activo. Mantén el celular estable para reducir falsas alarmas.";
});
$("exportData").addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify({app:"VIGÍA C-UAS",version:"V6",exportedAt:new Date().toISOString(),events},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="vigia_v6_evidencias.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$("clearData").addEventListener("click",()=>{if(confirm("¿Borrar todas las observaciones y fotografías guardadas en este dispositivo? Esta acción no se puede deshacer.")){events=[];persist();}});
function tick(){$("clock").textContent=new Date().toLocaleTimeString();}
tick();setInterval(tick,1000);renderHistory();
if("serviceWorker"in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
