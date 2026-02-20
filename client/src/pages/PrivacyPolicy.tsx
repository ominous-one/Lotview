import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";

interface DealershipInfo {
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
}

export default function PrivacyPolicy() {
  const lastUpdated = "December 2, 2024";
  const platformName = "Lotview.ai";
  const platformEmail = "privacy@lotview.ai";
  const platformWebsite = "https://lotview.ai";

  const { data: dealership, isLoading } = useQuery<DealershipInfo>({
    queryKey: ["/api/public/dealership-info"],
  });

  const dealershipName = dealership?.name || "the dealership";
  const dealershipAddress = dealership?.address && dealership?.city && dealership?.province 
    ? `${dealership.address}, ${dealership.city}, ${dealership.province} ${dealership.postalCode || ""}`
    : null;
  const dealershipPhone = dealership?.phone;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <Skeleton className="h-8 w-48 mb-6" />
          <Card>
            <CardContent className="p-8">
              <Skeleton className="h-10 w-64 mb-4" />
              <Skeleton className="h-4 w-48 mb-8" />
              <div className="space-y-4">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="back-to-home">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Inventory
            </Button>
          </Link>
        </div>

        <Card>
          <CardContent className="prose dark:prose-invert max-w-none p-8">
            <h1 className="text-3xl font-bold mb-2" data-testid="privacy-title">Privacy Policy</h1>
            <p className="text-muted-foreground mb-6">Last Updated: {lastUpdated}</p>
            
            <Separator className="my-6" />

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">1. Introduction</h2>
              <p className="mb-4">
                This Privacy Policy explains how your personal information is collected, used, and protected when you use this vehicle inventory platform. This website is operated by <strong>{dealershipName}</strong> (the "Dealership") using the <strong>{platformName}</strong> platform (the "Platform Provider").
              </p>
              <p className="mb-4">
                <strong>Joint Data Controllers:</strong> For the purposes of data protection law, the Dealership and {platformName} act as joint controllers. The Dealership is responsible for customer relationship management and vehicle sales, while {platformName} provides the technical platform and data processing infrastructure.
              </p>
              <p className="mb-4">
                By using our services, you consent to the data practices described in this policy. If you do not agree with the terms of this Privacy Policy, please do not access or use our services.
              </p>
              <p className="mb-4">
                We comply with applicable privacy laws including the Personal Information Protection and Electronic Documents Act (PIPEDA) in Canada, the General Data Protection Regulation (GDPR) for European users, and the California Consumer Privacy Act (CCPA) for California residents.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">2. Information We Collect</h2>
              
              <h3 className="text-lg font-medium mb-3">2.1 Personal Information You Provide</h3>
              <p className="mb-4">We may collect personal information that you voluntarily provide, including:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Identity Data:</strong> Name, username, date of birth</li>
                <li><strong>Contact Data:</strong> Email address, phone number, mailing address, postal code</li>
                <li><strong>Account Data:</strong> Login credentials, account preferences (for dealership staff)</li>
                <li><strong>Transaction Data:</strong> Vehicle purchase history, financing applications, payment information</li>
                <li><strong>Communication Data:</strong> Chat transcripts, email inquiries, phone call records</li>
                <li><strong>Preference Data:</strong> Vehicle preferences, saved searches, watchlists</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">2.2 Vehicle Inventory Data (Dealership Partners)</h3>
              <p className="mb-4">For dealership partners, we collect and process:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Vehicle identification numbers (VINs)</li>
                <li>Vehicle specifications (make, model, year, mileage, condition, trim, body style)</li>
                <li>Pricing, availability, and financing information</li>
                <li>Vehicle images, videos, and descriptions</li>
                <li>Dealer business contact information and licensing details</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">2.3 Automatically Collected Information</h3>
              <p className="mb-4">When you access our services, we automatically collect:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Device Data:</strong> IP address, device type, operating system, browser type</li>
                <li><strong>Usage Data:</strong> Pages viewed, time spent, click patterns, navigation paths</li>
                <li><strong>Location Data:</strong> Approximate location based on IP address; precise location with your permission</li>
                <li><strong>Referral Data:</strong> How you arrived at our site, search terms used</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">3. Lawful Bases for Processing (GDPR)</h2>
              <p className="mb-4">We process your personal data based on the following legal grounds:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Consent:</strong> Where you have given explicit consent for marketing communications, targeted advertising, and non-essential cookies.</li>
                <li><strong>Contractual Necessity:</strong> To fulfill our obligations under service agreements with dealership partners and to process vehicle inquiries and purchases.</li>
                <li><strong>Legitimate Interests:</strong> For analytics, fraud prevention, security, service improvement, and customer support. Our legitimate interests do not override your fundamental rights.</li>
                <li><strong>Legal Obligation:</strong> To comply with tax, accounting, anti-money laundering, and other regulatory requirements.</li>
              </ul>
              <p className="mb-4">
                You may withdraw consent at any time without affecting the lawfulness of processing based on consent before withdrawal.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">4. Meta/Facebook Integration & Consent</h2>
              <p className="mb-4">
                Our platform integrates with Meta (Facebook) services for advertising and marketing purposes. This integration is subject to your explicit consent.
              </p>
              
              <h3 className="text-lg font-medium mb-3">4.1 Facebook Catalog API</h3>
              <p className="mb-4">
                We use the Facebook Catalog API to synchronize vehicle inventory for Automotive Inventory Ads. This allows us to display relevant vehicle listings to potential customers on Facebook, Instagram, and the Meta Audience Network.
              </p>
              <p className="mb-4">
                <strong>Data Shared via Catalog API:</strong>
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Vehicle information: VIN, make, model, year, mileage, price, images, body style, transmission, exterior color</li>
                <li>Dealer information: Dealership name, location, contact details</li>
                <li>Availability status and inventory updates</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">4.2 Facebook Pixel & Conversions API</h3>
              <p className="mb-4">
                With your consent, we may use the Facebook Pixel and Conversions API to track website interactions. This technology collects:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Page views and vehicle detail page visits</li>
                <li>Search queries and filter selections</li>
                <li>Form submissions and contact requests</li>
                <li>Device and browser information</li>
                <li>Conversion events (inquiries, applications)</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">4.3 Consent for Meta Integration</h3>
              <p className="mb-4">
                <strong>Before enabling Meta tracking:</strong>
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>We will request your explicit consent through our cookie consent banner</li>
                <li>Tracking cookies are blocked until consent is obtained</li>
                <li>You can withdraw consent at any time through your browser settings or by contacting us</li>
                <li>For EU/UK users, Meta Pixel is only activated after opt-in consent</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">4.4 Data Sharing with Meta</h3>
              <p className="mb-4">
                When you consent to Meta integration, data is shared with Meta for advertising purposes. Meta may use this data to:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Show you relevant vehicle advertisements</li>
                <li>Measure ad effectiveness and attribution</li>
                <li>Build custom and lookalike audiences</li>
                <li>Improve Meta's advertising products</li>
              </ul>
              <p className="mb-4">
                Meta processes this data as an independent controller. For more information, review the{" "}
                <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Meta Privacy Policy
                </a>.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">5. How We Use Your Information</h2>
              <p className="mb-4">We use collected information for the following purposes:</p>
              
              <h3 className="text-lg font-medium mb-3">5.1 Service Delivery</h3>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Display and manage vehicle inventory listings</li>
                <li>Respond to inquiries and facilitate vehicle purchases</li>
                <li>Process financing applications and payments</li>
                <li>Provide customer support via chat, email, and phone</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">5.2 Marketing & Advertising (With Consent)</h3>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Send promotional emails about new inventory and offers</li>
                <li>Run targeted advertising campaigns on social media platforms</li>
                <li>Retarget users who have visited specific vehicle pages</li>
                <li>Create personalized recommendations based on browsing history</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">5.3 Analytics & Improvement</h3>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Analyze usage patterns to improve our services</li>
                <li>Generate aggregated market insights for dealership partners</li>
                <li>Test new features and optimize user experience</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">5.4 Security & Compliance</h3>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Prevent fraud and unauthorized access</li>
                <li>Comply with legal obligations and regulatory requirements</li>
                <li>Enforce our Terms of Service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">6. Third-Party Service Providers</h2>
              <p className="mb-4">We share information with trusted third parties who assist us in operating our business:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>{platformName}:</strong> Platform provider for hosting, data processing, and infrastructure</li>
                <li><strong>Meta/Facebook:</strong> Advertising, catalog management, and audience targeting</li>
                <li><strong>Payment Processors:</strong> Secure payment handling (we do not store credit card numbers)</li>
                <li><strong>Cloud Hosting:</strong> Secure data storage and processing</li>
                <li><strong>AI Providers (OpenAI):</strong> AI-powered chat and vehicle descriptions</li>
                <li><strong>Vehicle Data Providers:</strong> VIN decoding, vehicle history (NHTSA, MarketCheck)</li>
                <li><strong>Email Services:</strong> Transactional and marketing email delivery</li>
              </ul>
              <p className="mb-4">
                All service providers are contractually required to protect your information, process it only for specified purposes, and comply with applicable data protection laws.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">7. International Data Transfers</h2>
              <p className="mb-4">
                Your personal data may be transferred to and processed in countries outside your country of residence, including the United States and Canada. These countries may have different data protection laws.
              </p>
              <p className="mb-4">
                <strong>Safeguards for International Transfers:</strong>
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Standard Contractual Clauses (SCCs):</strong> We use EU-approved SCCs for transfers from the EEA</li>
                <li><strong>Data Processing Agreements:</strong> All service providers sign binding agreements</li>
                <li><strong>Privacy Shield Successors:</strong> Where applicable, we rely on EU-US Data Privacy Framework certifications</li>
                <li><strong>Encryption:</strong> Data is encrypted in transit and at rest</li>
              </ul>
              <p className="mb-4">
                For more information about our data transfer practices, contact us at {platformEmail}.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">8. Cookies and Tracking Technologies</h2>
              <p className="mb-4">
                We use cookies and similar tracking technologies to enhance your experience:
              </p>
              
              <h3 className="text-lg font-medium mb-3">8.1 Types of Cookies</h3>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Strictly Necessary Cookies:</strong> Required for website functionality (authentication, security). Cannot be disabled.</li>
                <li><strong>Analytics Cookies:</strong> Help us understand how visitors use our site. Require consent.</li>
                <li><strong>Advertising Cookies:</strong> Used for targeted advertising (Facebook Pixel, etc.). Require explicit consent.</li>
                <li><strong>Preference Cookies:</strong> Remember your settings (theme, language). Require consent.</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">8.2 Managing Cookies</h3>
              <p className="mb-4">
                You can manage cookie preferences through:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Our cookie consent banner (shown on first visit)</li>
                <li>Your browser settings (blocking or deleting cookies)</li>
                <li>Third-party opt-out tools (listed in Section 10)</li>
              </ul>
              <p className="mb-4">
                Note: Disabling certain cookies may affect website functionality.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">9. Data Retention</h2>
              <p className="mb-4">
                We retain personal information only as long as necessary for the purposes outlined in this policy:
              </p>
              <table className="w-full border-collapse mb-4">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Data Type</th>
                    <th className="text-left p-2">Retention Period</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2">Account Data</td>
                    <td className="p-2">Duration of account + 7 years</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">Transaction Records</td>
                    <td className="p-2">7 years (legal requirement)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">Marketing Consent Records</td>
                    <td className="p-2">Until opt-out + 3 years</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">Website Analytics</td>
                    <td className="p-2">26 months (then anonymized)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">Chat Conversations</td>
                    <td className="p-2">3 years or until deletion request</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">Cookie Data</td>
                    <td className="p-2">13 months maximum</td>
                  </tr>
                </tbody>
              </table>
              <p className="mb-4">
                After retention periods expire, data is securely deleted or anonymized for statistical purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">10. Your Privacy Rights</h2>
              
              <h3 className="text-lg font-medium mb-3">10.1 Rights for All Users</h3>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Correction:</strong> Update inaccurate or incomplete data</li>
                <li><strong>Deletion:</strong> Request deletion of your personal data (subject to legal exceptions)</li>
                <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications at any time</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">10.2 GDPR Rights (European Users)</h3>
              <p className="mb-4">If you are in the European Economic Area (EEA), UK, or Switzerland, you have additional rights:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Right to Access:</strong> Obtain a copy of your personal data and information about processing</li>
                <li><strong>Right to Rectification:</strong> Correct inaccurate or incomplete data</li>
                <li><strong>Right to Erasure:</strong> Request deletion ("right to be forgotten")</li>
                <li><strong>Right to Restrict Processing:</strong> Limit how we use your data</li>
                <li><strong>Right to Data Portability:</strong> Receive your data in a machine-readable format</li>
                <li><strong>Right to Object:</strong> Object to processing based on legitimate interests or for direct marketing</li>
                <li><strong>Right to Withdraw Consent:</strong> Withdraw consent at any time without affecting prior processing</li>
                <li><strong>Right to Lodge Complaint:</strong> File a complaint with your local supervisory authority</li>
              </ul>
              <p className="mb-4">
                We will respond to GDPR requests within 30 days. Complex requests may take up to 90 days with notice.
              </p>

              <h3 className="text-lg font-medium mb-3">10.3 CCPA Rights (California Residents)</h3>
              <p className="mb-4">Under the California Consumer Privacy Act (CCPA), California residents have the right to:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Right to Know:</strong> Request disclosure of personal information collected, used, and shared in the past 12 months</li>
                <li><strong>Right to Delete:</strong> Request deletion of personal information we hold about you</li>
                <li><strong>Right to Opt-Out of Sale:</strong> Direct us not to "sell" your personal information</li>
                <li><strong>Right to Non-Discrimination:</strong> Receive equal service regardless of exercising privacy rights</li>
              </ul>
              <p className="mb-4">
                <strong>Do Not Sell My Personal Information:</strong> We do not sell personal information for monetary consideration. However, sharing data with advertising partners for targeted advertising may constitute a "sale" under CCPA. To opt out, contact us at {platformEmail} or use our cookie management tools.
              </p>
              <p className="mb-4">
                <strong>Authorized Agents:</strong> You may designate an authorized agent to make requests on your behalf. We will require verification of the agent's authority.
              </p>

              <h3 className="text-lg font-medium mb-3">10.4 PIPEDA Rights (Canadian Users)</h3>
              <p className="mb-4">Under the Personal Information Protection and Electronic Documents Act (PIPEDA), you have the right to:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Right to Access:</strong> Request access to your personal information and learn how it has been used and disclosed</li>
                <li><strong>Right to Accuracy:</strong> Challenge the accuracy and completeness of your personal information and have it amended as appropriate</li>
                <li><strong>Right to Consent:</strong> Provide or withdraw consent for the collection, use, or disclosure of your personal information, subject to legal or contractual restrictions</li>
                <li><strong>Right to Challenge Compliance:</strong> Challenge our compliance with PIPEDA by contacting our Privacy Officer or the Office of the Privacy Commissioner of Canada</li>
              </ul>
              <p className="mb-4">
                We will respond to PIPEDA access requests within 30 days. We may extend this timeline by up to 30 additional days with written notice and explanation.
              </p>

              <h3 className="text-lg font-medium mb-3">10.5 Advertising Opt-Out Options</h3>
              <p className="mb-4">To opt out of interest-based advertising:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>
                  <a href="https://www.facebook.com/settings/?tab=ads" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Facebook Ad Preferences
                  </a>
                </li>
                <li>
                  <a href="https://optout.networkadvertising.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Network Advertising Initiative (NAI)
                  </a>
                </li>
                <li>
                  <a href="https://optout.aboutads.info/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Digital Advertising Alliance (DAA)
                  </a>
                </li>
                <li>
                  <a href="https://youradchoices.ca/choices/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Digital Advertising Alliance of Canada (DAAC)
                  </a>
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">11. Data Security</h2>
              <p className="mb-4">
                We implement comprehensive security measures to protect your information:
              </p>
              
              <h3 className="text-lg font-medium mb-3">11.1 Technical Safeguards</h3>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Encryption:</strong> TLS 1.3 for data in transit; AES-256 for data at rest</li>
                <li><strong>Access Controls:</strong> Role-based access with multi-factor authentication for staff</li>
                <li><strong>Password Security:</strong> Bcrypt hashing with salting</li>
                <li><strong>Network Security:</strong> Firewalls, intrusion detection, DDoS protection</li>
                <li><strong>Secure Development:</strong> Regular code reviews and security testing</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">11.2 Organizational Measures</h3>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Employee training on data protection and security</li>
                <li>Background checks for staff with data access</li>
                <li>Vendor security assessments</li>
                <li>Regular security audits and penetration testing</li>
                <li>Incident response procedures</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">11.3 Data Breach Notification</h3>
              <p className="mb-4">
                In the event of a data breach affecting your personal information:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>We will notify you within 72 hours of discovery (GDPR requirement)</li>
                <li>We will inform relevant supervisory authorities as required by law</li>
                <li>We will provide details about the breach and steps to protect yourself</li>
                <li>We will document all breaches and remediation actions</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">12. Children's Privacy</h2>
              <p className="mb-4">
                Our services are not intended for children under 18 years of age. We do not knowingly collect personal information from children under 18. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately at {platformEmail}.
              </p>
              <p className="mb-4">
                If we discover that we have collected personal information from a child under 18, we will delete that information as quickly as possible.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">13. Changes to This Policy</h2>
              <p className="mb-4">
                We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements.
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Notification:</strong> We will post the updated policy on this page and update the "Last Updated" date</li>
                <li><strong>Material Changes:</strong> For significant changes, we will provide prominent notice (e.g., email notification, website banner)</li>
                <li><strong>Consent:</strong> Where required by law, we will obtain your consent before implementing material changes</li>
              </ul>
              <p className="mb-4">
                Continued use of our services after changes become effective constitutes acceptance of the updated policy. We encourage you to review this policy periodically.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">14. Contact Us</h2>
              <p className="mb-4">
                If you have questions about this Privacy Policy, wish to exercise your privacy rights, or have concerns about our data practices, please contact:
              </p>
              
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-semibold mb-2">Dealership (Customer Inquiries)</p>
                  <p className="font-medium">{dealershipName}</p>
                  {dealershipAddress && <p className="text-sm">{dealershipAddress}</p>}
                  {dealershipPhone && <p className="text-sm">Phone: {dealershipPhone}</p>}
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-semibold mb-2">Platform Provider (Data & Privacy)</p>
                  <p className="font-medium">{platformName}</p>
                  <p className="text-sm">Email: <a href={`mailto:${platformEmail}`} className="text-primary hover:underline">{platformEmail}</a></p>
                  <p className="text-sm">Website: <a href={platformWebsite} className="text-primary hover:underline">{platformWebsite}</a></p>
                </div>
              </div>

              <p className="mb-4">
                <strong>Response Time:</strong> We will acknowledge receipt of your request within 5 business days and provide a substantive response within 30 days (or 45 days for complex requests, with notice).
              </p>
              <p className="mb-4">
                <strong>Complaints:</strong> If you are not satisfied with our response, you may file a complaint with your local data protection authority:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li><strong>Canada:</strong> Office of the Privacy Commissioner of Canada - <a href="https://www.priv.gc.ca" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">priv.gc.ca</a></li>
                <li><strong>EU:</strong> Your local Data Protection Authority</li>
                <li><strong>California:</strong> California Attorney General - <a href="https://oag.ca.gov/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">oag.ca.gov/privacy</a></li>
              </ul>
            </section>

            <Separator className="my-6" />

            <div className="flex flex-col sm:flex-row gap-4 mt-8">
              <Link href="/terms-of-service">
                <Button variant="outline" data-testid="link-terms">View Terms of Service</Button>
              </Link>
              <Link href="/">
                <Button data-testid="link-inventory">Back to Inventory</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
