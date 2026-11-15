'use strict';
(() => {
  const el = (id) => document.getElementById(id);
  let slides = [];
  let current = 0;
  let notesVisible = true;
  let gridMode = false;
  const gridCards = [];
  const screenshot = el('screenshot');
  const picker = el('slide-picker');
  const grid = el('slide-grid');
  const toolbar = document.querySelector('.topbar');
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--toolbar-height', `${toolbar.getBoundingClientRect().height + 4}px`);
    }).observe(toolbar);
  }
  const readHash = () => {
    const match = location.hash.match(/^#slide=(\d+)$/);
    return match ? Number(match[1]) - 1 : 0;
  };
  const clamp = (index) => Math.max(0, Math.min(slides.length - 1, index));
  function show(index, updateHash = true) {
    if (!slides.length) return;
    current = clamp(Number.isFinite(index) ? index : 0);
    const slide = slides[current];
    el('slide-title').textContent = slide.title;
    el('section').textContent = slide.section || 'Wedding demo';
    el('counter').textContent = `${current + 1} / ${slides.length}`;
    el('script').textContent = slide.script || '';
    el('action').replaceChildren();
    if (slide.action) {
      const label = document.createElement('strong');
      label.textContent = 'On screen';
      el('action').append(label, document.createTextNode(slide.action));
    }
    el('note').textContent = slide.note || '';
    el('recording-note').hidden = !slide.note;
    el('recording-note').open = false;
    el('image-error').hidden = true;
    screenshot.alt = `${current + 1}. ${slide.title}`;
    screenshot.src = slide.image;
    picker.value = String(current);
    el('previous').disabled = current === 0;
    el('next').disabled = current === slides.length - 1;
    el('progress').style.width = `${((current + 1) / slides.length) * 100}%`;
    document.title = `${current + 1}. ${slide.title} · Aimo demo`;
    if (updateHash) history.replaceState(null, '', `#slide=${current + 1}`);
    updateGridSelection();
    for (const adjacent of [current - 1, current + 1]) {
      if (slides[adjacent]) { const preload = new Image(); preload.src = slides[adjacent].image; }
    }
  }
  function updateGridSelection() {
    gridCards.forEach((card, index) => {
      if (index === current) card.setAttribute('aria-current', 'step');
      else card.removeAttribute('aria-current');
    });
    if (gridMode && gridCards[current]) {
      if (grid.contains(document.activeElement)) gridCards[current].focus({ preventScroll: true });
      gridCards[current].scrollIntoView({ block: 'nearest' });
    }
  }
  function buildGrid() {
    if (gridCards.length) return;
    slides.forEach((slide, index) => {
      const item = document.createElement('li');
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'grid-card';
      card.title = `Open slide ${index + 1} in single view`;
      const image = document.createElement('img');
      image.src = slide.image;
      image.alt = `${index + 1}. ${slide.title}`;
      image.loading = 'lazy';
      image.decoding = 'async';
      const heading = document.createElement('span');
      heading.className = 'grid-title';
      heading.textContent = `${String(index + 1).padStart(2, '0')} · ${slide.title}`;
      const notes = document.createElement('span');
      notes.className = 'grid-notes';
      const script = document.createElement('span');
      script.className = 'grid-script';
      script.textContent = slide.script || '';
      const action = document.createElement('span');
      action.className = 'action';
      if (slide.action) {
        const label = document.createElement('strong');
        label.textContent = 'On screen';
        action.append(label, document.createTextNode(slide.action));
      }
      notes.append(script, action);
      card.append(image, heading, notes);
      card.addEventListener('click', () => {
        show(index);
        setView(false);
      });
      item.append(card);
      grid.append(item);
      gridCards.push(card);
    });
  }
  function setView(useGrid) {
    if (!slides.length) return;
    gridMode = useGrid;
    if (gridMode) buildGrid();
    el('single-slide').hidden = gridMode;
    grid.hidden = !gridMode;
    el('single-view').setAttribute('aria-pressed', String(!gridMode));
    el('grid-view').setAttribute('aria-pressed', String(gridMode));
    document.body.classList.toggle('grid-view', gridMode);
    const hiddenView = gridMode ? el('single-slide') : grid;
    if (hiddenView.contains(document.activeElement)) {
      el(gridMode ? 'grid-view' : 'single-view').focus({ preventScroll: true });
    }
    updateGridSelection();
    if (!gridMode) window.scrollTo(0, 0);
  }
  const toggleView = () => setView(!gridMode);
  function toggleNotes() {
    notesVisible = !notesVisible;
    el('speaker-notes').hidden = !notesVisible;
    el('notes-toggle').setAttribute('aria-pressed', String(notesVisible));
    document.body.classList.toggle('notes-hidden', !notesVisible);
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    } catch { /* Some embedded browsers disallow full screen. Navigation remains available. */ }
  }
  el('previous').addEventListener('click', () => show(current - 1));
  el('next').addEventListener('click', () => show(current + 1));
  picker.addEventListener('change', () => show(Number(picker.value)));
  el('notes-toggle').addEventListener('click', toggleNotes);
  el('single-view').addEventListener('click', () => setView(false));
  el('grid-view').addEventListener('click', () => setView(true));
  el('fullscreen').addEventListener('click', toggleFullscreen);
  screenshot.addEventListener('error', () => { el('image-error').hidden = false; });
  screenshot.addEventListener('load', () => { el('image-error').hidden = true; });
  document.addEventListener('fullscreenchange', () => {
    el('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit full screen' : 'Enter full screen');
  });
  window.addEventListener('hashchange', () => show(readHash()));
  document.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (event.altKey || event.ctrlKey || event.metaKey || target?.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key === ' ' && target?.closest('button,summary,a')) return;
    const actions = {
      ArrowRight: () => show(current + 1), PageDown: () => show(current + 1),
      ' ': () => show(current + (event.shiftKey ? -1 : 1)),
      ArrowLeft: () => show(current - 1), PageUp: () => show(current - 1),
      Home: () => show(0), End: () => show(slides.length - 1),
      f: toggleFullscreen, F: toggleFullscreen, n: toggleNotes, N: toggleNotes,
      g: toggleView, G: toggleView
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  });
  fetch('./slides.json').then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }).then((data) => {
    if (!Array.isArray(data) || !data.length || data.some((slide) => !slide.title || !slide.image)) throw new Error('Invalid slides');
    slides = data;
    picker.replaceChildren();
    let group;
    let lastSection;
    slides.forEach((slide, index) => {
      const section = slide.section || 'Wedding demo';
      if (section !== lastSection) {
        group = document.createElement('optgroup');
        group.label = section;
        picker.append(group);
        lastSection = section;
      }
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${String(index + 1).padStart(2, '0')} · ${slide.title}`;
      group.append(option);
    });
    picker.disabled = false;
    el('single-view').disabled = false;
    el('grid-view').disabled = false;
    show(readHash());
    el('presentation').setAttribute('aria-busy', 'false');
  }).catch(() => {
    el('slide-title').textContent = 'Unable to load the walkthrough';
    el('load-error').hidden = false;
    el('presentation').setAttribute('aria-busy', 'false');
  });
})();
