import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Navbar } from "@/components/Navbar";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LogOut, Search, TrendingUp, Car, ChevronDown, Check, Settings, RefreshCw, X, MessageSquare, Users, Calendar, CalendarCheck, ClipboardCheck, BarChart3, Bot, Clock, Sparkles, Pencil, Save, TrendingDown, Minus, ArrowUp, ArrowDown, PackageOpen, ExternalLink, Eye, User, Send, Plus, Trash2, Copy, Building, DollarSign, Activity, Image as ImageIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CompetitorAlertsWidget } from "@/components/CompetitorAlertsWidget";
import { useToast } from "@/hooks/use-toast";
import { InventoryManagement } from "@/components/InventoryManagement";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiPromptEnhancer } from "@/components/AiPromptEnhancer";
import { FollowUpSequenceEditor } from "@/components/FollowUpSequenceEditor";
import { ConversationsPanel } from "@/components/ConversationsPanel";
import { AppointmentsWidget } from "@/components/AppointmentsWidget";

// Helper function to generate AutoTrader.ca search URL for a vehicle
function generateAutoTraderUrl(vehicle: { make?: string; model?: string; year?: number; trim?: string }): string {
  const make = vehicle.make || '';
  const model = vehicle.model || '';
  const year = vehicle.year || new Date().getFullYear();
  
  return `https://www.autotrader.ca/cars/?rcp=15&rcs=0&prx=500&make=${encodeURIComponent(make)}&mdl=${encodeURIComponent(model)}${vehicle.trim ? `&trim=${encodeURIComponent(vehicle.trim)}` : ''}&yRng=${year}%2C${year}`;
}

// Inventory Analysis Tab Component
function InventoryAnalysisTab() {
  const { toast } = useToast();
  const [selectedRadius, setSelectedRadius] = useState<string>('50');
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [colorLoadingVins, setColorLoadingVins] = useState<Set<string>>(new Set());
  const [vehicleColors, setVehicleColors] = useState<Record<string, { interiorColor?: string; exteriorColor?: string; cargurusUrl?: string }>>({});

  const radiusOptions = [
    { value: '50', label: '50 km' },
    { value: '250', label: '250 km' },
    { value: '1000', label: '1,000 km' },
    { value: 'national', label: 'National' }
  ];

  const fetchInventoryAnalysis = async (radius: string) => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const data = await apiGet<any>(`/api/manager/inventory-analysis?radiusKm=${radius}`, {
        'Authorization': `Bearer ${token}`
      });
      setInventoryData(data);
    } catch (error) {
      console.error('Error fetching inventory analysis:', error);
      toast({
        title: "Error",
        description: "Failed to load inventory analysis",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const token = localStorage.getItem('auth_token');
      const result = await apiPost<any>('/api/manager/inventory-analysis/refresh', 
        { radiusKm: selectedRadius === 'national' ? 2000 : parseInt(selectedRadius) },
        { 'Authorization': `Bearer ${token}` }
      );
      toast({
        title: "Analysis Complete",
        description: `Analyzed ${result.vehiclesAnalyzed} vehicle types, found ${result.newListingsFound} new market listings`
      });
      // Reload the data
      await fetchInventoryAnalysis(selectedRadius);
    } catch (error) {
      console.error('Error refreshing analysis:', error);
      toast({
        title: "Error",
        description: "Failed to refresh market data",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchColorsForVehicle = async (vin: string) => {
    if (!vin || colorLoadingVins.has(vin)) return;
    
    setColorLoadingVins(prev => new Set(prev).add(vin));
    try {
      const token = localStorage.getItem('auth_token');
      const result = await apiPost<any>('/api/manager/lookup-colors', 
        { vin },
        { 'Authorization': `Bearer ${token}` }
      );
      
      if (result.found) {
        setVehicleColors(prev => ({
          ...prev,
          [vin]: {
            interiorColor: result.interiorColor,
            exteriorColor: result.exteriorColor,
            cargurusUrl: result.cargurusUrl
          }
        }));
        toast({
          title: "Colors Found",
          description: `${result.exteriorColor || 'Unknown'} exterior, ${result.interiorColor || 'Unknown'} interior`
        });
      } else {
        toast({
          title: "No Colors Found",
          description: "Could not find color information for this vehicle",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error fetching colors:', error);
      toast({
        title: "Error",
        description: "Failed to fetch color information",
        variant: "destructive"
      });
    } finally {
      setColorLoadingVins(prev => {
        const newSet = new Set(prev);
        newSet.delete(vin);
        return newSet;
      });
    }
  };

  useEffect(() => {
    fetchInventoryAnalysis(selectedRadius);
  }, [selectedRadius]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString('en-CA', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPriceComparisonColor = (comparison: string | null) => {
    switch (comparison) {
      case 'below_market': return 'text-green-600 bg-green-100';
      case 'at_market': return 'text-blue-600 bg-blue-100';
      case 'above_market': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPriceComparisonLabel = (comparison: string | null) => {
    switch (comparison) {
      case 'below_market': return 'Below Market';
      case 'at_market': return 'At Market';
      case 'above_market': return 'Above Market';
      default: return 'No Data';
    }
  };

  return (
    <div data-testid="tab-content-inventory" className="space-y-6">
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold">Inventory Market Analysis</h3>
          <p className="text-sm text-muted-foreground">
            Compare your vehicles against market pricing
            {inventoryData?.lastUpdated && (
              <span className="ml-2 text-xs">
                • Updated {formatDate(inventoryData.lastUpdated)}
              </span>
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select value={selectedRadius} onValueChange={setSelectedRadius}>
            <SelectTrigger className="w-[140px]" data-testid="radius-selector">
              <SelectValue placeholder="Distance" />
            </SelectTrigger>
            <SelectContent>
              {radiusOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value} data-testid={`radius-${opt.value}`}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="analyze-button"
            className="flex-1 sm:flex-none"
          >
            {isRefreshing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Analyze
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : inventoryData?.vehicles?.length > 0 ? (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{inventoryData.totalVehicles}</div>
                <div className="text-xs text-muted-foreground">Total Vehicles</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-green-600">
                  {inventoryData.vehicles.filter((v: any) => v.priceComparison === 'below_market').length}
                </div>
                <div className="text-xs text-muted-foreground">Below Market</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-blue-600">
                  {inventoryData.vehicles.filter((v: any) => v.priceComparison === 'at_market').length}
                </div>
                <div className="text-xs text-muted-foreground">At Market</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-red-600">
                  {inventoryData.vehicles.filter((v: any) => v.priceComparison === 'above_market').length}
                </div>
                <div className="text-xs text-muted-foreground">Above Market</div>
              </CardContent>
            </Card>
            <Card className="border-orange-200 bg-orange-50/50">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-orange-600">
                  {inventoryData.vehicles.filter((v: any) => {
                    if (!v.marketData || !v.price || !v.marketData.avgPrice) return false;
                    const priceDiffPercent = ((v.price - v.marketData.avgPrice) / v.marketData.avgPrice) * 100;
                    return Number.isFinite(priceDiffPercent) && Math.abs(priceDiffPercent) > 10;
                  }).length}
                </div>
                <div className="text-xs text-muted-foreground">Price Alerts</div>
              </CardContent>
            </Card>
          </div>

          {/* Competitor Price Alerts */}
          <div className="mb-2">
            <CompetitorAlertsWidget />
          </div>

          {/* Vehicle list */}
          <div className="space-y-3">
            {inventoryData.vehicles.map((vehicle: any) => (
              <Card key={vehicle.id} data-testid={`vehicle-card-${vehicle.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    {/* Vehicle info */}
                    <div>
                        <h4 className="font-semibold">
                          {vehicle.year} {vehicle.make} {vehicle.model}
                        </h4>
                        {vehicle.trim && (
                          <p className="text-sm text-muted-foreground">{vehicle.trim}</p>
                        )}
                        <p className="text-lg font-bold mt-1">
                          {vehicle.price ? formatCurrency(vehicle.price) : 'No Price'}
                        </p>
                        {vehicle.mileage && (
                          <p className="text-xs text-muted-foreground">
                            {vehicle.mileage.toLocaleString()} km
                          </p>
                        )}
                        {/* Color display */}
                        {(vehicleColors[vehicle.vin] || vehicle.exteriorColor || vehicle.interiorColor) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(vehicleColors[vehicle.vin]?.exteriorColor || vehicle.exteriorColor) && (
                              <Badge variant="outline" className="text-xs">
                                Ext: {vehicleColors[vehicle.vin]?.exteriorColor || vehicle.exteriorColor}
                              </Badge>
                            )}
                            {(vehicleColors[vehicle.vin]?.interiorColor || vehicle.interiorColor) && (
                              <Badge variant="outline" className="text-xs">
                                Int: {vehicleColors[vehicle.vin]?.interiorColor || vehicle.interiorColor}
                              </Badge>
                            )}
                          </div>
                        )}
                        {/* Fetch colors button */}
                        {vehicle.vin && !vehicleColors[vehicle.vin] && !vehicle.exteriorColor && !vehicle.interiorColor && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 h-7 text-xs"
                            onClick={() => fetchColorsForVehicle(vehicle.vin)}
                            disabled={colorLoadingVins.has(vehicle.vin)}
                            data-testid={`button-fetch-colors-${vehicle.id}`}
                          >
                            {colorLoadingVins.has(vehicle.vin) ? (
                              <>
                                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                Fetching...
                              </>
                            ) : (
                              <>
                                <Search className="w-3 h-3 mr-1" />
                                Fetch Colors
                              </>
                            )}
                          </Button>
                        )}
                    </div>

                    {/* Market comparison */}
                    <div className="flex flex-col items-end gap-2 min-w-[200px]">
                      <Badge className={cn("text-xs", getPriceComparisonColor(vehicle.priceComparison))}>
                        {getPriceComparisonLabel(vehicle.priceComparison)}
                      </Badge>
                      
                      {/* Price Alert Badge - Shows when vehicle is >10% above/below market */}
                      {vehicle.marketData && vehicle.price && vehicle.marketData.avgPrice > 0 && (() => {
                        const priceDiff = vehicle.price - vehicle.marketData.avgPrice;
                        const priceDiffPercent = (priceDiff / vehicle.marketData.avgPrice) * 100;
                        if (!Number.isFinite(priceDiffPercent)) return null;
                        const showAlert = Math.abs(priceDiffPercent) > 10;
                        
                        if (showAlert) {
                          const isOverpriced = priceDiffPercent > 0;
                          return (
                            <div 
                              className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
                                isOverpriced 
                                  ? "bg-red-100 text-red-700 border border-red-200" 
                                  : "bg-green-100 text-green-700 border border-green-200"
                              )}
                              data-testid={`price-alert-${vehicle.id}`}
                            >
                              {isOverpriced ? (
                                <>
                                  <ArrowUp className="w-3 h-3" />
                                  <span>OVERPRICED {Math.abs(priceDiffPercent).toFixed(0)}%</span>
                                </>
                              ) : (
                                <>
                                  <ArrowDown className="w-3 h-3" />
                                  <span>UNDERPRICED {Math.abs(priceDiffPercent).toFixed(0)}%</span>
                                </>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}
                      
                      {vehicle.marketData ? (
                        <div className="text-right">
                          <div className="text-sm">
                            <span className="text-muted-foreground">Market Avg: </span>
                            <span className="font-medium">{formatCurrency(vehicle.marketData.avgPrice)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {vehicle.marketData.totalListings} listings • {formatCurrency(vehicle.marketData.minPrice)} - {formatCurrency(vehicle.marketData.maxPrice)}
                          </div>
                          {vehicle.percentilePosition !== null && (
                            <div className="mt-2">
                              <div className="text-xs text-muted-foreground mb-1">
                                Price Percentile: {vehicle.percentilePosition}%
                              </div>
                              <Progress value={vehicle.percentilePosition} className="h-2 w-32" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          No market data available
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* AutoTrader Search Link */}
                  <div className="mt-4 border-t pt-3">
                    <a
                      href={`https://www.autotrader.ca/cars/bc/vancouver/?rcp=15&rcs=0&prv=BC&prx=500&make=${encodeURIComponent(vehicle.make)}&mdl=${encodeURIComponent(vehicle.model)}${vehicle.trim ? `&trim=${encodeURIComponent(vehicle.trim)}` : ''}&yRng=${vehicle.year}%2C${vehicle.year}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                      data-testid={`link-autotrader-${vehicle.id}`}
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Similar on AutoTrader (Vancouver, 500km)
                    </a>
                  </div>
                  
                  {/* Competitor Vehicles Section */}
                  {vehicle.comparableListings && vehicle.comparableListings.length > 0 && (
                    <Accordion type="single" collapsible className="mt-3">
                      <AccordionItem value="competitors" className="border-t">
                        <AccordionTrigger className="py-2 text-sm">
                          <span className="flex items-center gap-2">
                            <Car className="w-4 h-4" />
                            View {vehicle.comparableListings.length} Competitor Vehicles
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pt-2">
                            {vehicle.comparableListings.map((comp: any, idx: number) => (
                              <div 
                                key={comp.id || idx} 
                                className="bg-muted/50 rounded-lg p-3 text-sm"
                                data-testid={`competitor-${vehicle.id}-${idx}`}
                              >
                                <div className="flex justify-between items-start gap-4">
                                  <div className="flex-1">
                                    <div className="font-medium">
                                      {comp.year} {comp.make} {comp.model} {comp.trim || ''}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {comp.sellerName || 'Unknown Dealer'} • {comp.location || 'Unknown Location'}
                                    </div>
                                    {/* Color info */}
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      {comp.exteriorColor && (
                                        <Badge variant="outline" className="text-xs">
                                          Ext: {comp.exteriorColor}
                                        </Badge>
                                      )}
                                      {comp.interiorColor && (
                                        <Badge variant="outline" className="text-xs">
                                          Int: {comp.interiorColor}
                                        </Badge>
                                      )}
                                      {comp.daysOnMarket !== null && comp.daysOnMarket !== undefined && (
                                        <Badge 
                                          variant="outline" 
                                          className={cn(
                                            "text-xs",
                                            comp.daysOnMarket > 60 ? "border-red-300 text-red-600" :
                                            comp.daysOnMarket > 30 ? "border-yellow-300 text-yellow-600" :
                                            "border-green-300 text-green-600"
                                          )}
                                        >
                                          <Clock className="w-3 h-3 mr-1" />
                                          {comp.daysOnMarket} days
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold">
                                      {formatCurrency(comp.price)}
                                    </div>
                                    {comp.mileage && (
                                      <div className="text-xs text-muted-foreground">
                                        {comp.mileage.toLocaleString()} km
                                      </div>
                                    )}
                                    {comp.listingUrl && (
                                      <a
                                        href={comp.listingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        View
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Car className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">No Vehicles Found</h3>
          <p className="text-sm">
            Your inventory is empty. Add vehicles to see market analysis.
          </p>
        </div>
      )}
    </div>
  );
}

// Marketplace Templates Tab Component
function MarketplaceTemplatesTab() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    templateName: '',
    titleTemplate: '{year} {make} {model} - ${price}',
    descriptionTemplate: ''
  });

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const data = await apiGet<any[]>('/api/ad-templates/shared', {
        'Authorization': `Bearer ${token}`
      });
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: "Error",
        description: "Failed to load templates",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreateTemplate = async () => {
    if (!newTemplate.templateName.trim() || !newTemplate.titleTemplate.trim() || !newTemplate.descriptionTemplate.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in all template fields",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      await apiPost('/api/ad-templates/shared', newTemplate, {
        'Authorization': `Bearer ${token}`
      });
      toast({
        title: "Template Created",
        description: "The shared template is now available to all staff"
      });
      setIsCreating(false);
      setNewTemplate({
        templateName: '',
        titleTemplate: '{year} {make} {model} - ${price}',
        descriptionTemplate: ''
      });
      fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || error.message || "Failed to create template",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;

    setIsSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      await apiPatch(`/api/ad-templates/shared/${editingTemplate.id}`, {
        templateName: editingTemplate.templateName,
        titleTemplate: editingTemplate.titleTemplate,
        descriptionTemplate: editingTemplate.descriptionTemplate
      }, {
        'Authorization': `Bearer ${token}`
      });
      toast({
        title: "Template Updated",
        description: "Changes saved successfully"
      });
      setEditingTemplate(null);
      fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || error.message || "Failed to update template",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (templateId: number) => {
    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      await apiDelete(`/api/ad-templates/shared/${templateId}`, {
        'Authorization': `Bearer ${token}`
      });
      toast({
        title: "Template Deleted",
        description: "The template has been removed"
      });
      fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || error.message || "Failed to delete template",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="tab-content-templates">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold">Marketplace Templates</h3>
          <p className="text-sm text-muted-foreground">
            Create and manage shared templates for Facebook Marketplace posts. 
            Staff can use these templates or create personal copies.
          </p>
        </div>
        <Button
          onClick={() => setIsCreating(true)}
          disabled={isCreating}
          data-testid="button-create-template"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Variable Reference */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-2">Available Variables</h4>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">{'{year}'}</Badge>
          <Badge variant="secondary">{'{make}'}</Badge>
          <Badge variant="secondary">{'{model}'}</Badge>
          <Badge variant="secondary">{'{trim}'}</Badge>
          <Badge variant="secondary">{'{price}'}</Badge>
          <Badge variant="secondary">{'{mileage}'}</Badge>
          <Badge variant="secondary">{'{color}'}</Badge>
          <Badge variant="secondary">{'{stock}'}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          These variables will be replaced with actual vehicle data when generating posts.
        </p>
      </div>

      {/* Create New Template Form */}
      {isCreating && (
        <Card className="border-blue-500">
          <CardHeader>
            <CardTitle className="text-base">Create New Shared Template</CardTitle>
            <CardDescription>
              This template will be available to all staff members
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="new-template-name">Template Name</Label>
              <Input
                id="new-template-name"
                placeholder="e.g., Standard Listing, Premium Vehicle, Quick Sale"
                value={newTemplate.templateName}
                onChange={(e) => setNewTemplate({ ...newTemplate, templateName: e.target.value })}
                data-testid="input-new-template-name"
              />
            </div>
            <div>
              <Label htmlFor="new-title-template">Title Template</Label>
              <Input
                id="new-title-template"
                placeholder="e.g., {year} {make} {model} - ${price}"
                value={newTemplate.titleTemplate}
                onChange={(e) => setNewTemplate({ ...newTemplate, titleTemplate: e.target.value })}
                data-testid="input-new-title-template"
              />
            </div>
            <div>
              <Label htmlFor="new-description-template">Description Template</Label>
              <Textarea
                id="new-description-template"
                placeholder="Enter the full description template with variables..."
                value={newTemplate.descriptionTemplate}
                onChange={(e) => setNewTemplate({ ...newTemplate, descriptionTemplate: e.target.value })}
                rows={6}
                data-testid="textarea-new-description-template"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreating(false);
                  setNewTemplate({
                    templateName: '',
                    titleTemplate: '{year} {make} {model} - ${price}',
                    descriptionTemplate: ''
                  });
                }}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTemplate}
                disabled={isSaving}
                data-testid="button-save-new-template"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Create Template
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template List */}
      {templates.length > 0 ? (
        <div className="space-y-4">
          {templates.map((template) => (
            <Card key={template.id} data-testid={`template-card-${template.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {template.templateName}
                      {template.isDefault && (
                        <Badge variant="secondary" className="text-xs">Default</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Created {new Date(template.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingTemplate(template)}
                      data-testid={`button-edit-template-${template.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="text-destructive hover:text-destructive"
                      data-testid={`button-delete-template-${template.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {editingTemplate?.id === template.id ? (
                  <div className="space-y-4">
                    <div>
                      <Label>Template Name</Label>
                      <Input
                        value={editingTemplate.templateName}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, templateName: e.target.value })}
                        data-testid={`input-edit-name-${template.id}`}
                      />
                    </div>
                    <div>
                      <Label>Title Template</Label>
                      <Input
                        value={editingTemplate.titleTemplate}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, titleTemplate: e.target.value })}
                        data-testid={`input-edit-title-${template.id}`}
                      />
                    </div>
                    <div>
                      <Label>Description Template</Label>
                      <Textarea
                        value={editingTemplate.descriptionTemplate}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, descriptionTemplate: e.target.value })}
                        rows={6}
                        data-testid={`textarea-edit-description-${template.id}`}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingTemplate(null)}
                        data-testid={`button-cancel-edit-${template.id}`}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleUpdateTemplate}
                        disabled={isSaving}
                        data-testid={`button-save-edit-${template.id}`}
                      >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-muted-foreground">Title:</span>
                      <p className="text-sm font-mono bg-muted px-2 py-1 rounded">{template.titleTemplate}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Description:</span>
                      <p className="text-sm font-mono bg-muted px-2 py-1 rounded whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {template.descriptionTemplate}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Sparkles className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">No Templates Yet</h3>
          <p className="text-sm mb-4">
            Create your first shared template to help staff post vehicles quickly.
          </p>
          <Button onClick={() => setIsCreating(true)} data-testid="button-create-first-template">
            <Plus className="w-4 h-4 mr-2" />
            Create First Template
          </Button>
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Template Hierarchy</h4>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Templates you create here are <strong>shared</strong> and visible to all staff. 
          Salespeople can fork these templates to create personal copies without affecting the originals.
        </p>
      </div>
    </div>
  );
}

export default function Manager() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const { toast } = useToast();

  // VIN state
  const [vin, setVin] = useState("");
  const [vinResults, setVinResults] = useState<any>(null);
  const [isDecoding, setIsDecoding] = useState(false);

  // Manager settings state
  const [settings, setSettings] = useState({
    postalCode: "",
    defaultRadiusKm: 50
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [activeManagerTab, setActiveManagerTab] = useState<'appraisal' | 'inventory' | 'my-inventory' | 'conversations' | 'prompts' | 'settings' | 'history' | 'followup' | 'call-scoring' | 'templates' | 'appointments'>('appraisal');

  // Conversations state
  const [allConversations, setAllConversations] = useState<{
    websiteChats: any[];
    messengerConversations: any[];
    totalWebsiteChats: number;
    totalMessengerConversations: number;
  } | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [viewingConversation, setViewingConversation] = useState<any>(null);
  const [messengerReplyText, setMessengerReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Market pricing state
  const [pricingForm, setPricingForm] = useState({
    selectedYears: [] as number[],
    make: "",
    model: "",
    selectedTrims: [] as string[],
    mileage: "",
    radiusKm: "50"
  });
  const [pricingResults, setPricingResults] = useState<any>(null);
  const [enhancedResults, setEnhancedResults] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [showEnhancedView, setShowEnhancedView] = useState(true);

  // Live market pricing state (MarketCheck real-time data)
  const [livePricing, setLivePricing] = useState<any>(null);
  const [isLoadingLivePricing, setIsLoadingLivePricing] = useState(false);

  // Investment tier calculation (vAuto ProfitTime GPS equivalent)
  // Factors: demand score, days supply, market velocity, AND profit potential
  const calculateInvestmentTier = (pricing: any, acquisitionPrice?: number): { 
    tier: 'platinum' | 'gold' | 'silver' | 'bronze'; 
    label: string; 
    color: string; 
    bgColor: string; 
    borderColor: string; 
    recommendation: string; 
    icon: string;
    profitPotential?: number;
    profitMargin?: number;
    compositeScore: number;
  } => {
    if (!pricing?.marketDemand) {
      return { tier: 'bronze', label: 'Bronze', color: 'text-orange-700 dark:text-orange-300', bgColor: 'bg-orange-100 dark:bg-orange-900/30', borderColor: 'border-orange-400', recommendation: 'Consider wholesale options', icon: '🥉', compositeScore: 0 };
    }
    
    const { demandScore, daysSupply, marketVelocity } = pricing.marketDemand;
    const retailAvg = pricing.retailPrice?.average || 0;
    
    // Calculate profit potential if acquisition price is available
    let profitPotential: number | undefined;
    let profitMargin: number | undefined;
    let profitScore = 50; // Default neutral score when no acquisition price
    
    if (acquisitionPrice && acquisitionPrice > 0 && retailAvg > 0) {
      profitPotential = retailAvg - acquisitionPrice;
      profitMargin = (profitPotential / retailAvg) * 100;
      // High profit = >20% margin, Good = 12-20%, Average = 5-12%, Low = <5%
      if (profitMargin >= 20) profitScore = 100;
      else if (profitMargin >= 12) profitScore = 75;
      else if (profitMargin >= 5) profitScore = 50;
      else if (profitMargin >= 0) profitScore = 25;
      else profitScore = 0; // Negative margin
    }
    
    // Convert supply/velocity into a 0-100 normalized score
    // Days supply: <30 = excellent (100), 30-45 = good (75), 45-60 = average (50), 60-75 = poor (25), >75 = bad (0)
    let supplyScore = 50;
    if (daysSupply < 30) supplyScore = 100;
    else if (daysSupply < 45) supplyScore = 75;
    else if (daysSupply < 60) supplyScore = 50;
    else if (daysSupply < 75) supplyScore = 25;
    else supplyScore = 0;
    
    // Velocity: fast = 100, average = 50, slow = 0
    const velocityScore = marketVelocity === 'fast' ? 100 : marketVelocity === 'slow' ? 0 : 50;
    
    // Blend supply and velocity into a single supply/velocity score
    const supplyVelocityScore = (supplyScore * 0.7) + (velocityScore * 0.3);
    
    // Composite score: demand (50%) + profit potential (35%) + supply/velocity (15%)
    const compositeScore = Math.round(
      (demandScore * 0.50) + (profitScore * 0.35) + (supplyVelocityScore * 0.15)
    );
    
    // Tier based primarily on composite score
    // Platinum: compositeScore >= 75 (high demand + good profit + favorable supply)
    if (compositeScore >= 75) {
      return { 
        tier: 'platinum', 
        label: 'Platinum', 
        color: 'text-purple-700 dark:text-purple-200', 
        bgColor: 'bg-gradient-to-r from-purple-100 to-indigo-100 dark:from-purple-900/40 dark:to-indigo-900/40', 
        borderColor: 'border-purple-400',
        recommendation: profitPotential !== undefined 
          ? `Price aggressively - $${profitPotential.toLocaleString()} profit potential` 
          : 'Price aggressively - high demand vehicle',
        icon: '💎',
        profitPotential,
        profitMargin,
        compositeScore
      };
    }
    
    // Gold: compositeScore >= 55
    if (compositeScore >= 55) {
      return { 
        tier: 'gold', 
        label: 'Gold', 
        color: 'text-yellow-700 dark:text-yellow-200', 
        bgColor: 'bg-gradient-to-r from-yellow-100 to-amber-100 dark:from-yellow-900/40 dark:to-amber-900/40', 
        borderColor: 'border-yellow-500',
        recommendation: profitPotential !== undefined 
          ? `Strong investment - $${profitPotential.toLocaleString()} profit potential`
          : 'Strong investment - price competitively',
        icon: '🥇',
        profitPotential,
        profitMargin,
        compositeScore
      };
    }
    
    // Silver: compositeScore >= 35
    if (compositeScore >= 35) {
      return { 
        tier: 'silver', 
        label: 'Silver', 
        color: 'text-gray-600 dark:text-gray-300', 
        bgColor: 'bg-gradient-to-r from-gray-100 to-slate-100 dark:from-gray-800/50 dark:to-slate-800/50', 
        borderColor: 'border-gray-400',
        recommendation: profitPotential !== undefined 
          ? `Standard pricing - $${profitPotential.toLocaleString()} margin`
          : 'Standard pricing - monitor market',
        icon: '🥈',
        profitPotential,
        profitMargin,
        compositeScore
      };
    }
    
    // Bronze: compositeScore < 35 = wholesale consideration
    return { 
      tier: 'bronze', 
      label: 'Bronze', 
      color: 'text-orange-700 dark:text-orange-300', 
      bgColor: 'bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30', 
      borderColor: 'border-orange-400',
      recommendation: profitPotential !== undefined && profitPotential < 0
        ? `Wholesale recommended - $${Math.abs(profitPotential).toLocaleString()} loss at market`
        : 'Consider wholesale or aggressive pricing',
      icon: '🥉',
      profitPotential,
      profitMargin,
      compositeScore
    };
  };

  // Autocomplete data
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [trims, setTrims] = useState<string[]>([]);

  // Popover states for autocomplete
  const [yearOpen, setYearOpen] = useState(false);
  const [makeOpen, setMakeOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [trimOpen, setTrimOpen] = useState(false);

  // Metrics state
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    activeConversations: 0,
    appointmentsBooked: 0,
    scheduledPosts: 0
  });
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);

  // Chat prompts state
  const [chatPrompts, setChatPrompts] = useState<any[]>([]);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(true);
  const [editingPromptId, setEditingPromptId] = useState<number | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<{ greeting: string; systemPrompt: string }>({ greeting: '', systemPrompt: '' });
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  // Appraisal state
  const [previousAppraisal, setPreviousAppraisal] = useState<any>(null);
  const [isSavingAppraisal, setIsSavingAppraisal] = useState(false);
  const [appraisalNotes, setAppraisalNotes] = useState("");
  const [quotedPrice, setQuotedPrice] = useState("");
  const [reconCost, setReconCost] = useState("");
  const [tradePayoff, setTradePayoff] = useState("");
  const [targetRetailPrice, setTargetRetailPrice] = useState("");
  const [appraisalHistory, setAppraisalHistory] = useState<any[]>([]);
  const [isLoadingAppraisalHistory, setIsLoadingAppraisalHistory] = useState(false);

  // Historical analytics state
  const [priceTrends, setPriceTrends] = useState<{ date: string; averagePrice: number; medianPrice: number; listingCount: number }[]>([]);
  const [isLoadingPriceTrends, setIsLoadingPriceTrends] = useState(false);
  const [showHistoricalAnalytics, setShowHistoricalAnalytics] = useState(false);

  // Pass quotedPrice as acquisition cost for profit calculation
  const acquisitionCost = quotedPrice ? parseFloat(quotedPrice) : undefined;
  const investmentTier = livePricing ? calculateInvestmentTier(livePricing, acquisitionCost) : null;

  useEffect(() => {
    checkAuth();
  }, []);

  // Load autocomplete options when form values change
  useEffect(() => {
    if (user) {
      loadMakes();
      loadSettings();
      loadMetrics();
      loadChatPrompts();
      loadWebsiteUrl();
    }
  }, [user]);

  useEffect(() => {
    if (pricingForm.make) {
      loadModels(pricingForm.make);
    } else {
      setModels([]);
    }
    // Clear model and trims when make changes
    if (pricingForm.make !== vinResults?.make) {
      setPricingForm(prev => ({ ...prev, model: "", selectedTrims: [] }));
    }
  }, [pricingForm.make]);

  useEffect(() => {
    if (pricingForm.make && pricingForm.model) {
      loadTrims(pricingForm.make, pricingForm.model);
    } else {
      setTrims([]);
    }
    // Clear trims when model changes
    if (pricingForm.model !== vinResults?.model) {
      setPricingForm(prev => ({ ...prev, selectedTrims: [] }));
    }
  }, [pricingForm.make, pricingForm.model]);

  // Load conversations when tab is selected
  useEffect(() => {
    if (activeManagerTab === 'conversations' && user && !allConversations) {
      loadConversations();
    }
  }, [activeManagerTab, user]);

  const sendMessengerReply = async () => {
    if (!viewingConversation || !messengerReplyText.trim() || viewingConversation.type !== 'messenger') return;
    
    setIsSendingReply(true);
    try {
      const token = localStorage.getItem('auth_token');
      await apiPost(`/api/messenger-conversations/${viewingConversation.id}/reply`, 
        { message: messengerReplyText.trim() },
        { 'Authorization': `Bearer ${token}` }
      );
      toast({
        title: "Reply Sent",
        description: "Your message has been sent successfully"
      });
      setMessengerReplyText("");
      loadConversations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || error.message || "Failed to send reply",
        variant: "destructive"
      });
    } finally {
      setIsSendingReply(false);
    }
  };

  const loadConversations = async () => {
    setIsLoadingConversations(true);
    try {
      const token = localStorage.getItem('auth_token');
      const data = await apiGet<any>('/api/all-conversations', {
        'Authorization': `Bearer ${token}`
      });
      setAllConversations(data);
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive"
      });
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const checkAuth = async () => {
    const token = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('user');

    if (!token || !storedUser) {
      setLocation('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      
      if (parsedUser.role !== 'manager' && parsedUser.role !== 'master') {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        setLocation('/');
        return;
      }

      setUser(parsedUser);
    } catch (error) {
      console.error("Auth check failed:", error);
      setLocation('/login');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMakes = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const data = await apiGet<string[]>('/api/inventory/makes', {
        'Authorization': `Bearer ${token}`
      });
      setMakes(data);
    } catch (error) {
      console.error("Error loading makes:", error);
    }
  };

  const loadModels = async (make: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      const data = await apiGet<string[]>(`/api/inventory/models?make=${encodeURIComponent(make)}`, {
        'Authorization': `Bearer ${token}`
      });
      setModels(data);
    } catch (error) {
      console.error("Error loading models:", error);
    }
  };

  const loadTrims = async (make: string, model: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      const data = await apiGet<string[]>(`/api/inventory/trims?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`, {
        'Authorization': `Bearer ${token}`
      });
      setTrims(data);
    } catch (error) {
      console.error("Error loading trims:", error);
    }
  };

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const data = await apiGet<any>('/api/manager/settings', {
        'Authorization': `Bearer ${token}`
      });
      if (data) {
        setSettings({
          postalCode: data.postalCode || "",
          defaultRadiusKm: data.defaultRadiusKm || 50
        });
        setPricingForm(prev => ({ ...prev, radiusKm: String(data.defaultRadiusKm || 50) }));
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const loadWebsiteUrl = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const data = await apiGet<{ websiteUrl: string }>('/api/dealership/website-url', {
        'Authorization': `Bearer ${token}`
      });
      setWebsiteUrl(data.websiteUrl);
    } catch (error) {
      console.error("Error loading website URL:", error);
    }
  };

  const loadMetrics = async () => {
    setIsLoadingMetrics(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [conversationsData, queueData] = await Promise.all([
        apiGet<any>('/api/conversations', headers).catch(() => null),
        apiGet<any>('/api/facebook/queue', headers).catch(() => null)
      ]);

      let totalLeads = 0;
      let activeConversations = 0;
      let appointmentsBooked = 0;  // Appointments feature pending - tracked in roadmap
      let scheduledPosts = 0;

      if (conversationsData) {
        // Handle both array (backward compatible) and paginated response format
        let conversationsList: any[] = [];
        if (Array.isArray(conversationsData)) {
          conversationsList = conversationsData;
        } else if (conversationsData && typeof conversationsData === 'object') {
          // Check for various response structures
          if (Array.isArray(conversationsData.data)) {
            conversationsList = conversationsData.data;
          } else if (Array.isArray(conversationsData.conversations)) {
            conversationsList = conversationsData.conversations;
          }
        }
        
        // Safely get total count
        totalLeads = (conversationsData && typeof conversationsData === 'object' && typeof conversationsData.total === 'number')
          ? conversationsData.total
          : conversationsList.length;
        
        // Calculate active conversations (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        activeConversations = conversationsList.filter((conv: any) => {
          if (!conv) return false;
          
          // Safely parse timestamp
          const timestamp = conv.lastMessageAt || conv.createdAt;
          if (!timestamp) return false;
          
          const lastMessageDate = new Date(timestamp);
          // Validate date is not Invalid Date
          if (isNaN(lastMessageDate.getTime())) return false;
          
          return lastMessageDate >= sevenDaysAgo;
        }).length;
      }

      if (queueData) {
        // Handle both array and potential object response
        let queueList: any[] = [];
        if (Array.isArray(queueData)) {
          queueList = queueData;
        } else if (queueData && typeof queueData === 'object') {
          if (Array.isArray(queueData.queue)) {
            queueList = queueData.queue;
          } else if (Array.isArray(queueData.data)) {
            queueList = queueData.data;
          }
        }
        
        scheduledPosts = queueList.length;
      }

      setMetrics({
        totalLeads,
        activeConversations,
        appointmentsBooked,
        scheduledPosts
      });
    } catch (error) {
      console.error("Error loading metrics:", error);
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  const loadChatPrompts = async () => {
    setIsLoadingPrompts(true);
    try {
      const token = localStorage.getItem('auth_token');
      const data = await apiGet<any[]>('/api/chat-prompts', {
        'Authorization': `Bearer ${token}`
      });
      setChatPrompts(data);
    } catch (error) {
      console.error("Error loading chat prompts:", error);
    } finally {
      setIsLoadingPrompts(false);
    }
  };

  const startEditingPrompt = (prompt: any) => {
    setEditingPromptId(prompt.id);
    setEditedPrompt({
      greeting: prompt.greeting,
      systemPrompt: prompt.systemPrompt
    });
  };

  const cancelEditingPrompt = () => {
    setEditingPromptId(null);
    setEditedPrompt({ greeting: '', systemPrompt: '' });
  };

  const savePrompt = async (prompt: any) => {
    setIsSavingPrompt(true);
    try {
      const token = localStorage.getItem('auth_token');
      await apiPost('/api/chat-prompts', {
        scenario: prompt.scenario,
        greeting: editedPrompt.greeting,
        systemPrompt: editedPrompt.systemPrompt
      }, {
        'Authorization': `Bearer ${token}`
      });
      toast({
        title: "Success",
        description: "Chat prompt saved successfully",
      });
      setEditingPromptId(null);
      setEditedPrompt({ greeting: '', systemPrompt: '' });
      loadChatPrompts();
    } catch (error: any) {
      console.error("Error saving chat prompt:", error);
      toast({
        title: "Error",
        description: error.body?.error || "Failed to save prompt",
        variant: "destructive",
      });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const formatScenario = (scenario: string): string => {
    const scenarioMap: { [key: string]: string } = {
      'test-drive': 'Test Drive',
      'get-approved': 'Get Approved',
      'value-trade': 'Value Trade',
      'reserve': 'Reserve',
      'general': 'General'
    };
    return scenarioMap[scenario] || scenario;
  };

  const handleSaveSettings = async () => {
    // Validate postal code (Canadian format: A1A 1A1 or A1A1A1)
    const trimmedPostalCode = settings.postalCode.trim().toUpperCase();
    const canadianPostalCodeRegex = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/;
    
    if (!trimmedPostalCode || !canadianPostalCodeRegex.test(trimmedPostalCode)) {
      toast({
        title: "Invalid Postal Code",
        description: "Please enter a valid Canadian postal code (e.g., V6B 5J3)",
        variant: "destructive",
      });
      return;
    }

    setIsSavingSettings(true);
    try {
      const token = localStorage.getItem('auth_token');
      await apiPost('/api/manager/settings', {
        ...settings,
        postalCode: trimmedPostalCode
      }, {
        'Authorization': `Bearer ${token}`
      });
      setSettings(prev => ({ ...prev, postalCode: trimmedPostalCode }));
      toast({
        title: "Settings Saved",
        description: "Your postal code and default radius have been saved",
      });
      setPricingForm(prev => ({ ...prev, radiusKm: String(settings.defaultRadiusKm) }));
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast({
        title: "Save Failed",
        description: error.body?.message || "Unable to save settings",
        variant: "destructive",
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleRefreshMarketData = async () => {
    if (!pricingForm.make || !pricingForm.model) {
      toast({
        title: "Missing Information",
        description: "Please select make and model first",
        variant: "destructive",
      });
      return;
    }

    if (!settings.postalCode || settings.postalCode.trim() === '') {
      toast({
        title: "Settings Required",
        description: "Please configure your postal code in Settings first",
        variant: "destructive",
      });
      setActiveManagerTab('settings');
      return;
    }

    setIsScraping(true);
    try {
      const token = localStorage.getItem('auth_token');
      
      const currentYear = new Date().getFullYear();
      const years = pricingForm.selectedYears.length > 0 ? pricingForm.selectedYears : [currentYear];
      const yearMin = Math.min(...years);
      const yearMax = Math.max(...years);
      
      const result = await apiPost<any>('/api/manager/scrape-market', {
        make: pricingForm.make,
        model: pricingForm.model,
        yearMin,
        yearMax,
        postalCode: settings.postalCode.trim(),
        radiusKm: parseInt(pricingForm.radiusKm) || settings.defaultRadiusKm,
        maxResults: 100
      }, {
        'Authorization': `Bearer ${token}`
      });
      
      if (result.error) {
        // Show detailed error breakdown if available
        const errorDetails = result.errors && result.errors.length > 0 
          ? `Errors: ${result.errors.join(', ')}`
          : result.message || "Unable to fetch market data";
        
        toast({
          title: "Market Data Aggregation Failed",
          description: errorDetails,
          variant: "destructive",
        });
      } else {
        // Build detailed success message showing source breakdown
        const sourceBreakdown = [];
        if (result.marketCheckCount > 0) sourceBreakdown.push(`MarketCheck: ${result.marketCheckCount}`);
        if (result.apifyCount > 0) sourceBreakdown.push(`Apify: ${result.apifyCount}`);
        if (result.scraperCount > 0) sourceBreakdown.push(`Scraper: ${result.scraperCount}`);
        
        const successMessage = `Saved ${result.savedCount} new listings${sourceBreakdown.length > 0 ? ` (${sourceBreakdown.join(', ')})` : ''}`;
        
        toast({
          title: "Market Data Refreshed",
          description: successMessage,
        });
        
        // Show warnings if any sources had errors
        if (result.errors && result.errors.length > 0) {
          setTimeout(() => {
            toast({
              title: "Some Data Sources Failed",
              description: result.errors.join(', '),
              variant: "default",
            });
          }, 2000);
        }
        
        // Auto-trigger market analysis after refresh
        setTimeout(() => {
          handleMarketSearch();
        }, 500);
      }
    } catch (error) {
      console.error("Market scraping error:", error);
      toast({
        title: "Error",
        description: "Failed to refresh market data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    setLocation('/login');
  };

  const handleVinDecode = async () => {
    if (vin.length !== 17) {
      toast({
        title: "Invalid VIN",
        description: "VIN must be exactly 17 characters",
        variant: "destructive",
      });
      return;
    }

    setIsDecoding(true);
    setVinResults(null);

    try {
      const token = localStorage.getItem('auth_token');
      const result = await apiPost<any>('/api/manager/decode-vin', { vin }, {
        'Authorization': `Bearer ${token}`
      });
      
      if (result.errorCode) {
        toast({
          title: "Decode Failed",
          description: result.errorMessage || "Unable to decode VIN",
          variant: "destructive",
        });
      } else {
        setVinResults(result);
        
        // Auto-populate market pricing form
        const currentYear = new Date().getFullYear();
        const vehicleYear = result.year || currentYear;
        setPricingForm(prev => ({
          ...prev,
          selectedYears: vehicleYear ? [vehicleYear] : [],
          make: result.make || "",
          model: result.model || "",
          selectedTrims: result.trim ? [result.trim] : [],
          mileage: "",
          // Preserve existing radiusKm (from settings) or use settings default
          radiusKm: prev.radiusKm || String(settings.defaultRadiusKm || 50)
        }));

        // Check for previous appraisal with this VIN
        try {
          const response = await apiGet<any>(`/api/manager/appraisals/vin/${vin}`, {
            'Authorization': `Bearer ${token}`
          });
          // API returns { exists: boolean, appraisal: object | null }
          // Only show popup if there's an actual saved appraisal with an id
          if (response?.appraisal?.id) {
            setPreviousAppraisal(response.appraisal);
            toast({
              title: "Previous Appraisal Found",
              description: `This vehicle was appraised on ${new Date(response.appraisal.createdAt).toLocaleDateString()}`,
            });
          } else {
            setPreviousAppraisal(null);
          }
        } catch (appraisalError) {
          console.error('Error checking for previous appraisal:', appraisalError);
          setPreviousAppraisal(null);
        }

        // Reset appraisal form fields
        setAppraisalNotes("");
        setQuotedPrice("");

        toast({
          title: "VIN Decoded Successfully",
          description: `${result.year || ''} ${result.make || ''} ${result.model || ''}`.trim(),
        });

        // Auto-trigger market analysis and live pricing with decoded values
        setTimeout(() => {
          if (result.make && result.model) {
            handleMarketSearch({
              make: result.make,
              model: result.model,
              years: result.year ? [result.year] : [],
              trims: result.trim ? [result.trim] : []
            });
          }
        }, 500);

        // Fetch live market pricing from MarketCheck
        fetchLivePricing(vin);
        
        // Fetch historical price trends for this vehicle type
        if (result.make && result.model) {
          loadPriceTrends(result.make, result.model);
        }
      }
    } catch (error) {
      console.error("VIN decode error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to decode VIN. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDecoding(false);
    }
  };

  const fetchLivePricing = async (vinNumber: string) => {
    setIsLoadingLivePricing(true);
    setLivePricing(null);
    
    try {
      const token = localStorage.getItem('auth_token');
      const result = await apiPost<any>('/api/manager/vin-pricing', {
        vin: vinNumber,
        mileage: pricingForm.mileage || undefined,
        postalCode: settings.postalCode || undefined
      }, {
        'Authorization': `Bearer ${token}`
      });
      
      if (result && !result.error) {
        setLivePricing(result);
      }
    } catch (error) {
      console.error("Live pricing error:", error);
    } finally {
      setIsLoadingLivePricing(false);
    }
  };

  const handleMarketSearch = async (overrides?: { make?: string; model?: string; years?: number[]; trims?: string[] }) => {
    const searchMake = overrides?.make || pricingForm.make;
    const searchModel = overrides?.model || pricingForm.model;
    const searchYears = overrides?.years || pricingForm.selectedYears;
    const searchTrims = overrides?.trims || pricingForm.selectedTrims;
    
    if (!searchMake || !searchModel) {
      toast({
        title: "Missing Information",
        description: "Please select make and model to search",
        variant: "destructive",
      });
      return;
    }

    if (!settings.postalCode || settings.postalCode.trim() === '') {
      toast({
        title: "Settings Required",
        description: "Please configure your postal code in Settings first to enable market pricing",
        variant: "destructive",
      });
      setActiveManagerTab('settings');
      return;
    }

    setIsAnalyzing(true);
    setPricingResults(null);
    setEnhancedResults(null);

    try {
      const token = localStorage.getItem('auth_token');
      
      const currentYear = new Date().getFullYear();
      const years = searchYears.length > 0 ? searchYears : [currentYear];
      
      // Call enhanced market analysis API for comprehensive data
      const enhancedResult = await apiPost<any>('/api/manager/enhanced-market-analysis', {
        make: searchMake,
        model: searchModel,
        years,
        trims: searchTrims.length > 0 ? searchTrims : undefined,
        mileage: pricingForm.mileage ? parseInt(pricingForm.mileage) : undefined,
        radiusKm: parseInt(pricingForm.radiusKm) || settings.defaultRadiusKm,
        postalCode: settings.postalCode.trim(),
      }, {
        'Authorization': `Bearer ${token}`
      });
      
      if (enhancedResult.error) {
        toast({
          title: "Analysis Failed",
          description: enhancedResult.message || "Unable to analyze market pricing",
          variant: "destructive",
        });
      } else {
        setEnhancedResults(enhancedResult);
        
        // Build legacy pricingResults for backward compatibility with proper defaults
        const summary = enhancedResult.summary || {};
        const priceRec = enhancedResult.priceRecommendation || {};
        const sourceBreakdown: Record<string, number> = {};
        
        // Build source breakdown from sources array
        if (enhancedResult.sources && Array.isArray(enhancedResult.sources)) {
          enhancedResult.sources.forEach((src: string) => {
            sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
          });
        }
        
        // Count listings by source from comparisons if available
        if (enhancedResult.comparisons && Array.isArray(enhancedResult.comparisons)) {
          enhancedResult.comparisons.forEach((comp: any) => {
            const source = comp.source || 'unknown';
            sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
          });
        }
        
        setPricingResults({
          averagePrice: summary.averagePrice || 0,
          medianPrice: summary.medianPrice || 0,
          minPrice: summary.minPrice || 0,
          maxPrice: summary.maxPrice || 0,
          totalComps: summary.totalListings || 0,
          priceRange: priceRec.priceRange || { low: summary.minPrice || 0, high: summary.maxPrice || 0 },
          recommendation: priceRec.reasoning || 'Market analysis complete. Review the price percentiles for optimal pricing.',
          comparisons: enhancedResult.comparisons || [],
          meta: {
            dataSource: 'external_market',
            totalListings: summary.totalListings || 0,
            sourceBreakdown,
            searchRadius: enhancedResult.searchParams?.radiusKm || parseInt(pricingForm.radiusKm),
            postalCode: enhancedResult.searchParams?.location || settings.postalCode,
            year: enhancedResult.searchParams?.years?.[0] || new Date().getFullYear()
          }
        });
        
        if (summary.totalListings > 0) {
          toast({
            title: "Analysis Complete",
            description: `Found ${summary.totalListings} comparable vehicles from ${enhancedResult.sources?.length || 1} source(s)`,
          });
        } else {
          toast({
            title: "No Results",
            description: "No comparable vehicles found. Try expanding your search criteria.",
            variant: "default",
          });
        }
      }
    } catch (error) {
      console.error("Market pricing error:", error);
      toast({
        title: "Error",
        description: "Failed to analyze market pricing. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save appraisal function
  const handleSaveAppraisal = async () => {
    if (!vin || !vinResults) {
      toast({
        title: "Missing Information",
        description: "Please decode a VIN first before saving an appraisal",
        variant: "destructive",
      });
      return;
    }

    setIsSavingAppraisal(true);
    try {
      const token = localStorage.getItem('auth_token');
      
      const parsedYear = vinResults.year ? parseInt(String(vinResults.year), 10) : NaN;
      const appraisalData = {
        vin: vin.toUpperCase(),
        year: !isNaN(parsedYear) ? parsedYear : new Date().getFullYear(),
        make: vinResults.make,
        model: vinResults.model,
        trim: vinResults.trim,
        bodyType: vinResults.bodyType,
        driveType: vinResults.driveType,
        fuelType: vinResults.fuelType,
        engineDescription: vinResults.engineDescription,
        transmission: vinResults.transmission,
        mileage: pricingForm.mileage ? parseInt(pricingForm.mileage) : null,
        marketData: enhancedResults || pricingResults || null,
        quotedPrice: quotedPrice ? parseFloat(quotedPrice) : null,
        notes: appraisalNotes || null,
      };

      const savedAppraisal = await apiPost<any>('/api/manager/appraisals', appraisalData, {
        'Authorization': `Bearer ${token}`
      });
      setPreviousAppraisal(savedAppraisal);
      
      toast({
        title: "Appraisal Saved",
        description: `Appraisal for ${vinResults.year} ${vinResults.make} ${vinResults.model} has been saved`,
      });
    } catch (error) {
      console.error("Save appraisal error:", error);
      toast({
        title: "Error",
        description: "Failed to save appraisal. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAppraisal(false);
    }
  };

  // Load previous appraisal data into form
  const loadPreviousAppraisal = () => {
    if (!previousAppraisal) return;
    
    if (previousAppraisal.quotedPrice) {
      setQuotedPrice(String(previousAppraisal.quotedPrice));
    }
    if (previousAppraisal.notes) {
      setAppraisalNotes(previousAppraisal.notes);
    }
    if (previousAppraisal.mileage) {
      setPricingForm(prev => ({ ...prev, mileage: String(previousAppraisal.mileage) }));
    }
    
    toast({
      title: "Previous Data Loaded",
      description: "Previous appraisal data has been loaded into the form",
    });
  };

  // Load appraisal history
  const loadAppraisalHistory = async () => {
    setIsLoadingAppraisalHistory(true);
    try {
      const token = localStorage.getItem('auth_token');
      const data = await apiGet<any>('/api/manager/appraisals', {
        'Authorization': `Bearer ${token}`
      });
      setAppraisalHistory(Array.isArray(data) ? data : (data?.appraisals || []));
    } catch (error) {
      console.error('Error loading appraisal history:', error);
      toast({
        title: "Error",
        description: "Failed to load appraisal history",
        variant: "destructive",
      });
      setAppraisalHistory([]);
    } finally {
      setIsLoadingAppraisalHistory(false);
    }
  };

  const loadPriceTrends = async (make: string, model: string) => {
    if (!make || !model) return;
    
    setIsLoadingPriceTrends(true);
    try {
      const token = localStorage.getItem('auth_token');
      const data = await apiGet<any[]>(`/api/manager/market-snapshots?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&limit=30`, {
        'Authorization': `Bearer ${token}`
      });
      
      if (Array.isArray(data) && data.length > 0) {
        const formattedData = data
          .map(s => ({
            date: new Date(s.snapshotDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            averagePrice: s.averagePrice,
            medianPrice: s.medianPrice,
            listingCount: s.totalListings
          }))
          .reverse();
        setPriceTrends(formattedData);
        setShowHistoricalAnalytics(true);
      } else {
        setPriceTrends([]);
      }
    } catch (error) {
      console.error('Error loading price trends:', error);
      setPriceTrends([]);
    } finally {
      setIsLoadingPriceTrends(false);
    }
  };

  // Load appraisal history when history tab is selected
  useEffect(() => {
    if (activeManagerTab === 'history' && user) {
      loadAppraisalHistory();
    }
  }, [activeManagerTab, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Sales Manager Dashboard</h1>
              <p className="text-muted-foreground">Welcome back, {user?.name}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button 
                onClick={() => window.open('/', '_blank')} 
                variant="outline" 
                data-testid="button-website-view" 
                className="w-full sm:w-auto"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Website View
              </Button>
              <Button onClick={handleLogout} variant="outline" data-testid="button-logout" className="w-full sm:w-auto">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>

          {/* Metrics Cards - Compact */}
          <div className="grid gap-2 grid-cols-4 mb-4">
            <Card data-testid="metric-total-leads" className="border-muted">
              <CardContent className="px-3 py-2.5 flex items-center justify-between">
                <div>
                  {isLoadingMetrics ? (
                    <div className="h-5 w-10 bg-muted rounded animate-pulse" />
                  ) : (
                    <>
                      <div className="text-lg font-bold" data-testid="value-total-leads">{metrics.totalLeads}</div>
                      <p className="text-xs text-muted-foreground">Total Leads</p>
                    </>
                  )}
                </div>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>

            <Card data-testid="metric-active-conversations" className="border-muted">
              <CardContent className="px-3 py-2.5 flex items-center justify-between">
                <div>
                  {isLoadingMetrics ? (
                    <div className="h-5 w-10 bg-muted rounded animate-pulse" />
                  ) : (
                    <>
                      <div className="text-lg font-bold" data-testid="value-active-conversations">{metrics.activeConversations}</div>
                      <p className="text-xs text-muted-foreground">Active (7d)</p>
                    </>
                  )}
                </div>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>

            <Card data-testid="metric-appointments-booked" className="border-muted">
              <CardContent className="px-3 py-2.5 flex items-center justify-between">
                <div>
                  {isLoadingMetrics ? (
                    <div className="h-5 w-10 bg-muted rounded animate-pulse" />
                  ) : (
                    <>
                      <div className="text-lg font-bold" data-testid="value-appointments-booked">{metrics.appointmentsBooked}</div>
                      <p className="text-xs text-muted-foreground">Appointments</p>
                    </>
                  )}
                </div>
                <CalendarCheck className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>

            <Card data-testid="metric-scheduled-posts" className="border-muted">
              <CardContent className="px-3 py-2.5 flex items-center justify-between">
                <div>
                  {isLoadingMetrics ? (
                    <div className="h-5 w-10 bg-muted rounded animate-pulse" />
                  ) : (
                    <>
                      <div className="text-lg font-bold" data-testid="value-scheduled-posts">{metrics.scheduledPosts}</div>
                      <p className="text-xs text-muted-foreground">Scheduled</p>
                    </>
                  )}
                </div>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </div>

          {/* Manager Settings with Tabs - Primary section */}
          <Card className="mb-6" data-testid="manager-settings-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Manager Settings
              </CardTitle>
              <CardDescription>
                Vehicle appraisal, inventory analysis, chat prompts, and configuration
              </CardDescription>
              <div className="flex flex-wrap gap-2 pt-4">
                <Button
                  variant={activeManagerTab === 'appraisal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveManagerTab('appraisal')}
                  data-testid="tab-vehicle-appraisal"
                  className="flex items-center gap-2"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  Vehicle Appraisal
                </Button>
                <Button
                  variant={activeManagerTab === 'inventory' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveManagerTab('inventory')}
                  data-testid="tab-inventory-analysis"
                  className="flex items-center gap-2"
                >
                  <BarChart3 className="w-4 h-4" />
                  Inventory Analysis
                </Button>
                <Button
                  variant={activeManagerTab === 'my-inventory' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveManagerTab('my-inventory')}
                  data-testid="tab-my-inventory"
                  className="flex items-center gap-2 bg-emerald-600/10 hover:bg-emerald-600/20"
                >
                  <PackageOpen className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-600 font-medium">My Inventory</span>
                </Button>
                <Button
                  variant={activeManagerTab === 'conversations' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveManagerTab('conversations')}
                  data-testid="tab-conversations"
                  className="flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Conversations
                </Button>
                <Button
                  variant={activeManagerTab === 'prompts' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveManagerTab('prompts')}
                  data-testid="tab-ai-chat-prompts"
                  className="flex items-center gap-2"
                >
                  <Bot className="w-4 h-4" />
                  AI Chat Prompts
                </Button>
                <Button
                  variant={activeManagerTab === 'settings' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveManagerTab('settings')}
                  data-testid="tab-settings"
                  className="flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </Button>
                <Button
                  variant={activeManagerTab === 'history' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveManagerTab('history')}
                  data-testid="tab-appraisal-history"
                  className="flex items-center gap-2"
                >
                  <Clock className="w-4 h-4" />
                  Appraisal History
                </Button>
                <Button
                  variant={activeManagerTab === 'appointments' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveManagerTab('appointments')}
                  data-testid="tab-appointments"
                  className="flex items-center gap-2 bg-blue-600/10 hover:bg-blue-600/20"
                >
                  <CalendarCheck className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-600 font-medium">Appointments</span>
                </Button>
                <Button
                  variant={activeManagerTab === 'followup' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveManagerTab('followup')}
                  data-testid="tab-followup-sequences"
                  className="flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Follow-up Sequences
                </Button>
                <Button
                  variant={activeManagerTab === 'call-scoring' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveManagerTab('call-scoring')}
                  data-testid="tab-call-scoring"
                  className="flex items-center gap-2 bg-purple-600/10 hover:bg-purple-600/20"
                >
                  <ClipboardCheck className="w-4 h-4 text-purple-600" />
                  <span className="text-purple-600 font-medium">Call Scoring</span>
                </Button>
                <Button
                  variant={activeManagerTab === 'templates' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveManagerTab('templates')}
                  data-testid="tab-marketplace-templates"
                  className="flex items-center gap-2 bg-blue-600/10 hover:bg-blue-600/20"
                >
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-600 font-medium">Marketplace Templates</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Vehicle Appraisal Tab */}
              {activeManagerTab === 'appraisal' && (
                <div className="space-y-6 animate-in fade-in duration-500" data-testid="tab-content-appraisal">
                  
                  {/* 1. Vehicle Hero Card */}
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="p-6">
                      {!vinResults ? (
                        <div className="flex flex-col md:flex-row gap-6 items-center">
                          <div className="flex-1 w-full">
                            <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                              Start New Appraisal
                            </label>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input 
                                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-lg font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                  placeholder="Enter 17-Character VIN"
                                  maxLength={17}
                                  value={vin}
                                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                                  onKeyDown={(e) => e.key === 'Enter' && vin.length === 17 && handleVinDecode()}
                                  data-testid="input-vin"
                                />
                              </div>
                              <Button 
                                size="lg" 
                                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8"
                                onClick={handleVinDecode}
                                disabled={isDecoding || vin.length !== 17}
                                data-testid="button-decode-vin"
                              >
                                {isDecoding ? <RefreshCw className="w-5 h-5 animate-spin"/> : "Decode VIN"}
                              </Button>
                            </div>
                            <div className="mt-3 flex gap-4 text-sm text-slate-500">
                              <span className="flex items-center gap-1"><Check className="w-3 h-3 text-green-500"/> Market Pricing</span>
                              <span className="flex items-center gap-1"><Check className="w-3 h-3 text-green-500"/> Specs Verification</span>
                              <span className="flex items-center gap-1"><Check className="w-3 h-3 text-green-500"/> History Check</span>
                            </div>
                          </div>
                          <div className="hidden md:block w-px h-24 bg-slate-100 dark:bg-slate-800 mx-4"></div>
                          <div className="w-full md:w-1/3 opacity-50 grayscale hover:opacity-100 hover:grayscale-0 transition-all">
                            <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700">
                              <div className="text-center">
                                <Car className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                                <span className="text-xs text-slate-400 font-medium">Vehicle Preview</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-6 items-start">
                          {/* Image Placeholder */}
                          <div className="w-full h-32 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                            <ImageIcon className="w-10 h-10 text-slate-300" />
                          </div>
                          
                          {/* Details */}
                          <div>
                            {previousAppraisal && previousAppraisal.quotedPrice != null && Number(previousAppraisal.quotedPrice) > 0 && (
                              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold mb-2 border border-amber-200 dark:border-amber-800">
                                <Clock className="w-3 h-3" />
                                Previous Appraisal: ${Number(previousAppraisal.quotedPrice).toLocaleString()} ({new Date(previousAppraisal.createdAt).toLocaleDateString()})
                              </div>
                            )}
                            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-2">
                              {vinResults.year} {vinResults.make} {vinResults.model} <span className="text-slate-500 font-normal">{vinResults.trim}</span>
                            </h2>
                            <div className="flex flex-wrap gap-y-2 gap-x-6 text-sm text-slate-600 dark:text-slate-400">
                              <span className="flex items-center gap-1.5"><Badge variant="outline" className="rounded-md font-mono">{vin}</Badge></span>
                              {vinResults.engineCylinders && <span className="flex items-center gap-1.5"><strong>{vinResults.engineCylinders} Cyl</strong> {vinResults.engineHP && `(${vinResults.engineHP} HP)`}</span>}
                              {vinResults.driveType && <span className="flex items-center gap-1.5"><strong>{vinResults.driveType}</strong></span>}
                              {vinResults.transmission && <span className="flex items-center gap-1.5"><strong>{vinResults.transmission}</strong></span>}
                              {vinResults.exteriorColor && <span className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs">Ext: {vinResults.exteriorColor}</span>}
                            </div>
                          </div>

                          {/* Quick Market Context */}
                          <div className="text-right">
                            <div className="text-sm text-slate-500 font-medium mb-1">Market Average</div>
                            <div className="text-3xl font-bold text-slate-900 dark:text-white">
                              ${livePricing?.retailPrice?.average?.toLocaleString() || pricingResults?.averagePrice?.toLocaleString() || "---,---"}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              Range: ${livePricing?.retailPrice?.min?.toLocaleString() || pricingResults?.minPrice?.toLocaleString() || "---"} - ${livePricing?.retailPrice?.max?.toLocaleString() || pricingResults?.maxPrice?.toLocaleString() || "---"}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => { setVin(""); setVinResults(null); setPricingResults(null); setLivePricing(null); }} className="mt-2 text-slate-400 hover:text-red-500">
                              <X className="w-4 h-4 mr-1" /> Clear
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Appraisal Intelligence Workspace */}
                  {vinResults && (
                    <div className="bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-900/20 dark:to-emerald-900/20 rounded-xl shadow-sm border border-teal-200 dark:border-teal-800 p-6" data-testid="section-appraisal-intelligence">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-teal-500" /> Appraisal Intelligence
                        </h3>
                        <Button size="sm" onClick={handleSaveAppraisal} disabled={isSavingAppraisal} className="bg-slate-900 text-white hover:bg-slate-800" data-testid="button-save-appraisal">
                          {isSavingAppraisal ? "Saving..." : <><Save className="w-4 h-4 mr-2" /> Save Appraisal</>}
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Inputs Column */}
                        <div className="lg:col-span-4 space-y-5">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-slate-500 uppercase">Acquisition Cost</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                <Input 
                                  value={quotedPrice} 
                                  onChange={e => setQuotedPrice(e.target.value)} 
                                  className="pl-7 font-bold text-lg h-12 border-slate-200 focus:border-teal-500 focus:ring-teal-500 bg-white" 
                                  data-testid="input-acquisition-cost"
                                />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-slate-500 uppercase">Est. Recon</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                <Input 
                                  value={reconCost} 
                                  onChange={e => setReconCost(e.target.value)} 
                                  className="pl-7 h-12 border-slate-200 bg-white" 
                                  data-testid="input-recon-cost"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between">
                              <Label className="text-xs font-semibold text-slate-500 uppercase">Target Retail</Label>
                              <span 
                                className="text-xs text-teal-600 cursor-pointer hover:underline" 
                                onClick={() => setTargetRetailPrice(String(livePricing?.retailPrice?.average || pricingResults?.averagePrice || 0))}
                              >
                                Use Market Avg
                              </span>
                            </div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                              <Input 
                                value={targetRetailPrice} 
                                onChange={e => setTargetRetailPrice(e.target.value)} 
                                className="pl-7 font-bold text-lg h-12 border-teal-200 bg-teal-50/50 focus:border-teal-500 focus:ring-teal-500" 
                                data-testid="input-target-retail"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-500 uppercase">Trade Payoff (Optional)</Label>
                            <Input 
                              value={tradePayoff} 
                              onChange={e => setTradePayoff(e.target.value)} 
                              placeholder="Loan Balance"
                              className="h-10 border-slate-200 bg-white" 
                              data-testid="input-trade-payoff"
                            />
                          </div>
                          <div className="pt-2">
                            <Label className="text-xs font-semibold text-slate-500 uppercase">Notes</Label>
                            <Textarea 
                              value={appraisalNotes} 
                              onChange={e => setAppraisalNotes(e.target.value)} 
                              placeholder="Condition, packages, damage..." 
                              className="mt-1.5 min-h-[80px] text-sm resize-none bg-white" 
                              data-testid="input-appraisal-notes"
                            />
                          </div>
                        </div>

                        {/* KPI Dashboard Column */}
                        <div className="lg:col-span-8">
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 h-full">
                            {(() => {
                              const acq = parseFloat(quotedPrice) || 0;
                              const recon = parseFloat(reconCost) || 0;
                              const retail = parseFloat(targetRetailPrice) || 0;
                              const profit = retail - acq - recon;
                              const margin = retail ? (profit / retail * 100) : 0;
                              const investment = acq + recon;
                              const equity = acq - (parseFloat(tradePayoff) || 0);

                              return (
                                <>
                                  {/* Hero Metric: Gross Profit */}
                                  <div className={cn(
                                    "col-span-2 row-span-1 lg:row-span-2 rounded-xl p-5 flex flex-col justify-center border transition-all",
                                    profit >= 0 
                                      ? "bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900" 
                                      : "bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-900"
                                  )} data-testid="metric-gross-profit">
                                    <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-70 flex items-center gap-2">
                                      {profit >= 0 ? <TrendingUp className="w-4 h-4"/> : <TrendingDown className="w-4 h-4"/>}
                                      Gross Profit
                                    </div>
                                    <div className={cn("text-4xl font-extrabold mb-2", profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                                      {profit >= 0 ? '+' : ''}${Math.abs(profit).toLocaleString()}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary" className={cn("font-bold", profit >= 0 ? "bg-emerald-200 text-emerald-800" : "bg-red-200 text-red-800")}>
                                        {margin.toFixed(1)}% Margin
                                      </Badge>
                                    </div>
                                  </div>

                                  {/* Secondary Metrics */}
                                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 flex flex-col justify-center" data-testid="metric-investment">
                                    <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Total Investment</div>
                                    <div className="text-xl font-bold text-slate-800 dark:text-slate-200">${investment.toLocaleString()}</div>
                                    <div className="text-xs text-slate-400 mt-1">Acq ${acq.toLocaleString()} + Recon ${recon.toLocaleString()}</div>
                                  </div>

                                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 flex flex-col justify-center" data-testid="metric-trade-equity">
                                    <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Trade Equity</div>
                                    <div className={cn("text-xl font-bold", equity >= 0 ? "text-blue-600" : "text-amber-600")}>
                                      {tradePayoff ? `$${equity.toLocaleString()}` : "N/A"}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">{tradePayoff ? 'Acq - Payoff' : 'Enter trade payoff'}</div>
                                  </div>

                                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-100 dark:border-amber-900 flex flex-col justify-center col-span-2 lg:col-span-2" data-testid="metric-days-to-sell">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <div className="text-[10px] font-bold uppercase text-amber-600/70 mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Days to Sell</div>
                                        <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                                          {livePricing?.marketDemand?.daysSupply || 30} Days
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-xs font-semibold text-amber-700">Market Avg</div>
                                        <div className="text-[10px] text-amber-600/70">Turn Rate</div>
                                      </div>
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Legacy VIN Details Accordion - Collapsed by default */}
                  {vinResults && (
                    <Accordion type="single" collapsible defaultValue="vin-details" className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                      <AccordionItem value="vin-details" className="border-0">
                        <AccordionTrigger className="px-6 py-4 hover:no-underline">
                          <span className="flex items-center gap-2 font-semibold text-foreground">
                            <Settings className="w-4 h-4" />
                            Vehicle Specifications & Equipment
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="vin-results">
                            {vinResults.year && (
                              <div data-testid="result-year">
                                <div className="text-xs text-muted-foreground font-medium">Year</div>
                                <div className="text-sm font-semibold">{vinResults.year}</div>
                              </div>
                            )}
                            {vinResults.make && (
                              <div data-testid="result-make">
                                <div className="text-xs text-muted-foreground font-medium">Make</div>
                                <div className="text-sm font-semibold">{vinResults.make}</div>
                              </div>
                            )}
                            {vinResults.model && (
                              <div data-testid="result-model">
                                <div className="text-xs text-muted-foreground font-medium">Model</div>
                                <div className="text-sm font-semibold">{vinResults.model}</div>
                              </div>
                            )}
                            {vinResults.trim && (
                              <div data-testid="result-trim">
                                <div className="text-xs text-muted-foreground font-medium">Trim</div>
                                <div className="text-sm font-semibold">{vinResults.trim}</div>
                              </div>
                            )}
                            {vinResults.bodyClass && (
                              <div data-testid="result-body-class">
                                <div className="text-xs text-muted-foreground font-medium">Body Class</div>
                                <div className="text-sm font-semibold">{vinResults.bodyClass}</div>
                              </div>
                            )}
                            {vinResults.vehicleType && (
                              <div data-testid="result-vehicle-type">
                                <div className="text-xs text-muted-foreground font-medium">Vehicle Type</div>
                                <div className="text-sm font-semibold">{vinResults.vehicleType}</div>
                              </div>
                            )}
                            {vinResults.fuelType && (
                              <div data-testid="result-fuel-type">
                                <div className="text-xs text-muted-foreground font-medium">Fuel Type</div>
                                <div className="text-sm font-semibold">{vinResults.fuelType}</div>
                              </div>
                            )}
                            {vinResults.transmission && (
                              <div data-testid="result-transmission">
                                <div className="text-xs text-muted-foreground font-medium">Transmission</div>
                                <div className="text-sm font-semibold">{vinResults.transmission}</div>
                              </div>
                            )}
                            {vinResults.driveType && (
                              <div data-testid="result-drive-type">
                                <div className="text-xs text-muted-foreground font-medium">Drive Type</div>
                                <div className="text-sm font-semibold">{vinResults.driveType}</div>
                              </div>
                            )}
                            {vinResults.exteriorColor && (
                              <div data-testid="result-exterior-color">
                                <div className="text-xs text-muted-foreground font-medium">Exterior Color</div>
                                <div className="text-sm font-semibold">{vinResults.exteriorColor}</div>
                              </div>
                            )}
                            {vinResults.interiorColor && (
                              <div data-testid="result-interior-color">
                                <div className="text-xs text-muted-foreground font-medium">Interior Color</div>
                                <div className="text-sm font-semibold">{vinResults.interiorColor}</div>
                              </div>
                            )}
                            {vinResults.engineCylinders && (
                              <div data-testid="result-engine-cylinders">
                                <div className="text-xs text-muted-foreground font-medium">Engine</div>
                                <div className="text-sm font-semibold">
                                  {vinResults.engineCylinders} cyl
                                  {vinResults.engineHP && ` / ${vinResults.engineHP} HP`}
                                </div>
                              </div>
                            )}
                            {vinResults.msrp && (
                              <div data-testid="result-msrp">
                                <div className="text-xs text-muted-foreground font-medium">Original MSRP</div>
                                <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                                  ${vinResults.msrp.toLocaleString()}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Equipment & Options Section */}
                          {(vinResults.installedOptions?.length > 0 || vinResults.standardEquipment?.length > 0 || vinResults.packages?.length > 0 || vinResults.safetyFeatures?.length > 0) && (
                            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                                <Settings className="w-4 h-4" />
                                Equipment & Options
                              </h4>
                              <div className="grid gap-4 md:grid-cols-2">
                                {vinResults.packages?.length > 0 && (
                                  <div data-testid="result-packages">
                                    <div className="text-xs text-muted-foreground font-medium mb-2">Packages</div>
                                    <div className="flex flex-wrap gap-1">
                                      {vinResults.packages.map((pkg: string, idx: number) => (
                                        <span key={idx} className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                                          {pkg}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {vinResults.installedOptions?.length > 0 && (
                                  <div data-testid="result-options">
                                    <div className="text-xs text-muted-foreground font-medium mb-2">Installed Options</div>
                                    <div className="flex flex-wrap gap-1">
                                      {vinResults.installedOptions.slice(0, 8).map((opt: string, idx: number) => (
                                        <span key={idx} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                                          {opt}
                                        </span>
                                      ))}
                                      {vinResults.installedOptions.length > 8 && (
                                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-xs">
                                          +{vinResults.installedOptions.length - 8} more
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {vinResults.safetyFeatures?.length > 0 && (
                                  <div data-testid="result-safety">
                                    <div className="text-xs text-muted-foreground font-medium mb-2">Safety Features</div>
                                    <div className="flex flex-wrap gap-1">
                                      {vinResults.safetyFeatures.slice(0, 6).map((feat: string, idx: number) => (
                                        <span key={idx} className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                                          {feat}
                                        </span>
                                      ))}
                                      {vinResults.safetyFeatures.length > 6 && (
                                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-xs">
                                          +{vinResults.safetyFeatures.length - 6} more
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}

                  {/* Live Market Pricing Section (MarketCheck Real-time Data) */}
                  {(livePricing || isLoadingLivePricing) && (
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6" data-testid="section-live-pricing">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-emerald-600" />
                          Live Market Pricing
                          <span className="text-xs font-normal px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-full">
                            53K+ Dealers
                          </span>
                        </h3>
                        {livePricing?.lastUpdated && (
                          <span className="text-xs text-muted-foreground">
                            Updated: {new Date(livePricing.lastUpdated).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      
                      {isLoadingLivePricing ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mr-3" />
                          <span className="text-muted-foreground">Fetching live market data...</span>
                        </div>
                      ) : livePricing ? (
                        <div className="space-y-6">
                          {/* Investment Tier Badge - vAuto ProfitTime GPS Equivalent */}
                          {investmentTier && (
                            <div className={`${investmentTier.bgColor} border-2 ${investmentTier.borderColor} rounded-xl overflow-hidden`} data-testid="investment-tier">
                              {/* Decision Banner - Color-coded recommendation */}
                              <div className={`px-4 py-2 ${
                                investmentTier.tier === 'platinum' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white' :
                                investmentTier.tier === 'gold' ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black' :
                                investmentTier.tier === 'silver' ? 'bg-gradient-to-r from-gray-400 to-slate-400 text-white' :
                                'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                              }`} data-testid="decision-banner">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">{investmentTier.icon}</span>
                                    <span className="font-bold uppercase tracking-wide text-sm">
                                      {investmentTier.tier === 'platinum' ? '✓ STRONG BUY' :
                                       investmentTier.tier === 'gold' ? '✓ BUY' :
                                       investmentTier.tier === 'silver' ? '⚠ CAUTION' :
                                       '✗ PASS / WHOLESALE'}
                                    </span>
                                  </div>
                                  <span className="text-sm font-medium opacity-90">
                                    Score: {investmentTier.compositeScore}/100
                                  </span>
                                </div>
                              </div>
                              
                              <div className="p-4">
                                <div className="flex items-center justify-between flex-wrap gap-4">
                                  <div className="flex items-center gap-3">
                                    <span className="text-3xl">{investmentTier.icon}</span>
                                    <div>
                                      <div className={`text-xl font-bold ${investmentTier.color}`}>
                                        {investmentTier.label} Investment
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        {investmentTier.recommendation}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-4 md:gap-6 flex-wrap">
                                    {investmentTier.profitPotential !== undefined && (
                                      <div className="text-right" data-testid="profit-potential">
                                        <div className="text-xs text-muted-foreground mb-1">Profit Potential</div>
                                        <div className={`text-lg font-bold ${investmentTier.profitPotential >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                          {investmentTier.profitPotential >= 0 ? '+' : '-'}${Math.abs(investmentTier.profitPotential).toLocaleString()}
                                        </div>
                                        {investmentTier.profitMargin !== undefined && (
                                          <div className="text-xs text-muted-foreground">
                                            {investmentTier.profitMargin >= 0 ? '+' : ''}{investmentTier.profitMargin.toFixed(1)}% margin
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div className="text-right" data-testid="demand-score">
                                      <div className="text-xs text-muted-foreground mb-1">Demand Score</div>
                                      <div className={`text-lg font-bold ${
                                        (livePricing.marketDemand?.demandScore || 0) >= 70 ? 'text-green-600 dark:text-green-400' :
                                        (livePricing.marketDemand?.demandScore || 0) >= 40 ? 'text-amber-600 dark:text-amber-400' : 
                                        'text-red-600 dark:text-red-400'
                                      }`}>
                                        {livePricing.marketDemand?.demandScore || 0}/100
                                      </div>
                                    </div>
                                    <div className="text-right" data-testid="composite-score">
                                      <div className="text-xs text-muted-foreground mb-1">Investment Score</div>
                                      <div className={`text-lg font-bold ${investmentTier.color}`}>
                                        {investmentTier.compositeScore}/100
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {!acquisitionCost && (
                                  <div className="mt-3 pt-3 border-t border-current/10 text-xs text-muted-foreground" data-testid="acquisition-hint">
                                    Enter a quoted price below to see profit potential analysis
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Retail Pricing */}
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                              <h4 className="font-semibold text-emerald-700 dark:text-emerald-300 mb-3 flex items-center gap-2">
                                <DollarSign className="w-4 h-4" />
                                Retail Pricing
                              </h4>
                              <div className="grid grid-cols-2 gap-3">
                                <div data-testid="retail-average">
                                  <div className="text-xs text-muted-foreground">Average</div>
                                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                                    ${livePricing.retailPrice?.average?.toLocaleString() || 'N/A'}
                                  </div>
                                </div>
                                <div data-testid="retail-range">
                                  <div className="text-xs text-muted-foreground">Range</div>
                                  <div className="text-sm font-semibold">
                                    ${livePricing.retailPrice?.min?.toLocaleString() || '0'} - ${livePricing.retailPrice?.max?.toLocaleString() || '0'}
                                  </div>
                                </div>
                                <div data-testid="retail-above-avg">
                                  <div className="text-xs text-muted-foreground">Above Avg</div>
                                  <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                                    ${livePricing.retailPrice?.aboveAvg?.toLocaleString() || 'N/A'}
                                  </div>
                                </div>
                                <div data-testid="retail-below-avg">
                                  <div className="text-xs text-muted-foreground">Below Avg</div>
                                  <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                    ${livePricing.retailPrice?.belowAvg?.toLocaleString() || 'N/A'}
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                              <h4 className="font-semibold text-purple-700 dark:text-purple-300 mb-3 flex items-center gap-2">
                                <Building className="w-4 h-4" />
                                Wholesale / Auction
                              </h4>
                              <div className="grid grid-cols-2 gap-3">
                                <div data-testid="wholesale-mmr">
                                  <div className="text-xs text-muted-foreground">MMR Estimate</div>
                                  <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                                    ${livePricing.wholesalePrice?.average_mmr?.toLocaleString() || 'N/A'}
                                  </div>
                                </div>
                                <div data-testid="wholesale-clean">
                                  <div className="text-xs text-muted-foreground">Clean</div>
                                  <div className="text-sm font-semibold">
                                    ${livePricing.wholesalePrice?.clean?.toLocaleString() || 'N/A'}
                                  </div>
                                </div>
                                <div data-testid="wholesale-average">
                                  <div className="text-xs text-muted-foreground">Average</div>
                                  <div className="text-sm font-semibold">
                                    ${livePricing.wholesalePrice?.average?.toLocaleString() || 'N/A'}
                                  </div>
                                </div>
                                <div data-testid="wholesale-rough">
                                  <div className="text-xs text-muted-foreground">Rough</div>
                                  <div className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                                    ${livePricing.wholesalePrice?.rough?.toLocaleString() || 'N/A'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Market Demand Metrics */}
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                            <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                              <BarChart3 className="w-4 h-4" />
                              Market Demand
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div data-testid="demand-score">
                                <div className="text-xs text-muted-foreground">Demand Score</div>
                                <div className="flex items-center gap-2">
                                  <div className={`text-2xl font-bold ${
                                    (livePricing.marketDemand?.demandScore || 0) >= 70 ? 'text-green-600' :
                                    (livePricing.marketDemand?.demandScore || 0) >= 40 ? 'text-amber-600' : 'text-red-600'
                                  }`}>
                                    {livePricing.marketDemand?.demandScore || 0}
                                  </div>
                                  <span className="text-xs text-muted-foreground">/100</span>
                                </div>
                              </div>
                              <div data-testid="days-supply">
                                <div className="text-xs text-muted-foreground">Days Supply</div>
                                <div className={`text-2xl font-bold ${
                                  (livePricing.marketDemand?.daysSupply || 0) < 30 ? 'text-green-600' :
                                  (livePricing.marketDemand?.daysSupply || 0) < 60 ? 'text-amber-600' : 'text-red-600'
                                }`}>
                                  {livePricing.marketDemand?.daysSupply || 'N/A'}
                                </div>
                              </div>
                              <div data-testid="market-velocity">
                                <div className="text-xs text-muted-foreground">Market Velocity</div>
                                <span className={`inline-flex px-2 py-1 rounded text-sm font-semibold ${
                                  livePricing.marketDemand?.marketVelocity === 'fast' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                  livePricing.marketDemand?.marketVelocity === 'average' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                }`}>
                                  {livePricing.marketDemand?.marketVelocity?.toUpperCase() || 'N/A'}
                                </span>
                              </div>
                              <div data-testid="listing-count">
                                <div className="text-xs text-muted-foreground">Active Listings</div>
                                <div className="text-2xl font-bold text-foreground">
                                  {livePricing.marketDemand?.listingCount || 0}
                                </div>
                              </div>
                            </div>
                            
                            {livePricing.mileageAdjustment !== 0 && (
                              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                <span className="text-xs text-muted-foreground">Mileage Adjustment: </span>
                                <span className={`text-sm font-semibold ${livePricing.mileageAdjustment > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {livePricing.mileageAdjustment > 0 ? '+' : ''}${livePricing.mileageAdjustment?.toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Competitor Analysis Section - vRank Equivalent */}
                          {livePricing.competitorAnalysis && livePricing.competitorAnalysis.topCompetitors?.length > 0 && (
                            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800" data-testid="section-competitor-analysis">
                              <h4 className="font-semibold text-blue-700 dark:text-blue-300 mb-4 flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                Competitor Analysis
                                <span className="text-xs font-normal px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full">
                                  vRank
                                </span>
                              </h4>
                              
                              {/* Market Position Summary */}
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                                <div data-testid="price-rank">
                                  <div className="text-xs text-muted-foreground">Market Rank</div>
                                  <div className={`text-2xl font-bold ${
                                    livePricing.competitorAnalysis.priceRank <= Math.ceil(livePricing.competitorAnalysis.totalCompetitors * 0.25) ? 'text-green-600 dark:text-green-400' :
                                    livePricing.competitorAnalysis.priceRank <= Math.ceil(livePricing.competitorAnalysis.totalCompetitors * 0.5) ? 'text-amber-600 dark:text-amber-400' :
                                    'text-red-600 dark:text-red-400'
                                  }`}>
                                    #{livePricing.competitorAnalysis.priceRank}
                                    <span className="text-xs font-normal text-muted-foreground ml-1">
                                      of {livePricing.competitorAnalysis.totalCompetitors}
                                    </span>
                                  </div>
                                </div>
                                <div data-testid="total-competitors">
                                  <div className="text-xs text-muted-foreground">Total Competitors</div>
                                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                    {livePricing.competitorAnalysis.totalCompetitors}
                                  </div>
                                </div>
                                <div data-testid="avg-competitor-price">
                                  <div className="text-xs text-muted-foreground">Avg. Competitor Price</div>
                                  <div className="text-lg font-bold text-foreground">
                                    ${livePricing.competitorAnalysis.avgCompetitorPrice?.toLocaleString()}
                                  </div>
                                </div>
                                <div data-testid="avg-competitor-mileage">
                                  <div className="text-xs text-muted-foreground">Avg. Mileage (km)</div>
                                  <div className="text-lg font-bold text-foreground">
                                    {livePricing.competitorAnalysis.avgCompetitorMileage?.toLocaleString()}
                                  </div>
                                </div>
                                <div data-testid="avg-competitor-dom">
                                  <div className="text-xs text-muted-foreground">Avg. Days on Market</div>
                                  <div className={`text-lg font-bold ${
                                    livePricing.competitorAnalysis.avgCompetitorDOM < 30 ? 'text-green-600 dark:text-green-400' :
                                    livePricing.competitorAnalysis.avgCompetitorDOM < 60 ? 'text-amber-600 dark:text-amber-400' :
                                    'text-red-600 dark:text-red-400'
                                  }`}>
                                    {livePricing.competitorAnalysis.avgCompetitorDOM} days
                                  </div>
                                </div>
                              </div>

                              {/* Top Competitors List */}
                              <div className="mt-4">
                                <h5 className="text-sm font-medium text-muted-foreground mb-2">
                                  Top 10 Lowest-Priced Competitors
                                </h5>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                  {livePricing.competitorAnalysis.topCompetitors.map((competitor: any, index: number) => (
                                    <div
                                      key={competitor.id}
                                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm"
                                      data-testid={`competitor-row-${index}`}
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                                          index === 0 ? 'bg-yellow-400 text-yellow-900' :
                                          index === 1 ? 'bg-gray-300 text-gray-700' :
                                          index === 2 ? 'bg-amber-600 text-white' :
                                          'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                        }`}>
                                          {index + 1}
                                        </span>
                                        <div>
                                          <div className="font-medium text-foreground truncate max-w-[180px]">
                                            {competitor.dealerName}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {competitor.location} {competitor.trim && `· ${competitor.trim}`}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="font-bold text-green-600 dark:text-green-400">
                                          ${competitor.price?.toLocaleString()}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {competitor.mileage?.toLocaleString()} km · {competitor.daysOnMarket}d
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Price Position Hint */}
                              <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-muted-foreground">
                                Enter your target retail price above to see your market position rank
                              </div>
                            </div>
                          )}

                          {/* Data Source & Confidence */}
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Data: {livePricing.dataSource}</span>
                            <span className={`px-2 py-0.5 rounded ${
                              livePricing.confidence === 'high' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                              livePricing.confidence === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            }`}>
                              {livePricing.confidence?.toUpperCase()} confidence
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* 3. Market Analysis Section - Clean Design */}
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6" data-testid="section-market-analysis">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Market Analysis</h3>
                        <p className="text-sm text-slate-500">Real-time listing data for {pricingForm.make || 'your vehicle'} {pricingForm.model || ''}</p>
                      </div>
                      <Button 
                        onClick={() => handleMarketSearch()} 
                        disabled={isAnalyzing || !pricingForm.make || !pricingForm.model} 
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                        data-testid="button-analyze-pricing"
                      >
                        {isAnalyzing ? "Analyzing..." : "Analyze Market Pricing"}
                      </Button>
                    </div>

                    {/* Inline Filters */}
                    <div className="flex flex-wrap gap-3 mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                      <div className="w-32">
                        <Select value={pricingForm.radiusKm} onValueChange={v => setPricingForm(p => ({...p, radiusKm: v}))}>
                          <SelectTrigger className="bg-white dark:bg-slate-900 h-9 text-xs" data-testid="select-radius">
                            <SelectValue placeholder="Radius" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="50">50 km</SelectItem>
                            <SelectItem value="100">100 km</SelectItem>
                            <SelectItem value="200">200 km</SelectItem>
                            <SelectItem value="500">500 km</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Popover open={makeOpen} onOpenChange={setMakeOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-9 text-xs bg-white dark:bg-slate-900 justify-between w-40" data-testid="select-make">
                            {pricingForm.make || "Make"} <ChevronDown className="w-3 h-3 opacity-50"/>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-40">
                          <Command>
                            <CommandInput placeholder="Search..." />
                            <CommandList>
                              <CommandGroup>
                                {makes.map(m => (
                                  <CommandItem key={m} onSelect={() => {setPricingForm(p=>({...p, make: m})); setMakeOpen(false);}}>
                                    {m}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <Popover open={modelOpen} onOpenChange={setModelOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" disabled={!pricingForm.make} className="h-9 text-xs bg-white dark:bg-slate-900 justify-between w-40" data-testid="select-model">
                            {pricingForm.model || "Model"} <ChevronDown className="w-3 h-3 opacity-50"/>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-40">
                          <Command>
                            <CommandInput placeholder="Search..." />
                            <CommandList>
                              <CommandGroup>
                                {models.map(m => (
                                  <CommandItem key={m} onSelect={() => {setPricingForm(p=>({...p, model: m})); setModelOpen(false);}}>
                                    {m}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <Input 
                        placeholder="Mileage (Optional)" 
                        className="w-36 h-9 text-xs bg-white dark:bg-slate-900" 
                        value={pricingForm.mileage} 
                        onChange={e => setPricingForm(p => ({...p, mileage: e.target.value}))}
                        data-testid="input-mileage"
                      />
                    </div>

                    {/* Stats and Recommendation Panels */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      {/* Stats Panel */}
                      <div className="flex justify-between items-center p-6 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                        <div>
                          <div className="text-xs text-slate-400 font-semibold uppercase mb-1">Average Price</div>
                          <div className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="stat-average-price">
                            ${pricingResults?.averagePrice?.toLocaleString() || "---,---"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 font-semibold uppercase mb-1">Median Price</div>
                          <div className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="stat-median-price">
                            ${pricingResults?.medianPrice?.toLocaleString() || "---,---"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 font-semibold uppercase mb-1">Comparables</div>
                          <div className="text-2xl font-bold text-blue-600" data-testid="stat-total-comps">
                            {pricingResults?.totalComps || 0}
                          </div>
                        </div>
                      </div>

                      {/* Recommendation Panel */}
                      <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900 rounded-lg p-5 flex flex-col justify-center">
                        <div className="text-sm font-medium text-amber-800 dark:text-amber-500 mb-1">Strategic Recommendation</div>
                        <div className="text-lg font-bold text-amber-900 dark:text-amber-400" data-testid="stat-price-range">
                          ${pricingResults?.priceRange?.low?.toLocaleString() || "---"} — ${pricingResults?.priceRange?.high?.toLocaleString() || "---"}
                        </div>
                        <div className="text-xs text-amber-700/70 mt-1">
                          Based on {pricingResults?.totalComps || 0} comparable listings in {pricingForm.radiusKm}km radius
                        </div>
                      </div>
                    </div>

                    {/* Modern Comparable Vehicles Table */}
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500 font-semibold">
                          <tr>
                            <th className="px-6 py-4">Vehicle Info</th>
                            <th className="px-6 py-4">Ext / Int Color</th>
                            <th className="px-6 py-4">Mileage</th>
                            <th className="px-6 py-4">Seller</th>
                            <th className="px-6 py-4">Distance</th>
                            <th className="px-6 py-4 text-right">Price</th>
                            <th className="px-6 py-4 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {pricingResults?.comparisons?.slice(0, 5).map((comp: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" data-testid={`comp-row-${i}`}>
                              <td className="px-6 py-4">
                                <div className="font-bold text-slate-800 dark:text-slate-200">{comp.year} {comp.make} {comp.model}</div>
                                <div className="text-xs text-slate-500">{comp.trim}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  {comp.exteriorColor ? (
                                    <span className="inline-flex items-center gap-1 text-xs">
                                      <span className="w-3 h-3 rounded-full border border-slate-200 dark:border-slate-600" style={{backgroundColor: comp.exteriorColor?.toLowerCase().includes('white') ? '#f5f5f5' : comp.exteriorColor?.toLowerCase().includes('black') ? '#1a1a1a' : comp.exteriorColor?.toLowerCase().includes('silver') ? '#c0c0c0' : comp.exteriorColor?.toLowerCase().includes('grey') || comp.exteriorColor?.toLowerCase().includes('gray') ? '#808080' : comp.exteriorColor?.toLowerCase().includes('red') ? '#dc2626' : comp.exteriorColor?.toLowerCase().includes('blue') ? '#2563eb' : comp.exteriorColor?.toLowerCase().includes('green') ? '#16a34a' : comp.exteriorColor?.toLowerCase().includes('brown') ? '#7c3a18' : comp.exteriorColor?.toLowerCase().includes('beige') ? '#d4b896' : '#e5e5e5'}}></span>
                                      <span className="text-slate-600 dark:text-slate-400">{comp.exteriorColor}</span>
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">-</span>
                                  )}
                                  {comp.interiorColor && (
                                    <span className="inline-flex items-center gap-1 text-xs">
                                      <span className="w-3 h-3 rounded-full border border-slate-200 dark:border-slate-600" style={{backgroundColor: comp.interiorColor?.toLowerCase().includes('black') ? '#1a1a1a' : comp.interiorColor?.toLowerCase().includes('tan') || comp.interiorColor?.toLowerCase().includes('beige') ? '#d4b896' : comp.interiorColor?.toLowerCase().includes('brown') ? '#7c3a18' : comp.interiorColor?.toLowerCase().includes('grey') || comp.interiorColor?.toLowerCase().includes('gray') ? '#808080' : '#e5e5e5'}}></span>
                                      <span className="text-slate-600 dark:text-slate-400">{comp.interiorColor}</span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-400">{comp.mileage?.toLocaleString()} km</td>
                              <td className="px-6 py-4">
                                <Badge variant="outline" className={cn("font-normal", comp.listingType === 'private' ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800" : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800")}>
                                  {comp.listingType === 'private' ? 'Private' : 'Dealer'}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 text-slate-500">{comp.distance ? `${comp.distance} km` : '-'}</td>
                              <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">${comp.price?.toLocaleString()}</td>
                              <td className="px-6 py-4 text-center flex items-center justify-center gap-2">
                                {comp.listingUrl && (
                                  <a href={comp.listingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-blue-900/50 text-slate-500 hover:text-blue-600 transition-colors" title="View Listing">
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                )}
                                <a href={generateAutoTraderUrl({make: comp.make, model: comp.model, year: comp.year, trim: comp.trim})} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/50 text-red-500 hover:text-red-600 transition-colors" title="Search AutoTrader.ca">
                                  <Search className="w-4 h-4" />
                                </a>
                              </td>
                            </tr>
                          ))}
                          {(!pricingResults?.comparisons || pricingResults.comparisons.length === 0) && (
                            <tr>
                              <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">No comparable vehicles found. Run an analysis to see results.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Comparable Vehicles - Reference Design Match */}
                        {pricingResults?.comparisons && pricingResults.comparisons.length > 0 && (
                          <div data-testid="comparable-vehicles-section">
                            {(() => {
                              const dealerListings = pricingResults.comparisons.filter((c: any) => c.listingType === 'dealer' || (!c.listingType && c.dealership));
                              const privateListings = pricingResults.comparisons.filter((c: any) => c.listingType === 'private');
                              const dealerAvg = dealerListings.length > 0 ? Math.round(dealerListings.reduce((sum: number, c: any) => sum + (c.price || 0), 0) / dealerListings.length) : 0;
                              const privateAvg = privateListings.length > 0 ? Math.round(privateListings.reduce((sum: number, c: any) => sum + (c.price || 0), 0) / privateListings.length) : 0;
                              
                              return (
                                <>
                                  {/* Tab navigation matching reference */}
                                  <div className="flex border-b mb-4">
                                    <button className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-foreground">
                                      Comparable Vehicles
                                    </button>
                                    <button className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                                      Comparable Vehicles
                                    </button>
                                  </div>
                                  
                                  {/* Single table with all listings and group separators */}
                                  <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead className="bg-muted/30 border-b">
                                        <tr>
                                          <th className="text-left p-3 font-medium text-muted-foreground">Vehicle Info</th>
                                          <th className="text-left p-3 font-medium text-muted-foreground">Ext / Int Color</th>
                                          <th className="text-left p-3 font-medium text-muted-foreground">Mileage</th>
                                          <th className="text-left p-3 font-medium text-muted-foreground">Age</th>
                                          <th className="text-left p-3 font-medium text-muted-foreground">Seller</th>
                                          <th className="text-left p-3 font-medium text-muted-foreground">Distance</th>
                                          <th className="text-right p-3 font-medium text-muted-foreground">Price</th>
                                          <th className="w-10"></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {/* First few dealer vehicles */}
                                        {dealerListings.slice(0, 2).map((comp: any, index: number) => (
                                          <tr key={`dealer-${index}`} className="hover:bg-muted/30 border-b" data-testid={`dealer-row-${index}`}>
                                            <td className="p-3">
                                              <span className="font-medium text-foreground">
                                                {comp.year} {comp.make?.toUpperCase()} {comp.model?.toUpperCase()}
                                                {comp.trim && ` (${comp.trim})`}
                                              </span>
                                            </td>
                                            <td className="p-3">
                                              <div className="flex flex-col gap-1">
                                                {comp.exteriorColor ? (
                                                  <span className="inline-flex items-center gap-1 text-xs">
                                                    <span className="w-3 h-3 rounded-full border border-border" style={{backgroundColor: comp.exteriorColor?.toLowerCase().includes('white') ? '#f5f5f5' : comp.exteriorColor?.toLowerCase().includes('black') ? '#1a1a1a' : comp.exteriorColor?.toLowerCase().includes('silver') ? '#c0c0c0' : comp.exteriorColor?.toLowerCase().includes('grey') || comp.exteriorColor?.toLowerCase().includes('gray') ? '#808080' : comp.exteriorColor?.toLowerCase().includes('red') ? '#dc2626' : comp.exteriorColor?.toLowerCase().includes('blue') ? '#2563eb' : comp.exteriorColor?.toLowerCase().includes('green') ? '#16a34a' : comp.exteriorColor?.toLowerCase().includes('brown') ? '#7c3a18' : comp.exteriorColor?.toLowerCase().includes('beige') ? '#d4b896' : '#e5e5e5'}}></span>
                                                    <span className="text-muted-foreground">{comp.exteriorColor}</span>
                                                  </span>
                                                ) : (
                                                  <span className="text-xs text-muted-foreground/50">-</span>
                                                )}
                                                {comp.interiorColor && (
                                                  <span className="inline-flex items-center gap-1 text-xs">
                                                    <span className="w-3 h-3 rounded-full border border-border" style={{backgroundColor: comp.interiorColor?.toLowerCase().includes('black') ? '#1a1a1a' : comp.interiorColor?.toLowerCase().includes('tan') || comp.interiorColor?.toLowerCase().includes('beige') ? '#d4b896' : comp.interiorColor?.toLowerCase().includes('brown') ? '#7c3a18' : comp.interiorColor?.toLowerCase().includes('grey') || comp.interiorColor?.toLowerCase().includes('gray') ? '#808080' : '#e5e5e5'}}></span>
                                                    <span className="text-muted-foreground">{comp.interiorColor}</span>
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="p-3 text-muted-foreground">
                                              {comp.mileage ? `${comp.mileage.toLocaleString()} km` : '-'}
                                            </td>
                                            <td className="p-3 text-muted-foreground">
                                              {typeof comp.daysOnLot === 'number' ? `${comp.daysOnLot} days` : '-'}
                                            </td>
                                            <td className="p-3 text-muted-foreground">Dealer</td>
                                            <td className="p-3 text-muted-foreground">{comp.distance ? `${comp.distance} km` : '-'}</td>
                                            <td className="p-3 text-right font-medium text-foreground">
                                              {comp.price ? `$${comp.price.toLocaleString()}` : 'N/A'}
                                            </td>
                                            <td className="p-3 text-center flex items-center justify-center gap-2">
                                              {comp.listingUrl && (
                                                <a href={comp.listingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80" title="View Listing">
                                                  <ExternalLink className="w-4 h-4" />
                                                </a>
                                              )}
                                              <a href={generateAutoTraderUrl({make: comp.make, model: comp.model, year: comp.year, trim: comp.trim})} target="_blank" rel="noopener noreferrer" className="text-red-500 hover:text-red-600" title="Search AutoTrader.ca">
                                                <Search className="w-4 h-4" />
                                              </a>
                                            </td>
                                          </tr>
                                        ))}
                                        
                                        {/* Dealer group separator */}
                                        {dealerListings.length > 0 && (
                                          <tr className="bg-muted/20 border-b">
                                            <td colSpan={8} className="p-2 text-sm text-muted-foreground font-medium">
                                              Dealer ({dealerListings.length} listings, ${dealerAvg.toLocaleString()} avg)
                                            </td>
                                          </tr>
                                        )}
                                        
                                        {/* Private seller vehicles */}
                                        {privateListings.slice(0, 3).map((comp: any, index: number) => (
                                          <tr key={`private-${index}`} className="hover:bg-muted/30 border-b" data-testid={`private-row-${index}`}>
                                            <td className="p-3">
                                              <span className="font-medium text-foreground">
                                                {comp.year} {comp.make?.toUpperCase()} {comp.model?.toUpperCase()}
                                                {comp.trim && ` (${comp.trim})`}
                                              </span>
                                            </td>
                                            <td className="p-3">
                                              <div className="flex flex-col gap-1">
                                                {comp.exteriorColor ? (
                                                  <span className="inline-flex items-center gap-1 text-xs">
                                                    <span className="w-3 h-3 rounded-full border border-border" style={{backgroundColor: comp.exteriorColor?.toLowerCase().includes('white') ? '#f5f5f5' : comp.exteriorColor?.toLowerCase().includes('black') ? '#1a1a1a' : comp.exteriorColor?.toLowerCase().includes('silver') ? '#c0c0c0' : comp.exteriorColor?.toLowerCase().includes('grey') || comp.exteriorColor?.toLowerCase().includes('gray') ? '#808080' : comp.exteriorColor?.toLowerCase().includes('red') ? '#dc2626' : comp.exteriorColor?.toLowerCase().includes('blue') ? '#2563eb' : comp.exteriorColor?.toLowerCase().includes('green') ? '#16a34a' : comp.exteriorColor?.toLowerCase().includes('brown') ? '#7c3a18' : comp.exteriorColor?.toLowerCase().includes('beige') ? '#d4b896' : '#e5e5e5'}}></span>
                                                    <span className="text-muted-foreground">{comp.exteriorColor}</span>
                                                  </span>
                                                ) : (
                                                  <span className="text-xs text-muted-foreground/50">-</span>
                                                )}
                                                {comp.interiorColor && (
                                                  <span className="inline-flex items-center gap-1 text-xs">
                                                    <span className="w-3 h-3 rounded-full border border-border" style={{backgroundColor: comp.interiorColor?.toLowerCase().includes('black') ? '#1a1a1a' : comp.interiorColor?.toLowerCase().includes('tan') || comp.interiorColor?.toLowerCase().includes('beige') ? '#d4b896' : comp.interiorColor?.toLowerCase().includes('brown') ? '#7c3a18' : comp.interiorColor?.toLowerCase().includes('grey') || comp.interiorColor?.toLowerCase().includes('gray') ? '#808080' : '#e5e5e5'}}></span>
                                                    <span className="text-muted-foreground">{comp.interiorColor}</span>
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="p-3 text-muted-foreground">
                                              {comp.mileage ? `${comp.mileage.toLocaleString()} km` : '-'}
                                            </td>
                                            <td className="p-3 text-muted-foreground">
                                              {typeof comp.daysOnLot === 'number' ? `${comp.daysOnLot} days` : '-'}
                                            </td>
                                            <td className="p-3 text-muted-foreground">Private</td>
                                            <td className="p-3 text-muted-foreground">{comp.distance ? `${comp.distance} km` : '-'}</td>
                                            <td className="p-3 text-right font-medium text-foreground">
                                              {comp.price ? `$${comp.price.toLocaleString()}` : 'N/A'}
                                            </td>
                                            <td className="p-3 text-center flex items-center justify-center gap-2">
                                              {comp.listingUrl && (
                                                <a href={comp.listingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80" title="View Listing">
                                                  <ExternalLink className="w-4 h-4" />
                                                </a>
                                              )}
                                              <a href={generateAutoTraderUrl({make: comp.make, model: comp.model, year: comp.year, trim: comp.trim})} target="_blank" rel="noopener noreferrer" className="text-red-500 hover:text-red-600" title="Search AutoTrader.ca">
                                                <Search className="w-4 h-4" />
                                              </a>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}

                  {/* Historical Analytics Section */}
                  {vinResults && showHistoricalAnalytics && (
                    <div className="border-t pt-6" data-testid="historical-analytics-section">
                      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-6">
                        <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                          <Activity className="w-5 h-5 text-blue-600" />
                          Historical Market Analytics
                          <span className="text-sm font-normal text-muted-foreground ml-2">
                            {vinResults.make} {vinResults.model}
                          </span>
                        </h4>

                        {isLoadingPriceTrends ? (
                          <div className="flex items-center justify-center py-12">
                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : priceTrends.length > 0 ? (
                          <div className="space-y-6">
                            {/* Price Trend Chart */}
                            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                              <h5 className="text-sm font-medium text-muted-foreground mb-4">Price Trends (Last 30 Days)</h5>
                              <div className="h-64" data-testid="price-trend-chart">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={priceTrends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                      <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                      </linearGradient>
                                      <linearGradient id="colorMedian" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis 
                                      dataKey="date" 
                                      tick={{ fontSize: 12 }} 
                                      className="text-muted-foreground"
                                    />
                                    <YAxis 
                                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                      tick={{ fontSize: 12 }}
                                      className="text-muted-foreground"
                                    />
                                    <Tooltip 
                                      formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                                      labelStyle={{ color: 'var(--foreground)' }}
                                      contentStyle={{ 
                                        backgroundColor: 'var(--background)', 
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px'
                                      }}
                                    />
                                    <Legend />
                                    <Area 
                                      type="monotone" 
                                      dataKey="averagePrice" 
                                      name="Average Price"
                                      stroke="#3b82f6" 
                                      fillOpacity={1} 
                                      fill="url(#colorAvg)" 
                                    />
                                    <Area 
                                      type="monotone" 
                                      dataKey="medianPrice" 
                                      name="Median Price"
                                      stroke="#22c55e" 
                                      fillOpacity={1} 
                                      fill="url(#colorMedian)" 
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            </div>

                            {/* Market Velocity Metrics */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {/* Price Change */}
                              <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800" data-testid="metric-price-change">
                                <div className="text-xs text-muted-foreground">Price Change</div>
                                {(() => {
                                  if (priceTrends.length < 2) return <div className="text-lg font-bold">N/A</div>;
                                  const first = priceTrends[0].averagePrice;
                                  const last = priceTrends[priceTrends.length - 1].averagePrice;
                                  const change = last - first;
                                  const pct = first > 0 ? ((change / first) * 100).toFixed(1) : '0';
                                  return (
                                    <>
                                      <div className={`text-lg font-bold ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {change >= 0 ? '+' : ''}{pct}%
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {change >= 0 ? '+' : '-'}${Math.abs(change).toLocaleString()}
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>

                              {/* Current Avg */}
                              <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800" data-testid="metric-current-avg">
                                <div className="text-xs text-muted-foreground">Current Average</div>
                                <div className="text-lg font-bold text-foreground">
                                  ${priceTrends[priceTrends.length - 1]?.averagePrice?.toLocaleString() || 'N/A'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Latest snapshot
                                </div>
                              </div>

                              {/* Listing Volume */}
                              <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800" data-testid="metric-listing-volume">
                                <div className="text-xs text-muted-foreground">Avg Listings</div>
                                <div className="text-lg font-bold text-foreground">
                                  {Math.round(priceTrends.reduce((sum, t) => sum + t.listingCount, 0) / priceTrends.length)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Per snapshot
                                </div>
                              </div>

                              {/* Market Trend */}
                              <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800" data-testid="metric-market-trend">
                                <div className="text-xs text-muted-foreground">Market Trend</div>
                                {(() => {
                                  if (priceTrends.length < 2) return <div className="text-lg font-bold">Stable</div>;
                                  const first = priceTrends[0].averagePrice;
                                  const last = priceTrends[priceTrends.length - 1].averagePrice;
                                  const pctChange = first > 0 ? ((last - first) / first) * 100 : 0;
                                  if (pctChange > 3) return <div className="text-lg font-bold text-green-600 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Rising</div>;
                                  if (pctChange < -3) return <div className="text-lg font-bold text-red-600 flex items-center gap-1"><TrendingDown className="w-4 h-4" /> Falling</div>;
                                  return <div className="text-lg font-bold text-amber-600 flex items-center gap-1"><Minus className="w-4 h-4" /> Stable</div>;
                                })()}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No historical data available yet.</p>
                            <p className="text-xs mt-1">Historical trends will appear after market analysis runs.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!pricingResults && !vinResults && (
                    <div className="border-t pt-6">
                      <div className="text-center py-12 text-muted-foreground">
                        <Car className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-medium mb-2">Get Started</h3>
                        <p className="text-sm mb-4">
                          Enter a VIN to decode and automatically analyze market pricing, or manually enter vehicle details
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Inventory Analysis Tab */}
              {activeManagerTab === 'inventory' && (
                <InventoryAnalysisTab />
              )}

              {/* My Inventory Tab */}
              {activeManagerTab === 'my-inventory' && (
                <InventoryManagement />
              )}

              {/* Conversations Tab - iMessage Style */}
              {activeManagerTab === 'conversations' && (
                <ConversationsPanel 
                  dealershipId={user?.dealershipId || 1}
                  onSwitchToTraining={() => setActiveManagerTab('call-scoring')}
                />
              )}

              {/* AI Chat Prompts Tab */}
              {activeManagerTab === 'prompts' && (
                <div data-testid="tab-content-prompts">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">AI Chatbot Prompts</h3>
                    <p className="text-sm text-muted-foreground">Configure AI chat scenarios for your dealership website chatbot</p>
                  </div>
                  {isLoadingPrompts ? (
                    <div className="space-y-4">
                      <div className="h-32 bg-muted rounded animate-pulse" />
                      <div className="h-32 bg-muted rounded animate-pulse" />
                    </div>
                  ) : chatPrompts.length > 0 ? (
                    <Accordion type="single" collapsible className="space-y-3">
                      {chatPrompts.map((prompt) => (
                        <AccordionItem 
                          key={prompt.id} 
                          value={`prompt-${prompt.id}`}
                          className="border rounded-lg px-4"
                          data-testid={`prompt-${prompt.scenario}`}
                        >
                          <AccordionTrigger className="hover:no-underline" data-testid={`trigger-prompt-${prompt.scenario}`}>
                            <div className="flex items-center gap-3">
                              <Bot className="w-5 h-5 text-muted-foreground" />
                              <span className="font-semibold text-lg">{formatScenario(prompt.scenario)}</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-4">
                            {editingPromptId === prompt.id ? (
                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor={`greeting-${prompt.id}`}>Greeting Message</Label>
                                  <p className="text-xs text-muted-foreground mb-2">
                                    The first message shown to customers when they open the chat
                                  </p>
                                  <textarea
                                    id={`greeting-${prompt.id}`}
                                    className="w-full min-h-[150px] p-3 border rounded-md bg-background resize-y"
                                    value={editedPrompt.greeting}
                                    onChange={(e) => setEditedPrompt({ ...editedPrompt, greeting: e.target.value })}
                                    placeholder="Enter greeting message..."
                                    data-testid={`input-greeting-${prompt.scenario}`}
                                  />
                                  <AiPromptEnhancer
                                    currentText={editedPrompt.greeting}
                                    onApply={(text) => setEditedPrompt({ ...editedPrompt, greeting: text })}
                                    promptType="greeting"
                                    context={prompt.scenario}
                                    disabled={isSavingPrompt}
                                    dealershipId={user?.dealershipId}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`system-${prompt.id}`}>System Instructions</Label>
                                  <p className="text-xs text-muted-foreground mb-2">
                                    Background instructions that guide the AI's behavior and responses
                                  </p>
                                  <textarea
                                    id={`system-${prompt.id}`}
                                    className="w-full min-h-[350px] p-3 border rounded-md bg-background resize-y font-mono text-sm"
                                    value={editedPrompt.systemPrompt}
                                    onChange={(e) => setEditedPrompt({ ...editedPrompt, systemPrompt: e.target.value })}
                                    placeholder="Enter system instructions..."
                                    data-testid={`input-system-${prompt.scenario}`}
                                  />
                                  <AiPromptEnhancer
                                    currentText={editedPrompt.systemPrompt}
                                    onApply={(text) => setEditedPrompt({ ...editedPrompt, systemPrompt: text })}
                                    promptType="system"
                                    context={prompt.scenario}
                                    disabled={isSavingPrompt}
                                    dealershipId={user?.dealershipId}
                                  />
                                </div>
                                <div className="flex gap-2 pt-2">
                                  <Button
                                    onClick={() => savePrompt(prompt)}
                                    disabled={isSavingPrompt || !editedPrompt.greeting.trim() || !editedPrompt.systemPrompt.trim()}
                                    data-testid={`save-prompt-${prompt.scenario}`}
                                  >
                                    {isSavingPrompt ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                        Saving...
                                      </>
                                    ) : (
                                      <>
                                        <Save className="w-4 h-4 mr-2" />
                                        Save Changes
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={cancelEditingPrompt}
                                    disabled={isSavingPrompt}
                                    data-testid={`cancel-prompt-${prompt.scenario}`}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="flex justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => startEditingPrompt(prompt)}
                                    data-testid={`edit-prompt-${prompt.scenario}`}
                                  >
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Edit
                                  </Button>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground mb-1">Greeting:</p>
                                  <p className="text-sm bg-muted/50 p-3 rounded-md whitespace-pre-wrap">
                                    {prompt.greeting}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground mb-1">System Instructions:</p>
                                  <p className="text-xs bg-muted/50 p-3 rounded-md font-mono whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                                    {prompt.systemPrompt}
                                  </p>
                                </div>
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm mb-4">No chat prompts configured yet</p>
                      <p className="text-xs">Chat prompts will appear here once they are created by the system administrator.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Settings Tab */}
              {activeManagerTab === 'settings' && (
                <div data-testid="tab-content-settings">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">Location Settings</h3>
                    <p className="text-sm text-muted-foreground">Configure your location for market pricing searches</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="postal-code">Postal Code *</Label>
                      <Input
                        id="postal-code"
                        placeholder="e.g., V6B 5J3"
                        value={settings.postalCode}
                        onChange={(e) => setSettings({ ...settings, postalCode: e.target.value.toUpperCase() })}
                        data-testid="input-postal-code"
                        className="mt-2"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Used for geocoding and radius-based market searches
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="default-radius">Default Search Radius (KM)</Label>
                      <Input
                        id="default-radius"
                        type="number"
                        value={settings.defaultRadiusKm}
                        onChange={(e) => setSettings({ ...settings, defaultRadiusKm: parseInt(e.target.value) || 50 })}
                        data-testid="input-default-radius"
                        className="mt-2"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Default radius for searching nearby listings
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleSaveSettings}
                    disabled={isSavingSettings || !settings.postalCode}
                    className="mt-4"
                    data-testid="button-save-settings"
                  >
                    {isSavingSettings ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      "Save Settings"
                    )}
                  </Button>
                </div>
              )}

              {/* Appraisal History Tab */}
              {activeManagerTab === 'history' && (
                <div data-testid="tab-content-history" className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">Appraisal History</h3>
                      <p className="text-sm text-muted-foreground">View all saved vehicle appraisals</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href="/manager/appraisals">
                        <Button
                          variant="default"
                          size="sm"
                          data-testid="button-full-appraisals"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Full View
                        </Button>
                      </Link>
                      <Button
                        onClick={loadAppraisalHistory}
                        variant="outline"
                        size="sm"
                        disabled={isLoadingAppraisalHistory}
                        data-testid="button-refresh-history"
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingAppraisalHistory ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                  </div>

                  {isLoadingAppraisalHistory ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 bg-muted rounded animate-pulse" />
                      ))}
                    </div>
                  ) : appraisalHistory.length > 0 ? (
                    <div className="space-y-3">
                      {appraisalHistory.map((appraisal: any) => (
                        <Card key={appraisal.id} data-testid={`appraisal-card-${appraisal.id}`}>
                          <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row justify-between gap-4">
                              <div>
                                <h4 className="font-semibold">
                                  {appraisal.year} {appraisal.make} {appraisal.model}
                                  {appraisal.trim && ` ${appraisal.trim}`}
                                </h4>
                                <p className="text-sm text-muted-foreground font-mono">{appraisal.vin}</p>
                                {appraisal.mileage && (
                                  <p className="text-sm text-muted-foreground">
                                    {appraisal.mileage.toLocaleString()} km
                                  </p>
                                )}
                                {appraisal.notes && (
                                  <p className="text-sm text-muted-foreground mt-2 italic">
                                    "{appraisal.notes}"
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                {appraisal.quotedPrice && (
                                  <div className="text-lg font-bold text-green-600">
                                    ${appraisal.quotedPrice.toLocaleString()}
                                  </div>
                                )}
                                <div className="text-xs text-muted-foreground">
                                  {new Date(appraisal.createdAt).toLocaleDateString()}
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => {
                                    setVin(appraisal.vin);
                                    setPreviousAppraisal(appraisal);
                                    setActiveManagerTab('appraisal');
                                    toast({
                                      title: "Appraisal Loaded",
                                      description: "VIN has been loaded. Click 'Decode VIN' to analyze again."
                                    });
                                  }}
                                  data-testid={`button-view-appraisal-${appraisal.id}`}
                                >
                                  <Search className="w-3 h-3 mr-2" />
                                  Re-analyze
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <ClipboardCheck className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-medium mb-2">No Appraisals Yet</h3>
                      <p className="text-sm">
                        Save your first appraisal from the Vehicle Appraisal tab to see it here.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Follow-up Sequences Tab */}
              {activeManagerTab === 'followup' && (
                <div data-testid="tab-content-followup">
                  <FollowUpSequenceEditor dealershipId={user?.dealershipId || 1} />
                </div>
              )}

              {activeManagerTab === 'appointments' && (
                <div data-testid="tab-content-appointments">
                  <AppointmentsWidget />
                </div>
              )}

              {activeManagerTab === 'call-scoring' && (
                <div data-testid="tab-content-call-scoring" className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">Call Scoring & Training</h3>
                      <p className="text-sm text-muted-foreground">
                        Review call recordings, AI-generated scores, and coaching recommendations
                      </p>
                    </div>
                    <Button
                      onClick={() => setLocation('/call-analysis')}
                      data-testid="button-open-call-analysis"
                    >
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Open Full Dashboard
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-orange-600">--</div>
                        <p className="text-xs text-muted-foreground">Calls awaiting manager review</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Score This Week</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-blue-600">--</div>
                        <p className="text-xs text-muted-foreground">Based on AI analysis</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Calls Analyzed</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">--</div>
                        <p className="text-xs text-muted-foreground">Total this month</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div>
                    <h4 className="font-medium mb-4">Department Scoring</h4>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <Card className="cursor-pointer hover:border-blue-500 transition-colors" onClick={() => setLocation('/call-analysis?department=sales')}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                            Sales
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground">Vehicle sales calls, test drives, pricing inquiries</p>
                        </CardContent>
                      </Card>
                      <Card className="cursor-pointer hover:border-green-500 transition-colors" onClick={() => setLocation('/call-analysis?department=service')}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                            Service
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground">Maintenance, repairs, service appointments</p>
                        </CardContent>
                      </Card>
                      <Card className="cursor-pointer hover:border-orange-500 transition-colors" onClick={() => setLocation('/call-analysis?department=parts')}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-orange-500" />
                            Parts
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground">Parts orders, availability, pricing</p>
                        </CardContent>
                      </Card>
                      <Card className="cursor-pointer hover:border-purple-500 transition-colors" onClick={() => setLocation('/call-analysis?department=general')}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-purple-500" />
                            General Inquiry
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground">General questions, directions, hours</p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => setLocation('/call-analysis?tab=templates')}
                        data-testid="button-manage-templates"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Manage Scoring Templates
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => setLocation('/call-analysis')}
                        data-testid="button-view-recordings"
                      >
                        <ClipboardCheck className="w-4 h-4 mr-2" />
                        View Call Recordings
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => setLocation('/call-analysis')}
                        data-testid="button-view-reports"
                      >
                        <BarChart3 className="w-4 h-4 mr-2" />
                        Performance Reports
                      </Button>
                    </CardContent>
                  </Card>

                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                    <h4 className="font-medium text-purple-800 dark:text-purple-200 mb-2">FWC Integration Active</h4>
                    <p className="text-sm text-purple-700 dark:text-purple-300">
                      Call recordings from Framework Consulting Software are automatically analyzed and scored using AI. 
                      Set up department-specific templates to customize scoring criteria.
                    </p>
                  </div>
                </div>
              )}

              {/* Marketplace Templates Tab */}
              {activeManagerTab === 'templates' && (
                <MarketplaceTemplatesTab />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Conversation Viewer Dialog */}
      <Dialog open={!!viewingConversation} onOpenChange={() => setViewingConversation(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversation Details
            </DialogTitle>
          </DialogHeader>
          {viewingConversation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type:</span>{" "}
                  <Badge variant="outline">
                    {viewingConversation.category?.replace('-', ' ') || 'General'}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>{" "}
                  {new Date(viewingConversation.createdAt).toLocaleString('en-CA', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
                {viewingConversation.vehicleName && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Vehicle:</span>{" "}
                    <span className="font-medium">{viewingConversation.vehicleName}</span>
                  </div>
                )}
                {viewingConversation.handoffPhone && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Customer Phone:</span>{" "}
                    <span className="font-medium">{viewingConversation.handoffPhone}</span>
                    {viewingConversation.handoffSent && (
                      <Badge className="ml-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                        Sent to CRM
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              <ScrollArea className="h-[400px] rounded-md border p-4">
                <div className="space-y-4">
                  {viewingConversation.messages?.map((msg: any, idx: number) => (
                    <div
                      key={idx}
                      className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {msg.role === "user" && (
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                          <User className="h-4 w-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                  {(!viewingConversation.messages || viewingConversation.messages.length === 0) && (
                    <div className="text-center text-muted-foreground py-8">
                      No messages in this conversation
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Reply input for Messenger conversations - Managers only */}
              {viewingConversation.type === 'messenger' && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex gap-2">
                    <Input
                      value={messengerReplyText}
                      onChange={(e) => setMessengerReplyText(e.target.value)}
                      placeholder="Type your reply..."
                      className="flex-1"
                      data-testid="input-messenger-reply"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessengerReply();
                        }
                      }}
                      disabled={isSendingReply}
                    />
                    <Button
                      onClick={sendMessengerReply}
                      disabled={!messengerReplyText.trim() || isSendingReply}
                      data-testid="button-send-reply"
                    >
                      {isSendingReply ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Press Enter to send or click the send button
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
