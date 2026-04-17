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

    // (reply saved above with STATUS stripped)

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

    // Parse STATUS tag from reply for website agent
    let collected = null;
    let cleanReply = reply;
    
    if (agentType === 'website') {
      const statusMatch = reply.match(/\[STATUS:(\{[^}]+\})\]/);
      if (statusMatch) {
        try {
          collected = JSON.parse(statusMatch[1]);
          // Strip the STATUS tag from the stored and displayed reply
          cleanReply = reply.replace(/\[STATUS:\{[^}]+\}\]/, '').trim();
        } catch(e) {
          console.log('STATUS parse error:', e.message);
        }
      }
    }

    // Save assistant reply (without STATUS tag)
    await supabase.from('conversations').insert({
      client_id: req.user.id,
      agent_type: agentType,
      role: 'assistant',
      content: cleanReply
    });

    res.json({ reply: cleanReply, collected });
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

// Claude-powered collected check — reliable context-aware detection
async function checkCollected(messages) {
  const { callClaude } = require('../utils/anthropic');
  
  // Only look at user messages for what they've provided
  const userMessages = messages
    .filter(m => m.role === 'user')
    .map(m => 'CLIENT: ' + m.content)
    .join('\n\n')
    .substring(0, 2000);

  // Also include agent confirmations (Updated ✓ lines only)
  const agentConfirmations = messages
    .filter(m => m.role === 'assistant')
    .map(m => m.content)
    .join(' ')
    .split('\n')
    .filter(line => line.includes('Updated') || line.includes('✓') || line.includes('got it') || line.includes('Got it'))
    .join('\n')
    .substring(0, 500);

  const prompt = `Determine which of 9 items this client has explicitly provided. Only mark true if the CLIENT said it or the agent confirmed receiving it.

CLIENT MESSAGES:
${userMessages}

AGENT CONFIRMATIONS:
${agentConfirmations}

Return ONLY this JSON:
{"businessName":false,"phone":false,"industry":false,"location":false,"services":false,"areas":false,"yearsInBusiness":false,"licensed":false,"hours":false}

Rules — mark true ONLY if:
- businessName: client stated their actual business name (not just "my business")
- phone: client gave a phone number with digits
- industry: client stated the type of service/business they do
- location: client stated a city, state, or location
- services: client listed 3 or more specific services
- areas: client mentioned where they serve (cities, counties, or "surrounding areas")
- yearsInBusiness: client stated how many years they have been in business
- licensed: client said they are licensed and/or insured (or said yes when asked)
- hours: client stated their operating hours in any form`;

  try {
    const raw = await callClaude('Return only valid JSON, nothing else.', prompt, 200);
    const cleaned = raw.replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim();
    return JSON.parse(cleaned);
  } catch(e) {
    console.log('checkCollected error:', e.message);
    return { businessName: false, phone: false, industry: false, location: false, services: false, areas: false, yearsInBusiness: false, licensed: false, hours: false };
  }
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
