'use strict';
(() => {
  const el = (id) => document.getElementById(id);
  let slides = [];
  let current = 0;
  let notesVisible = true;
  const screenshot = el('screenshot');
  const picker = el('slide-picker');
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
    for (const adjacent of [current - 1, current + 1]) {
      if (slides[adjacent]) { const preload = new Image(); preload.src = slides[adjacent].image; }
    }
  }
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
      f: toggleFullscreen, F: toggleFullscreen, n: toggleNotes, N: toggleNotes
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
    show(readHash());
    el('presentation').setAttribute('aria-busy', 'false');
  }).catch(() => {
    el('slide-title').textContent = 'Unable to load the walkthrough';
    el('load-error').hidden = false;
    el('presentation').setAttribute('aria-busy', 'false');
  });
})();
