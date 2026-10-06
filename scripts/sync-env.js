const fs = require('node:fs');
const path = require('node:path');

const VALID = ['development', 'staging', 'production'];

function parseArgs(argv) {
  const args = { environment: null, output: '.env.local' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output' || arg === '-o') {
      args.output = argv[i + 1];
      i += 1;
    } else if (!arg.startsWith('-') && !args.environment) {
      args.environment = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function main() {
  const { environment, output } = parseArgs(process.argv.slice(2));
  if (!environment || !VALID.includes(environment)) {
    console.error(
      `Usage: node scripts/sync-env.js <${VALID.join('|')}> [--output .env.local]`
    );
    process.exit(1);
  }

  const root = path.resolve(__dirname, '..');
  const source = path.join(root, `.env.${environment}`);
  const target = path.join(root, output);

  if (!fs.existsSync(source)) {
    console.error(`Missing ${source}`);
    process.exit(1);
  }

  fs.copyFileSync(source, target);
  console.log(`Synced ${path.basename(source)} -> ${output} (${environment})`);
}

main();
