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

    // For website agent, check what's been collected (only until all 9 confirmed)
    let collected = null;
    if (agentType === 'website') {
      // Check if all 9 were already confirmed in a previous message
      const { data: lastLog } = await supabase
        .from('agent_logs')
        .select('notes')
        .eq('client_id', req.user.id)
        .eq('agent_type', 'website')
        .eq('action', 'checklist_complete')
        .limit(1);

      if (lastLog && lastLog.length > 0) {
        // Already complete — return the stored result without calling Claude
        collected = JSON.parse(lastLog[0].notes);
      } else {
        const fullHistory = [...(history || []),
          { role: 'user', content: message },
          { role: 'assistant', content: reply }
        ];
        collected = await checkCollected(fullHistory);

        // If all 9 are now complete, save so we never check again
        const allDone = Object.values(collected).every(v => v === true);
        if (allDone) {
          await supabase.from('agent_logs').insert({
            client_id: req.user.id,
            agent_type: 'website',
            action: 'checklist_complete',
            outcome: 'success',
            notes: JSON.stringify(collected)
          });
        }
      }
    }

    res.json({ reply, collected });
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
  
  const conversationText = messages
    .map(m => m.role.toUpperCase() + ': ' + m.content)
    .join('\n\n')
    .substring(0, 3000);

  const prompt = `Read this website onboarding conversation and determine which of 9 items the client has confirmed. Be generous — if the agent confirmed receiving something with "Updated ✓" or similar, mark it true.

CONVERSATION:
${conversationText}

Return ONLY this JSON, no explanation:
{
  "businessName": true/false,
  "phone": true/false,
  "industry": true/false,
  "location": true/false,
  "services": true/false,
  "areas": true/false,
  "yearsInBusiness": true/false,
  "licensed": true/false,
  "hours": true/false
}

Rules:
- businessName: true if client stated their business name and agent acknowledged it
- phone: true if a phone number was provided
- industry: true if the type of business/service was stated
- location: true if a city or location was stated
- services: true if 3 or more services were listed
- areas: true if service areas were mentioned (even "surrounding areas" counts)
- yearsInBusiness: true if years in business was stated (any number of years)
- licensed: true if licensed/insured status was confirmed (yes counts)
- hours: true if business hours were stated in any form`;

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
