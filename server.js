const express = require('express');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

const SYSTEM_PROMPT = `You are a slide designer that converts HTML pages into presentation slides using the Gather design system.

## Output Format
Return ONLY raw HTML: a sequence of <section class="slide"> elements, plus an optional <script> block at the end if you need JavaScript for charts.
Do NOT include \`\`\`html fences, <!DOCTYPE>, <html>, <head>, <body>, or <style> tags. The surrounding document and CSS will be provided by the system.

## Slide Rules
- Each slide is 960px wide x 540px tall — content must fit, no overflow
- Aim for 4-8 slides depending on content density
- One key idea per slide
- Headers (h1) are always centered, font-weight 600 (semi-bold)

## Design System: Gather
- Font: Work Sans (sans-serif)
- Background: #fcf5e2 (cream)
- Text color: #000000 (black)
- Accent color: #ff5722 (orange) — use for emphasis, can combine with bold
- Charts and tables use orange at varying opacities:
  CSS vars: --color-accent (100%), --color-accent-90, --color-accent-70, --color-accent-50, --color-accent-30, --color-accent-20, --color-accent-10, --color-accent-05
  Raw: rgba(255,87,34,1), rgba(255,87,34,0.7), rgba(255,87,34,0.45), rgba(255,87,34,0.25), etc.

## Available CSS Classes

Slide types:
  .slide                    — base slide (flex column, 960x540)
  .slide.title-slide        — centered title (h1 + p.subtitle + p.author)
  .slide.section-slide      — section divider (h1 in accent color)

Layout containers (use inside .slide, after h1):
  .slide-body               — flex column, gap 16px
  .slide-body.centered      — centered content
  .slide-columns            — two equal columns, use .col children
  .slide-grid.cols-2/3/4    — CSS grid

Text helpers:
  .subtitle     — muted subtitle
  .accent       — orange text
  .bold         — bold
  .accent-bold  — orange + bold

Components:
  .card                — white rounded card
  .card.accent-border  — card with orange left border
  .stat-card           — KPI card: .stat-value (big orange number) + .stat-label
  .callout             — orange-left-bordered insight box, use <strong> for label
  .tag / .tag.filled   — pill badges
  .divider             — thin horizontal line
  blockquote           — italic styled quote
  .slide-footer        — absolute bottom bar

Tables:
  Standard <table> with <thead>/<tbody> — auto-styled (orange header row, striped body)

Bar charts:
  .bar-chart > .bar-row > (.bar-label + .bar-track > .bar-fill.oXX + .bar-value)
  Fill opacity classes: .o100 .o90 .o70 .o50 .o30 .o20

SVG donut/pie:
  Use circle stroke-dasharray technique with orange rgba values
  Wrap in .chart-container with .chart-legend > .legend-item > .legend-dot

## Conversion Guidelines
1. Start with a title slide extracted from the page's main heading or <title>
2. Analyze ALL content — text, data, charts, tables, notes, legends
3. For JS-generated visualizations: extract the DATA from the script, rebuild as static SVG or HTML bar charts using Gather's orange palette
4. Map multi-color schemes to orange opacity variations (darkest = most important)
5. For groups of items, use cards in a grid layout
6. For key numbers, use stat-cards
7. For important insights, use callouts with <strong> labels
8. Keep text concise per slide — split dense content across multiple slides
9. Preserve ALL data and meaning from the original
10. Every <section class="slide"> must have an <h1> as its first child (centered, semi-bold — handled by CSS)

## Example Slide Patterns

Title slide:
<section class="slide title-slide">
  <h1>Deck Title</h1>
  <p class="subtitle">Subtitle here</p>
  <p class="author">Additional info</p>
</section>

Content with cards:
<section class="slide">
  <h1>Section Title</h1>
  <div class="slide-body">
    <div class="slide-grid cols-3">
      <div class="card accent-border"><h3>Card Title</h3><p>Detail text</p></div>
      <div class="card accent-border"><h3>Card Title</h3><p>Detail text</p></div>
      <div class="card accent-border"><h3>Card Title</h3><p>Detail text</p></div>
    </div>
  </div>
</section>

Two-column with callouts:
<section class="slide">
  <h1>Comparison</h1>
  <div class="slide-body">
    <div class="slide-columns">
      <div class="col">
        <div class="card accent-border"><h3>Left</h3><p>Content</p></div>
        <div class="callout"><strong>Key:</strong> Insight here.</div>
      </div>
      <div class="col">
        <div class="card" style="border-left:4px solid rgba(255,87,34,0.5)"><h3>Right</h3><p>Content</p></div>
        <div class="callout"><strong>Key:</strong> Insight here.</div>
      </div>
    </div>
  </div>
</section>

Full-bleed chart (no padding):
<section class="slide" style="padding:0">
  <svg viewBox="0 0 960 540" ...><!-- chart content --></svg>
</section>`;

app.post('/api/convert', async (req, res) => {
  const { html, designSystem, apiKey } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'No HTML provided' });
  }

  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(400).json({ error: 'No API key. Set ANTHROPIC_API_KEY or enter one in Settings.' });
  }

  let cssContent;
  try {
    const cssPath = designSystem === 'gather' ? 'gather.css' : 'gather.css';
    cssContent = fs.readFileSync(path.join(__dirname, cssPath), 'utf-8');
  } catch {
    return res.status(500).json({ error: 'Could not read design system CSS' });
  }

  const client = new Anthropic({ apiKey: key });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Convert this HTML page into Gather-styled presentation slides:\n\n${html}`
        }
      ]
    });

    const slideHtml = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Slides</title>
<style>
${cssContent}
.slide { margin: 0 !important; box-shadow: none !important; }
html { overflow: hidden; }
</style>
</head>
<body>
${slideHtml}
<script>
document.querySelectorAll('.slide').forEach(s => s.classList.add('visible'));
<\/script>
</body>
</html>`;

    const downloadHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Slides</title>
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
${cssContent}
</style>
</head>
<body>
${slideHtml}
<script>
class SlidePresentation {
  constructor() {
    this.slides = document.querySelectorAll('.slide');
    this.current = 0;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.3 });
    this.slides.forEach(s => obs.observe(s));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(-1); }
    });
  }
  go(dir) {
    this.current = Math.max(0, Math.min(this.slides.length - 1, this.current + dir));
    this.slides[this.current].scrollIntoView({ behavior: 'smooth' });
  }
}
new SlidePresentation();
<\/script>
</body>
</html>`;

    res.json({ html: fullHtml, downloadHtml });
  } catch (err) {
    const msg = err.message || 'Claude API call failed';
    res.status(500).json({ error: msg });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Slide Maker running at http://localhost:${PORT}`);
});
