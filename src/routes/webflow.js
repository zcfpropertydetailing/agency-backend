const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const supabase = require('../utils/supabase');
const { callClaude } = require('../utils/anthropic');
const webflow = require('../utils/webflow');

// Create a new client website
router.post('/create-site', requireAuth, async (req, res) => {
  const { deployData } = req.body;

  try {
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.user.id)
      .single();

    // Create the Webflow site
    const siteResult = await webflow.createClientSite({
      businessName: deployData.businessName || client.business_name,
      industry: deployData.industry || client.industry,
      location: deployData.location || client.location,
      phone: deployData.phone || client.phone,
      email: deployData.email || client.email,
      services: deployData.services || [],
      areas: deployData.areas || [],
      colors: deployData.colors || { primary: '#1a1a18', accent: '#6366f1' },
      tagline: deployData.tagline || '',
      description: deployData.description || ''
    });

    // Save the site info to the client record
    await supabase
      .from('clients')
      .update({ webflow_site_id: siteResult.siteId, netlify_site_url: siteResult.siteUrl })
      .eq('id', req.user.id);

    // Save as a deliverable
    await supabase.from('deliverables').insert({
      client_id: req.user.id,
      agent_type: 'website',
      deliverable_type: 'website_created',
      status: 'completed',
      data: siteResult
    });

    // Log the action
    await supabase.from('agent_logs').insert({
      client_id: req.user.id,
      agent_type: 'website',
      action: 'site_created',
      outcome: 'success',
      notes: `Site created: ${siteResult.siteUrl}`
    });

    res.json({ success: true, site: siteResult });
  } catch (err) {
    console.error('Webflow create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get client's site info
router.get('/site-info', requireAuth, async (req, res) => {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('webflow_site_id, netlify_site_url')
      .eq('id', req.user.id)
      .single();

    if (!client.webflow_site_id) {
      return res.json({ hasSite: false });
    }

    const sites = await webflow.getSites();
    const site = sites.sites?.find(s => s.id === client.webflow_site_id);

    res.json({ hasSite: true, siteUrl: client.netlify_site_url, site });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update site content
router.post('/update-site', requireAuth, async (req, res) => {
  const { updates } = req.body;

  try {
    const { data: client } = await supabase
      .from('clients')
      .select('webflow_site_id')
      .eq('id', req.user.id)
      .single();

    if (!client.webflow_site_id) {
      return res.status(400).json({ error: 'No site found for this client' });
    }

    // Log the update
    await supabase.from('agent_logs').insert({
      client_id: req.user.id,
      agent_type: 'website',
      action: 'site_updated',
      outcome: 'success',
      notes: JSON.stringify(updates)
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all workspace sites (admin)
router.get('/all-sites', requireAuth, async (req, res) => {
  try {
    const sites = await webflow.getSites();
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
