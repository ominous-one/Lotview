import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Car, Search, RefreshCw, ExternalLink, Loader2, LayoutGrid, List, SlidersHorizontal, X, ArrowUpDown, Download, Facebook, RotateCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { VehicleCard } from "@/components/VehicleCard";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface Vehicle {
  id: number;
  dealershipId: number;
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  odometer?: number;
  imageUrl?: string;
  images?: string[];
  type?: string;
  status?: string;
  vin?: string;
  stockNumber?: string;
  location?: string;
  dealership?: string;
  filterGroupId?: number;
  createdAt?: string;
  carfaxUrl?: string;
  exteriorColor?: string;
  interiorColor?: string;
  transmission?: string;
  drivetrain?: string;
  fuelType?: string;
  engine?: string;
  bodyStyle?: string;
  doors?: number;
  seats?: number;
  features?: string[];
  description?: string;
  listingUrl?: string;
}

interface Dealership {
  id: number;
  name: string;
  slug: string;
}

interface FilterGroup {
  id: number;
  name: string;
  description?: string;
}

interface InventoryManagementProps {
  dealershipId?: number;
  showDealershipSelector?: boolean;
  dealerships?: Dealership[];
  onDealershipChange?: (dealershipId: number) => void;
}

type ViewMode = "table" | "grid";
type SortOption = "default" | "price_low" | "price_high" | "km_low" | "km_high" | "year_new" | "year_old";

export function InventoryManagement({ 
  dealershipId, 
  showDealershipSelector = false,
  dealerships = [],
  onDealershipChange
}: InventoryManagementProps) {
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDealership, setSelectedDealership] = useState<number | undefined>(dealershipId);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  const [filters, setFilters] = useState({
    type: "all",
    make: "all",
    priceMax: 150000,
    filterGroup: "all",
    sortBy: "default" as SortOption,
  });
  const [rescrapingVehicleId, setRescrapingVehicleId] = useState<number | null>(null);

  const handleForceRescrape = async (vehicleId: number) => {
    setRescrapingVehicleId(vehicleId);
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        throw new Error("Not authenticated");
      }
      
      const effectiveDealershipId = selectedDealership || dealershipId || 1;
      const response = await fetch(`/api/vehicles/${vehicleId}/force-rescrape`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Dealership-Id": effectiveDealershipId.toString(),
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || "Failed to re-scrape vehicle");
      }
      
      const result = await response.json().catch(() => ({}));
      const fieldsUpdated = result?.updatedFields?.length ?? 0;
      const imageCount = result?.newImageCount ?? 0;
      
      toast({
        title: "Re-scrape Complete",
        description: `Updated ${fieldsUpdated} fields. Images: ${imageCount}`,
      });
      
      // Refresh the vehicle list to show updated data
      fetchVehicles(effectiveDealershipId);
    } catch (error) {
      toast({
        title: "Re-scrape Failed",
        description: error instanceof Error ? error.message : "Could not re-scrape vehicle",
        variant: "destructive",
      });
    } finally {
      setRescrapingVehicleId(null);
    }
  };

  const fetchVehicles = async (dealerId?: number) => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${token}`,
      };
      
      if (dealerId) {
        headers["X-Dealership-Id"] = dealerId.toString();
      }
      
      const response = await fetch("/api/vehicles", { headers });
      
      if (response.ok) {
        const data = await response.json();
        setVehicles(Array.isArray(data) ? data : data.data || []);
      } else {
        throw new Error("Failed to fetch vehicles");
      }
    } catch (error) {
      console.error("Error fetching vehicles:", error);
      toast({
        title: "Error",
        description: "Failed to load inventory",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFilterGroups = async (dealerId?: number) => {
    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${token}`,
      };
      
      if (dealerId) {
        headers["X-Dealership-Id"] = dealerId.toString();
      }
      
      const response = await fetch("/api/public/filter-groups", { headers });
      
      if (response.ok) {
        const data = await response.json();
        setFilterGroups(data);
      }
    } catch (error) {
      console.error("Error fetching filter groups:", error);
    }
  };

  useEffect(() => {
    fetchVehicles(selectedDealership);
    fetchFilterGroups(selectedDealership);
  }, [selectedDealership]);

  const handleDealershipChange = (value: string) => {
    const dealerId = parseInt(value);
    setSelectedDealership(dealerId);
    onDealershipChange?.(dealerId);
  };

  const uniqueMakes = useMemo(() => 
    Array.from(new Set(vehicles.map(v => v.make))).filter(Boolean).sort(),
    [vehicles]
  );

  const uniqueTypes = useMemo(() => 
    Array.from(new Set(vehicles.map(v => v.type))).filter(Boolean).sort(),
    [vehicles]
  );

  const maxPrice = useMemo(() => 
    Math.max(...vehicles.map(v => v.price), 150000),
    [vehicles]
  );

  const filteredVehicles = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    
    return vehicles
      .filter(vehicle => {
        const matchesSearch = !searchLower || 
          vehicle.make?.toLowerCase().includes(searchLower) ||
          vehicle.model?.toLowerCase().includes(searchLower) ||
          vehicle.year?.toString().includes(searchTerm) ||
          vehicle.vin?.toLowerCase().includes(searchLower) ||
          vehicle.stockNumber?.toLowerCase().includes(searchLower);
        
        const matchesType = filters.type === "all" || vehicle.type === filters.type;
        const matchesMake = filters.make === "all" || vehicle.make === filters.make;
        const matchesPrice = vehicle.price <= filters.priceMax;
        const matchesFilterGroup = filters.filterGroup === "all" || 
          (vehicle.filterGroupId && String(vehicle.filterGroupId) === filters.filterGroup);
        
        return matchesSearch && matchesType && matchesMake && matchesPrice && matchesFilterGroup;
      })
      .sort((a, b) => {
        switch (filters.sortBy) {
          case "price_low":
            return a.price - b.price;
          case "price_high":
            return b.price - a.price;
          case "km_low":
            return (a.odometer || 0) - (b.odometer || 0);
          case "km_high":
            return (b.odometer || 0) - (a.odometer || 0);
          case "year_new":
            return b.year - a.year;
          case "year_old":
            return a.year - b.year;
          default:
            return 0;
        }
      });
  }, [vehicles, searchTerm, filters]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatOdometer = (odometer?: number) => {
    if (odometer === undefined || odometer === null) return "N/A";
    if (odometer === 0) return "New";
    return `${odometer.toLocaleString()} km`;
  };

  const resetFilters = () => {
    setFilters({
      type: "all",
      make: "all",
      priceMax: maxPrice,
      filterGroup: "all",
      sortBy: "default",
    });
    setSearchTerm("");
  };

  const hasActiveFilters = filters.type !== "all" || filters.make !== "all" || 
    filters.priceMax < maxPrice || filters.filterGroup !== "all" || searchTerm;

  const FilterControls = () => (
    <div className="space-y-6">
      <div>
        <Label className="text-sm font-medium mb-2 block">Vehicle Type</Label>
        <Select value={filters.type} onValueChange={(v) => setFilters(f => ({ ...f, type: v }))}>
          <SelectTrigger data-testid="filter-type">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueTypes.map(type => (
              <SelectItem key={type} value={type!}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">Make</Label>
        <Select value={filters.make} onValueChange={(v) => setFilters(f => ({ ...f, make: v }))}>
          <SelectTrigger data-testid="filter-make">
            <SelectValue placeholder="All Makes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Makes</SelectItem>
            {uniqueMakes.map(make => (
              <SelectItem key={make} value={make!}>{make}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filterGroups.length > 0 && (
        <div>
          <Label className="text-sm font-medium mb-2 block">Category</Label>
          <Select value={filters.filterGroup} onValueChange={(v) => setFilters(f => ({ ...f, filterGroup: v }))}>
            <SelectTrigger data-testid="filter-group">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {filterGroups.map(group => (
                <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label className="text-sm font-medium mb-2 block">
          Max Price: {formatPrice(filters.priceMax)}
        </Label>
        <Slider
          value={[filters.priceMax]}
          onValueChange={([v]) => setFilters(f => ({ ...f, priceMax: v }))}
          max={maxPrice}
          min={0}
          step={1000}
          className="mt-2"
          data-testid="filter-price-slider"
        />
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">Sort By</Label>
        <Select value={filters.sortBy} onValueChange={(v) => setFilters(f => ({ ...f, sortBy: v as SortOption }))}>
          <SelectTrigger data-testid="filter-sort">
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="price_low">Price: Low to High</SelectItem>
            <SelectItem value="price_high">Price: High to Low</SelectItem>
            <SelectItem value="km_low">Mileage: Low to High</SelectItem>
            <SelectItem value="km_high">Mileage: High to Low</SelectItem>
            <SelectItem value="year_new">Year: Newest First</SelectItem>
            <SelectItem value="year_old">Year: Oldest First</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters && (
        <Button variant="outline" onClick={resetFilters} className="w-full" data-testid="button-reset-filters">
          <X className="h-4 w-4 mr-2" />
          Reset Filters
        </Button>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Inventory Management
            </CardTitle>
            <CardDescription>
              View and manage vehicle inventory ({filteredVehicles.length} vehicles)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center border rounded-lg p-1">
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                data-testid="button-view-table"
                className="px-3"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                data-testid="button-view-grid"
                className="px-3"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            {viewMode === "grid" && (
              <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-open-filters">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Filters
                    {hasActiveFilters && (
                      <Badge variant="secondary" className="ml-2 px-1.5 py-0.5 text-xs">
                        Active
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <SlidersHorizontal className="h-5 w-5" />
                      Filter Inventory
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-6">
                    <FilterControls />
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchVehicles(selectedDealership)}
              disabled={isLoading}
              data-testid="button-refresh-inventory"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  toast({
                    title: "Downloading",
                    description: "Preparing ZIP file with all vehicle photos...",
                  });
                  const token = localStorage.getItem("auth_token");
                  const response = await fetch("/api/inventory/download-all-images", {
                    headers: {
                      "Authorization": `Bearer ${token}`,
                      "X-Dealership-Id": (selectedDealership || dealershipId || 1).toString(),
                    },
                  });
                  if (!response.ok) throw new Error("Download failed");
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `inventory_photos_${new Date().toISOString().split("T")[0]}.zip`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                  toast({
                    title: "Download Complete",
                    description: "All vehicle photos downloaded successfully!",
                  });
                } catch (error) {
                  toast({
                    title: "Download Failed",
                    description: "Could not download images. Please try again.",
                    variant: "destructive",
                  });
                }
              }}
              disabled={isLoading || filteredVehicles.length === 0}
              data-testid="button-download-all-images"
            >
              <Download className="h-4 w-4 mr-2" />
              Download All Photos
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {showDealershipSelector && dealerships.length > 0 && (
            <Select
              value={selectedDealership?.toString() || ""}
              onValueChange={handleDealershipChange}
            >
              <SelectTrigger className="w-full sm:w-[250px]" data-testid="select-dealership">
                <SelectValue placeholder="Select Dealership" />
              </SelectTrigger>
              <SelectContent>
                {dealerships.map((d) => (
                  <SelectItem key={d.id} value={d.id.toString()}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by make, model, year, VIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-inventory"
            />
          </div>
          {viewMode === "table" && (
            <Select value={filters.sortBy} onValueChange={(v) => setFilters(f => ({ ...f, sortBy: v as SortOption }))}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="table-sort">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="price_low">Price: Low to High</SelectItem>
                <SelectItem value="price_high">Price: High to Low</SelectItem>
                <SelectItem value="km_low">Mileage: Low to High</SelectItem>
                <SelectItem value="km_high">Mileage: High to Low</SelectItem>
                <SelectItem value="year_new">Year: Newest</SelectItem>
                <SelectItem value="year_old">Year: Oldest</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Quick filters for grid view */}
        {viewMode === "grid" && (
          <div className="flex flex-wrap gap-2 mb-6">
            <Select value={filters.type} onValueChange={(v) => setFilters(f => ({ ...f, type: v }))}>
              <SelectTrigger className="w-[140px]" data-testid="quick-filter-type">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {uniqueTypes.map(type => (
                  <SelectItem key={type} value={type!}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.make} onValueChange={(v) => setFilters(f => ({ ...f, make: v }))}>
              <SelectTrigger className="w-[140px]" data-testid="quick-filter-make">
                <SelectValue placeholder="All Makes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Makes</SelectItem>
                {uniqueMakes.map(make => (
                  <SelectItem key={make} value={make!}>{make}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.sortBy} onValueChange={(v) => setFilters(f => ({ ...f, sortBy: v as SortOption }))}>
              <SelectTrigger className="w-[160px]" data-testid="quick-filter-sort">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="price_low">Price: Low to High</SelectItem>
                <SelectItem value="price_high">Price: High to Low</SelectItem>
                <SelectItem value="year_new">Year: Newest</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="quick-reset-filters">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No vehicles found</p>
            <p className="text-sm mt-2">
              {searchTerm || hasActiveFilters ? "Try adjusting your filters" : "Run a scrape to populate inventory"}
            </p>
          </div>
        ) : viewMode === "table" ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Image</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Stock #</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Odometer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVehicles.slice(0, 50).map((vehicle) => (
                  <TableRow key={vehicle.id} data-testid={`row-vehicle-${vehicle.id}`}>
                    <TableCell>
                      {(vehicle.images?.length || vehicle.imageUrl) ? (
                        <img
                          src={vehicle.images?.[0] || vehicle.imageUrl}
                          alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                          className="w-20 h-14 object-cover rounded"
                        />
                      ) : (
                        <div className="w-20 h-14 bg-muted rounded flex items-center justify-center">
                          <Car className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </div>
                      {vehicle.trim && (
                        <div className="text-sm text-muted-foreground">{vehicle.trim}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {vehicle.stockNumber || "N/A"}
                      </code>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatPrice(vehicle.price)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatOdometer(vehicle.odometer)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{vehicle.type || "Used"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          title="Force Re-scrape (Update price, images)" 
                          data-testid={`button-rescrape-vehicle-${vehicle.id}`}
                          onClick={() => handleForceRescrape(vehicle.id)}
                          disabled={rescrapingVehicleId === vehicle.id}
                        >
                          {rescrapingVehicleId === vehicle.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCw className="h-4 w-4 text-orange-500" />
                          )}
                        </Button>
                        <Link href={`/marketplace-blast/vehicle/${vehicle.id}`}>
                          <Button variant="ghost" size="sm" title="Post to Facebook Marketplace" data-testid={`button-fb-vehicle-${vehicle.id}`}>
                            <Facebook className="h-4 w-4 text-[#1877f2]" />
                          </Button>
                        </Link>
                        <Link href={`/vehicle/${vehicle.id}`}>
                          <Button variant="ghost" size="sm" title="View Details" data-testid={`button-view-vehicle-${vehicle.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredVehicles.length > 50 && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Showing first 50 of {filteredVehicles.length} vehicles
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredVehicles.slice(0, 30).map((vehicle) => (
                <VehicleCard 
                  key={vehicle.id} 
                  car={{
                    id: vehicle.id,
                    year: vehicle.year,
                    make: vehicle.make,
                    model: vehicle.model,
                    trim: vehicle.trim || "",
                    price: vehicle.price,
                    odometer: vehicle.odometer || 0,
                    type: vehicle.type || "Used",
                    location: vehicle.location || "",
                    dealership: vehicle.dealership || "",
                    images: vehicle.images || (vehicle.imageUrl ? [vehicle.imageUrl] : []),
                    badges: [],
                    vin: vehicle.vin || "",
                    stockNumber: vehicle.stockNumber || "",
                    carfaxUrl: vehicle.carfaxUrl || "",
                    description: vehicle.description || "",
                    filterGroupId: vehicle.filterGroupId,
                  }} 
                />
              ))}
            </div>
            {filteredVehicles.length > 30 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Showing first 30 of {filteredVehicles.length} vehicles
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
