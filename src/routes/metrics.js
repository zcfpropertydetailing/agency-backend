const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const supabase = require('../utils/supabase');

// Log a metric
router.post('/', requireAuth, async (req, res) => {
  const { agentType, metricName, metricValue } = req.body;

  try {
    const { data, error } = await supabase
      .from('metrics')
      .insert({
        client_id: req.user.id,
        agent_type: agentType,
        metric_name: metricName,
        metric_value: metricValue
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get summary metrics for dashboard
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('metrics')
      .select('*')
      .eq('client_id', req.user.id)
      .order('recorded_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const summary = {
      website_visitors: 0,
      leads_generated: 0,
      social_reach: 0,
      ad_roas: 0,
      gbp_calls: 0
    };

    data.forEach(m => {
      if (m.metric_name === 'website_visitors') summary.website_visitors = m.metric_value;
      if (m.metric_name === 'leads_generated') summary.leads_generated = m.metric_value;
      if (m.metric_name === 'social_reach') summary.social_reach = m.metric_value;
      if (m.metric_name === 'ad_roas') summary.ad_roas = m.metric_value;
      if (m.metric_name === 'gbp_calls') summary.gbp_calls = m.metric_value;
    });

    res.json(summary);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
