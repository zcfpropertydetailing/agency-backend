const { callClaude } = require('../utils/anthropic');

async function generateWebsite(clientData) {
  const {
    businessName, industry, location, phone, email,
    services, areas, colors, tagline
  } = clientData;

  const accentColor = colors?.accent || '#e8a020';
  const primaryColor = colors?.primary || '#0f172a';
  const serviceList = Array.isArray(services) && services.length > 0
    ? services.slice(0, 8).join(', ')
    : industry + ' installation, repair, maintenance';
  const areaList = Array.isArray(areas) && areas.length > 0
    ? areas.slice(0, 8).join(', ')
    : location;

  const businessInfo = `
Business Name: ${businessName}
Industry: ${industry}
Location: ${location}
Phone: ${phone || '(000) 000-0000'}
Email: ${email || 'info@business.com'}
Services: ${serviceList}
Service Areas: ${areaList}
Tagline: ${tagline || 'Professional ' + industry + ' Services in ' + location}
Primary Color: ${primaryColor}
Accent Color: ${accentColor}
  `.trim();

  // Step 1: Generate CSS + structure
  const cssPrompt = `Generate the complete CSS styles and HTML head section for a professional local business website.

${businessInfo}

Output a complete <head> section followed by a <style> tag with ALL CSS needed for the full website.
Include styles for: nav, hero, trust-bar, services grid, about, testimonials, service-areas, contact form, footer.
Use Google Fonts (Barlow Condensed + Barlow). 
Primary background: ${primaryColor}. Accent: ${accentColor}.
Make it professional, modern, mobile-responsive with hamburger menu.
Output ONLY the HTML from <!DOCTYPE html> through </style> - nothing else.`;

  // Step 2: Generate body content
  const bodyPrompt = `Generate the complete HTML body content for a professional ${industry} business website.

${businessInfo}

Output ONLY the <body> tag and all its contents including:
1. <nav> - sticky navigation with logo and links, hamburger for mobile
2. <section id="hero"> - compelling headline, subheadline, Call Now + Get Quote buttons
3. <section id="trust"> - trust bar: Licensed & Insured, 5-Star Rated, 24/7 Available, Local Experts
4. <section id="services"> - 6 service cards with icons and descriptions
5. <section id="about"> - company story, 3 paragraphs, photo placeholder
6. <section id="testimonials"> - 3 detailed customer reviews with 5 stars
7. <section id="areas"> - service areas grid
8. <section id="contact"> - contact form + phone + hours + map placeholder
9. <footer> - logo, links, social, copyright
10. <script> - hamburger menu toggle, smooth scroll, scroll animations

Use realistic content specific to ${businessName} in ${location}. No placeholder text.
Output ONLY from <body> to </body>.`;

  // Step 3: Generate JS
  const jsPrompt = `Generate a complete inline JavaScript for a ${industry} business website.
Include: mobile hamburger menu toggle, smooth scrolling, intersection observer animations, sticky nav on scroll, phone click tracking.
Output ONLY a <script> tag with all the JavaScript.`;

  console.log(`Generating website for ${businessName} in 3 parts...`);

  const [headAndCSS, bodyContent, extraJS] = await Promise.all([
    callClaude('You are a CSS expert. Output only raw HTML/CSS code, no markdown.', cssPrompt, 6000),
    callClaude('You are an HTML expert. Output only raw HTML, no markdown, use real content not placeholders.', bodyPrompt, 8000),
    callClaude('You are a JavaScript expert. Output only a <script> tag with JavaScript, no markdown.', jsPrompt, 2000)
  ]);

  // Clean each part
  const cleanPart = (text) => text
    .replace(/^```html\n?/m, '')
    .replace(/^```\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();

  const cleanedHead = cleanPart(headAndCSS);
  const cleanedBody = cleanPart(bodyContent);
  const cleanedJS = cleanPart(extraJS);

  // Combine - ensure proper structure
  let html = cleanedHead;

  // If head doesn't include opening body tag, add body
  if (!html.includes('<body')) {
    html += '\n<body>';
  }

  // Add body content
  if (cleanedBody.startsWith('<body')) {
    html += '\n' + cleanedBody;
  } else {
    html += '\n' + cleanedBody + '\n</body>';
  }

  // Add extra JS before closing html if not already in body
  if (!html.includes('</html>')) {
    html += '\n' + cleanedJS + '\n</body>\n</html>';
  }

  return html;
}

module.exports = { generateWebsite };
