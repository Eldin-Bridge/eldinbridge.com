'use strict';

// Shared metric layout used by both 2D and 3D. The 6 m aisle is a design assumption.
function quintaRect(o,r){return o.rotation===90?{x:o.x+o.h-r.y-r.h,y:o.y+r.x,w:r.h,h:r.w}:{x:o.x+r.x,y:o.y+r.y,w:r.w,h:r.h};}
function quintaParking(o){
  const bayWidth=2.4,bayLength=5,aisleWidth=6,epsilon=1e-8;let best={count:0,across:0,depth:0,swapped:false,doubles:0,singles:0};
  for(const swapped of [false,true]){const across=swapped?o.h:o.w,depth=swapped?o.w:o.h,columns=Math.floor((across+epsilon)/bayWidth);if(!columns)continue;
    for(let doubles=0;doubles<=Math.floor((depth+epsilon)/16);doubles++){const singles=Math.floor((depth-doubles*16+epsilon)/11),rows=doubles*2+singles,count=rows*columns;if(count>best.count)best={count,across,depth,swapped,doubles,singles,columns};}
  }
  const bays=[],aisles=[];const map=r=>quintaRect(o,best.swapped?{x:r.y,y:r.x,w:r.h,h:r.w}:r);let depth=0;
  function row(y){const inset=(best.across-best.columns*bayWidth)/2;for(let col=0;col<best.columns;col++){const local={x:inset+col*bayWidth,y,w:bayWidth,h:bayLength};bays.push({bay:map(local),car:map({x:local.x+.3,y:y+.35,w:1.8,h:4.3})});}}
  for(let module=0;module<best.doubles+best.singles;module++){const dual=module<best.doubles;row(depth);aisles.push(map({x:0,y:depth+5,w:best.across,h:aisleWidth}));if(dual)row(depth+11);depth+=dual?16:11;}
  return {bays,aisles,capacity:bays.length,bayWidth,bayLength,aisleWidth};
}


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
  const defaults = {pared:[3,.2,.2], puerta:[1,.2,.6], ventana:[1.2,.2,.3], arbol:[2,2,.5],arbolAlcorque:[2.5,2.5,1.2],farol:[.6,.6,.3],mesaConBancas:[2.4,2,1], palapa:[4,4,1], casa:[6,8,2], alberca:[3,5,1], bano:[2,2,1],regaderas:[2,3,1],arbusto:[1,1,.3],fuente:[2,2,.5],flores:[1,1,.2],gallinero:[3,3,1],fogatero:[2,2,.5],estacionamiento:[12,11,1],cocina:[5,4,1],juegos:[8,3,1],pista:[6,6,1],escenario:[6,3,1]};
  const storageKey = 'editor-quintas-v2', unit = .25, margin = 56;
  let state = {version:2,width:35,length:65,step:1,cells:[],objects:[],dimensions:[]};
  let selectedIds=new Set();
  let cells = new Map(), undo = [], redo = [], selected = null, drag = null;
  let mode = 'select', material = 'pasto', zoom = 1, scale = 10, showGrid = true, showCotas = true;
  let view = 'horizontal', objectDimensions = 'todos';
  let pan={x:0,y:0},panDrag=null;
  let chainPoint=null,lastWall=null,dimensionPoints=[];
  let freeDimensionSide=null;
  let separationPoints=[],separationClicks=[],separationAxis='x';
  let inspectorEdit=null;
  let terrainHover=null;
  let pendingErase=null,dimensionHits=[],activeDimensionId=null;
  let referenceImage=null,detectedWalls=[];
  const uid=()=> 'o'+Date.now().toString(36)+Math.random().toString(36).slice(2);
  const snap=p=>({x:round(clamp(Math.round(p.x/state.step)*state.step,0,state.width)),y:round(clamp(Math.round(p.y/state.step)*state.step,0,state.length))});
  function endTools(){terrainHover=null;chainPoint=null;lastWall=null;dimensionPoints=[];freeDimensionSide=null;separationPoints=[];separationClicks=[];$('cotaEnPlano').hidden=true;if($('puntosSeparacion'))$('puntosSeparacion').textContent='Pulsa una pared de referencia y después el lado del objeto que deseas mover.';}
  function referenceBounds(ref){if(ref.kind==='terrain')return {x:0,y:0,w:state.width,h:state.length};if(ref.kind==='surface')return cells.has(ref.key)?{x:ref.x,y:ref.y,w:ref.w,h:ref.h}:null;const o=state.objects.find(o=>o.id===ref.id);return o?bounds(o):null;}
  function edgePoint(ref){const b=referenceBounds(ref);if(!b)return null;return ref.side==='left'?{x:b.x,y:b.y+b.h*ref.t}:ref.side==='right'?{x:b.x+b.w,y:b.y+b.h*ref.t}:ref.side==='top'?{x:b.x+b.w*ref.t,y:b.y}:{x:b.x+b.w*ref.t,y:b.y+b.h};}
  function refreshDimensions(){state.dimensions=state.dimensions.filter(q=>{if(!q.link)return true;const a=edgePoint(q.link.a),b=edgePoint(q.link.b);if(!a||!b)return false;q.x1=a.x;q.x2=q.axis==='x'?b.x:a.x;q.y1=a.y;q.y2=q.axis==='y'?b.y:a.y;return true;});}
  function linkedCount(axis){return state.dimensions.filter(q=>q.link&&q.axis===axis).length;}
  let matrix = [0,-1,1,0], offset = {x:margin,y:margin};
  function projection() {
    matrix = view==='vertical'?[1,0,0,1]:view==='horizontal'?[0,-1,1,0]:[Math.sqrt(3)/2,.5,-Math.sqrt(3)/2,.5];
    const [a,b,c,d]=matrix;
    const points=[[0,0],[state.width,0],[state.width,state.length],[0,state.length]];
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
  function restore(p,preserveImage=false) { state = JSON.parse(JSON.stringify(p)); state.dimensions ||= [];cells = new Map(state.cells); selected = null;if(!preserveImage)referenceImage=null;detectedWalls=[];endTools(); sync(); }
  function commit(before) {
    if (before !== serialize()) { undo.push(before); if(undo.length>40) undo.shift(); redo=[]; }
    sync(); render();try{localStorage.setItem(storageKey,serialize());}catch{}
  }
  function action(fn) { if(drag) return;finishInspector(); const before=serialize(); fn(); commit(before); }
  function bounds(o) { return {x:o.x,y:o.y,w:o.rotation===90?o.h:o.w,h:o.rotation===90?o.w:o.h}; }
  function fits(o,w=state.width,h=state.length) {const b=bounds(o);return b.x>=0&&b.y>=0&&b.x+b.w<=w+1e-8&&b.y+b.h<=h+1e-8;}
  function overlap(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
  function collision(o,other=state.objects){return other.some(a=>{if(a.id===o.id)return false;if((o.type==='pared'&&['puerta','ventana'].includes(a.type))||(a.type==='pared'&&['puerta','ventana'].includes(o.type)))return false;const bo=bounds(o),ba=bounds(a),area=overlap(bo,ba);if(area>1e-8&&area>=Math.min(bo.w*bo.h,ba.w*ba.h)-1e-8)return true;return area>(a.type==='pared'&&o.type==='pared'?.040001:1e-8);});}
  function freePosition(o){const b=bounds(o),cx=round((state.width-b.w)/2),cy=round((state.length-b.h)/2),candidates=[];for(let y=0;y<=state.length-b.h+.001;y+=.5)for(let x=0;x<=state.width-b.w+.001;x+=.5)candidates.push({x,y});candidates.unshift({x:cx,y:cy});candidates.sort((a,b)=>(Math.abs(a.x-cx)+Math.abs(a.y-cy)*2)-(Math.abs(b.x-cx)+Math.abs(b.y-cy)*2));return candidates.map(p=>({...o,...p})).find(p=>fits(p)&&!collision(p))||null;}
  function magnet(o){if(!$('pegarObjetos').checked||$('ajusteMovimiento').value==='grid')return o;const b=bounds(o),limit=Math.min(.4,10/scale),candidates=[o];for(const a of state.objects){if(a.id===o.id)continue;const r=bounds(a);if(b.y<r.y+r.h+.1&&b.y+b.h>r.y-.1)for(const x of [r.x-b.w,r.x+r.w])if(Math.abs(x-o.x)<=limit)candidates.push({...o,x:round(x)});if(b.x<r.x+r.w+.1&&b.x+b.w>r.x-.1)for(const y of [r.y-b.h,r.y+r.h])if(Math.abs(y-o.y)<=limit)candidates.push({...o,y:round(y)});}const valid=candidates.filter(p=>fits(p)&&!collision(p));return valid.length>1?valid[valid.length-1]:o;}
  function normalizeSelection(){if(!selected){selectedIds.clear();return;}selectedIds=new Set([...selectedIds].filter(id=>state.objects.some(o=>o.id===id)));if(!state.objects.some(o=>o.id===selected)){selected=[...selectedIds][0]||null;if(!selected){selectedIds.clear();return;}}if(!selectedIds.has(selected))selectedIds=new Set([selected]);}
  function sync() {
    normalizeSelection();syncInspector();
    $('ancho').value=state.width; $('largo').value=state.length; $('tamCelda').value=state.step;
    $('deshacer').disabled=!undo.length; $('rehacer').disabled=!redo.length;
    $('seleccionInfo').textContent=selectedIds.size>1?selectedIds.size+' objetos seleccionados. Arrastra cualquiera para mover el conjunto.':selected?'Objeto seleccionado: arrastra para moverlo; cambia sus medidas aquí. Agregar coloca otro objeto.':'Selecciona un objeto en el plano para moverlo o editar sus medidas.';
    $('aplicarObjeto').textContent='Agregar';for(const [id,on] of [['manoPlano',mode==='pan'],['borradorPlano',mode==='erase'],['seleccionarPlano',mode==='select']]){$(id).classList.toggle('activo',on);$(id).setAttribute('aria-pressed',String(on));}
    $('zoomMas').disabled=zoom>=3; $('zoomMenos').disabled=zoom<=.2;
    document.querySelectorAll('[data-material]').forEach(b=>{const active=b.dataset.material===material; b.classList.toggle('activo',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('activo',active);b.setAttribute('aria-pressed',String(active));});
    $('instruccion').textContent=mode==='select'?'Selector · Arrastra desde un espacio vacío para seleccionar varios objetos. Arrastra un seleccionado para mover el conjunto. Suprimir pide confirmar el borrado.':`${names[material]} · ${mode==='area'?'Área: arrastra un rectángulo':'Pincel: arrastra sobre el terreno'}.`;
    canvas.style.cursor=mode==='pan'?'grab':mode==='select'?'grab':'crosshair';
    if(mode==='pan')$('instruccion').textContent='Mano · Mantén el clic izquierdo y arrastra para desplazar el plano. Centrar vuelve a colocar el dibujo en medio.';
    if(mode==='erase')$('instruccion').textContent='Borrador · Pulsa un objeto, superficie o cota y confirma con Sí o No.';
    if(mode==='wall')$('instruccion').textContent='Paredes · Pulsa el inicio y después el final de cada tramo. Puedes girar cambiando de eje. Escape termina.';
    if(mode==='dimension')$('instruccion').textContent='Cota manual · 1: inicio · 2: final · 3: posición de la línea de cota (puede ser exterior).';
    if(mode==='separation')$('instruccion').textContent='Separación · Pulsa el lado de la referencia y luego el lado del objeto; escribe la distancia aquí mismo.';
  }
  function fillForm(o) {
    $('tipo').value=o.type; $('objW').value=o.w; $('objH').value=o.h; $('rotacion').value=o.rotation;
    constraints();syncInspector();
  }
  function syncInspector(force=false){normalizeSelection();for(const id of ['anchoInspector','largoInspector','orientacionInspector']){const field=$(id);field.disabled=selectedIds.size>1;const label=field.closest('label');if(label)label.hidden=selectedIds.size>1;}if(selectedIds.size>1){$('inspectorObjeto').hidden=false;$('nombreInspector').textContent=selectedIds.size+' objetos seleccionados';$('detalleObjetoInspector').textContent='Arrastra cualquiera de los seleccionados para moverlos juntos.';$('mensajeInspector').textContent='Para modificar medidas, selecciona un solo objeto.';return;}if($('mensajeInspector').textContent==='Para modificar medidas, selecciona un solo objeto.')$('mensajeInspector').textContent='Los cambios se reflejan en el plano al escribir.';const o=state.objects.find(o=>o.id===selected),panel=$('inspectorObjeto');panel.hidden=!o;if(!o)return;$('nombreInspector').textContent=o.type==='regaderas'?'Regaderas':o.type.charAt(0).toUpperCase()+o.type.slice(1);const thin=['pared','puerta','ventana'].includes(o.type),values={anchoInspector:o.w,largoInspector:o.h,orientacionInspector:o.rotation};for(const [id,value]of Object.entries(values)){if(force||document.activeElement!==$(id))$(id).value=value;}$('anchoInspector').min=defaults[o.type][2];$('largoInspector').min=thin?.2:defaults[o.type][2];$('largoInspector').readOnly=thin;$('detalleObjetoInspector').textContent=o.type==='estacionamiento'?quintaParking(o).capacity+' cajones de 2.40 × 5 m; pasillo libre de 6 m.':o.type==='arbolAlcorque'?'Alcorque redondo: 1 m de altura.':o.type==='mesaConBancas'?'Mesa y dos bancas longitudinales: un solo objeto.':'';}
  function finishInspector(){if(!inspectorEdit)return;const edit=inspectorEdit;inspectorEdit=null;commit(edit.before);syncInspector(true);}
  function liveInspector(){if(selectedIds.size>1)return;const o=state.objects.find(o=>o.id===selected);if(!o)return;if(!inspectorEdit)inspectorEdit={id:o.id,before:serialize()};const fields=[$('anchoInspector'),$('largoInspector'),$('orientacionInspector')];if(fields.some(f=>String(f.value).trim()==='')){$('mensajeInspector').textContent='Completa la medida.';return;}const next={...o,w:Number(fields[0].value),h:Number(fields[1].value),rotation:Number(fields[2].value)};if(!validObject(next)||!fits(next)||collision(next)){$('mensajeInspector').textContent='La medida no cabe o encimaría otro objeto.';return;}state.objects=state.objects.map(a=>a.id===next.id?next:a);syncInspector();$('objW').value=next.w;$('objH').value=next.h;$('rotacion').value=next.rotation;render();$('mensajeInspector').textContent='Medidas actualizadas.';}
  for(const id of ['anchoInspector','largoInspector','orientacionInspector']){$(id).addEventListener('input',liveInspector);$(id).addEventListener('change',()=>{liveInspector();finishInspector();});$(id).addEventListener('blur',finishInspector);}
  $('cerrarInspector').addEventListener('click',()=>{finishInspector();selected=null;sync();render();});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#inspectorObjeto'))finishInspector();});
  function constraints() {
    $('opcionesPared').hidden=$('tipo').value!=='pared';
    const type=$('tipo').value, min=defaults[type][2], thin=['pared','puerta','ventana'].includes(type);
    $('objW').min=min; $('objH').min=thin?.2:min; $('objH').readOnly=thin;
    if(thin) $('objH').value=.2;
    $('objAyuda').textContent=(thin?'Grosor fijo: 0.20 m. ':'')+`Medida mínima: ${fmt(min)} m. Selecciona un objeto para editar estas medidas.${type==='pared'?' Encadenar: pulsa Agregar y marca el recorrido. Sin marcar: coloca una pared libre.':''}`;
  }
  function fresh() {finishInspector();selected=null;$('encadenar').checked=false; const t=$('tipo').value,base={id:uid(),type:t,x:0,y:0,w:defaults[t][0],h:defaults[t][1],rotation:0},placed=freePosition(base);fillForm(placed||base);if(!placed)say('No queda espacio para este tamaño. Reduce sus medidas.');sync();render();}
  function render() {
    refreshDimensions();dimensionHits=[];activeDimensionId=null;
    const host=canvas.parentElement;
    const projected=projection();
    if(host.clientWidth<1||host.clientHeight<1)return;
    const padding=margin+26*Math.max(1,...Object.values(dimensionLayout().counts));
    scale=clamp(Math.min(Math.max(30,host.clientWidth-2*padding-26)/projected.w,Math.max(30,host.clientHeight-2*padding-26)/projected.h)*zoom,.1,Infinity);
    const w=state.width*scale,h=state.length*scale,cw=Math.ceil(Math.max(projected.w*scale+padding*2,host.clientWidth-26)),ch=Math.ceil(Math.max(projected.h*scale+padding*2,host.clientHeight-26)),dpr=Math.min(window.devicePixelRatio||1,2);
    offset={x:(cw-projected.w*scale)/2-projected.minX*scale+pan.x,y:(ch-projected.h*scale)/2-projected.minY*scale+pan.y};
    // Resize only when needed: changing canvas dimensions during a stroke can lose pointer capture in some browsers.
    if(canvas.width!==Math.round(cw*dpr)||canvas.height!==Math.round(ch*dpr)){canvas.width=Math.round(cw*dpr);canvas.height=Math.round(ch*dpr);canvas.style.width=cw+'px';canvas.style.height=ch+'px';}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#101b2b';ctx.fillRect(0,0,cw,ch);ctx.save();ctx.translate(offset.x,offset.y);ctx.transform(...matrix,0,0);
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();ctx.fillStyle='#d9d2b8';ctx.fillRect(0,0,w,h);
    for(const [key,value] of cells){const [x,y]=key.split(':').map(Number);ctx.fillStyle=value==='vitropiso'?((x+y)%2?'#20232a':'#fff'):materials[value];ctx.fillRect(x*unit*scale,y*unit*scale,unit*scale+.2,unit*scale+.2);}
    if(referenceImage){const r=referenceImage;ctx.save();ctx.globalAlpha=r.opacity;ctx.drawImage(r.image,r.x*scale,r.y*scale,r.w*scale,r.h*scale);ctx.restore();}
    if(showGrid){ctx.strokeStyle='rgba(24,47,57,.25)';ctx.lineWidth=.6;ctx.beginPath();for(let x=0;x<=state.width+1e-8;x+=state.step){ctx.moveTo(x*scale,0);ctx.lineTo(x*scale,h);}for(let y=0;y<=state.length+1e-8;y+=state.step){ctx.moveTo(0,y*scale);ctx.lineTo(w,y*scale);}ctx.stroke();}
    // Openings appear over walls regardless of their creation order.
    const objects=[...state.objects].sort((a,b)=>(['puerta','ventana'].includes(a.type)?1:0)-(['puerta','ventana'].includes(b.type)?1:0));
    for(const o of objects) drawObject(o);
    ctx.save();ctx.globalAlpha=.6;ctx.strokeStyle='#ffe06b';ctx.lineWidth=2;for(const o of detectedWalls){const b=bounds(o);ctx.strokeRect(b.x*scale,b.y*scale,b.w*scale,b.h*scale);}ctx.restore();
    if(drag&&mode==='area'){const r=area(drag.start,drag.current);ctx.fillStyle='#4191ff44';ctx.strokeStyle='#257cff';ctx.lineWidth=2;ctx.fillRect(r.x*scale,r.y*scale,r.w*scale,r.h*scale);ctx.strokeRect(r.x*scale,r.y*scale,r.w*scale,r.h*scale);}
    ctx.restore();ctx.strokeStyle='#b7cce1';ctx.lineWidth=1.5;ctx.strokeRect(0,0,w,h);
    ctx.restore();
    if(drag?.marquee){const r=marqueeRect();ctx.save();ctx.fillStyle='#4b9dff33';ctx.strokeStyle='#75b4ff';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.restore();}
    if(objectDimensions!=='ninguno')for(const o of state.objects){if(objectDimensions==='seleccion'&&!selectedIds.has(o.id))continue;const b=bounds(o),center=screen(b.x+b.w/2,b.y+b.h/2);dimension(screen(b.x,b.y),screen(b.x+b.w,b.y),b.w,center,13,selectedIds.has(o.id));dimension(screen(b.x+b.w,b.y),screen(b.x+b.w,b.y+b.h),b.h,center,13,o.id===selected);}
    drawPlanDimensions();
    activeDimensionId=null;
    if(terrainHover&&!separationPoints.length&&mode==='separation'){const p=edgePoint(terrainHover),q=screen(p.x,p.y);ctx.fillStyle='#ff4d4d';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.fill();ctx.stroke();}
    if(chainPoint){const q=screen(chainPoint.x,chainPoint.y);ctx.fillStyle='#ffe06b';ctx.beginPath();ctx.arc(q.x,q.y,5,0,Math.PI*2);ctx.fill();}for(const p of [...dimensionPoints,...separationPoints.map(edgePoint)].filter(Boolean)){const q=screen(p.x,p.y);ctx.fillStyle='#ff4d4d';ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(q.x,q.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();}
    $('infoTerreno').textContent=`${fmt(state.width)} × ${fmt(state.length)} m · ${fmt(state.width*state.length)} m² · ${Math.round(zoom*100)}%`;
  }
  // Dimensions are drawn in screen space so labels remain readable in all views.
  // All dimensions on a side share baselines. Overlapping or enclosing spans
  // use an outer lane; disjoint spans (including equal spans) share one lane.
  function dimensionSide(q){
    if(q.side)return q.side;
    if(!q.link)return q.axis==='x'?(q.offset<0?'top':'bottom'):(q.offset<0?'left':'right');
    const a=edgePoint(q.link.a),b=edgePoint(q.link.b);
    return q.axis==='x'?((a.y+b.y)/2<=state.length/2?'top':'bottom'):((a.x+b.x)/2<=state.width/2?'left':'right');
  }
  function dimensionLayout(){
    const groups={top:[],bottom:[],left:[],right:[]},counts={top:0,bottom:0,left:0,right:0};
    for(const q of state.dimensions){const side=dimensionSide(q),horizontal=['top','bottom'].includes(side),a=q.link?edgePoint(q.link.a):{x:q.x1,y:q.y1},b=q.link?edgePoint(q.link.b):{x:q.x2,y:q.y2};if(!a||!b)continue;const lo=Math.min(horizontal?a.x:a.y,horizontal?b.x:b.y),hi=Math.max(horizontal?a.x:a.y,horizontal?b.x:b.y);groups[side].push({q,a,b,lo,hi,size:q.free?(q.measurement??Math.hypot(b.x-a.x,b.y-a.y)):Math.abs(horizontal?b.x-a.x:b.y-a.y)});}
    for(const side in groups){const lanes=[];groups[side].sort((a,b)=>a.size-b.size||a.lo-b.lo);for(const item of groups[side]){let lane=0;while(lanes[lane]?.some(other=>Math.min(item.hi,other.hi)-Math.max(item.lo,other.lo)>1e-6))lane++;(lanes[lane]??=[]).push(item);item.lane=lane;}counts[side]=lanes.length;}
    return {groups,counts};
  }
  function drawPlanDimensions(){
    const {groups,counts}=dimensionLayout(),center=screen(state.width/2,state.length/2);
    const edges={top:[[0,0],[state.width,0]],bottom:[[0,state.length],[state.width,state.length]],left:[[0,0],[0,state.length]],right:[[state.width,0],[state.width,state.length]]};
    for(const side in groups){const [ea,eb]=edges[side],sa=screen(...ea),sb=screen(...eb);
      for(const item of groups[side]){
        const {q,a,b,lane}=item,pa=screen(a.x,a.y),pb=screen(b.x,b.y);
        let start,end,value;
        if(q.free){start=pa;end=pb;value=q.measurement??Math.hypot(b.x-a.x,b.y-a.y);}
        else {const horizontal=['top','bottom'].includes(side);start=horizontal?screen(a.x,ea[1]):screen(ea[0],a.y);end=horizontal?screen(b.x,ea[1]):screen(ea[0],b.y);value=Math.abs(horizontal?b.x-a.x:b.y-a.y);}
        const dx=end.x-start.x,dy=end.y-start.y,len=Math.hypot(dx,dy);if(len<.01)continue;
        let nx=-dy/len,ny=dx/len;const edgeMid={x:(sa.x+sb.x)/2,y:(sa.y+sb.y)/2};if(nx*(edgeMid.x-center.x)+ny*(edgeMid.y-center.y)<0){nx=-nx;ny=-ny;}
        const boundary=Math.max(...[[0,0],[state.width,0],[state.width,state.length],[0,state.length]].map(p=>{const sp=screen(...p);return sp.x*nx+sp.y*ny;}));
        const gap=boundary-(start.x*nx+start.y*ny)+29+lane*26;
        if(!q.free){ctx.save();ctx.strokeStyle='#7894af';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(start.x,start.y);ctx.moveTo(pb.x,pb.y);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.restore();}
        activeDimensionId=q.id;dimension(start,end,value,{x:start.x-nx,y:start.y-ny},gap,true);
      }
      activeDimensionId=null;
      if(showCotas&&(side==='top'||side==='left'))dimension(sa,sb,['top','bottom'].includes(side)?state.width:state.length,center,29+counts[side]*26);
    }
  }
  function dimension(a,b,value,center,gap,active=false){
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.01)return;
    let nx=-dy/len,ny=dx/len;const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(nx*(mid.x-center.x)+ny*(mid.y-center.y)<0){nx=-nx;ny=-ny;}
    const p={x:a.x+nx*gap,y:a.y+ny*gap},q={x:b.x+nx*gap,y:b.y+ny*gap};if(activeDimensionId)dimensionHits.push({id:activeDimensionId,a:p,b:q});
    ctx.save();ctx.strokeStyle=active?'#ff6767':'#bdd6ee';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(a.x+nx*4,a.y+ny*4);ctx.lineTo(p.x+nx*5,p.y+ny*5);ctx.moveTo(b.x+nx*4,b.y+ny*4);ctx.lineTo(q.x+nx*5,q.y+ny*5);ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
    for(const t of [p,q]){ctx.moveTo(t.x-dx/len*3-nx*3,t.y-dy/len*3-ny*3);ctx.lineTo(t.x+dx/len*3+nx*3,t.y+dy/len*3+ny*3);}ctx.stroke();
    let angle=Math.atan2(dy,dx);while(angle>=Math.PI/2-1e-8)angle-=Math.PI;while(angle< -Math.PI/2-1e-8)angle+=Math.PI;
    ctx.translate((p.x+q.x)/2+nx*8,(p.y+q.y)/2+ny*8);ctx.rotate(angle);ctx.font='12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';const label=fmt(value)+' m',textWidth=ctx.measureText(label).width;ctx.fillStyle='#101b2bee';ctx.fillRect(-textWidth/2-4,-8,textWidth+8,16);ctx.fillStyle=active?'#ff8585':'#e3efff';ctx.fillText(label,0,0);ctx.restore();
  }
  function drawObject(o){
    const b=bounds(o),x=b.x*scale,y=b.y*scale,w=b.w*scale,h=b.h*scale;
    ctx.save();ctx.lineWidth=1;ctx.strokeStyle='#203142';
    const colors={pared:'#556577',puerta:'#b97b45',ventana:'#a9e5ff',arbol:'#39843f',arbolAlcorque:'#3b8a4c',farol:'#e6c35e',mesaConBancas:'#b8b8af',palapa:'#d3a65b',casa:'#c57c65',alberca:'#29b9e8',bano:'#d5dcec',regaderas:'#b6dfe3',arbusto:'#4c9f52',fuente:'#8fd7eb',flores:'#dc7eb2',gallinero:'#c9ad6f',fogatero:'#9e8675',estacionamiento:'#828d9d',cocina:'#cda87a',juegos:'#9fbd65',pista:'#af8056',escenario:'#797b9c'};
    ctx.fillStyle=colors[o.type];
    if(o.type==='arbol'){ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#715039';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.max(1,Math.min(w,h)*.1),0,Math.PI*2);ctx.fill();}
    else {if(!['farol','mesaConBancas','arbolAlcorque'].includes(o.type)){ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}
      if(['casa','palapa'].includes(o.type)){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w/2,y+h/2);ctx.lineTo(x+w,y);ctx.moveTo(x,y+h);ctx.lineTo(x+w/2,y+h/2);ctx.lineTo(x+w,y+h);ctx.stroke();}
      if(o.type==='alberca'&&w>8&&h>8){ctx.strokeStyle='#ddf9ff';ctx.strokeRect(x+3,y+3,w-6,h-6);}
      if(o.type==='puerta'){ctx.strokeStyle='#d49654';ctx.setLineDash([3,2]);ctx.beginPath();if(o.rotation===0){ctx.arc(x,y+h,w, -Math.PI/2,0);ctx.moveTo(x,y+h);ctx.lineTo(x,y+h+w);}else{ctx.arc(x+w,y,h,0,Math.PI/2);ctx.moveTo(x+w,y);ctx.lineTo(x+w+h,y);}ctx.stroke();}
      if(o.type==='ventana'){ctx.strokeStyle='#1978a5';ctx.beginPath();if(o.rotation===0){ctx.moveTo(x,y+h/2);ctx.lineTo(x+w,y+h/2);}else{ctx.moveTo(x+w/2,y);ctx.lineTo(x+w/2,y+h);}ctx.stroke();}
      if(o.type==='regaderas'){ctx.strokeStyle='#2c7f9c';for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(x+w*.15,y+h*i/4);ctx.lineTo(x+w*.85,y+h*i/4);ctx.stroke();}}
      if(o.type==='bano'){ctx.strokeStyle='#57728a';ctx.fillStyle='#fff';ctx.fillRect(x+w*.3,y+h*.15,w*.4,h*.2);ctx.beginPath();ctx.ellipse(x+w*.5,y+h*.55,w*.2,h*.22,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
      if(o.type==='arbusto'){ctx.fillStyle='#247e3b';for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(x+w*(.25+i*.25),y+h*.5,w*.23,h*.4,0,0,Math.PI*2);ctx.fill();}}
      if(o.type==='fuente'){ctx.strokeStyle='#e3faff';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.4,h*.4,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.12,h*.12,0,0,Math.PI*2);ctx.stroke();}
      if(o.type==='gallinero'){ctx.setLineDash([3,2]);ctx.strokeStyle='#6f552b';ctx.strokeRect(x+w*.12,y+h*.12,w*.76,h*.76);ctx.setLineDash([]);}
      if(o.type==='fogatero'){ctx.fillStyle='#ff9845';ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.3,h*.3,0,0,Math.PI*2);ctx.fill();}
      if(o.type==='estacionamiento'){const layout=quintaParking(o);for(const a of layout.aisles){ctx.fillStyle='#495d68';ctx.fillRect(a.x*scale,a.y*scale,a.w*scale,a.h*scale);if(Math.max(a.w,a.h)*scale>65){ctx.fillStyle='#e4eccc';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText('PASO · 6 m', (a.x+a.w/2)*scale,(a.y+a.h/2)*scale);}}for(let i=0;i<layout.bays.length;i++){const {bay,car}=layout.bays[i];ctx.strokeStyle='#f3f0d6';ctx.lineWidth=1;ctx.strokeRect(bay.x*scale,bay.y*scale,bay.w*scale,bay.h*scale);ctx.fillStyle=['#4f85ad','#cbd4db','#a9454d','#3a4857'][i%4];ctx.fillRect(car.x*scale,car.y*scale,car.w*scale,car.h*scale);ctx.fillStyle='#a8cedc';ctx.fillRect((car.x+car.w*.15)*scale,(car.y+car.h*.3)*scale,car.w*.7*scale,car.h*.4*scale);}ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='11px system-ui';ctx.fillText(layout.capacity+' vehículos',x+w/2,y+h-4,Math.max(1,w-4));}
      if(o.type==='farol'){ctx.fillStyle='#4e5663';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.min(w,h)*.35,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffe1a1';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.min(w,h)*.22,0,Math.PI*2);ctx.fill();}
      if(o.type==='mesaConBancas'){for(const r of [{x:o.w*.34,y:o.h*.05,w:o.w*.32,h:o.h*.9},{x:o.w*.08,y:o.h*.06,w:o.w*.14,h:o.h*.88},{x:o.w*.78,y:o.h*.06,w:o.w*.14,h:o.h*.88}]){const b=quintaRect(o,r);ctx.fillStyle='#d1d2c8';ctx.fillRect(b.x*scale,b.y*scale,b.w*scale,b.h*scale);ctx.strokeRect(b.x*scale,b.y*scale,b.w*scale,b.h*scale);}}
      if(o.type==='arbolAlcorque'){ctx.fillStyle='#b5ad99';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.min(w,h)*.46,0,Math.PI*2);ctx.fill();ctx.fillStyle='#79664c';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.min(w,h)*.35,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3c8b49';ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.3,h*.3,0,0,Math.PI*2);ctx.fill();}
      if(o.type==='flores'){for(let i=0;i<5;i++){ctx.fillStyle=i%2?'#ffe384':'#edb9e6';ctx.beginPath();ctx.arc(x+w*(.2+(i%3)*.3),y+h*(.3+Math.floor(i/3)*.4),Math.max(1,Math.min(w,h)*.1),0,Math.PI*2);ctx.fill();}}
    }
    if(!['estacionamiento','farol','mesaConBancas','arbolAlcorque'].includes(o.type)&&w>35&&h>20){ctx.fillStyle='#10202c';ctx.textAlign='center';ctx.font='11px system-ui';ctx.fillText(o.type,x+w/2,y+h/2+4,Math.max(1,w-6));}
    if(selectedIds.has(o.id)){ctx.setLineDash([5,3]);ctx.strokeStyle='#ffe06b';ctx.lineWidth=3;ctx.strokeRect(x-3,y-3,w+6,h+6);}
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
    if(dimensionPoints.length<2){
      if(p.x< -1e-8||p.y< -1e-8||p.x>state.width+1e-8||p.y>state.length+1e-8)return say('Marca los extremos dentro del terreno o en su borde.');
      let border=terrainSnap(p);if(border){const bp=edgePoint(border),sp=screen(p.x,p.y),sb=screen(bp.x,bp.y);if(Math.hypot(sp.x-sb.x,sp.y-sb.y)>6)border=null;}let nearest=border?edgePoint(border):null,best=nearest?Math.hypot(screen(p.x,p.y).x-screen(nearest.x,nearest.y).x,screen(p.x,p.y).y-screen(nearest.x,nearest.y).y):10;
      if(!border)for(const o of state.objects){const b=bounds(o);for(const candidate of [{x:b.x,y:clamp(p.y,b.y,b.y+b.h)},{x:b.x+b.w,y:clamp(p.y,b.y,b.y+b.h)},{x:clamp(p.x,b.x,b.x+b.w),y:b.y},{x:clamp(p.x,b.x,b.x+b.w),y:b.y+b.h}]){const sp=screen(p.x,p.y),sc=screen(candidate.x,candidate.y),d=Math.hypot(sp.x-sc.x,sp.y-sc.y);if(d<best){best=d;nearest=candidate;}}}
      p=nearest||snap(p);p={x:round(clamp(p.x,0,state.width)),y:round(clamp(p.y,0,state.length))};
      if(dimensionPoints.length&&Math.hypot(p.x-dimensionPoints[0].x,p.y-dimensionPoints[0].y)<.001)return say('Elige un final distinto del inicio.');
      dimensionPoints.push(p);render();
      if(dimensionPoints.length===2){const [a,b]=dimensionPoints,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;freeDimensionSide=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y)?(my<=state.length/2?'top':'bottom'):(mx<=state.width/2?'left':'right');showDistanceEditor();say('Escribe la medida de la cota y pulsa Aplicar. Puedes pulsar fuera del terreno para cambiarla de lado.');}else say('Marca cualquier otro punto del plano.');return;
    }
    const choices=[{side:'left',d:-p.x},{side:'right',d:p.x-state.width},{side:'top',d:-p.y},{side:'bottom',d:p.y-state.length}].sort((a,b)=>b.d-a.d);
    if(choices[0].d<=0)return say('Pulsa fuera del terreno: arriba, abajo, izquierda o derecha.');
    freeDimensionSide=choices[0].side;say('Lado elegido. Escribe la medida y pulsa Aplicar.');
  }
  function applyFreeDimension(raw){
    const measurement=Number(raw);if(!String(raw).trim()||!Number.isFinite(measurement)||measurement<=0||measurement>1000)return say('Escribe una medida mayor que 0 y hasta 1000 m.');
    if(dimensionPoints.length!==2)return;
    const [a,b]=dimensionPoints,side=freeDimensionSide,axis=['top','bottom'].includes(side)?'x':'y';
    action(()=>state.dimensions.push({id:uid(),axis,x1:a.x,y1:a.y,x2:b.x,y2:b.y,offset:0,side,free:true,measurement}));
    dimensionPoints=[];freeDimensionSide=null;$('cotaEnPlano').hidden=true;render();say('Cota colocada. Las medidas mayores que se cruzan quedan más afuera.');
  }
  function anchorFor(ref,p,axis){if(ref.kind==='terrain'&&ref.side&&Number.isFinite(ref.t))return ref;const b=referenceBounds(ref),side=ref.kind==='terrain'&&ref.side?ref.side:axis==='x'?(Math.abs(p.x-b.x)<Math.abs(p.x-b.x-b.w)?'left':'right'):(Math.abs(p.y-b.y)<Math.abs(p.y-b.y-b.h)?'top':'bottom');return {...ref,side,t:clamp(axis==='x'?(p.y-b.y)/b.h:(p.x-b.x)/b.w,0,1)};}
  function terrainSnap(p){const cursor=screen(p.x,p.y),edges=[['left',[0,0],[0,state.length]],['right',[state.width,0],[state.width,state.length]],['top',[0,0],[state.width,0]],['bottom',[0,state.length],[state.width,state.length]]];let best=null;for(const [side,aa,bb] of edges){const a=screen(...aa),b=screen(...bb),dx=b.x-a.x,dy=b.y-a.y,t=clamp(((cursor.x-a.x)*dx+(cursor.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1),distance=Math.hypot(cursor.x-a.x-t*dx,cursor.y-a.y-t*dy);if(distance<=14&&(!best||distance<best.distance))best={kind:'terrain',side,t,distance};}return best?{kind:'terrain',side:best.side,t:best.t}:null;}
  function separationReference(p){const border=terrainSnap(p);if(border)return border;const hit=hitObject(p);if(hit)return {id:hit.id};if(p.x<0||p.y<0||p.x>=state.width||p.y>=state.length)return null;const r=area(p,p),direct=Math.floor(p.x/unit)+':'+Math.floor(p.y/unit),key=cells.has(direct)?direct:[...cells.keys()].find(k=>{const [x,y]=k.split(':').map(Number);return x*unit>=r.x&&x*unit<r.x+r.w&&y*unit>=r.y&&y*unit<r.y+r.h;});return key?{kind:'surface',id:'surface:'+r.x+':'+r.y+':'+r.w+':'+r.h,key,...r}:null;}
  function hitObject(p){return [...state.objects].sort((a,b)=>(['puerta','ventana'].includes(a.type)?1:0)-(['puerta','ventana'].includes(b.type)?1:0)).reverse().find(o=>{const b=bounds(o),pad=Math.max(.08,3/scale);return p.x>=b.x-pad&&p.x<=b.x+b.w+pad&&p.y>=b.y-pad&&p.y<=b.y+b.h+pad;});}
  function showDistanceEditor(){const free=mode==='dimension',[ra,rb]=separationPoints,a=free?dimensionPoints[0]:edgePoint(ra),b=free?dimensionPoints[1]:edgePoint(rb);if(!a||!b)return;const v=round(free?Math.hypot(b.x-a.x,b.y-a.y):Math.abs(a[separationAxis]-b[separationAxis]));$('tituloMedidaCota').textContent=free?'Medida de la cota (m)':'Separación (m)';$('metrosEnPlano').min=free?'0.01':'0';$('metrosEnPlano').max=free?'1000':'65';$('metrosEnPlano').value=v;closeMenus();const panel=$('cotaEnPlano'),host=canvas.parentElement,sp=screen(b.x,b.y);panel.style.left=clamp((canvas.offsetLeft||0)+sp.x+12,(host.scrollLeft||0)+12,(host.scrollLeft||0)+Math.max(12,host.clientWidth-320))+'px';panel.style.top=clamp((canvas.offsetTop||0)+sp.y+12,(host.scrollTop||0)+12,(host.scrollTop||0)+Math.max(12,host.clientHeight-100))+'px';panel.hidden=false;$('metrosEnPlano').focus();$('metrosEnPlano').select();}
  function chooseSeparation(p){if(separationPoints.length===2){separationPoints=[];separationClicks=[];$('cotaEnPlano').hidden=true;}
    if(!separationPoints.length){const ref=separationReference(p);if(!ref)return say('Pulsa el borde del terreno, una pared o un cuadro de superficie pintada.');const b=referenceBounds(ref),nearX=Math.min(Math.abs(p.x-b.x),Math.abs(p.x-b.x-b.w)),nearY=Math.min(Math.abs(p.y-b.y),Math.abs(p.y-b.y-b.h));separationPoints=[anchorFor(ref,p,nearX<=nearY?'x':'y')];separationClicks=[ref.kind==='terrain'?edgePoint(separationPoints[0]):p];terrainHover=null;say('Referencia elegida. Mantén la referencia y pulsa el lado del objeto que deseas separar.');}
    else{const hit=hitObject(p);if(!hit)return say('El segundo punto debe ser un objeto que se pueda mover.');if(!separationPoints[0].kind&&separationPoints[0].id===hit.id)return say('Elige un objeto diferente de la referencia.');const first=separationClicks[0];separationAxis=separationPoints[0].kind==='terrain'?(['left','right'].includes(separationPoints[0].side)?'x':'y'):(Math.abs(p.x-first.x)>=Math.abs(p.y-first.y)?'x':'y');separationPoints=[anchorFor(separationPoints[0],first,separationAxis),anchorFor({id:hit.id},p,separationAxis)];separationClicks.push(p);showDistanceEditor();say('Escribe la separación en metros sobre el plano.');}render();
  }
  function applySeparation(distance){
if(separationPoints.length!==2)return say('Primero elige una referencia y el lado de otro objeto.');
    const axis=separationAxis,dist=Number(distance);if(!Number.isFinite(dist)||dist<0||dist>65)return say('Introduce una distancia de 0 a 65 m.');
    const [ref,target]=separationPoints,a=edgePoint(ref),b=edgePoint(target),original=state.objects.find(o=>o.id===target.id);if(!a||!b||!original)return say('Selecciona nuevamente los dos lados.');
    const sign=Math.sign(b[axis]-a[axis])||(target.side==='left'||target.side==='top'?1:-1),next={...original,[axis]:round(original[axis]+a[axis]+sign*dist-b[axis])};
    if(!fits(next))return say('Esa separación dejaría el objeto fuera del terreno. Introduce una distancia menor.');
    if(collision(next))return say('Esa separación encimaría el objeto con otro. Elige otra medida.');
    const refs=JSON.parse(JSON.stringify({a:ref,b:target}));
    action(()=>{state.objects=state.objects.map(o=>o.id===next.id?next:o);state.dimensions=state.dimensions.filter(q=>!(q.link&&q.axis===axis&&q.link.a.id===ref.id&&q.link.a.kind===ref.kind&&q.link.a.side===ref.side&&q.link.b.id===target.id&&q.link.b.side===target.side));state.dimensions.push({id:uid(),axis,x1:a.x,y1:a.y,x2:axis==='x'?a.x+sign*dist:a.x,y2:axis==='y'?a.y+sign*dist:a.y,offset:0,link:refs});selected=next.id;fillForm(next);});
    closeMenus();$('cotaEnPlano').hidden=true;say(`Objeto separado ${fmt(dist)} m entre los lados elegidos. Cota colocada.`);
  }

  $('cotaEnPlano').addEventListener('submit',e=>{e.preventDefault();if(mode==='dimension')applyFreeDimension($('metrosEnPlano').value);else applySeparation($('metrosEnPlano').value);});
  $('cancelarCotaPlano').addEventListener('click',()=>{endTools();render();});
  function activateCota(){cancel();endTools();mode=$('tipoCota').value;sync();closeMenus();render();}
  $('tipoCota').addEventListener('change',activateCota);$('activarCota').addEventListener('click',activateCota);
  // Approximate local resource recognition by connected color regions; no background image is displayed.
  function interpretResources(pixels,iw,ih,frame){const step=Math.max(1,Math.ceil(Math.max(iw,ih)/240)),w=Math.ceil(iw/step),h=Math.ceil(ih/step),mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),found=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(Math.min(ih-1,y*step)*iw+Math.min(iw-1,x*step))*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max?(max-min)/max:0;if(pixels[i+3]<128)continue;if(b>85&&g>55&&b>g*1.05&&g>r*1.15)mask[y*w+x]=1;else if(g>45&&g<145&&g>r*1.4&&g>b*1.3)mask[y*w+x]=2;else if(max<180&&(sat<.3||(r>g*1.15&&r>b*1.25)))mask[y*w+x]=3;}
    for(let start=0;start<mask.length;start++){const cls=mask[start];if(!cls||seen[start])continue;const queue=[start];seen[start]=1;let minX=w,minY=h,maxX=0,maxY=0,count=0;for(let k=0;k<queue.length;k++){const q=queue[k],x=q%w,y=Math.floor(q/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,n=ny*w+nx;if(nx>=0&&ny>=0&&nx<w&&ny<h&&!seen[n]&&mask[n]===cls){seen[n]=1;queue.push(n);}}}
      const rw=(maxX-minX+1)/w*frame.w,rh=(maxY-minY+1)/h*frame.h,area=rw*rh,fill=count/((maxX-minX+1)*(maxY-minY+1));if(count<8||area>frame.w*frame.h*.45||rw/rh>6||rh/rw>6)continue;let type=null;if(cls===1&&area>=4&&fill>.22)type='alberca';if(cls===2&&area>=.5&&area<=25&&fill>.22)type='arbol';if(cls===3&&area>=6&&fill>.28)type=area>75&&Math.max(rw/rh,rh/rw)>1.6?'estacionamiento':'casa';if(!type)continue;const minSize=defaults[type][2],o={id:uid(),type,x:round(frame.x+minX/w*frame.w),y:round(frame.y+minY/h*frame.h),w:round(Math.max(minSize,rw)),h:round(Math.max(minSize,rh)),rotation:0};if(fits(o)&&!collision(o,found))found.push(o);
    }return found.sort((a,b)=>(a.type==='arbol'?1:0)-(b.type==='arbol'?1:0)).slice(0,150);
  }
  function interpretSurfaces(pixels,iw,ih,frame){
    const painted=new Map(),counts={pasto:0,piso:0,tierra:0,agua:0},areas={pasto:0,piso:0,tierra:0,agua:0},cols=Math.ceil(frame.w/unit-1e-8),rows=Math.ceil(frame.h/unit-1e-8);
    function classify(x,y){x=Math.max(0,Math.min(iw-1,Math.round(x)));y=Math.max(0,Math.min(ih-1,Math.round(y)));const i=(y*iw+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b),light=(r+g+b)/3,sat=hi?(hi-lo)/hi:0;if(pixels[i+3]<128)return 'pasto';if(g>r*1.08&&g>b*1.1)return 'pasto';if(b>g*1.03&&g>r*1.12&&hi>85)return 'agua';if(r>g*1.16&&g>b*1.12&&light>40&&light<185)return 'tierra';if((sat<.38&&light>65)||(r>=g&&r/g<1.2&&g>b&&light>115))return 'piso';return 'pasto';}
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const px=Math.min(frame.w,(x+.5)*unit)/frame.w*(iw-1),py=Math.min(frame.h,(y+.5)*unit)/frame.h*(ih-1),dx=Math.max(.5,iw*unit/frame.w*.2),dy=Math.max(.5,ih*unit/frame.h*.2),votes={pasto:0,piso:0,tierra:0,agua:0};for(const [a,b,weight]of [[0,0,2],[-dx,-dy,1],[dx,-dy,1],[-dx,dy,1],[dx,dy,1]])votes[classify(px+a,py+b)]+=weight;const material=Object.keys(votes).sort((a,b)=>votes[b]-votes[a])[0];painted.set(x+':'+y,material);counts[material]++;areas[material]+=Math.min(unit,frame.w-x*unit)*Math.min(unit,frame.h-y*unit);}
    const smoothed=new Map(painted);for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){const votes={pasto:0,piso:0,tierra:0,agua:0};for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)votes[painted.get((x+dx)+':'+(y+dy))]++;const dominant=Object.keys(votes).sort((a,b)=>votes[b]-votes[a])[0];if(votes[dominant]>=6)smoothed.set(x+':'+y,dominant);}for(const type of Object.keys(counts)){counts[type]=0;areas[type]=0;}for(const [key,material]of smoothed){const [x,y]=key.split(':').map(Number);counts[material]++;areas[material]+=Math.min(unit,frame.w-x*unit)*Math.min(unit,frame.h-y*unit);}
    return {cells:smoothed,counts,areas};
  }
  let imageGroundChanges=[];
  function restoreImageGround(){for(const change of imageGroundChanges)if(cells.get(change.key)===change.after){if(change.before===undefined)cells.delete(change.key);else cells.set(change.key,change.before);}}
  let imageGeneratedIds=[];
  let imageRequest=0;
  $('cargarImagen').addEventListener('click',()=>$('imagenPlano').click());
  $('imagenPlano').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024){say('Carga una imagen PNG, JPG o WebP de hasta 15 MB.');e.target.value='';return;}const token=++imageRequest,url=URL.createObjectURL(file),image=new Image();say('Leyendo superficies y elementos de la imagen…');image.onload=()=>{URL.revokeObjectURL(url);if(token!==imageRequest)return;cancel();finishInspector();referenceImage=null;detectedWalls=[];closeMenus();try{const factor=Math.min(1,1000/Math.max(image.naturalWidth,image.naturalHeight)),w=Math.max(1,Math.round(image.naturalWidth*factor)),h=Math.max(1,Math.round(image.naturalHeight*factor)),temp=document.createElement('canvas');temp.width=w;temp.height=h;const c=temp.getContext('2d',{willReadFrequently:true});c.fillStyle='#fff';c.fillRect(0,0,w,h);c.drawImage(image,0,0,w,h);const pixels=c.getImageData(0,0,w,h).data,frame={x:0,y:0,w:state.width,h:state.length},ground=interpretSurfaces(pixels,w,h,frame),resources=interpretResources(pixels,w,h,frame),walls=extractWalls(pixels,w,h,frame),ids=[],groundChanges=[];action(()=>{restoreImageGround();for(const [key,material]of ground.cells){groundChanges.push({key,before:cells.get(key),after:material});cells.set(key,material);}state.objects=state.objects.filter(o=>!imageGeneratedIds.includes(o.id));for(const o of [...resources,...walls])if(!collision(o)){state.objects.push(o);ids.push(o.id);}mode='select';selected=null;});imageGeneratedIds=ids;imageGroundChanges=groundChanges;say('Suelo pintado: '+fmt(ground.areas.pasto)+' m² de pasto, '+fmt(ground.areas.piso)+' m² de piso, '+fmt(ground.areas.tierra)+' m² de tierra y '+fmt(ground.areas.agua)+' m² de agua; '+ids.length+' objetos. Resultado aproximado y editable.');}catch{say('No se pudo interpretar la imagen. No se agregó como fondo.');}render();};image.onerror=()=>{URL.revokeObjectURL(url);if(token===imageRequest)say('No se pudo leer la imagen.');};image.src=url;e.target.value='';});
  $('quitarImagen').addEventListener('click',()=>{imageRequest++;referenceImage=null;detectedWalls=[];action(()=>{restoreImageGround();state.objects=state.objects.filter(o=>!imageGeneratedIds.includes(o.id));});imageGeneratedIds=[];imageGroundChanges=[];say('Superficies y objetos de la última imagen retirados. Puedes deshacerlo.');});
  // Conservative local line detector used by the image-loading action.
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
  $('encadenar').addEventListener('change',()=>{endTools();if(!$('encadenar').checked&&mode==='wall')mode='select';sync();render();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){endTools();render();}});
  function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
  function askErase(target){finishInspector();cancel();endTools();pendingErase=target;const description=target.kind==='objects'?target.ids.length+' objetos seleccionados':target.kind==='object'?'Objeto seleccionado':target.kind==='dimension'?'Cota seleccionada':target.kind==='surface'?'Superficie seleccionada':'Imagen de referencia';$('detalleBorrar').textContent=description;$('confirmarBorrado').showModal();}
  function eraseAt(p){const sp=screen(p.x,p.y),dim=[...dimensionHits].reverse().find(d=>segmentDistance(sp,d.a,d.b)<12);if(dim)return askErase({kind:'dimension',id:dim.id});const hit=[...state.objects].sort((a,b)=>(['puerta','ventana'].includes(a.type)?1:0)-(['puerta','ventana'].includes(b.type)?1:0)).reverse().find(o=>{const b=bounds(o);return p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h;});if(hit)return askErase({kind:'object',id:hit.id});
    if(p.x>=0&&p.y>=0&&p.x<state.width&&p.y<state.length){const r=area(p,p),keys=[...cells.keys()].filter(k=>{const [x,y]=k.split(':').map(Number);return x*unit<r.x+r.w&&x*unit+unit>r.x&&y*unit<r.y+r.h&&y*unit+unit>r.y;});if(keys.length)return askErase({kind:'surface',keys});}
    if(referenceImage&&p.x>=referenceImage.x&&p.x<=referenceImage.x+referenceImage.w&&p.y>=referenceImage.y&&p.y<=referenceImage.y+referenceImage.h)return askErase({kind:'image'});say('No hay un elemento para borrar en ese punto.');}
  $('manoPlano').addEventListener('click',()=>{cancel();finishInspector();endTools();mode=mode==='pan'?'select':'pan';sync();closeMenus();render();});
  const panHost=canvas.parentElement;
  panHost.addEventListener('pointerdown',e=>{if(mode!=='pan'||e.button!==0||e.target.closest('form'))return;e.preventDefault();panHost.setPointerCapture(e.pointerId);panDrag={id:e.pointerId,x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};canvas.style.cursor='grabbing';});
  panHost.addEventListener('pointermove',e=>{if(!panDrag||e.pointerId!==panDrag.id)return;pan={x:panDrag.px+e.clientX-panDrag.x,y:panDrag.py+e.clientY-panDrag.y};render();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])panHost.addEventListener(name,()=>{if(!panDrag)return;panDrag=null;canvas.style.cursor=mode==='pan'||mode==='select'?'grab':'crosshair';});
  let contextErase=null;
  function closeContext(){ $('menuContextual').hidden=true;contextErase=null; }
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();finishInspector();cancel();endTools();const p=point(e,false),hit=hitObject(p),dim=[...dimensionHits].reverse().find(d=>segmentDistance(screen(p.x,p.y),d.a,d.b)<12);normalizeSelection();if(!dim&&selectedIds.size&&(!hit||selectedIds.has(hit.id))){const ids=[...selectedIds];contextErase=()=>askErase(ids.length>1?{kind:'objects',ids}:{kind:'object',id:ids[0]});}else contextErase=()=>eraseAt(p);const menu=$('menuContextual');menu.style.left=clamp(e.clientX,8,window.innerWidth-170)+'px';menu.style.top=clamp(e.clientY,8,window.innerHeight-65)+'px';menu.hidden=false;$('borrarContextual').focus();});
  $('borrarContextual').addEventListener('click',()=>{const run=contextErase;closeContext();if(run)run();});document.addEventListener('pointerdown',e=>{if(!e.target.closest('#menuContextual'))closeContext();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeContext();});
  canvas.addEventListener('dblclick',e=>{if(mode==='pan'||mode==='erase')return;const p=point(e,false),hit=dimensionHits.find(d=>segmentDistance(screen(p.x,p.y),d.a,d.b)<12),q=state.dimensions.find(q=>q.id===hit?.id);if(q?.link){finishInspector();cancel();endTools();mode='separation';separationAxis=q.axis;separationPoints=JSON.parse(JSON.stringify([q.link.a,q.link.b]));separationClicks=separationPoints.map(edgePoint);$('tipoCota').value='separation';sync();render();showDistanceEditor();}});
  $('borradorPlano').addEventListener('click',()=>{normalizeSelection();if(selectedIds.size){remove();return;}cancel();endTools();mode=mode==='erase'?'select':'erase';sync();closeMenus();render();});
  $('seleccionarPlano').addEventListener('click',()=>{cancel();endTools();mode='select';sync();closeMenus();render();});
  $('siBorrar').addEventListener('click',()=>{const target=pendingErase;if(!target)return;pendingErase=null;$('confirmarBorrado').close();action(()=>{if(target.kind==='objects'){state.objects=state.objects.filter(o=>!target.ids.includes(o.id));selected=null;selectedIds.clear();}else if(target.kind==='object'){state.objects=state.objects.filter(o=>o.id!==target.id);if(selected===target.id)selected=null;}else if(target.kind==='dimension')state.dimensions=state.dimensions.filter(q=>q.id!==target.id);else if(target.kind==='surface')for(const key of target.keys)cells.delete(key);else{referenceImage=null;detectedWalls=[];}say('Elemento borrado.');});});
  function dismissErase(){pendingErase=null;$('confirmarBorrado').close();}
  $('noBorrar').addEventListener('click',dismissErase);$('confirmarBorrado').addEventListener('cancel',()=>{pendingErase=null;});$('confirmarBorrado').addEventListener('close',()=>{pendingErase=null;});
  canvas.addEventListener('pointerdown',e=>{
    if(mode==='pan'||e.button!==0||drag)return;finishInspector();const p=point(e,false);
    if(mode==='erase'){eraseAt(p);return;}
    if(mode==='dimension'){placeDimension(p);return;}
    if(mode==='separation'){chooseSeparation(p);return;}
    if(mode!=='select'&&(p.x< -1e-8||p.y< -1e-8||p.x>state.width+1e-8||p.y>state.length+1e-8))return;
    if(mode==='wall'){placeWall(snap(p));return;}
    e.preventDefault();canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,start:p,current:p,before:serialize()};
    if(mode==='select'){
      const hit=hitObject(p);
      if(hit){if(e.shiftKey)selectedIds.add(hit.id);else if(!selectedIds.has(hit.id))selectedIds=new Set([hit.id]);selected=hit.id;normalizeSelection();drag.object={...hit};if(selectedIds.size>1){drag.group=state.objects.filter(o=>selectedIds.has(o.id)).map(o=>({...o}));drag.applied={x:0,y:0};}fillForm(hit);}else{drag.marquee=true;drag.baseSelection=e.shiftKey?[...selectedIds]:[];selectedIds=new Set(drag.baseSelection);selected=drag.baseSelection[0]||null;}sync();
    }else if(mode==='brush')paintRect(area(p,p));render();
  });
  function marqueeRect(){const a=screen(drag.start.x,drag.start.y),b=screen(drag.current.x,drag.current.y);return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};}
  function polygonInRect(poly,r){const box=[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}],axes=[{x:1,y:0},{x:0,y:1}];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];axes.push({x:a.y-b.y,y:b.x-a.x});}for(const axis of axes){const a=poly.map(p=>p.x*axis.x+p.y*axis.y),b=box.map(p=>p.x*axis.x+p.y*axis.y);if(Math.max(...a)<Math.min(...b)||Math.max(...b)<Math.min(...a))return false;}return true;}
  function updateMarquee(){const r=marqueeRect(),ids=new Set(drag.baseSelection);if(r.w>=3||r.h>=3)for(const o of state.objects){const b=bounds(o),poly=[screen(b.x,b.y),screen(b.x+b.w,b.y),screen(b.x+b.w,b.y+b.h),screen(b.x,b.y+b.h)];if(polygonInRect(poly,r))ids.add(o.id);}selectedIds=ids;selected=[...ids][0]||null;}
  function moveGroup(p){const source=drag.group,extents=source.map(bounds),minX=Math.min(...extents.map(b=>b.x)),minY=Math.min(...extents.map(b=>b.y)),maxX=Math.max(...extents.map(b=>b.x+b.w)),maxY=Math.max(...extents.map(b=>b.y+b.h));let dx=p.x-drag.start.x,dy=p.y-drag.start.y;if($('ajusteMovimiento').value==='grid'){dx=Math.round(dx/state.step)*state.step;dy=Math.round(dy/state.step)*state.step;}if($('ajusteMovimiento').value==='grid'){dx=clamp(dx,Math.ceil(-minX/state.step)*state.step,Math.floor((state.width-maxX)/state.step)*state.step);dy=clamp(dy,Math.ceil(-minY/state.step)*state.step,Math.floor((state.length-maxY)/state.step)*state.step);}else{dx=clamp(dx,-minX,state.width-maxX);dy=clamp(dy,-minY,state.length-maxY);}const obstacles=state.objects.filter(o=>!selectedIds.has(o.id)),start=drag.applied,steps=Math.max(1,Math.ceil(Math.hypot(dx-start.x,dy-start.y)/.05));let accepted=start;
    for(let i=1;i<=steps;i++){const offset={x:round(start.x+(dx-start.x)*i/steps),y:round(start.y+(dy-start.y)*i/steps)},proposed=source.map(o=>({...o,x:round(o.x+offset.x),y:round(o.y+offset.y)}));if(proposed.some(o=>!fits(o)||collision(o,obstacles))){if($('ajusteMovimiento').value==='grid')accepted=start;break;}accepted=offset;}
    const moved=new Map(source.map(o=>[o.id,{...o,x:round(o.x+accepted.x),y:round(o.y+accepted.y)}]));state.objects=state.objects.map(o=>moved.get(o.id)||o);drag.applied=accepted;canvas.style.cursor='grabbing';
  }
  function moving(e){if(!drag||e.pointerId!==drag.id)return;const p=point(e,!drag.marquee);if(mode==='select'&&drag.marquee){drag.current=p;updateMarquee();sync();render();return;}if(mode==='select'&&drag.group){moveGroup(p);drag.current=p;sync();render();return;}
    if(mode==='brush')stroke(drag.current,p);
    if(mode==='select'&&drag.object){canvas.style.cursor='grabbing';const o=state.objects.find(o=>o.id===selected),b=bounds(o);let next={x:drag.object.x+p.x-drag.start.x,y:drag.object.y+p.y-drag.start.y};if($('ajusteMovimiento').value==='grid'){next=snap(next);next.x=Math.min(next.x,Math.floor((state.width-b.w)/state.step)*state.step);next.y=Math.min(next.y,Math.floor((state.length-b.h)/state.step)*state.step);}let candidate=magnet({...o,x:round(clamp(next.x,0,state.width-b.w)),y:round(clamp(next.y,0,state.length-b.h))});const start={...o};if(collision(start)&&!collision(candidate)){o.x=candidate.x;o.y=candidate.y;}else{const steps=Math.max(1,Math.ceil(Math.hypot(candidate.x-start.x,candidate.y-start.y)/.05));for(let i=1;i<=steps;i++){const part={...o,x:round(start.x+(candidate.x-start.x)*i/steps),y:round(start.y+(candidate.y-start.y)*i/steps)};if(collision(part)){if($('ajusteMovimiento').value==='grid'){o.x=start.x;o.y=start.y;}break;}o.x=part.x;o.y=part.y;}}fillForm(o);}
    drag.current=p;render();
  }
  canvas.addEventListener('pointermove',e=>{if(mode==='separation'&&!drag&&!separationPoints.length){terrainHover=terrainSnap(point(e,false));render();}moving(e);});
  canvas.addEventListener('pointerleave',()=>{if(terrainHover){terrainHover=null;render();}});
  canvas.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;moving(e);if(mode==='area')paintRect(area(drag.start,drag.current));const before=drag.before;drag=null;commit(before);});
  function cancel(){if(!drag)return;const before=drag.before;drag=null;restore(JSON.parse(before),true);render();say('Acción cancelada.');}
  canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',e=>{if(drag&&e.pointerId===drag.id){const before=drag.before;drag=null;commit(before);}});
  document.querySelectorAll('[data-material]').forEach(b=>b.addEventListener('click',()=>{cancel();endTools();material=b.dataset.material;if(!['brush','area'].includes(mode))mode='brush';sync();render();}));
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{cancel();endTools();mode=b.dataset.mode;sync();render();}));
  $('tamCelda').addEventListener('change',()=>action(()=>{state.step=Number($('tamCelda').value);say('Separación cambiada. Las superficies conservan su posición.');}));
  $('formTerreno').addEventListener('submit',e=>{e.preventDefault();const w=Number($('ancho').value),h=Number($('largo').value);if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||w>35||h<1||h>65)return say('Ancho: 1–35 m. Largo: 1–65 m.');if(state.objects.some(o=>!fits(o,w,h)))return say('Hay objetos fuera de las nuevas medidas. Muévelos o elimínalos antes de reducir el terreno.');action(()=>{state.width=w;state.length=h;state.dimensions=state.dimensions.filter(q=>{if(q.link)return true;q.x1=clamp(q.x1,0,w);q.x2=clamp(q.x2,0,w);q.y1=clamp(q.y1,0,h);q.y2=clamp(q.y2,0,h);return Math.hypot(q.x2-q.x1,q.y2-q.y1)>.0001;});cells=new Map([...cells].filter(([k])=>{const [x,y]=k.split(':').map(Number);return x*unit<w&&y*unit<h;}));say('Medidas actualizadas; las cotas se adaptaron. Puedes deshacer el cambio.');});});
  $('tipo').addEventListener('change',fresh);
  function objectFromForm(id){return {id,type:$('tipo').value,x:0,y:0,w:Number($('objW').value),h:Number($('objH').value),rotation:Number($('rotacion').value)};}
  $('formObjeto').addEventListener('submit',e=>{e.preventDefault();cancel();if($('tipo').value==='pared'&&$('encadenar').checked){endTools();mode='wall';selected=null;sync();closeMenus();render();say('Paredes encadenadas: pulsa el inicio y los siguientes puntos; Escape termina.');return;}const base=objectFromForm(uid());if(!validObject(base))return say('Revisa las medidas mínimas.');const next=freePosition(base);if(!next)return say('No queda espacio libre para ese tamaño.');action(()=>{state.objects.push(next);selected=next.id;mode='select';endTools();fillForm(next);say('Objeto agregado. Arrastra para moverlo o vuelve a pulsar Agregar para colocar otro.');});closeMenus();});
  for(const id of ['objW','objH','rotacion'])$(id).addEventListener('change',()=>{constraints();if(selectedIds.size>1)return say('Selecciona un solo objeto para editar sus medidas.');const original=state.objects.find(o=>o.id===selected);if(!original)return;const next={...original,w:Number($('objW').value),h:Number($('objH').value),rotation:Number($('rotacion').value)};if(!validObject(next)||!fits(next)||collision(next)){fillForm(original);return say('El cambio no cabe en el terreno o encimaría otro objeto.');}action(()=>{state.objects=state.objects.map(o=>o.id===next.id?next:o);fillForm(next);say('Medidas del objeto actualizadas.');});});
  function remove(){if(selectedIds.size>1)askErase({kind:'objects',ids:[...selectedIds]});else if(selected)askErase({kind:'object',id:selected});}
  function history(back){finishInspector();cancel();const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(serialize());restore(JSON.parse(from.pop()),true);render();say(back?'Acción deshecha.':'Acción rehecha.');}
  $('deshacer').addEventListener('click',()=>history(true));$('rehacer').addEventListener('click',()=>history(false));
  window.addEventListener('keydown',e=>{if($('confirmarBorrado').open)return;if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='Escape'){finishInspector();cancel();selected=null;sync();render();}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();history(e.key.toLowerCase()==='z'&&!e.shiftKey);}});
  function centerDrawing(){cancel();finishInspector();zoom=1;pan={x:0,y:0};render();const host=canvas.parentElement;host.scrollLeft=Math.max(0,(parseFloat(canvas.style.width)-host.clientWidth+24)/2);host.scrollTop=Math.max(0,(parseFloat(canvas.style.height)-host.clientHeight+24)/2);sync();}
  for(const [id,delta] of [['zoomMas',20],['zoomMenos',-20],['ajustar',0]])$(id).addEventListener('click',()=>{zoom=delta?clamp(Math.round(zoom*100)+delta,20,300)/100:1;if(!delta){centerDrawing();return;}sync();render();});
  $('mostrarGrid').addEventListener('change',e=>{showGrid=e.target.checked;render();});$('mostrarCotas').addEventListener('change',e=>{showCotas=e.target.checked;render();});
  $('vista').addEventListener('change',e=>{cancel();view=e.target.value;zoom=1;pan={x:0,y:0};sync();render();canvas.parentElement.scrollTop=0;canvas.parentElement.scrollLeft=0;say('Vista '+view+'. Las coordenadas y medidas reales se conservan.');});
  $('cotasObjetos').addEventListener('change',e=>{objectDimensions=e.target.value;render();});
  $('pantalla').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{say('Pantalla completa no disponible. Puedes ampliar con F11.');}});
  function validObject(o){return o&&typeof o.id==='string'&&o.id.length<100&&Object.hasOwn(defaults,o.type)&&[o.x,o.y,o.w,o.h,o.rotation].every(Number.isFinite)&&[0,90].includes(o.rotation)&&o.w>=defaults[o.type][2]&&o.h>=(['pared','puerta','ventana'].includes(o.type)?.2:defaults[o.type][2])&&(!['pared','puerta','ventana'].includes(o.type)||Math.abs(o.h-.2)<1e-8);}
  function validate(raw){
    if(!raw||![1,2].includes(raw.version)||![raw.width,raw.length,raw.step].every(Number.isFinite)||raw.width<1||raw.width>35||raw.length<1||raw.length>65||![1,.5,.25].includes(raw.step)||!Array.isArray(raw.cells)||raw.cells.length>40000)throw Error('Formato o medidas del proyecto no válidos.');
    const converted=new Map();for(const entry of raw.cells){if(!Array.isArray(entry)||entry.length!==2)throw Error('Celda no válida.');const [k,v]=entry;if(typeof k!=='string'||!/^\d{1,3}:\d{1,3}$/.test(k)||!Object.hasOwn(materials,v))throw Error('Material o coordenada no válido.');const [x,y]=k.split(':').map(Number),s=raw.version===1?raw.step:unit;if(x*s>=raw.width||y*s>=raw.length)throw Error('Superficie fuera del terreno.');for(let yy=y*s;yy<Math.min((y+1)*s,raw.length)-1e-8;yy+=unit)for(let xx=x*s;xx<Math.min((x+1)*s,raw.width)-1e-8;xx+=unit)converted.set(Math.round(xx/unit)+':'+Math.round(yy/unit),v);}
    const objects=raw.version===1?[]:raw.objects;if(!Array.isArray(objects)||objects.length>2000||objects.some(o=>!validObject(o)||!fits(o,raw.width,raw.length))||new Set(objects.map(o=>o.id)).size!==objects.length)throw Error('Objetos o dimensiones no válidos.');
    const dimensions=raw.dimensions??[];if(!Array.isArray(dimensions)||dimensions.length>1000||dimensions.some(q=>!q||typeof q.id!=='string'||q.id.length>100||!['x','y'].includes(q.axis)||![q.x1,q.y1,q.x2,q.y2,q.offset].every(Number.isFinite)||Math.abs(q.offset)>65||q.x1<0||q.x2<0||q.y1<0||q.y2<0||q.x1>raw.width||q.x2>raw.width||q.y1>raw.length||q.y2>raw.length||(q.side!==undefined&&!['top','bottom','left','right'].includes(q.side))||(q.measurement!==undefined&&(!q.free||!Number.isFinite(q.measurement)||q.measurement<=0||q.measurement>1000))||(q.free!==undefined&&typeof q.free!=='boolean')||(q.free?Math.hypot(q.x2-q.x1,q.y2-q.y1)<.0001:(q.axis==='x'?(q.y1!==q.y2||(!q.link&&q.x1===q.x2)):(q.x1!==q.x2||(!q.link&&q.y1===q.y2)))))||new Set(dimensions.map(q=>q.id)).size!==dimensions.length)throw Error('Cotas no válidas.');
    function validRef(r,axis,target=false){if(!r||!(axis==='x'?['left','right']:['top','bottom']).includes(r.side)||!Number.isFinite(r.t)||r.t<0||r.t>1)return false;if(!r.kind)return typeof r.id==='string'&&objects.some(o=>o.id===r.id);if(target)return false;if(r.kind==='terrain')return true;if(r.kind==='surface')return [r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.x>=0&&r.y>=0&&r.w>0&&r.h>0&&r.x+r.w<=raw.width+1e-8&&r.y+r.h<=raw.length+1e-8&&typeof r.key==='string'&&converted.has(r.key);return false;}
    for(const q of dimensions)if(q.link){if(!validRef(q.link.a,q.axis)||!validRef(q.link.b,q.axis,true)||(!q.link.a.kind&&q.link.a.id===q.link.b.id))throw Error('Referencias de cota no válidas.');}
    function cleanRef(r){return {side:r.side,t:r.t,...(r.kind==='terrain'?{kind:'terrain'}:r.kind==='surface'?{kind:'surface',id:'surface:'+r.x+':'+r.y+':'+r.w+':'+r.h,key:r.key,x:r.x,y:r.y,w:r.w,h:r.h}:{id:r.id})};}
    return {version:2,width:raw.width,length:raw.length,step:raw.step,cells:[...converted],objects:objects.map(({id,type,x,y,w,h,rotation})=>({id,type,x,y,w,h,rotation})),dimensions:dimensions.map(({id,axis,x1,y1,x2,y2,offset,link,side,free,measurement})=>({id,axis,x1,y1,x2,y2,offset,...(side?{side}:{}),...(free?{free:true}:{}),...(measurement!==undefined?{measurement}:{}),...(link?{link:{a:cleanRef(link.a),b:cleanRef(link.b)}}:{})}))};
  }
  function load(raw){const p=validate(raw);action(()=>{restore(p);say('Proyecto cargado. Puedes deshacer la importación.');});centerDrawing();}
  $('abrir3D').addEventListener('click',()=>{cancel();closeMenus();window.quinta3D.open(project());});
  function buildPlanPDF(jpeg,width,height,projectData){
    const encoder=new TextEncoder(),encode=text=>encoder.encode(text),landscape=width>height,pw=landscape?1191:842,ph=landscape?842:1191,ratio=Math.min((pw-72)/width,(ph-140)/height),dw=width*ratio,dh=height*ratio,x=(pw-dw)/2,y=50+(ph-140-dh)/2,body=JSON.stringify(projectData),embedded=encode(body);
    const content=encode('BT /F1 18 Tf 36 '+(ph-36)+' Td (Editor de Quintas - Plano) Tj ET\nBT /F1 10 Tf 36 '+(ph-55)+' Td (Terreno: '+projectData.width+' x '+projectData.length+' m - '+(projectData.width*projectData.length).toFixed(2)+' m2) Tj ET\nq '+dw.toFixed(3)+' 0 0 '+dh.toFixed(3)+' '+x.toFixed(3)+' '+y.toFixed(3)+' cm /Im0 Do Q\nBT /F1 9 Tf 36 24 Td (Cotas en metros. Vista esquematica. Proyecto editable incluido en este PDF.) Tj ET');
    const chunks=[],offsets=[0];let size=0;function add(chunk){const b=typeof chunk==='string'?encode(chunk):chunk;chunks.push(b);size+=b.length;}function object(id,body){offsets[id]=size;add(id+' 0 obj\n');add(body);add('\nendobj\n');}function stream(id,header,data){offsets[id]=size;add(id+' 0 obj\n<< '+header+' /Length '+data.length+' >>\nstream\n');add(data);add('\nendstream\nendobj\n');}
    add('%PDF-1.7\n');object(1,'<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(quinta-proyecto.json) 8 0 R] >> >> /AF [8 0 R] >>');object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pw+' '+ph+'] /Resources << /Font << /F1 4 0 R >> /XObject << /Im0 5 0 R >> >> /Contents 6 0 R >>');object(4,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');stream(5,'/Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',jpeg);stream(6,'',content);stream(7,'/Type /EmbeddedFile /Subtype /application#2Fjson /QuintaProject true',embedded);object(8,'<< /Type /Filespec /F (quinta-proyecto.json) /UF (quinta-proyecto.json) /AFRelationship /Data /EF << /F 7 0 R >> >>');const start=size;add('xref\n0 9\n0000000000 65535 f \n');for(let i=1;i<=8;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');add('trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n');const result=new Uint8Array(size);let position=0;for(const chunk of chunks){result.set(chunk,position);position+=chunk.length;}return result;
  }
  function projectFromPDF(bytes){if(bytes.length>25*1024*1024)throw Error('El PDF supera 25 MB.');const text=new TextDecoder('latin1').decode(bytes);if(!text.startsWith('%PDF-'))throw Error('Archivo PDF no válido.');const match=/\/QuintaProject true\s+\/Length (\d+) >>\r?\nstream\r?\n/.exec(text);if(!match)throw Error('Este PDF no contiene un proyecto editable del editor. Usa un PDF guardado aquí o importa JSON.');const start=match.index+match[0].length,length=Number(match[1]);if(length>8*1024*1024||start+length>bytes.length)throw Error('Datos del proyecto no válidos.');return validate(JSON.parse(new TextDecoder().decode(bytes.slice(start,start+length))));}
  function downloadBytes(bytes,type,name){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('guardar').addEventListener('click',()=>{finishInspector();cancel();endTools();const previous={zoom,pan:{...pan},selected,ids:[...selectedIds],mode,scrollX:canvas.parentElement.scrollLeft,scrollY:canvas.parentElement.scrollTop};try{selected=null;selectedIds.clear();zoom=2;pan={x:0,y:0};render();const temp=document.createElement('canvas'),factor=Math.min(1,4096/Math.max(canvas.width,canvas.height));temp.width=Math.round(canvas.width*factor);temp.height=Math.round(canvas.height*factor);const c=temp.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,temp.width,temp.height);c.drawImage(canvas,0,0,temp.width,temp.height);const data=atob(temp.toDataURL('image/jpeg',.94).split(',')[1]),jpeg=Uint8Array.from(data,ch=>ch.charCodeAt(0)),bytes=buildPlanPDF(jpeg,temp.width,temp.height,project());downloadBytes(bytes,'application/pdf','quinta-'+state.width+'x'+state.length+'.pdf');say('PDF guardado con el plano y el proyecto editable.');}catch(e){say('No se pudo guardar el PDF: '+e.message);}finally{zoom=previous.zoom;pan=previous.pan;selected=previous.selected;selectedIds=new Set(previous.ids);mode=previous.mode;sync();render();canvas.parentElement.scrollLeft=previous.scrollX;canvas.parentElement.scrollTop=previous.scrollY;}});
  $('cargar').addEventListener('click',()=>$('archivoPDF').click());$('archivoPDF').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>25*1024*1024)throw Error('El PDF supera 25 MB.');const p=projectFromPDF(new Uint8Array(await file.arrayBuffer()));load(p);centerDrawing();say('PDF cargado. El plano vuelve a ser editable.');}catch(err){say('No se pudo cargar: '+err.message);}finally{e.target.value='';}});
  $('exportar').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(project(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='quinta-proyecto-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Proyecto exportado como JSON.');});
  $('importar').addEventListener('click',()=>$('archivo').click());$('archivo').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>8*1024*1024)throw Error('El archivo supera 8 MB.');load(JSON.parse(await file.text()));}catch(err){say('No se pudo importar: '+err.message);}finally{e.target.value='';}});
  window.addEventListener('resize',render);
  window.addEventListener('load',render);
  document.addEventListener('fullscreenchange',render);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>render()).observe(canvas.parentElement);
  try{const saved=localStorage.getItem(storageKey)||localStorage.getItem('editor-quintas-v1');if(saved){restore(validate(JSON.parse(saved)));say('Se recuperó tu proyecto guardado.');}}catch{say('El guardado anterior no se pudo leer. Puedes importar otro JSON.');}
  fresh();sync();render();
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>requestAnimationFrame(centerDrawing));
})();

// Standalone software 3D renderer: no downloads, keys or external libraries.
(() => {
  const $=id=>document.getElementById(id),canvas=$('escena3D'),ctx=canvas.getContext('2d'),dialog=$('visor3D');
  let scene=null,faces=[],groundCount=0,yaw=-.65,pitch=.95,distance=100,night=false,drag=null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const palette={pared:'#c8c0ab',puerta:'#875936',ventana:'#8bd0e4',casa:'#ead4b2',bano:'#e3d7c6',regaderas:'#bfd9df',cocina:'#d7ba8d',palapa:'#bd9b58',gallinero:'#baa677',alberca:'#30acd4',fuente:'#6cbcd4',pista:'#bb8b58',escenario:'#67758d',estacionamiento:'#64717e',juegos:'#76a35b',fogatero:'#9a8a73',arbol:'#48834b',arbolAlcorque:'#48834b',farol:'#e6c35e',mesaConBancas:'#b8b8af',arbusto:'#5f9d4d',flores:'#9cbb50'};
  function face(points,color){faces.push({points,color});}
  function box(x,y,z,w,l,h,color,top=true){const a=[x,y,z],b=[x+w,y,z],c=[x+w,y+l,z],d=[x,y+l,z],e=[x,y,z+h],f=[x+w,y,z+h],g=[x+w,y+l,z+h],i=[x,y+l,z+h];face([a,b,f,e],color);face([b,c,g,f],shade(color,.78));face([c,d,i,g],shade(color,.65));face([d,a,e,i],shade(color,.85));if(top)face([e,f,g,i],shade(color,1.12));}
  function roof(x,y,w,l,z,color){const a=[x-.2,y-.2,z],b=[x+w+.2,y-.2,z],c=[x+w+.2,y+l+.2,z],d=[x-.2,y+l+.2,z],peak=[x+w/2,y+l/2,z+Math.min(w,l)*.35];face([a,b,peak],color);face([b,c,peak],shade(color,.78));face([c,d,peak],shade(color,.6));face([d,a,peak],shade(color,.9));}
  function crown(x,y,z,rx,ry,rz,color){const top=[x,y,z+rz],bottom=[x,y,z-rz],ring=[];for(let i=0;i<8;i++){const a=i*Math.PI/4;ring.push([x+rx*Math.cos(a),y+ry*Math.sin(a),z]);}for(let i=0;i<8;i++){face([top,ring[i],ring[(i+1)%8]],shade(color,.85+(i%4)*.1));face([bottom,ring[(i+1)%8],ring[i]],shade(color,.6+(i%3)*.08));}}
  function shade(hex,k){const n=parseInt(hex.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.round(clamp(v*k,0,255)).toString(16).padStart(2,'0')).join('');}
  function model(o){const x=o.x,y=o.y,w=o.rotation===90?o.h:o.w,l=o.rotation===90?o.w:o.h,c=palette[o.type]||'#b7aaa0';
    if(o.type==='farol'){const d=Math.min(w,l);box(x+w*.35,y+l*.35,0,w*.3,l*.3,.18,'#777c7e');box(x+w/2-d*.06,y+l/2-d*.06,.18,d*.12,d*.12,2.6,'#424c58');box(x+w*.18,y+l*.18,2.78,w*.64,l*.64,.4,night?'#ffe69b':'#ecd8a0');roof(x+w*.15,y+l*.15,w*.7,l*.7,3.18,'#46515c');return;}
    if(o.type==='mesaConBancas'){function part(r,z,h,color){const b=quintaRect(o,r);box(b.x,b.y,z,b.w,b.h,h,color);}const concrete='#b9b9ac';part({x:o.w*.34,y:o.h*.05,w:o.w*.32,h:o.h*.9},.78,.1,concrete);for(const bx of [.08,.78]){part({x:o.w*bx,y:o.h*.06,w:o.w*.14,h:o.h*.88},.43,.09,concrete);for(const by of [.18,.7])part({x:o.w*(bx+.035),y:o.h*by,w:o.w*.07,h:o.h*.1},0,.43,'#95998d');}for(const by of [.15,.72])part({x:o.w*.45,y:o.h*by,w:o.w*.1,h:o.h*.12},0,.78,'#95998d');return;}
    if(o.type==='arbolAlcorque'){const cx=x+w/2,cy=y+l/2,r=Math.min(w,l)*.46,inner=r*.76,n=16;for(let i=0;i<n;i++){const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n,p=[cx+r*Math.cos(a),cy+r*Math.sin(a)],q=[cx+r*Math.cos(b),cy+r*Math.sin(b)],u=[cx+inner*Math.cos(a),cy+inner*Math.sin(a)],v=[cx+inner*Math.cos(b),cy+inner*Math.sin(b)];face([[p[0],p[1],0],[q[0],q[1],0],[q[0],q[1],1],[p[0],p[1],1]],'#b7ad98');face([[p[0],p[1],1],[q[0],q[1],1],[v[0],v[1],1],[u[0],u[1],1]],'#d2c9b2');face([[cx,cy,.92],[u[0],u[1],.92],[v[0],v[1],.92]],'#79654c');}box(cx-.1,cy-.1,.92,.2,.2,2,'#7d6147');crown(cx,cy,3.3,w*.47,l*.47,1.25,'#48834b');return;}
    if(['arbol','arbusto','flores'].includes(o.type)){const tall=o.type==='arbol',h=tall?Math.max(2.8,Math.min(w,l)*1.5):.55;if(tall)box(x+w*.45,y+l*.45,0,w*.1,l*.1,h*.65,'#806247');crown(x+w/2,y+l/2,h,w*.5,l*.5,tall?h*.5:.45,c);if(o.type==='flores')for(let i=0;i<4;i++)crown(x+w*(.2+(i%2)*.6),y+l*(.2+Math.floor(i/2)*.6),.8,.12,.12,.1,i%2?'#ec9fca':'#ffe28e');return;}
    if(['casa','bano','regaderas','cocina','gallinero'].includes(o.type)){const h=o.type==='gallinero'?2:3;box(x,y,0,w,l,h,c,false);roof(x,y,w,l,h,o.type==='casa'?'#40526b':'#946a4d');box(x+w*.42,y+l+.015,0,w*.18,.03,h*.7,'#795a3c');for(const f of [.18,.7])box(x+w*f,y+l+.025,h*.42,w*.13,.025,h*.22,night?'#ffdc7d':'#83bdce');if(o.type==='cocina')box(x+w*.1,y+l*.15,.1,w*.18,l*.65,1,'#c9c1ae');return;}
    if(o.type==='palapa'){for(const a of [.08,.88])for(const b of [.08,.88])box(x+w*a,y+l*b,0,.13,.13,2.7,'#967049');roof(x,y,w,l,2.7,'#bf9f59');return;}
    if(o.type==='pared'){box(x,y,0,w,l,2.3,c);return;}
    if(['puerta','ventana'].includes(o.type)){box(x,y,o.type==='ventana'?1:0,w,l,o.type==='ventana'?1:2.1,c);return;}
    if(o.type==='alberca'){box(x,y,0,w,l,.18,'#e4d8b6');box(x+.22,y+.22,.19,Math.max(.1,w-.44),Math.max(.1,l-.44),.025,c);for(let i=1;i<4;i++)box(x+.4,y+l*i/4,.22,Math.max(.1,w-.8),.025,.01,'#a4e4f1');return;}
    if(o.type==='fuente'){box(x,y,0,w,l,.5,'#c8bc9a');box(x+.15,y+.15,.51,w-.3,l-.3,.02,c);box(x+w*.43,y+l*.43,.5,w*.14,l*.14,1,'#d3bc84');crown(x+w/2,y+l/2,1.7,.13,.13,.55,'#96e5ef');return;}
    if(o.type==='fogatero'){const cx=x+w/2,cy=y+l/2;for(let i=0;i<10;i++){const a=i*Math.PI/5;box(cx+Math.cos(a)*w*.36-.2,cy+Math.sin(a)*l*.36-.2,0,.4,.4,.45,'#b29a7d');}crown(cx,cy,.45,w*.12,l*.12,.6,'#ff9c3f');return;}
    box(x,y,0,w,l,o.type==='escenario'?.8:.08,c);if(o.type!=='escenario')faces[faces.length-1].underlay=true;
    if(o.type==='estacionamiento'){const layout=quintaParking(o);function flat(r,z,color){face([[r.x,r.y,z],[r.x+r.w,r.y,z],[r.x+r.w,r.y+r.h,z],[r.x,r.y+r.h,z]],color);faces[faces.length-1].underlay=true;faces[faces.length-1].flatLayer=z>.1?4:3;}for(const a of layout.aisles)flat(a,.095,'#485b64');for(let i=0;i<layout.bays.length;i++){const {bay:b,car:r}=layout.bays[i],t=.045;for(const line of [{x:b.x,y:b.y,w:b.w,h:t},{x:b.x,y:b.y+b.h-t,w:b.w,h:t},{x:b.x,y:b.y,w:t,h:b.h},{x:b.x+b.w-t,y:b.y,w:t,h:b.h}])flat(line,.101,'#eee9d1');const color=['#3f6a8b','#d4d8d9','#a3424c','#4a535b'][i%4];box(r.x,r.y,.12,r.w,r.h,.65,color);box(r.x+r.w*.15,r.y+r.h*.3,.77,r.w*.7,r.h*.4,.35,'#90a5b3');}return;}
    if(o.type==='juegos'){const unit=Math.min(w,l);for(let i=0;i<3;i++){const xx=x+w*(.15+i*.3);box(xx,y+l*.3,.08,.12,.12,2.1,'#e56c46');box(xx,y+l*.7,.08,.12,.12,2.1,'#e56c46');box(xx,y+l*.3,2.1,.12,l*.4,.12,'#f3d368');box(xx-.2,y+l*.42,.7,.5,l*.16,.12,'#599dc4');}box(x+w*.5,y+l*.2,.1,Math.min(1,w*.12),unit*.6,.4,'#e9a647');}
    if(o.type==='escenario')for(const ax of [.04,.94]){box(x+w*ax,y,0,.15,.15,3.2,'#b2bac1');box(x+w*ax,y+l-.15,0,.15,.15,3.2,'#b2bac1');}if(o.type==='escenario')box(x,y,3.2,w,l,.12,'#42516c');
  }
  function build(){faces=[];box(0,0,-.3,scene.width,scene.length,.3,'#6d9858');const map=new Map(scene.cells),used=new Set(),colors={pasto:'#73a45a',tierra:'#b38f67',piso:'#c8bea8',agua:'#319ec8',vitropiso:'#d2d4cf'};for(const [key,v] of map){if(v==='pasto'||used.has(key))continue;const [x,y]=key.split(':').map(Number);let end=x;while(map.get((end+1)+':'+y)===v&&!used.has((end+1)+':'+y))end++;for(let xx=x;xx<=end;xx++)used.add(xx+':'+y);const x1=x*.25,y1=y*.25,x2=Math.min(scene.width,(end+1)*.25),y2=Math.min(scene.length,(y+1)*.25);face([[x1,y1,.015],[x2,y1,.015],[x2,y2,.015],[x1,y2,.015]],colors[v]||'#c8bea8');}groundCount=faces.length;for(const o of scene.objects)model(o);}
  function project(p){const x=p[0]-scene.width/2,y=p[1]-scene.length/2,z=p[2]-1,rx=x*Math.cos(yaw)-y*Math.sin(yaw),depth=x*Math.sin(yaw)+y*Math.cos(yaw),up=z*Math.cos(pitch)-depth*Math.sin(pitch),toward=depth*Math.cos(pitch)+z*Math.sin(pitch),factor=Math.min(canvas.clientWidth,canvas.clientHeight)*1.1/Math.max(2,distance-toward);return {x:canvas.clientWidth/2+rx*factor,y:canvas.clientHeight*.52-up*factor,depth:toward};}
  function draw(){if(!scene||!dialog.open)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,night?'#101e36':'#bfd2df');bg.addColorStop(1,night?'#233a37':'#e3dfc6');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);const polygons=faces.map((f,i)=>{const points=f.points.map(project);return {...f,layer:i<5?0:i<groundCount?1:f.underlay?(f.flatLayer||2):5,points,depth:points.reduce((n,p)=>n+p.depth,0)/points.length};}).sort((a,b)=>a.layer-b.layer||a.depth-b.depth);for(const f of polygons){ctx.beginPath();f.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=night?shade(f.color,.7):f.color;ctx.fill();ctx.strokeStyle=night?'#10212c28':'#22372c22';ctx.lineWidth=.4;ctx.stroke();}}
  function reset(){yaw=-.65;pitch=.95;distance=Math.hypot(scene.width,scene.length)*1.55;draw();}
  window.quinta3D={open(p){scene=JSON.parse(JSON.stringify(p));build();dialog.showModal();reset();requestAnimationFrame(draw);},inspect(){return {faces:faces.length,objects:scene?.objects.length||0,parkingCars:(scene?.objects||[]).filter(o=>o.type==='estacionamiento').reduce((sum,o)=>sum+quintaParking(o).capacity,0)};}};
  $('cerrar3D').addEventListener('click',()=>dialog.close());$('reiniciar3D').addEventListener('click',reset);$('luz3D').addEventListener('click',()=>{night=!night;draw();});$('acercar3D').addEventListener('click',()=>{distance=Math.max(Math.hypot(scene.width,scene.length)*.75,distance*.85);draw();});$('alejar3D').addEventListener('click',()=>{distance=Math.min(500,distance/ .85);draw();});
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY};});canvas.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;yaw+=(e.clientX-drag.x)*.008;pitch=clamp(pitch+(e.clientY-drag.y)*.006,.15,1.45);drag.x=e.clientX;drag.y=e.clientY;draw();});for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>drag=null);canvas.addEventListener('wheel',e=>{e.preventDefault();distance=clamp(distance*(e.deltaY>0?1.1:.9),Math.hypot(scene.width,scene.length)*.75,500);draw();},{passive:false});window.addEventListener('resize',draw);if(typeof ResizeObserver!=='undefined')new ResizeObserver(draw).observe(canvas);
})();
