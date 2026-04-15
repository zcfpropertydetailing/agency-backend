const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');
const { requireAuth } = require('../middleware/auth');

// Get client profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;
    res.json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update client profile
router.put('/profile', requireAuth, async (req, res) => {
  const { businessName, industry, location, phone } = req.body;

  try {
    const { data, error } = await supabase
      .from('clients')
      .update({ business_name: businessName, industry, location, phone })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get client deliverables
router.get('/deliverables', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('deliverables')
      .select('*')
      .eq('client_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get client metrics
router.get('/metrics', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('metrics')
      .select('*')
      .eq('client_id', req.user.id)
      .order('recorded_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update subscription tier
router.put('/subscription', requireAuth, async (req, res) => {
  const { tier } = req.body;
  const validTiers = ['website', 'social', 'gbp', 'ads', 'bundle'];

  if (!validTiers.includes(tier)) {
    return res.status(400).json({ error: 'Invalid subscription tier' });
  }

  try {
    const { data, error } = await supabase
      .from('clients')
      .update({ subscription_tier: tier })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
