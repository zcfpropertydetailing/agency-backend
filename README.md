# Agency Backend

Production-grade AI agency backend with 4 autonomous agents.

## Agents
- **Website Agent** — builds and manages client websites
- **Social Media Agent** — manages Facebook and Instagram
- **Google Business Profile Agent** — manages GBP listings
- **Ads Agent** — runs Google and Meta ad campaigns

## Stack
- Node.js + Express
- Supabase (database + auth)
- Anthropic Claude API
- Railway (hosting)

## Environment Variables
See Railway dashboard for all environment variables.

## Endpoints
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- GET /api/clients/profile
- PUT /api/clients/profile
- GET /api/clients/deliverables
- GET /api/clients/metrics
- POST /api/agents/chat
- GET /api/agents/history/:agentType
- GET /api/agents/access
- GET /api/metrics/summary
