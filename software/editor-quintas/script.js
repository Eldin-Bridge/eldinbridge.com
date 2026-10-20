'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('plano'), ctx = canvas.getContext('2d');
  const menus = [...document.querySelectorAll('.herramientas details')];
  const closeMenus = () => menus.forEach(menu => { menu.open = false; });
  menus.forEach(menu => menu.addEventListener('toggle', () => {
    if (menu.open) menus.forEach(other => { if (other !== menu) other.open = false; });
  }));
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.herramientas')) closeMenus();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const current = menus.find(menu => menu.open); closeMenus(); current?.querySelector('summary').focus(); }
  });
  const materials = {pasto:'#70b85f', tierra:'#b18a60', piso:'#b7bcc4', vitropiso:'#fff', agua:'#279ed6'};
  const names = {pasto:'Pasto', tierra:'Tierra', piso:'Piso', vitropiso:'Vitropiso blanco / negro', agua:'Agua', borrar:'Borrador'};
  const defaults = {pared:[3,.2,.2], puerta:[1,.2,.6], ventana:[1.2,.2,.3], arbol:[2,2,.5], palapa:[4,4,1], casa:[6,8,2], alberca:[3,5,1]};
  const storageKey = 'editor-quintas-v2', unit = .25, margin = 56;
  let state = {version:2,width:35,length:65,step:1,cells:[],objects:[]};
  let cells = new Map(), undo = [], redo = [], selected = null, drag = null;
  let mode = 'brush', material = 'pasto', zoom = 1, scale = 10, showGrid = true, showCotas = true;
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const round = n => Math.round(n*100)/100;
  const fmt = n => Number(n.toFixed(2)).toLocaleString('es-MX');
  const say = message => { $('estado').textContent = message; };
  const project = () => ({...state,cells:[...cells],objects:state.objects.map(o=>({...o}))});
  const serialize = () => JSON.stringify(project());
  function restore(p) { state = JSON.parse(JSON.stringify(p)); cells = new Map(state.cells); selected = null; sync(); }
  function commit(before) {
    if (before !== serialize()) { undo.push(before); if(undo.length>40) undo.shift(); redo=[]; }
    sync(); render();
  }
  function action(fn) { if(drag) return; const before=serialize(); fn(); commit(before); }
  function bounds(o) { return {x:o.x,y:o.y,w:o.rotation===90?o.h:o.w,h:o.rotation===90?o.w:o.h}; }
  function fits(o,w=state.width,h=state.length) {const b=bounds(o);return b.x>=0&&b.y>=0&&b.x+b.w<=w+1e-8&&b.y+b.h<=h+1e-8;}
  function sync() {
    $('ancho').value=state.width; $('largo').value=state.length; $('tamCelda').value=state.step;
    $('deshacer').disabled=!undo.length; $('rehacer').disabled=!redo.length;
    $('eliminarObjeto').disabled=!selected;
    $('seleccionInfo').textContent=selected?'Objeto seleccionado. Arrastra o edita sus medidas.':'Sin objeto seleccionado.';
    $('aplicarObjeto').textContent=selected?'Aplicar cambios':'Agregar con estas medidas';
    document.querySelectorAll('[data-material]').forEach(b=>{const active=b.dataset.material===material; b.classList.toggle('activo',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('activo',active);b.setAttribute('aria-pressed',String(active));});
    $('instruccion').textContent=mode==='select'?'Seleccionar / mover · Haz clic en un objeto y arrastra. Suprimir elimina la selección.':`${names[material]} · ${mode==='area'?'Área: arrastra un rectángulo':'Pincel: arrastra sobre el terreno'}.`;
    canvas.style.cursor=mode==='select'?'grab':'crosshair';
  }
  function fillForm(o) {
    $('tipo').value=o.type; $('objX').value=o.x; $('objY').value=o.y; $('objW').value=o.w; $('objH').value=o.h; $('rotacion').value=o.rotation;
    constraints();
  }
  function constraints() {
    const type=$('tipo').value, min=defaults[type][2], thin=['pared','puerta','ventana'].includes(type);
    $('objW').min=min; $('objH').min=thin?.2:min; $('objH').readOnly=thin;
    if(thin) $('objH').value=.2;
    $('objAyuda').textContent=(thin?'Grosor fijo: 0.20 m. ':'')+`Medida mínima: ${fmt(min)} m. X/Y: esquina superior izquierda; sin ajuste a la cuadrícula.`;
  }
  function fresh() {selected=null; const t=$('tipo').value;fillForm({type:t,x:0,y:0,w:defaults[t][0],h:defaults[t][1],rotation:0});sync();render();}
  function render() {
    const host=canvas.parentElement;
    scale=clamp(Math.min(Math.max(100,host.clientWidth-2*margin-26)/state.width,Math.max(100,host.clientHeight-2*margin-26)/state.length)*zoom,1,100);
    const w=state.width*scale,h=state.length*scale,cw=Math.ceil(w+margin*2),ch=Math.ceil(h+margin*2),dpr=Math.min(window.devicePixelRatio||1,2);
    // Resize only when needed: changing canvas dimensions during a stroke can lose pointer capture in some browsers.
    if(canvas.width!==Math.round(cw*dpr)||canvas.height!==Math.round(ch*dpr)){canvas.width=Math.round(cw*dpr);canvas.height=Math.round(ch*dpr);canvas.style.width=cw+'px';canvas.style.height=ch+'px';}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#101b2b';ctx.fillRect(0,0,cw,ch);ctx.save();ctx.translate(margin,margin);
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();ctx.fillStyle='#d9d2b8';ctx.fillRect(0,0,w,h);
    for(const [key,value] of cells){const [x,y]=key.split(':').map(Number);ctx.fillStyle=value==='vitropiso'?((x+y)%2?'#20232a':'#fff'):materials[value];ctx.fillRect(x*unit*scale,y*unit*scale,unit*scale+.2,unit*scale+.2);}
    if(showGrid){ctx.strokeStyle='rgba(24,47,57,.25)';ctx.lineWidth=.6;ctx.beginPath();for(let x=0;x<=state.width+1e-8;x+=state.step){ctx.moveTo(x*scale,0);ctx.lineTo(x*scale,h);}for(let y=0;y<=state.length+1e-8;y+=state.step){ctx.moveTo(0,y*scale);ctx.lineTo(w,y*scale);}ctx.stroke();}
    // Openings appear over walls regardless of their creation order.
    const objects=[...state.objects].sort((a,b)=>(['puerta','ventana'].includes(a.type)?1:0)-(['puerta','ventana'].includes(b.type)?1:0));
    for(const o of objects) drawObject(o);
    if(drag&&mode==='area'){const r=area(drag.start,drag.current);ctx.fillStyle='#4191ff44';ctx.strokeStyle='#257cff';ctx.lineWidth=2;ctx.fillRect(r.x*scale,r.y*scale,r.w*scale,r.h*scale);ctx.strokeRect(r.x*scale,r.y*scale,r.w*scale,r.h*scale);}
    ctx.restore();ctx.strokeStyle='#b7cce1';ctx.lineWidth=1.5;ctx.strokeRect(0,0,w,h);
    if(showCotas){ctx.strokeStyle='#9bb8d4';ctx.fillStyle='#e3efff';ctx.lineWidth=1;ctx.font='13px system-ui';ctx.textAlign='center';ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(0,-34);ctx.moveTo(w,-12);ctx.lineTo(w,-34);ctx.moveTo(0,-26);ctx.lineTo(w,-26);ctx.moveTo(-12,0);ctx.lineTo(-34,0);ctx.moveTo(-12,h);ctx.lineTo(-34,h);ctx.moveTo(-26,0);ctx.lineTo(-26,h);ctx.stroke();ctx.fillText(fmt(state.width)+' m',w/2,-35);ctx.save();ctx.translate(-35,h/2);ctx.rotate(-Math.PI/2);ctx.fillText(fmt(state.length)+' m',0,0);ctx.restore();ctx.fillText('0, 0',0,h+27);ctx.textAlign='right';ctx.fillText('metros',w,h+27);}
    ctx.restore();$('infoTerreno').textContent=`${fmt(state.width)} × ${fmt(state.length)} m · ${fmt(state.width*state.length)} m² · ${Math.round(zoom*100)}%`;
  }
  function drawObject(o){
    const b=bounds(o),x=b.x*scale,y=b.y*scale,w=b.w*scale,h=b.h*scale;
    ctx.save();ctx.lineWidth=1;ctx.strokeStyle='#203142';
    const colors={pared:'#556577',puerta:'#b97b45',ventana:'#a9e5ff',arbol:'#39843f',palapa:'#d3a65b',casa:'#c57c65',alberca:'#29b9e8'};
    ctx.fillStyle=colors[o.type];
    if(o.type==='arbol'){ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#715039';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.max(1,Math.min(w,h)*.1),0,Math.PI*2);ctx.fill();}
    else {ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
      if(['casa','palapa'].includes(o.type)){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w/2,y+h/2);ctx.lineTo(x+w,y);ctx.moveTo(x,y+h);ctx.lineTo(x+w/2,y+h/2);ctx.lineTo(x+w,y+h);ctx.stroke();}
      if(o.type==='alberca'&&w>8&&h>8){ctx.strokeStyle='#ddf9ff';ctx.strokeRect(x+3,y+3,w-6,h-6);}
      if(o.type==='puerta'){ctx.strokeStyle='#d49654';ctx.setLineDash([3,2]);ctx.beginPath();if(o.rotation===0){ctx.arc(x,y+h,w, -Math.PI/2,0);ctx.moveTo(x,y+h);ctx.lineTo(x,y+h+w);}else{ctx.arc(x+w,y,h,0,Math.PI/2);ctx.moveTo(x+w,y);ctx.lineTo(x+w+h,y);}ctx.stroke();}
      if(o.type==='ventana'){ctx.strokeStyle='#1978a5';ctx.beginPath();if(o.rotation===0){ctx.moveTo(x,y+h/2);ctx.lineTo(x+w,y+h/2);}else{ctx.moveTo(x+w/2,y);ctx.lineTo(x+w/2,y+h);}ctx.stroke();}
    }
    if(w>35&&h>20){ctx.fillStyle='#10202c';ctx.textAlign='center';ctx.font='11px system-ui';ctx.fillText(o.type,x+w/2,y+h/2+4,Math.max(1,w-6));}
    if(o.id===selected){ctx.setLineDash([5,3]);ctx.strokeStyle='#ffe06b';ctx.lineWidth=3;ctx.strokeRect(x-3,y-3,w+6,h+6);}
    ctx.restore();
  }
  function point(e,limit=true){const r=canvas.getBoundingClientRect();const p={x:(e.clientX-r.left)*parseFloat(canvas.style.width)/r.width/scale-margin/scale,y:(e.clientY-r.top)*parseFloat(canvas.style.height)/r.height/scale-margin/scale};return limit?{x:clamp(p.x,0,state.width-.00001),y:clamp(p.y,0,state.length-.00001)}:p;}
  function area(a,b){const s=state.step,x=Math.floor(Math.min(a.x,b.x)/s)*s,y=Math.floor(Math.min(a.y,b.y)/s)*s;return {x,y,w:Math.min(state.width,(Math.floor(Math.max(a.x,b.x)/s)+1)*s)-x,h:Math.min(state.length,(Math.floor(Math.max(a.y,b.y)/s)+1)*s)-y};}
  function paintRect(r){for(let y=Math.floor(r.y/unit);y<Math.ceil((r.y+r.h)/unit-1e-8);y++)for(let x=Math.floor(r.x/unit);x<Math.ceil((r.x+r.w)/unit-1e-8);x++){const k=x+':'+y;if(material==='borrar')cells.delete(k);else cells.set(k,material);}}
  function stroke(a,b){const count=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/(unit/2)));for(let i=0;i<=count;i++){const p={x:a.x+(b.x-a.x)*i/count,y:a.y+(b.y-a.y)*i/count};paintRect(area(p,p));}}
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||drag)return;const p=point(e,false);if(p.x<0||p.y<0||p.x>=state.width||p.y>=state.length)return;
    e.preventDefault();canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,start:p,current:p,before:serialize()};
    if(mode==='select'){
      const hit=[...state.objects].reverse().find(o=>{const b=bounds(o),pad=.1;return p.x>=b.x-pad&&p.x<=b.x+b.w+pad&&p.y>=b.y-pad&&p.y<=b.y+b.h+pad;});
      selected=hit?.id||null;if(hit){drag.object={...hit};fillForm(hit);}sync();
    }else if(mode==='brush')paintRect(area(p,p));render();
  });
  function moving(e){if(!drag||e.pointerId!==drag.id)return;const p=point(e);
    if(mode==='brush')stroke(drag.current,p);
    if(mode==='select'&&drag.object){const o=state.objects.find(o=>o.id===selected),b=bounds(o);o.x=round(clamp(drag.object.x+p.x-drag.start.x,0,state.width-b.w));o.y=round(clamp(drag.object.y+p.y-drag.start.y,0,state.length-b.h));o.x=Math.min(o.x,state.width-b.w);o.y=Math.min(o.y,state.length-b.h);fillForm(o);}
    drag.current=p;render();
  }
  canvas.addEventListener('pointermove',moving);
  canvas.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;moving(e);if(mode==='area')paintRect(area(drag.start,drag.current));const before=drag.before;drag=null;commit(before);});
  function cancel(){if(!drag)return;const before=drag.before;drag=null;restore(JSON.parse(before));render();say('Acción cancelada.');}
  canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
  document.querySelectorAll('[data-material]').forEach(b=>b.addEventListener('click',()=>{cancel();material=b.dataset.material;if(mode==='select')mode='brush';sync();render();}));
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{cancel();mode=b.dataset.mode;sync();render();}));
  $('tamCelda').addEventListener('change',()=>action(()=>{state.step=Number($('tamCelda').value);say('Separación cambiada. Las superficies conservan su posición.');}));
  $('formTerreno').addEventListener('submit',e=>{e.preventDefault();const w=Number($('ancho').value),h=Number($('largo').value);if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||w>35||h<1||h>65)return say('Ancho: 1–35 m. Largo: 1–65 m.');if(state.objects.some(o=>!fits(o,w,h)))return say('Hay objetos fuera de las nuevas medidas. Muévelos o elimínalos antes de reducir el terreno.');action(()=>{state.width=w;state.length=h;cells=new Map([...cells].filter(([k])=>{const [x,y]=k.split(':').map(Number);return x*unit<w&&y*unit<h;}));say('Medidas actualizadas. El recorte de superficies se puede deshacer.');});});
  $('tipo').addEventListener('change',fresh);$('nuevoObjeto').addEventListener('click',fresh);
  $('formObjeto').addEventListener('submit',e=>{e.preventDefault();const type=$('tipo').value,o={id:selected||('o'+Date.now().toString(36)+Math.random().toString(36).slice(2)),type,x:Number($('objX').value),y:Number($('objY').value),w:Number($('objW').value),h:Number($('objH').value),rotation:Number($('rotacion').value)};if(!validObject(o)||!fits(o))return say('Revisa las medidas mínimas y que el objeto quede dentro del terreno.');action(()=>{if(selected)state.objects=state.objects.map(a=>a.id===selected?o:a);else state.objects.push(o);selected=o.id;mode='select';fillForm(o);say('Objeto colocado. Puedes moverlo o editar sus medidas.');});});
  function remove(){if(!selected)return;action(()=>{state.objects=state.objects.filter(o=>o.id!==selected);selected=null;say('Objeto eliminado.');});}
  $('eliminarObjeto').addEventListener('click',remove);
  function history(back){cancel();const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(serialize());restore(JSON.parse(from.pop()));render();say(back?'Acción deshecha.':'Acción rehecha.');}
  $('deshacer').addEventListener('click',()=>history(true));$('rehacer').addEventListener('click',()=>history(false));
  window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='Escape'){cancel();selected=null;sync();render();}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();history(e.key.toLowerCase()==='z'&&!e.shiftKey);}});
  for(const [id,factor] of [['zoomMas',1.25],['zoomMenos',.8],['ajustar',0]])$(id).addEventListener('click',()=>{zoom=factor?clamp(zoom*factor,.3,6):1;render();});
  $('mostrarGrid').addEventListener('change',e=>{showGrid=e.target.checked;render();});$('mostrarCotas').addEventListener('change',e=>{showCotas=e.target.checked;render();});
  $('pantalla').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{say('Pantalla completa no disponible. Puedes ampliar con F11.');}});
  function validObject(o){return o&&typeof o.id==='string'&&o.id.length<100&&Object.hasOwn(defaults,o.type)&&[o.x,o.y,o.w,o.h,o.rotation].every(Number.isFinite)&&[0,90].includes(o.rotation)&&o.w>=defaults[o.type][2]&&o.h>=(['pared','puerta','ventana'].includes(o.type)?.2:defaults[o.type][2])&&(!['pared','puerta','ventana'].includes(o.type)||Math.abs(o.h-.2)<1e-8);}
  function validate(raw){
    if(!raw||![1,2].includes(raw.version)||![raw.width,raw.length,raw.step].every(Number.isFinite)||raw.width<1||raw.width>35||raw.length<1||raw.length>65||![1,.5,.25].includes(raw.step)||!Array.isArray(raw.cells)||raw.cells.length>40000)throw Error('Formato o medidas del proyecto no válidos.');
    const converted=new Map();for(const entry of raw.cells){if(!Array.isArray(entry)||entry.length!==2)throw Error('Celda no válida.');const [k,v]=entry;if(typeof k!=='string'||!/^\d{1,3}:\d{1,3}$/.test(k)||!Object.hasOwn(materials,v))throw Error('Material o coordenada no válido.');const [x,y]=k.split(':').map(Number),s=raw.version===1?raw.step:unit;if(x*s>=raw.width||y*s>=raw.length)throw Error('Superficie fuera del terreno.');for(let yy=y*s;yy<Math.min((y+1)*s,raw.length)-1e-8;yy+=unit)for(let xx=x*s;xx<Math.min((x+1)*s,raw.width)-1e-8;xx+=unit)converted.set(Math.round(xx/unit)+':'+Math.round(yy/unit),v);}
    const objects=raw.version===1?[]:raw.objects;if(!Array.isArray(objects)||objects.length>2000||objects.some(o=>!validObject(o)||!fits(o,raw.width,raw.length))||new Set(objects.map(o=>o.id)).size!==objects.length)throw Error('Objetos o dimensiones no válidos.');
    return {version:2,width:raw.width,length:raw.length,step:raw.step,cells:[...converted],objects:objects.map(({id,type,x,y,w,h,rotation})=>({id,type,x,y,w,h,rotation}))};
  }
  function load(raw){const p=validate(raw);action(()=>{restore(p);say('Proyecto cargado. Puedes deshacer la importación.');});}
  $('guardar').addEventListener('click',()=>{try{localStorage.setItem(storageKey,serialize());say('Proyecto guardado en este navegador.');}catch{say('No se pudo guardar. Exporta el proyecto como JSON.');}});
  $('cargar').addEventListener('click',()=>{try{const raw=localStorage.getItem(storageKey)||localStorage.getItem('editor-quintas-v1');if(!raw)return say('No hay un proyecto guardado en este navegador.');load(JSON.parse(raw));}catch(e){say('No se pudo cargar: '+e.message);}});
  $('exportar').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(project(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='quinta-proyecto-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Proyecto exportado como JSON.');});
  $('importar').addEventListener('click',()=>$('archivo').click());$('archivo').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>8*1024*1024)throw Error('El archivo supera 8 MB.');load(JSON.parse(await file.text()));}catch(err){say('No se pudo importar: '+err.message);}finally{e.target.value='';}});
  window.addEventListener('resize',render);
  try{const saved=localStorage.getItem(storageKey)||localStorage.getItem('editor-quintas-v1');if(saved){restore(validate(JSON.parse(saved)));say('Se recuperó tu proyecto guardado.');}}catch{say('El guardado anterior no se pudo leer. Puedes importar otro JSON.');}
  fresh();sync();render();
})();
