import { useState, useMemo } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Clock,
  Car,
  DollarSign,
  Gauge,
  ArrowLeft,
  CheckCircle,
  Download,
  ImageIcon,
  FileText,
  ExternalLink,
  Wand2,
  MapPin,
  Calendar,
  Palette,
  Fuel,
  Settings2,
  Shield,
  Loader2
} from "lucide-react";

interface Vehicle {
  id: number;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  type: string | null;
  price: number;
  odometer: number | null;
  images: string[] | null;
  location: string | null;
  dealership: string | null;
  vin: string | null;
  stockNumber: string | null;
  carfaxUrl: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  engine: string | null;
  description: string | null;
  features: string[] | null;
  socialTemplates: {
    marketplace?: {
      title: string;
      description: string;
    };
  } | null;
  socialTemplatesGeneratedAt: string | null;
  daysInStock?: number;
  createdAt?: string;
}

interface Template {
  id: string;
  name: string;
  titleTemplate: string;
  descriptionTemplate: string;
  isDefault?: boolean;
  isShared?: boolean;
}

interface DbTemplate {
  id: number;
  templateName: string;
  titleTemplate: string;
  descriptionTemplate: string;
  isDefault: boolean;
  isShared: boolean;
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "standard",
    name: "Standard Listing",
    titleTemplate: "{year} {make} {model} - ${price}",
    descriptionTemplate: `🚗 {year} {make} {model} {trim}

💰 Price: ${"{price}"}
📍 Location: {location}
🛣️ Mileage: {mileage} km
🎨 Color: {exteriorColor}

{badges}

Contact us today to schedule a test drive!

📞 Call or message for more information`,
    isDefault: true,
  },
  {
    id: "urgent",
    name: "🔥 Hot Deal",
    titleTemplate: "🔥 HOT DEAL: {year} {make} {model} - Must See!",
    descriptionTemplate: `⚡ LIMITED TIME OFFER! ⚡

This {year} {make} {model} {trim} won't last at this price!

💵 Only ${"{price}"}
📍 {location}
🛣️ {mileage} km

{badges}

🏃 Don't miss out - message NOW!`,
    isDefault: true,
  },
  {
    id: "premium",
    name: "✨ Premium Showcase",
    titleTemplate: "✨ Premium {year} {make} {model} - Exceptional Value",
    descriptionTemplate: `Experience luxury with this stunning {year} {make} {model} {trim}.

✅ Premium Features
✅ Exceptional Condition
✅ Full Service History

💰 ${"{price}"} | 🛣️ {mileage} km
🎨 {exteriorColor} Exterior
📍 {location}

{badges}

Schedule your VIP viewing today!`,
    isDefault: true,
  },
];

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "Copied!", description: "Text copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <Button
      variant={copied ? "default" : "outline"}
      size="sm"
      onClick={handleCopy}
      className="gap-2"
      data-testid={`copy-${label.toLowerCase()}`}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? "Copied!" : label}
    </Button>
  );
}

export default function MarketplaceBlastVehicle() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const vehicleId = parseInt(id || "0");

  const [selectedTemplateId, setSelectedTemplateId] = useState("standard");
  const [customDescription, setCustomDescription] = useState("");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const token = localStorage.getItem("auth_token");
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const { data: vehicle, isLoading: vehicleLoading } = useQuery<Vehicle>({
    queryKey: ["marketplace-blast-vehicle", vehicleId],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace-blast/vehicle/${vehicleId}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch vehicle");
      return res.json();
    },
    enabled: vehicleId > 0,
  });

  const { data: dbTemplates = [] } = useQuery<DbTemplate[]>({
    queryKey: ["ad-templates"],
    queryFn: async () => {
      const res = await fetch("/api/ad-templates", { headers });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const allTemplates = useMemo(() => {
    const userTemplates: Template[] = dbTemplates.map(t => ({
      id: `db-${t.id}`,
      name: t.templateName + (t.isShared ? " (Shared)" : ""),
      titleTemplate: t.titleTemplate,
      descriptionTemplate: t.descriptionTemplate,
      isShared: t.isShared,
    }));
    return [...DEFAULT_TEMPLATES, ...userTemplates];
  }, [dbTemplates]);

  const selectedTemplate = allTemplates.find(t => t.id === selectedTemplateId) || DEFAULT_TEMPLATES[0];

  const applyTemplate = (template: string, v: Vehicle) => {
    if (!v) return "";
    const badges = [];
    if (v.carfaxUrl) badges.push("✓ Carfax Available");
    
    return template
      .replace(/{year}/g, String(v.year))
      .replace(/{make}/g, v.make)
      .replace(/{model}/g, v.model)
      .replace(/{trim}/g, v.trim || "")
      .replace(/{price}/g, v.price.toLocaleString())
      .replace(/\${price}/g, `$${v.price.toLocaleString()}`)
      .replace(/{mileage}/g, v.odometer ? v.odometer.toLocaleString() : "New")
      .replace(/{location}/g, v.location || "Olympic Hyundai Vancouver")
      .replace(/{exteriorColor}/g, v.exteriorColor || "")
      .replace(/{interiorColor}/g, v.interiorColor || "")
      .replace(/{vin}/g, v.vin || "")
      .replace(/{stockNumber}/g, v.stockNumber || "")
      .replace(/{badges}/g, badges.join(" | ") || "");
  };

  const title = vehicle ? applyTemplate(selectedTemplate.titleTemplate, vehicle) : "";
  const description = customDescription || (vehicle ? applyTemplate(selectedTemplate.descriptionTemplate, vehicle) : "");

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/marketplace-blast/generate/${vehicleId}`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to generate content");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-blast-vehicle", vehicleId] });
      toast({ title: "AI Content Generated!", description: "Fresh content created for this vehicle" });
    },
    onError: () => {
      toast({ title: "Generation Failed", variant: "destructive" });
    },
  });

  const enhanceWithAI = async () => {
    if (!description.trim()) {
      toast({ title: "No description to enhance", variant: "destructive" });
      return;
    }
    
    setIsEnhancing(true);
    try {
      const res = await fetch("/api/marketplace-blast/enhance-description", {
        method: "POST",
        headers,
        body: JSON.stringify({
          vehicleId,
          currentDescription: description,
          vehicle: vehicle ? {
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            trim: vehicle.trim,
            price: vehicle.price,
            odometer: vehicle.odometer,
            features: vehicle.features,
          } : null,
        }),
      });
      
      if (!res.ok) throw new Error("Enhancement failed");
      const data = await res.json();
      setCustomDescription(data.enhancedDescription);
      toast({ title: "Description Enhanced!", description: "AI has polished your listing" });
    } catch {
      toast({ title: "Enhancement Failed", description: "Please try again", variant: "destructive" });
    } finally {
      setIsEnhancing(false);
    }
  };

  const downloadPhotos = async () => {
    if (!vehicle?.images?.length) {
      toast({ title: "No photos available", variant: "destructive" });
      return;
    }
    
    setIsDownloading(true);
    try {
      toast({ title: "Preparing download...", description: "Creating ZIP file with all photos" });
      const res = await fetch(`/api/inventory/download-images/${vehicleId}`, { headers });
      if (!res.ok) throw new Error("Download failed");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${vehicle.year}_${vehicle.make}_${vehicle.model}_photos.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      toast({ title: "Download Complete!", description: `${vehicle.images.length} photos downloaded` });
    } catch {
      toast({ title: "Download Failed", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  if (vehicleLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-2 text-gray-600">Loading vehicle...</p>
        </div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Car className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Vehicle Not Found</h2>
            <p className="text-gray-600 mb-4">This vehicle may have been sold or removed.</p>
            <Link href="/marketplace-blast">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Marketplace Blast
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/marketplace-blast">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Queue
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">
              <Clock className="w-3 h-3 mr-1" />
              {vehicle.daysInStock || 0} days in stock
            </Badge>
            {vehicle.socialTemplates && (
              <Badge className="bg-emerald-500">
                <Sparkles className="w-3 h-3 mr-1" />
                AI Content Ready
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-5">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Photos ({vehicle.images?.length || 0})
                  </CardTitle>
                  <Button 
                    onClick={downloadPhotos} 
                    disabled={isDownloading || !vehicle.images?.length}
                    className="gap-2"
                    data-testid="download-photos"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Download All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {vehicle.images && vehicle.images.length > 0 ? (
                  <div className="space-y-4">
                    <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
                      <img
                        src={vehicle.images[0]}
                        alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23f3f4f6' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%239ca3af' font-size='16'%3ENo Image%3C/text%3E%3C/svg%3E";
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {vehicle.images.slice(1, 9).map((img, idx) => (
                        <a
                          key={idx}
                          href={img}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:ring-2 ring-blue-500 transition-all"
                        >
                          <img
                            src={img}
                            alt={`Photo ${idx + 2}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </a>
                      ))}
                    </div>
                    {vehicle.images.length > 9 && (
                      <p className="text-sm text-gray-500 text-center">
                        +{vehicle.images.length - 9} more photos in download
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                    <p className="text-gray-400">No photos available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Car className="w-5 h-5" />
                  Vehicle Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </h2>
                    {vehicle.trim && (
                      <p className="text-lg text-gray-600">{vehicle.trim}</p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-2xl font-bold text-green-600">
                      <DollarSign className="w-6 h-6" />
                      {vehicle.price.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Gauge className="w-5 h-5" />
                      {vehicle.odometer ? `${vehicle.odometer.toLocaleString()} km` : "New"}
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {vehicle.stockNumber && (
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">Stock:</span>
                        <span className="font-medium">{vehicle.stockNumber}</span>
                      </div>
                    )}
                    {vehicle.exteriorColor && (
                      <div className="flex items-center gap-2">
                        <Palette className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">Exterior:</span>
                        <span className="font-medium">{vehicle.exteriorColor}</span>
                      </div>
                    )}
                    {vehicle.interiorColor && (
                      <div className="flex items-center gap-2">
                        <Palette className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">Interior:</span>
                        <span className="font-medium">{vehicle.interiorColor}</span>
                      </div>
                    )}
                    {vehicle.transmission && (
                      <div className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">Trans:</span>
                        <span className="font-medium">{vehicle.transmission}</span>
                      </div>
                    )}
                    {vehicle.drivetrain && (
                      <div className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">Drive:</span>
                        <span className="font-medium">{vehicle.drivetrain}</span>
                      </div>
                    )}
                    {vehicle.fuelType && (
                      <div className="flex items-center gap-2">
                        <Fuel className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">Fuel:</span>
                        <span className="font-medium">{vehicle.fuelType}</span>
                      </div>
                    )}
                    {vehicle.location && (
                      <div className="flex items-center gap-2 col-span-2">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">Location:</span>
                        <span className="font-medium">{vehicle.location}</span>
                      </div>
                    )}
                  </div>

                  {vehicle.carfaxUrl && (
                    <a
                      href={vehicle.carfaxUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-600 hover:underline"
                    >
                      <Shield className="w-4 h-4" />
                      View Carfax Report
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-12 lg:col-span-7">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Facebook Marketplace Listing
                    </CardTitle>
                    <CardDescription>
                      Copy-paste ready content for your listing
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={selectedTemplateId} onValueChange={(v) => {
                      setSelectedTemplateId(v);
                      setCustomDescription("");
                    }}>
                      <SelectTrigger className="w-48" data-testid="template-select">
                        <SelectValue placeholder="Choose template" />
                      </SelectTrigger>
                      <SelectContent>
                        {allTemplates.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold uppercase text-gray-500">
                      Listing Title
                    </Label>
                    <CopyButton text={title} label="Copy Title" />
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border text-lg font-semibold">
                    {title}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold uppercase text-gray-500">
                      Price
                    </Label>
                    <CopyButton text={vehicle.price.toString()} label="Copy Price" />
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border text-2xl font-bold text-green-600">
                    ${vehicle.price.toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold uppercase text-gray-500">
                      Description
                    </Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={enhanceWithAI}
                        disabled={isEnhancing}
                        className="gap-2 bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100"
                        data-testid="enhance-ai"
                      >
                        {isEnhancing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4 text-purple-600" />
                        )}
                        <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent font-semibold">
                          Enhance with AI
                        </span>
                      </Button>
                      <CopyButton text={description} label="Copy Description" />
                    </div>
                  </div>
                  <Textarea
                    value={description}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    className="min-h-[200px] text-sm leading-relaxed"
                    placeholder="Select a template or write your description..."
                    data-testid="description-textarea"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold uppercase text-gray-500">
                      Location
                    </Label>
                    <CopyButton text={vehicle.location || "Vancouver, BC"} label="Copy Location" />
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    {vehicle.location || "Vancouver, BC"}
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => generateMutation.mutate()}
                      disabled={generateMutation.isPending}
                      className="gap-2"
                      data-testid="generate-ai-content"
                    >
                      {generateMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {vehicle.socialTemplates ? "Regenerate AI Content" : "Generate AI Content"}
                    </Button>
                  </div>
                  <Button
                    onClick={() => window.open("https://www.facebook.com/marketplace/create/vehicle", "_blank")}
                    className="gap-2 bg-[#1877f2] hover:bg-[#166fe5]"
                    data-testid="open-marketplace"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Facebook Marketplace
                  </Button>
                </div>
              </CardContent>
            </Card>

            {vehicle.features && vehicle.features.length > 0 && (
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Vehicle Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {vehicle.features.map((feature, idx) => (
                      <Badge key={idx} variant="secondary">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
