
'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('plano');
  const ctx = canvas.getContext('2d');

  const materials = {
    pasto: '#70b85f',
    tierra: '#b18a60',
    piso: '#b7bcc4',
    vitropiso: '#72b8c6'
  };

  const key = 'editor-quintas-v1';

  let width = 35;
  let length = 65;
  let step = 1;
  let zoom = 1;
  let showGrid = true;
  let material = 'pasto';
  let mode = 'brush';
  let cells = new Map();
  let history = [];
  let drag = null;
  let scale = 12;

  const cellKey = (x, y) => `${x}:${y}`;
  const cols = () => Math.ceil(width / step - 1e-9);
  const rows = () => Math.ceil(length / step - 1e-9);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function snapshot() {
    history.push([...cells.entries()]);
    if (history.length > 35) history.shift();
  }

  function render() {
    const available = Math.max(
      260,
      Math.min(window.innerWidth - 330, window.innerHeight - 165)
    );

    scale = clamp(
      Math.min(900 / width, available / length) * zoom,
      2,
      80
    );

    const w = Math.round(width * scale);
    const h = Math.round(length * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#d9d2b8';
    ctx.fillRect(0, 0, w, h);

    for (const [k, v] of cells) {
      const [x, y] = k.split(':').map(Number);
      if (x >= cols() || y >= rows()) continue;

      ctx.fillStyle = materials[v] || '#d9d2b8';

      ctx.fillRect(
        x * step * scale,
        y * step * scale,
        Math.min(step, width - x * step) * scale + 0.3,
        Math.min(step, length - y * step) * scale + 0.3
      );
    }

    if (showGrid) {
      ctx.strokeStyle = 'rgba(24,47,57,.25)';
      ctx.lineWidth = .65;
      ctx.beginPath();

      for (let x = 0; x <= cols(); x++) {
        let px = Math.min(x * step, width) * scale;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
      }

      for (let y = 0; y <= rows(); y++) {
        let py = Math.min(y * step, length) * scale;
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
      }

      ctx.stroke();
    }

    if (drag && mode === 'area') {
      const a = drag.start;
      const b = drag.current;

      const x = Math.min(a.x, b.x) * step * scale;
      const y = Math.min(a.y, b.y) * step * scale;

      const right = Math.min(
        width,
        (Math.max(a.x, b.x) + 1) * step
      ) * scale;

      const bottom = Math.min(
        length,
        (Math.max(a.y, b.y) + 1) * step
      ) * scale;

      ctx.fillStyle = 'rgba(65,145,255,.22)';
      ctx.fillRect(x, y, right - x, bottom - y);

      ctx.strokeStyle = '#257cff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, right - x, bottom - y);
    }

    $('infoTerreno').textContent =
      `${width} × ${length} m · ` +
      `${(width * length).toFixed(2)} m² · ` +
      `${Math.round(zoom * 100)}%`;
  }

  function point(e) {
    const r = canvas.getBoundingClientRect();

    return {
      x: clamp(
        Math.floor((e.clientX - r.left) / scale / step),
        0,
        cols() - 1
      ),
      y: clamp(
        Math.floor((e.clientY - r.top) / scale / step),
        0,
        rows() - 1
      )
    };
  }

  function paint(p) {
    const k = cellKey(p.x, p.y);

    if (material === 'borrar') {
      cells.delete(k);
    } else {
      cells.set(k, material);
    }
  }

  function setActive() {
    document.querySelectorAll('[data-material]').forEach(b => {
      const active = b.dataset.material === material;
      b.classList.toggle('activo', active);
      b.setAttribute('aria-pressed', String(active));
    });

    $('modoPincel').classList.toggle('activo', mode === 'brush');
    $('modoArea').classList.toggle('activo', mode === 'area');
  }

  function start(e) {
    if (e.button !== undefined && e.button !== 0) return;

    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    snapshot();

    drag = {
      start: point(e),
      current: point(e)
    };

    if (mode === 'brush') paint(drag.start);
    render();
  }

  function move(e) {
    if (!drag) return;

    drag.current = point(e);

    if (mode === 'brush') paint(drag.current);
    render();
  }

  function end(e) {
    if (!drag) return;

    drag.current = point(e);

    if (mode === 'area') {
      const a = drag.start;
      const b = drag.current;

      for (
        let y = Math.min(a.y, b.y);
        y <= Math.max(a.y, b.y);
        y++
      ) {
        for (
          let x = Math.min(a.x, b.x);
          x <= Math.max(a.x, b.x);
          x++
        ) {
          paint({ x, y });
        }
      }
    }

    drag = null;
    render();
  }

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);

  canvas.addEventListener('pointercancel', () => {
    drag = null;
    render();
  });

  $('formTerreno').addEventListener('submit', e => {
    e.preventDefault();

    const w = Number($('ancho').value);
    const l = Number($('largo').value);

    if (
      !Number.isFinite(w) ||
      !Number.isFinite(l) ||
      w < 1 || w > 35 ||
      l < 1 || l > 65
    ) {
      alert('Ancho: 1–35 m. Largo: 1–65 m.');
      return;
    }

    if (
      cells.size &&
      !confirm(
        'Cambiar las medidas conservará las celdas ' +
        'que sigan dentro del terreno. ¿Continuar?'
      )
    ) return;

    width = w;
    length = l;

    cells = new Map([...cells].filter(([k]) => {
      const [x, y] = k.split(':').map(Number);
      return x * step < width && y * step < length;
    }));

    $('configuracion').hidden = true;
    $('editor').hidden = false;

    render();
  });

  document.querySelectorAll('[data-material]').forEach(b => {
    b.addEventListener('click', () => {
      material = b.dataset.material;
      setActive();
    });
  });

  $('modoPincel').addEventListener('click', () => {
    mode = 'brush';
    setActive();
  });

  $('modoArea').addEventListener('click', () => {
    mode = 'area';
    setActive();
  });

  $('tamCelda').addEventListener('change', e => {
    const next = Number(e.target.value);
    if (next === step) return;

    if (
      cells.size &&
      !confirm(
        'Cambiar la resolución reiniciará las superficies ' +
        'pintadas. ¿Continuar?'
      )
    ) {
      e.target.value = String(step);
      return;
    }

    snapshot();
    cells.clear();
    step = next;
    render();
  });

  $('mostrarGrid').addEventListener('change', e => {
    showGrid = e.target.checked;
    render();
  });

  $('zoomMas').addEventListener('click', () => {
    zoom = clamp(zoom * 1.25, .3, 5);
    render();
  });

  $('zoomMenos').addEventListener('click', () => {
    zoom = clamp(zoom / 1.25, .3, 5);
    render();
  });

  $('deshacer').addEventListener('click', () => {
    if (!history.length) return;
    cells = new Map(history.pop());
    render();
  });

  function project() {
    return {
      version: 1,
      width,
      length,
      step,
      cells: [...cells.entries()]
    };
  }

  $('guardar').addEventListener('click', () => {
    try {
      localStorage.setItem(key, JSON.stringify(project()));
      alert('Proyecto guardado en este navegador.');
    } catch {
      alert('No se pudo guardar. Usa Exportar proyecto.');
    }
  });

  $('exportar').addEventListener('click', () => {
    const blob = new Blob(
      [JSON.stringify(project(), null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'quinta-proyecto.json';
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $('volverConfig').addEventListener('click', () => {
    $('editor').hidden = true;
    $('configuracion').hidden = false;
    $('ancho').value = width;
    $('largo').value = length;
  });

  window.addEventListener('resize', () => {
    if (!$('editor').hidden) render();
  });

  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');

    if (
      saved &&
      saved.version === 1 &&
      saved.width >= 1 &&
      saved.width <= 35 &&
      saved.length >= 1 &&
      saved.length <= 65 &&
      [1, .5, .25].includes(saved.step) &&
      Array.isArray(saved.cells)
    ) {
      width = saved.width;
      length = saved.length;
      step = saved.step;

      cells = new Map(
        saved.cells.filter(([k, v]) =>
          /^\d+:\d+$/.test(k) && materials[v]
        )
      );

      $('ancho').value = width;
      $('largo').value = length;
      $('tamCelda').value = String(step);
    }
  } catch {}

  setActive();
})();
