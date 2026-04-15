const supabase = require('../utils/supabase');
const { callClaude } = require('../utils/anthropic');

async function runWeeklyPerformanceReview() {
  try {
    // Get all active clients
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('status', 'active');

    if (!clients || clients.length === 0) return;

    for (const client of clients) {
      await reviewClientPerformance(client);
    }

    console.log(`Weekly review completed for ${clients.length} clients`);
  } catch (err) {
    console.error('Performance review error:', err);
  }
}

async function reviewClientPerformance(client) {
  try {
    // Get recent metrics
    const { data: metrics } = await supabase
      .from('metrics')
      .select('*')
      .eq('client_id', client.id)
      .order('recorded_at', { ascending: false })
      .limit(50);

    // Get recent agent logs
    const { data: logs } = await supabase
      .from('agent_logs')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(100);

    // Get recent conversations
    const { data: conversations } = await supabase
      .from('conversations')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const metricsStr = JSON.stringify(metrics || []);
    const logsStr = JSON.stringify(logs || []);

    const review = await callClaude(
      `You are a performance optimization agent for a digital marketing agency. 
       Analyze the client's metrics and agent activity logs and provide:
       1. What is working well (specific data points)
       2. What needs improvement (with specific recommendations)
       3. Priority actions for the next week for each active agent
       4. Any concerning trends that need immediate attention
       Be specific, data-driven, and actionable. Keep it concise.`,
      `Client: ${client.business_name}, Industry: ${client.industry}, Location: ${client.location}
       Subscription: ${client.subscription_tier}
       Recent metrics: ${metricsStr}
       Recent agent activity: ${logsStr}
       Provide weekly performance review and optimization recommendations.`
    );

    // Save the review
    await supabase.from('agent_logs').insert({
      client_id: client.id,
      agent_type: 'performance',
      action: 'weekly_review',
      outcome: 'completed',
      notes: review
    });

    // Save as a deliverable for the client to see
    await supabase.from('deliverables').insert({
      client_id: client.id,
      agent_type: 'performance',
      deliverable_type: 'weekly_report',
      status: 'completed',
      data: { review, generatedAt: new Date().toISOString() }
    });

    console.log(`Review completed for ${client.business_name}`);
  } catch (err) {
    console.error(`Review error for client ${client.id}:`, err);
  }
}

module.exports = { runWeeklyPerformanceReview, reviewClientPerformance };
