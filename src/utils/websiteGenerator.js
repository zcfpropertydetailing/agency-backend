const { callClaude } = require('../utils/anthropic');

async function generateWebsite(clientData) {
  const {
    businessName, industry, location, phone, email,
    services, areas, colors, tagline, description,
    testimonials, hours, certifications, founded
  } = clientData;

  const primaryColor = colors?.primary || '#1a1a18';
  const accentColor = colors?.accent || '#e8a020';
  const serviceList = Array.isArray(services) ? services.join(', ') : services || '';
  const areaList = Array.isArray(areas) ? areas.join(', ') : areas || location;

  const conversationContext = clientData.conversationContext ? `\n\nCONVERSATION WITH CLIENT (extract all relevant details):\n${clientData.conversationContext}` : '';

  const prompt = `Generate a COMPLETE, production-grade, single-file HTML website. Must be world-class quality. 

BUSINESS:
- Name: ${businessName}
- Industry: ${industry}  
- Location: ${location}
- Phone: ${phone || '(000) 000-0000'}
- Email: ${email || ''}
- Tagline: ${tagline || 'Professional ' + industry + ' Services'}
- Services: ${serviceList}
- Areas: ${areaList}
- Hours: ${hours || 'Mon-Fri 7-7, Sat 8-4, 24/7 Emergency'}
- Primary Color: ${primaryColor}
- Accent Color: ${accentColor}

REQUIREMENTS:
1. Single HTML file with inline CSS and JS
2. Google Fonts (Barlow Condensed + Barlow recommended)
3. Mobile responsive
4. Sticky nav with hamburger on mobile
5. Hero with headline, subheadline, 2 CTAs (call + quote)
6. Trust bar (Licensed, Insured, years, guarantee)
7. Services section with cards
8. About section
9. 3 testimonials
10. Service areas section
11. Contact form + info
12. Footer
13. Click-to-call phone
14. Schema markup for local business SEO
15. Meta tags

CRITICAL: Output ONLY complete HTML from <!DOCTYPE html> to </html>. No markdown, no backticks, no explanation. Website must be COMPLETE - do not truncate.${conversationContext}`;

  const html = await callClaude(
    'You are an elite web designer. Output only complete raw HTML from <!DOCTYPE html> to </html>. Never truncate. Never use markdown.',
    prompt,
    16000
  );

  return html
    .replace(/^```html\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

module.exports = { generateWebsite };
