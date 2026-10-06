const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

function parseArgs(argv) {
  const args = { bump: null, set: null, fromGitTag: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (['patch', 'minor', 'major', 'prepatch', 'preminor', 'premajor'].includes(arg)) {
      args.bump = arg;
    } else if (arg === '--set') {
      args.set = argv[i + 1];
      i += 1;
    } else if (arg === '--from-git-tag') {
      args.fromGitTag = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function currentVersion(root) {
  const app = readJson(path.join(root, 'app.json'));
  const pkg = readJson(path.join(root, 'package.json'));
  if (app.expo.version !== pkg.version) {
    throw new Error(
      `Version mismatch: app.json=${app.expo.version} package.json=${pkg.version}`
    );
  }
  return app.expo.version;
}

function resolveVersion(root, args) {
  if (args.set) return args.set;
  if (args.fromGitTag) {
    let tag;
    try {
      tag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
    } catch {
      throw new Error('No git tags found. Create one first: git tag v1.0.0 (or use --set <version> / a bump type)');
    }
    return tag.replace(/^v/, '');
  }
  if (!args.bump) {
    throw new Error('Provide a bump type (patch|minor|major|...), --set <version>, or --from-git-tag');
  }
  const match = SEMVER_RE.exec(currentVersion(root));
  if (!match) throw new Error(`Current version is not valid semver: ${currentVersion(root)}`);
  const [, major, minor, patch] = match.map(Number);
  switch (args.bump) {
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'major': return `${major + 1}.0.0`;
    case 'prepatch': return `${major}.${minor}.${patch}-rc.1`;
    case 'preminor': return `${major}.${minor + 1}.0-rc.1`;
    case 'premajor': return `${major + 1}.0.0-rc.1`;
    default: throw new Error(`Unsupported bump: ${args.bump}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');

  const previous = currentVersion(root);
  const version = resolveVersion(root, args);
  if (!SEMVER_RE.test(version)) {
    throw new Error(`Not a valid semver version: ${version}`);
  }

  const appPath = path.join(root, 'app.json');
  const pkgPath = path.join(root, 'package.json');
  const app = readJson(appPath);
  const pkg = readJson(pkgPath);

  if (previous === version) {
    console.log(`Version already ${version}; nothing to do.`);
    return;
  }

  if (args.dryRun) {
    console.log(`${previous} -> ${version} (dry run)`);
    return;
  }

  app.expo.version = version;
  pkg.version = version;
  writeJson(appPath, app);
  writeJson(pkgPath, pkg);
  console.log(`Bumped ${previous} -> ${version}`);
}

main();
