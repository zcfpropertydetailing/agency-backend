const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');

// Register new client
router.post('/register', async (req, res) => {
  const { email, password, businessName, industry, location, phone, subscriptionTier } = req.body;

  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) throw authError;

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert({
        id: authData.user.id,
        email,
        business_name: businessName,
        industry,
        location,
        phone,
        subscription_tier: subscriptionTier || 'bundle',
        status: 'active'
      })
      .select()
      .single();

    if (clientError) throw clientError;

    res.json({ success: true, client });
  } catch (err) {
    console.error('Register error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({ success: true, session: data.session, client });
  } catch (err) {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const { data: { user } } = await supabase.auth.getUser(token);
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', user.id)
      .single();

    res.json({ user, client });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
