const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_BASE = 'https://api.cloudflare.com/client/v4';

const headers = {
  'Authorization': `Bearer ${CF_TOKEN}`,
  'Content-Type': 'application/json'
};

// Create a new Cloudflare Pages project
async function createProject(projectName) {
  const res = await fetch(`${CF_BASE}/accounts/${CF_ACCOUNT}/pages/projects`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: projectName,
      production_branch: 'main'
    })
  });
  const data = await res.json();
  if (!data.success) throw new Error('Failed to create Pages project: ' + JSON.stringify(data.errors));
  return data.result;
}

// Deploy files to a Pages project using Direct Upload
async function deployFiles(projectName, files) {
  // files is an object: { 'index.html': htmlContent, ... }
  
  // Create a form data payload
  const FormData = require('form-data');
  const form = new FormData();
  
  const manifest = {};
  
  for (const [filename, content] of Object.entries(files)) {
    const buf = Buffer.from(content, 'utf8');
    form.append('files', buf, { filename, contentType: getContentType(filename) });
    manifest[`/${filename}`] = filename;
  }
  
  form.append('manifest', JSON.stringify(manifest));
  
  const res = await fetch(`${CF_BASE}/accounts/${CF_ACCOUNT}/pages/projects/${projectName}/deployments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_TOKEN}`,
      ...form.getHeaders()
    },
    body: form
  });
  
  const data = await res.json();
  if (!data.success) throw new Error('Failed to deploy: ' + JSON.stringify(data.errors));
  return data.result;
}

function getContentType(filename) {
  if (filename.endsWith('.html')) return 'text/html';
  if (filename.endsWith('.css')) return 'text/css';
  if (filename.endsWith('.js')) return 'application/javascript';
  return 'text/plain';
}

// Full deployment: create project and deploy files
async function deployClientSite(clientData, htmlContent) {
  const projectName = generateProjectName(clientData.businessName);
  
  // Try to create the project (may already exist)
  let project;
  try {
    project = await createProject(projectName);
  } catch (e) {
    // If project already exists, use existing
    if (!e.message.includes('already exists')) throw e;
  }
  
  // Deploy the files
  const deployment = await deployFiles(projectName, {
    'index.html': htmlContent
  });
  
  const siteUrl = `https://${projectName}.pages.dev`;
  
  return {
    projectName,
    siteUrl,
    deploymentId: deployment?.id,
    previewUrl: deployment?.url || siteUrl
  };
}

function generateProjectName(businessName) {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 28) + '-' + Date.now().toString(36).slice(-4);
}

// Get all Pages projects
async function getProjects() {
  const res = await fetch(`${CF_BASE}/accounts/${CF_ACCOUNT}/pages/projects`, { headers });
  const data = await res.json();
  return data.result || [];
}

module.exports = { createProject, deployFiles, deployClientSite, getProjects };
