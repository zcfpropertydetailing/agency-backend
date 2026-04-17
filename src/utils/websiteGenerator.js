const { callClaude } = require('../utils/anthropic');
const fs = require('fs');
const path = require('path');

const TEMPLATE = fs.readFileSync(path.join(__dirname, '../../templates/service_template.html'), 'utf8');

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

  const prompt = `Generate content for a ${industry} business website. Return ONLY valid JSON, no markdown, no backticks.

Business: ${businessName}, ${location}. Phone: ${phone}. Services: ${serviceList.join(', ')}. Areas: ${areaList.join(', ')}. Hours: ${hours || 'Available 7 Days a Week'}.${ctx}

Return this exact JSON:
{
  "metaDescription": "2 sentence SEO description",
  "logoName": "2-3 word logo name",
  "heroHeadline": "4-5 WORD ALL CAPS HEADLINE",
  "heroSubheadline": "3-4 word subheadline",
  "heroDescription": "2 sentence value proposition",
  "responseTime": "Same-Day",
  "stat1Num": "500+", "stat1Label": "Jobs Completed",
  "stat2Num": "15+", "stat2Label": "Years Experience",
  "stat3Num": "5★", "stat3Label": "Average Rating",
  "servicesHeadline": "6 word services section title",
  "servicesSubtext": "1 sentence about services",
  "serviceCards": [{"icon":"🔧","name":"Service Name","description":"2 sentence description"}],
  "years": "10",
  "aboutHeadline": "6 word about headline",
  "aboutP1": "3 sentence business story",
  "aboutP2": "2 sentence commitment statement",
  "fastLabel": "Fast Response", "fastDesc": "Same-day service available",
  "testimonials": [{"text":"2-3 sentence review","author":"First L.","detail":"Service, City"}],
  "contactIntro": "2 sentence contact CTA",
  "footerDesc": "1 sentence footer tagline",
  "accentColorHex": "#e8a020"
}
Exactly 6 serviceCards and 3 testimonials. All content specific to ${businessName} in ${location}.`;

  let content;
  try {
    const raw = await callClaude('Return only valid JSON, no markdown.', prompt, 3000);
    const cleaned = raw.replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/\n?```$/,'').trim();
    content = JSON.parse(cleaned);
  } catch(e) {
    console.log('Using defaults due to parse error:', e.message);
    content = getDefaults(businessName, industry, location, serviceList, areaList);
  }

  const serviceCardsHTML = (content.serviceCards || []).map(s =>
    `<div class="service-card fade-in"><div class="service-icon">${s.icon}</div><h3>${s.name}</h3><p>${s.description}</p></div>`
  ).join('\n');

  const testimonialsHTML = (content.testimonials || []).map(t =>
    `<div class="testimonial-card fade-in"><div class="stars">★★★★★</div><p class="testimonial-text">"${t.text}"</p><div class="testimonial-author">${t.author}</div><div class="testimonial-detail">${t.detail}</div></div>`
  ).join('\n');

  const areaTags = areaList.map(a => `<div class="area-tag">${a}</div>`).join('\n');
  const serviceOptions = ['<option value="">Select a service...</option>'].concat(serviceList.map(s => `<option>${s}</option>`)).join('\n');
  const footerServices = serviceList.slice(0,5).map(s => `<li><a href="#services">${s}</a></li>`).join('\n');

  return TEMPLATE
    .replace(/{{BUSINESS_NAME}}/g, businessName)
    .replace(/{{INDUSTRY}}/g, industry)
    .replace(/{{LOCATION}}/g, location)
    .replace(/{{PHONE}}/g, phone || '(000) 000-0000')
    .replace(/{{PHONE_RAW}}/g, phoneRaw)
    .replace(/{{META_DESCRIPTION}}/g, content.metaDescription || '')
    .replace(/{{PRIMARY_COLOR}}/g, '#0a0a0a')
    .replace(/{{ACCENT_COLOR}}/g, content.accentColorHex || '#e8a020')
    .replace(/{{LOGO_NAME}}/g, content.logoName || businessName.split(' ').slice(0,2).join(' '))
    .replace(/{{HERO_HEADLINE}}/g, content.heroHeadline || 'EXPERT ' + industry.toUpperCase())
    .replace(/{{HERO_SUBHEADLINE}}/g, content.heroSubheadline || 'Services You Can Trust')
    .replace(/{{HERO_DESCRIPTION}}/g, content.heroDescription || '')
    .replace(/{{RESPONSE_TIME}}/g, content.responseTime || 'Same-Day')
    .replace(/{{STAT1_NUM}}/g, content.stat1Num || '500+')
    .replace(/{{STAT1_LABEL}}/g, content.stat1Label || 'Jobs Completed')
    .replace(/{{STAT2_NUM}}/g, content.stat2Num || '10+')
    .replace(/{{STAT2_LABEL}}/g, content.stat2Label || 'Years Experience')
    .replace(/{{STAT3_NUM}}/g, content.stat3Num || '5★')
    .replace(/{{STAT3_LABEL}}/g, content.stat3Label || 'Average Rating')
    .replace(/{{SERVICES_HEADLINE}}/g, content.servicesHeadline || 'Our Services')
    .replace(/{{SERVICES_SUBTEXT}}/g, content.servicesSubtext || '')
    .replace(/{{SERVICES_CARDS}}/g, serviceCardsHTML)
    .replace(/{{YEARS}}/g, content.years || '10')
    .replace(/{{ABOUT_HEADLINE}}/g, content.aboutHeadline || 'Your Trusted Experts')
    .replace(/{{ABOUT_P1}}/g, content.aboutP1 || '')
    .replace(/{{ABOUT_P2}}/g, content.aboutP2 || '')
    .replace(/{{FAST_LABEL}}/g, content.fastLabel || 'Fast Response')
    .replace(/{{FAST_DESC}}/g, content.fastDesc || 'Available when you need us')
    .replace(/{{TESTIMONIALS}}/g, testimonialsHTML)
    .replace(/{{AREA_TAGS}}/g, areaTags)
    .replace(/{{CONTACT_INTRO}}/g, content.contactIntro || '')
    .replace(/{{HOURS}}/g, hours || 'Available 7 Days a Week')
    .replace(/{{SERVICE_OPTIONS}}/g, serviceOptions)
    .replace(/{{FOOTER_DESC}}/g, content.footerDesc || '')
    .replace(/{{FOOTER_SERVICES}}/g, footerServices);
}

function getDefaults(businessName, industry, location, services, areas) {
  return {
    metaDescription: `Professional ${industry} services in ${location}. Licensed & Insured.`,
    logoName: businessName.split(' ').slice(0,2).join(' '),
    heroHeadline: `EXPERT ${industry.toUpperCase()}`,
    heroSubheadline: 'Services You Can Trust',
    heroDescription: `Professional ${industry} services in ${location}. Licensed and insured.`,
    responseTime: 'Same-Day',
    stat1Num: '500+', stat1Label: 'Jobs Completed',
    stat2Num: '10+', stat2Label: 'Years Experience',
    stat3Num: '5★', stat3Label: 'Average Rating',
    servicesHeadline: `Complete ${industry} Services`,
    servicesSubtext: `Everything you need from a trusted local ${industry} company.`,
    serviceCards: services.map(s => ({icon:'🔧', name:s, description:`Professional ${s.toLowerCase()} in ${location}.`})),
    years: '10',
    aboutHeadline: `Your Trusted Local Experts`,
    aboutP1: `${businessName} has been proudly serving ${location} with professional ${industry} services.`,
    aboutP2: `We are committed to providing the highest quality service at fair prices.`,
    fastLabel: 'Fast Response', fastDesc: 'Available when you need us',
    testimonials: [
      {text:`Excellent service from ${businessName}. Professional and fair pricing.`, author:'John S.', detail:`${industry}, ${location}`},
      {text:`Very impressed with the quality of work. Highly recommend!`, author:'Sarah M.', detail:`${industry}, ${location}`},
      {text:`Best ${industry} company in ${location}. Will use again.`, author:'Mike R.', detail:`${industry}, ${location}`}
    ],
    contactIntro: `Contact us today for a free estimate. Serving ${location} and surrounding areas.`,
    footerDesc: `Your trusted local ${industry} experts.`,
    accentColorHex: '#e8a020'
  };
}

module.exports = { generateWebsite };
