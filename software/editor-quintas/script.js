'use strict';

// Shared metric parking layout: 2.50 × 5 m spaces, without an exit aisle.
function quintaPoint(o,x,y){if(o.flipX)x=o.w-x;if(o.flipY)y=o.h-y;switch(o.rotation){case 90:return {x:o.x+o.h-y,y:o.y+x};case 180:return {x:o.x+o.w-x,y:o.y+o.h-y};case 270:return {x:o.x+y,y:o.y+o.w-x};default:return {x:o.x+x,y:o.y+y};}}
function quintaRect(o,r){const pts=[[r.x,r.y],[r.x+r.w,r.y],[r.x,r.y+r.h],[r.x+r.w,r.y+r.h]].map(p=>quintaPoint(o,...p)),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
function quintaNombre(type){return ({columpios:'Columpios',resbaladilla:'Resbaladilla',subeBaja:'Sube y baja',casitaJuego:'Casita de juego de madera',quiosco:'Quiosco',mediaPared:'Media pared',bancaSemicircular:'Banca semicircular',hongoAgua:'Hongo de concreto para agua',pergolaColumpio:'Pérgola con columpio',toboganRecto:'Tobogán recto',toboganTunel:'Tobogán con túnel',toboganCurvo:'Tobogán curvo',toboganTunel90:'Tobogán con túnel a 90°',bano:'Baño',bombaAgua:'Bomba de agua',circulo:'Círculo',semicirculo:'Medio círculo'})[type]||type.charAt(0).toUpperCase()+type.slice(1);}
function quintaSlide(o){const curved=['toboganCurvo','toboganTunel90'].includes(o.type),radius=Math.min(.42,o.w*.14,o.h*.09),points=[];for(let i=0;i<=28;i++){const t=i/28;points.push({x:o.w*(curved?.28+.52*(1-Math.cos(t*Math.PI/2)):.5),y:o.h*(curved?.22+.58*Math.sin(t*Math.PI/2):.22+.66*t),z:radius+.06+(2.2-radius-.06)*(1-t)*(1-t)});}return {points,tube:['toboganTunel','toboganTunel90'].includes(o.type),radius};}
function quintaParking(o){
  const bayWidth=2.5,bayLength=5,epsilon=1e-8;let best={count:0,swapped:false,across:o.w,depth:o.h};
  for(const swapped of [false,true]){const across=swapped?o.h:o.w,depth=swapped?o.w:o.h,count=depth+epsilon>=bayLength?Math.floor((across+epsilon)/bayWidth):0;if(count>best.count)best={count,swapped,across,depth};}
  const bays=[],map=r=>quintaRect(o,best.swapped?{x:r.y,y:r.x,w:r.h,h:r.w}:r),inset=(best.across-best.count*bayWidth)/2,y=(best.depth-bayLength)/2;
  for(let col=0;col<best.count;col++){const x=inset+col*bayWidth;bays.push({bay:map({x,y,w:bayWidth,h:bayLength}),car:map({x:x+.35,y:y+.35,w:1.8,h:4.3})});}
  return {bays,aisles:[],capacity:bays.length,bayWidth,bayLength,aisleWidth:0};
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
  const defaults = {columpios:[4,3,1],resbaladilla:[2.2,5,1],subeBaja:[4,1.5,1],casitaJuego:[3.5,4,1],quiosco:[5,5,1],mediaPared:[3,.2,.2],bancaSemicircular:[4,2,.8],hongoAgua:[3,3,1],pergolaColumpio:[4,3,1],toboganRecto:[2.2,5,1],toboganTunel:[2.5,6,1],toboganCurvo:[4,5,1],toboganTunel90:[4.5,5.5,1],circulo:[3,3,.2],semicirculo:[3,3,.2],bombaAgua:[1,.6,.3],pared:[3,.2,.2], puerta:[1,.2,.6], ventana:[1.2,.2,.3], arbol:[2,2,.5],arbolAlcorque:[2.5,2.5,1.2],farol:[.6,.6,.3],mesaConBancas:[2.4,2,1], palapa:[4,4,1], casa:[6,8,2], alberca:[3,5,1], bano:[2,2,1],regaderas:[2,3,1],arbusto:[1,1,.3],fuente:[2,2,.5],flores:[1,1,.2],gallinero:[3,3,1],fogatero:[2,2,.5],estacionamiento:[12,11,1],cocina:[5,4,1],juegos:[8,3,1],pista:[6,6,1],escenario:[6,3,1]};
  const storageKey = 'editor-quintas-v2', unit = .25, margin = 56;
  let state = {version:2,width:35,length:65,step:1,cells:[],objects:[],dimensions:[]};
  let selectedIds=new Set();
  let cells = new Map(), undo = [], redo = [], selected = null, drag = null;
  let mode = 'select', material = 'pasto', zoom = 1, scale = 10, showGrid = true, showCotas = true;
  let view = 'horizontal', objectDimensions = 'todos';
  let pan={x:0,y:0},panDrag=null;
  let chainPoint=null,lastWall=null,dimensionPoints=[],dimensionRefs=[],curvePoints=[];
  let freeDimensionSide=null;
  let separationPoints=[],separationClicks=[],separationAxis='x';
  let inspectorEdit=null;
  let terrainHover=null;
  let pendingErase=null,dimensionHits=[],activeDimensionId=null;
  let referenceImage=null,detectedWalls=[];
  const uid=()=> 'o'+Date.now().toString(36)+Math.random().toString(36).slice(2);
  const snap=p=>({x:round(clamp(Math.round(p.x/state.step)*state.step,0,state.width)),y:round(clamp(Math.round(p.y/state.step)*state.step,0,state.length))});
  function endTools(){curvePoints=[];terrainHover=null;chainPoint=null;lastWall=null;dimensionPoints=[];dimensionRefs=[];freeDimensionSide=null;separationPoints=[];separationClicks=[];$('cotaEnPlano').hidden=true;if($('puntosSeparacion'))$('puntosSeparacion').textContent='Pulsa una pared de referencia y después el lado del objeto que deseas mover.';}
  function referenceBounds(ref){if(ref.kind==='point')return {x:ref.x,y:ref.y,w:0,h:0};if(ref.kind==='terrain')return {x:0,y:0,w:state.width,h:state.length};if(ref.kind==='surface')return cells.has(ref.key)?{x:ref.x,y:ref.y,w:ref.w,h:ref.h}:null;const o=state.objects.find(o=>o.id===ref.id);return o?bounds(o):null;}
  function edgePoint(ref){const b=referenceBounds(ref);if(!b)return null;if(ref.side==='center')return {x:b.x+b.w/2,y:b.y+b.h/2};return ref.side==='left'?{x:b.x,y:b.y+b.h*ref.t}:ref.side==='right'?{x:b.x+b.w,y:b.y+b.h*ref.t}:ref.side==='top'?{x:b.x+b.w*ref.t,y:b.y}:{x:b.x+b.w*ref.t,y:b.y+b.h};}
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
  function bounds(o) { return {x:o.x,y:o.y,w:o.rotation%180===90?o.h:o.w,h:o.rotation%180===90?o.w:o.h}; }
  function fits(o,w=state.width,h=state.length) {const b=bounds(o);return b.x>=0&&b.y>=0&&b.x+b.w<=w+1e-8&&b.y+b.h<=h+1e-8;}
  function overlap(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
  function collision(o,other=state.objects){return other.some(a=>{if(a.id===o.id)return false;if((o.type==='pared'&&['puerta','ventana'].includes(a.type))||(a.type==='pared'&&['puerta','ventana'].includes(o.type)))return false;const bo=bounds(o),ba=bounds(a),area=overlap(bo,ba);if(area>1e-8&&area>=Math.min(bo.w*bo.h,ba.w*ba.h)-1e-8)return true;return area>(a.type==='pared'&&o.type==='pared'?.040001:1e-8);});}
  function freePosition(o){
    const b=bounds(o);if(b.w>state.width||b.h>state.length)return null;
    const cx=round((state.width-b.w)/2),cy=round((state.length-b.h)/2),center={...o,x:cx,y:cy};
    if(canMoveOver(o))return center;
    const xs=new Set([0,cx,round(state.width-b.w)]),ys=new Set([0,cy,round(state.length-b.h)]);
    for(const a of state.objects){const r=bounds(a);for(const x of [r.x-b.w,r.x+r.w])if(x>=0&&x<=state.width-b.w)xs.add(round(x));for(const y of [r.y-b.h,r.y+r.h])if(y>=0&&y<=state.length-b.h)ys.add(round(y));}
    for(let x=0;x<=state.width-b.w+.001;x+=.5)xs.add(round(x));for(let y=0;y<=state.length-b.h+.001;y+=.5)ys.add(round(y));
    const candidates=[];for(const x of xs)for(const y of ys)candidates.push({...o,x,y});
    candidates.sort((a,b)=>(Math.abs(a.x-cx)+Math.abs(a.y-cy)*2)-(Math.abs(b.x-cx)+Math.abs(b.y-cy)*2));return candidates.find(p=>fits(p)&&!collision(p))||null;
  }
  function canMoveOver(o){return !['pared','mediaPared'].includes(o.type)&&$('desplazamientoLibre').checked;}
  function magnet(o){if(canMoveOver(o))return o;if(!$('pegarObjetos').checked||$('ajusteMovimiento').value==='grid')return o;const b=bounds(o),limit=Math.min(.4,10/scale),candidates=[o];for(const a of state.objects){if(a.id===o.id)continue;const r=bounds(a);if(b.y<r.y+r.h+.1&&b.y+b.h>r.y-.1)for(const x of [r.x-b.w,r.x+r.w])if(Math.abs(x-o.x)<=limit)candidates.push({...o,x:round(x)});if(b.x<r.x+r.w+.1&&b.x+b.w>r.x-.1)for(const y of [r.y-b.h,r.y+r.h])if(Math.abs(y-o.y)<=limit)candidates.push({...o,y:round(y)});}const valid=candidates.filter(p=>fits(p)&&!collision(p));return valid.length>1?valid[valid.length-1]:o;}
  function normalizeSelection(){if(!selected){selectedIds.clear();return;}selectedIds=new Set([...selectedIds].filter(id=>state.objects.some(o=>o.id===id)));if(!state.objects.some(o=>o.id===selected)){selected=[...selectedIds][0]||null;if(!selected){selectedIds.clear();return;}}if(!selectedIds.has(selected))selectedIds=new Set([selected]);}
  const eraserCursor='url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M3 20 18 5a3 3 0 0 1 4 0l6 6a3 3 0 0 1 0 4L14 29H9l-6-6a2 2 0 0 1 0-3Z" fill="#ff8ea4" stroke="#fff" stroke-width="2"/><path d="m12 11 12 12M13 29h16" stroke="#233147" stroke-width="2"/></svg>')+'") 3 23, default';
  function toolCursor(){return mode==='pan'?'grab':mode==='select'?'default':mode==='erase'?eraserCursor:'crosshair';}
  function editedObject(original,proposed){
    if(!validObject(proposed))return null;
    let next={...proposed};
    if(original.rotation!==next.rotation){const before=bounds(original),after=bounds(next);if(after.w>state.width||after.h>state.length)return null;next.x=round(clamp(before.x+(before.w-after.w)/2,0,state.width-after.w));next.y=round(clamp(before.y+(before.h-after.h)/2,0,state.length-after.h));}
    return fits(next)&&(canMoveOver(next)||!collision(next))?next:null;
  }
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
    canvas.style.cursor=toolCursor();
    if(mode==='pan')$('instruccion').textContent='Mano · Mantén el clic izquierdo y arrastra para desplazar el plano. Centrar vuelve a colocar el dibujo en medio.';
    if(mode==='erase')$('instruccion').textContent='Borrador · Pulsa un objeto, superficie o cota y confirma con Sí o No.';
    if(mode==='shape')$('instruccion').textContent='Figura curva · Marca dos extremos del diámetro y escribe los metros.';if(mode==='wall')$('instruccion').textContent='Paredes · Mantén el clic izquierdo y arrastra por los cuadros. Clic derecho → Terminar paredes; Escape termina.';
    if(mode==='dimension')$('instruccion').textContent='Cota libre · Marca dos puntos, escribe la medida y pulsa Aplicar.';
    if(mode==='center')$('instruccion').textContent='Cota al centro · Elige la referencia fija y después el objeto que deseas mover.';if(mode==='separation')$('instruccion').textContent='Separación · Pulsa el lado de la referencia y luego el lado del objeto; escribe la distancia aquí mismo.';
  }
  function fillForm(o) {
    $('tipo').value=o.type; $('objW').value=o.w; $('objH').value=o.h; $('rotacion').value=o.rotation;
    constraints();syncInspector();
  }
  function syncInspector(force=false){normalizeSelection();for(const id of ['anchoInspector','largoInspector','orientacionInspector']){const field=$(id);field.disabled=selectedIds.size>1;const label=field.closest('label');if(label)label.hidden=selectedIds.size>1;}if(selectedIds.size>1){$('inspectorObjeto').hidden=false;requestAnimationFrame(placeInspector);$('nombreInspector').textContent=selectedIds.size+' objetos seleccionados';$('detalleObjetoInspector').textContent='Arrastra cualquiera de los seleccionados para moverlos juntos.';$('mensajeInspector').textContent='Para modificar medidas, selecciona un solo objeto.';return;}if($('mensajeInspector').textContent==='Para modificar medidas, selecciona un solo objeto.')$('mensajeInspector').textContent='Los cambios se reflejan en el plano al escribir.';const o=state.objects.find(o=>o.id===selected),panel=$('inspectorObjeto');panel.hidden=!o;if(!o)return;requestAnimationFrame(placeInspector);$('nombreInspector').textContent=quintaNombre(o.type);const thin=['pared','mediaPared','puerta','ventana'].includes(o.type),values={anchoInspector:o.w,largoInspector:o.h,orientacionInspector:o.rotation};for(const [id,value]of Object.entries(values)){if(force||document.activeElement!==$(id))$(id).value=value;}$('anchoInspector').min=defaults[o.type][2];$('largoInspector').min=thin?.2:defaults[o.type][2];$('largoInspector').readOnly=thin;$('detalleObjetoInspector').textContent=o.type==='gallinero'?'Pared de concreto de 1 m; estructura superior de madera y malla.':o.type==='hongoAgua'?'Hongo de concreto para agua: altura total fija de 3 m.':o.type==='mediaPared'?'Media pared: 1.20 m de altura y 0.20 m de grosor.':o.type==='bancaSemicircular'?'Banca de concreto en semicírculo, con asiento y respaldo curvos.':o.type==='estacionamiento'?quintaParking(o).capacity+' vehículos en una sola fila; cajones de 2.50 × 5 m.':o.type==='arbolAlcorque'?'Alcorque redondo: 1 m de altura.':o.type==='mesaConBancas'?'Mesa y dos bancas longitudinales: un solo objeto.':'';}
  let inspectorDrag=null,inspectorPosition=null;
  function placeInspector(){
    if(!inspectorPosition)return;
    const panel=$('inspectorObjeto'),host=$('contenedorPlano'),box=panel.getBoundingClientRect(),rect=host.getBoundingClientRect();
    const width=box.width||panel.offsetWidth||240,height=box.height||panel.offsetHeight||300,hostWidth=host.clientWidth||rect.width,hostHeight=host.clientHeight||rect.height;
    inspectorPosition.x=clamp(inspectorPosition.x,0,Math.max(0,hostWidth-width));inspectorPosition.y=clamp(inspectorPosition.y,0,Math.max(0,hostHeight-height));
    panel.style.right='auto';panel.style.left=inspectorPosition.x+'px';panel.style.top=inspectorPosition.y+'px';
  }
  const inspectorHeader=$('cabeceraInspector');
  inspectorHeader.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.target.closest('button'))return;
    finishInspector();const box=$('inspectorObjeto').getBoundingClientRect(),host=$('contenedorPlano').getBoundingClientRect();
    inspectorPosition={x:box.left-host.left,y:box.top-host.top};inspectorDrag={id:e.pointerId,x:e.clientX,y:e.clientY,left:inspectorPosition.x,top:inspectorPosition.y};
    inspectorHeader.setPointerCapture(e.pointerId);inspectorHeader.style.cursor='grabbing';e.preventDefault();
  });
  inspectorHeader.addEventListener('pointermove',e=>{if(!inspectorDrag||inspectorDrag.id!==e.pointerId)return;inspectorPosition={x:inspectorDrag.left+e.clientX-inspectorDrag.x,y:inspectorDrag.top+e.clientY-inspectorDrag.y};placeInspector();e.preventDefault();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])inspectorHeader.addEventListener(name,e=>{if(!inspectorDrag||inspectorDrag.id!==e.pointerId)return;inspectorDrag=null;inspectorHeader.style.cursor='grab';if(inspectorHeader.hasPointerCapture?.(e.pointerId))inspectorHeader.releasePointerCapture(e.pointerId);});
  window.addEventListener('resize',placeInspector);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(placeInspector).observe($('contenedorPlano'));
  function finishInspector(){if(!inspectorEdit)return;const edit=inspectorEdit;inspectorEdit=null;commit(edit.before);syncInspector(true);}
  function liveInspector(){if(selectedIds.size>1)return;const o=state.objects.find(o=>o.id===selected);if(!o)return;if(!inspectorEdit)inspectorEdit={id:o.id,before:serialize()};const fields=[$('anchoInspector'),$('largoInspector'),$('orientacionInspector')];if(fields.some(f=>String(f.value).trim()==='')){$('mensajeInspector').textContent='Completa la medida.';return;}const next=editedObject(o,{...o,w:Number(fields[0].value),h:Number(fields[1].value),rotation:Number(fields[2].value)});if(!next){$('mensajeInspector').textContent='El giro o las medidas no caben aquí. Mueve el objeto o marca Desplazamiento libre si se cruza con otro.';return;}state.objects=state.objects.map(a=>a.id===next.id?next:a);syncInspector();$('objW').value=next.w;$('objH').value=next.h;$('rotacion').value=next.rotation;render();$('mensajeInspector').textContent='Medidas actualizadas.';}
  for(const id of ['anchoInspector','largoInspector','orientacionInspector']){$(id).addEventListener('input',liveInspector);$(id).addEventListener('change',()=>{liveInspector();finishInspector();});$(id).addEventListener('blur',finishInspector);}
  $('cerrarInspector').addEventListener('click',()=>{finishInspector();selected=null;sync();render();});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#inspectorObjeto'))finishInspector();});
  function constraints() {
    $('opcionesPared').hidden=$('tipo').value!=='pared';
    const type=$('tipo').value, min=defaults[type][2], thin=['pared','mediaPared','puerta','ventana'].includes(type);
    $('objW').min=min; $('objH').min=thin?.2:min; $('objH').readOnly=thin;
    if(thin) $('objH').value=.2;
    $('objAyuda').textContent=(thin?'Grosor fijo: 0.20 m. ':'')+`Medida mínima: ${fmt(min)} m. Selecciona un objeto para editar estas medidas.${type==='pared'?' Encadenar: pulsa Agregar y arrastra por los cuadros; clic derecho para terminar. Sin marcar: coloca una pared libre.':''}`;
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
    const objects=[...state.objects].sort((a,b)=>(selectedIds.has(a.id)?1:0)-(selectedIds.has(b.id)?1:0)||(['puerta','ventana'].includes(a.type)?1:0)-(['puerta','ventana'].includes(b.type)?1:0)||b.w*b.h-a.w*a.h);
    for(const o of objects) drawObject(o);
    ctx.save();ctx.globalAlpha=.6;ctx.strokeStyle='#ffe06b';ctx.lineWidth=2;for(const o of detectedWalls){const b=bounds(o);ctx.strokeRect(b.x*scale,b.y*scale,b.w*scale,b.h*scale);}ctx.restore();
    if(drag&&mode==='area'){const r=area(drag.start,drag.current);ctx.fillStyle='#4191ff44';ctx.strokeStyle='#257cff';ctx.lineWidth=2;ctx.fillRect(r.x*scale,r.y*scale,r.w*scale,r.h*scale);ctx.strokeRect(r.x*scale,r.y*scale,r.w*scale,r.h*scale);}
    ctx.restore();ctx.strokeStyle='#b7cce1';ctx.lineWidth=1.5;ctx.strokeRect(0,0,w,h);
    ctx.restore();
    for(const o of state.objects){const b=bounds(o);if(b.w*scale<35||b.h*scale<20)continue;const p=screen(b.x+b.w/2,b.y+b.h/2);ctx.save();ctx.font='11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';const label=o.type==='estacionamiento'?quintaParking(o).capacity+' vehículos':o.type==='bano'?'Baño':o.type==='bombaAgua'?'Bomba de agua':quintaNombre(o.type);const width=ctx.measureText(label).width;ctx.fillStyle='#101b2bcc';ctx.fillRect(p.x-width/2-3,p.y-8,width+6,16);ctx.fillStyle='#fff';ctx.fillText(label,p.x,p.y);ctx.restore();}
    if(drag?.marquee){const r=marqueeRect();ctx.save();ctx.fillStyle='#4b9dff33';ctx.strokeStyle='#75b4ff';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.restore();}
    if(objectDimensions!=='ninguno')for(const o of state.objects){
      if(objectDimensions==='seleccion'&&!selectedIds.has(o.id))continue;
      const b=bounds(o),center=screen(b.x+b.w/2,b.y+b.h/2),eps=.011;
      const horizontal=[];if(b.y<=eps)horizontal.push(b.y);if(b.y+b.h>=state.length-eps)horizontal.push(b.y+b.h);if(!horizontal.length)horizontal.push(b.y);
      const vertical=[];if(b.x<=eps)vertical.push(b.x);if(b.x+b.w>=state.width-eps)vertical.push(b.x+b.w);if(!vertical.length)vertical.push(b.x+b.w);
      for(const y of horizontal)dimension(screen(b.x,y),screen(b.x+b.w,y),b.w,center,13,selectedIds.has(o.id));
      for(const x of vertical)dimension(screen(x,b.y),screen(x,b.y+b.h),b.h,center,13,selectedIds.has(o.id));
    }
    if(showCotas)drawMetreRulers();
    drawPlanDimensions();
    activeDimensionId=null;
    if(terrainHover&&separationPoints.length<2&&['separation','center'].includes(mode)){const p=edgePoint(terrainHover),q=screen(p.x,p.y);ctx.fillStyle='#ff4d4d';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.fill();ctx.stroke();}
    if(chainPoint){const q=screen(chainPoint.x,chainPoint.y);ctx.fillStyle='#ffe06b';ctx.beginPath();ctx.arc(q.x,q.y,5,0,Math.PI*2);ctx.fill();}for(const p of [...curvePoints,...dimensionPoints,...separationPoints.map(edgePoint)].filter(Boolean)){const q=screen(p.x,p.y);ctx.fillStyle='#ff4d4d';ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(q.x,q.y,6,0,Math.PI*2);ctx.fill();ctx.stroke();}
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
  function drawMetreRulers(){
    const center=screen(state.width/2,state.length/2);
    for(const edge of [[[0,0],[state.width,0],state.width],[[0,0],[0,state.length],state.length],[[0,state.length],[state.width,state.length],state.width],[[state.width,0],[state.width,state.length],state.length]]){
      const [aa,bb,length]=edge,a=screen(...aa),b=screen(...bb),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;let nx=-dy/len,ny=dx/len;const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(nx*(mid.x-center.x)+ny*(mid.y-center.y)<0){nx=-nx;ny=-ny;}
      const stride=scale>=17?1:scale>=9?2:5;ctx.save();ctx.font='10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeStyle='#7290a9';ctx.fillStyle='#b5cce0';ctx.lineWidth=.7;
      for(let m=0;m<=length+1e-7;m++){const x=a.x+dx*m/length,y=a.y+dy*m/length;ctx.beginPath();ctx.moveTo(x+nx*2,y+ny*2);ctx.lineTo(x+nx*6,y+ny*6);ctx.stroke();if(m%stride===0||Math.abs(m-length)<1e-7)ctx.fillText(String(m),x+nx*13,y+ny*13);}
      ctx.restore();
    }
  }
  function drawPlanDimensions(){
    const {groups,counts}=dimensionLayout(),center=screen(state.width/2,state.length/2);
    const edges={top:[[0,0],[state.width,0]],bottom:[[0,state.length],[state.width,state.length]],left:[[0,0],[0,state.length]],right:[[state.width,0],[state.width,state.length]]};
    for(const side in groups){const [ea,eb]=edges[side],sa=screen(...ea),sb=screen(...eb);
      for(const item of groups[side]){
        const {q,a,b,lane}=item,pa=screen(a.x,a.y),pb=screen(b.x,b.y);
        let start,end,value;
        const horizontal=['top','bottom'].includes(side);start=horizontal?screen(a.x,ea[1]):screen(ea[0],a.y);end=horizontal?screen(b.x,ea[1]):screen(ea[0],b.y);value=q.free?(q.measurement??Math.abs(horizontal?b.x-a.x:b.y-a.y)):Math.abs(horizontal?b.x-a.x:b.y-a.y);
        const dx=end.x-start.x,dy=end.y-start.y,len=Math.hypot(dx,dy);if(len<.01)continue;
        let nx=-dy/len,ny=dx/len;const edgeMid={x:(sa.x+sb.x)/2,y:(sa.y+sb.y)/2};if(nx*(edgeMid.x-center.x)+ny*(edgeMid.y-center.y)<0){nx=-nx;ny=-ny;}
        const boundary=Math.max(...[[0,0],[state.width,0],[state.width,state.length],[0,state.length]].map(p=>{const sp=screen(...p);return sp.x*nx+sp.y*ny;}));
        const gap=boundary-(start.x*nx+start.y*ny)+29+lane*26;
        {ctx.save();ctx.strokeStyle='#7894af';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(start.x,start.y);ctx.moveTo(pb.x,pb.y);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.restore();}
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
    ctx.save();ctx.strokeStyle=active?(state.dimensions.find(q=>q.id===activeDimensionId)?.color==='blue'?'#55adff':'#ff6767'):'#bdd6ee';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(a.x+nx*4,a.y+ny*4);ctx.lineTo(p.x+nx*5,p.y+ny*5);ctx.moveTo(b.x+nx*4,b.y+ny*4);ctx.lineTo(q.x+nx*5,q.y+ny*5);ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
    for(const t of [p,q]){ctx.moveTo(t.x-dx/len*3-nx*3,t.y-dy/len*3-ny*3);ctx.lineTo(t.x+dx/len*3+nx*3,t.y+dy/len*3+ny*3);}ctx.stroke();
    let angle=Math.atan2(dy,dx);while(angle>=Math.PI/2-1e-8)angle-=Math.PI;while(angle< -Math.PI/2-1e-8)angle+=Math.PI;
    ctx.translate((p.x+q.x)/2+nx*8,(p.y+q.y)/2+ny*8);ctx.rotate(angle);ctx.font='12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';const label=fmt(value)+' m',textWidth=ctx.measureText(label).width;ctx.fillStyle='#101b2bee';ctx.fillRect(-textWidth/2-4,-8,textWidth+8,16);ctx.fillStyle=active?(state.dimensions.find(q=>q.id===activeDimensionId)?.color==='blue'?'#85c7ff':'#ff8585'):'#e3efff';ctx.fillText(label,0,0);ctx.restore();
  }
  function drawObject(o){
    const origin=quintaPoint(o,0,0),px=quintaPoint(o,1,0),py=quintaPoint(o,0,1);
    ctx.save();ctx.transform(px.x-origin.x,px.y-origin.y,py.x-origin.x,py.y-origin.y,origin.x*scale,origin.y*scale);
    drawObjectGeometry({...o,x:0,y:0,rotation:0,flipX:false,flipY:false});ctx.restore();
  }
  function drawObjectGeometry(o){
    const b=bounds(o),x=b.x*scale,y=b.y*scale,w=b.w*scale,h=b.h*scale;
    ctx.save();ctx.lineWidth=1;ctx.strokeStyle='#203142';
    const colors={columpios:'#508ca0',resbaladilla:'#e8a52c',subeBaja:'#d79b48',casitaJuego:'#b78453',quiosco:'#ac7b55',mediaPared:'#a5a79b',bancaSemicircular:'#c5c2b4',hongoAgua:'#c5d9df',pergolaColumpio:'#a97c50',toboganRecto:'#e7a52a',toboganTunel:'#449e7a',toboganCurvo:'#4c9bd4',toboganTunel90:'#cb6058',circulo:'#73a45a',semicirculo:'#73a45a',bombaAgua:'#348eab',pared:'#556577',puerta:'#b97b45',ventana:'#a9e5ff',arbol:'#39843f',arbolAlcorque:'#3b8a4c',farol:'#e6c35e',mesaConBancas:'#b8b8af',palapa:'#d3a65b',casa:'#c57c65',alberca:'#29b9e8',bano:'#d5dcec',regaderas:'#b6dfe3',arbusto:'#4c9f52',fuente:'#8fd7eb',flores:'#dc7eb2',gallinero:'#c9ad6f',fogatero:'#9e8675',estacionamiento:'#828d9d',cocina:'#cda87a',juegos:'#9fbd65',pista:'#af8056',escenario:'#797b9c'};
    ctx.fillStyle=o.shapeColor||colors[o.type];
    if(o.type==='fogatero'){
      const cx=x+w/2,cy=y+h/2,r=Math.min(w,h)*.46;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle='#a2927b';ctx.fill();ctx.strokeStyle='#665e51';ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,r*.69,0,Math.PI*2);ctx.fillStyle='#433b33';ctx.fill();for(let i=0;i<12;i++){const t=i*Math.PI/6;ctx.beginPath();ctx.moveTo(cx+Math.cos(t)*r*.7,cy+Math.sin(t)*r*.7);ctx.lineTo(cx+Math.cos(t)*r,cy+Math.sin(t)*r);ctx.stroke();}ctx.strokeStyle='#80522f';ctx.lineWidth=Math.max(2,r*.18);for(const t of [-.6,.6]){ctx.beginPath();ctx.moveTo(cx-Math.cos(t)*r*.42,cy-Math.sin(t)*r*.42);ctx.lineTo(cx+Math.cos(t)*r*.42,cy+Math.sin(t)*r*.42);ctx.stroke();}ctx.fillStyle='#ff9d36';ctx.beginPath();ctx.moveTo(cx-r*.25,cy+r*.24);ctx.lineTo(cx-r*.12,cy-r*.33);ctx.lineTo(cx+r*.05,cy-r*.05);ctx.lineTo(cx+r*.2,cy-r*.4);ctx.lineTo(cx+r*.3,cy+r*.23);ctx.closePath();ctx.fill();
    }else     if(o.type==='columpios'){
      ctx.strokeStyle='#507b8f';ctx.lineWidth=3;for(const sx of [.08,.92]){ctx.beginPath();ctx.moveTo(x+w*sx,y+h*.1);ctx.lineTo(x+w*sx,y+h*.9);ctx.stroke();}ctx.beginPath();ctx.moveTo(x+w*.08,y+h*.5);ctx.lineTo(x+w*.92,y+h*.5);ctx.stroke();for(const sx of [.32,.68]){ctx.strokeStyle='#9db7bd';ctx.lineWidth=1;ctx.strokeRect(x+w*(sx-.08),y+h*.3,w*.16,h*.4);ctx.fillStyle='#e2ad4c';ctx.fillRect(x+w*(sx-.09),y+h*.43,w*.18,h*.14);}
    }else if(o.type==='subeBaja'){
      ctx.fillStyle='#a5b8a6';ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.1,h*.26,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d99c49';ctx.fillRect(x+w*.06,y+h*.4,w*.88,h*.2);for(const sx of [.1,.78]){ctx.fillStyle='#6197b5';ctx.fillRect(x+w*sx,y+h*.28,w*.12,h*.44);ctx.strokeStyle='#395762';ctx.strokeRect(x+w*(sx+.13),y+h*.36,w*.03,h*.28);}
    }else if(o.type==='casitaJuego'){
      ctx.fillStyle='#c8ad87';ctx.fillRect(x+w*.08,y+h*.1,w*.84,h*.8);ctx.fillStyle='#a87548';ctx.fillRect(x+w*.16,y+h*.15,w*.68,h*.6);ctx.strokeStyle='#6e533a';ctx.beginPath();ctx.moveTo(x+w*.16,y+h*.45);ctx.lineTo(x+w*.84,y+h*.45);ctx.moveTo(x+w*.5,y+h*.15);ctx.lineTo(x+w*.5,y+h*.75);ctx.stroke();ctx.fillStyle='#94c7d6';ctx.fillRect(x+w*.24,y+h*.24,w*.2,h*.12);ctx.fillStyle='#d7c0a2';for(let i=0;i<4;i++)ctx.fillRect(x+w*.4,y+h*(.76+i*.05),w*.2,h*.035);
    }else     if(o.type==='quiosco'){
      const cx=x+w/2,cy=y+h/2;for(let i=0;i<14;i++){const a=i*Math.PI*.5/14,b=(i+1)*Math.PI*.5/14;ctx.beginPath();ctx.moveTo(cx+w*.35*Math.cos(a),cy+h*.35*Math.sin(a));ctx.lineTo(cx+w*.49*Math.cos(a),cy+h*.49*Math.sin(a));ctx.lineTo(cx+w*.49*Math.cos(b),cy+h*.49*Math.sin(b));ctx.lineTo(cx+w*.35*Math.cos(b),cy+h*.35*Math.sin(b));ctx.closePath();ctx.fillStyle=i%2?'#c1b7a0':'#ded4be';ctx.fill();ctx.strokeStyle='#8d846f';ctx.stroke();}for(let i=0;i<8;i++){const a=Math.PI/8+i*Math.PI/4,b=a+Math.PI/4;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+w*.36*Math.cos(a),cy+h*.36*Math.sin(a));ctx.lineTo(cx+w*.36*Math.cos(b),cy+h*.36*Math.sin(b));ctx.closePath();ctx.fillStyle=i%2?'#ae805a':'#cfac7c';ctx.fill();ctx.strokeStyle='#72523b';ctx.stroke();}
    }else if(o.type==='bancaSemicircular'){
      ctx.beginPath();for(let i=0;i<=32;i++){const t=Math.PI*i/32,px=x+w/2+w*.48*Math.cos(t),py=y+h*.95-h*.9*Math.sin(t);i?ctx.lineTo(px,py):ctx.moveTo(px,py);}for(let i=32;i>=0;i--){const t=Math.PI*i/32;ctx.lineTo(x+w/2+w*.35*Math.cos(t),y+h*.95-h*.66*Math.sin(t));}ctx.closePath();ctx.fillStyle='#c5c2b4';ctx.fill();ctx.strokeStyle='#787e77';ctx.stroke();
    }else if(o.type==='hongoAgua'){
      const cx=x+w/2,cy=y+h/2;ctx.fillStyle='#a9dce8';ctx.beginPath();ctx.ellipse(cx,cy,w*.48,h*.48,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#dddccc';ctx.beginPath();ctx.ellipse(cx,cy,w*.42,h*.42,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#7b969b';ctx.stroke();for(let i=0;i<12;i++){const t=i*Math.PI/6;ctx.beginPath();ctx.moveTo(cx+w*.12*Math.cos(t),cy+h*.12*Math.sin(t));ctx.lineTo(cx+w*.4*Math.cos(t),cy+h*.4*Math.sin(t));ctx.stroke();}ctx.fillStyle='#a5aba4';ctx.beginPath();ctx.ellipse(cx,cy,w*.1,h*.1,0,0,Math.PI*2);ctx.fill();
    }else if(o.type==='mediaPared'){ctx.fillStyle='#a5a79b';ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.strokeStyle='#65736d';for(let i=1;i<Math.ceil(o.w/.4);i++){ctx.beginPath();ctx.moveTo(x+i*.4*scale,y);ctx.lineTo(x+i*.4*scale,y+h);ctx.stroke();}
    }else     if(o.type==='pergolaColumpio'){
      ctx.fillStyle='#b48a5d';for(const sx of [.06,.89])for(const sy of [.07,.86])ctx.fillRect(x+w*sx,y+h*sy,w*.05,h*.07);ctx.strokeStyle='#a97c50';ctx.lineWidth=2;ctx.strokeRect(x+w*.04,y+h*.05,w*.92,h*.9);
      ctx.lineWidth=1.3;for(let i=1;i<9;i++){ctx.beginPath();ctx.moveTo(x+w*(.05+i*.1),y+h*.05);ctx.lineTo(x+w*(.05+i*.1),y+h*.95);ctx.stroke();}ctx.fillStyle='#8c6543';ctx.fillRect(x+w*.2,y+h*.32,w*.6,h*.42);ctx.fillStyle='#f5f0df';ctx.fillRect(x+w*.24,y+h*.38,w*.52,h*.3);ctx.fillStyle='#e1dccd';ctx.fillRect(x+w*.24,y+h*.32,w*.52,h*.09);
      ctx.setLineDash([2,2]);ctx.strokeStyle='#d6dfdf';for(const sx of [.23,.77]){ctx.beginPath();ctx.moveTo(x+w*sx,y+h*.1);ctx.lineTo(x+w*sx,y+h*.32);ctx.moveTo(x+w*sx,y+h*.74);ctx.lineTo(x+w*sx,y+h*.9);ctx.stroke();}ctx.setLineDash([]);
    }else if((o.type.startsWith('tobogan')||o.type==='resbaladilla')){
      const layout=quintaSlide(o),points=layout.points;ctx.fillStyle='#657888';ctx.fillRect(x+w*.14,y+h*.07,w*.3,h*.15);ctx.strokeStyle='#c0ccd1';ctx.lineWidth=1;for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(x+w*.19,y+h*(.02+i*.035));ctx.lineTo(x+w*.39,y+h*(.02+i*.035));ctx.stroke();}
      const path=()=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x+p.x*scale,y+p.y*scale):ctx.moveTo(x+p.x*scale,y+p.y*scale));};ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#2e5163';ctx.lineWidth=layout.radius*scale*2+3;path();ctx.stroke();ctx.strokeStyle=colors[o.type];ctx.lineWidth=layout.radius*scale*2;path();ctx.stroke();
      if(layout.tube){ctx.strokeStyle='#d5eee7';ctx.lineWidth=1;for(let i=2;i<points.length-1;i+=3){const p=points[i],a=points[i-1],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);ctx.beginPath();ctx.moveTo(x+(p.x-dy/len*layout.radius)*scale,y+(p.y+dx/len*layout.radius)*scale);ctx.lineTo(x+(p.x+dy/len*layout.radius)*scale,y+(p.y-dx/len*layout.radius)*scale);ctx.stroke();}}else{ctx.strokeStyle='#fff0bf';ctx.lineWidth=1;path();ctx.stroke();}
    }else if(['circulo','semicirculo'].includes(o.type)){ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(o.shapeAngle||0);ctx.beginPath();ctx.ellipse(0,0,w/2,h/2,0,o.type==='circulo'?0:Math.PI,Math.PI*2);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
    else if(o.type==='arbol'){ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#715039';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.max(1,Math.min(w,h)*.1),0,Math.PI*2);ctx.fill();}
    else {if(!['farol','mesaConBancas','arbolAlcorque','estacionamiento'].includes(o.type)){ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}
      if(o.type==='palapa'){ctx.fillStyle='#c5bca6';ctx.fillRect(x,y,w,h);ctx.fillStyle='#7d5e3f';for(const sx of [.08,.48,.88])for(const sy of [.08,.48,.88])ctx.fillRect(x+w*sx,y+h*sy,Math.max(2,w*.035),Math.max(2,h*.035));}
      if(['casa','palapa'].includes(o.type)){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w/2,y+h/2);ctx.lineTo(x+w,y);ctx.moveTo(x,y+h);ctx.lineTo(x+w/2,y+h/2);ctx.lineTo(x+w,y+h);ctx.stroke();}
      if(o.type==='alberca'&&w>8&&h>8){ctx.strokeStyle='#ddf9ff';ctx.strokeRect(x+3,y+3,w-6,h-6);}
      if(o.type==='puerta'){ctx.strokeStyle='#d49654';ctx.setLineDash([3,2]);ctx.beginPath();if(o.rotation===0){ctx.arc(x,y+h,w, -Math.PI/2,0);ctx.moveTo(x,y+h);ctx.lineTo(x,y+h+w);}else{ctx.arc(x+w,y,h,0,Math.PI/2);ctx.moveTo(x+w,y);ctx.lineTo(x+w+h,y);}ctx.stroke();}
      if(o.type==='ventana'){ctx.strokeStyle='#1978a5';ctx.beginPath();if(o.rotation===0){ctx.moveTo(x,y+h/2);ctx.lineTo(x+w,y+h/2);}else{ctx.moveTo(x+w/2,y);ctx.lineTo(x+w/2,y+h);}ctx.stroke();}
      if(o.type==='bombaAgua'){ctx.fillStyle='#a5acaf';ctx.fillRect(x+w*.04,y+h*.08,w*.92,h*.84);ctx.fillStyle='#348eab';ctx.fillRect(x+w*.28,y+h*.25,w*.58,h*.5);ctx.fillStyle='#1e6078';ctx.beginPath();ctx.ellipse(x+w*.27,y+h*.5,w*.19,h*.32,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d4e9f0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+w*.08,y+h*.5);ctx.lineTo(x,y+h*.5);ctx.moveTo(x+w*.27,y+h*.22);ctx.lineTo(x+w*.27,y);ctx.stroke();}
      if(o.type==='regaderas'){ctx.strokeStyle='#2c7f9c';for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(x+w*.15,y+h*i/4);ctx.lineTo(x+w*.85,y+h*i/4);ctx.stroke();}}
      if(o.type==='bano'){ctx.strokeStyle='#57728a';ctx.fillStyle='#fff';ctx.fillRect(x+w*.3,y+h*.15,w*.4,h*.2);ctx.beginPath();ctx.ellipse(x+w*.5,y+h*.55,w*.2,h*.22,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
      if(o.type==='arbusto'){ctx.fillStyle='#247e3b';for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(x+w*(.25+i*.25),y+h*.5,w*.23,h*.4,0,0,Math.PI*2);ctx.fill();}}
      if(o.type==='fuente'){ctx.strokeStyle='#e3faff';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.4,h*.4,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.12,h*.12,0,0,Math.PI*2);ctx.stroke();}
      if(o.type==='gallinero'){ctx.setLineDash([3,2]);ctx.strokeStyle='#6f552b';ctx.strokeRect(x+w*.12,y+h*.12,w*.76,h*.76);ctx.setLineDash([]);}
      if(o.type==='estacionamiento'){const layout=quintaParking(o);for(const {bay}of layout.bays){ctx.fillStyle='#b6b8b1';ctx.fillRect(bay.x*scale,bay.y*scale,bay.w*scale,bay.h*scale);ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5;ctx.strokeRect(bay.x*scale,bay.y*scale,bay.w*scale,bay.h*scale);}for(let i=0;i<layout.bays.length;i++){const {car}=layout.bays[i];ctx.fillStyle=['#4f85ad','#cbd4db','#a9454d','#3a4857'][i%4];ctx.fillRect(car.x*scale,car.y*scale,car.w*scale,car.h*scale);ctx.strokeStyle='#233642';ctx.lineWidth=.7;ctx.strokeRect(car.x*scale,car.y*scale,car.w*scale,car.h*scale);ctx.fillStyle='#a8cedc';const longY=car.h>=car.w;ctx.fillRect((car.x+car.w*(longY?.15:.3))*scale,(car.y+car.h*(longY?.3:.15))*scale,car.w*(longY?.7:.4)*scale,car.h*(longY?.4:.7)*scale);}}
      if(o.type==='farol'){ctx.fillStyle='#4e5663';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.min(w,h)*.35,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffe1a1';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.min(w,h)*.22,0,Math.PI*2);ctx.fill();}
      if(o.type==='mesaConBancas'){for(const r of [{x:o.w*.34,y:o.h*.05,w:o.w*.32,h:o.h*.9},{x:o.w*.08,y:o.h*.06,w:o.w*.14,h:o.h*.88},{x:o.w*.78,y:o.h*.06,w:o.w*.14,h:o.h*.88}]){const b=quintaRect(o,r);ctx.fillStyle='#d1d2c8';ctx.fillRect(b.x*scale,b.y*scale,b.w*scale,b.h*scale);ctx.strokeRect(b.x*scale,b.y*scale,b.w*scale,b.h*scale);}}
      if(o.type==='arbolAlcorque'){ctx.fillStyle='#b5ad99';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.min(w,h)*.46,0,Math.PI*2);ctx.fill();ctx.fillStyle='#79664c';ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.min(w,h)*.35,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3c8b49';ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w*.3,h*.3,0,0,Math.PI*2);ctx.fill();}
      if(o.type==='flores'){for(let i=0;i<5;i++){ctx.fillStyle=i%2?'#ffe384':'#edb9e6';ctx.beginPath();ctx.arc(x+w*(.2+(i%3)*.3),y+h*(.3+Math.floor(i/3)*.4),Math.max(1,Math.min(w,h)*.1),0,Math.PI*2);ctx.fill();}}
    }
    if(selectedIds.has(o.id)){ctx.setLineDash([5,3]);ctx.strokeStyle='#ffe06b';ctx.lineWidth=3;ctx.strokeRect(x-3,y-3,w+6,h+6);}
    ctx.restore();
  }
  function point(e,limit=true){const r=canvas.getBoundingClientRect(),sx=((e.clientX-r.left)*parseFloat(canvas.style.width)/r.width-offset.x)/scale,sy=((e.clientY-r.top)*parseFloat(canvas.style.height)/r.height-offset.y)/scale;const [a,b,c,d]=matrix,det=a*d-b*c;const p={x:(d*sx-c*sy)/det,y:(a*sy-b*sx)/det};return limit?{x:clamp(p.x,0,state.width-.00001),y:clamp(p.y,0,state.length-.00001)}:p;}
  function area(a,b){const s=state.step,x=Math.floor(Math.min(a.x,b.x)/s)*s,y=Math.floor(Math.min(a.y,b.y)/s)*s;return {x,y,w:Math.min(state.width,(Math.floor(Math.max(a.x,b.x)/s)+1)*s)-x,h:Math.min(state.length,(Math.floor(Math.max(a.y,b.y)/s)+1)*s)-y};}
  function paintRect(r){for(let y=Math.floor(r.y/unit);y<Math.ceil((r.y+r.h)/unit-1e-8);y++)for(let x=Math.floor(r.x/unit);x<Math.ceil((r.x+r.w)/unit-1e-8);x++){const k=x+':'+y;if(material==='borrar')cells.delete(k);else cells.set(k,material);}}
  function stroke(a,b){const count=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/(unit/2)));for(let i=0;i<=count;i++){const p={x:a.x+(b.x-a.x)*i/count,y:a.y+(b.y-a.y)*i/count};paintRect(area(p,p));}}
  function chainSnap(p){return {x:round(clamp(Math.round(p.x/state.step)*state.step,.1,state.width-.1)),y:round(clamp(Math.round(p.y/state.step)*state.step,.1,state.length-.1))};}
  function extendWallChain(p){
    if(!chainPoint||drag?.blocked)return;
    const target=chainSnap(p),order=Math.abs(target.x-chainPoint.x)>=Math.abs(target.y-chainPoint.y)?['x','y']:['y','x'];
    for(const axis of order){let guard=0;while(Math.abs(target[axis]-chainPoint[axis])>.001&&guard++<300){
      const sign=Math.sign(target[axis]-chainPoint[axis]),grid=(sign>0?Math.floor((chainPoint[axis]+1e-7)/state.step)+1:Math.ceil((chainPoint[axis]-1e-7)/state.step)-1)*state.step;
      const end={...chainPoint,[axis]:round(sign>0?Math.min(target[axis],grid):Math.max(target[axis],grid))};if(Math.abs(end[axis]-chainPoint[axis])<.001)break;
      const o={id:uid(),type:'pared',x:round(Math.min(chainPoint.x,end.x)-.1),y:round(Math.min(chainPoint.y,end.y)-.1),w:round(Math.abs(end[axis]-chainPoint[axis])+.2),h:.2,rotation:axis==='x'?0:90};
      if(!fits(o)||collision(o)){if(drag)drag.blocked=true;say('La pared se detuvo al encontrar otro elemento. Clic derecho para terminar.');return;}
      state.objects.push(o);lastWall=o.id;chainPoint=end;
    }}
    render();
  }
  function finishWallChain(){if(drag?.wall){const before=drag.before;drag=null;commit(before);}endTools();mode='select';selected=null;sync();render();say('Paredes terminadas. Puedes seleccionar o borrar elementos.');}
  function placeCurve(p){
    if(curvePoints.length>=2)return say('Escribe el diámetro y pulsa Aplicar, o cancela para empezar de nuevo.');
    p=snap(p);if(p.x<0||p.y<0||p.x>state.width||p.y>state.length)return;
    if(curvePoints.length&&Math.hypot(p.x-curvePoints[0].x,p.y-curvePoints[0].y)<.01)return say('Marca un segundo punto diferente.');curvePoints.push(p);render();
    if(curvePoints.length===1)return say('Marca el otro extremo del diámetro.');
    const [a,b]=curvePoints,panel=$('cotaEnPlano'),host=canvas.parentElement,sp=screen(b.x,b.y);$('tituloMedidaCota').textContent='Diámetro (m)';$('metrosEnPlano').min='.2';$('metrosEnPlano').max='65';$('metrosEnPlano').value=round(Math.hypot(b.x-a.x,b.y-a.y));panel.style.left=clamp(sp.x+12,12,Math.max(12,host.clientWidth-320))+'px';panel.style.top=clamp(sp.y+12,12,Math.max(12,host.clientHeight-100))+'px';panel.hidden=false;$('metrosEnPlano').focus();$('metrosEnPlano').select();say('Escribe el diámetro real y pulsa Aplicar.');
  }
  function applyCurve(raw){
    const diameter=Number(raw);if(curvePoints.length!==2||!Number.isFinite(diameter)||diameter<.2||diameter>65)return say('Introduce un diámetro de 0.20 a 65 m.');
    const [a,b]=curvePoints,angle=Math.atan2(b.y-a.y,b.x-a.x),cx=a.x+Math.cos(angle)*diameter/2,cy=a.y+Math.sin(angle)*diameter/2;
    const o={id:uid(),type:$('figuraCurva').value,x:round(cx-diameter/2),y:round(cy-diameter/2),w:diameter,h:diameter,rotation:0,shapeAngle:angle,shapeColor:$('colorCurva').value};
    if(!validObject(o)||!fits(o))return say('La figura no cabe en esa posición. Elige otros puntos o un diámetro menor.');
    if(!canMoveOver(o)&&collision(o))return say('La figura se cruza con otro elemento. Marca Desplazamiento libre para superponerla.');
    action(()=>{state.objects.push(o);selected=o.id;mode='select';endTools();fillForm(o);});say('Figura agregada con el diámetro indicado. Puedes moverla, girarla o voltearla.');
  }
  $('colocarCurva').addEventListener('click',()=>{finishInspector();cancel();endTools();mode='shape';closeMenus();sync();render();say('Marca dos puntos para definir el diámetro.');});
  function placeDimension(p){
    if(dimensionPoints.length<2){
      if(p.x< -1e-8||p.y< -1e-8||p.x>state.width+1e-8||p.y>state.length+1e-8)return say('Marca los extremos dentro del terreno o en su borde.');
      const clickedRef=separationReference(p);dimensionRefs.push(clickedRef?nearestAnchor(clickedRef,p):null);let border=terrainSnap(p);if(border){const bp=edgePoint(border),sp=screen(p.x,p.y),sb=screen(bp.x,bp.y);if(Math.hypot(sp.x-sb.x,sp.y-sb.y)>6)border=null;}let nearest=border?edgePoint(border):null,best=nearest?Math.hypot(screen(p.x,p.y).x-screen(nearest.x,nearest.y).x,screen(p.x,p.y).y-screen(nearest.x,nearest.y).y):10;
      if(!border)for(const o of state.objects){const b=bounds(o);for(const candidate of [{x:b.x,y:clamp(p.y,b.y,b.y+b.h)},{x:b.x+b.w,y:clamp(p.y,b.y,b.y+b.h)},{x:clamp(p.x,b.x,b.x+b.w),y:b.y},{x:clamp(p.x,b.x,b.x+b.w),y:b.y+b.h}]){const sp=screen(p.x,p.y),sc=screen(candidate.x,candidate.y),d=Math.hypot(sp.x-sc.x,sp.y-sc.y);if(d<best){best=d;nearest=candidate;}}}
      p=nearest||snap(p);p={x:round(clamp(p.x,0,state.width)),y:round(clamp(p.y,0,state.length))};
      if(dimensionPoints.length&&Math.hypot(p.x-dimensionPoints[0].x,p.y-dimensionPoints[0].y)<.001){dimensionRefs.pop();return say('Elige un final distinto del inicio.');}
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
    const pair=dimensionPair();if(pair){separationPoints=[pair.a,pair.b];separationAxis=pair.axis;const applied=applySeparation(measurement);if(applied){dimensionPoints=[];dimensionRefs=[];separationPoints=[];separationClicks=[];freeDimensionSide=null;render();}return;}
    const [a,b]=dimensionPoints,side=freeDimensionSide,axis=['top','bottom'].includes(side)?'x':'y';
    action(()=>state.dimensions.push({id:uid(),axis,x1:a.x,y1:a.y,x2:b.x,y2:b.y,offset:0,side,free:true,measurement}));
    dimensionPoints=[];dimensionRefs=[];freeDimensionSide=null;$('cotaEnPlano').hidden=true;render();say('Cota colocada. Las medidas mayores que se cruzan quedan más afuera.');
  }
  function nearestAnchor(ref,p){
    if(ref.kind==='terrain'||ref.kind==='point')return ref;
    const b=referenceBounds(ref);if(!b)return null;
    const candidates=[{...ref,side:'left',t:clamp((p.y-b.y)/b.h,0,1)},{...ref,side:'right',t:clamp((p.y-b.y)/b.h,0,1)},{...ref,side:'top',t:clamp((p.x-b.x)/b.w,0,1)},{...ref,side:'bottom',t:clamp((p.x-b.x)/b.w,0,1)}],sp=screen(p.x,p.y);
    return candidates.sort((a,b)=>{const pa=edgePoint(a),pb=edgePoint(b),sa=screen(pa.x,pa.y),sb=screen(pb.x,pb.y);return Math.hypot(sa.x-sp.x,sa.y-sp.y)-Math.hypot(sb.x-sp.x,sb.y-sp.y);})[0];
  }
  function dimensionPair(){
    if(dimensionRefs.length!==2)return null;let [a,b]=dimensionRefs;
    const object=r=>r&&!r.kind?state.objects.find(o=>o.id===r.id):null;
    // Fixed elements are references, regardless of which one was clicked first.
    const fixed=o=>o&&['puerta','ventana','pared'].includes(o.type);
    if((b?.kind&&object(a))||(fixed(object(b))&&object(a)&&!fixed(object(a))))[a,b]=[b,a];
    if(!a&&object(b)){const p=dimensionPoints[0],q=dimensionPoints[1],axis=Math.abs(q.x-p.x)>=Math.abs(q.y-p.y)?'x':'y';a={kind:'point',x:p.x,y:p.y,side:axis==='x'?'right':'bottom',t:0};}if(!a||!object(b)||(!a.kind&&a.id===b.id))return null;
    const click=dimensionRefs[1]===b?dimensionPoints[1]:dimensionPoints[0],first=dimensionRefs[1]===b?dimensionPoints[0]:dimensionPoints[1],axis=Math.abs(click.x-first.x)>=Math.abs(click.y-first.y)?'x':'y';
    return {a:separationAnchor(a,first,axis),b:anchorFor({id:b.id},click,axis),axis};
  }
  function anchorFor(ref,p,axis){if(ref.kind==='terrain'&&ref.side&&Number.isFinite(ref.t))return ref;const b=referenceBounds(ref),side=ref.kind==='terrain'&&ref.side?ref.side:axis==='x'?(Math.abs(p.x-b.x)<Math.abs(p.x-b.x-b.w)?'left':'right'):(Math.abs(p.y-b.y)<Math.abs(p.y-b.y-b.h)?'top':'bottom');return {...ref,side,t:clamp(axis==='x'?(p.y-b.y)/b.h:(p.x-b.x)/b.w,0,1)};}
  function terrainSnap(p){const cursor=screen(p.x,p.y),edges=[['left',[0,0],[0,state.length]],['right',[state.width,0],[state.width,state.length]],['top',[0,0],[state.width,0]],['bottom',[0,state.length],[state.width,state.length]]];let best=null;for(const [side,aa,bb] of edges){const a=screen(...aa),b=screen(...bb),dx=b.x-a.x,dy=b.y-a.y,t=clamp(((cursor.x-a.x)*dx+(cursor.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1),distance=Math.hypot(cursor.x-a.x-t*dx,cursor.y-a.y-t*dy);if(distance<=14&&(!best||distance<best.distance))best={kind:'terrain',side,t,distance};}return best?{kind:'terrain',side:best.side,t:best.t}:null;}
  function separationReference(p){
    const border=terrainSnap(p);if(border)return border;const hit=hitObject(p);if(hit)return {id:hit.id};
    if(p.x<0||p.y<0||p.x>state.width||p.y>state.length)return null;
    let key=null;for(const [dx,dy]of [[0,0],[-.00001,0],[0,-.00001],[-.00001,-.00001]]){const k=Math.floor((p.x+dx)/unit)+':'+Math.floor((p.y+dy)/unit);if(cells.has(k)){key=k;break;}}
    if(!key)return null;const [cx,cy]=key.split(':').map(Number),center={x:(cx+.5)*unit,y:(cy+.5)*unit},r=area(center,center);
    return {kind:'surface',id:'surface:'+r.x+':'+r.y+':'+r.w+':'+r.h,key,...r};
  }
  function hitObject(p){return [...state.objects].sort((a,b)=>(selectedIds.has(a.id)?1:0)-(selectedIds.has(b.id)?1:0)||(['puerta','ventana'].includes(a.type)?1:0)-(['puerta','ventana'].includes(b.type)?1:0)||b.w*b.h-a.w*a.h).reverse().find(o=>{const b=bounds(o),pad=Math.max(.08,3/scale);return p.x>=b.x-pad&&p.x<=b.x+b.w+pad&&p.y>=b.y-pad&&p.y<=b.y+b.h+pad;});}
  function showDistanceEditor(){const free=mode==='dimension',[ra,rb]=separationPoints,a=free?dimensionPoints[0]:edgePoint(ra),b=free?dimensionPoints[1]:edgePoint(rb);if(!a||!b)return;const pair=free?dimensionPair():null;const v=round(pair?Math.abs(edgePoint(pair.a)[pair.axis]-edgePoint(pair.b)[pair.axis]):free?Math.abs(['top','bottom'].includes(freeDimensionSide)?b.x-a.x:b.y-a.y):Math.abs(a[separationAxis]-b[separationAxis]));$('tituloMedidaCota').textContent=mode==='center'?'Distancia entre centros (m)':free&&!pair?'Medida de la cota (m)':'Separación (m)';$('metrosEnPlano').min=free?'0.01':'0';$('metrosEnPlano').max=free?'1000':'65';$('metrosEnPlano').value=v;closeMenus();const panel=$('cotaEnPlano'),host=canvas.parentElement,sp=screen(b.x,b.y);panel.style.left=clamp((canvas.offsetLeft||0)+sp.x+12,(host.scrollLeft||0)+12,(host.scrollLeft||0)+Math.max(12,host.clientWidth-320))+'px';panel.style.top=clamp((canvas.offsetTop||0)+sp.y+12,(host.scrollTop||0)+12,(host.scrollTop||0)+Math.max(12,host.clientHeight-100))+'px';panel.hidden=false;$('metrosEnPlano').focus();$('metrosEnPlano').select();}
  function metrePoint(p){return {x:clamp(Math.round(p.x),0,state.width),y:clamp(Math.round(p.y),0,state.length)};}
  function separationAnchor(ref,p,axis){
    if(ref.kind==='point'||ref.kind==='terrain'&&!(axis==='x'?['left','right']:['top','bottom']).includes(ref.side))return {kind:'point',x:p.x,y:p.y,side:axis==='x'?'right':'bottom',t:0};
    return anchorFor(ref,p,axis);
  }
  function chooseSeparation(raw){
    const p=metrePoint(raw);if(separationPoints.length===2){separationPoints=[];separationClicks=[];$('cotaEnPlano').hidden=true;}
    if(!separationPoints.length){const ref=separationReference(raw)||separationReference(p)||{kind:'point',x:p.x,y:p.y,side:'right',t:0};separationPoints=[nearestAnchor(ref,p)];separationClicks=[p];terrainHover=null;say('Referencia fija elegida. Marca el objeto en la dirección horizontal o vertical deseada.');}
    else{const hit=hitObject(raw)||hitObject(p);if(!hit)return say('El segundo punto debe tocar el objeto que deseas mover.');if(!separationPoints[0].kind&&separationPoints[0].id===hit.id)return say('Elige un objeto diferente de la referencia.');const first=separationClicks[0],dx=p.x-first.x,dy=p.y-first.y;if(Math.abs(dx)+Math.abs(dy)<.001)return say('Marca un segundo punto distinto para definir la dirección.');separationAxis=Math.abs(dx)>=Math.abs(dy)?'x':'y';separationPoints=[separationAnchor(separationPoints[0],first,separationAxis),anchorFor({id:hit.id},p,separationAxis)];separationClicks.push(p);terrainHover=null;showDistanceEditor();say('Escribe los metros, con decimales si hace falta. Solo se moverá el objeto en el eje elegido.');}render();
  }
  function chooseCenter(p){
    if(separationPoints.length===2){separationPoints=[];separationClicks=[];$('cotaEnPlano').hidden=true;}
    const hit=hitObject(p);if(!hit)return say('Elige un objeto para tomar su centro.');
    if(!separationPoints.length){const ref={id:hit.id,side:'center',t:.5};separationPoints=[ref];separationClicks=[edgePoint(ref)];terrainHover=null;say('Centro de referencia fijo. Elige el objeto que deseas separar.');}
    else{if(separationPoints[0].id===hit.id)return say('Elige un segundo objeto diferente.');const target={id:hit.id,side:'center',t:.5},a=edgePoint(separationPoints[0]),b=edgePoint(target);separationAxis=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y)?'x':'y';separationPoints.push(target);separationClicks.push(b);terrainHover=null;showDistanceEditor();say('Escribe la distancia real entre centros. Solo se moverá el segundo objeto.');}render();
  }
  function applySeparation(distance){
if(separationPoints.length!==2)return say('Primero elige una referencia y el lado de otro objeto.');
    const axis=separationAxis,dist=Number(distance);if(!Number.isFinite(dist)||dist<0||dist>65)return say('Introduce una distancia de 0 a 65 m.');
    const [ref,target]=separationPoints,a=edgePoint(ref),b=edgePoint(target),original=state.objects.find(o=>o.id===target.id);if(!a||!b||!original)return say('Selecciona nuevamente los dos lados.');
    const sign=Math.sign(b[axis]-a[axis])||(target.side==='left'||target.side==='top'?1:-1),next={...original,[axis]:round(original[axis]+a[axis]+sign*dist-b[axis])};
    if(!fits(next))return say('Esa separación dejaría el objeto fuera del terreno. Introduce una distancia menor.');
    if(!canMoveOver(next)&&collision(next))return say('Esa separación encimaría el objeto con otro. Elige otra medida.');
    const refs=JSON.parse(JSON.stringify({a:ref,b:target}));
    action(()=>{state.objects=state.objects.map(o=>o.id===next.id?next:o);state.dimensions=state.dimensions.filter(q=>!(q.link&&q.axis===axis&&q.link.b.id===target.id));state.dimensions.push({id:uid(),axis,x1:a.x,y1:a.y,x2:axis==='x'?a.x+sign*dist:a.x,y2:axis==='y'?a.y+sign*dist:a.y,offset:0,link:refs,...(['dimension','center'].includes(mode)?{color:'blue'}:{})});selected=next.id;fillForm(next);});
    closeMenus();$('cotaEnPlano').hidden=true;say(`Objeto separado ${fmt(dist)} m entre los lados elegidos. Cota colocada.`);return true;
  }

  $('cotaEnPlano').addEventListener('submit',e=>{e.preventDefault();if(mode==='shape')applyCurve($('metrosEnPlano').value);else if(mode==='dimension')applyFreeDimension($('metrosEnPlano').value);else applySeparation($('metrosEnPlano').value);});
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
  $('desplazamientoLibre').addEventListener('change',()=>{cancel();say($('desplazamientoLibre').checked?'Desplazamiento libre: los objetos pueden pasar sobre otros; las paredes conservan sus topes.':'Topes activados al mover objetos.');sync();render();});
  $('encadenar').addEventListener('change',()=>{endTools();if(!$('encadenar').checked&&mode==='wall')mode='select';sync();render();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(mode==='wall')finishWallChain();else{endTools();render();}}});
  function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
  function askErase(target){finishInspector();cancel();endTools();pendingErase=target;$('preguntaBorrar').textContent=target.kind==='all'?'¿Limpiar todo el terreno?':'¿Borrar?';const description=target.kind==='all'?'Se quitarán objetos, superficies y cotas. Puedes recuperar todo con Deshacer.':target.kind==='objects'?target.ids.length+' objetos seleccionados':target.kind==='object'?'Objeto seleccionado':target.kind==='dimension'?'Cota seleccionada':target.kind==='surface'?'Superficie seleccionada':'Imagen de referencia';$('detalleBorrar').textContent=description;$('confirmarBorrado').showModal();}
  function eraseAt(p){const sp=screen(p.x,p.y),dim=[...dimensionHits].reverse().find(d=>segmentDistance(sp,d.a,d.b)<12);if(dim)return askErase({kind:'dimension',id:dim.id});const hit=[...state.objects].sort((a,b)=>(selectedIds.has(a.id)?1:0)-(selectedIds.has(b.id)?1:0)||(['puerta','ventana'].includes(a.type)?1:0)-(['puerta','ventana'].includes(b.type)?1:0)||b.w*b.h-a.w*a.h).reverse().find(o=>{const b=bounds(o);return p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h;});if(hit)return askErase({kind:'object',id:hit.id});
    if(p.x>=0&&p.y>=0&&p.x<state.width&&p.y<state.length){const r=area(p,p),keys=[...cells.keys()].filter(k=>{const [x,y]=k.split(':').map(Number);return x*unit<r.x+r.w&&x*unit+unit>r.x&&y*unit<r.y+r.h&&y*unit+unit>r.y;});if(keys.length)return askErase({kind:'surface',keys});}
    if(referenceImage&&p.x>=referenceImage.x&&p.x<=referenceImage.x+referenceImage.w&&p.y>=referenceImage.y&&p.y<=referenceImage.y+referenceImage.h)return askErase({kind:'image'});say('No hay un elemento para borrar en ese punto.');}
  $('manoPlano').addEventListener('click',()=>{cancel();finishInspector();endTools();mode=mode==='pan'?'select':'pan';sync();closeMenus();render();});
  const panHost=canvas.parentElement;
  panHost.addEventListener('pointerdown',e=>{if(mode!=='pan'||e.button!==0||e.target.closest('form'))return;e.preventDefault();panHost.setPointerCapture(e.pointerId);panDrag={id:e.pointerId,x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};canvas.style.cursor='grabbing';});
  panHost.addEventListener('pointermove',e=>{if(!panDrag||e.pointerId!==panDrag.id)return;pan={x:panDrag.px+e.clientX-panDrag.x,y:panDrag.py+e.clientY-panDrag.y};render();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])panHost.addEventListener(name,()=>{if(!panDrag)return;panDrag=null;canvas.style.cursor=toolCursor();});
  let contextErase=null;
  function closeContext(){ $('menuContextual').hidden=true;contextErase=null; }
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();finishInspector();const chaining=mode==='wall';if(drag?.wall){const before=drag.before;drag=null;commit(before);}else cancel();if(!chaining)endTools();$('terminarParedes').hidden=!chaining;const p=point(e,false),hit=hitObject(p),dim=[...dimensionHits].reverse().find(d=>segmentDistance(screen(p.x,p.y),d.a,d.b)<12);normalizeSelection();if(!dim&&selectedIds.size&&(!hit||selectedIds.has(hit.id))){const ids=[...selectedIds];contextErase=()=>askErase(ids.length>1?{kind:'objects',ids}:{kind:'object',id:ids[0]});}else contextErase=()=>eraseAt(p);const menu=$('menuContextual');menu.style.left=clamp(e.clientX,8,window.innerWidth-170)+'px';menu.style.top=clamp(e.clientY,8,window.innerHeight-(chaining?110:65))+'px';menu.hidden=false;$('borrarContextual').focus();});
  $('terminarParedes').addEventListener('click',()=>{closeContext();finishWallChain();});
  $('borrarContextual').addEventListener('click',()=>{const run=contextErase;closeContext();if(run)run();});document.addEventListener('pointerdown',e=>{if(!e.target.closest('#menuContextual'))closeContext();});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeContext();});
  canvas.addEventListener('dblclick',e=>{if(mode==='pan'||mode==='erase')return;const p=point(e,false),hit=dimensionHits.find(d=>segmentDistance(screen(p.x,p.y),d.a,d.b)<12),q=state.dimensions.find(q=>q.id===hit?.id);if(q?.link){finishInspector();cancel();endTools();mode=q.link.a.side==='center'&&q.link.b.side==='center'?'center':'separation';separationAxis=q.axis;separationPoints=JSON.parse(JSON.stringify([q.link.a,q.link.b]));separationClicks=separationPoints.map(edgePoint);$('tipoCota').value=mode;sync();render();showDistanceEditor();}});
  $('borradorPlano').addEventListener('click',()=>{normalizeSelection();if(selectedIds.size){remove();return;}cancel();endTools();mode=mode==='erase'?'select':'erase';sync();closeMenus();render();});
  $('seleccionarPlano').addEventListener('click',()=>{cancel();endTools();mode='select';sync();closeMenus();render();});
  $('siBorrar').addEventListener('click',()=>{const target=pendingErase;if(!target)return;pendingErase=null;$('confirmarBorrado').close();action(()=>{if(target.kind==='all'){state.objects=[];state.dimensions=[];state.cells=[];cells.clear();selected=null;selectedIds.clear();referenceImage=null;detectedWalls=[];imageGeneratedIds=[];imageGroundChanges=[];imageRequest++;mode='select';}else if(target.kind==='objects'){state.objects=state.objects.filter(o=>!target.ids.includes(o.id));selected=null;selectedIds.clear();}else if(target.kind==='object'){state.objects=state.objects.filter(o=>o.id!==target.id);if(selected===target.id)selected=null;}else if(target.kind==='dimension')state.dimensions=state.dimensions.filter(q=>q.id!==target.id);else if(target.kind==='surface')for(const key of target.keys)cells.delete(key);else{referenceImage=null;detectedWalls=[];}say('Elemento borrado.');});});
  function dismissErase(){pendingErase=null;$('confirmarBorrado').close();}
  $('limpiarPlano').addEventListener('click',()=>askErase({kind:'all'}));
  $('noBorrar').addEventListener('click',dismissErase);$('confirmarBorrado').addEventListener('cancel',()=>{pendingErase=null;});$('confirmarBorrado').addEventListener('close',()=>{pendingErase=null;});
  canvas.addEventListener('pointerdown',e=>{
    if(mode==='pan'||e.button!==0||drag)return;finishInspector();const p=point(e,false);
    if(mode==='erase'){eraseAt(p);return;}
    if(mode==='shape'){placeCurve(p);return;}if(mode==='dimension'){placeDimension(p);return;}
    if(mode==='center'){chooseCenter(p);return;}if(mode==='separation'){chooseSeparation(p);return;}
    if(mode!=='select'&&(p.x< -1e-8||p.y< -1e-8||p.x>state.width+1e-8||p.y>state.length+1e-8))return;
    if(mode==='wall'){e.preventDefault();canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,wall:true,start:p,current:p,before:serialize()};if(!chainPoint)chainPoint=chainSnap(p);else extendWallChain(p);render();return;}
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
    for(let i=1;i<=steps;i++){const offset={x:round(start.x+(dx-start.x)*i/steps),y:round(start.y+(dy-start.y)*i/steps)},proposed=source.map(o=>({...o,x:round(o.x+offset.x),y:round(o.y+offset.y)}));if(proposed.some(o=>!fits(o)||(!canMoveOver(o)&&collision(o,obstacles)))){if($('ajusteMovimiento').value==='grid')accepted=start;break;}accepted=offset;}
    const moved=new Map(source.map(o=>[o.id,{...o,x:round(o.x+accepted.x),y:round(o.y+accepted.y)}]));state.objects=state.objects.map(o=>moved.get(o.id)||o);drag.applied=accepted;canvas.style.cursor='move';
  }
  function moving(e){if(!drag||e.pointerId!==drag.id)return;const p=point(e,!drag.marquee);if(drag.wall){extendWallChain(p);drag.current=p;return;}if(mode==='select'&&drag.marquee){drag.current=p;updateMarquee();sync();render();return;}if(mode==='select'&&drag.group){moveGroup(p);drag.current=p;sync();render();return;}
    if(mode==='brush')stroke(drag.current,p);
    if(mode==='select'&&drag.object){canvas.style.cursor='move';const o=state.objects.find(o=>o.id===selected),b=bounds(o);let next={x:drag.object.x+p.x-drag.start.x,y:drag.object.y+p.y-drag.start.y};if($('ajusteMovimiento').value==='grid'){next=snap(next);next.x=Math.min(next.x,Math.floor((state.width-b.w)/state.step)*state.step);next.y=Math.min(next.y,Math.floor((state.length-b.h)/state.step)*state.step);}let candidate=magnet({...o,x:round(clamp(next.x,0,state.width-b.w)),y:round(clamp(next.y,0,state.length-b.h))});const start={...o};if(canMoveOver(o)||(collision(start)&&!collision(candidate))){o.x=candidate.x;o.y=candidate.y;}else{const steps=Math.max(1,Math.ceil(Math.hypot(candidate.x-start.x,candidate.y-start.y)/.05));for(let i=1;i<=steps;i++){const part={...o,x:round(start.x+(candidate.x-start.x)*i/steps),y:round(start.y+(candidate.y-start.y)*i/steps)};if(collision(part)){if($('ajusteMovimiento').value==='grid'){o.x=start.x;o.y=start.y;}break;}o.x=part.x;o.y=part.y;}}fillForm(o);}
    drag.current=p;render();
  }
  canvas.addEventListener('pointermove',e=>{if(mode==='center'&&!drag&&separationPoints.length<2){const hit=hitObject(point(e,false));terrainHover=hit?{id:hit.id,side:'center',t:.5}:null;render();}if(mode==='separation'&&!drag&&separationPoints.length<2){const p=metrePoint(point(e,false));terrainHover={kind:'point',x:p.x,y:p.y,side:'right',t:0};render();}moving(e);});
  canvas.addEventListener('pointerleave',()=>{if(terrainHover){terrainHover=null;render();}});
  canvas.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;moving(e);if(mode==='area')paintRect(area(drag.start,drag.current));const before=drag.before;drag=null;commit(before);});
  function cancel(){if(!drag)return;const before=drag.before;drag=null;restore(JSON.parse(before),true);render();say('Acción cancelada.');}
  canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',e=>{if(drag&&e.pointerId===drag.id){const before=drag.before;drag=null;commit(before);}});
  document.querySelectorAll('[data-material]').forEach(b=>b.addEventListener('click',()=>{cancel();endTools();material=b.dataset.material;if(!['brush','area'].includes(mode))mode='brush';sync();render();}));
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{cancel();endTools();mode=b.dataset.mode;sync();render();}));
  $('tamCelda').addEventListener('change',()=>action(()=>{state.step=Number($('tamCelda').value);say('Separación cambiada. Las superficies conservan su posición.');}));
  $('formTerreno').addEventListener('submit',e=>{e.preventDefault();const w=Number($('ancho').value),h=Number($('largo').value);if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||w>35||h<1||h>65)return say('Ancho: 1–35 m. Largo: 1–65 m.');if(state.objects.some(o=>!fits(o,w,h)))return say('Hay objetos fuera de las nuevas medidas. Muévelos o elimínalos antes de reducir el terreno.');action(()=>{state.width=w;state.length=h;state.dimensions=state.dimensions.filter(q=>{if(q.link)return true;q.x1=clamp(q.x1,0,w);q.x2=clamp(q.x2,0,w);q.y1=clamp(q.y1,0,h);q.y2=clamp(q.y2,0,h);return Math.hypot(q.x2-q.x1,q.y2-q.y1)>.0001;});cells=new Map([...cells].filter(([k])=>{const [x,y]=k.split(':').map(Number);return x*unit<w&&y*unit<h;}));say('Medidas actualizadas; las cotas se adaptaron. Puedes deshacer el cambio.');});});
  $('tipo').addEventListener('change',fresh);
  function mirrorObject(o,axis){const key=(o.rotation%180===90)===(axis==='x')?'flipY':'flipX';return {...o,[key]:!o[key]};}
  function transformObjects(kind,axis){if(kind==='mirror'&&view==='horizontal')axis=axis==='x'?'y':'x';finishInspector();cancel();normalizeSelection();const originals=state.objects.filter(o=>selectedIds.has(o.id));if(!originals.length)return say('Selecciona una o varias figuras.');let proposed;
    const bs=originals.map(bounds),left=Math.min(...bs.map(b=>b.x)),top=Math.min(...bs.map(b=>b.y)),right=Math.max(...bs.map(b=>b.x+b.w)),bottom=Math.max(...bs.map(b=>b.y+b.h)),cx=(left+right)/2,cy=(top+bottom)/2;
    if(kind==='rotate'){const turn=axis==='left'?-1:1;proposed=originals.map(o=>{const b=bounds(o),nx=cx-turn*(b.y+b.h/2-cy),ny=cy+turn*(b.x+b.w/2-cx),next={...o,rotation:(o.rotation+(axis==='left'?-90:90)+360)%360},r=bounds(next);return {...next,x:round(nx-r.w/2),y:round(ny-r.h/2)};});const boxes=proposed.map(bounds),minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y)),maxX=Math.max(...boxes.map(b=>b.x+b.w)),maxY=Math.max(...boxes.map(b=>b.y+b.h));if(maxX-minX>state.width||maxY-minY>state.length)return say('La figura girada no cabe en el terreno.');const dx=minX<0?-minX:maxX>state.width?state.width-maxX:0,dy=minY<0?-minY:maxY>state.length?state.length-maxY:0;proposed=proposed.map(o=>({...o,x:round(o.x+dx),y:round(o.y+dy)}));}
    else proposed=originals.map(o=>{const b=bounds(o);return {...mirrorObject(o,axis),x:axis==='x'?round(left+right-b.x-b.w):o.x,y:axis==='y'?round(top+bottom-b.y-b.h):o.y};});
    const others=state.objects.filter(o=>!selectedIds.has(o.id));if(proposed.some(o=>!fits(o)||(!canMoveOver(o)&&collision(o,others))))return say('La transformación se cruza con otro objeto. Mueve la figura o marca Desplazamiento libre.');
    action(()=>{const map=new Map(proposed.map(o=>[o.id,o]));state.objects=state.objects.map(o=>map.get(o.id)||o);fillForm(state.objects.find(o=>o.id===selected));});say(kind==='rotate'?'Figuras giradas 90°.':'Figuras volteadas en espejo.');
  }
  function mirrorPlan(axis){if(view==='horizontal')axis=axis==='x'?'y':'x';finishInspector();cancel();endTools();action(()=>{
    const oldCells=cells,keyMap=new Map();cells=new Map();for(const [key,material]of oldCells){const [x,y]=key.split(':').map(Number),nx=axis==='x'?Math.max(0,Math.floor((state.width-(x+.5)*unit)/unit)):x,ny=axis==='y'?Math.max(0,Math.floor((state.length-(y+.5)*unit)/unit)):y,nk=nx+':'+ny;keyMap.set(key,nk);cells.set(nk,material);}
    state.objects=state.objects.map(o=>{const b=bounds(o);return {...mirrorObject(o,axis),x:axis==='x'?round(state.width-b.x-b.w):o.x,y:axis==='y'?round(state.length-b.y-b.h):o.y};});
    const swap=side=>axis==='x'?({left:'right',right:'left'}[side]||side):({top:'bottom',bottom:'top'}[side]||side);
    function ref(r){const next={...r,side:swap(r.side)};if((axis==='x'&&['top','bottom'].includes(r.side))||(axis==='y'&&['left','right'].includes(r.side)))next.t=1-r.t;if(r.kind==='point'){next.x=axis==='x'?round(state.width-r.x):r.x;next.y=axis==='y'?round(state.length-r.y):r.y;}if(r.kind==='surface'){next.x=axis==='x'?round(state.width-r.x-r.w):r.x;next.y=axis==='y'?round(state.length-r.y-r.h):r.y;next.key=keyMap.get(r.key)||r.key;next.id='surface:'+next.x+':'+next.y+':'+next.w+':'+next.h;}return next;}
    state.dimensions=state.dimensions.map(q=>({...q,x1:axis==='x'?round(state.width-q.x1):q.x1,x2:axis==='x'?round(state.width-q.x2):q.x2,y1:axis==='y'?round(state.length-q.y1):q.y1,y2:axis==='y'?round(state.length-q.y2):q.y2,...(q.side?{side:swap(q.side)}:{}),offset:(axis==='x'&&q.axis==='y'||axis==='y'&&q.axis==='x')?-q.offset:q.offset,...(q.link?{link:{a:ref(q.link.a),b:ref(q.link.b)}}:{})}));
    imageGeneratedIds=[];imageGroundChanges=[];fillForm(state.objects.find(o=>o.id===selected)||{type:$('tipo').value,w:Number($('objW').value),h:Number($('objH').value),rotation:Number($('rotacion').value)});
  });say('Plano volteado en espejo; textos y cotas conservan su lectura.');}
  $('rotarObjeto').addEventListener('click',()=>transformObjects('rotate',$('ladoGiroInspector').value));
  $('rotarFormulario').addEventListener('click',()=>{normalizeSelection();if(selectedIds.size){transformObjects('rotate',$('ladoGiroFormulario').value);return;}const turn=$('ladoGiroFormulario').value==='left'?-90:90;$('rotacion').value=(Number($('rotacion').value)+turn+360)%360;say('El próximo objeto se agregará girado 90° hacia la '+(turn<0?'izquierda.':'derecha.'));});
  for(const id of ['ladoGiroInspector','ladoGiroFormulario'])$(id).addEventListener('change',()=>{const side=$(id).value;$('ladoGiroInspector').value=side;$('ladoGiroFormulario').value=side;});
  $('voltearObjeto').addEventListener('click',()=>transformObjects('mirror',$('ejeVoltearObjeto').value));
  $('voltearTerreno').addEventListener('click',()=>mirrorPlan($('ejeVoltearTerreno').value));
  function objectFromForm(id){return {id,type:$('tipo').value,x:0,y:0,w:Number($('objW').value),h:Number($('objH').value),rotation:Number($('rotacion').value)};}
  $('formObjeto').addEventListener('submit',e=>{e.preventDefault();cancel();if($('tipo').value==='pared'&&$('encadenar').checked){endTools();mode='wall';selected=null;sync();closeMenus();render();say('Paredes encadenadas: arrastra con clic izquierdo; clic derecho → Terminar paredes.');return;}const base=objectFromForm(uid());if(!validObject(base))return say('Revisa las medidas mínimas.');const next=freePosition(base);if(!next)return say(base.type==='pared'?'No queda espacio libre para ese tamaño.': 'No queda espacio libre para ese tamaño. Reduce las medidas o marca Desplazamiento libre para colocarlo sobre otro elemento.');action(()=>{state.objects.push(next);selected=next.id;mode='select';endTools();fillForm(next);say('Objeto agregado. Arrastra para moverlo o vuelve a pulsar Agregar para colocar otro.');});closeMenus();});
  for(const id of ['objW','objH','rotacion'])$(id).addEventListener('change',()=>{constraints();if(selectedIds.size>1)return say('Selecciona un solo objeto para editar sus medidas.');const original=state.objects.find(o=>o.id===selected);if(!original)return;const next=editedObject(original,{...original,w:Number($('objW').value),h:Number($('objH').value),rotation:Number($('rotacion').value)});if(!next){fillForm(original);return say('El giro o las medidas no caben aquí. Mueve el objeto o marca Desplazamiento libre si se cruza con otro.');}action(()=>{state.objects=state.objects.map(o=>o.id===next.id?next:o);fillForm(next);say('Medidas del objeto actualizadas.');});});
  function remove(){if(selectedIds.size>1)askErase({kind:'objects',ids:[...selectedIds]});else if(selected)askErase({kind:'object',id:selected});}
  function history(back){finishInspector();cancel();const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(serialize());restore(JSON.parse(from.pop()),true);render();say(back?'Acción deshecha.':'Acción rehecha.');}
  $('deshacer').addEventListener('click',()=>history(true));$('rehacer').addEventListener('click',()=>history(false));
  window.addEventListener('keydown',e=>{if($('confirmarBorrado').open)return;if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='Escape'){finishInspector();cancel();selected=null;sync();render();}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();history(e.key.toLowerCase()==='z'&&!e.shiftKey);}});
  function centerDrawing(){cancel();finishInspector();zoom=1;pan={x:0,y:0};render();const host=canvas.parentElement;host.scrollLeft=Math.max(0,(parseFloat(canvas.style.width)-host.clientWidth+24)/2);host.scrollTop=Math.max(0,(parseFloat(canvas.style.height)-host.clientHeight+24)/2);sync();}
  for(const [id,delta] of [['zoomMas',20],['zoomMenos',-20],['ajustar',0]])$(id).addEventListener('click',()=>{zoom=delta?clamp(Math.round(zoom*100)+delta,20,300)/100:1;if(!delta){centerDrawing();return;}sync();render();});
  $('mostrarGrid').addEventListener('change',e=>{showGrid=e.target.checked;render();});$('mostrarCotas').addEventListener('change',e=>{showCotas=e.target.checked;render();});
  canvas.parentElement.addEventListener('wheel',e=>{
    if(!Number.isFinite(e.deltaY)||e.deltaY===0||e.target.closest('input,select,textarea,form'))return;
    e.preventDefault();cancel();finishInspector();
    const next=clamp(Math.round(zoom*100)+(e.deltaY<0?20:-20),20,300)/100;if(next===zoom)return;
    const anchor=point(e,false);zoom=next;sync();render();
    const pos=screen(anchor.x,anchor.y),rect=canvas.getBoundingClientRect();pan.x+=e.clientX-rect.left-pos.x;pan.y+=e.clientY-rect.top-pos.y;render();
  },{passive:false});
  $('vista').addEventListener('change',e=>{cancel();view=e.target.value;zoom=1;pan={x:0,y:0};sync();render();canvas.parentElement.scrollTop=0;canvas.parentElement.scrollLeft=0;say('Vista '+view+'. Las coordenadas y medidas reales se conservan.');});
  $('cotasObjetos').addEventListener('change',e=>{objectDimensions=e.target.value;render();});
  $('pantalla').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{say('Pantalla completa no disponible. Puedes ampliar con F11.');}});
  function validObject(o){return o&&typeof o.id==='string'&&o.id.length<100&&Object.hasOwn(defaults,o.type)&&(o.shapeColor===undefined||typeof o.shapeColor==='string'&&/^#[0-9a-f]{6}$/i.test(o.shapeColor))&&(o.shapeAngle===undefined||Number.isFinite(o.shapeAngle)&&Math.abs(o.shapeAngle)<=Math.PI*2)&&['flipX','flipY'].every(k=>o[k]===undefined||typeof o[k]==='boolean')&&[o.x,o.y,o.w,o.h,o.rotation].every(Number.isFinite)&&[0,90,180,270].includes(o.rotation)&&o.w>=defaults[o.type][2]&&o.h>=(['pared','mediaPared','puerta','ventana'].includes(o.type)?.2:defaults[o.type][2])&&(!['pared','mediaPared','puerta','ventana'].includes(o.type)||Math.abs(o.h-.2)<1e-8);}
  function validate(raw){
    if(!raw||![1,2].includes(raw.version)||![raw.width,raw.length,raw.step].every(Number.isFinite)||raw.width<1||raw.width>35||raw.length<1||raw.length>65||![1,.5,.25].includes(raw.step)||!Array.isArray(raw.cells)||raw.cells.length>40000)throw Error('Formato o medidas del proyecto no válidos.');
    const converted=new Map();for(const entry of raw.cells){if(!Array.isArray(entry)||entry.length!==2)throw Error('Celda no válida.');const [k,v]=entry;if(typeof k!=='string'||!/^\d{1,3}:\d{1,3}$/.test(k)||!Object.hasOwn(materials,v))throw Error('Material o coordenada no válido.');const [x,y]=k.split(':').map(Number),s=raw.version===1?raw.step:unit;if(x*s>=raw.width||y*s>=raw.length)throw Error('Superficie fuera del terreno.');for(let yy=y*s;yy<Math.min((y+1)*s,raw.length)-1e-8;yy+=unit)for(let xx=x*s;xx<Math.min((x+1)*s,raw.width)-1e-8;xx+=unit)converted.set(Math.round(xx/unit)+':'+Math.round(yy/unit),v);}
    const objects=raw.version===1?[]:raw.objects;if(!Array.isArray(objects)||objects.length>2000||objects.some(o=>!validObject(o)||!fits(o,raw.width,raw.length))||new Set(objects.map(o=>o.id)).size!==objects.length)throw Error('Objetos o dimensiones no válidos.');
    const dimensions=raw.dimensions??[];if(!Array.isArray(dimensions)||dimensions.length>1000||dimensions.some(q=>!q||typeof q.id!=='string'||q.id.length>100||!['x','y'].includes(q.axis)||![q.x1,q.y1,q.x2,q.y2,q.offset].every(Number.isFinite)||Math.abs(q.offset)>65||q.x1<0||q.x2<0||q.y1<0||q.y2<0||q.x1>raw.width||q.x2>raw.width||q.y1>raw.length||q.y2>raw.length||(q.color!==undefined&&q.color!=='blue')||(q.side!==undefined&&!['top','bottom','left','right'].includes(q.side))||(q.measurement!==undefined&&(!q.free||!Number.isFinite(q.measurement)||q.measurement<=0||q.measurement>1000))||(q.free!==undefined&&typeof q.free!=='boolean')||(q.free?Math.hypot(q.x2-q.x1,q.y2-q.y1)<.0001:(q.axis==='x'?(q.y1!==q.y2||(!q.link&&q.x1===q.x2)):(q.x1!==q.x2||(!q.link&&q.y1===q.y2)))))||new Set(dimensions.map(q=>q.id)).size!==dimensions.length)throw Error('Cotas no válidas.');
    function validRef(r,axis,target=false){if(!r||!['center',...(axis==='x'?['left','right']:['top','bottom'])].includes(r.side)||!Number.isFinite(r.t)||r.t<0||r.t>1)return false;if(!r.kind)return typeof r.id==='string'&&objects.some(o=>o.id===r.id);if(target)return false;if(r.kind==='point')return Number.isFinite(r.x)&&Number.isFinite(r.y)&&r.x>=0&&r.y>=0&&r.x<=raw.width&&r.y<=raw.length;if(r.kind==='terrain')return true;if(r.kind==='surface')return [r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.x>=0&&r.y>=0&&r.w>0&&r.h>0&&r.x+r.w<=raw.width+1e-8&&r.y+r.h<=raw.length+1e-8&&typeof r.key==='string'&&converted.has(r.key);return false;}
    for(const q of dimensions)if(q.link){if(!validRef(q.link.a,q.axis)||!validRef(q.link.b,q.axis,true)||(!q.link.a.kind&&q.link.a.id===q.link.b.id))throw Error('Referencias de cota no válidas.');}
    function cleanRef(r){return {side:r.side,t:r.t,...(r.kind==='point'?{kind:'point',x:r.x,y:r.y}:r.kind==='terrain'?{kind:'terrain'}:r.kind==='surface'?{kind:'surface',id:'surface:'+r.x+':'+r.y+':'+r.w+':'+r.h,key:r.key,x:r.x,y:r.y,w:r.w,h:r.h}:{id:r.id})};}
    return {version:2,width:raw.width,length:raw.length,step:raw.step,cells:[...converted],objects:objects.map(({id,type,x,y,w,h,rotation,flipX,flipY,shapeAngle,shapeColor})=>({id,type,x,y,w,h,rotation,...(shapeColor!==undefined?{shapeColor}:{}),...(shapeAngle!==undefined?{shapeAngle}:{}),...(flipX!==undefined?{flipX}:{}),...(flipY!==undefined?{flipY}:{} )})),dimensions:dimensions.map(({id,axis,x1,y1,x2,y2,offset,link,side,free,measurement,color})=>({id,axis,x1,y1,x2,y2,offset,...(color?{color}:{}),...(side?{side}:{}),...(free?{free:true}:{}),...(measurement!==undefined?{measurement}:{}),...(link?{link:{a:cleanRef(link.a),b:cleanRef(link.b)}}:{})}))};
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
  const palette={columpios:'#508ca0',resbaladilla:'#e8a52c',subeBaja:'#d79b48',casitaJuego:'#b78453',quiosco:'#ac7b55',mediaPared:'#a5a79b',bancaSemicircular:'#c5c2b4',hongoAgua:'#c5d9df',pergolaColumpio:'#a97c50',toboganRecto:'#e7a52a',toboganTunel:'#449e7a',toboganCurvo:'#4c9bd4',toboganTunel90:'#cb6058',bombaAgua:'#348eab',pared:'#c8c0ab',puerta:'#875936',ventana:'#8bd0e4',casa:'#ead4b2',bano:'#e3d7c6',regaderas:'#bfd9df',cocina:'#d7ba8d',palapa:'#bd9b58',gallinero:'#baa677',alberca:'#30acd4',fuente:'#6cbcd4',pista:'#bb8b58',escenario:'#67758d',estacionamiento:'#64717e',juegos:'#76a35b',fogatero:'#9a8a73',arbol:'#48834b',arbolAlcorque:'#48834b',farol:'#e6c35e',mesaConBancas:'#b8b8af',arbusto:'#5f9d4d',flores:'#9cbb50'};
  function face(points,color){faces.push({points,color});}
  function box(x,y,z,w,l,h,color,top=true){const a=[x,y,z],b=[x+w,y,z],c=[x+w,y+l,z],d=[x,y+l,z],e=[x,y,z+h],f=[x+w,y,z+h],g=[x+w,y+l,z+h],i=[x,y+l,z+h];face([a,b,f,e],color);face([b,c,g,f],shade(color,.78));face([c,d,i,g],shade(color,.65));face([d,a,e,i],shade(color,.85));if(top)face([e,f,g,i],shade(color,1.12));}
  function roof(x,y,w,l,z,color){const a=[x-.2,y-.2,z],b=[x+w+.2,y-.2,z],c=[x+w+.2,y+l+.2,z],d=[x-.2,y+l+.2,z],peak=[x+w/2,y+l/2,z+Math.min(w,l)*.35];face([a,b,peak],color);face([b,c,peak],shade(color,.78));face([c,d,peak],shade(color,.6));face([d,a,peak],shade(color,.9));}
  function crown(x,y,z,rx,ry,rz,color){const top=[x,y,z+rz],bottom=[x,y,z-rz],ring=[];for(let i=0;i<8;i++){const a=i*Math.PI/4;ring.push([x+rx*Math.cos(a),y+ry*Math.sin(a),z]);}for(let i=0;i<8;i++){face([top,ring[i],ring[(i+1)%8]],shade(color,.85+(i%4)*.1));face([bottom,ring[(i+1)%8],ring[i]],shade(color,.6+(i%3)*.08));}}
  function shade(hex,k){const n=parseInt(hex.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.round(clamp(v*k,0,255)).toString(16).padStart(2,'0')).join('');}
  function carModel(r,color){
    const longY=r.h>=r.w,cw=longY?r.w:r.h,cl=longY?r.h:r.w;
    const point=(u,v,z)=>longY?[r.x+u,r.y+v,z]:[r.x+v,r.y+u,z];
    function part(u,v,z,w,l,h,c){if(longY)box(r.x+u,r.y+v,z,w,l,h,c);else box(r.x+v,r.y+u,z,l,w,h,c);}
    for(const u of [.06,cw-.06])for(const v of [cl*.23,cl*.77]){
      const radius=.29,half=.11,n=12;for(let i=0;i<n;i++){const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n;face([point(u-half,v+radius*Math.cos(a),.41+radius*Math.sin(a)),point(u+half,v+radius*Math.cos(a),.41+radius*Math.sin(a)),point(u+half,v+radius*Math.cos(b),.41+radius*Math.sin(b)),point(u-half,v+radius*Math.cos(b),.41+radius*Math.sin(b))],'#252a2c');for(const side of [-1,1])face([point(u+side*half,v,.41),point(u+side*half,v+radius*Math.cos(a),.41+radius*Math.sin(a)),point(u+side*half,v+radius*Math.cos(b),.41+radius*Math.sin(b))],'#343b3e');}const side=u<cw/2?-1:1;for(let i=0;i<n;i++){const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n;face([point(u+side*(half+.002),v,.41),point(u+side*(half+.002),v+.14*Math.cos(a),.41+.14*Math.sin(a)),point(u+side*(half+.002),v+.14*Math.cos(b),.41+.14*Math.sin(b))],'#abb6bc');}
    }
    part(0,0,.43,cw,cl,.56,color);part(cw*.13,cl*.29,.99,cw*.74,cl*.4,.34,'#91afbd');part(cw*.16,cl*.36,1.33,cw*.68,cl*.25,.045,color);part(.03,.03,.48,cw-.06,.06,.1,'#8b979c');part(.03,cl-.09,.48,cw-.06,.06,.1,'#8b979c');
    for(const u of [cw*.08,cw*.73]){part(u,cl-.025,.7,cw*.19,.035,.16,night?'#fff3ad':'#f7e5ad');part(u,-.01,.7,cw*.19,.035,.13,'#c94c49');}
  }
  function model(o){const start=faces.length;modelGeometry({...o,x:0,y:0,rotation:0,flipX:false,flipY:false});for(let i=start;i<faces.length;i++)faces[i].points=faces[i].points.map(p=>{const q=quintaPoint(o,p[0],p[1]);return [q.x,q.y,p[2]];});}
  function modelGeometry(o){const x=o.x,y=o.y,w=o.rotation%180===90?o.h:o.w,l=o.rotation%180===90?o.w:o.h,c=palette[o.type]||'#b7aaa0';
    if(o.type==='columpios'){
      for(const sx of [.06,.91]){for(const sy of [.1,.84])box(x+w*sx,y+l*sy,0,w*.035,l*.035,2.6,'#4d7b8d');box(x+w*sx,y+l*.12,2.6,w*.035,l*.76,.1,'#4d7b8d');}box(x+w*.07,y+l*.48,2.6,w*.86,l*.04,.12,'#507b8f');for(const sx of [.32,.68]){box(x+w*(sx-.09),y+l*.42,.55,w*.18,l*.16,.1,'#e4b34f');for(const bx of [sx-.075,sx+.075])box(x+w*bx,y+l*.5,.65,.025,.025,1.95,'#b4c7cb');}return;
    }
    if(o.type==='subeBaja'){
      box(x+w*.46,y+l*.3,0,w*.08,l*.4,.66,'#96a99a');const x1=x+w*.08,x2=x+w*.92,y1=y+l*.4,y2=y+l*.6;face([[x1,y1,.35],[x2,y1,1.15],[x2,y2,1.15],[x1,y2,.35]],'#d79b48');face([[x1,y1,.27],[x2,y1,1.07],[x2,y1,1.15],[x1,y1,.35]],'#a67538');box(x+w*.08,y+l*.28,.35,w*.13,l*.44,.08,'#6399b7');box(x+w*.79,y+l*.28,1.15,w*.13,l*.44,.08,'#6399b7');for(const sx of [.25,.72])box(x+w*sx,y+l*.47,sx<.5?.6:1.03,.035,.035,.3,'#425f6b');return;
    }
    if(o.type==='casitaJuego'){
      for(const sx of [.12,.85])for(const sy of [.12,.69])box(x+w*sx,y+l*sy,0,.12,.12,1,'#946b43');box(x+w*.08,y+l*.1,1,w*.84,l*.68,.15,'#c19a69');box(x+w*.16,y+l*.14,1.15,w*.68,l*.55,1.45,'#b78453',false);roof(x+w*.12,y+l*.1,w*.76,l*.63,2.6,'#8d5d37');box(x+w*.43,y+l*.696,1.15,w*.2,.025,.95,'#634b36');for(const sx of [.23,.68])box(x+w*sx,y+l*.702,1.7,w*.13,.025,.4,'#9accdb');for(let i=0;i<5;i++)box(x+w*.4,y+l*(.72+i*.045),1-i*.2,w*.22,l*.05,.16,'#cab28e');return;
    }
    if(o.type==='mediaPared'){box(x,y,0,w,l,1.15,c);box(x,y,1.15,w,l,.05,'#c6c8bb');return;}
    if(o.type==='quiosco'){
      const cx=x+w/2,cy=y+l/2,ring=[];for(let i=0;i<8;i++){const t=Math.PI/8+i*Math.PI/4;ring.push([cx+w*.33*Math.cos(t),cy+l*.33*Math.sin(t)]);}face(ring.map(p=>[...p,1.05]),'#d1c5a8');for(let i=0;i<8;i++){const p=ring[i],q=ring[(i+1)%8],a=Math.PI/8+i*Math.PI/4,b=a+Math.PI/4;face([[...p,0],[...q,0],[...q,1.05],[...p,1.05]],'#a59b86');box(p[0]-.055,p[1]-.055,1.05,.11,.11,2.5,'#94704b');face([[cx+w*.37*Math.cos(a),cy+l*.37*Math.sin(a),3.6],[cx+w*.37*Math.cos(b),cy+l*.37*Math.sin(b),3.6],[cx,cy,4.5]],i%2?'#936646':'#b88859');if(i!==1){for(let j=1;j<5;j++){const t=j/5;box(p[0]+(q[0]-p[0])*t-.018,p[1]+(q[1]-p[1])*t-.018,1.05,.036,.036,.8,'#9c805d');}face([[p[0],p[1],1.86],[q[0],q[1],1.86],[q[0],q[1],1.91],[p[0],p[1],1.91]],'#7a6245');}}
      for(let i=0;i<14;i++){const a=i*Math.PI*.5/14,b=(i+1)*Math.PI*.5/14,z=1.05*(i+1)/14,p=[cx+w*.35*Math.cos(a),cy+l*.35*Math.sin(a)],q=[cx+w*.49*Math.cos(a),cy+l*.49*Math.sin(a)],r=[cx+w*.49*Math.cos(b),cy+l*.49*Math.sin(b)],u=[cx+w*.35*Math.cos(b),cy+l*.35*Math.sin(b)];face([[...p,z],[...q,z],[...r,z],[...u,z]],i%2?'#c1b7a0':'#ded4be');face([[...q,0],[...r,0],[...r,z],[...q,z]],'#a99f88');face([[...p,z-1.05/14],[...q,z-1.05/14],[...q,z],[...p,z]],'#9d947f');box(q[0]-.015,q[1]-.015,z,.03,.03,.8,'#8e7858');face([[q[0],q[1],z+.8],[r[0],r[1],z+.8],[r[0],r[1],z+.85],[q[0],q[1],z+.85]],'#8e7858');}return;
    }
    if(o.type==='bancaSemicircular'){
      const cx=x+w/2,cy=y+l*.95;for(let i=0;i<32;i++){const t=i*Math.PI/32,u=(i+1)*Math.PI/32,p=[cx+w*.48*Math.cos(t),cy-l*.9*Math.sin(t)],q=[cx+w*.48*Math.cos(u),cy-l*.9*Math.sin(u)],a=[cx+w*.35*Math.cos(t),cy-l*.66*Math.sin(t)],b=[cx+w*.35*Math.cos(u),cy-l*.66*Math.sin(u)];face([[...p,.6],[...q,.6],[...b,.6],[...a,.6]],'#d4d1c5');face([[...p,.46],[...q,.46],[...q,.6],[...p,.6]],'#a7aba1');face([[...a,.46],[...b,.46],[...b,.6],[...a,.6]],'#a7aba1');face([[...p,.6],[...q,.6],[...q,.95],[...p,.95]],'#bbbeb3');}for(const t of [.18,Math.PI/2,Math.PI-.18])box(cx+w*.41*Math.cos(t)-.1,cy-l*.78*Math.sin(t)-.1,0,.2,.2,.48,'#969e93');return;
    }
    if(o.type==='hongoAgua'){
      const cx=x+w/2,cy=y+l/2,n=32,ring=[];for(let i=0;i<n;i++){const t=i*Math.PI*2/n;ring.push([cx+w*.47*Math.cos(t),cy+l*.47*Math.sin(t)]);}box(cx-w*.065,cy-l*.065,0,w*.13,l*.13,2.73,'#b4b9ae');for(let i=0;i<n;i++){const p=ring[i],q=ring[(i+1)%n];face([[...p,2.72],[...q,2.72],[cx,cy,3]],i%2?'#d6d8cb':'#e2e2d4');face([[...p,2.63],[...q,2.63],[...q,2.72],[...p,2.72]],'#acb9b6');if(i%2===0){const t=i*Math.PI*2/n,rx=w*.47,ry=l*.47;for(let j=0;j<6;j++){const z=2.6-j*.4;face([[cx+rx*Math.cos(t),cy+ry*Math.sin(t),z],[cx+rx*Math.cos(t+.035),cy+ry*Math.sin(t+.035),z],[cx+rx*Math.cos(t+.035),cy+ry*Math.sin(t+.035),z-.25],[cx+rx*Math.cos(t),cy+ry*Math.sin(t),z-.25]],'#8fcada');}}}return;
    }
    if(o.type==='pergolaColumpio'){
      const wood='#a97c50',dark='#755035',metal='#bbc4c6';for(const sx of [.06,.89])for(const sy of [.07,.86])box(x+w*sx,y+l*sy,0,w*.05,l*.07,2.7,wood);
      for(const sy of [.05,.9])box(x+w*.04,y+l*sy,2.55,w*.92,l*.05,.18,dark);for(let i=0;i<10;i++)box(x+w*(.05+i*.095),y+l*.04,2.72,w*.04,l*.92,.12,wood);
      box(x+w*.2,y+l*.32,.58,w*.6,l*.42,.12,wood);box(x+w*.24,y+l*.38,.7,w*.52,l*.3,.16,'#f5f0df');box(x+w*.23,y+l*.32,.83,w*.54,l*.06,.55,'#e6e1d3');for(const sx of [.2,.77]){box(x+w*sx,y+l*.32,.72,w*.03,l*.42,.08,dark);for(const sy of [.35,.7])box(x+w*sx,y+l*sy,.78,.025,.025,1.8,metal);}return;
    }
    if((o.type.startsWith('tobogan')||o.type==='resbaladilla')){
      const layout=quintaSlide(o),points=layout.points,r=layout.radius;const platform=points[0];box(x+platform.x-w*.13,y+l*.07,0,.1,.1,2.15,'#687e89');box(x+platform.x+w*.13-.1,y+l*.07,0,.1,.1,2.15,'#687e89');box(x+platform.x-w*.15,y+l*.06,2.1,w*.3,l*.18,.12,'#e6bb63');
      for(let i=0;i<7;i++)box(x+platform.x-w*.11,y+l*(.01+i*.025),.15+i*.29,w*.22,.07,.07,'#8dabb4');for(const sx of [-.15,.13])box(x+platform.x+w*sx,y+l*.07,2.2,.04,l*.14,.5,'#527d91');
      const rings=[];for(let i=0;i<points.length;i++){const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),ring=[];for(let j=0;j<=12;j++){const angle=(layout.tube?2:1)*Math.PI*j/12;ring.push([x+p.x-dy/len*r*Math.cos(angle),y+p.y+dx/len*r*Math.cos(angle),p.z-r*Math.sin(angle)]);}rings.push(ring);}
      for(let i=0;i<rings.length-1;i++)for(let j=0;j<12;j++)face([rings[i][j],rings[i+1][j],rings[i+1][j+1],rings[i][j+1]],shade(c,.8+.25*Math.sin(j*Math.PI/12)));
      for(const i of [6,14,22]){const p=points[i];box(x+p.x-.05,y+p.y-.05,0,.1,.1,Math.max(.1,p.z-r),'#8da3a6');}return;
    }
    if(['circulo','semicirculo'].includes(o.type)){const begin=o.type==='circulo'?0:Math.PI,angle=o.shapeAngle||0,center=[x+w/2,y+l/2,.025],n=48;for(let i=0;i<n;i++){const points=[center];for(const t of [begin+(Math.PI*2-begin)*i/n,begin+(Math.PI*2-begin)*(i+1)/n]){const px=Math.cos(t)*w/2,py=Math.sin(t)*l/2;points.push([center[0]+px*Math.cos(angle)-py*Math.sin(angle),center[1]+px*Math.sin(angle)+py*Math.cos(angle),.025]);}face(points,o.shapeColor||'#73a45a');faces[faces.length-1].underlay=true;}return;}
    if(o.type==='bombaAgua'){function part(r,z,h,color){const b=quintaRect(o,r);box(b.x,b.y,z,b.w,b.h,h,color);}part({x:0,y:0,w:o.w,h:o.h},0,.1,'#a5acaf');part({x:o.w*.32,y:o.h*.22,w:o.w*.56,h:o.h*.56},.1,.35,c);part({x:o.w*.14,y:o.h*.15,w:o.w*.22,h:o.h*.7},.1,.4,'#246781');part({x:0,y:o.h*.4,w:o.w*.2,h:o.h*.2},.2,.12,'#a5c9d6');part({x:o.w*.2,y:o.h*.38,w:o.w*.12,h:o.h*.24},.5,.3,'#a5c9d6');return;}
    if(o.type==='farol'){const d=Math.min(w,l);box(x+w*.35,y+l*.35,0,w*.3,l*.3,.18,'#777c7e');box(x+w/2-d*.06,y+l/2-d*.06,.18,d*.12,d*.12,2.6,'#424c58');box(x+w*.18,y+l*.18,2.78,w*.64,l*.64,.4,night?'#ffe69b':'#ecd8a0');roof(x+w*.15,y+l*.15,w*.7,l*.7,3.18,'#46515c');return;}
    if(o.type==='mesaConBancas'){function part(r,z,h,color){const b=quintaRect(o,r);box(b.x,b.y,z,b.w,b.h,h,color);}const concrete='#b9b9ac';part({x:o.w*.34,y:o.h*.05,w:o.w*.32,h:o.h*.9},.78,.1,concrete);for(const bx of [.08,.78]){part({x:o.w*bx,y:o.h*.06,w:o.w*.14,h:o.h*.88},.43,.09,concrete);for(const by of [.18,.7])part({x:o.w*(bx+.035),y:o.h*by,w:o.w*.07,h:o.h*.1},0,.43,'#95998d');}for(const by of [.15,.72])part({x:o.w*.45,y:o.h*by,w:o.w*.1,h:o.h*.12},0,.78,'#95998d');return;}
    if(o.type==='arbolAlcorque'){const cx=x+w/2,cy=y+l/2,r=Math.min(w,l)*.46,inner=r*.76,n=16;for(let i=0;i<n;i++){const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n,p=[cx+r*Math.cos(a),cy+r*Math.sin(a)],q=[cx+r*Math.cos(b),cy+r*Math.sin(b)],u=[cx+inner*Math.cos(a),cy+inner*Math.sin(a)],v=[cx+inner*Math.cos(b),cy+inner*Math.sin(b)];face([[p[0],p[1],0],[q[0],q[1],0],[q[0],q[1],1],[p[0],p[1],1]],'#b7ad98');face([[p[0],p[1],1],[q[0],q[1],1],[v[0],v[1],1],[u[0],u[1],1]],'#d2c9b2');face([[cx,cy,.92],[u[0],u[1],.92],[v[0],v[1],.92]],'#79654c');}box(cx-.1,cy-.1,.92,.2,.2,2,'#7d6147');crown(cx,cy,3.3,w*.47,l*.47,1.25,'#48834b');return;}
    if(['arbol','arbusto','flores'].includes(o.type)){const tall=o.type==='arbol',h=tall?Math.max(2.8,Math.min(w,l)*1.5):.55;if(tall)box(x+w*.45,y+l*.45,0,w*.1,l*.1,h*.65,'#806247');crown(x+w/2,y+l/2,h,w*.5,l*.5,tall?h*.5:.45,c);if(o.type==='flores')for(let i=0;i<4;i++)crown(x+w*(.2+(i%2)*.6),y+l*(.2+Math.floor(i/2)*.6),.8,.12,.12,.1,i%2?'#ec9fca':'#ffe28e');return;}
    if(o.type==='gallinero'){
      const t=Math.min(.14,w*.08,l*.08),wood='#9b744e',wire='#7b9293',top=2.4;box(x,y,0,w,l,.06,'#c1c3b8');box(x,y,0,w,t,1,'#b5b9ad');box(x,y+l-t,0,w*.35,t,1,'#b5b9ad');box(x+w*.65,y+l-t,0,w*.35,t,1,'#b5b9ad');box(x,y+t,0,t,Math.max(.05,l-2*t),1,'#b5b9ad');box(x+w-t,y+t,0,t,Math.max(.05,l-2*t),1,'#b5b9ad');
      for(const sx of [0,.5,1])for(const sy of [0,1])box(x+sx*(w-t),y+sy*(l-t),1,t,t,top-1,wood);for(const sx of [0,1])for(const sy of [.5])box(x+sx*(w-t),y+sy*(l-t),1,t,t,top-1,wood);
      for(const z of [1,top-.1]){box(x,y,z,w,t,.1,wood);box(x,y+l-t,z,w,t,.1,wood);box(x,y,z,t,l,.1,wood);box(x+w-t,y,z,t,l,.1,wood);}
      function mesh(ax,ay,bx,by){const length=Math.hypot(bx-ax,by-ay),n=Math.min(40,Math.max(2,Math.ceil(length/.22)));for(let i=1;i<n;i++){const f=i/n,px=ax+(bx-ax)*f,py=ay+(by-ay)*f;box(px-.006,py-.006,1.08,.012,.012,top-1.18,wire);}for(let j=1;j<7;j++){const z=1.08+j*(top-1.18)/7;face([[ax,ay,z],[bx,by,z],[bx,by,z+.012],[ax,ay,z+.012]],wire);}}
      mesh(x+t/2,y+t/2,x+w-t/2,y+t/2);mesh(x+t/2,y+l-t/2,x+w-t/2,y+l-t/2);mesh(x+t/2,y+t/2,x+t/2,y+l-t/2);mesh(x+w-t/2,y+t/2,x+w-t/2,y+l-t/2);
      for(const sx of [.35,.65])box(x+w*sx,y+l-t,.06,t,t,top-.16,wood);box(x+w*.35,y+l-t,.06,w*.3,t,.09,wood);roof(x,y,w,l,top,'#a47f52');return;
    }
    if(['casa','bano','regaderas','cocina'].includes(o.type)){const h=3;box(x,y,0,w,l,h,c,false);roof(x,y,w,l,h,o.type==='casa'?'#40526b':'#946a4d');box(x+w*.42,y+l+.015,0,w*.18,.03,h*.7,'#795a3c');for(const f of [.18,.7])box(x+w*f,y+l+.025,h*.42,w*.13,.025,h*.22,night?'#ffdc7d':'#83bdce');if(o.type==='cocina')box(x+w*.1,y+l*.15,.1,w*.18,l*.65,1,'#c9c1ae');return;}
    if(o.type==='palapa'){box(x,y,0,w,l,.18,'#c8bea8');for(const a of [.08,.48,.88])for(const b of [.08,.48,.88])box(x+w*a,y+l*b,.18,.13,.13,2.7,'#967049');roof(x,y,w,l,2.88,'#bf9f59');return;}
    if(o.type==='pared'){box(x,y,0,w,l,2.3,c);return;}
    if(['puerta','ventana'].includes(o.type)){box(x,y,o.type==='ventana'?1:0,w,l,o.type==='ventana'?1:2.1,c);return;}
    if(o.type==='alberca'){box(x,y,0,w,l,.18,'#e4d8b6');box(x+.22,y+.22,.19,Math.max(.1,w-.44),Math.max(.1,l-.44),.025,c);for(let i=1;i<4;i++)box(x+.4,y+l*i/4,.22,Math.max(.1,w-.8),.025,.01,'#a4e4f1');return;}
    if(o.type==='fuente'){box(x,y,0,w,l,.5,'#c8bc9a');box(x+.15,y+.15,.51,w-.3,l-.3,.02,c);box(x+w*.43,y+l*.43,.5,w*.14,l*.14,1,'#d3bc84');crown(x+w/2,y+l/2,1.7,.13,.13,.55,'#96e5ef');return;}
    if(o.type==='fogatero'){const cx=x+w/2,cy=y+l/2;for(let i=0;i<10;i++){const a=i*Math.PI/5;box(cx+Math.cos(a)*w*.36-.2,cy+Math.sin(a)*l*.36-.2,0,.4,.4,.45,'#b29a7d');}crown(cx,cy,.45,w*.12,l*.12,.6,'#ff9c3f');return;}
    if(o.type!=='estacionamiento'){box(x,y,0,w,l,o.type==='escenario'?.8:.08,c);if(o.type!=='escenario')faces[faces.length-1].underlay=true;}
    if(o.type==='estacionamiento'){const layout=quintaParking(o);for(const {bay:b}of layout.bays){const baseStart=faces.length;box(b.x,b.y,0,b.w,b.h,.1,'#b6b8b1');for(let i=baseStart;i<faces.length;i++){faces[i].underlay=true;faces[i].flatLayer=3;}const t=.045;for(const r of [{x:b.x,y:b.y,w:b.w,h:t},{x:b.x,y:b.y+b.h-t,w:b.w,h:t},{x:b.x,y:b.y,w:t,h:b.h},{x:b.x+b.w-t,y:b.y,w:t,h:b.h}]){face([[r.x,r.y,.105],[r.x+r.w,r.y,.105],[r.x+r.w,r.y+r.h,.105],[r.x,r.y+r.h,.105]],'#fffdf3');faces[faces.length-1].underlay=true;faces[faces.length-1].flatLayer=4;}}for(let i=0;i<layout.bays.length;i++)carModel(layout.bays[i].car,['#3f6a8b','#d4d8d9','#a3424c','#4a535b'][i%4]);return;}
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
