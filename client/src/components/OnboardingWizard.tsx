import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Building2, Palette, Plug, DollarSign, Users, Rocket, 
  Check, ChevronLeft, ChevronRight, Loader2, AlertCircle, 
  Eye, EyeOff, Plus, Trash2, CheckCircle2, XCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingFormData {
  dealership: {
    name: string;
    slug: string;
    subdomain: string;
    address?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    phone?: string;
    timezone: string;
    defaultCurrency: string;
  };
  branding: {
    primaryColor: string;
    secondaryColor: string;
    logoUrl?: string;
    faviconUrl?: string;
    heroImageUrl?: string;
    heroHeadline?: string;
    heroSubheadline?: string;
    tagline?: string;
    customCss?: string;
    promoBannerText?: string;
    promoBannerActive?: boolean;
  };
  apiKeys: {
    openaiApiKey?: string;
    marketcheckKey?: string;
    apifyToken?: string;
    apifyActorId?: string;
    geminiApiKey?: string;
    ghlApiKey?: string;
    ghlLocationId?: string;
    facebookAppId?: string;
    facebookAppSecret?: string;
    gtmContainerId?: string;
    googleAnalyticsId?: string;
    googleAdsId?: string;
    facebookPixelId?: string;
  };
  financing: {
    defaultDownPayment: number;
    minDownPayment: number;
    maxTerm: number;
    defaultAdminFee: number;
    defaultDocFee: number;
    defaultLienFee: number;
    ppsa: number;
    taxRate: number;
  };
  scrapeSources: Array<{
    sourceName: string;
    sourceUrl: string;
    sourceType: string;
    scrapeFrequency: string;
  }>;
  masterAdmin: {
    name: string;
    email: string;
    password: string;
  };
  additionalStaff: Array<{
    name: string;
    email: string;
    role: 'manager' | 'salesperson';
  }>;
  seedDefaults: {
    creditTiers: boolean;
    modelYearTerms: boolean;
    chatPrompts: boolean;
    adTemplates: boolean;
  };
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

const STEPS: OnboardingStep[] = [
  { id: 'identity', title: 'Identity & Contact', description: 'Basic dealership information', icon: Building2 },
  { id: 'branding', title: 'Branding', description: 'Colors, logo, and visual identity', icon: Palette },
  { id: 'integrations', title: 'API Integrations', description: 'Connect external services', icon: Plug },
  { id: 'financing', title: 'Financing & Sources', description: 'Payment rules and inventory sources', icon: DollarSign },
  { id: 'staff', title: 'Staff & Review', description: 'Admin users and final review', icon: Users },
];

const PROVINCES = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
  'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island',
  'Quebec', 'Saskatchewan', 'Yukon'
];

const PROVINCE_TAX_RATES: Record<string, { rate: number; breakdown: string }> = {
  'Alberta': { rate: 5, breakdown: '5% GST' },
  'British Columbia': { rate: 12, breakdown: '5% GST + 7% PST' },
  'Manitoba': { rate: 12, breakdown: '5% GST + 7% PST' },
  'New Brunswick': { rate: 15, breakdown: '15% HST' },
  'Newfoundland and Labrador': { rate: 15, breakdown: '15% HST' },
  'Northwest Territories': { rate: 5, breakdown: '5% GST' },
  'Nova Scotia': { rate: 15, breakdown: '15% HST' },
  'Nunavut': { rate: 5, breakdown: '5% GST' },
  'Ontario': { rate: 13, breakdown: '13% HST' },
  'Prince Edward Island': { rate: 15, breakdown: '15% HST' },
  'Quebec': { rate: 14.975, breakdown: '5% GST + 9.975% QST' },
  'Saskatchewan': { rate: 11, breakdown: '5% GST + 6% PST' },
  'Yukon': { rate: 5, breakdown: '5% GST' },
};

const TIMEZONES = [
  { value: 'America/Vancouver', label: 'Pacific (Vancouver)' },
  { value: 'America/Edmonton', label: 'Mountain (Edmonton)' },
  { value: 'America/Winnipeg', label: 'Central (Winnipeg)' },
  { value: 'America/Toronto', label: 'Eastern (Toronto)' },
  { value: 'America/Halifax', label: 'Atlantic (Halifax)' },
  { value: 'America/St_Johns', label: 'Newfoundland (St. Johns)' },
];

const SOURCE_TYPES = ['cargurus', 'autotrader', 'kijiji', 'facebook_marketplace', 'website', 'dms'];
const SCRAPE_FREQUENCIES = ['hourly', 'every_6_hours', 'twice_daily', 'daily', 'weekly', 'manual'];

const defaultFormData: OnboardingFormData = {
  dealership: {
    name: '',
    slug: '',
    subdomain: '',
    address: '',
    city: '',
    province: 'British Columbia',
    postalCode: '',
    phone: '',
    timezone: 'America/Vancouver',
    defaultCurrency: 'CAD',
  },
  branding: {
    primaryColor: '#022d60',
    secondaryColor: '#00aad2',
    logoUrl: '',
    faviconUrl: '',
    heroImageUrl: '',
    heroHeadline: '',
    heroSubheadline: '',
    tagline: '',
    customCss: '',
    promoBannerText: '',
    promoBannerActive: false,
  },
  apiKeys: {
    openaiApiKey: '',
    marketcheckKey: '',
    apifyToken: '',
    apifyActorId: '',
    geminiApiKey: '',
    ghlApiKey: '',
    ghlLocationId: '',
    facebookAppId: '',
    facebookAppSecret: '',
    gtmContainerId: '',
    googleAnalyticsId: '',
    googleAdsId: '',
    facebookPixelId: '',
  },
  financing: {
    defaultDownPayment: 1000,
    minDownPayment: 0,
    maxTerm: 84,
    defaultAdminFee: 499,
    defaultDocFee: 0,
    defaultLienFee: 80,
    ppsa: 85,
    taxRate: 12,
  },
  scrapeSources: [],
  masterAdmin: {
    name: '',
    email: '',
    password: '',
  },
  additionalStaff: [],
  seedDefaults: {
    creditTiers: true,
    modelYearTerms: true,
    chatPrompts: true,
    adTemplates: true,
  },
};

export default function OnboardingWizard({ onComplete }: { onComplete?: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<OnboardingFormData>(defaultFormData);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateField = <K extends keyof OnboardingFormData>(
    section: K, 
    field: keyof OnboardingFormData[K], 
    value: any
  ) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] as object),
        [field]: value,
      },
    }));
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  useEffect(() => {
    if (formData.dealership.name && !formData.dealership.slug) {
      const slug = generateSlug(formData.dealership.name);
      updateField('dealership', 'slug', slug);
      updateField('dealership', 'subdomain', slug);
    }
  }, [formData.dealership.name]);

  // Auto-populate tax rate when province changes
  useEffect(() => {
    const province = formData.dealership.province;
    if (province && PROVINCE_TAX_RATES[province]) {
      const provinceTax = PROVINCE_TAX_RATES[province].rate;
      setFormData(prev => ({
        ...prev,
        financing: {
          ...prev.financing,
          taxRate: provinceTax,
        },
      }));
    }
  }, [formData.dealership.province]);

  const validateMutation = useMutation({
    mutationFn: async (data: OnboardingFormData) => {
      const response = await fetch("/api/super-admin/onboarding/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Validation failed");
      }
      return response.json();
    },
  });

  const onboardMutation = useMutation({
    mutationFn: async (data: OnboardingFormData) => {
      const response = await fetch("/api/super-admin/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Onboarding failed");
      }
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/dealerships"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/audit-logs"] });
      toast({ 
        title: "Dealership Onboarded!", 
        description: `${formData.dealership.name} is now ready. Run ID: ${result.runId}` 
      });
      setFormData(defaultFormData);
      setCurrentStep(0);
      onComplete?.();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Onboarding Failed", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const validateCurrentStep = async (): Promise<boolean> => {
    const errors: string[] = [];
    
    switch (currentStep) {
      case 0:
        if (!formData.dealership.name.trim()) errors.push("Dealership name is required");
        if (!formData.dealership.slug.trim()) errors.push("URL slug is required");
        if (!formData.dealership.subdomain.trim()) errors.push("Subdomain is required");
        if (!/^[a-z0-9-]+$/.test(formData.dealership.slug)) {
          errors.push("Slug must be lowercase letters, numbers, and hyphens only");
        }
        break;
      case 4:
        if (!formData.masterAdmin.name.trim()) errors.push("Master admin name is required");
        if (!formData.masterAdmin.email.trim()) errors.push("Master admin email is required");
        if (!formData.masterAdmin.password || formData.masterAdmin.password.length < 8) {
          errors.push("Master admin password must be at least 8 characters");
        }
        if (!/^\S+@\S+\.\S+$/.test(formData.masterAdmin.email)) {
          errors.push("Invalid email format for master admin");
        }
        break;
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleNext = async () => {
    const isValid = await validateCurrentStep();
    if (isValid && currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      setValidationErrors([]);
    }
  };

  const handleSubmit = async () => {
    const isValid = await validateCurrentStep();
    if (!isValid) return;

    try {
      const validation = await validateMutation.mutateAsync(formData);
      if (!validation.valid) {
        setValidationErrors(validation.errors);
        return;
      }
      await onboardMutation.mutateAsync(formData);
    } catch (error) {
    }
  };

  const addScrapeSource = () => {
    setFormData(prev => ({
      ...prev,
      scrapeSources: [...prev.scrapeSources, {
        sourceName: '',
        sourceUrl: '',
        sourceType: 'cargurus',
        scrapeFrequency: 'daily',
      }],
    }));
  };

  const removeScrapeSource = (index: number) => {
    setFormData(prev => ({
      ...prev,
      scrapeSources: prev.scrapeSources.filter((_, i) => i !== index),
    }));
  };

  const updateScrapeSource = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      scrapeSources: prev.scrapeSources.map((source, i) => 
        i === index ? { ...source, [field]: value } : source
      ),
    }));
  };

  const addStaff = () => {
    setFormData(prev => ({
      ...prev,
      additionalStaff: [...prev.additionalStaff, {
        name: '',
        email: '',
        role: 'salesperson',
      }],
    }));
  };

  const removeStaff = (index: number) => {
    setFormData(prev => ({
      ...prev,
      additionalStaff: prev.additionalStaff.filter((_, i) => i !== index),
    }));
  };

  const updateStaff = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      additionalStaff: prev.additionalStaff.map((staff, i) => 
        i === index ? { ...staff, [field]: value } : staff
      ),
    }));
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dealership-name">Dealership Name *</Label>
                <Input
                  id="dealership-name"
                  data-testid="input-dealership-name"
                  value={formData.dealership.name}
                  onChange={(e) => updateField('dealership', 'name', e.target.value)}
                  placeholder="Olympic Auto Group"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dealership-phone">Phone</Label>
                <Input
                  id="dealership-phone"
                  data-testid="input-dealership-phone"
                  value={formData.dealership.phone}
                  onChange={(e) => updateField('dealership', 'phone', e.target.value)}
                  placeholder="(604) 555-0123"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dealership-slug">URL Slug *</Label>
                <Input
                  id="dealership-slug"
                  data-testid="input-dealership-slug"
                  value={formData.dealership.slug}
                  onChange={(e) => updateField('dealership', 'slug', e.target.value.toLowerCase())}
                  placeholder="olympic-auto-group"
                />
                <p className="text-xs text-muted-foreground">Used in URLs: /d/{formData.dealership.slug || 'slug'}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dealership-subdomain">Subdomain *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="dealership-subdomain"
                    data-testid="input-dealership-subdomain"
                    value={formData.dealership.subdomain}
                    onChange={(e) => updateField('dealership', 'subdomain', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="olympic"
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">.lotview.ai</span>
                </div>
                <p className="text-xs text-muted-foreground">Your dealership will be accessible at <strong>{formData.dealership.subdomain || 'subdomain'}.lotview.ai</strong></p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dealership-address">Street Address</Label>
              <Input
                id="dealership-address"
                data-testid="input-dealership-address"
                value={formData.dealership.address}
                onChange={(e) => updateField('dealership', 'address', e.target.value)}
                placeholder="1234 Auto Drive"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dealership-city">City</Label>
                <Input
                  id="dealership-city"
                  data-testid="input-dealership-city"
                  value={formData.dealership.city}
                  onChange={(e) => updateField('dealership', 'city', e.target.value)}
                  placeholder="Vancouver"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dealership-province">Province</Label>
                <select
                  id="dealership-province"
                  data-testid="select-dealership-province"
                  value={formData.dealership.province}
                  onChange={(e) => updateField('dealership', 'province', e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {PROVINCES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dealership-postal">Postal Code</Label>
                <Input
                  id="dealership-postal"
                  data-testid="input-dealership-postal"
                  value={formData.dealership.postalCode}
                  onChange={(e) => updateField('dealership', 'postalCode', e.target.value.toUpperCase())}
                  placeholder="V6B 1A1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dealership-timezone">Timezone</Label>
                <select
                  id="dealership-timezone"
                  data-testid="select-dealership-timezone"
                  value={formData.dealership.timezone}
                  onChange={(e) => updateField('dealership', 'timezone', e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branding-primary">Primary Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="branding-primary"
                    data-testid="input-branding-primary"
                    type="color"
                    value={formData.branding.primaryColor}
                    onChange={(e) => updateField('branding', 'primaryColor', e.target.value)}
                    className="w-16 h-9 p-1 cursor-pointer"
                  />
                  <Input
                    value={formData.branding.primaryColor}
                    onChange={(e) => updateField('branding', 'primaryColor', e.target.value)}
                    placeholder="#022d60"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branding-secondary">Secondary Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="branding-secondary"
                    data-testid="input-branding-secondary"
                    type="color"
                    value={formData.branding.secondaryColor}
                    onChange={(e) => updateField('branding', 'secondaryColor', e.target.value)}
                    className="w-16 h-9 p-1 cursor-pointer"
                  />
                  <Input
                    value={formData.branding.secondaryColor}
                    onChange={(e) => updateField('branding', 'secondaryColor', e.target.value)}
                    placeholder="#00aad2"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg border" style={{ 
              background: `linear-gradient(135deg, ${formData.branding.primaryColor}20, ${formData.branding.secondaryColor}20)` 
            }}>
              <p className="text-sm font-medium mb-2">Preview</p>
              <div className="flex gap-4">
                <div 
                  className="w-24 h-12 rounded" 
                  style={{ backgroundColor: formData.branding.primaryColor }}
                />
                <div 
                  className="w-24 h-12 rounded" 
                  style={{ backgroundColor: formData.branding.secondaryColor }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="branding-logo">Logo URL</Label>
              <Input
                id="branding-logo"
                data-testid="input-branding-logo"
                value={formData.branding.logoUrl}
                onChange={(e) => updateField('branding', 'logoUrl', e.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branding-favicon">Favicon URL</Label>
                <Input
                  id="branding-favicon"
                  data-testid="input-branding-favicon"
                  value={formData.branding.faviconUrl}
                  onChange={(e) => updateField('branding', 'faviconUrl', e.target.value)}
                  placeholder="https://example.com/favicon.ico"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branding-hero">Hero Image URL</Label>
                <Input
                  id="branding-hero"
                  data-testid="input-branding-hero"
                  value={formData.branding.heroImageUrl}
                  onChange={(e) => updateField('branding', 'heroImageUrl', e.target.value)}
                  placeholder="https://example.com/hero.jpg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="branding-tagline">Tagline</Label>
              <Input
                id="branding-tagline"
                data-testid="input-branding-tagline"
                value={formData.branding.tagline}
                onChange={(e) => updateField('branding', 'tagline', e.target.value)}
                placeholder="Your trusted auto partner since 1990"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branding-headline">Hero Headline</Label>
                <Input
                  id="branding-headline"
                  data-testid="input-branding-headline"
                  value={formData.branding.heroHeadline}
                  onChange={(e) => updateField('branding', 'heroHeadline', e.target.value)}
                  placeholder="Find Your Perfect Vehicle"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branding-subheadline">Hero Subheadline</Label>
                <Input
                  id="branding-subheadline"
                  data-testid="input-branding-subheadline"
                  value={formData.branding.heroSubheadline}
                  onChange={(e) => updateField('branding', 'heroSubheadline', e.target.value)}
                  placeholder="Browse our premium selection"
                />
              </div>
            </div>

            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Promotional Banner</Label>
                  <p className="text-xs text-muted-foreground">Show a promo banner at the top of the site</p>
                </div>
                <Switch
                  data-testid="switch-promo-banner"
                  checked={formData.branding.promoBannerActive || false}
                  onCheckedChange={(checked) => updateField('branding', 'promoBannerActive', checked)}
                />
              </div>
              {formData.branding.promoBannerActive && (
                <div className="space-y-2">
                  <Label htmlFor="branding-promo">Banner Text</Label>
                  <Input
                    id="branding-promo"
                    data-testid="input-branding-promo"
                    value={formData.branding.promoBannerText}
                    onChange={(e) => updateField('branding', 'promoBannerText', e.target.value)}
                    placeholder="🎉 Boxing Week Sale - Save up to $5,000!"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="branding-css">Custom CSS (Optional)</Label>
              <Textarea
                id="branding-css"
                data-testid="input-branding-css"
                value={formData.branding.customCss}
                onChange={(e) => updateField('branding', 'customCss', e.target.value)}
                placeholder=":root { --custom-font: 'Inter', sans-serif; }"
                rows={4}
                className="font-mono text-sm"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-base">AI & Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="api-openai">OpenAI API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        id="api-openai"
                        data-testid="input-api-openai"
                        type={showPasswords['openai'] ? 'text' : 'password'}
                        value={formData.apiKeys.openaiApiKey}
                        onChange={(e) => updateField('apiKeys', 'openaiApiKey', e.target.value)}
                        placeholder="sk-..."
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => togglePasswordVisibility('openai')}
                      >
                        {showPasswords['openai'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-gemini">Gemini API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        id="api-gemini"
                        data-testid="input-api-gemini"
                        type={showPasswords['gemini'] ? 'text' : 'password'}
                        value={formData.apiKeys.geminiApiKey}
                        onChange={(e) => updateField('apiKeys', 'geminiApiKey', e.target.value)}
                        placeholder="AIza..."
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => togglePasswordVisibility('gemini')}
                      >
                        {showPasswords['gemini'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Market Data & Scraping</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="api-marketcheck">MarketCheck API Key</Label>
                    <Input
                      id="api-marketcheck"
                      data-testid="input-api-marketcheck"
                      type={showPasswords['marketcheck'] ? 'text' : 'password'}
                      value={formData.apiKeys.marketcheckKey}
                      onChange={(e) => updateField('apiKeys', 'marketcheckKey', e.target.value)}
                      placeholder="Your MarketCheck key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-apify-token">Apify Token</Label>
                    <Input
                      id="api-apify-token"
                      data-testid="input-api-apify-token"
                      type={showPasswords['apify'] ? 'text' : 'password'}
                      value={formData.apiKeys.apifyToken}
                      onChange={(e) => updateField('apiKeys', 'apifyToken', e.target.value)}
                      placeholder="apify_api_..."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-apify-actor">Apify Actor ID (AutoTrader)</Label>
                  <Input
                    id="api-apify-actor"
                    data-testid="input-api-apify-actor"
                    value={formData.apiKeys.apifyActorId}
                    onChange={(e) => updateField('apiKeys', 'apifyActorId', e.target.value)}
                    placeholder="username/actor-name"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Facebook & Marketing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="api-fb-app-id">Facebook App ID</Label>
                    <Input
                      id="api-fb-app-id"
                      data-testid="input-api-fb-app-id"
                      value={formData.apiKeys.facebookAppId}
                      onChange={(e) => updateField('apiKeys', 'facebookAppId', e.target.value)}
                      placeholder="123456789012345"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-fb-secret">Facebook App Secret</Label>
                    <div className="flex gap-2">
                      <Input
                        id="api-fb-secret"
                        data-testid="input-api-fb-secret"
                        type={showPasswords['facebook'] ? 'text' : 'password'}
                        value={formData.apiKeys.facebookAppSecret}
                        onChange={(e) => updateField('apiKeys', 'facebookAppSecret', e.target.value)}
                        placeholder="abc123def456..."
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => togglePasswordVisibility('facebook')}
                      >
                        {showPasswords['facebook'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-base">CRM & Analytics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="api-ghl-key">GoHighLevel API Key</Label>
                    <Input
                      id="api-ghl-key"
                      data-testid="input-api-ghl-key"
                      type={showPasswords['ghl'] ? 'text' : 'password'}
                      value={formData.apiKeys.ghlApiKey}
                      onChange={(e) => updateField('apiKeys', 'ghlApiKey', e.target.value)}
                      placeholder="ghl_..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-ghl-location">GHL Location ID</Label>
                    <Input
                      id="api-ghl-location"
                      data-testid="input-api-ghl-location"
                      value={formData.apiKeys.ghlLocationId}
                      onChange={(e) => updateField('apiKeys', 'ghlLocationId', e.target.value)}
                      placeholder="location_..."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="api-gtm">GTM Container ID</Label>
                    <Input
                      id="api-gtm"
                      data-testid="input-api-gtm"
                      value={formData.apiKeys.gtmContainerId}
                      onChange={(e) => updateField('apiKeys', 'gtmContainerId', e.target.value)}
                      placeholder="GTM-XXXXXX"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-ga">Google Analytics ID</Label>
                    <Input
                      id="api-ga"
                      data-testid="input-api-ga"
                      value={formData.apiKeys.googleAnalyticsId}
                      onChange={(e) => updateField('apiKeys', 'googleAnalyticsId', e.target.value)}
                      placeholder="G-XXXXXXXXXX"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-fb-pixel">Facebook Pixel ID</Label>
                    <Input
                      id="api-fb-pixel"
                      data-testid="input-api-fb-pixel"
                      value={formData.apiKeys.facebookPixelId}
                      onChange={(e) => updateField('apiKeys', 'facebookPixelId', e.target.value)}
                      placeholder="123456789012345"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Default Financing Settings</CardTitle>
                <CardDescription>These values apply to all vehicles unless overridden</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fin-down-payment">Default Down Payment ($)</Label>
                    <Input
                      id="fin-down-payment"
                      data-testid="input-fin-down-payment"
                      type="number"
                      value={formData.financing.defaultDownPayment}
                      onChange={(e) => updateField('financing', 'defaultDownPayment', Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fin-min-down">Min Down Payment ($)</Label>
                    <Input
                      id="fin-min-down"
                      data-testid="input-fin-min-down"
                      type="number"
                      value={formData.financing.minDownPayment}
                      onChange={(e) => updateField('financing', 'minDownPayment', Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fin-max-term">Max Term (months)</Label>
                    <Input
                      id="fin-max-term"
                      data-testid="input-fin-max-term"
                      type="number"
                      value={formData.financing.maxTerm}
                      onChange={(e) => updateField('financing', 'maxTerm', Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fin-tax-rate">Tax Rate (%)</Label>
                    <Input
                      id="fin-tax-rate"
                      data-testid="input-fin-tax-rate"
                      type="number"
                      step="0.1"
                      value={formData.financing.taxRate}
                      onChange={(e) => updateField('financing', 'taxRate', Number(e.target.value))}
                    />
                    {formData.dealership.province && PROVINCE_TAX_RATES[formData.dealership.province] && (
                      <p className="text-xs text-muted-foreground">
                        {formData.dealership.province}: {PROVINCE_TAX_RATES[formData.dealership.province].breakdown}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fin-admin-fee">Admin Fee ($)</Label>
                    <Input
                      id="fin-admin-fee"
                      data-testid="input-fin-admin-fee"
                      type="number"
                      value={formData.financing.defaultAdminFee}
                      onChange={(e) => updateField('financing', 'defaultAdminFee', Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fin-doc-fee">Doc Fee ($)</Label>
                    <Input
                      id="fin-doc-fee"
                      data-testid="input-fin-doc-fee"
                      type="number"
                      value={formData.financing.defaultDocFee}
                      onChange={(e) => updateField('financing', 'defaultDocFee', Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fin-lien-fee">Lien Fee ($)</Label>
                    <Input
                      id="fin-lien-fee"
                      data-testid="input-fin-lien-fee"
                      type="number"
                      value={formData.financing.defaultLienFee}
                      onChange={(e) => updateField('financing', 'defaultLienFee', Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fin-ppsa">PPSA ($)</Label>
                    <Input
                      id="fin-ppsa"
                      data-testid="input-fin-ppsa"
                      type="number"
                      value={formData.financing.ppsa}
                      onChange={(e) => updateField('financing', 'ppsa', Number(e.target.value))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="py-3">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-base">Inventory Scrape Sources</CardTitle>
                    <CardDescription>Configure automated inventory imports</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={addScrapeSource} data-testid="button-add-scrape-source">
                    <Plus className="h-4 w-4 mr-1" /> Add Source
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {formData.scrapeSources.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No scrape sources configured. Add sources to automatically import inventory.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {formData.scrapeSources.map((source, index) => (
                      <div key={index} className="p-4 rounded-lg border space-y-3">
                        <div className="flex justify-between items-start">
                          <Label className="text-sm font-medium">Source #{index + 1}</Label>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removeScrapeSource(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={source.sourceName}
                              onChange={(e) => updateScrapeSource(index, 'sourceName', e.target.value)}
                              placeholder="CarGurus Main"
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Type</Label>
                            <select
                              value={source.sourceType}
                              onChange={(e) => updateScrapeSource(index, 'sourceType', e.target.value)}
                              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                            >
                              {SOURCE_TYPES.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Frequency</Label>
                            <select
                              value={source.scrapeFrequency}
                              onChange={(e) => updateScrapeSource(index, 'scrapeFrequency', e.target.value)}
                              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                            >
                              {SCRAPE_FREQUENCIES.map(f => (
                                <option key={f} value={f}>{f.replace('_', ' ')}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1 col-span-2 md:col-span-1">
                            <Label className="text-xs">URL</Label>
                            <Input
                              value={source.sourceUrl}
                              onChange={(e) => updateScrapeSource(index, 'sourceUrl', e.target.value)}
                              placeholder="https://..."
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Master Administrator *</CardTitle>
                <CardDescription>Primary account owner with full permissions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin-name">Full Name *</Label>
                    <Input
                      id="admin-name"
                      data-testid="input-admin-name"
                      value={formData.masterAdmin.name}
                      onChange={(e) => updateField('masterAdmin', 'name', e.target.value)}
                      placeholder="John Smith"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-email">Email *</Label>
                    <Input
                      id="admin-email"
                      data-testid="input-admin-email"
                      type="email"
                      value={formData.masterAdmin.email}
                      onChange={(e) => updateField('masterAdmin', 'email', e.target.value)}
                      placeholder="john@dealership.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-password">Password *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="admin-password"
                        data-testid="input-admin-password"
                        type={showPasswords['admin'] ? 'text' : 'password'}
                        value={formData.masterAdmin.password}
                        onChange={(e) => updateField('masterAdmin', 'password', e.target.value)}
                        placeholder="Min 8 characters"
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => togglePasswordVisibility('admin')}
                      >
                        {showPasswords['admin'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="py-3">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-base">Additional Staff (Optional)</CardTitle>
                    <CardDescription>Invite team members during setup</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={addStaff} data-testid="button-add-staff">
                    <Plus className="h-4 w-4 mr-1" /> Add Staff
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {formData.additionalStaff.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No additional staff configured. You can add them later from the dashboard.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {formData.additionalStaff.map((staff, index) => (
                      <div key={index} className="flex gap-3 items-center">
                        <Input
                          value={staff.name}
                          onChange={(e) => updateStaff(index, 'name', e.target.value)}
                          placeholder="Name"
                          className="flex-1"
                        />
                        <Input
                          value={staff.email}
                          onChange={(e) => updateStaff(index, 'email', e.target.value)}
                          placeholder="Email"
                          className="flex-1"
                        />
                        <select
                          value={staff.role}
                          onChange={(e) => updateStaff(index, 'role', e.target.value)}
                          className="w-32 h-9 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="manager">Manager</option>
                          <option value="salesperson">Salesperson</option>
                        </select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => removeStaff(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Auto-Seed Defaults</CardTitle>
                <CardDescription>Pre-populate standard configurations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="seed-credit"
                      checked={formData.seedDefaults.creditTiers}
                      onCheckedChange={(checked) => updateField('seedDefaults', 'creditTiers', checked)}
                    />
                    <Label htmlFor="seed-credit">Credit Score Tiers (4 tiers)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="seed-terms"
                      checked={formData.seedDefaults.modelYearTerms}
                      onCheckedChange={(checked) => updateField('seedDefaults', 'modelYearTerms', checked)}
                    />
                    <Label htmlFor="seed-terms">Model Year Terms</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="seed-prompts"
                      checked={formData.seedDefaults.chatPrompts}
                      onCheckedChange={(checked) => updateField('seedDefaults', 'chatPrompts', checked)}
                    />
                    <Label htmlFor="seed-prompts">AI Chat Prompts</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="seed-templates"
                      checked={formData.seedDefaults.adTemplates}
                      onCheckedChange={(checked) => updateField('seedDefaults', 'adTemplates', checked)}
                    />
                    <Label htmlFor="seed-templates">Ad Templates</Label>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/50">
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" />
                  Final Review
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dealership:</span>
                      <span className="font-medium">{formData.dealership.name || '(Not set)'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subdomain:</span>
                      <span className="font-medium">{formData.dealership.subdomain || '(Not set)'}.lotview.ai</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Location:</span>
                      <span className="font-medium">
                        {formData.dealership.city && formData.dealership.province 
                          ? `${formData.dealership.city}, ${formData.dealership.province}`
                          : '(Not set)'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Master Admin:</span>
                      <span className="font-medium">{formData.masterAdmin.email || '(Not set)'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">API Keys Configured:</span>
                      <span className="font-medium">
                        {Object.values(formData.apiKeys).filter(v => v && v.trim()).length} / {Object.keys(formData.apiKeys).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scrape Sources:</span>
                      <span className="font-medium">{formData.scrapeSources.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Additional Staff:</span>
                      <span className="font-medium">{formData.additionalStaff.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax Rate:</span>
                      <span className="font-medium">{formData.financing.taxRate}%</span>
                    </div>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="w-full" data-testid="onboarding-wizard">
      <CardHeader>
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <Rocket className="h-6 w-6" />
            Onboard New Dealership
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Step {currentStep + 1} of {STEPS.length}
          </Badge>
        </div>
        <Progress value={progress} className="h-2" />
        
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
          {STEPS.map((step, idx) => {
            const StepIcon = step.icon;
            const isCompleted = idx < currentStep;
            const isCurrent = idx === currentStep;
            
            return (
              <button
                key={step.id}
                onClick={() => idx <= currentStep && setCurrentStep(idx)}
                disabled={idx > currentStep}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors",
                  isCurrent && "bg-primary text-primary-foreground",
                  isCompleted && "bg-primary/10 text-primary cursor-pointer hover:bg-primary/20",
                  !isCurrent && !isCompleted && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <StepIcon className="h-4 w-4" />
                )}
                <span className="hidden md:inline">{step.title}</span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {validationErrors.length > 0 && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Please fix the following errors:</p>
                <ul className="list-disc list-inside text-sm text-destructive mt-1">
                  {validationErrors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {renderStepContent()}

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentStep === 0}
            data-testid="button-prev-step"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          
          {currentStep < STEPS.length - 1 ? (
            <Button 
              onClick={handleNext}
              data-testid="button-next-step"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={onboardMutation.isPending || validateMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-onboard-now"
            >
              {onboardMutation.isPending || validateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  ONBOARD NOW
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
