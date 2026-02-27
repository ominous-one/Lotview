import type { Dealership, Vehicle, AiSettings } from "@shared/schema";

/**
 * Build the system prompt for the AI sales agent.
 * This is the core "personality" and instructions for the agent.
 */
export function buildSalesAgentSystemPrompt(opts: {
  dealership: Dealership;
  currentDateTime: string;
  vehicleContext?: string;
  paymentContext?: string;
  carfaxContext?: string;
  inventoryContext?: string;
  conversationMeta?: {
    customerName?: string;
    messageCount?: number;
    isFirstMessage?: boolean;
  };
  aiSettings?: AiSettings | null;
}): string {
  const { dealership, currentDateTime, vehicleContext, paymentContext, carfaxContext, inventoryContext, conversationMeta, aiSettings } = opts;

  const dealershipInfo = [
    dealership.name,
    dealership.address ? `${dealership.address}, ${dealership.city || ''}, ${dealership.province || 'BC'} ${dealership.postalCode || ''}`.trim() : null,
    dealership.phone ? `Phone: ${dealership.phone}` : null,
  ].filter(Boolean).join('\n');

  // Build tone modifier based on AI settings
  const toneMap: Record<string, string> = {
    professional: 'Use a professional, polished tone. Be courteous and business-like.',
    friendly: 'Use a warm, friendly tone. Be personable and approachable, like chatting with a friend.',
    casual: 'Use a casual, laid-back tone. Keep it relaxed and natural, like texting a buddy.',
    luxury: 'Use a refined, luxury tone. Be elegant, sophisticated, and exclusive-feeling.',
  };

  const responseLengthMap: Record<string, string> = {
    short: 'Keep responses to 2-3 sentences MAX. This is Facebook Messenger, not email.',
    medium: 'Keep responses to 3-5 sentences. Be thorough but concise.',
    long: 'Provide detailed responses of 5-8 sentences when helpful. Be comprehensive.',
  };

  const s = aiSettings?.enabled ? aiSettings : null;
  const toneInstruction = toneMap[s?.tone || 'professional'] || toneMap.professional;
  const lengthInstruction = responseLengthMap[s?.responseLength || 'short'] || responseLengthMap.short;

  // Custom personality section
  const personalitySection = s?.salesPersonality
    ? `=== CUSTOM SALES PERSONALITY ===\n${s.salesPersonality}\n`
    : '';

  // Always include section
  const alwaysIncludeSection = s?.alwaysInclude
    ? `=== ALWAYS MENTION THESE ===\nIn every conversation, naturally work in these points:\n${s.alwaysInclude}\n`
    : '';

  // Never say section
  const neverSaySection = s?.neverSay
    ? `=== NEVER SAY ===\nNEVER mention or reference any of the following:\n${s.neverSay}\n`
    : '';

  // Objection handling
  let objectionSection = '';
  if (s?.objectionHandling && typeof s.objectionHandling === 'object') {
    const pairs = Object.entries(s.objectionHandling as Record<string, string>);
    if (pairs.length > 0) {
      objectionSection = '=== CUSTOM OBJECTION HANDLING ===\nWhen customers raise these objections, use these responses:\n' +
        pairs.map(([obj, resp]) => `- "${obj}" → ${resp}`).join('\n') + '\n';
    }
  }

  // Business hours
  const businessHoursSection = s?.businessHours
    ? `=== BUSINESS HOURS ===\n${s.businessHours}\nUse these hours when suggesting visits or scheduling.\n`
    : '';

  // Custom escalation rules
  const escalationSection = s?.escalationRules
    ? `=== ESCALATION RULES ===\n${s.escalationRules}\n`
    : `=== ESCALATE TO HUMAN WHEN ===
- Customer requests a specific trade-in valuation with numbers
- Complex financing situations (bankruptcy, consumer proposal)
- Customer complaints or disputes
- Requests for specific legal/warranty documentation
- Customer explicitly asks to speak to a person/manager
When escalating, say: "Let me connect you with one of our team members who can help you with that right away."
`;

  // Custom CTAs
  const ctaSection = s?.customCtas
    ? `=== CALL-TO-ACTION PHRASES ===\nUse these CTAs when closing:\n${s.customCtas}\n`
    : '';

  // Sample conversations
  const sampleSection = s?.sampleConversations
    ? `=== EXAMPLE CONVERSATIONS (match this style) ===\n${s.sampleConversations}\n`
    : '';

  // Custom greeting instruction
  const greetingInstruction = s?.greetingTemplate && conversationMeta?.isFirstMessage
    ? `Use this greeting template for the first message (adapt naturally): "${s.greetingTemplate}"`
    : conversationMeta?.isFirstMessage
      ? 'This is the customer\'s FIRST message. Give a warm greeting and reference the specific vehicle they asked about.'
      : 'This is an ongoing conversation. Do NOT re-greet or repeat information already discussed.';

  return `=== CURRENT DATE AND TIME ===
TODAY IS: ${currentDateTime} (Pacific Time)
Use this exact date/time for scheduling. NEVER use placeholder text.
===========================

=== YOUR IDENTITY ===
You are a sales consultant at ${dealership.name}. You respond to customer messages on Facebook Marketplace.
You are friendly, knowledgeable, and helpful — never pushy or aggressive.
You NEVER reveal that you are an AI, chatbot, or automated system.
If asked directly, say "I'm part of the sales team here at ${dealership.name}."

=== DEALERSHIP INFO ===
${dealershipInfo}

${personalitySection}=== TONE ===
${toneInstruction}

=== SALES APPROACH ===
You follow a consultative sales approach:
1. GREET warmly — thank them for reaching out
2. QUALIFY — understand what they need (budget, vehicle type, must-haves)
3. PRESENT — share specific highlights of the vehicle (reference real data below)
4. HANDLE OBJECTIONS — price concerns → payment options, condition concerns → Carfax data
5. BUILD INTEREST — mention specific desirable features, low km, clean history
6. CLOSE — always end with a clear call-to-action (book a test drive, visit us, call us)

=== RESPONSE RULES ===
- ${lengthInstruction}
- Be conversational and natural. Match the customer's tone and energy.
- Use ONE emoji max per message, and only when it feels natural.
- Always include a call-to-action: schedule a viewing, ask a question, call us.
- If you don't have specific information, say "Let me check with our team and get right back to you."
- NEVER say "As an AI", "I'm a bot", "I'm an automated system", or similar.
- NEVER make up vehicle features, specs, or prices that aren't in the data below.
- Use Canadian spelling and conventions: kilometres (not miles), CAD, provinces.
- For pricing, always say the number naturally: "twenty-four nine" or "$24,900" — not "$24900".
- If someone asks for a lower price, DO NOT give a discount. Instead, highlight value or offer payment options.
- If asked about trade-ins, say "We'd love to take a look at your trade-in! Bring it by and we'll give you a fair appraisal on the spot."
- If someone is rude or aggressive, stay professional and offer to connect them with a manager.
- If asked about warranty, say "Great question — let me connect you with our team to go over the warranty options."

${alwaysIncludeSection}${neverSaySection}${objectionSection}${businessHoursSection}${escalationSection}${ctaSection}${sampleSection}=== PAYMENT GUIDELINES ===
When discussing payments:
- Present monthly and bi-weekly options
- Always mention "OAC" (On Approved Credit)
- Never guarantee approval or specific rates
- If asked about credit issues, say "We work with all credit situations — come in and we'll see what we can do for you."
${paymentContext ? `\n=== PAYMENT DATA FOR THIS VEHICLE ===\n${paymentContext}` : ''}

${vehicleContext ? `=== VEHICLE BEING DISCUSSED ===\n${vehicleContext}` : ''}

${carfaxContext ? `=== CARFAX REPORT ===\n${carfaxContext}` : ''}

${inventoryContext ? `=== ALTERNATIVE VEHICLES IN INVENTORY ===\n${inventoryContext}` : ''}

${conversationMeta?.customerName ? `=== CUSTOMER ===\nName: ${conversationMeta.customerName}` : ''}

=== CONVERSATION STAGE HINTS ===
${greetingInstruction}`;
}

/**
 * Build a rich vehicle context string from vehicle data.
 */
export function buildVehicleContext(vehicle: Vehicle): string {
  const lines: string[] = [];
  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`;
  lines.push(`Vehicle: ${name}`);
  lines.push(`Price: $${vehicle.price.toLocaleString()} CAD`);
  lines.push(`Odometer: ${vehicle.odometer.toLocaleString()} km`);

  if (vehicle.exteriorColor) lines.push(`Exterior: ${vehicle.exteriorColor}`);
  if (vehicle.interiorColor) lines.push(`Interior: ${vehicle.interiorColor}`);
  if (vehicle.transmission) lines.push(`Transmission: ${vehicle.transmission}`);
  if (vehicle.drivetrain) lines.push(`Drivetrain: ${vehicle.drivetrain}`);
  if (vehicle.fuelType) lines.push(`Fuel: ${vehicle.fuelType}`);
  if (vehicle.type) lines.push(`Body: ${vehicle.type}`);
  if (vehicle.vin) lines.push(`VIN: ${vehicle.vin}`);
  if (vehicle.stockNumber) lines.push(`Stock #: ${vehicle.stockNumber}`);

  if (vehicle.carfaxBadges && vehicle.carfaxBadges.length > 0) {
    lines.push(`Carfax Badges: ${vehicle.carfaxBadges.join(', ')}`);
  }
  if (vehicle.badges && vehicle.badges.length > 0) {
    lines.push(`Features: ${vehicle.badges.join(', ')}`);
  }
  if (vehicle.highlights) {
    lines.push(`Highlights: ${vehicle.highlights}`);
  }
  if (vehicle.dealRating) {
    lines.push(`Deal Rating: ${vehicle.dealRating}`);
  }
  if (vehicle.cargurusPrice) {
    lines.push(`CarGurus Price: $${vehicle.cargurusPrice.toLocaleString()}`);
  }

  // Include VDP description if available (truncated)
  if (vehicle.vdpDescription) {
    lines.push(`Description: ${vehicle.vdpDescription.substring(0, 500)}`);
  }

  // Parse tech specs if available
  if (vehicle.techSpecs) {
    try {
      const specs = JSON.parse(vehicle.techSpecs);
      const specSections: string[] = [];
      if (specs.features?.length) specSections.push(`Features: ${specs.features.join(', ')}`);
      if (specs.interior?.length) specSections.push(`Interior: ${specs.interior.join(', ')}`);
      if (specs.entertainment?.length) specSections.push(`Entertainment: ${specs.entertainment.join(', ')}`);
      if (specSections.length > 0) {
        lines.push(`Specs: ${specSections.join(' | ')}`);
      }
    } catch { /* ignore parse errors */ }
  }

  lines.push(`Location: ${vehicle.dealership}, ${vehicle.location}`);

  return lines.join('\n');
}

/**
 * Build Carfax report context string.
 */
export function buildCarfaxContext(report: {
  accidentCount?: number | null;
  ownerCount?: number | null;
  serviceRecordCount?: number | null;
  lastReportedOdometer?: number | null;
  damageReported?: boolean | null;
  lienReported?: boolean | null;
  badges?: string[] | null;
}): string {
  const lines: string[] = [];

  if (report.accidentCount !== undefined && report.accidentCount !== null) {
    lines.push(report.accidentCount === 0
      ? 'No reported accidents'
      : `${report.accidentCount} reported accident(s)`);
  }
  if (report.ownerCount) {
    lines.push(`${report.ownerCount} previous owner(s)`);
  }
  if (report.serviceRecordCount) {
    lines.push(`${report.serviceRecordCount} service records on file`);
  }
  if (report.lastReportedOdometer) {
    lines.push(`Last reported odometer: ${report.lastReportedOdometer.toLocaleString()} km`);
  }
  if (report.damageReported === false) {
    lines.push('No damage reported');
  }
  if (report.lienReported === false) {
    lines.push('No liens reported');
  }
  if (report.badges && report.badges.length > 0) {
    lines.push(`Carfax Badges: ${report.badges.join(', ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'Carfax report available — ask for details.';
}

/**
 * Build alternative vehicle inventory context.
 */
export function buildInventoryContext(vehicles: Vehicle[], currentVehicleId?: number): string {
  const alternatives = vehicles
    .filter(v => v.id !== currentVehicleId)
    .slice(0, 5);

  if (alternatives.length === 0) return '';

  const lines = alternatives.map(v => {
    const name = `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`;
    const extras: string[] = [];
    if (v.odometer) extras.push(`${v.odometer.toLocaleString()} km`);
    if (v.carfaxBadges?.includes('No Reported Accidents')) extras.push('No Accidents');
    if (v.drivetrain) extras.push(v.drivetrain);
    return `- ${name} — $${v.price.toLocaleString()} (${extras.join(', ')})`;
  });

  return `Similar vehicles you can suggest:\n${lines.join('\n')}`;
}

/**
 * Build a follow-up message prompt.
 */
export function buildFollowUpPrompt(opts: {
  customerName: string;
  vehicleName: string;
  lastMessagePreview: string;
  hoursSinceLastMessage: number;
}): string {
  return `The customer "${opts.customerName}" hasn't responded in about ${Math.round(opts.hoursSinceLastMessage)} hours.
Their last interaction was about the ${opts.vehicleName}.
Last message preview: "${opts.lastMessagePreview}"

Write a gentle, non-pushy follow-up message (1-2 sentences max).
Don't repeat previous information. Just check in naturally — like a real salesperson would.
Examples of good follow-ups:
- "Hey [name], just checking in — still interested in the [vehicle]? Happy to answer any questions!"
- "Hi! The [vehicle] is still available if you'd like to come take a look. No pressure at all."
Don't use placeholder brackets — use the actual customer name and vehicle name.`;
}
