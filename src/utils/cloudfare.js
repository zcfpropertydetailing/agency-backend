const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_BASE = 'https://api.cloudflare.com/client/v4';
 
// Create a new Cloudflare Pages project
async function createProject(projectName) {
  const res = await fetch(`${CF_BASE}/accounts/${CF_ACCOUNT}/pages/projects`, {
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
  if (!data.success) throw new Error('Failed to create Pages project: ' + JSON.stringify(data.errors));
  return data.result;
}
 
// Deploy files to a Pages project using Direct Upload
async function deployFiles(projectName, files) {
  const FormData = require('form-data');
  const crypto = require('crypto');
  
  // First create a deployment
  const deployRes = await fetch(`${CF_BASE}/accounts/${CF_ACCOUNT}/pages/projects/${projectName}/deployments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  const deployData = await deployRes.json();
  
  if (!deployData.success && !deployData.result) {
    // Try direct upload approach
    return await directUpload(projectName, files);
  }
  
  return deployData.result;
}
 
async function directUpload(projectName, files) {
  const FormData = require('form-data');
  
  const form = new FormData();
  
  // Build manifest - maps URL paths to file hashes
  const manifest = {};
  const fileEntries = [];
  
  for (const [filename, content] of Object.entries(files)) {
    const buf = Buffer.from(content, 'utf8');
    const hash = require('crypto').createHash('sha256').update(buf).digest('hex');
    const urlPath = '/' + filename;
    manifest[urlPath] = hash;
    fileEntries.push({ filename, buf, hash, contentType: getContentType(filename) });
  }
 
  // Append manifest first
  form.append('manifest', JSON.stringify(manifest));
  
  // Append each file with its hash as the field name
  for (const { hash, buf, contentType } of fileEntries) {
    form.append(hash, buf, { contentType });
  }
 
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
  
  // Try to create the project
  try {
    await createProject(projectName);
  } catch (e) {
    if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
      console.log('Project creation note:', e.message);
    }
  }
  
  // Deploy the files
  const deployment = await directUpload(projectName, {
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
 
async function getProjects() {
  const res = await fetch(`${CF_BASE}/accounts/${CF_ACCOUNT}/pages/projects`, {
    headers: { 'Authorization': `Bearer ${CF_TOKEN}` }
  });
  const data = await res.json();
  return data.result || [];
}
 
module.exports = { createProject, deployFiles, deployClientSite, getProjects };
 
