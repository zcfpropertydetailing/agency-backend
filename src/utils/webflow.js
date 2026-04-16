const WEBFLOW_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_BASE = 'https://api.webflow.com/v2';

const headers = {
  'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
  'Content-Type': 'application/json',
  'accept-version': '2.0.0'
};

// Get all sites in the workspace
async function getSites() {
  const res = await fetch(`${WEBFLOW_BASE}/sites`, { headers });
  return await res.json();
}

// Create a new site from a template
async function createSite(displayName) {
  const res = await fetch(`${WEBFLOW_BASE}/sites`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ displayName })
  });
  return await res.json();
}

// Get CMS collections for a site
async function getCollections(siteId) {
  const res = await fetch(`${WEBFLOW_BASE}/sites/${siteId}/collections`, { headers });
  return await res.json();
}

// Update site settings (name, SEO, etc)
async function updateSiteSettings(siteId, settings) {
  const res = await fetch(`${WEBFLOW_BASE}/sites/${siteId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(settings)
  });
  return await res.json();
}

// Create a CMS item (page content)
async function createCMSItem(collectionId, fieldData) {
  const res = await fetch(`${WEBFLOW_BASE}/collections/${collectionId}/items`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fieldData, isArchived: false, isDraft: false })
  });
  return await res.json();
}

// Publish a site
async function publishSite(siteId, domains) {
  const res = await fetch(`${WEBFLOW_BASE}/sites/${siteId}/publish`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ publishToWebflowSubdomain: true, customDomains: domains || [] })
  });
  return await res.json();
}

// Get site pages
async function getPages(siteId) {
  const res = await fetch(`${WEBFLOW_BASE}/sites/${siteId}/pages`, { headers });
  return await res.json();
}

// Update page content
async function updatePageContent(pageId, body) {
  const res = await fetch(`${WEBFLOW_BASE}/pages/${pageId}/dom`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  return await res.json();
}

// Full workflow: create site for a client
async function createClientSite(clientData) {
  const {
    businessName, industry, location, phone, email,
    services, areas, colors, tagline, description
  } = clientData;

  const siteName = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Create the site
  const site = await createSite(businessName);
  if (!site.id) throw new Error('Failed to create Webflow site: ' + JSON.stringify(site));

  // Publish to Webflow subdomain immediately
  await publishSite(site.id, []);

  return {
    siteId: site.id,
    siteUrl: `https://${siteName}.webflow.io`,
    webflowUrl: site.previewUrl || `https://${siteName}.webflow.io`
  };
}

module.exports = {
  getSites,
  createSite,
  getCollections,
  updateSiteSettings,
  createCMSItem,
  publishSite,
  getPages,
  updatePageContent,
  createClientSite
};
