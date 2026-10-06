#!/usr/bin/env node
const fs = require('node:fs');

function extractBuildId(stdin) {
  const data = JSON.parse(stdin);
  const build =
    data.builds?.[0] ??
    data.build ??
    (typeof data.id === 'string' ? data : null);
  if (!build?.id) {
    console.error('Could not find build id in eas build --json output');
    process.exit(1);
  }
  return build.id;
}

const stdin = fs.readFileSync(0, 'utf8');
process.stdout.write(extractBuildId(stdin));
