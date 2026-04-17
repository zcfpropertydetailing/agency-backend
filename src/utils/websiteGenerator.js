const { callClaude } = require('../utils/anthropic');
const fs = require('fs');
const path = require('path');

const TEMPLATES = {
  service: fs.readFileSync(path.join(__dirname, '../../templates/service_template.html'), 'utf8'),
  luxury: fs.readFileSync(path.join(__dirname, '../../templates/luxury_template.html'), 'utf8'),
  minimal: fs.readFileSync(path.join(__dirname, '../../templates/minimal_template.html'), 'utf8')
};

const TEMPLATE_STYLES = {
  service: 'Bold industrial — Bebas Neue + DM Sans, dark navy/charcoal + gold accent, trust bar, high-contrast. Best for: trades, emergency services, straightforward service businesses that compete on reliability and speed.',
  luxury: 'Editorial premium — Cormorant Garamond serif + Inter, cream + charcoal + gold, generous whitespace, magazine-style layout. Best for: custom builders, high-end designers, bespoke services, architects, fine craftsmanship.',
  minimal: 'Swiss modern — Inter sans-serif, white + black + bold accent color, rounded cards, massive typography, tech-forward. Best for: modern cleaning services, tech-adjacent trades, newer brands, clean energy, service businesses wanting a fresh feel.'
};

async function generateWebsite(clientData) {
  const { businessName, industry, location, phone, services, areas, hours } = clientData;

  const serviceList = Array.isArray(services) && services.length > 0
    ? services.slice(0, 8)
    : [industry + ' Installation', industry + ' Repair', industry + ' Maintenance', 'Emergency Service'];

  const areaList = Array.isArray(areas) && areas.length > 0
    ? areas.slice(0, 12)
    : [location];

  const phoneRaw = (phone || '').replace(/\D/g, '');
  const ctx = clientData.conversationContext
    ? '\nCONVERSATION:\n' + clientData.conversationContext.substring(0, 2000)
    : '';

  // Let the client or the AI pick the template
  let templateKey = clientData.template;
  if (!templateKey || !TEMPLATES[templateKey]) {
    templateKey = await pickTemplate(businessName, industry, ctx);
  }

  console.log(`Using template: ${templateKey} for ${businessName}`);

  const prompt = `Generate content for a ${industry} business website. Return ONLY valid JSON, no markdown, no backticks.

Business: ${businessName}, ${location}. Phone: ${phone}. Services: ${serviceList.join(', ')}. Areas: ${areaList.join(', ')}. Hours: ${hours || 'Available 7 Days a Week'}.${ctx}

Template style: ${TEMPLATE_STYLES[templateKey]}

Return this exact JSON structure with all fields filled in:
{
  "metaDescription": "2 sentence SEO description",
  "logoName": "2-3 word logo name",
  "logoInitial": "single letter or ampersand for logo mark",
  "heroHeadline": "3-5 WORD HEADLINE",
  "heroSubheadline": "3-4 word completion of the headline",
  "heroDescription": "2 sentence value proposition",
  "established": "year founded like 2010",
  "year": "2026",
  "founderName": "plausible first last name",
  "responseTime": "Same-Day",
  "stat1Num": "500+", "stat1Label": "Jobs Completed",
  "stat2Num": "15+", "stat2Label": "Years Experience",
  "stat3Num": "5.0★", "stat3Label": "Average Rating",
  "stat4Num": "100%", "stat4Label": "Satisfaction",
  "servicesHeadlinePart1": "First half of services headline",
  "servicesHeadlinePart2": "second half of services headline (italicized/muted)",
  "servicesSubtext": "1-2 sentence description",
  "serviceCards": [{"icon":"🔧","name":"Service Name","description":"2 sentence description"}],
  "years": "10",
  "aboutHeadlinePart1": "first half of about headline",
  "aboutHeadlinePart2": "second half (italicized/muted)",
  "aboutP1": "3 sentence business story",
  "aboutP2": "2 sentence commitment statement",
  "philosophyQuote": "A 1 sentence brand philosophy quote",
  "feature2": "Fast response time",
  "feature3": "Upfront honest pricing",
  "feature4": "Satisfaction guaranteed",
  "fastLabel": "Fast Response", "fastDesc": "Same-day service available",
  "heroTestimonialText": "A longer hero testimonial quote (2 sentences)",
  "heroTestimonialAuthor": "Full Name",
  "heroTestimonialDetail": "Service, Location",
  "testimonials": [{"text":"2-3 sentence review","author":"First L.","detail":"Service, City"}],
  "miniTestimonials": [{"text":"1-2 sentence short testimonial","author":"Name Initial."}],
  "contactIntro": "2 sentence contact CTA",
  "footerDesc": "1 sentence footer tagline",
  "accentColorHex": "#e8a020"
}

Exactly 6 serviceCards. Exactly 3 testimonials. Exactly 2 miniTestimonials. All content specific to ${businessName} in ${location}. Use real, believable content — no placeholders.`;

  let content;
  try {
    const raw = await callClaude('Return only valid JSON. No markdown. No backticks.', prompt, 3500);
    const cleaned = raw.replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim();
    content = JSON.parse(cleaned);
  } catch(e) {
    console.log('Using defaults due to parse error:', e.message);
    content = getDefaults(businessName, industry, location, serviceList);
  }

  return fillTemplate(TEMPLATES[templateKey], content, {
    businessName, industry, location, phone, phoneRaw, hours, serviceList, areaList
  }, templateKey);
}

async function pickTemplate(businessName, industry, ctx) {
  try {
    const prompt = `Pick the best template for this business. Respond with ONE WORD ONLY: "service", "luxury", or "minimal".

Business: ${businessName} (${industry})
Template options:
- service: Bold industrial style. Best for trades, emergency services, plumbing, HVAC, electrical, roofing. Competes on reliability.
- luxury: Editorial premium style with serif fonts. Best for custom home builders, high-end designers, architects, bespoke services.
- minimal: Swiss modern clean style. Best for modern cleaning services, tech-adjacent, newer brands, fresh-feeling businesses.
${ctx}

Answer with one word.`;
    const choice = (await callClaude('Respond with one word only.', prompt, 20)).toLowerCase().trim().replace(/[^a-z]/g, '');
    if (TEMPLATES[choice]) return choice;
  } catch(e) { console.log('template pick fallback:', e.message); }
  return 'service';
}

function fillTemplate(template, content, meta, templateKey) {
  const { businessName, industry, location, phone, phoneRaw, hours, serviceList, areaList } = meta;

  const serviceCardsHTML = (content.serviceCards || []).map((s, i) => {
    if (templateKey === 'luxury') {
      return `<div class="service-item fade-in"><div class="service-num">0${i+1} —</div><h3>${s.name}</h3><p>${s.description}</p></div>`;
    }
    if (templateKey === 'minimal') {
      return `<div class="service fade-in"><div class="service-icon">${s.icon}</div><div class="service-num">0${i+1} / 0${content.serviceCards.length}</div><h3>${s.name}</h3><p class="service-desc">${s.description}</p></div>`;
    }
    return `<div class="service-card fade-in"><div class="service-icon">${s.icon}</div><h3>${s.name}</h3><p>${s.description}</p></div>`;
  }).join('\n');

  const testimonialsHTML = (content.testimonials || []).map(t => {
    if (templateKey === 'minimal') {
      const initial = (t.author || 'A').charAt(0).toUpperCase();
      return `<div class="test-card fade-in"><div class="test-stars">★★★★★</div><p class="test-text">"${t.text}"</p><div class="test-author"><div class="test-avatar">${initial}</div><div class="test-info"><div class="test-name">${t.author}</div><div class="test-detail">${t.detail}</div></div></div></div>`;
    }
    return `<div class="testimonial-card fade-in"><div class="stars">★★★★★</div><p class="testimonial-text">"${t.text}"</p><div class="testimonial-author">${t.author}</div><div class="testimonial-detail">${t.detail}</div></div>`;
  }).join('\n');

  const miniTestimonialsHTML = (content.miniTestimonials || []).map(t =>
    `<div><div class="mini-test">"${t.text}"</div><div class="mini-test-author">— ${t.author}</div></div>`
  ).join('\n');

  // Areas - different formats per template
  let areaTags;
  if (templateKey === 'luxury') {
    areaTags = areaList.map(a => `<span>${a}</span>`).join('\n');
  } else if (templateKey === 'minimal') {
    areaTags = areaList.map(a => `<div class="area"><div class="area-dot"></div>${a}</div>`).join('\n');
  } else {
    areaTags = areaList.map(a => `<div class="area-tag">${a}</div>`).join('\n');
  }

  const serviceOptions = ['<option value="">Select a service...</option>'].concat(serviceList.map(s => `<option>${s}</option>`)).join('\n');
  const footerServices = serviceList.slice(0,5).map(s => `<li><a href="#services">${s}</a></li>`).join('\n');

  const logoName = content.logoName || businessName.split(' ').slice(0,2).join(' ');
  const logoInitial = content.logoInitial || logoName.charAt(0).toUpperCase();

  return template
    .replace(/{{BUSINESS_NAME}}/g, businessName)
    .replace(/{{INDUSTRY}}/g, industry)
    .replace(/{{LOCATION}}/g, location)
    .replace(/{{PHONE}}/g, phone || '(000) 000-0000')
    .replace(/{{PHONE_RAW}}/g, phoneRaw)
    .replace(/{{META_DESCRIPTION}}/g, content.metaDescription || '')
    .replace(/{{PRIMARY_COLOR}}/g, '#0a0a0a')
    .replace(/{{ACCENT_COLOR}}/g, content.accentColorHex || '#e8a020')
    .replace(/{{LOGO_NAME}}/g, logoName)
    .replace(/{{LOGO_INITIAL}}/g, logoInitial)
    .replace(/{{HERO_HEADLINE}}/g, content.heroHeadline || `Expert ${industry}`)
    .replace(/{{HERO_SUBHEADLINE}}/g, content.heroSubheadline || 'Services You Can Trust')
    .replace(/{{HERO_DESCRIPTION}}/g, content.heroDescription || '')
    .replace(/{{RESPONSE_TIME}}/g, content.responseTime || 'Same-Day')
    .replace(/{{STAT1_NUM}}/g, content.stat1Num || '500+')
    .replace(/{{STAT1_LABEL}}/g, content.stat1Label || 'Jobs Completed')
    .replace(/{{STAT2_NUM}}/g, content.stat2Num || '10+')
    .replace(/{{STAT2_LABEL}}/g, content.stat2Label || 'Years Experience')
    .replace(/{{STAT3_NUM}}/g, content.stat3Num || '5★')
    .replace(/{{STAT3_LABEL}}/g, content.stat3Label || 'Average Rating')
    .replace(/{{STAT4_NUM}}/g, content.stat4Num || '100%')
    .replace(/{{STAT4_LABEL}}/g, content.stat4Label || 'Satisfaction')
    .replace(/{{SERVICES_HEADLINE}}/g, content.servicesHeadlinePart1 || 'Our Services')
    .replace(/{{SERVICES_HEADLINE_PART1}}/g, content.servicesHeadlinePart1 || 'Our services')
    .replace(/{{SERVICES_HEADLINE_PART2}}/g, content.servicesHeadlinePart2 || 'and what we do best.')
    .replace(/{{SERVICES_SUBTEXT}}/g, content.servicesSubtext || '')
    .replace(/{{SERVICES_CARDS}}/g, serviceCardsHTML)
    .replace(/{{YEARS}}/g, content.years || '10')
    .replace(/{{ESTABLISHED}}/g, content.established || '2015')
    .replace(/{{YEAR}}/g, content.year || '2026')
    .replace(/{{FOUNDER_NAME}}/g, content.founderName || 'The Team')
    .replace(/{{ABOUT_HEADLINE}}/g, (content.aboutHeadlinePart1 || '') + ' ' + (content.aboutHeadlinePart2 || ''))
    .replace(/{{ABOUT_HEADLINE_PART1}}/g, content.aboutHeadlinePart1 || 'Your Trusted Local')
    .replace(/{{ABOUT_HEADLINE_PART2}}/g, content.aboutHeadlinePart2 || `${industry} Experts.`)
    .replace(/{{ABOUT_P1}}/g, content.aboutP1 || '')
    .replace(/{{ABOUT_P2}}/g, content.aboutP2 || '')
    .replace(/{{PHILOSOPHY_QUOTE}}/g, content.philosophyQuote || 'Quality work and honest service — every time.')
    .replace(/{{FEATURE2}}/g, content.feature2 || 'Fast response times')
    .replace(/{{FEATURE3}}/g, content.feature3 || 'Upfront honest pricing')
    .replace(/{{FEATURE4}}/g, content.feature4 || 'Satisfaction guaranteed')
    .replace(/{{FAST_LABEL}}/g, content.fastLabel || 'Fast Response')
    .replace(/{{FAST_DESC}}/g, content.fastDesc || 'Available when you need us')
    .replace(/{{HERO_TESTIMONIAL_TEXT}}/g, content.heroTestimonialText || '')
    .replace(/{{HERO_TESTIMONIAL_AUTHOR}}/g, content.heroTestimonialAuthor || '')
    .replace(/{{HERO_TESTIMONIAL_DETAIL}}/g, content.heroTestimonialDetail || '')
    .replace(/{{TESTIMONIALS}}/g, testimonialsHTML)
    .replace(/{{MINI_TESTIMONIALS}}/g, miniTestimonialsHTML)
    .replace(/{{AREA_TAGS}}/g, areaTags)
    .replace(/{{AREA_ITEMS}}/g, areaTags)
    .replace(/{{AREA_CARDS}}/g, areaTags)
    .replace(/{{CONTACT_INTRO}}/g, content.contactIntro || '')
    .replace(/{{HOURS}}/g, hours || 'Available 7 Days a Week')
    .replace(/{{SERVICE_OPTIONS}}/g, serviceOptions)
    .replace(/{{FOOTER_DESC}}/g, content.footerDesc || '')
    .replace(/{{FOOTER_SERVICES}}/g, footerServices);
}

function getDefaults(businessName, industry, location, services) {
  return {
    metaDescription: `Professional ${industry} services in ${location}. Licensed & Insured.`,
    logoName: businessName.split(' ').slice(0,2).join(' '),
    logoInitial: businessName.charAt(0).toUpperCase(),
    heroHeadline: `EXPERT ${industry.toUpperCase()}`,
    heroSubheadline: 'Services You Can Trust',
    heroDescription: `Professional ${industry} services in ${location}. Licensed and insured.`,
    established: '2015', year: '2026', founderName: 'The Team',
    responseTime: 'Same-Day',
    stat1Num: '500+', stat1Label: 'Jobs Completed',
    stat2Num: '10+', stat2Label: 'Years Experience',
    stat3Num: '5★', stat3Label: 'Average Rating',
    stat4Num: '100%', stat4Label: 'Satisfaction',
    servicesHeadlinePart1: `Complete ${industry}`, servicesHeadlinePart2: 'services, done right.',
    servicesSubtext: `Everything you need from a trusted local ${industry} company.`,
    serviceCards: services.map(s => ({icon:'🔧', name:s, description:`Professional ${s.toLowerCase()} in ${location}.`})),
    years: '10',
    aboutHeadlinePart1: 'Your trusted local', aboutHeadlinePart2: `${industry} experts.`,
    aboutP1: `${businessName} has been proudly serving ${location} with professional ${industry} services.`,
    aboutP2: `We are committed to providing the highest quality service at fair prices.`,
    philosophyQuote: 'Quality work. Honest prices. Every time.',
    feature2: 'Fast response times', feature3: 'Upfront pricing', feature4: 'Guaranteed satisfaction',
    fastLabel: 'Fast Response', fastDesc: 'Available when you need us',
    heroTestimonialText: `${businessName} was professional from start to finish. Couldn't ask for better service.`,
    heroTestimonialAuthor: 'Sarah M.', heroTestimonialDetail: `${industry} Customer, ${location}`,
    testimonials: [
      {text:`Excellent service from ${businessName}. Professional and fair pricing.`, author:'John S.', detail:`${industry}, ${location}`},
      {text:`Very impressed with the quality of work. Highly recommend!`, author:'Sarah M.', detail:`${industry}, ${location}`},
      {text:`Best ${industry} company in ${location}. Will use again.`, author:'Mike R.', detail:`${industry}, ${location}`}
    ],
    miniTestimonials: [
      {text: 'Reliable, professional, and reasonably priced.', author: 'Emma T.'},
      {text: 'Wouldn\'t use anyone else in the area.', author: 'David L.'}
    ],
    contactIntro: `Contact us today for a free estimate. Serving ${location} and surrounding areas.`,
    footerDesc: `Your trusted local ${industry} experts.`,
    accentColorHex: '#e8a020'
  };
}

module.exports = { generateWebsite };
