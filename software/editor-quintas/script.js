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
  const defaults = {pared:[3,.2,.2], puerta:[1,.2,.6], ventana:[1.2,.2,.3], arbol:[2,2,.5], palapa:[4,4,1], casa:[6,8,2], alberca:[3,5,1], bano:[2,2,1],arbusto:[1,1,.3],fuente:[2,2,.5],flores:[1,1,.2],gallinero:[3,3,1],fogatero:[2,2,.5],estacionamiento:[2.5,5,1]};
  const storageKey = 'editor-quintas-v2', unit = .25, margin = 56;
  let state = {version:2,width:35,length:65,step:1,cells:[],objects:[],dimensions:[]};
  let cells = new Map(), undo = [], redo = [], selected = null, drag = null;
  let mode = 'brush', material = 'pasto', zoom = 1, scale = 10, showGrid = true, showCotas = true;
  let view = 'horizontal', objectDimensions = 'todos';
  let chainPoint=null,lastWall=null,dimensionPoints=[];
  let separationPoints=[];
  let referenceImage=null,detectedWalls=[];
  const uid=()=> 'o'+Date.now().toString(36)+Math.random().toString(36).slice(2);
  const snap=p=>({x:round(clamp(Math.round(p.x/state.step)*state.step,0,state.width)),y:round(clamp(Math.round(p.y/state.step)*state.step,0,state.length))});
  function endTools(){chainPoint=null;lastWall=null;dimensionPoints=[];separationPoints=[];$('cotaEnPlano').hidden=true;if($('puntosSeparacion'))$('puntosSeparacion').textContent='Pulsa una pared de referencia y después el lado del objeto que deseas mover.';}
  function edgePoint(ref){const o=state.objects.find(o=>o.id===ref.id);if(!o)return null;const b=bounds(o);return ref.side==='left'?{x:b.x,y:b.y+b.h*ref.t}:ref.side==='right'?{x:b.x+b.w,y:b.y+b.h*ref.t}:ref.side==='top'?{x:b.x+b.w*ref.t,y:b.y}:{x:b.x+b.w*ref.t,y:b.y+b.h};}
  function refreshDimensions(){state.dimensions=state.dimensions.filter(q=>{if(!q.link)return true;const a=edgePoint(q.link.a),b=edgePoint(q.link.b);if(!a||!b)return false;q.x1=a.x;q.x2=q.axis==='x'?b.x:a.x;q.y1=a.y;q.y2=q.axis==='y'?b.y:a.y;return true;});}
  function linkedCount(axis){return state.dimensions.filter(q=>q.link&&q.axis===axis).length;}
  let matrix = [0,-1,1,0], offset = {x:margin,y:margin};
  function projection() {
    matrix = view==='vertical'?[1,0,0,1]:view==='horizontal'?[0,-1,1,0]:[Math.sqrt(3)/2,.5,-Math.sqrt(3)/2,.5];
    const [a,b,c,d]=matrix;
    const points=[[0,0],[state.width,0],[state.width,state.length],[0,state.length]];
    for(const q of state.dimensions||[]){if(q.link)continue;if(q.axis==='x')points.push([q.x1,q.y1+q.offset],[q.x2,q.y1+q.offset]);else points.push([q.x1+q.offset,q.y1],[q.x1+q.offset,q.y2]);}
    const corners=points.map(([x,y])=>({x:a*x+c*y,y:b*x+d*y}));
    const minX=Math.min(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y));
    return {minX,minY,w:Math.max(...corners.map(p=>p.x))-minX,h:Math.max(...corners.map(p=>p.y))-minY};
  }
  function screen(x,y){const [a,b,c,d]=matrix;return {x:offset.x+(a*x+c*y)*scale,y:offset.y+(b*x+d*y)*scale};}
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const round = n => Math.round(n*100)/100;
  const fmt = n => Number(n.toFixed(2)).toLocaleString('es-MX');
  const say = message => { $('estado').textContent = message; };
  const project = () => {refreshDimensions();return {...state,cells:[...cells],objects:state.objects.map(o=>({...o}))};};
  const serialize = () => JSON.stringify(project());
  function restore(p) { state = JSON.parse(JSON.stringify(p)); state.dimensions ||= [];cells = new Map(state.cells); selected = null;referenceImage=null;detectedWalls=[];endTools(); sync(); }
  function commit(before) {
    if (before !== serialize()) { undo.push(before); if(undo.length>40) undo.shift(); redo=[]; }
    sync(); render();
  }
  function action(fn) { if(drag) return; const before=serialize(); fn(); commit(before); }
  function bounds(o) { return {x:o.x,y:o.y,w:o.rotation===90?o.h:o.w,h:o.rotation===90?o.w:o.h}; }
  function fits(o,w=state.width,h=state.length) {const b=bounds(o);return b.x>=0&&b.y>=0&&b.x+b.w<=w+1e-8&&b.y+b.h<=h+1e-8;}
  function overlap(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
  function collision(o,other=state.objects){return other.some(a=>{if(a.id===o.id)return false;if((o.type==='pared'&&['puerta','ventana'].includes(a.type))||(a.type==='pared'&&['puerta','ventana'].includes(o.type)))return false;const bo=bounds(o),ba=bounds(a),area=overlap(bo,ba);if(area>1e-8&&area>=Math.min(bo.w*bo.h,ba.w*ba.h)-1e-8)return true;return area>(a.type==='pared'&&o.type==='pared'?.040001:1e-8);});}
  function freePosition(o){const b=bounds(o),cx=round((state.width-b.w)/2),cy=round((state.length-b.h)/2),candidates=[];for(let y=0;y<=state.length-b.h+.001;y+=.5)for(let x=0;x<=state.width-b.w+.001;x+=.5)candidates.push({x,y});candidates.unshift({x:cx,y:cy});candidates.sort((a,b)=>(Math.abs(a.x-cx)+Math.abs(a.y-cy)*2)-(Math.abs(b.x-cx)+Math.abs(b.y-cy)*2));return candidates.map(p=>({...o,...p})).find(p=>fits(p)&&!collision(p))||null;}
  function magnet(o){if(!$('pegarObjetos').checked||$('ajusteMovimiento').value==='grid')return o;const b=bounds(o),limit=Math.min(.4,10/scale),candidates=[o];for(const a of state.objects){if(a.id===o.id)continue;const r=bounds(a);if(b.y<r.y+r.h+.1&&b.y+b.h>r.y-.1)for(const x of [r.x-b.w,r.x+r.w])if(Math.abs(x-o.x)<=limit)candidates.push({...o,x:round(x)});if(b.x<r.x+r.w+.1&&b.x+b.w>r.x-.1)for(const y of [r.y-b.h,r.y+r.h])if(Math.abs(y-o.y)<=limit)candidates.push({...o,y:round(y)});}const valid=candidates.filter(p=>fits(p)&&!collision(p));return valid.length>1?valid[valid.length-1]:o;}
  function sync() {
    $('ancho').value=state.width; $('largo').value=state.length; $('tamCelda').value=state.step;
    $('deshacer').disabled=!undo.length; $('rehacer').disabled=!redo.length;
    $('eliminarObjeto').disabled=!selected;
    $('seleccionInfo').textContent=selected?'Objeto seleccionado. Arrastra o edita sus medidas.':'Sin objeto seleccionado.';
    $('aplicarObjeto').textContent=selected?'Aplicar cambios':'Agregar con estas medidas';
    $('zoomMas').disabled=zoom>=3; $('zoomMenos').disabled=zoom<=.2;
    const list=$('listaCotas'),chosen=list.value;list.replaceChildren();const blank=document.createElement('option');blank.value='';blank.textContent='Elige una cota';list.appendChild(blank);
    for(const q of state.dimensions){const option=document.createElement('option');option.value=q.id;option.textContent=`${q.axis==='x'?'X':'Y'} · ${fmt(Math.abs(q.axis==='x'?q.x2-q.x1:q.y2-q.y1))} m`;list.appendChild(option);}list.value=chosen;
    document.querySelectorAll('[data-material]').forEach(b=>{const active=b.dataset.material===material; b.classList.toggle('activo',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('activo',active);b.setAttribute('aria-pressed',String(active));});
    $('instruccion').textContent=mode==='select'?'Seleccionar / mover · Haz clic en un objeto y arrastra. Suprimir elimina la selección.':`${names[material]} · ${mode==='area'?'Área: arrastra un rectángulo':'Pincel: arrastra sobre el terreno'}.`;
    canvas.style.cursor=mode==='select'?'grab':'crosshair';
    if(mode==='wall')$('instruccion').textContent='Paredes · Pulsa el inicio y después el final de cada tramo. Puedes girar cambiando de eje. Escape termina.';
    if(mode==='dimension')$('instruccion').textContent='Cota manual · 1: inicio · 2: final · 3: posición de la línea de cota (puede ser exterior).';
    if(mode==='separation')$('instruccion').textContent='Separación · Pulsa el lado de la referencia y luego el lado del objeto; abre Cotas para escribir la distancia.';
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
  function fresh() {selected=null; const t=$('tipo').value,base={id:uid(),type:t,x:0,y:0,w:defaults[t][0],h:defaults[t][1],rotation:0},placed=freePosition(base);fillForm(placed||base);if(!placed)say('No queda espacio para este tamaño. Reduce sus medidas.');sync();render();}
  function render() {
    refreshDimensions();
    const host=canvas.parentElement;
    const projected=projection();
    if(host.clientWidth<1||host.clientHeight<1)return;
    const padding=margin+24*Math.max(linkedCount('x'),linkedCount('y'));
    scale=clamp(Math.min(Math.max(30,host.clientWidth-2*padding-26)/projected.w,Math.max(30,host.clientHeight-2*padding-26)/projected.h)*zoom,.1,Infinity);
    offset={x:padding-projected.minX*scale,y:padding-projected.minY*scale};
    const w=state.width*scale,h=state.length*scale,cw=Math.ceil(projected.w*scale+padding*2),ch=Math.ceil(projected.h*scale+padding*2),dpr=Math.min(window.devicePixelRatio||1,2);
    // Resize only when needed: changing canvas dimensions during a stroke can lose pointer capture in some browsers.
    if(canvas.width!==Math.round(cw*dpr)||canvas.height!==Math.round(ch*dpr)){canvas.width=Math.round(cw*dpr);canvas.height=Math.round(ch*dpr);canvas.style.width=cw+'px';canvas.style.height=ch+'px';}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#101b2b';ctx.fillRect(0,0,cw,ch);ctx.save();ctx.translate(offset.x,offset.y);ctx.transform(...matrix,0,0);
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();ctx.fillStyle='#d9d2b8';ctx.fillRect(0,0,w,h);
    if(referenceImage){const r=referenceImage;ctx.save();ctx.globalAlpha=r.opacity;ctx.drawImage(r.image,r.x*scale,r.y*scale,r.w*scale,r.h*scale);ctx.restore();}
    for(const [key,value] of cells){const [x,y]=key.split(':').map(Number);ctx.fillStyle=value==='vitropiso'?((x+y)%2?'#20232a':'#fff'):materials[value];ctx.fillRect(x*unit*scale,y*unit*scale,unit*scale+.2,unit*scale+.2);}
    if(showGrid){ctx.strokeStyle='rgba(24,47,57,.25)';ctx.lineWidth=.6;ctx.beginPath();for(let x=0;x<=state.width+1e-8;x+=state.step){ctx.moveTo(x*scale,0);ctx.lineTo(x*scale,h);}for(let y=0;y<=state.length+1e-8;y+=state.step){ctx.moveTo(0,y*scale);ctx.lineTo(w,y*scale);}ctx.stroke();}
    // Openings appear over walls regardless of their creation order.
    const objects=[...state.objects].sort((a,b)=>(['puerta','ventana'].includes(a.type)?1:0)-(['puerta','ventana'].includes(b.type)?1:0));
    for(const o of objects) drawObject(o);
    ctx.save();ctx.globalAlpha=.6;ctx.strokeStyle='#ffe06b';ctx.lineWidth=2;for(const o of detectedWalls){const b=bounds(o);ctx.strokeRect(b.x*scale,b.y*scale,b.w*scale,b.h*scale);}ctx.restore();
    if(drag&&mode==='area'){const r=area(drag.start,drag.current);ctx.fillStyle='#4191ff44';ctx.strokeStyle='#257cff';ctx.lineWidth=2;ctx.fillRect(r.x*scale,r.y*scale,r.w*scale,r.h*scale);ctx.strokeRect(r.x*scale,r.y*scale,r.w*scale,r.h*scale);}
    ctx.restore();ctx.strokeStyle='#b7cce1';ctx.lineWidth=1.5;ctx.strokeRect(0,0,w,h);
    ctx.restore();
    if(showCotas){const center=screen(state.width/2,state.length/2);dimension(screen(0,0),screen(state.width,0),state.width,center,29+24*linkedCount('x'));dimension(screen(0,0),screen(0,state.length),state.length,center,29+24*linkedCount('y'));}
    if(objectDimensions!=='ninguno')for(const o of state.objects){if(objectDimensions==='seleccion'&&o.id!==selected)continue;const b=bounds(o),center=screen(b.x+b.w/2,b.y+b.h/2);dimension(screen(b.x,b.y),screen(b.x+b.w,b.y),b.w,center,13,o.id===selected);dimension(screen(b.x+b.w,b.y),screen(b.x+b.w,b.y+b.h),b.h,center,13,o.id===selected);}
    const lanes={x:0,y:0};
    for(const q of state.dimensions){if(q.link){drawSeparation(q,lanes[q.axis]++);continue;}const a=screen(q.x1,q.y1),b=screen(q.x2,q.y2),side=q.axis==='x'?screen(q.x1,q.y1+q.offset):screen(q.x1+q.offset,q.y1);const center={x:2*a.x-side.x,y:2*a.y-side.y};const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),gap=len?Math.abs((side.x-a.x)*(-dy/len)+(side.y-a.y)*(dx/len)):0;dimension(a,b,Math.abs(q.axis==='x'?q.x2-q.x1:q.y2-q.y1),center,gap,true);}
    for(const p of [chainPoint,...dimensionPoints,...separationPoints.map(edgePoint)].filter(Boolean)){const q=screen(p.x,p.y);ctx.fillStyle='#ffe06b';ctx.beginPath();ctx.arc(q.x,q.y,5,0,Math.PI*2);ctx.fill();}
    $('infoTerreno').textContent=`${fmt(state.width)} × ${fmt(state.length)} m · ${fmt(state.width*state.length)} m² · ${Math.round(zoom*100)}%`;
  }
  // Dimensions are drawn in screen space so labels remain readable in all views.
  function drawSeparation(q,lane){
    const a=edgePoint(q.link.a),b=edgePoint(q.link.b);if(!a||!b)return;
    const start=q.axis==='x'?screen(a.x,0):screen(0,a.y),end=q.axis==='x'?screen(b.x,0):screen(0,b.y),center=screen(state.width/2,state.length/2);
    ctx.save();ctx.strokeStyle='#7894af';ctx.lineWidth=.7;ctx.setLineDash([3,3]);ctx.beginPath();const pa=screen(a.x,a.y),pb=screen(b.x,b.y);ctx.moveTo(pa.x,pa.y);ctx.lineTo(start.x,start.y);ctx.moveTo(pb.x,pb.y);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.restore();
    dimension(start,end,Math.abs(q.axis==='x'?a.x-b.x:a.y-b.y),center,29+lane*24,true);
  }
  function dimension(a,b,value,center,gap,active=false){
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.01)return;
    let nx=-dy/len,ny=dx/len;const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(nx*(mid.x-center.x)+ny*(mid.y-center.y)<0){nx=-nx;ny=-ny;}
    const p={x:a.x+nx*gap,y:a.y+ny*gap},q={x:b.x+nx*gap,y:b.y+ny*gap};
    ctx.save();ctx.strokeStyle=active?'#ffe06b':'#bdd6ee';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(a.x+nx*4,a.y+ny*4);ctx.lineTo(p.x+nx*5,p.y+ny*5);ctx.moveTo(b.x+nx*4,b.y+ny*4);ctx.lineTo(q.x+nx*5,q.y+ny*5);ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
    for(const t of [p,q]){ctx.moveTo(t.x-dx/len*3-nx*3,t.y-dy/len*3-ny*3);ctx.lineTo(t.x+dx/len*3+nx*3,t.y+dy/len*3+ny*3);}ctx.stroke();
    let angle=Math.atan2(dy,dx);if(angle>Math.PI/2||angle< -Math.PI/2)angle+=Math.PI;
    ctx.translate((p.x+q.x)/2+nx*8,(p.y+q.y)/2+ny*8);ctx.rotate(angle);ctx.font='12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';const label=fmt(value)+' m',textWidth=ctx.measureText(label).width;ctx.fillStyle='#101b2bee';ctx.fillRect(-textWidth/2-4,-8,textWidth+8,16);ctx.fillStyle=active?'#ffe06b':'#e3efff';ctx.fillText(label,0,0);ctx.restore();
  }
  function drawObject(o){
    const b=bounds(o),x=b.x*scale,y=b.y*scale,w=b.w*scale,h=b.h*scale;
    ctx.save();ctx.lineWidth=1;ctx.strokeStyle='#203142';
    const colors={pared:'#556577',puerta:'#b97b45',ventana:'#a9e5ff',arbol:'#39843f',palapa:'#d3a65b',casa:'#c57c65',alberca:'#29b9e8',bano:'#d5dcec',arbusto:'#4c9f52',fuente:'#8fd7eb',flores:'#dc7eb2',gallinero:'#c9ad6f',fogatero:'#9e8675',estacionamiento:'#828d9d'};
    ctx.fillStyle=colors[o.type];
    if(o.type==='arbol'){ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#715039';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.max(1,Math.min(w,h)*.1),0,Math.PI*2);ctx.fill();}
    else {ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
      if(['casa','palapa'].includes(o.type)){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w/2,y+h/2);ctx.lineTo(x+w,y);ctx.moveTo(x,y+h);ctx.lineTo(x+w/2,y+h/2);ctx.lineTo(x+w,y+h);ctx.stroke();}
      if(o.type==='alberca'&&w>8&&h>8){ctx.strokeStyle='#ddf9ff';ctx.strokeRect(x+3,y+3,w-6,h-6);}
      if(o.type==='puerta'){ctx.strokeStyle='#d49654';ctx.setLineDash([3,2]);ctx.beginPath();if(o.rotation===0){ctx.arc(x,y+h,w, -Math.PI/2,0);ctx.moveTo(x,y+h);ctx.lineTo(x,y+h+w);}else{ctx.arc(x+w,y,h,0,Math.PI/2);ctx.moveTo(x+w,y);ctx.lineTo(x+w+h,y);}ctx.stroke();}
      if(o.type==='ventana'){ctx.strokeStyle='#1978a5';ctx.beginPath();if(o.rotation===0){ctx.moveTo(x,y+h/2);ctx.lineTo(x+w,y+h/2);}else{ctx.moveTo(x+w/2,y);ctx.lineTo(x+w/2,y+h);}ctx.stroke();}
      if(o.type==='bano'){ctx.strokeStyle='#57728a';ctx.fillStyle='#fff';ctx.fillRect(x+w*.3,y+h*.15,w*.4,h*.2);ctx.beginPath();ctx.ellipse(x+w*.5,y+h*.55,w*.2,h*.22,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
      if(o.type==='arbusto'){ctx.fillStyle='#247e3b';for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(x+w*(.25+i*.25),y+h*.5,w*.23,h*.4,0,0,Math.PI*2);ctx.fill();}}
      if(o.type==='fuente'){ctx.strokeStyle='#e3faff';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.4,h*.4,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.12,h*.12,0,0,Math.PI*2);ctx.stroke();}
      if(o.type==='gallinero'){ctx.setLineDash([3,2]);ctx.strokeStyle='#6f552b';ctx.strokeRect(x+w*.12,y+h*.12,w*.76,h*.76);ctx.setLineDash([]);}
      if(o.type==='fogatero'){ctx.fillStyle='#ff9845';ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.3,h*.3,0,0,Math.PI*2);ctx.fill();}
      if(o.type==='estacionamiento'){ctx.fillStyle='#eef4ff';ctx.textAlign='center';ctx.font=Math.max(9,Math.min(w,h)*.6)+'px system-ui';ctx.fillText('P',x+w/2,y+h*.7);}
      if(o.type==='flores'){for(let i=0;i<5;i++){ctx.fillStyle=i%2?'#ffe384':'#edb9e6';ctx.beginPath();ctx.arc(x+w*(.2+(i%3)*.3),y+h*(.3+Math.floor(i/3)*.4),Math.max(1,Math.min(w,h)*.1),0,Math.PI*2);ctx.fill();}}
    }
    if(w>35&&h>20){ctx.fillStyle='#10202c';ctx.textAlign='center';ctx.font='11px system-ui';ctx.fillText(o.type,x+w/2,y+h/2+4,Math.max(1,w-6));}
    if(o.id===selected){ctx.setLineDash([5,3]);ctx.strokeStyle='#ffe06b';ctx.lineWidth=3;ctx.strokeRect(x-3,y-3,w+6,h+6);}
    ctx.restore();
  }
  function point(e,limit=true){const r=canvas.getBoundingClientRect(),sx=((e.clientX-r.left)*parseFloat(canvas.style.width)/r.width-offset.x)/scale,sy=((e.clientY-r.top)*parseFloat(canvas.style.height)/r.height-offset.y)/scale;const [a,b,c,d]=matrix,det=a*d-b*c;const p={x:(d*sx-c*sy)/det,y:(a*sy-b*sx)/det};return limit?{x:clamp(p.x,0,state.width-.00001),y:clamp(p.y,0,state.length-.00001)}:p;}
  function area(a,b){const s=state.step,x=Math.floor(Math.min(a.x,b.x)/s)*s,y=Math.floor(Math.min(a.y,b.y)/s)*s;return {x,y,w:Math.min(state.width,(Math.floor(Math.max(a.x,b.x)/s)+1)*s)-x,h:Math.min(state.length,(Math.floor(Math.max(a.y,b.y)/s)+1)*s)-y};}
  function paintRect(r){for(let y=Math.floor(r.y/unit);y<Math.ceil((r.y+r.h)/unit-1e-8);y++)for(let x=Math.floor(r.x/unit);x<Math.ceil((r.x+r.w)/unit-1e-8);x++){const k=x+':'+y;if(material==='borrar')cells.delete(k);else cells.set(k,material);}}
  function stroke(a,b){const count=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/(unit/2)));for(let i=0;i<=count;i++){const p={x:a.x+(b.x-a.x)*i/count,y:a.y+(b.y-a.y)*i/count};paintRect(area(p,p));}}
  function placeWall(p){
    p={x:clamp(p.x,.1,state.width-.1),y:clamp(p.y,.1,state.length-.1)};
    if(!chainPoint){chainPoint=p;render();say('Inicio de pared marcado. Pulsa el final del primer tramo.');return;}
    const start={...chainPoint},horizontal=Math.abs(p.x-start.x)>=Math.abs(p.y-start.y),axis=horizontal?'x':'y',cross=horizontal?'y':'x';
    let end=p[axis],from=start[axis];if(Math.abs(end-from)<.01)return;
    const sign=Math.sign(end-from);let stopped=false;
    for(const wall of state.objects){if(wall.type!=='pared'||wall.id===lastWall)continue;const b=bounds(wall),lo=horizontal?b.x:b.y,hi=lo+(horizontal?b.w:b.h),crossLo=horizontal?b.y:b.x,crossHi=crossLo+(horizontal?b.h:b.w);
      if(start[cross]+.1<=crossLo+1e-8||start[cross]-.1>=crossHi-1e-8)continue;
      // A junction may start on an existing wall; travel away from that junction is allowed.
      if(from>=lo-.10001&&from<=hi+.10001)continue;
      const stop=sign>0?lo-.1:hi+.1;
      if(sign*(stop-from)>0&&sign*(end-stop)>=-1e-8){end=stop;stopped=true;}
    }
    if(Math.abs(end-from)<.01){endTools();say('La pared se detuvo al encontrar otra pared.');render();return;}
    const target={...start,[axis]:end},distance=Math.abs(end-from);
    const o={id:uid(),type:'pared',x:round(Math.min(start.x,target.x)-.1),y:round(Math.min(start.y,target.y)-.1),w:round(distance+.2),h:.2,rotation:horizontal?0:90};
    if(!fits(o))return say('El tramo debe quedar dentro del terreno.');if(collision(o))return say('El tramo se encimaría con otro objeto.');
    action(()=>{state.objects.push(o);selected=o.id;fillForm(o);});
    if($('encadenar').checked&&!stopped){chainPoint=target;lastWall=o.id;say('Tramo agregado. Pulsa el siguiente punto para continuar o girar.');}
    else{endTools();say(stopped?'Pared conectada con otra pared. Cadena terminada.':'Pared colocada. Pulsa un nuevo inicio.');}render();
  }
  function placeDimension(p){
    if(dimensionPoints.length<2){if(p.x<0||p.y<0||p.x>state.width||p.y>state.length)return say('Marca los extremos dentro del terreno o en su borde.');p=snap(p);
      if(dimensionPoints.length){const a=dimensionPoints[0];if(Math.abs(p.x-a.x)>=Math.abs(p.y-a.y))p.y=a.y;else p.x=a.x;if(p.x===a.x&&p.y===a.y)return say('Elige un final distinto del inicio.');}
      dimensionPoints.push(p);render();say(dimensionPoints.length===1?'Marca el final de la cota.':'Pulsa por fuera para colocar la línea de cota.');return;
    }
    const [a,b]=dimensionPoints,axis=a.y===b.y?'x':'y',delta=axis==='x'?p.y-a.y:p.x-a.x;
    const offset=round(clamp(Math.round(delta/state.step)*state.step,-65,65));
    if(Math.abs(offset)<.01)return say('Aleja la línea de cota de los extremos.');
    action(()=>{state.dimensions.push({id:uid(),axis,x1:a.x,y1:a.y,x2:b.x,y2:b.y,offset});});dimensionPoints=[];say('Cota colocada en metros. Puedes colocar otra o cambiar de herramienta.');render();
  }
  function chooseSeparation(p){
    const axis=$('ejeSeparacion').value,hit=[...state.objects].reverse().find(o=>{const b=bounds(o),pad=Math.max(.1,6/scale);return p.x>=b.x-pad&&p.x<=b.x+b.w+pad&&p.y>=b.y-pad&&p.y<=b.y+b.h+pad;});
    if(!hit)return say('Pulsa un lado de una pared u objeto.');
    if(separationPoints.length===2)separationPoints=[];
    if(separationPoints[0]?.id===hit.id)return say('El segundo punto debe pertenecer a otro objeto.');
    const b=bounds(hit),side=axis==='x'?(Math.abs(p.x-b.x)<Math.abs(p.x-b.x-b.w)?'left':'right'):(Math.abs(p.y-b.y)<Math.abs(p.y-b.y-b.h)?'top':'bottom');
    separationPoints.push({id:hit.id,side,t:clamp(axis==='x'?(p.y-b.y)/b.h:(p.x-b.x)/b.w,0,1)});
    $('puntosSeparacion').textContent=separationPoints.length===1?'Referencia elegida. Pulsa el lado del objeto que deseas mover.':'Dos lados elegidos. Escribe la separación y pulsa Aplicar separación.';
    if(separationPoints.length===2){const a=edgePoint(separationPoints[0]),c=edgePoint(separationPoints[1]),v=round(Math.abs(a[axis]-c[axis]));$('distanciaSeparacion').value=v;$('metrosEnPlano').value=v;closeMenus();const panel=$('cotaEnPlano'),host=canvas.parentElement,sp=screen(c.x,c.y);panel.style.left=clamp((canvas.offsetLeft||0)+sp.x+12,(host.scrollLeft||0)+12,(host.scrollLeft||0)+Math.max(12,host.clientWidth-320))+'px';panel.style.top=clamp((canvas.offsetTop||0)+sp.y+12,(host.scrollTop||0)+12,(host.scrollTop||0)+Math.max(12,host.clientHeight-100))+'px';panel.hidden=false;$('metrosEnPlano').focus();$('metrosEnPlano').select();}
    render();say($('puntosSeparacion').textContent);
  }
  $('ejeSeparacion').addEventListener('change',()=>{endTools();render();});
  $('formSeparacion').addEventListener('submit',e=>{
    e.preventDefault();if(separationPoints.length!==2)return say('Primero elige una referencia y el lado de otro objeto.');
    const axis=$('ejeSeparacion').value,dist=Number($('distanciaSeparacion').value);if(!Number.isFinite(dist)||dist<0||dist>65)return say('Introduce una distancia de 0 a 65 m.');
    const [ref,target]=separationPoints,a=edgePoint(ref),b=edgePoint(target),original=state.objects.find(o=>o.id===target.id);if(!a||!b||!original)return say('Selecciona nuevamente los dos lados.');
    const sign=Math.sign(b[axis]-a[axis])||(target.side==='left'||target.side==='top'?1:-1),next={...original,[axis]:round(original[axis]+a[axis]+sign*dist-b[axis])};
    if(!fits(next))return say('Esa separación dejaría el objeto fuera del terreno. Introduce una distancia menor.');
    if(collision(next))return say('Esa separación encimaría el objeto con otro. Elige otra medida.');
    const refs=JSON.parse(JSON.stringify({a:ref,b:target}));
    action(()=>{state.objects=state.objects.map(o=>o.id===next.id?next:o);state.dimensions=state.dimensions.filter(q=>!(q.link&&q.axis===axis&&q.link.a.id===ref.id&&q.link.a.side===ref.side&&q.link.b.id===target.id&&q.link.b.side===target.side));state.dimensions.push({id:uid(),axis,x1:a.x,y1:a.y,x2:axis==='x'?a.x+sign*dist:a.x,y2:axis==='y'?a.y+sign*dist:a.y,offset:0,link:refs});selected=next.id;fillForm(next);});
    closeMenus();$('cotaEnPlano').hidden=true;say(`Objeto separado ${fmt(dist)} m entre los lados elegidos. Cota colocada bajo la cota total.`);
  });
  $('cotaEnPlano').addEventListener('submit',e=>{e.preventDefault();$('distanciaSeparacion').value=$('metrosEnPlano').value;$('formSeparacion').requestSubmit();});
  $('cancelarCotaPlano').addEventListener('click',()=>{endTools();render();});
  function imageFrame(){return {x:Number($('imagenX').value),y:Number($('imagenY').value),w:Number($('imagenW').value),h:Number($('imagenH').value),opacity:Number($('imagenOpacidad').value)};}
  function validFrame(r){return [r.x,r.y,r.w,r.h,r.opacity].every(Number.isFinite)&&r.w>0&&r.h>0&&r.x>=0&&r.y>=0&&r.x+r.w<=state.width+1e-8&&r.y+r.h<=state.length+1e-8&&r.opacity>=0&&r.opacity<=1;}
  $('imagenPlano').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024){say('Carga una imagen PNG, JPG o WebP de hasta 15 MB.');e.target.value='';return;}const url=URL.createObjectURL(file),image=new Image();image.onload=()=>{URL.revokeObjectURL(url);referenceImage={image,x:0,y:0,w:state.width,h:state.length,opacity:.5};detectedWalls=[];$('aplicarDeteccion').disabled=true;$('imagenW').value=state.width;$('imagenH').value=state.length;$('imagenX').value=0;$('imagenY').value=0;render();say('Imagen cargada. Ajusta sus medidas reales y detecta paredes o dibuja sobre ella.');};image.onerror=()=>{URL.revokeObjectURL(url);say('No se pudo leer la imagen.');};image.src=url;e.target.value='';});
  $('formImagen').addEventListener('submit',e=>{e.preventDefault();if(!referenceImage)return say('Primero carga una imagen.');const r=imageFrame();if(!validFrame(r))return say('La imagen debe quedar dentro del terreno y tener medidas positivas.');Object.assign(referenceImage,r);detectedWalls=[];$('aplicarDeteccion').disabled=true;render();});
  $('imagenOpacidad').addEventListener('input',()=>{if(referenceImage){referenceImage.opacity=Number($('imagenOpacidad').value);render();}});
  $('quitarImagen').addEventListener('click',()=>{referenceImage=null;detectedWalls=[];$('aplicarDeteccion').disabled=true;render();say('Referencia de imagen retirada. Las paredes agregadas se conservan.');});
  // Conservative raster line detector: preview only, never silently changes the project.
  function extractWalls(pixels,iw,ih,frame){
    const dark=(x,y)=>{const i=(y*iw+x)*4;return pixels[i+3]>127&&.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2]<85;};
    const result=[];
    for(const horizontal of [true,false]){const across=horizontal?iw:ih,rows=horizontal?ih:iw,minRun=Math.max(10,Math.ceil(across/(horizontal?frame.w:frame.h))),maxThick=Math.max(2,Math.ceil(rows/(horizontal?frame.h:frame.w)*.6));let groups=[];
      for(let row=0;row<rows;row++){const runs=[];let start=-1;for(let n=0;n<=across;n++){const black=n<across&&(horizontal?dark(n,row):dark(row,n));if(black&&start<0)start=n;if(!black&&start>=0){if(n-start>=minRun)runs.push({start,end:n});start=-1;}}
        for(const run of runs){let g=groups.find(g=>g.last===row-1&&Math.abs(g.start-run.start)<=3&&Math.abs(g.end-run.end)<=3);if(g){g.start=Math.min(g.start,run.start);g.end=Math.max(g.end,run.end);g.last=row;}else groups.push({...run,first:row,last:row});}
      }
      for(const g of groups){if(g.last-g.first+1>maxThick)continue;const center=(g.first+g.last+1)/2,cross=horizontal?frame.y+center/ih*frame.h:frame.x+center/iw*frame.w,begin=horizontal?frame.x+g.start/iw*frame.w:frame.y+g.start/ih*frame.h,end=horizontal?frame.x+g.end/iw*frame.w:frame.y+g.end/ih*frame.h;
        const o={id:uid(),type:'pared',x:round(horizontal?begin:cross-.1),y:round(horizontal?cross-.1:begin),w:round(end-begin),h:.2,rotation:horizontal?0:90};if(o.w>=.2&&fits(o)&&!result.some(a=>overlap(bounds(a),bounds(o))>o.w*.15))result.push(o);if(result.length>=200)return result;
      }
    }return result;
  }
  $('detectarParedes').addEventListener('click',()=>{if(!referenceImage)return say('Primero carga una imagen.');try{const image=referenceImage.image,factor=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight)),w=Math.max(1,Math.round(image.naturalWidth*factor)),h=Math.max(1,Math.round(image.naturalHeight*factor)),temp=document.createElement('canvas');temp.width=w;temp.height=h;const c=temp.getContext('2d',{willReadFrequently:true});c.fillStyle='#fff';c.fillRect(0,0,w,h);c.drawImage(image,0,0,w,h);detectedWalls=extractWalls(c.getImageData(0,0,w,h).data,w,h,referenceImage);$('aplicarDeteccion').disabled=!detectedWalls.length;$('infoImagen').textContent=`${detectedWalls.length} tramos en borrador amarillo. Revisa escala y posición antes de agregarlos. La imagen es temporal; las paredes agregadas sí se guardan en el JSON.`;render();say('Detección terminada. Revisa el borrador amarillo.');}catch{say('No se pudo procesar esta imagen. Prueba otra imagen más pequeña.');}});
  $('aplicarDeteccion').addEventListener('click',()=>{let count=0;action(()=>{for(const o of detectedWalls)if(!collision(o)){state.objects.push(o);count++;}});detectedWalls=[];$('aplicarDeteccion').disabled=true;render();say(`${count} paredes agregadas. Se omitieron las que encimaban otros elementos. Puedes deshacer esta acción.`);});
  $('listaCotas').addEventListener('change',()=>{const q=state.dimensions.find(q=>q.id===$('listaCotas').value);if(q?.link){separationPoints=JSON.parse(JSON.stringify([q.link.a,q.link.b]));$('ejeSeparacion').value=q.axis;$('distanciaSeparacion').value=round(Math.abs(q.axis==='x'?q.x2-q.x1:q.y2-q.y1));$('puntosSeparacion').textContent='Cota elegida. Cambia los metros y aplica para mover el segundo objeto.';}});
  $('dibujarPared').addEventListener('click',()=>{cancel();endTools();mode='wall';selected=null;sync();closeMenus();render();});
  $('terminarCadena').addEventListener('click',()=>{endTools();render();say('Cadena terminada.');});
  $('encadenar').addEventListener('change',()=>{endTools();});
  $('borrarCota').addEventListener('click',()=>{const id=$('listaCotas').value;if(id)action(()=>{state.dimensions=state.dimensions.filter(q=>q.id!==id);say('Cota eliminada.');});});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){endTools();render();}});
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||drag)return;const p=point(e,false);
    if(mode==='dimension'){placeDimension(p);return;}
    if(mode==='separation'){chooseSeparation(p);return;}
    if(p.x<0||p.y<0||p.x>state.width||p.y>state.length)return;
    if(mode==='wall'){placeWall(snap(p));return;}
    e.preventDefault();canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,start:p,current:p,before:serialize()};
    if(mode==='select'){
      const hit=[...state.objects].reverse().find(o=>{const b=bounds(o),pad=.1;return p.x>=b.x-pad&&p.x<=b.x+b.w+pad&&p.y>=b.y-pad&&p.y<=b.y+b.h+pad;});
      selected=hit?.id||null;if(hit){drag.object={...hit};fillForm(hit);}sync();
    }else if(mode==='brush')paintRect(area(p,p));render();
  });
  function moving(e){if(!drag||e.pointerId!==drag.id)return;const p=point(e);
    if(mode==='brush')stroke(drag.current,p);
    if(mode==='select'&&drag.object){const o=state.objects.find(o=>o.id===selected),b=bounds(o);let next={x:drag.object.x+p.x-drag.start.x,y:drag.object.y+p.y-drag.start.y};if($('ajusteMovimiento').value==='grid'){next=snap(next);next.x=Math.min(next.x,Math.floor((state.width-b.w)/state.step)*state.step);next.y=Math.min(next.y,Math.floor((state.length-b.h)/state.step)*state.step);}if($('ejeMovimiento').value==='x')next.y=drag.object.y;if($('ejeMovimiento').value==='y')next.x=drag.object.x;let candidate=magnet({...o,x:round(clamp(next.x,0,state.width-b.w)),y:round(clamp(next.y,0,state.length-b.h))});if($('ejeMovimiento').value==='x')candidate.y=o.y;if($('ejeMovimiento').value==='y')candidate.x=o.x;const start={...o};if(collision(start)&&!collision(candidate)){o.x=candidate.x;o.y=candidate.y;}else{const steps=Math.max(1,Math.ceil(Math.hypot(candidate.x-start.x,candidate.y-start.y)/.05));for(let i=1;i<=steps;i++){const part={...o,x:round(start.x+(candidate.x-start.x)*i/steps),y:round(start.y+(candidate.y-start.y)*i/steps)};if(collision(part)){if($('ajusteMovimiento').value==='grid'){o.x=start.x;o.y=start.y;}break;}o.x=part.x;o.y=part.y;}}fillForm(o);}
    drag.current=p;render();
  }
  canvas.addEventListener('pointermove',moving);
  canvas.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;moving(e);if(mode==='area')paintRect(area(drag.start,drag.current));const before=drag.before;drag=null;commit(before);});
  function cancel(){if(!drag)return;const before=drag.before;drag=null;restore(JSON.parse(before));render();say('Acción cancelada.');}
  canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
  document.querySelectorAll('[data-material]').forEach(b=>b.addEventListener('click',()=>{cancel();endTools();material=b.dataset.material;if(!['brush','area'].includes(mode))mode='brush';sync();render();}));
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{cancel();endTools();mode=b.dataset.mode;sync();render();}));
  $('tamCelda').addEventListener('change',()=>action(()=>{state.step=Number($('tamCelda').value);say('Separación cambiada. Las superficies conservan su posición.');}));
  $('formTerreno').addEventListener('submit',e=>{e.preventDefault();const w=Number($('ancho').value),h=Number($('largo').value);if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||w>35||h<1||h>65)return say('Ancho: 1–35 m. Largo: 1–65 m.');if(state.dimensions.some(q=>q.x1>w||q.x2>w||q.y1>h||q.y2>h))return say('Hay cotas fuera de las nuevas medidas. Elimínalas antes de reducir el terreno.');if(state.objects.some(o=>!fits(o,w,h)))return say('Hay objetos fuera de las nuevas medidas. Muévelos o elimínalos antes de reducir el terreno.');action(()=>{state.width=w;state.length=h;cells=new Map([...cells].filter(([k])=>{const [x,y]=k.split(':').map(Number);return x*unit<w&&y*unit<h;}));say('Medidas actualizadas. El recorte de superficies se puede deshacer.');});});
  $('tipo').addEventListener('change',fresh);$('nuevoObjeto').addEventListener('click',fresh);
  $('formObjeto').addEventListener('submit',e=>{e.preventDefault();const type=$('tipo').value,o={id:selected||('o'+Date.now().toString(36)+Math.random().toString(36).slice(2)),type,x:Number($('objX').value),y:Number($('objY').value),w:Number($('objW').value),h:Number($('objH').value),rotation:Number($('rotacion').value)};if(!validObject(o)||!fits(o))return say('Revisa las medidas mínimas y que el objeto quede dentro del terreno.');if(collision(o))return say('El objeto se encimaría con otro. Muévelo o pulsa Nuevo objeto para buscar espacio.');action(()=>{if(selected)state.objects=state.objects.map(a=>a.id===selected?o:a);else state.objects.push(o);selected=o.id;mode='select';fillForm(o);say('Objeto colocado. Puedes moverlo o editar sus medidas.');});});
  $('otroObjeto').addEventListener('click',()=>{const base={id:uid(),type:$('tipo').value,x:0,y:0,w:Number($('objW').value),h:Number($('objH').value),rotation:Number($('rotacion').value)};if(!validObject(base))return say('Revisa las medidas.');const next=freePosition(base);if(!next)return say('No queda espacio libre para otro objeto de ese tamaño.');selected=null;fillForm(next);$('formObjeto').requestSubmit();});
  function remove(){if(!selected)return;action(()=>{state.objects=state.objects.filter(o=>o.id!==selected);selected=null;say('Objeto eliminado.');});}
  $('eliminarObjeto').addEventListener('click',remove);
  function history(back){cancel();const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(serialize());restore(JSON.parse(from.pop()));render();say(back?'Acción deshecha.':'Acción rehecha.');}
  $('deshacer').addEventListener('click',()=>history(true));$('rehacer').addEventListener('click',()=>history(false));
  window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='Escape'){cancel();selected=null;sync();render();}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();history(e.key.toLowerCase()==='z'&&!e.shiftKey);}});
  for(const [id,delta] of [['zoomMas',20],['zoomMenos',-20],['ajustar',0]])$(id).addEventListener('click',()=>{zoom=delta?clamp(Math.round(zoom*100)+delta,20,300)/100:1;sync();render();});
  $('mostrarGrid').addEventListener('change',e=>{showGrid=e.target.checked;render();});$('mostrarCotas').addEventListener('change',e=>{showCotas=e.target.checked;render();});
  $('vista').addEventListener('change',e=>{cancel();view=e.target.value;zoom=1;sync();render();canvas.parentElement.scrollTop=0;canvas.parentElement.scrollLeft=0;say('Vista '+view+'. Las coordenadas y medidas reales se conservan.');});
  $('cotasObjetos').addEventListener('change',e=>{objectDimensions=e.target.value;render();});
  $('pantalla').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{say('Pantalla completa no disponible. Puedes ampliar con F11.');}});
  function validObject(o){return o&&typeof o.id==='string'&&o.id.length<100&&Object.hasOwn(defaults,o.type)&&[o.x,o.y,o.w,o.h,o.rotation].every(Number.isFinite)&&[0,90].includes(o.rotation)&&o.w>=defaults[o.type][2]&&o.h>=(['pared','puerta','ventana'].includes(o.type)?.2:defaults[o.type][2])&&(!['pared','puerta','ventana'].includes(o.type)||Math.abs(o.h-.2)<1e-8);}
  function validate(raw){
    if(!raw||![1,2].includes(raw.version)||![raw.width,raw.length,raw.step].every(Number.isFinite)||raw.width<1||raw.width>35||raw.length<1||raw.length>65||![1,.5,.25].includes(raw.step)||!Array.isArray(raw.cells)||raw.cells.length>40000)throw Error('Formato o medidas del proyecto no válidos.');
    const converted=new Map();for(const entry of raw.cells){if(!Array.isArray(entry)||entry.length!==2)throw Error('Celda no válida.');const [k,v]=entry;if(typeof k!=='string'||!/^\d{1,3}:\d{1,3}$/.test(k)||!Object.hasOwn(materials,v))throw Error('Material o coordenada no válido.');const [x,y]=k.split(':').map(Number),s=raw.version===1?raw.step:unit;if(x*s>=raw.width||y*s>=raw.length)throw Error('Superficie fuera del terreno.');for(let yy=y*s;yy<Math.min((y+1)*s,raw.length)-1e-8;yy+=unit)for(let xx=x*s;xx<Math.min((x+1)*s,raw.width)-1e-8;xx+=unit)converted.set(Math.round(xx/unit)+':'+Math.round(yy/unit),v);}
    const objects=raw.version===1?[]:raw.objects;if(!Array.isArray(objects)||objects.length>2000||objects.some(o=>!validObject(o)||!fits(o,raw.width,raw.length))||new Set(objects.map(o=>o.id)).size!==objects.length)throw Error('Objetos o dimensiones no válidos.');
    const dimensions=raw.dimensions??[];if(!Array.isArray(dimensions)||dimensions.length>1000||dimensions.some(q=>!q||typeof q.id!=='string'||q.id.length>100||!['x','y'].includes(q.axis)||![q.x1,q.y1,q.x2,q.y2,q.offset].every(Number.isFinite)||Math.abs(q.offset)>65||q.x1<0||q.x2<0||q.y1<0||q.y2<0||q.x1>raw.width||q.x2>raw.width||q.y1>raw.length||q.y2>raw.length||(q.axis==='x'?(q.y1!==q.y2||(!q.link&&q.x1===q.x2)):(q.x1!==q.x2||(!q.link&&q.y1===q.y2))))||new Set(dimensions.map(q=>q.id)).size!==dimensions.length)throw Error('Cotas no válidas.');
    for(const q of dimensions)if(q.link){const refs=[q.link.a,q.link.b];if(refs.some(r=>!r||typeof r.id!=='string'||!objects.some(o=>o.id===r.id)||!(q.axis==='x'?['left','right']:['top','bottom']).includes(r.side)||!Number.isFinite(r.t)||r.t<0||r.t>1)||refs[0].id===refs[1].id)throw Error('Referencias de cota no válidas.');}
    return {version:2,width:raw.width,length:raw.length,step:raw.step,cells:[...converted],objects:objects.map(({id,type,x,y,w,h,rotation})=>({id,type,x,y,w,h,rotation})),dimensions:dimensions.map(({id,axis,x1,y1,x2,y2,offset,link})=>({id,axis,x1,y1,x2,y2,offset,...(link?{link:{a:{id:link.a.id,side:link.a.side,t:link.a.t},b:{id:link.b.id,side:link.b.side,t:link.b.t}}}:{})}))};
  }
  function load(raw){const p=validate(raw);action(()=>{restore(p);say('Proyecto cargado. Puedes deshacer la importación.');});}
  $('guardar').addEventListener('click',()=>{try{localStorage.setItem(storageKey,serialize());say('Proyecto guardado en este navegador.');}catch{say('No se pudo guardar. Exporta el proyecto como JSON.');}});
  $('cargar').addEventListener('click',()=>{try{const raw=localStorage.getItem(storageKey)||localStorage.getItem('editor-quintas-v1');if(!raw)return say('No hay un proyecto guardado en este navegador.');load(JSON.parse(raw));}catch(e){say('No se pudo cargar: '+e.message);}});
  $('exportar').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(project(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='quinta-proyecto-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Proyecto exportado como JSON.');});
  $('importar').addEventListener('click',()=>$('archivo').click());$('archivo').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>8*1024*1024)throw Error('El archivo supera 8 MB.');load(JSON.parse(await file.text()));}catch(err){say('No se pudo importar: '+err.message);}finally{e.target.value='';}});
  window.addEventListener('resize',render);
  window.addEventListener('load',render);
  document.addEventListener('fullscreenchange',render);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>render()).observe(canvas.parentElement);
  try{const saved=localStorage.getItem(storageKey)||localStorage.getItem('editor-quintas-v1');if(saved){restore(validate(JSON.parse(saved)));say('Se recuperó tu proyecto guardado.');}}catch{say('El guardado anterior no se pudo leer. Puedes importar otro JSON.');}
  fresh();sync();render();
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>requestAnimationFrame(render));
})();
