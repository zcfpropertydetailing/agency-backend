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

module.exports = router;
