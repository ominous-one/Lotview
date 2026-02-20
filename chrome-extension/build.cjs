#!/usr/bin/env node

const { build } = require('esbuild');
const { copyFileSync, mkdirSync, existsSync, readdirSync, rmSync, readFileSync, createWriteStream } = require('fs');
const path = require('path');
const archiver = require('archiver');

const isProd = process.argv.includes('--prod');
const shouldZip = process.argv.includes('--zip');
const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');
const iconsDir = path.join(__dirname, 'icons');

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

const distIconsDir = path.join(distDir, 'icons');
mkdirSync(distIconsDir, { recursive: true });

const commonOptions = {
  bundle: true,
  target: 'chrome120',
  minify: isProd,
  sourcemap: !isProd,
  drop: isProd ? ['console', 'debugger'] : [],
  define: {
    '__DEV__': isProd ? 'false' : 'true',
  },
};

async function buildExtension() {
  console.log(`Building Chrome extension${isProd ? ' (production)' : ' (development)'}...`);

  await build({
    ...commonOptions,
    entryPoints: [path.join(srcDir, 'background.ts')],
    outfile: path.join(distDir, 'background.js'),
    format: 'esm',
  });
  console.log('  ✓ background.js');

  await build({
    ...commonOptions,
    entryPoints: [path.join(srcDir, 'content-facebook.ts')],
    outfile: path.join(distDir, 'content-facebook.js'),
    format: 'iife',
  });
  console.log('  ✓ content-facebook.js');

  await build({
    ...commonOptions,
    entryPoints: [path.join(srcDir, 'content-lotview.ts')],
    outfile: path.join(distDir, 'content-lotview.js'),
    format: 'iife',
  });
  console.log('  ✓ content-lotview.js');

  await build({
    ...commonOptions,
    entryPoints: [path.join(srcDir, 'popup.tsx')],
    outfile: path.join(distDir, 'popup.js'),
    format: 'esm',
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
  });
  console.log('  ✓ popup.js');

  const manifestFile = isProd ? 'manifest.json' : 'manifest.dev.json';
  copyFileSync(path.join(__dirname, manifestFile), path.join(distDir, 'manifest.json'));
  console.log(`  ✓ manifest.json (from ${manifestFile})`);

  copyFileSync(path.join(srcDir, 'popup.html'), path.join(distDir, 'popup.html'));
  console.log('  ✓ popup.html');

  copyFileSync(path.join(srcDir, 'popup.css'), path.join(distDir, 'popup.css'));
  console.log('  ✓ popup.css');

  if (existsSync(iconsDir)) {
    const icons = readdirSync(iconsDir);
    for (const icon of icons) {
      copyFileSync(path.join(iconsDir, icon), path.join(distIconsDir, icon));
    }
    console.log(`  ✓ ${icons.length} icons`);
  }

  console.log('\n✅ Extension built successfully to dist/');

  if (shouldZip) {
    await createZipPackage();
  } else {
    console.log('\nTo install:');
    console.log('  1. Open Chrome → chrome://extensions/');
    console.log('  2. Enable "Developer mode"');
    console.log('  3. Click "Load unpacked"');
    console.log('  4. Select the chrome-extension/dist folder');
    console.log('\nTo create a zip for distribution:');
    console.log('  node build.cjs --prod --zip');
  }
}

async function createZipPackage() {
  const manifest = JSON.parse(readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
  const version = manifest.version || '1.0.0';
  const zipName = `lotview-auto-poster-v${version}.zip`;
  const zipPath = path.join(__dirname, zipName);

  if (existsSync(zipPath)) {
    rmSync(zipPath);
  }

  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const sizeKB = (archive.pointer() / 1024).toFixed(1);
      console.log(`\n📦 Created ${zipName} (${sizeKB} KB)`);
      console.log('\nTo submit to Chrome Web Store:');
      console.log('  1. Go to https://chrome.google.com/webstore/devconsole');
      console.log('  2. Click "Add new item" or update existing');
      console.log(`  3. Upload ${zipName}`);
      resolve();
    });

    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(distDir, false);
    archive.finalize();
  });
}

buildExtension().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
