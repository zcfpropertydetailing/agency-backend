const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

const execAsync = util.promisify(exec);

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;

async function deployClientSite(clientData, htmlContent) {
  const projectName = generateProjectName(clientData.businessName);

  // Create a temporary directory for the site files
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  const indexPath = path.join(tmpDir, 'index.html');
  fs.writeFileSync(indexPath, htmlContent, 'utf8');

  try {
    // Create project first (will silently fail if exists)
    await createProject(projectName);

    // Deploy using wrangler CLI
    const env = {
      ...process.env,
      CLOUDFLARE_API_TOKEN: CF_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT
    };

    const { stdout, stderr } = await execAsync(
      `npx wrangler pages deploy ${tmpDir} --project-name=${projectName} --commit-dirty=true`,
      { env, timeout: 120000 }
    );

    console.log('Wrangler deploy output:', stdout);
    if (stderr) console.log('Wrangler stderr:', stderr);

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const siteUrl = `https://${projectName}.pages.dev`;
    return {
      projectName,
      siteUrl,
      previewUrl: siteUrl
    };
  } catch (err) {
    // Clean up on error
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    throw err;
  }
}

async function createProject(projectName) {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/pages/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: projectName,
        production_branch: 'main'
      })
    });
    const data = await res.json();
    return data.result;
  } catch (e) {
    // Ignore - may already exist
    return null;
  }
}

function generateProjectName(businessName) {
  const base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 24);
  const suffix = Date.now().toString(36).slice(-4);
  return `${base}-${suffix}`;
}

module.exports = { createProject, deployClientSite };
