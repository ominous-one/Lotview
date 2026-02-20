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

export default function TermsOfService() {
  const lastUpdated = "December 2, 2024";
  const platformName = "Lotview.ai";
  const platformEmail = "legal@lotview.ai";
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
            <h1 className="text-3xl font-bold mb-2" data-testid="terms-title">Terms of Service</h1>
            <p className="text-muted-foreground mb-6">Last Updated: {lastUpdated}</p>
            
            <Separator className="my-6" />

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p className="mb-4">
                Welcome to this vehicle inventory platform. These Terms of Service ("Terms") govern your access to and use of this website, which is operated by <strong>{dealershipName}</strong> (the "Dealership") using the <strong>{platformName}</strong> platform (the "Platform Provider").
              </p>
              <p className="mb-4">
                <strong>BY ACCESSING OR USING THIS WEBSITE, YOU AGREE TO BE BOUND BY THESE TERMS.</strong> If you do not agree to these Terms, you must not access or use the website.
              </p>
              <p className="mb-4">
                These Terms apply to all visitors, customers, and users who access or use this website. Separate terms may apply to dealership partners who subscribe to the {platformName} platform.
              </p>
              <p className="mb-4">
                <strong>Age Requirement:</strong> You must be at least 18 years old and have the legal capacity to enter into binding contracts to use this website.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">2. Description of Service</h2>
              <p className="mb-4">
                This website provides a vehicle inventory browsing and inquiry platform operated by {dealershipName} on the {platformName} platform. Services include:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Vehicle inventory browsing and search functionality</li>
                <li>Vehicle detail pages with specifications, photos, and pricing</li>
                <li>Financing calculator and payment estimation tools</li>
                <li>Contact forms and inquiry submission</li>
                <li>AI-powered chat assistance</li>
                <li>Vehicle comparison and watchlist features</li>
              </ul>
              <p className="mb-4">
                This website is intended solely for lawful purposes related to vehicle shopping and dealership inquiries.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">3. Vehicle Listings & Pricing</h2>
              
              <h3 className="text-lg font-medium mb-3">3.1 Accuracy of Information</h3>
              <p className="mb-4">
                While we strive to provide accurate vehicle information, all listings are subject to:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Prior sale or removal without notice</li>
                <li>Typographical errors or omissions</li>
                <li>Changes in pricing, availability, or specifications</li>
                <li>Verification at the dealership before purchase</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">3.2 Pricing Disclaimer</h3>
              <p className="mb-4">
                Prices displayed are in Canadian Dollars (CAD) unless otherwise noted. Displayed prices:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>May not include taxes, fees, or additional charges</li>
                <li>Are subject to change without notice</li>
                <li>Are not binding offers until confirmed in writing by the dealership</li>
                <li>May differ from final purchase price</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">3.3 Financing Estimates</h3>
              <p className="mb-4">
                Payment calculations are estimates only and do not constitute financing offers. Actual financing terms depend on creditworthiness, lender approval, and other factors. Contact the dealership for official financing quotes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">4. User Conduct</h2>
              <p className="mb-4">You agree NOT to use this website to:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Provide false, misleading, or fraudulent information</li>
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe on intellectual property rights</li>
                <li>Upload malware, viruses, or harmful code</li>
                <li>Attempt to gain unauthorized access to systems or data</li>
                <li>Scrape, harvest, or collect data without permission</li>
                <li>Interfere with the proper functioning of the website</li>
                <li>Harass, abuse, or threaten dealership staff or other users</li>
                <li>Use the website for purposes unrelated to vehicle shopping</li>
              </ul>
              <p className="mb-4">
                Violation of these rules may result in immediate termination of access without notice.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">5. Third-Party Integrations</h2>
              
              <h3 className="text-lg font-medium mb-3">5.1 Platform Provider</h3>
              <p className="mb-4">
                This website is powered by {platformName}, which provides the technical infrastructure, hosting, and data processing services. By using this website, you also agree to {platformName}'s data practices as described in our Privacy Policy.
              </p>

              <h3 className="text-lg font-medium mb-3">5.2 Meta/Facebook Integration</h3>
              <p className="mb-4">
                This website may integrate with Meta platforms (Facebook, Instagram) for advertising purposes. By enabling these integrations (with your consent), you agree to:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Meta's Terms of Service and Commerce Policies</li>
                <li>Data sharing as described in our Privacy Policy</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">5.3 Other Third-Party Services</h3>
              <p className="mb-4">
                This website may integrate with payment processors, VIN decoders, and other third-party services. Your use of these services is subject to their respective terms and conditions. We are not responsible for third-party service availability or performance.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">6. Service Level (Platform)</h2>
              
              <h3 className="text-lg font-medium mb-3">6.1 Uptime Target</h3>
              <p className="mb-4">
                {platformName} targets 99.5% monthly uptime for the platform infrastructure. However, occasional downtime may occur for maintenance or due to factors beyond our control.
              </p>

              <h3 className="text-lg font-medium mb-3">6.2 Exclusions</h3>
              <p className="mb-4">Downtime exclusions include:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Scheduled maintenance (with advance notice)</li>
                <li>Emergency maintenance for security or stability</li>
                <li>Outages caused by factors outside our control (ISP failures, DDoS attacks)</li>
                <li>Third-party service unavailability</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">6.3 Service Credits (Dealership Partners)</h3>
              <p className="mb-4">
                Dealership partners with paid subscriptions may be eligible for service credits if uptime falls below targets:
              </p>
              <table className="w-full border-collapse mb-4">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Monthly Uptime</th>
                    <th className="text-left p-2">Service Credit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2">99.0% - 99.5%</td>
                    <td className="p-2">10% of monthly fee</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">95.0% - 99.0%</td>
                    <td className="p-2">25% of monthly fee</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">Below 95.0%</td>
                    <td className="p-2">50% of monthly fee</td>
                  </tr>
                </tbody>
              </table>

              <h3 className="text-lg font-medium mb-3">6.4 Support Response Times (Dealership Partners)</h3>
              <table className="w-full border-collapse mb-4">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Severity</th>
                    <th className="text-left p-2">Definition</th>
                    <th className="text-left p-2">Response Target</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2">Critical</td>
                    <td className="p-2">Service completely unavailable</td>
                    <td className="p-2">1 hour</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">High</td>
                    <td className="p-2">Major feature impaired</td>
                    <td className="p-2">4 hours</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">Medium</td>
                    <td className="p-2">Minor feature issue</td>
                    <td className="p-2">1 business day</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2">Low</td>
                    <td className="p-2">Question or request</td>
                    <td className="p-2">2 business days</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">7. Intellectual Property</h2>
              
              <h3 className="text-lg font-medium mb-3">7.1 Platform Intellectual Property</h3>
              <p className="mb-4">
                The {platformName} platform, including its design, features, functionality, and software, is owned by {platformName} and protected by intellectual property laws.
              </p>

              <h3 className="text-lg font-medium mb-3">7.2 Dealership Content</h3>
              <p className="mb-4">
                Vehicle listings, images, and dealership-specific content are owned by {dealershipName}. You may not copy, reproduce, or distribute this content without permission.
              </p>

              <h3 className="text-lg font-medium mb-3">7.3 Limited License</h3>
              <p className="mb-4">
                We grant you a limited, non-exclusive, non-transferable license to access and use this website for personal, non-commercial vehicle shopping purposes.
              </p>

              <h3 className="text-lg font-medium mb-3">7.4 Restrictions</h3>
              <p className="mb-4">You may not:</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Copy, modify, or distribute website content without permission</li>
                <li>Reverse engineer, decompile, or disassemble the platform</li>
                <li>Remove any proprietary notices or labels</li>
                <li>Use the website for commercial purposes without authorization</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">8. Disclaimer of Warranties</h2>
              <p className="mb-4 font-semibold">
                THIS WEBSITE AND ALL CONTENT ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>WARRANTIES OF MERCHANTABILITY</li>
                <li>FITNESS FOR A PARTICULAR PURPOSE</li>
                <li>NON-INFRINGEMENT</li>
                <li>ACCURACY OR COMPLETENESS OF VEHICLE LISTINGS</li>
                <li>UNINTERRUPTED OR ERROR-FREE OPERATION</li>
              </ul>
              <p className="mb-4">
                We do not warrant that vehicle information is accurate, complete, or current. Always verify vehicle details with the dealership before making any purchase decisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">9. Limitation of Liability</h2>
              
              <h3 className="text-lg font-medium mb-3">9.1 Liability Cap</h3>
              <p className="mb-4 font-semibold">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER THE DEALERSHIP NOR {platformName.toUpperCase()} SHALL BE LIABLE FOR DAMAGES EXCEEDING ONE HUNDRED CANADIAN DOLLARS ($100 CAD) ARISING FROM YOUR USE OF THIS WEBSITE.
              </p>

              <h3 className="text-lg font-medium mb-3">9.2 Exclusion of Damages</h3>
              <p className="mb-4 font-semibold">
                WE ARE NOT LIABLE FOR:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES</li>
                <li>LOST PROFITS, DATA, OR BUSINESS OPPORTUNITIES</li>
                <li>VEHICLE PURCHASE DECISIONS BASED ON WEBSITE INFORMATION</li>
                <li>ACTIONS OF THIRD PARTIES OR OTHER USERS</li>
                <li>INACCURATE VEHICLE LISTINGS OR PRICING</li>
              </ul>

              <h3 className="text-lg font-medium mb-3">9.3 Exceptions</h3>
              <p className="mb-4">
                These limitations do not apply to death or personal injury caused by negligence, fraud, or any liability that cannot be excluded by law.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">10. Indemnification</h2>
              <p className="mb-4">
                You agree to indemnify, defend, and hold harmless both {dealershipName} and {platformName}, their officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from:
              </p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Your use of this website</li>
                <li>Your violation of these Terms or any applicable law</li>
                <li>Your violation of any third-party rights</li>
                <li>Any false or misleading information you provide</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">11. Modifications</h2>
              
              <h3 className="text-lg font-medium mb-3">11.1 Modifications to Terms</h3>
              <p className="mb-4">
                We reserve the right to modify these Terms at any time. Changes will be posted on this page with an updated "Last Updated" date. Continued use of the website after changes constitutes acceptance.
              </p>

              <h3 className="text-lg font-medium mb-3">11.2 Modifications to Website</h3>
              <p className="mb-4">
                We may modify, add, or discontinue features at any time without notice.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">12. Dispute Resolution</h2>
              
              <h3 className="text-lg font-medium mb-3">12.1 Governing Law</h3>
              <p className="mb-4">
                These Terms are governed by and construed in accordance with the laws of the Province of British Columbia, Canada, without regard to conflict of law principles.
              </p>

              <h3 className="text-lg font-medium mb-3">12.2 Informal Resolution</h3>
              <p className="mb-4">
                Before initiating formal proceedings, you agree to contact us and attempt to resolve the dispute informally for at least 30 days.
              </p>

              <h3 className="text-lg font-medium mb-3">12.3 Mediation</h3>
              <p className="mb-4">
                If informal resolution fails, either party may initiate non-binding mediation before a mutually agreed mediator in Vancouver, British Columbia. Each party bears their own mediation costs; mediator fees are split equally.
              </p>

              <h3 className="text-lg font-medium mb-3">12.4 Jurisdiction and Venue</h3>
              <p className="mb-4">
                If mediation fails, any legal action shall be brought exclusively in the courts of British Columbia, Canada. You consent to the personal jurisdiction of such courts.
              </p>

              <h3 className="text-lg font-medium mb-3">12.5 Class Action Waiver</h3>
              <p className="mb-4">
                To the extent permitted by law, you agree to resolve disputes individually and waive the right to participate in class actions, class arbitrations, or representative proceedings.
              </p>

              <h3 className="text-lg font-medium mb-3">12.6 Time Limitation</h3>
              <p className="mb-4">
                Any claim arising from these Terms or this website must be brought within one (1) year of the date the claim arose, or it is permanently barred.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">13. General Provisions</h2>
              
              <h3 className="text-lg font-medium mb-3">13.1 Entire Agreement</h3>
              <p className="mb-4">
                These Terms, together with our Privacy Policy, constitute the entire agreement regarding your use of this website.
              </p>

              <h3 className="text-lg font-medium mb-3">13.2 Severability</h3>
              <p className="mb-4">
                If any provision is found unenforceable, that provision will be modified to the minimum extent necessary, and the remaining provisions remain in effect.
              </p>

              <h3 className="text-lg font-medium mb-3">13.3 Waiver</h3>
              <p className="mb-4">
                Failure to enforce any right does not constitute a waiver of that right.
              </p>

              <h3 className="text-lg font-medium mb-3">13.4 Force Majeure</h3>
              <p className="mb-4">
                Neither party is liable for delays or failures due to circumstances beyond reasonable control (natural disasters, war, government actions, internet outages, pandemic, etc.).
              </p>

              <h3 className="text-lg font-medium mb-3">13.5 Notices</h3>
              <p className="mb-4">
                Notices may be provided by email, in-app notification, or posting on this website.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">14. Contact Information</h2>
              <p className="mb-4">
                For questions about these Terms of Service, please contact:
              </p>
              
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-semibold mb-2">Dealership (Vehicle & Sales Inquiries)</p>
                  <p className="font-medium">{dealershipName}</p>
                  {dealershipAddress && <p className="text-sm">{dealershipAddress}</p>}
                  {dealershipPhone && <p className="text-sm">Phone: {dealershipPhone}</p>}
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-semibold mb-2">Platform Provider (Technical & Legal)</p>
                  <p className="font-medium">{platformName}</p>
                  <p className="text-sm">Email: <a href={`mailto:${platformEmail}`} className="text-primary hover:underline">{platformEmail}</a></p>
                  <p className="text-sm">Website: <a href={platformWebsite} className="text-primary hover:underline">{platformWebsite}</a></p>
                </div>
              </div>
            </section>

            <Separator className="my-6" />

            <div className="flex flex-col sm:flex-row gap-4 mt-8">
              <Link href="/privacy-policy">
                <Button variant="outline" data-testid="link-privacy">View Privacy Policy</Button>
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
