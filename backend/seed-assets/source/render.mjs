import { chromium } from 'playwright';
import fs from 'fs';
import { spawn } from 'child_process';
const dir = new URL('.', import.meta.url).pathname;
const FPS = 30, SECONDS = 8;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('file://' + dir + '/scenes.html');
for (const n of process.argv.slice(2)) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4',
    '-pix_fmt', 'yuv420p', '-an', `${dir}/../${n}.webm`]);
  for (let i = 0; i < FPS * SECONDS; i++) {
    const url = await page.evaluate(([n, t]) => window.renderStill(n, t), [n, i / FPS]);
    if (!ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log(n, fs.statSync(`${dir}/../${n}.webm`).size);
}
await browser.close();
