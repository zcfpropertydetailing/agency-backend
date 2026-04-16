const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const supabase = require('../utils/supabase');
const { deployClientSite } = require('../utils/cloudflare');
const { generateWebsite } = require('../utils/websiteGenerator');

// Generate and deploy a client website
router.post('/website', requireAuth, async (req, res) => {
  const { deployData } = req.body;

  try {
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.user.id)
      .single();

    const clientData = {
      businessName: deployData.businessName || client.business_name,
      industry: deployData.industry || client.industry,
      location: deployData.location || client.location,
      phone: deployData.phone || client.phone,
      email: deployData.email || client.email,
      services: deployData.services || [],
      areas: deployData.areas || [],
      colors: deployData.colors || {},
      tagline: deployData.tagline || '',
      description: deployData.description || '',
      testimonials: deployData.testimonials || [],
      hours: deployData.hours || '',
      certifications: deployData.certifications || '',
      founded: deployData.founded || ''
    };

    // Notify client that build is starting
    console.log(`Building website for ${clientData.businessName}...`);

    // Generate the custom website HTML using Claude
    const htmlContent = await generateWebsite(clientData);

    // Deploy to Cloudflare Pages
    const deployment = await deployClientSite(clientData, htmlContent);

    // Save to database
    await supabase
      .from('clients')
      .update({ netlify_site_url: deployment.siteUrl })
      .eq('id', req.user.id);

    await supabase.from('deliverables').insert({
      client_id: req.user.id,
      agent_type: 'website',
      deliverable_type: 'website_deployed',
      status: 'completed',
      data: { ...deployment, htmlLength: htmlContent.length }
    });

    await supabase.from('agent_logs').insert({
      client_id: req.user.id,
      agent_type: 'website',
      action: 'website_deployed',
      outcome: 'success',
      notes: `Deployed to ${deployment.siteUrl}`
    });

    res.json({
      success: true,
      siteUrl: deployment.siteUrl,
      projectName: deployment.projectName
    });

  } catch (err) {
    console.error('Deploy error:', err);

    await supabase.from('agent_logs').insert({
      client_id: req.user.id,
      agent_type: 'website',
      action: 'website_deploy_failed',
      outcome: 'error',
      notes: err.message
    });

    res.status(500).json({ error: err.message });
  }
});

// Get client's deployed site info
router.get('/website-status', requireAuth, async (req, res) => {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('netlify_site_url, business_name')
      .eq('id', req.user.id)
      .single();

    const { data: deliverables } = await supabase
      .from('deliverables')
      .select('*')
      .eq('client_id', req.user.id)
      .eq('agent_type', 'website')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1);

    res.json({
      hasSite: !!client.netlify_site_url,
      siteUrl: client.netlify_site_url,
      lastDeployment: deliverables?.[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Regenerate/update a client's website
router.post('/website/update', requireAuth, async (req, res) => {
  const { changes } = req.body;

  try {
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.user.id)
      .single();

    const { data: lastDeploy } = await supabase
      .from('deliverables')
      .select('data')
      .eq('client_id', req.user.id)
      .eq('deliverable_type', 'website_deployed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const previousData = lastDeploy?.data || {};
    const updatedData = { ...previousData, ...changes, businessName: client.business_name, industry: client.industry, location: client.location };

    const htmlContent = await generateWebsite(updatedData);
    const deployment = await deployClientSite({ businessName: client.business_name }, htmlContent);

    await supabase.from('agent_logs').insert({
      client_id: req.user.id,
      agent_type: 'website',
      action: 'website_updated',
      outcome: 'success',
      notes: `Updated: ${JSON.stringify(changes)}`
    });

    res.json({ success: true, siteUrl: deployment.siteUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
