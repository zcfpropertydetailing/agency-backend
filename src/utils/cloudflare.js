const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_BASE = 'https://api.cloudflare.com/client/v4';
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const execAsync = util.promisify(exec);

async function createProject(projectName) {
  try {
    const res = await fetch(`${CF_BASE}/accounts/${CF_ACCOUNT}/pages/projects`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projectName, production_branch: 'main' })
    });
    const data = await res.json();
    if (data.success) { console.log('Project created:', projectName); return data.result; }
    const errMsg = JSON.stringify(data.errors || '');
    if (errMsg.includes('already exist') || errMsg.includes('taken') || errMsg.includes('duplicate')) {
      console.log('Project already exists:', projectName); return { name: projectName };
    }
    throw new Error('Failed to create project: ' + errMsg);
  } catch(e) { console.log('createProject error:', e.message); throw e; }
}

async function verifyProjectExists(projectName, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${CF_BASE}/accounts/${CF_ACCOUNT}/pages/projects/${projectName}`, {
        headers: { 'Authorization': `Bearer ${CF_TOKEN}` }
      });
      const data = await res.json();
      if (data.success) {
        console.log(`Project verified after ${i + 1} attempts`);
        return true;
      }
    } catch(e) {}
    console.log(`Waiting for project to be ready (attempt ${i + 1}/${maxAttempts})...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Project not ready after maximum attempts');
}

async function deployWithWrangler(projectName, htmlContent) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  fs.writeFileSync(path.join(tmpDir, 'index.html'), htmlContent, 'utf8');
  try {
    const env = { ...process.env, CLOUDFLARE_API_TOKEN: CF_TOKEN, CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT };
    const { stdout, stderr } = await execAsync(
      `npx wrangler pages deploy ${tmpDir} --project-name=${projectName} --commit-dirty=true`,
      { env, timeout: 120000 }
    );
    console.log('Wrangler output:', stdout);
    if (stderr) console.log('Wrangler stderr:', stderr);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return { success: true };
  } catch(err) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
    throw err;
  }
}

async function deployClientSite(clientData, htmlContent) {
  const projectName = generateProjectName(clientData.businessName);
  console.log('Starting deployment for:', projectName);

  // Create project
  await createProject(projectName);

  // Wait until project is confirmed ready in Cloudflare API
  await verifyProjectExists(projectName);

  // Deploy with wrangler
  await deployWithWrangler(projectName, htmlContent);

  const siteUrl = `https://${projectName}.pages.dev`;
  console.log('Deployed to:', siteUrl);
  return { projectName, siteUrl, previewUrl: siteUrl };
}

function generateProjectName(businessName) {
  const base = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 24);
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

async function getProjects() {
  const res = await fetch(`${CF_BASE}/accounts/${CF_ACCOUNT}/pages/projects`, { headers: { 'Authorization': `Bearer ${CF_TOKEN}` } });
  const data = await res.json();
  return data.result || [];
}

module.exports = { createProject, deployClientSite, getProjects };
