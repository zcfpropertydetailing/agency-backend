const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const supabase = require('../utils/supabase');
const { callClaudeWithHistory } = require('../utils/anthropic');
const { websiteAgentSystem } = require('../agents/website');
const { socialAgentSystem } = require('../agents/social');
const { gbpAgentSystem } = require('../agents/gbp');
const { adsAgentSystem } = require('../agents/ads');

const AGENT_SYSTEMS = {
  website: websiteAgentSystem,
  social: socialAgentSystem,
  gbp: gbpAgentSystem,
  ads: adsAgentSystem
};

const SUBSCRIPTION_AGENTS = {
  website: ['website'],
  social: ['social'],
  gbp: ['gbp'],
  ads: ['ads'],
  bundle: ['website', 'social', 'gbp', 'ads']
};

// Send message to agent
router.post('/chat', requireAuth, async (req, res) => {
  const { agentType, message } = req.body;

  try {
    // Get client profile
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.user.id)
      .single();

    // Check subscription access
    const allowedAgents = SUBSCRIPTION_AGENTS[client.subscription_tier] || [];
    if (!allowedAgents.includes(agentType)) {
      return res.status(403).json({ error: 'This agent is not included in your current plan.' });
    }

    // Get conversation history
    const { data: history } = await supabase
      .from('conversations')
      .select('role, content')
      .eq('client_id', req.user.id)
      .eq('agent_type', agentType)
      .order('created_at', { ascending: true })
      .limit(50);

    const messages = [...(history || []), { role: 'user', content: message }];

    // Get agent system prompt
    const systemPrompt = AGENT_SYSTEMS[agentType](client);

    // Call Claude
    const reply = await callClaudeWithHistory(systemPrompt, messages, 2000);

    // Save user message
    await supabase.from('conversations').insert({
      client_id: req.user.id,
      agent_type: agentType,
      role: 'user',
      content: message
    });

    // Save assistant reply
    await supabase.from('conversations').insert({
      client_id: req.user.id,
      agent_type: agentType,
      role: 'assistant',
      content: reply
    });

    // Log agent action
    await supabase.from('agent_logs').insert({
      client_id: req.user.id,
      agent_type: agentType,
      action: 'chat_response',
      outcome: 'success'
    });

    // Check for deploy signals in reply
    if (reply.includes('DEPLOY_READY:')) {
      const jsonMatch = reply.match(/DEPLOY_READY:\s*({[\s\S]*?})/);
      if (jsonMatch) {
        try {
          const deployData = JSON.parse(jsonMatch[1]);
          await supabase.from('deliverables').insert({
            client_id: req.user.id,
            agent_type: agentType,
            deliverable_type: 'deploy_request',
            status: 'pending',
            data: deployData
          });
        } catch (e) {
          console.error('Deploy parse error:', e);
        }
      }
    }

    res.json({ reply, agentType });
  } catch (err) {
    console.error('Agent chat error:', err);
    res.status(500).json({ error: 'Agent encountered an error. Please try again.' });
  }
});

// Get conversation history
router.get('/history/:agentType', requireAuth, async (req, res) => {
  const { agentType } = req.params;

  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('client_id', req.user.id)
      .eq('agent_type', agentType)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get accessible agents for client
router.get('/access', requireAuth, async (req, res) => {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('subscription_tier')
      .eq('id', req.user.id)
      .single();

    const agents = SUBSCRIPTION_AGENTS[client.subscription_tier] || [];
    res.json({ agents, tier: client.subscription_tier });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fast reliable collected check based on full conversation
function checkCollected(messages) {
  const userText = messages.filter(m => m.role === 'user').map(m => m.content).join(' ');
  const userLower = userText.toLowerCase();
  const assistantText = messages.filter(m => m.role === 'assistant').map(m => m.content).join(' ').toLowerCase();

  // Phone: look for number patterns
  const hasPhone = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/.test(userText);

  // Business name: agent confirmed it (Updated ✓ in assistant text) or user gave substantial first message
  const hasBusinessName = assistantText.includes('updated') && (assistantText.includes('business name') || assistantText.includes('set up as')) || messages.filter(m => m.role === 'user').length >= 1;

  // Industry: service type mentioned
  const hasIndustry = /landscap|hvac|plumb|electr|paint|clean|roof|carpet|pest|window|fence|concrete|handyman|contractor|lawn|tree|snow|pressure|hauling|moving|flooring|tile|remodel|construct|mechanic|auto|pool|spa|septic|well|drain|sewer|stucco|insul|solar|gutter|siding|drywall/.test(userLower);

  // Location: city/state pattern or confirmed by agent
  const hasLocation = /,\s*[a-zA-Z]{2}/.test(userText) || /pa|nj|ny|ca|tx|fl|oh|il|ga|va|md|nc|sc|mi|wi|mn|mo|co|az|wa|or/.test(userLower) || (assistantText.includes('location') && assistantText.includes('updated'));

  // Services: 3+ service words or commas suggesting a list
  const serviceMatches = userText.match(/install|repair|mainten|service|replac|inspect|clean|maintain|emergen|diagnos|troubleshoot|design|build|construct|landscap|mow|trim|prune|plant|sod|mulch|haul|demo|paint|prime|stain|seal|pressure|wash|gutter|roof|shingle|tile|floor|drywall|fence|deck|patio|porch|remodel|renovat/gi) || [];
  const commaCount = (userText.match(/,/g) || []).length;
  const hasServices = serviceMatches.length >= 2 || commaCount >= 2;

  // Areas: 2+ area mentions
  const areaMatches = userText.match(/[A-Z][a-z]{2,}(?:\s[A-Z][a-z]+)?(?:\s*,|\s+and\s)/g) || [];
  const hasAreas = areaMatches.length >= 1 || /surround|county|area|region|nearby|township|borough/.test(userLower) || commaCount >= 2;

  // Years in business
  const hasYears = /\d+\s*(?:year|yr)s?|since\s*\d{4}|founded\s*\d{4}|started\s*\d{4}|been\s*(?:in business\s*)?\d+|operating\s*(?:for\s*)?\d+/.test(userLower) || (assistantText.includes('year') && assistantText.includes('updated'));

  // Licensed/insured
  const hasLicensed = /licens|insur|bonded|certif/.test(userLower) || (assistantText.includes('licensed') && assistantText.includes('updated'));

  // Hours
  const hasHours = /\d{1,2}\s*(?:am|pm|a\.m|p\.m)|open|hour|available\s*7|24\/7|monday|tuesday|daily|weekday|weekend|flexible|by\s*appoint/.test(userLower) || (assistantText.includes('hour') && assistantText.includes('updated'));

  return { businessName: hasBusinessName, phone: hasPhone, industry: hasIndustry, location: hasLocation, services: hasServices, areas: hasAreas, yearsInBusiness: hasYears, licensed: hasLicensed, hours: hasHours };
}

// Analyze what required info has been collected
router.get('/collected/website', requireAuth, async (req, res) => {
  try {
    const { data: history } = await supabase
      .from('conversations')
      .select('role, content')
      .eq('client_id', req.user.id)
      .eq('agent_type', 'website')
      .order('created_at', { ascending: true })
      .limit(50);

    if (!history || history.length === 0) {
      return res.json({ collected: {} });
    }

    const { callClaude } = require('../utils/anthropic');
    const conversationText = history.map(m => m.role.toUpperCase() + ': ' + m.content).join('\n\n');

    // Fast keyword-based detection on user messages only
    const userMessages = history.filter(m => m.role === 'user').map(m => m.content).join(' ');
    const userLower = userMessages.toLowerCase();
    const allLower = history.map(m => m.content).join(' ').toLowerCase();
    
    // Phone regex
    const hasPhone = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(userMessages);
    
    // Check for years in business
    const hasYears = /\d+\s*(year|yr)|(been|since|founded|started|operating|in business)\s*(for\s*)?\d+|\d{4}\s*(to|-)/.test(userLower);
    
    // Check for licensed/insured
    const hasLicensed = /licens|insur|bonded|certif/.test(userLower);
    
    // Check for hours
    const hasHours = /hour|open|close|available|monday|tuesday|7\s*day|24\/7|am|pm|a\.m|p\.m/.test(userLower);
    
    // Check for location
    const hasLocation = /,\s*[a-z]{2}\b|pennsylvania|new york|new jersey|florida|california|texas|ohio|wayne|philadelphia|\bpa\b|\bnj\b|\bny\b/.test(userLower) || userLower.length > 50;
    
    // Check for services (3+) - look for lists or multiple service mentions
    const serviceWords = userMessages.match(/(?:install|repair|maintenance|service|cleaning|landscap|mow|trim|paint|plumb|electr|hvac|heat|cool|roof|carpet|window|pressure|hauling|demo|concrete|fence|deck|patio|gutter|siding|drywall|tile|flooring|remodel)/gi) || [];
    const hasServices = serviceWords.length >= 2 || (userLower.match(/,/g) || []).length >= 2;
    
    // Check for areas (2+)
    const hasAreas = (userMessages.match(/[A-Z][a-z]+(?:,|\sand\s)/g) || []).length >= 1 || /surround|county|area|region|nearby|neighboring/.test(userLower);
    
    // Check for industry
    const hasIndustry = /landscap|hvac|plumb|electr|paint|clean|roof|carpet|pest|window|fence|concrete|masonry|handyman|contractor|lawn|tree|snow|pressure|hauling|moving|flooring|tile|remodel|construct/.test(userLower) || userMessages.length > 30;
    
    // Check for business name (any substantial user message counts)
    const hasBusinessName = userMessages.length > 10;
    
    const collected = {
      businessName: hasBusinessName,
      phone: hasPhone,
      industry: hasIndustry,
      location: hasLocation,
      services: hasServices,
      areas: hasAreas,
      yearsInBusiness: hasYears,
      licensed: hasLicensed,
      hours: hasHours
    };
    
    res.json({ collected });
  } catch (err) {
    console.error('Collected check error:', err.message);
    res.json({ collected: {} });
  }
});

module.exports = router;
