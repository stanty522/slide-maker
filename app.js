const $ = (sel) => document.querySelector(sel);

const textarea = $('#html-input');
const fileInput = $('#file-input');
const dsSelect = $('#ds-select');
const convertBtn = $('#convert-btn');
const downloadBtn = $('#download-btn');
const pdfBtn = $('#pdf-btn');
const prevBtn = $('#prev-btn');
const nextBtn = $('#next-btn');
const counter = $('#slide-counter');
const iframe = $('#preview-frame');
const emptyState = $('#empty-state');
const container = $('#preview-container');
const apiKeyInput = $('#api-key');

let designSystems = [];
let convertedHtml = '';
let downloadHtml = '';
let currentSlide = 0;
let totalSlides = 0;

apiKeyInput.value = localStorage.getItem('slide-maker-api-key') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('slide-maker-api-key', apiKeyInput.value.trim());
});

async function init() {
  const res = await fetch('design-systems/registry.json');
  const reg = await res.json();
  designSystems = reg.designSystems;
  dsSelect.innerHTML = '';
  for (const ds of designSystems) {
    const opt = document.createElement('option');
    opt.value = ds.id;
    opt.textContent = ds.name;
    opt.title = ds.description;
    dsSelect.appendChild(opt);
  }
}

$('#upload-btn').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { textarea.value = reader.result; };
  reader.readAsText(file);
});

convertBtn.addEventListener('click', async () => {
  const input = textarea.value.trim();
  if (!input) return;

  convertBtn.disabled = true;
  convertBtn.textContent = 'Converting...';
  convertBtn.classList.add('loading');
  clearError();

  try {
    const res = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: input,
        designSystem: dsSelect.value,
        apiKey: apiKeyInput.value.trim() || undefined
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Conversion failed');
      return;
    }

    convertedHtml = data.html;
    downloadHtml = data.downloadHtml;
    showPreview(convertedHtml);
  } catch (e) {
    showError('Could not reach server. Is it running?');
  } finally {
    convertBtn.disabled = false;
    convertBtn.textContent = 'Convert to Slides';
    convertBtn.classList.remove('loading');
  }
});

downloadBtn.addEventListener('click', () => {
  const html = downloadHtml || convertedHtml;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'slides.html';
  a.click();
  URL.revokeObjectURL(url);
});

pdfBtn.addEventListener('click', () => {
  if (!iframe.contentWindow) return;
  iframe.contentWindow.print();
});

prevBtn.addEventListener('click', () => goSlide(currentSlide - 1));
nextBtn.addEventListener('click', () => goSlide(currentSlide + 1));

document.addEventListener('keydown', (e) => {
  if (e.target === textarea || e.target === apiKeyInput) return;
  if (e.key === 'ArrowLeft') goSlide(currentSlide - 1);
  if (e.key === 'ArrowRight') goSlide(currentSlide + 1);
});

function goSlide(n) {
  if (n < 0 || n >= totalSlides) return;
  currentSlide = n;
  iframe.contentWindow.scrollTo({ top: currentSlide * 540, behavior: 'smooth' });
  updateNav();
}

function updateNav() {
  counter.textContent = `Slide ${currentSlide + 1} of ${totalSlides}`;
  prevBtn.disabled = currentSlide === 0;
  nextBtn.disabled = currentSlide === totalSlides - 1;
}

function showPreview(html) {
  emptyState.style.display = 'none';
  iframe.classList.add('visible');
  iframe.srcdoc = html;
  iframe.onload = () => {
    totalSlides = iframe.contentDocument.querySelectorAll('.slide').length;
    currentSlide = 0;
    updateNav();
    downloadBtn.disabled = false;
    pdfBtn.disabled = false;
    scalePreview();
  };
}

function scalePreview() {
  const cw = container.clientWidth - 48;
  const ch = container.clientHeight - 48;
  const scaleW = cw / 960;
  const scaleH = ch / 540;
  const scale = Math.min(scaleW, scaleH, 1);
  iframe.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

window.addEventListener('resize', scalePreview);

function showError(msg) {
  clearError();
  const div = document.createElement('div');
  div.className = 'error-msg';
  div.id = 'error-msg';
  div.textContent = msg;
  convertBtn.parentNode.insertBefore(div, convertBtn.nextSibling);
}

function clearError() {
  const existing = $('#error-msg');
  if (existing) existing.remove();
}

init();
