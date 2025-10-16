#!/usr/bin/env node

const { spawn } = require('child_process');
const express = require('express');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const exportPath = path.resolve(__dirname, 'export', 'latest.json');

function parseArgs() {
  const args = process.argv.slice(2);
  let port = Number(process.env.PORT) || 4173;
  let serveOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      port = Number(args[i + 1]);
      i++;
    } else if (arg.startsWith('--port=')) {
      port = Number(arg.split('=')[1]);
    } else if (arg === '--serve-only' || arg === '--skip-run') {
      serveOnly = true;
    }
  }

  if (!Number.isFinite(port) || port <= 0) {
    port = 4173;
  }

  return { port, serveOnly };
}

function runSimulation() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Running Hardhat AGI Jobs grand demo simulation…');
    const child = spawn(
      'npx',
      [
        'hardhat',
        'run',
        '--no-compile',
        '--network',
        'hardhat',
        'scripts/v2/agiLaborMarketGrandDemo.ts',
        '--export',
        exportPath,
      ],
      {
        cwd: repoRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          AGI_JOBS_DEMO_EXPORT: exportPath,
        },
      }
    );

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Hardhat demo exited with code ${code}`));
      }
    });
  });
}

function ensureTranscript() {
  if (!fs.existsSync(exportPath)) {
    throw new Error(
      `No transcript found at ${exportPath}. Run the demo export before launching the dashboard.`
    );
  }
}

function startServer(port) {
  const app = express();
  app.use(express.static(__dirname));

  app.listen(port, '0.0.0.0', () => {
    console.log('🌐 Sovereign control room dashboard available:');
    console.log(`   http://localhost:${port}`);
    console.log('   Press Ctrl+C to stop the server.');
  });
}

async function main() {
  const { port, serveOnly } = parseArgs();

  if (!serveOnly) {
    try {
      await runSimulation();
    } catch (error) {
      console.error('❌ Failed to execute the Hardhat simulation.');
      console.error(error.message || error);
      process.exit(1);
    }
  } else {
    console.log('ℹ️  Serving existing transcript without running the Hardhat simulation.');
  }

  try {
    ensureTranscript();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  startServer(port);
}

main().catch((error) => {
  console.error('Unexpected error launching the dashboard:', error);
  process.exit(1);
});
