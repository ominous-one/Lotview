import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  Check,
  ClipboardCheck,
  Gauge,
  Inbox,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Truck,
  Zap,
} from "lucide-react";

const appUrl = "https://app.lotview.ai";
const demoUrl = "mailto:charlie@lotview.ai?subject=Lotview%20demo%20request";

const capabilities = [
  {
    icon: Truck,
    title: "Inventory stays current",
    text: "Scrape, normalize, and review listings before they become customer-facing inventory.",
  },
  {
    icon: MessageSquare,
    title: "Leads get immediate context",
    text: "Route conversations with the right vehicle, customer intent, and next action already attached.",
  },
  {
    icon: CalendarCheck,
    title: "Appointments are the goal",
    text: "Keep sales teams focused on booked visits, follow-ups, and the highest-value work.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant-safe by design",
    text: "Dealership boundaries, permissions, and production proof are treated as launch requirements.",
  },
];

const proofPoints = ["Live inventory checks", "CRM workflow controls", "Marketplace queue review", "Readiness monitoring"];

const launchPlans = [
  {
    name: "Inventory OS",
    fit: "For dealers that need one trusted place to review inventory, source proof, and publishing blockers.",
    features: ["Inventory certification", "Vehicle readiness queues", "Source-truth reporting", "Manager review workflow"],
  },
  {
    name: "Growth Automation",
    fit: "For teams ready to connect lead response, Marketplace workflows, and appointment-focused follow-up.",
    features: ["AI-assisted lead response", "Appointment follow-up queues", "Marketplace review controls", "CRM workflow alignment"],
    featured: true,
  },
  {
    name: "Dealer Group",
    fit: "For multi-location operators that need tenant boundaries, role-aware access, and rollout proof.",
    features: ["Multi-store configuration", "Role and permission model", "Launch readiness evidence", "Operator reporting"],
  },
];

function MarketingNav() {
  return (
    <header className="marketing-nav">
      <a className="marketing-brand" href="/" aria-label="Lotview home">
        <span className="brand-mark">LV</span>
        <span>Lotview</span>
      </a>
      <nav aria-label="Marketing navigation">
        <a href="#platform">Platform</a>
        <a href="#workflow">Workflow</a>
        <a href="#offer">Offer</a>
        <a href="#launch">Launch</a>
      </nav>
      <div className="marketing-nav-actions">
        <a className="marketing-link-button" href={appUrl}>
          Sign in
        </a>
        <a className="marketing-primary-button" href={demoUrl}>
          Request demo
          <ArrowRight size={17} />
        </a>
      </div>
    </header>
  );
}

function HeroScene() {
  return (
    <div className="hero-scene" aria-hidden="true">
      <div className="scene-toolbar">
        <span />
        <span />
        <span />
        <strong>dealership.lotview.ai</strong>
      </div>
      <div className="scene-grid">
        <div className="scene-panel scene-inventory">
          <div className="scene-panel-heading">
            <Truck size={16} />
            <span>Inventory command</span>
          </div>
          <div className="vehicle-preview">
            <div className="vehicle-photo">
              <span>2024 SUV</span>
            </div>
            <div>
              <strong>Fresh arrival</strong>
              <span>Photos, VIN, price, and source proof ready for review.</span>
            </div>
          </div>
          <div className="scene-metrics">
            <div>
              <span>Active</span>
              <strong>128</strong>
            </div>
            <div>
              <span>Review</span>
              <strong>12</strong>
            </div>
            <div>
              <span>Blocked</span>
              <strong>3</strong>
            </div>
          </div>
        </div>
        <div className="scene-panel scene-leads">
          <div className="scene-panel-heading">
            <Inbox size={16} />
            <span>Lead response</span>
          </div>
          <div className="lead-thread">
            <p>Customer asked about payments and availability.</p>
            <p>AI draft prepared with the selected vehicle and appointment ask.</p>
          </div>
        </div>
        <div className="scene-panel scene-proof">
          <div className="scene-panel-heading">
            <Gauge size={16} />
            <span>Launch proof</span>
          </div>
          <ul>
            {proofPoints.map((point) => (
              <li key={point}>
                <Check size={14} />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function MarketingHome() {
  return (
    <div className="marketing-page">
      <MarketingNav />

      <main>
        <section className="marketing-hero">
          <HeroScene />
          <div className="hero-copy">
            <span className="hero-kicker">
              <Sparkles size={16} />
              Used car dominance, automated
            </span>
            <h1>Lotview</h1>
            <p>
              The AI dealership operating system that keeps inventory clean, answers shoppers with context, and turns
              every qualified lead toward a booked appointment.
            </p>
            <div className="hero-actions">
              <a className="marketing-primary-button marketing-primary-button-large" href={demoUrl}>
                Request demo
                <ArrowRight size={18} />
              </a>
              <a className="marketing-secondary-button" href={appUrl}>
                Open app
              </a>
            </div>
            <dl className="hero-proof">
              <div>
                <dt>24/7</dt>
                <dd>Lead coverage</dd>
              </div>
              <div>
                <dt>1</dt>
                <dd>Inventory source of truth</dd>
              </div>
              <div>
                <dt>Live</dt>
                <dd>Readiness monitoring</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="marketing-section platform-section" id="platform">
          <div className="section-heading">
            <span>Platform</span>
            <h2>Everything between inventory and the appointment, organized in one place.</h2>
          </div>
          <div className="capability-grid">
            {capabilities.map(({ icon: Icon, title, text }) => (
              <article className="capability-card" key={title}>
                <Icon size={22} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="workflow-band" id="workflow">
          <div className="workflow-copy">
            <span>Workflow</span>
            <h2>From source data to sales action without the daily spreadsheet chase.</h2>
            <p>
              Lotview connects operational proof, sales follow-up, and inventory readiness so managers can see what is
              ready, what is blocked, and what needs a human decision.
            </p>
          </div>
          <div className="workflow-steps">
            <article>
              <ClipboardCheck size={21} />
              <strong>1. Certify inventory</strong>
              <span>Review source facts, photo readiness, pricing, and tenant ownership before publishing.</span>
            </article>
            <article>
              <Zap size={21} />
              <strong>2. Activate follow-up</strong>
              <span>Give sales teams a focused queue for responses, appointments, and campaign timing.</span>
            </article>
            <article>
              <BarChart3 size={21} />
              <strong>3. Manage proof</strong>
              <span>Track readiness, blockers, and launch checks before calling a feature production-ready.</span>
            </article>
          </div>
        </section>

        <section className="offer-section" id="offer">
          <div className="section-heading">
            <span>Offer</span>
            <h2>Built around the dealership workflows that create real sales lift.</h2>
          </div>
          <div className="offer-grid">
            {launchPlans.map((plan) => (
              <article className={plan.featured ? "offer-card offer-card-featured" : "offer-card"} key={plan.name}>
                <div>
                  <h3>{plan.name}</h3>
                  <p>{plan.fit}</p>
                </div>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check size={15} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="launch-section" id="launch">
          <div className="launch-panel">
            <div>
              <span>Launch</span>
              <h2>Ready for a serious dealership workflow, not a demo shell.</h2>
              <p>
                We help configure the app, connect inventory and CRM workflows, and keep launch evidence visible so your
                team knows what is live.
              </p>
            </div>
            <a className="marketing-primary-button marketing-primary-button-large" href={demoUrl}>
              Talk to Lotview
              <ArrowRight size={18} />
            </a>
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <div>
          <a className="marketing-brand marketing-footer-brand" href="/" aria-label="Lotview home">
            <span className="brand-mark">LV</span>
            <span>Lotview</span>
          </a>
          <p>AI dealership operations for inventory, lead response, and appointment workflows.</p>
        </div>
        <div className="marketing-footer-links">
          <a href="#platform">Platform</a>
          <a href="#workflow">Workflow</a>
          <a href={appUrl}>Sign in</a>
          <a href={demoUrl}>Request demo</a>
        </div>
      </footer>
    </div>
  );
}
