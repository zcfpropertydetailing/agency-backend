const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_BASE = 'https://api.cloudflare.com/client/v4';

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
  if (!data.success) {
    const msg = JSON.stringify(data.errors);
    if (msg.includes('already exist') || msg.includes('duplicate') || msg.includes('taken')) {
      return { id: projectName, name: projectName };
    }
    throw new Error('Failed to create Pages project: ' + msg);
  }
  return data.result;
}

async function deployToPages(projectName, htmlContent) {
  const FormData = require('form-data');
  const form = new FormData();

  // Correct manifest format: { "/path": "" }
  const manifest = { '/index.html': '' };
  form.append('manifest', JSON.stringify(manifest));

  // File must be appended with path as field name (including leading slash)
  const buf = Buffer.from(htmlContent, 'utf8');
  form.append('/index.html', buf, {
    filename: 'index.html',
    contentType: 'text/html'
  });

  const res = await fetch(
    `${CF_BASE}/accounts/${CF_ACCOUNT}/pages/projects/${projectName}/deployments`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_TOKEN}`,
        ...form.getHeaders()
      },
      body: form
    }
  );

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Cloudflare returned non-JSON: ' + text.substring(0, 200));
  }

  if (!data.success) {
    throw new Error('Deploy failed: ' + JSON.stringify(data.errors));
  }

  return data.result;
}

async function deployClientSite(clientData, htmlContent) {
  const projectName = generateProjectName(clientData.businessName);

  // Create project (ignore if already exists)
  try {
    await createProject(projectName);
  } catch (e) {
    console.log('Project note:', e.message);
  }

  // Deploy the HTML
  const deployment = await deployToPages(projectName, htmlContent);

  const siteUrl = `https://${projectName}.pages.dev`;

  return {
    projectName,
    siteUrl,
    deploymentId: deployment?.id,
    previewUrl: deployment?.url || siteUrl
  };
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
