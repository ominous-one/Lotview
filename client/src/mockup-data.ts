/**
 * Mockup fixture data.
 *
 * Realistic enough that a dealer reading the mockup believes it's the
 * real product. Dollar figures, lead-counts, conversation snippets, and
 * vehicle inventory all reflect what a single-rooftop store does in a day.
 */

export type RoleSlug = "super_admin" | "general_manager" | "sales_manager" | "sales_consultant";

export const roles: { slug: RoleSlug; label: string; person: string }[] = [
  { slug: "super_admin", label: "Super Admin", person: "Riley Abreo" },
  { slug: "general_manager", label: "General Manager", person: "Marcus Chen" },
  { slug: "sales_manager", label: "Sales Manager", person: "Priya Singh" },
  { slug: "sales_consultant", label: "Sales Consultant", person: "Devon Walker" },
];

// ---------------------------------------------------------------------------
// Super Admin
// ---------------------------------------------------------------------------

export const tenants = [
  { id: 1, name: "Olympic Hyundai Vancouver", subdomain: "olympic", plan: "Scale", mrr: 1499, status: "live", lastScrape: "12 min ago", vehicles: 142, leads: 38, alerts: 0 },
  { id: 2, name: "Premier Honda Burnaby", subdomain: "premier-honda", plan: "Scale", mrr: 1499, status: "live", lastScrape: "21 min ago", vehicles: 218, leads: 47, alerts: 1 },
  { id: 3, name: "Northview Toyota", subdomain: "northview", plan: "Pro", mrr: 999, status: "live", lastScrape: "1 hr ago", vehicles: 96, leads: 22, alerts: 0 },
  { id: 4, name: "Coastline Ford", subdomain: "coastline", plan: "Pro", mrr: 999, status: "live", lastScrape: "2 hr ago", vehicles: 184, leads: 19, alerts: 0 },
  { id: 5, name: "Pacific Mazda", subdomain: "pacific-mazda", plan: "Starter", mrr: 499, status: "live", lastScrape: "8 min ago", vehicles: 78, leads: 14, alerts: 0 },
  { id: 6, name: "Heritage Subaru", subdomain: "heritage", plan: "Scale", mrr: 1499, status: "trial", lastScrape: "4 min ago", vehicles: 113, leads: 9, alerts: 0 },
  { id: 7, name: "Granite Volkswagen", subdomain: "granite-vw", plan: "Pro", mrr: 999, status: "live", lastScrape: "1 hr ago", vehicles: 124, leads: 17, alerts: 2 },
  { id: 8, name: "Capital Kia", subdomain: "capital-kia", plan: "Starter", mrr: 499, status: "paused", lastScrape: "3 d ago", vehicles: 0, leads: 0, alerts: 1 },
];

export const tenantMrrSeries = [
  { day: "May 1", mrr: 7390 }, { day: "May 5", mrr: 7390 }, { day: "May 10", mrr: 7890 }, { day: "May 15", mrr: 8889 },
  { day: "May 20", mrr: 8889 }, { day: "May 25", mrr: 9888 }, { day: "May 30", mrr: 10387 },
];

export const recentSignups = [
  { name: "Heritage Subaru", contact: "Sarah Khouri", at: "today, 8:42 AM", plan: "Scale (Trial)" },
  { name: "Mountain Mitsubishi", contact: "Aaron Wong", at: "yesterday, 4:15 PM", plan: "Pro" },
  { name: "Riverbend Acura", contact: "Maddie Patel", at: "2 days ago", plan: "Starter" },
];

export const systemAlerts = [
  { id: "a1", severity: "warn" as const, when: "9 min ago", title: "Capital Kia: scrape paused 3 days", body: "Source URL returns 403. Action: reverify selector or rotate proxy." },
  { id: "a2", severity: "warn" as const, when: "32 min ago", title: "Premier Honda: AI cost over budget", body: "Today: $48.20 / $40.00 budget. Auto-throttle engaged at 12:07 PM." },
  { id: "a3", severity: "info" as const, when: "1 hr ago", title: "Granite VW: Carfax cache hit-rate < 60%", body: "Likely Carfax provider rate limit. Lookups continue but cost is up." },
];

// ---------------------------------------------------------------------------
// General Manager
// ---------------------------------------------------------------------------

export const gmTodayMetrics = {
  unitsSoldTd: 4,
  unitsSoldMtdTrend: +12,
  grossProfitTd: 18420,
  grossProfitMtdTrend: +6,
  leadsToday: 38,
  leadsTrend: +21,
  avgResponse: "4m 12s",
  responseTrend: -38,
};

export const gmPipelineSeries = [
  { week: "W1", new: 142, qualified: 86, appt: 38, sold: 17 },
  { week: "W2", new: 158, qualified: 92, appt: 41, sold: 19 },
  { week: "W3", new: 132, qualified: 81, appt: 35, sold: 14 },
  { week: "W4", new: 174, qualified: 104, appt: 48, sold: 22 },
];

export const gmTopReps = [
  { name: "Devon Walker", units: 8, gross: 22150, color: "#5C6BC0" },
  { name: "Priya Singh", units: 6, gross: 18820, color: "#26A69A" },
  { name: "Carlos Mendez", units: 5, gross: 14060, color: "#EF5350" },
  { name: "Aisha Patel", units: 4, gross: 12480, color: "#FFB300" },
  { name: "Tomas Berg", units: 3, gross: 9020, color: "#8D6E63" },
];

export const gmAging = [
  { vin: "5XYZUDLA8PG123456", vehicle: "2024 Hyundai Tucson Preferred", price: 33249, days: 67, suggested: -800 },
  { vin: "KM8JBCD13RU222018", vehicle: "2024 Hyundai Tucson Plug-In Hybrid", price: 39888, days: 61, suggested: -1200 },
  { vin: "5NMJBCDEXSH505018", vehicle: "2025 Hyundai Tucson Preferred", price: 35749, days: 54, suggested: -500 },
  { vin: "5NMJCCDE4SH499388", vehicle: "2025 Hyundai Tucson S", price: 40749, days: 49, suggested: -1100 },
  { vin: "5XYZUDLA8PG369874", vehicle: "2023 Hyundai Santa Fe XRT", price: 41995, days: 47, suggested: -700 },
];

export const gmPendingPriceApprovals = [
  { who: "Priya Singh", action: "Drop price $800 on 2024 Tucson Preferred (67d on lot)", at: "5 min ago" },
  { who: "Devon Walker", action: "Drop price $500 on 2025 Tucson Preferred (54d on lot)", at: "22 min ago" },
  { who: "Carlos Mendez", action: "Drop price $1,100 on 2025 Tucson S (49d on lot)", at: "1 hr ago" },
];

// ---------------------------------------------------------------------------
// Sales Manager
// ---------------------------------------------------------------------------

export const smOpenConversations = [
  { id: "c1", name: "James Liu", channel: "Marketplace", vehicle: "2024 Tucson Hybrid Ultimate", lastMsg: "Is the AWD model still available? Also — do you take trades?", at: "3m", hot: 4, owner: "Devon Walker" },
  { id: "c2", name: "Marisol Ortiz", channel: "SMS", vehicle: "2025 Santa Fe Calligraphy", lastMsg: "Yes Saturday works! What time can I come by?", at: "7m", hot: 4, owner: "Devon Walker" },
  { id: "c3", name: "Brian Tanaka", channel: "Email", vehicle: "2024 IONIQ 5 Preferred", lastMsg: "What's the actual range in winter? My commute is 90 km RT.", at: "12m", hot: 3, owner: "Carlos Mendez" },
  { id: "c4", name: "Hannah Yusuf", channel: "Marketplace", vehicle: "2024 Tucson S", lastMsg: "Sent VIN — checking financing for $5K down.", at: "31m", hot: 3, owner: "Unassigned" },
  { id: "c5", name: "Pat Sullivan", channel: "SMS", vehicle: "2023 Santa Cruz Preferred", lastMsg: "Can I see the Carfax?", at: "44m", hot: 2, owner: "Aisha Patel" },
  { id: "c6", name: "Vince Demarco", channel: "Marketplace", vehicle: "2025 Palisade Calligraphy", lastMsg: "How firm are you on price?", at: "1h", hot: 2, owner: "Unassigned" },
  { id: "c7", name: "Lila Brennan", channel: "Email", vehicle: "2024 Elantra N Line", lastMsg: "Thanks, I'll think about it.", at: "2h", hot: 1, owner: "Tomas Berg" },
];

export const smActiveThread = {
  customer: "Marisol Ortiz",
  vehicle: "2025 Hyundai Santa Fe Calligraphy",
  channel: "SMS",
  bubbles: [
    { side: "them" as const, body: "Hi! I saw the 2025 Santa Fe Calligraphy listing — is it still available?" },
    { side: "us" as const, body: "Hi Marisol! Yes, still here. White exterior, saddle interior. Want to come see it?" },
    { side: "them" as const, body: "Yes please — I'm thinking Saturday." },
    { side: "us" as const, body: "Saturday works. Morning or afternoon?" },
    { side: "them" as const, body: "Yes Saturday works! What time can I come by?" },
  ],
  aiSuggested: "Awesome — I have 10:30 AM open and 2 PM open. Either work? I'll have the keys ready and Carfax printed.",
  customerSignals: ["High intent", "Specific model + trim mentioned", "Pinned to date"],
};

export const smActionsNeeded = [
  { id: "n1", kind: "Price drop pending approval", target: "2024 Tucson Preferred", detail: "Aging 67d, market avg $32.4K", urgent: true },
  { id: "n2", kind: "Lead unassigned > 30 min", target: "Hannah Yusuf — 2024 Tucson S", detail: "Marketplace; financing question", urgent: true },
  { id: "n3", kind: "Carfax pull failed", target: "VIN KM8JBCD13RU222018", detail: "Browserless gateway 503; retry queued", urgent: false },
  { id: "n4", kind: "Photos < 6 on active unit", target: "2023 Santa Cruz Preferred", detail: "Only 4 photos uploaded", urgent: false },
];

export const smAppointmentsToday = [
  { time: "9:00 AM", customer: "Trent Marlowe", rep: "Devon Walker", vehicle: "2024 IONIQ 5 Preferred", kind: "Test drive" },
  { time: "10:30 AM", customer: "Marisol Ortiz", rep: "Devon Walker", vehicle: "2025 Santa Fe Calligraphy", kind: "Walk-around" },
  { time: "11:15 AM", customer: "Greg Tanner", rep: "Carlos Mendez", vehicle: "2024 Palisade Urban", kind: "Trade-in appraisal" },
  { time: "1:30 PM", customer: "Marcus Lee", rep: "Aisha Patel", vehicle: "2025 Tucson Preferred", kind: "Delivery" },
  { time: "3:00 PM", customer: "Vince Demarco", rep: "Devon Walker", vehicle: "2025 Palisade Calligraphy", kind: "Test drive" },
  { time: "4:15 PM", customer: "Lila Brennan", rep: "Tomas Berg", vehicle: "2024 Elantra N Line", kind: "Financing" },
];

// ---------------------------------------------------------------------------
// Sales Consultant
// ---------------------------------------------------------------------------

export const consultantMyMetrics = {
  myLeadsOpen: 14,
  myLeadsHot: 4,
  myAppointmentsToday: 3,
  myPipelineValue: 286800,
  myMtdUnits: 8,
  myMtdGoal: 12,
};

export const consultantMyLeads = [
  { id: "ml1", name: "Marisol Ortiz", vehicle: "2025 Santa Fe Calligraphy", lastMsg: "Yes Saturday works! What time can I come by?", at: "7m", hot: 4, status: "Appt confirmed" },
  { id: "ml2", name: "James Liu", vehicle: "2024 Tucson Hybrid Ultimate", lastMsg: "Is the AWD model still available?", at: "3m", hot: 4, status: "Awaiting reply" },
  { id: "ml3", name: "Vince Demarco", vehicle: "2025 Palisade Calligraphy", lastMsg: "How firm are you on price?", at: "1h", hot: 3, status: "Negotiation" },
  { id: "ml4", name: "Trent Marlowe", vehicle: "2024 IONIQ 5 Preferred", lastMsg: "Booked — see you at 9.", at: "Yesterday", hot: 3, status: "Appt today 9 AM" },
  { id: "ml5", name: "Anita Roy", vehicle: "2024 Kona N Line", lastMsg: "Thanks for the quote — circling back end of week.", at: "Yesterday", hot: 2, status: "Follow-up Fri" },
  { id: "ml6", name: "Mike Donnelly", vehicle: "2024 Tucson Preferred", lastMsg: "Got delivery, thanks!", at: "2 days ago", hot: 1, status: "Closed" },
];

export const consultantToday = [
  { time: "9:00 AM", customer: "Trent Marlowe", vehicle: "2024 IONIQ 5 Preferred", kind: "Test drive", status: "confirmed" as const },
  { time: "10:30 AM", customer: "Marisol Ortiz", vehicle: "2025 Santa Fe Calligraphy", kind: "Walk-around", status: "confirmed" as const },
  { time: "3:00 PM", customer: "Vince Demarco", vehicle: "2025 Palisade Calligraphy", kind: "Test drive", status: "tentative" as const },
];

export const consultantMyHolds = [
  { vehicle: "2025 Santa Fe Calligraphy", vin: "KM8R7DGEXSH123456", price: 52499, holds: 1, dropsApproved: false },
  { vehicle: "2024 IONIQ 5 Preferred", vin: "KM8KMDA42RU001234", price: 47499, holds: 1, dropsApproved: true },
  { vehicle: "2025 Palisade Calligraphy", vin: "KM8R7DGEXSH987654", price: 56999, holds: 1, dropsApproved: false },
];

// ---------------------------------------------------------------------------
// Shared (inventory snippet that several screens reuse)
// ---------------------------------------------------------------------------

export const inventoryHighlights = [
  { vehicle: "2025 Hyundai Tucson Preferred", trim: "AWD", price: 33249, days: 12, vin: "5XYZUDLA8PG123456" },
  { vehicle: "2024 Hyundai IONIQ 5 Preferred", trim: "Long Range", price: 47499, days: 8, vin: "KM8KMDA42RU001234" },
  { vehicle: "2025 Hyundai Palisade Calligraphy", trim: "AWD", price: 56999, days: 19, vin: "KM8R7DGEXSH987654" },
  { vehicle: "2024 Hyundai Santa Fe XRT", trim: "AWD", price: 41995, days: 47, vin: "5XYZUDLA8PG369874" },
  { vehicle: "2025 Hyundai Tucson S", trim: "AWD", price: 40749, days: 49, vin: "5NMJCCDE4SH499388" },
];
