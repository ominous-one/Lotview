import { db } from "./db";
import { callScoringTemplates, callScoringCriteria } from "@shared/schema";
import { eq, isNull, and } from "drizzle-orm";

interface CriterionSeed {
  category: string;
  label: string;
  description: string;
  weight: number;
  maxScore: number;
  ratingType: 'numeric' | 'yes_no' | 'scale_5';
  aiInstruction: string;
}

interface TemplateSeed {
  department: string;
  name: string;
  description: string;
  criteria: CriterionSeed[];
}

const salesCriteria: CriterionSeed[] = [
  // Greeting & Introduction
  { category: 'greeting', label: 'Professional Greeting', description: 'Answered with dealership name and personal name', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Check if employee stated dealership name and their own name clearly' },
  { category: 'greeting', label: 'Warm & Welcoming Tone', description: 'Voice conveyed enthusiasm and willingness to help', weight: 5, maxScore: 5, ratingType: 'scale_5', aiInstruction: 'Rate the warmth and enthusiasm in greeting on a scale of 1-5' },
  
  // Discovery & Needs Analysis
  { category: 'discovery', label: 'Asked Open-Ended Questions', description: 'Used questions to understand customer needs (What, How, Tell me about)', weight: 10, maxScore: 10, ratingType: 'numeric', aiInstruction: 'Count and evaluate the quality of open-ended discovery questions' },
  { category: 'discovery', label: 'Identified Primary Need', description: 'Determined what the customer is looking for', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Did the employee uncover the main reason for the customer call?' },
  { category: 'discovery', label: 'Uncovered Timeline', description: 'Asked when customer plans to make a purchase decision', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Check if timeline/urgency was discussed' },
  { category: 'discovery', label: 'Budget Discussion', description: 'Tactfully explored budget or payment expectations', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Check if budget or payment range was discussed' },
  
  // Product Knowledge
  { category: 'product_knowledge', label: 'Vehicle Knowledge Displayed', description: 'Demonstrated knowledge of vehicle features, specs, and availability', weight: 10, maxScore: 10, ratingType: 'numeric', aiInstruction: 'Rate accuracy and depth of vehicle information provided' },
  { category: 'product_knowledge', label: 'Matched Features to Needs', description: 'Connected vehicle features to customer stated needs', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Did the employee tailor the presentation to customer needs?' },
  
  // Appointment Setting
  { category: 'closing', label: 'Asked for Appointment', description: 'Made a clear attempt to schedule an in-person visit', weight: 15, maxScore: 15, ratingType: 'yes_no', aiInstruction: 'Check if employee explicitly asked to schedule an appointment' },
  { category: 'closing', label: 'Offered Multiple Times', description: 'Provided options for appointment scheduling', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Did employee offer specific date/time options?' },
  { category: 'closing', label: 'Handled Objections', description: 'Addressed concerns or hesitations professionally', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Rate how well objections were acknowledged and addressed' },
  
  // Professionalism
  { category: 'professionalism', label: 'Active Listening', description: 'Demonstrated attention and acknowledged customer statements', weight: 5, maxScore: 5, ratingType: 'scale_5', aiInstruction: 'Did employee show they were listening through acknowledgments and responses?' },
  { category: 'professionalism', label: 'No Interruptions', description: 'Allowed customer to complete thoughts before responding', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Check for interruptions during customer speech' },
  
  // Follow-Up
  { category: 'follow_up', label: 'Captured Contact Info', description: 'Obtained name, phone, and/or email for follow-up', weight: 10, maxScore: 10, ratingType: 'numeric', aiInstruction: 'Rate completeness of contact information captured (name, phone, email)' },
  { category: 'follow_up', label: 'Summarized Next Steps', description: 'Clearly stated what happens next before ending call', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Did employee summarize the agreed upon next steps?' },
];

const serviceCriteria: CriterionSeed[] = [
  // Greeting
  { category: 'greeting', label: 'Professional Greeting', description: 'Answered with dealership service department name', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Check if employee identified the service department clearly' },
  { category: 'greeting', label: 'Friendly Tone', description: 'Voice was pleasant and helpful', weight: 5, maxScore: 5, ratingType: 'scale_5', aiInstruction: 'Rate the friendliness of the greeting' },
  
  // Service Needs
  { category: 'discovery', label: 'Vehicle Identification', description: 'Obtained year, make, model, and mileage', weight: 10, maxScore: 10, ratingType: 'numeric', aiInstruction: 'Rate completeness of vehicle identification (year, make, model, mileage, VIN)' },
  { category: 'discovery', label: 'Service Concern Clarification', description: 'Asked detailed questions about the issue or service needed', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Did employee thoroughly understand the service concern?' },
  { category: 'discovery', label: 'Symptom Questions', description: 'Asked when, how often, and under what conditions issue occurs', weight: 10, maxScore: 10, ratingType: 'numeric', aiInstruction: 'Count relevant diagnostic questions asked' },
  
  // Service Knowledge
  { category: 'product_knowledge', label: 'Explained Service Process', description: 'Described what the service involves', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Rate the clarity of service process explanation' },
  { category: 'product_knowledge', label: 'Time Estimate Provided', description: 'Gave realistic time frame for service completion', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Check if time estimate was provided' },
  { category: 'product_knowledge', label: 'Cost Transparency', description: 'Discussed pricing or provided estimate range', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Was pricing discussed transparently?' },
  
  // Appointment Booking
  { category: 'closing', label: 'Offered Appointment', description: 'Attempted to schedule service appointment', weight: 15, maxScore: 15, ratingType: 'yes_no', aiInstruction: 'Did employee ask to book an appointment?' },
  { category: 'closing', label: 'Appointment Confirmation', description: 'Confirmed date, time, and service to be performed', weight: 10, maxScore: 10, ratingType: 'numeric', aiInstruction: 'Rate completeness of appointment confirmation details' },
  
  // Customer Care
  { category: 'professionalism', label: 'Empathy Shown', description: 'Acknowledged customer frustration or concern', weight: 5, maxScore: 5, ratingType: 'scale_5', aiInstruction: 'Rate the empathy displayed for customer situation' },
  { category: 'professionalism', label: 'Offered Alternatives', description: 'Suggested shuttle, loaner, or rideshare options', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Were transportation alternatives mentioned?' },
  
  // Follow-Up
  { category: 'follow_up', label: 'Contact Info Verified', description: 'Confirmed phone number and contact preferences', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Was contact information verified?' },
  { category: 'follow_up', label: 'Next Steps Explained', description: 'Clearly stated what customer should expect', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Were next steps clearly communicated?' },
];

const partsCriteria: CriterionSeed[] = [
  // Greeting
  { category: 'greeting', label: 'Parts Department Greeting', description: 'Identified as parts department with name', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Check for proper parts department identification' },
  
  // Parts Identification
  { category: 'discovery', label: 'Vehicle Information Collected', description: 'Obtained year, make, model for parts lookup', weight: 10, maxScore: 10, ratingType: 'numeric', aiInstruction: 'Rate completeness of vehicle information gathered' },
  { category: 'discovery', label: 'Part Details Clarified', description: 'Asked specific questions to identify correct part', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Did employee ask enough questions to identify the right part?' },
  
  // Parts Knowledge
  { category: 'product_knowledge', label: 'Inventory Check Performed', description: 'Checked availability and provided status', weight: 10, maxScore: 10, ratingType: 'yes_no', aiInstruction: 'Was inventory checked for part availability?' },
  { category: 'product_knowledge', label: 'Price Quote Provided', description: 'Gave accurate pricing information', weight: 10, maxScore: 10, ratingType: 'yes_no', aiInstruction: 'Was a price quote provided?' },
  { category: 'product_knowledge', label: 'OEM vs Aftermarket Explained', description: 'Discussed part options if applicable', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Were part options explained when relevant?' },
  
  // Order Process
  { category: 'closing', label: 'Order Placed or Reserved', description: 'Completed order or put part on hold', weight: 15, maxScore: 15, ratingType: 'yes_no', aiInstruction: 'Was an order placed or part reserved?' },
  { category: 'closing', label: 'Delivery Timeline Given', description: 'Provided expected arrival date', weight: 10, maxScore: 10, ratingType: 'yes_no', aiInstruction: 'Was delivery timeline communicated?' },
  
  // Service Upsell
  { category: 'closing', label: 'Installation Offered', description: 'Asked if customer needs installation service', weight: 10, maxScore: 10, ratingType: 'yes_no', aiInstruction: 'Was installation service offered?' },
  
  // Follow-Up
  { category: 'follow_up', label: 'Contact Info Captured', description: 'Got customer details for order notification', weight: 10, maxScore: 10, ratingType: 'yes_no', aiInstruction: 'Was contact information collected?' },
  { category: 'professionalism', label: 'Courteous Closing', description: 'Thanked customer and ended professionally', weight: 5, maxScore: 5, ratingType: 'scale_5', aiInstruction: 'Rate the professionalism of the call closing' },
];

const financeCriteria: CriterionSeed[] = [
  // Greeting
  { category: 'greeting', label: 'Finance Department Greeting', description: 'Professional introduction as finance/business office', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Check for proper finance department identification' },
  
  // Customer Situation
  { category: 'discovery', label: 'Purchase Context Understood', description: 'Determined if new buyer, refinance, or inquiry', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Did employee understand the customer financing situation?' },
  { category: 'discovery', label: 'Credit Situation Discussed', description: 'Tactfully explored credit history or concerns', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Was credit situation discussed appropriately?' },
  { category: 'discovery', label: 'Payment Goals Identified', description: 'Asked about desired payment range or budget', weight: 10, maxScore: 10, ratingType: 'yes_no', aiInstruction: 'Were payment goals or budget discussed?' },
  
  // Finance Knowledge
  { category: 'product_knowledge', label: 'Financing Options Explained', description: 'Discussed available financing programs', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Were financing options clearly explained?' },
  { category: 'product_knowledge', label: 'Terms Clearly Communicated', description: 'Explained rates, terms, and conditions', weight: 10, maxScore: 10, ratingType: 'numeric', aiInstruction: 'Rate the clarity of terms explanation' },
  { category: 'product_knowledge', label: 'Protection Products Mentioned', description: 'Introduced warranty or protection options', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Were F&I products mentioned?' },
  
  // Application Process
  { category: 'closing', label: 'Next Steps Outlined', description: 'Explained application or approval process', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Were application steps clearly outlined?' },
  { category: 'closing', label: 'Documents Requested', description: 'Listed required documentation for approval', weight: 10, maxScore: 10, ratingType: 'yes_no', aiInstruction: 'Were required documents communicated?' },
  { category: 'closing', label: 'Appointment Set', description: 'Scheduled meeting to finalize paperwork', weight: 10, maxScore: 10, ratingType: 'yes_no', aiInstruction: 'Was an appointment scheduled?' },
  
  // Compliance
  { category: 'professionalism', label: 'Compliant Communication', description: 'Avoided making improper promises or guarantees', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Was communication compliant with no improper promises?' },
  { category: 'professionalism', label: 'Professional Demeanor', description: 'Maintained trustworthy and respectful tone', weight: 5, maxScore: 5, ratingType: 'scale_5', aiInstruction: 'Rate overall professionalism' },
];

const generalCriteria: CriterionSeed[] = [
  // Greeting
  { category: 'greeting', label: 'Professional Greeting', description: 'Answered with dealership name', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Check if dealership was identified' },
  { category: 'greeting', label: 'Pleasant Tone', description: 'Voice was friendly and helpful', weight: 5, maxScore: 5, ratingType: 'scale_5', aiInstruction: 'Rate the friendliness of greeting' },
  
  // Call Handling
  { category: 'discovery', label: 'Purpose Identified', description: 'Determined reason for the call', weight: 10, maxScore: 10, ratingType: 'yes_no', aiInstruction: 'Was the call purpose quickly identified?' },
  { category: 'discovery', label: 'Correct Routing', description: 'Transferred or handled appropriately for the need', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'Was the call handled or routed correctly?' },
  { category: 'discovery', label: 'Caller Information Captured', description: 'Got name and callback number before transfer', weight: 10, maxScore: 10, ratingType: 'yes_no', aiInstruction: 'Was caller info captured before transfer?' },
  
  // Service Quality
  { category: 'professionalism', label: 'Hold Etiquette', description: 'Asked permission and thanked for holding', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Was proper hold etiquette used?' },
  { category: 'professionalism', label: 'No Dead Air', description: 'Minimized silence and kept caller informed', weight: 5, maxScore: 5, ratingType: 'scale_5', aiInstruction: 'Rate how well dead air was avoided' },
  { category: 'professionalism', label: 'Clear Communication', description: 'Spoke clearly and at appropriate pace', weight: 5, maxScore: 5, ratingType: 'scale_5', aiInstruction: 'Rate clarity of communication' },
  
  // Resolution
  { category: 'closing', label: 'Need Addressed', description: 'Customer inquiry was resolved or progressed', weight: 15, maxScore: 15, ratingType: 'scale_5', aiInstruction: 'Was the customer need addressed satisfactorily?' },
  { category: 'closing', label: 'Offered Additional Help', description: 'Asked if there was anything else needed', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Did employee offer additional assistance?' },
  
  // Closing
  { category: 'follow_up', label: 'Professional Closing', description: 'Ended call courteously with dealership branding', weight: 5, maxScore: 5, ratingType: 'yes_no', aiInstruction: 'Was the call closed professionally?' },
  { category: 'follow_up', label: 'Message Taken if Needed', description: 'Captured complete message for absent party', weight: 10, maxScore: 10, ratingType: 'scale_5', aiInstruction: 'If message was needed, was it complete?' },
];

const templates: TemplateSeed[] = [
  { department: 'sales', name: 'Sales Call Scoring', description: 'Standard scoring template for inbound and outbound sales calls. Focuses on discovery, product matching, and appointment setting.', criteria: salesCriteria },
  { department: 'service', name: 'Service Call Scoring', description: 'Scoring template for service department calls. Evaluates diagnostic questions, appointment booking, and customer care.', criteria: serviceCriteria },
  { department: 'parts', name: 'Parts Call Scoring', description: 'Scoring template for parts department inquiries. Measures parts identification, quoting accuracy, and order completion.', criteria: partsCriteria },
  { department: 'finance', name: 'Finance Call Scoring', description: 'Scoring template for F&I department calls. Evaluates needs analysis, product presentation, and compliance.', criteria: financeCriteria },
  { department: 'general', name: 'General Inquiry Scoring', description: 'Default scoring template for reception and general inquiries. Focuses on call routing and basic customer service.', criteria: generalCriteria },
];

export async function seedCallScoringTemplates() {
  console.log("📞 Seeding call scoring templates...\n");
  
  let created = 0;
  let skipped = 0;
  
  for (const template of templates) {
    // Check if system default template for this department already exists
    const existing = await db.select()
      .from(callScoringTemplates)
      .where(
        and(
          isNull(callScoringTemplates.dealershipId),
          eq(callScoringTemplates.department, template.department)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      console.log(`  ⚠️  ${template.department} template already exists, skipping...`);
      skipped++;
      continue;
    }
    
    // Create template (dealershipId = null for system default)
    const [newTemplate] = await db.insert(callScoringTemplates)
      .values({
        dealershipId: null,
        department: template.department,
        name: template.name,
        description: template.description,
        isActive: true,
        isDefault: true,
        version: 1,
        createdById: null,
      })
      .returning();
    
    // Create criteria for this template
    const criteriaValues = template.criteria.map((c, index) => ({
      templateId: newTemplate.id,
      category: c.category,
      label: c.label,
      description: c.description,
      weight: c.weight,
      maxScore: c.maxScore,
      ratingType: c.ratingType,
      sortOrder: index,
      aiInstruction: c.aiInstruction,
      isRequired: true,
    }));
    
    await db.insert(callScoringCriteria).values(criteriaValues);
    
    console.log(`  ✓ Created ${template.department} template with ${template.criteria.length} criteria`);
    created++;
  }
  
  console.log(`\n✅ Seeding complete: ${created} created, ${skipped} skipped`);
}

// Run if called directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedCallScoringTemplates()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Error seeding call scoring templates:", error);
      process.exit(1);
    });
}
