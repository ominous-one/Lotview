import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  Check,
  ClipboardCheck,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Truck,
} from "lucide-react";

const appUrl = "https://app.lotview.ai";
const demoUrl = "mailto:charlie@lotview.ai?subject=Lotview%20demo%20request";

const inventoryVisual = new URL("../../attached_assets/image_1765329726512.png", import.meta.url).href;
const conversationsVisual = new URL("../../attached_assets/image_1765389083903.png", import.meta.url).href;

const operatingNotes = [
  {
    label: "Inventory",
    text: "Photos, prices, payment cues, and readiness stay visible before a shopper finds the mismatch.",
  },
  {
    label: "Leads",
    text: "Every reply keeps the vehicle, shopper intent, and appointment ask in the same view.",
  },
  {
    label: "Management",
    text: "The floor sees what is live, what is blocked, and what needs a decision today.",
  },
];

const dealershipMoments = [
  {
    time: "8:10 AM",
    title: "The car is online, but the facts changed",
    text: "Photos, prices, source facts, and marketplace posts change all day. Lotview gives managers a place to catch the mismatch before a shopper does.",
  },
  {
    time: "11:42 AM",
    title: "The buyer asked after your team got busy",
    text: "Every inquiry needs vehicle context, payment awareness, and a clear appointment ask. Lotview keeps the response grounded in the car the shopper actually wants.",
  },
  {
    time: "4:05 PM",
    title: "Nobody is sure what is actually live",
    text: "A workflow is not ready because it looks finished. Lotview keeps readiness, blockers, and operating proof visible before managers trust it with customers.",
  },
];

const workflow = [
  {
    icon: RefreshCw,
    title: "Inventory desk",
    text: "Review source truth, photos, pricing, payment framing, and vehicle readiness from one operating view.",
  },
  {
    icon: MessageSquare,
    title: "Response desk",
    text: "Draft replies from the exact vehicle record and keep the conversation pointed at a next appointment.",
  },
  {
    icon: ShieldCheck,
    title: "Operator control",
    text: "Keep dealership boundaries, roles, and launch evidence inside the work managers already review.",
  },
];

const launchChecklist = [
  "Public sales page on lotview.ai",
  "Private dealer app on app.lotview.ai",
  "Inventory and CRM workflows connected",
  "Manager handoff built around real floor use",
];

function MarketingNav() {
  return (
    <header className="marketing-nav">
      <a className="marketing-brand" href="/" aria-label="Lotview home">
        <span className="brand-mark">LV</span>
        <span>Lotview</span>
      </a>
      <nav aria-label="Marketing navigation">
        <a href="#why">Why</a>
        <a href="#platform">Platform</a>
        <a href="#workflow">Workflow</a>
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

export function MarketingHome() {
  return (
    <div className="marketing-page">
      <MarketingNav />

      <main>
        <section className="marketing-hero">
          <div className="hero-layout">
            <div className="hero-copy">
              <span className="hero-kicker">
                <Truck size={16} />
                Used inventory operations platform
              </span>
              <h1>Lotview</h1>
              <p className="hero-statement">Turn live inventory into cleaner replies and better appointments.</p>
              <p className="hero-body">
                Lotview gives used-car teams one operating view for inventory readiness, buyer follow-up, and manager
                handoff, so the public site sells while the private app keeps the floor aligned.
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
              <div className="hero-proof-line" aria-label="Lotview operating proof">
                <span>
                  <strong>Public pages</strong>
                  <em>Vehicle cards with payment context and appointment CTAs.</em>
                </span>
                <span>
                  <strong>Private workflow</strong>
                  <em>Inventory review, lead response, and follow-up in one place.</em>
                </span>
                <span>
                  <strong>Manager proof</strong>
                  <em>Launch status, blockers, and customer-facing readiness.</em>
                </span>
              </div>
            </div>

            <figure className="hero-media">
              <div className="hero-image-frame">
                <img src={inventoryVisual} alt="Lotview dealership inventory storefront with vehicle cards and appointment actions" />
              </div>
              <figcaption>
                <strong>What buyers see before they call.</strong>
                <span>Inventory pages with payment cues, vehicle proof, and appointment CTAs.</span>
              </figcaption>
            </figure>
          </div>

          <div className="operating-strip" aria-label="How Lotview helps dealership teams">
            {operatingNotes.map((note) => (
              <article key={note.label}>
                <span>{note.label}</span>
                <p>{note.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section dealership-day-section" id="why">
          <div className="section-heading section-heading-wide">
            <span>Where deals leak</span>
            <h2>A used-car shopper does not care which system dropped the handoff.</h2>
          </div>
          <div className="dealership-day-list">
            {dealershipMoments.map(({ time, title, text }) => (
              <article className="day-row" key={title}>
                <span>{time}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="product-proof-band" id="platform">
          <div className="product-visual">
            <img src={conversationsVisual} alt="Lotview conversation workspace with AI assistant suggested reply" />
          </div>
          <div className="product-copy">
            <span>Platform</span>
            <h2>The manager workspace behind every public promise.</h2>
            <p>
              The app is built around the manager's day: check what inventory can be trusted, see exactly what the
              shopper asked for, and move the team toward the next appointment while the details are still fresh.
            </p>
            <div className="product-proof-list">
              <div>
                <ClipboardCheck size={20} />
                <strong>Fix the record before a customer sees it.</strong>
              </div>
              <div>
                <CalendarCheck size={20} />
                <strong>Keep the appointment ask attached to the reply.</strong>
              </div>
              <div>
                <BarChart3 size={20} />
                <strong>Keep launch evidence tied to the live domains.</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="workflow-section" id="workflow">
          <div className="section-heading section-heading-wide">
            <span>Workflow</span>
            <h2>Designed for the rhythm of a dealership floor.</h2>
          </div>
          <div className="workflow-grid">
            {workflow.map(({ icon: Icon, title, text }) => (
              <article className="workflow-card" key={title}>
                <Icon size={22} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="launch-section" id="launch">
          <div className="launch-panel">
            <div>
              <span>Launch</span>
              <h2>Public sales page in front. Private operating app behind it.</h2>
              <p>
                The marketing site should make the offer obvious. The app should stay focused on authenticated
                dealership work, clean inventory, and the next appointment.
              </p>
            </div>
            <ul className="launch-checklist">
              {launchChecklist.map((item) => (
                <li key={item}>
                  <Check size={15} />
                  {item}
                </li>
              ))}
            </ul>
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
          <p>Used inventory, lead response, and appointment workflows for dealership teams.</p>
        </div>
        <div className="marketing-footer-links">
          <a href="#why">Why</a>
          <a href="#platform">Platform</a>
          <a href={appUrl}>Sign in</a>
          <a href={demoUrl}>Request demo</a>
        </div>
      </footer>
    </div>
  );
}
