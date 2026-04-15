const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

async function callClaude(systemPrompt, userMessage, maxTokens = 2000) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });
  return response.content.map(b => b.text || '').join('');
}

async function callClaudeWithHistory(systemPrompt, messages, maxTokens = 2000) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages
  });
  return response.content.map(b => b.text || '').join('');
}

module.exports = { anthropic, callClaude, callClaudeWithHistory };
