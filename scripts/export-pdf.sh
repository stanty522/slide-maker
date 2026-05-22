#!/usr/bin/env bash
set -euo pipefail

INPUT="${1:?Usage: export-pdf.sh <input.html> [output.pdf]}"
OUTPUT="${2:-${INPUT%.html}.pdf}"

if ! command -v npx &>/dev/null; then
  echo "Error: Node.js / npx required. Install from https://nodejs.org" >&2
  exit 1
fi

if [ ! -d node_modules/@playwright ]; then
  echo "Installing Playwright..."
  npm install --save-dev @playwright/test
  npx playwright install chromium
fi

ABS_INPUT="$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")"
ABS_OUTPUT="$(cd "$(dirname "$OUTPUT")" 2>/dev/null && pwd)/$(basename "$OUTPUT")" || ABS_OUTPUT="$(pwd)/$(basename "$OUTPUT")"

node -e "
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto('file://${ABS_INPUT}', { waitUntil: 'networkidle' });

  await page.pdf({
    path: '${ABS_OUTPUT}',
    width: '960px',
    height: '540px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
  });

  await browser.close();
  console.log('PDF saved to ${ABS_OUTPUT}');
})();
"
