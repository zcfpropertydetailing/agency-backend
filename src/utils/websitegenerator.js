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
 
  const prompt = `You are an elite web designer. Generate a COMPLETE, production-grade, single-file HTML website for the following business. The website must be world-class quality — comparable to sites charging $10,000+. It must look genuinely custom, not like a template.
 
BUSINESS DETAILS:
- Business Name: ${businessName}
- Industry: ${industry}
- Location: ${location}
- Phone: ${phone || '(000) 000-0000'}
- Email: ${email || 'info@business.com'}
- Tagline: ${tagline || 'Professional ' + industry + ' Services'}
- Description: ${description || 'Professional ' + industry + ' services in ' + location}
- Services: ${serviceList}
- Service Areas: ${areaList}
- Hours: ${hours || 'Mon-Fri 7am-7pm, Sat 8am-4pm, 24/7 Emergency'}
- Certifications: ${certifications || 'Licensed & Insured'}
- Founded: ${founded || ''}
- Testimonials: ${JSON.stringify(testimonials || [])}
- Primary Color: ${primaryColor}
- Accent Color: ${accentColor}
 
DESIGN REQUIREMENTS:
1. Use Google Fonts — choose fonts that are distinctive and match the industry character
2. Full responsive design — perfect on mobile, tablet, desktop
3. Sticky navigation with smooth scroll
4. Hero section with compelling headline, subheadline, and TWO CTAs (call now + get quote)
5. Trust bar with key credibility points (licensed, insured, years in business, satisfaction guarantee)
6. Services section with cards for each service
7. About section with business story
8. Testimonials section (use provided ones or generate realistic ones)
9. Service areas section
10. Contact section with form and business info
11. Footer with all details
12. CSS animations on scroll (use Intersection Observer)
13. Mobile hamburger menu
14. Click-to-call phone number
15. Contact form (use Formspree action placeholder)
16. Schema markup for local business SEO
17. Meta tags for SEO
18. Fast loading — inline all CSS, no external dependencies except Google Fonts
 
AESTHETIC DIRECTION for ${industry}:
- Choose a visual style that fits the industry perfectly
- Use the primary color ${primaryColor} and accent color ${accentColor}
- Make it feel premium and trustworthy
- Strong typography hierarchy
- Clean but not sterile
 
Output ONLY the complete HTML file starting with <!DOCTYPE html> — nothing else, no explanation, no markdown code blocks.`;
 
  const html = await callClaude(
    'You are an elite web designer who writes complete, production-grade HTML/CSS/JS websites. Output only raw HTML code, nothing else.',
    prompt,
    8000
  );
 
  // Clean the response in case Claude adds markdown
  return html
    .replace(/^```html\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}
 
module.exports = { generateWebsite };
 
