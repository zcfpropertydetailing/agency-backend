const { callClaude } = require('../utils/anthropic');
const fs = require('fs');
const path = require('path');

const TEMPLATES = {
  service: fs.readFileSync(path.join(__dirname, '../../templates/service_template.html'), 'utf8'),
  luxury: fs.readFileSync(path.join(__dirname, '../../templates/luxury_template.html'), 'utf8'),
  minimal: fs.readFileSync(path.join(__dirname, '../../templates/minimal_template.html'), 'utf8')
};

const TEMPLATE_STYLES = {
  service: 'Bold industrial — Bebas Neue + DM Sans, dark navy/charcoal + gold accent.',
  luxury: 'Editorial premium — Cormorant Garamond serif + Inter, cream + charcoal + gold.',
  minimal: 'Swiss modern — Inter sans-serif, white + black + bold accent.'
};

async function generateWebsite(clientData) {
  const { businessName, industry, location, phone, services, areas, hours } = clientData;

  const serviceList = Array.isArray(services) && services.length > 0
    ? services.slice(0, 8)
    : [industry + ' Installation', industry + ' Repair', industry + ' Maintenance'];

  const areaList = Array.isArray(areas) && areas.length > 0
    ? areas.slice(0, 12)
    : [location];

  const phoneRaw = (phone || '').replace(/\D/g, '');
  const ctx = clientData.conversationContext
    ? '\nCONVERSATION:\n' + clientData.conversationContext.substring(0, 3000)
    : '';

  let templateKey = clientData.template;
  if (!templateKey || !TEMPLATES[templateKey]) {
    templateKey = await pickTemplate(businessName, industry, ctx);
  }

  console.log(`Using template: ${templateKey} for ${businessName}`);

  const prompt = `Generate content for a ${industry} business website using ONLY real information provided by the client. Return ONLY valid JSON, no markdown.

Business: ${businessName}, ${location}. Phone: ${phone}. Services: ${serviceList.join(', ')}. Areas: ${areaList.join(', ')}. Hours: ${hours || 'Not specified'}.${ctx}

Template style: ${TEMPLATE_STYLES[templateKey]}

STRICT RULES FOR CONTENT GENERATION:
- NEVER fabricate statistics, years of experience, job counts, or ratings unless the conversation explicitly provides them
- NEVER invent testimonials — only use real ones from the conversation context
- If client didn't provide stats/testimonials/founder name, use empty string "" — do NOT make them up
- Only use industry-standard trust signals like "Licensed & Insured" (if confirmed)
- Use the EXACT business name, services, areas, phone, hours from above — do not alter them

Return this JSON structure:
{
  "metaDescription": "2 sentence SEO description using real info only",
  "logoName": "2-3 word logo name from business name",
  "logoInitial": "first letter of business name",
  "heroHeadline": "4-5 WORD HEADLINE describing what the business does",
  "heroSubheadline": "3-4 word completion of headline",
  "heroDescription": "2 sentence value proposition using real info only",
  "established": "",
  "year": "2026",
  "founderName": "",
  "responseTime": "Fast",
  "stat1Num": "", "stat1Label": "",
  "stat2Num": "", "stat2Label": "",
  "stat3Num": "", "stat3Label": "",
  "stat4Num": "", "stat4Label": "",
  "servicesHeadlinePart1": "First half of services headline",
  "servicesHeadlinePart2": "second half of services headline",
  "servicesSubtext": "1-2 sentence description of services offered",
  "serviceCards": [{"icon":"🔧","name":"Service Name","description":"2 sentence description of what this service involves"}],
  "years": "",
  "aboutHeadlinePart1": "first half of about headline",
  "aboutHeadlinePart2": "second half",
  "aboutP1": "3 sentence business description — only use info from conversation",
  "aboutP2": "2 sentence commitment to customers — only use info from conversation",
  "philosophyQuote": "",
  "feature2": "Fast response", "feature3": "Honest pricing", "feature4": "Quality guaranteed",
  "fastLabel": "Fast Response", "fastDesc": "Available when you need us",
  "heroTestimonialText": "", "heroTestimonialAuthor": "", "heroTestimonialDetail": "",
  "testimonials": [],
  "miniTestimonials": [],
  "contactIntro": "2 sentence contact CTA",
  "footerDesc": "1 sentence footer tagline using real info",
  "accentColorHex": "#e8a020"
}

If client provided real testimonials in conversation, include them. If they provided years in business, use that for "years". Otherwise leave blank. Fill in exactly 6 serviceCards based on provided services. Use real content only.`;

  let content;
  try {
    const raw = await callClaude('Return only valid JSON. No markdown. No backticks. Never fabricate info.', prompt, 3500);
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
    const prompt = `Pick the best template. Respond with ONE WORD: "service", "luxury", or "minimal".

Business: ${businessName} (${industry})
- service: Trades, emergency services, HVAC, plumbing, electrical, roofing.
- luxury: Custom builders, designers, architects, bespoke services.
- minimal: Cleaning, tech-adjacent, newer brands.
${ctx}`;
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

  // Only render testimonials if real ones exist
  const testimonialsHTML = (content.testimonials && content.testimonials.length > 0)
    ? content.testimonials.map(t => {
        if (templateKey === 'minimal') {
          const initial = (t.author || 'A').charAt(0).toUpperCase();
          return `<div class="test-card fade-in"><div class="test-stars">★★★★★</div><p class="test-text">"${t.text}"</p><div class="test-author"><div class="test-avatar">${initial}</div><div class="test-info"><div class="test-name">${t.author}</div><div class="test-detail">${t.detail}</div></div></div></div>`;
        }
        return `<div class="testimonial-card fade-in"><div class="stars">★★★★★</div><p class="testimonial-text">"${t.text}"</p><div class="testimonial-author">${t.author}</div><div class="testimonial-detail">${t.detail}</div></div>`;
      }).join('\n')
    : '';

  const miniTestimonialsHTML = (content.miniTestimonials && content.miniTestimonials.length > 0)
    ? content.miniTestimonials.map(t =>
        `<div><div class="mini-test">"${t.text}"</div><div class="mini-test-author">— ${t.author}</div></div>`
      ).join('\n')
    : '';

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

  // For empty stats, we need to handle the template to hide the stats section if all empty
  const hasStats = content.stat1Num || content.stat2Num || content.stat3Num;
  const stat1 = content.stat1Num || 'Licensed';
  const stat1Label = content.stat1Label || '& Insured';
  const stat2 = content.stat2Num || 'Local';
  const stat2Label = content.stat2Label || 'Business';
  const stat3 = content.stat3Num || hours ? 'Open' : 'Call';
  const stat3Label = content.stat3Label || (hours ? 'Today' : 'Us Today');
  const stat4 = content.stat4Num || 'Free';
  const stat4Label = content.stat4Label || 'Estimates';

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
    .replace(/{{HERO_SUBHEADLINE}}/g, content.heroSubheadline || 'Services')
    .replace(/{{HERO_DESCRIPTION}}/g, content.heroDescription || '')
    .replace(/{{RESPONSE_TIME}}/g, content.responseTime || 'Fast')
    .replace(/{{STAT1_NUM}}/g, stat1)
    .replace(/{{STAT1_LABEL}}/g, stat1Label)
    .replace(/{{STAT2_NUM}}/g, stat2)
    .replace(/{{STAT2_LABEL}}/g, stat2Label)
    .replace(/{{STAT3_NUM}}/g, stat3)
    .replace(/{{STAT3_LABEL}}/g, stat3Label)
    .replace(/{{STAT4_NUM}}/g, stat4)
    .replace(/{{STAT4_LABEL}}/g, stat4Label)
    .replace(/{{SERVICES_HEADLINE}}/g, content.servicesHeadlinePart1 || 'Our Services')
    .replace(/{{SERVICES_HEADLINE_PART1}}/g, content.servicesHeadlinePart1 || 'Our services')
    .replace(/{{SERVICES_HEADLINE_PART2}}/g, content.servicesHeadlinePart2 || 'and what we offer.')
    .replace(/{{SERVICES_SUBTEXT}}/g, content.servicesSubtext || '')
    .replace(/{{SERVICES_CARDS}}/g, serviceCardsHTML)
    .replace(/{{YEARS}}/g, content.years || '')
    .replace(/{{ESTABLISHED}}/g, content.established || '')
    .replace(/{{YEAR}}/g, content.year || '2026')
    .replace(/{{FOUNDER_NAME}}/g, content.founderName || 'The Team')
    .replace(/{{ABOUT_HEADLINE}}/g, (content.aboutHeadlinePart1 || '') + ' ' + (content.aboutHeadlinePart2 || ''))
    .replace(/{{ABOUT_HEADLINE_PART1}}/g, content.aboutHeadlinePart1 || 'Your Local')
    .replace(/{{ABOUT_HEADLINE_PART2}}/g, content.aboutHeadlinePart2 || `${industry} Team.`)
    .replace(/{{ABOUT_P1}}/g, content.aboutP1 || '')
    .replace(/{{ABOUT_P2}}/g, content.aboutP2 || '')
    .replace(/{{PHILOSOPHY_QUOTE}}/g, content.philosophyQuote || 'Quality work. Honest service. Every time.')
    .replace(/{{FEATURE2}}/g, content.feature2 || 'Fast response')
    .replace(/{{FEATURE3}}/g, content.feature3 || 'Honest pricing')
    .replace(/{{FEATURE4}}/g, content.feature4 || 'Quality guaranteed')
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
    heroHeadline: `Expert ${industry.toUpperCase()}`,
    heroSubheadline: 'Done Right',
    heroDescription: `Professional ${industry} services in ${location}. Licensed and insured.`,
    established: '', year: '2026', founderName: '',
    responseTime: 'Fast',
    stat1Num: '', stat1Label: '',
    stat2Num: '', stat2Label: '',
    stat3Num: '', stat3Label: '',
    stat4Num: '', stat4Label: '',
    servicesHeadlinePart1: `Complete ${industry}`, servicesHeadlinePart2: 'services.',
    servicesSubtext: `Everything you need from a trusted local ${industry} company.`,
    serviceCards: services.map(s => ({icon:'🔧', name:s, description:`Professional ${s.toLowerCase()} in ${location}.`})),
    years: '',
    aboutHeadlinePart1: 'Your trusted local', aboutHeadlinePart2: `${industry} team.`,
    aboutP1: `${businessName} provides professional ${industry} services in ${location}.`,
    aboutP2: `Licensed, insured, and committed to quality work.`,
    philosophyQuote: '',
    feature2: 'Fast response', feature3: 'Honest pricing', feature4: 'Quality guaranteed',
    fastLabel: 'Fast Response', fastDesc: 'Available when you need us',
    heroTestimonialText: '', heroTestimonialAuthor: '', heroTestimonialDetail: '',
    testimonials: [], miniTestimonials: [],
    contactIntro: `Contact us today for a free estimate. Serving ${location} and surrounding areas.`,
    footerDesc: `Professional ${industry} services in ${location}.`,
    accentColorHex: '#e8a020'
  };
}

module.exports = { generateWebsite };
