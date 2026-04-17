const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const supabase = require('../utils/supabase');
const { deployClientSite } = require('../utils/cloudflare');
const { generateWebsite } = require('../utils/websiteGenerator');
const { callClaude } = require('../utils/anthropic');

// Extract structured data from conversation
async function extractFromConversation(conversation, clientProfile) {
  const prompt = `Read this conversation between a website agent and a client. Extract all the information the client provided. Return ONLY valid JSON.

CLIENT PROFILE (baseline — may be overridden by conversation):
- Business Name: ${clientProfile.business_name || ''}
- Industry: ${clientProfile.industry || ''}
- Location: ${clientProfile.location || ''}
- Phone: ${clientProfile.phone || ''}

CONVERSATION:
${conversation}

Extract and return this JSON with ONLY information explicitly stated in the conversation (leave blank if not mentioned):
{
  "businessName": "exact business name from conversation or profile",
  "industry": "exact industry/service type from conversation",
  "location": "city/state from conversation",
  "phone": "phone number from conversation",
  "email": "email if mentioned",
  "services": ["list", "of", "services", "mentioned"],
  "areas": ["list", "of", "service", "areas", "mentioned"],
  "hours": "hours as stated",
  "yearsInBusiness": "number only if explicitly stated, else empty string",
  "licensed": true or false or null,
  "insured": true or false or null,
  "tagline": "tagline if mentioned",
  "testimonials": [],
  "colors": {"primary": "", "accent": ""},
  "founderName": "",
  "certifications": "",
  "template": ""
}

IMPORTANT: Use ONLY what the client actually said. Do not infer or make up anything.`;

  try {
    const raw = await callClaude('Extract data from conversation. Return only valid JSON.', prompt, 2000);
    const cleaned = raw.replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim();
    return JSON.parse(cleaned);
  } catch(e) {
    console.error('Extraction error:', e.message);
    return {
      businessName: clientProfile.business_name,
      industry: clientProfile.industry,
      location: clientProfile.location,
      phone: clientProfile.phone,
      services: [], areas: []
    };
  }
}

// Generate and deploy a client website
router.post('/website', requireAuth, async (req, res) => {
  const { deployData } = req.body;

  try {
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.user.id)
      .single();

    // Get recent conversation history
    const { data: conversations } = await supabase
      .from('conversations')
      .select('role, content')
      .eq('client_id', req.user.id)
      .eq('agent_type', 'website')
      .order('created_at', { ascending: true })
      .limit(50);

    const conversationText = conversations && conversations.length > 0
      ? conversations.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
      : (deployData.conversationContext || '');

    console.log(`Building website for ${client.business_name}...`);
    console.log(`Conversation length: ${conversationText.length} chars`);

    // Extract real data from conversation
    const extractedData = await extractFromConversation(conversationText, client);
    console.log('Extracted data:', JSON.stringify(extractedData, null, 2));

    // Merge extracted data with fallbacks from client profile
    const clientData = {
      businessName: extractedData.businessName || client.business_name,
      industry: extractedData.industry || client.industry,
      location: extractedData.location || client.location,
      phone: extractedData.phone || client.phone,
      email: extractedData.email || client.email,
      services: extractedData.services?.length > 0 ? extractedData.services : [],
      areas: extractedData.areas?.length > 0 ? extractedData.areas : [extractedData.location || client.location],
      hours: extractedData.hours || '',
      tagline: extractedData.tagline || '',
      yearsInBusiness: extractedData.yearsInBusiness || '',
      licensed: extractedData.licensed,
      insured: extractedData.insured,
      testimonials: extractedData.testimonials || [],
      colors: extractedData.colors || {},
      founderName: extractedData.founderName || '',
      certifications: extractedData.certifications || '',
      template: extractedData.template || deployData.template || '',
      conversationContext: conversationText
    };

    // Generate the website HTML
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
      data: { ...deployment, extractedData }
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

    res.json({
      hasSite: !!client.netlify_site_url,
      siteUrl: client.netlify_site_url
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
