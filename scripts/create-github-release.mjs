import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function getVersion() {
  const packageJson = readJson(packageJsonPath);
  if (!packageJson.version) {
    throw new Error('package.json is missing version');
  }
  return packageJson.version;
}

function extractReleaseBody(version) {
  const changelog = readFileSync(changelogPath, 'utf8').replace(/\r\n/g, '\n');
  const heading = `## [${version}]`;
  const start = changelog.indexOf(heading);
  if (start < 0) {
    throw new Error(`CHANGELOG.md is missing section for version ${version}`);
  }
  const bodyStart = changelog.indexOf('\n', start);
  if (bodyStart < 0) {
    throw new Error(`CHANGELOG.md section for version ${version} is malformed`);
  }
  const nextHeading = changelog.indexOf('\n## [', bodyStart + 1);
  const body = changelog
    .slice(bodyStart + 1, nextHeading < 0 ? changelog.length : nextHeading)
    .trim();
  if (!body) {
    throw new Error(`CHANGELOG.md section for version ${version} has empty body`);
  }
  return body;
}

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN.trim();
  }
  try {
    const output = execFileSync(
      'git',
      ['credential-manager', 'get'],
      {
        input: 'protocol=https\nhost=github.com\n\n',
        encoding: 'utf8',
        cwd: repoRoot,
      },
    );
    const tokenLine = output
      .split(/\r?\n/)
      .find((line) => line.startsWith('password='));
    if (!tokenLine) {
      throw new Error('Git credential manager returned no password');
    }
    return tokenLine.slice('password='.length);
  } catch (error) {
    throw new Error(
      `Unable to resolve GitHub token from GITHUB_TOKEN or git credential-manager: ${error.message}`,
    );
  }
}

async function githubRequest(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API ${init.method || 'GET'} ${url} failed: ${response.status} ${await response.text()}`,
    );
  }

  return response.json();
}

async function main() {
  const version = getVersion();
  const tagName = `v${version}`;
  const releaseName = tagName;
  const body = extractReleaseBody(version);
  const token = getGitHubToken();
  const releaseByTagUrl = `https://api.github.com/repos/KittyMi/openclaw-generic-http/releases/tags/${tagName}`;
  const existingRelease = await githubRequest(releaseByTagUrl, token);

  const payload = {
    tag_name: tagName,
    name: releaseName,
    draft: false,
    prerelease: false,
    generate_release_notes: false,
    body,
  };

  if (dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          action: existingRelease ? 'update' : 'create',
          releaseUrl: existingRelease?.html_url ?? null,
          payload,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const result = existingRelease
    ? await githubRequest(
        `https://api.github.com/repos/KittyMi/openclaw-generic-http/releases/${existingRelease.id}`,
        token,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            name: releaseName,
            body,
            draft: false,
            prerelease: false,
          }),
        },
      )
    : await githubRequest(
        'https://api.github.com/repos/KittyMi/openclaw-generic-http/releases',
        token,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify(payload),
        },
      );

  process.stdout.write(`${result.html_url}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
