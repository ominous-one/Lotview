import { FilterState, FilterGroup } from "@/lib/types";
import { SlidersHorizontal, CarFront, DollarSign, Check, Building2, ArrowUpDown, Car, Search, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

const BODY_STYLES = ["SUV", "Truck", "Sedan"];
const DEALERSHIPS = ["Olympic Hyundai Vancouver", "Boundary Hyundai Vancouver", "Kia Vancouver"];

interface InventorySidebarProps {
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  availableMakes?: string[];
  hideDealershipFilter?: boolean;
  filterGroups?: FilterGroup[];
}

export function InventorySidebar({ filters, setFilters, availableMakes = [], hideDealershipFilter = false, filterGroups = [] }: InventorySidebarProps) {
  
  const handleTypeChange = (type: string) => {
    const newType = filters.type === type ? 'all' : type;
    setFilters({ ...filters, type: newType });
  };

  const handleDealershipChange = (dealer: string) => {
    const newDealer = filters.dealership === dealer ? 'all' : dealer;
    setFilters({ ...filters, dealership: newDealer });
  };

  const handleFilterGroupChange = (groupId: string) => {
    const newGroup = filters.filterGroup === groupId ? 'all' : groupId;
    setFilters({ ...filters, filterGroup: newGroup });
  };

  return (
    <aside className="w-full lg:w-64 flex-shrink-0 space-y-6">
      <div className="glass-panel p-6 rounded-2xl sticky top-24">
        <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4" /> Filters
        </h3>

        {/* Filter Groups (Dealership-specific categories) */}
        {filterGroups.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
              <Layers className="w-3 h-3" /> Categories
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${filters.filterGroup === 'all' ? 'bg-primary border-primary text-white' : 'border-border bg-card'}`}>
                  {filters.filterGroup === 'all' && <Check className="w-3 h-3" />}
                </div>
                <input 
                  type="radio" 
                  name="filterGroup" 
                  className="hidden" 
                  checked={filters.filterGroup === 'all'} 
                  onChange={() => setFilters({ ...filters, filterGroup: 'all' })}
                />
                <span className={`text-sm font-medium transition ${filters.filterGroup === 'all' ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`}>All Vehicles</span>
              </label>
              {filterGroups.map(group => (
                <label key={group.id} className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${filters.filterGroup === String(group.id) ? 'bg-primary border-primary text-white' : 'border-border bg-card'}`}>
                    {filters.filterGroup === String(group.id) && <Check className="w-3 h-3" />}
                  </div>
                  <input 
                    type="radio" 
                    name="filterGroup" 
                    className="hidden" 
                    checked={filters.filterGroup === String(group.id)} 
                    onChange={() => handleFilterGroupChange(String(group.id))}
                  />
                  <span className={`text-sm font-medium transition ${filters.filterGroup === String(group.id) ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`}>{group.groupName}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-8">
          <p className="text-xs font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
            <Search className="w-3 h-3" /> Search
          </p>
          <Input
            type="text"
            placeholder="Make, model, VIN..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full"
            data-testid="input-search"
          />
        </div>

        {/* Sort By */}
        <div className="mb-8">
          <p className="text-xs font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
            <ArrowUpDown className="w-3 h-3" /> Sort By
          </p>
          <Select
            value={filters.sortBy}
            onValueChange={(value: FilterState['sortBy']) => setFilters({ ...filters, sortBy: value })}
          >
            <SelectTrigger className="w-full" data-testid="select-sort">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="price_low">Price: Low to High</SelectItem>
              <SelectItem value="price_high">Price: High to Low</SelectItem>
              <SelectItem value="km_low">KM: Low to High</SelectItem>
              <SelectItem value="km_high">KM: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Make Filter */}
        {availableMakes.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
              <Car className="w-3 h-3" /> Make
            </p>
            <Select
              value={filters.make}
              onValueChange={(value) => setFilters({ ...filters, make: value })}
            >
              <SelectTrigger className="w-full" data-testid="select-make">
                <SelectValue placeholder="All Makes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Makes</SelectItem>
                {availableMakes.map((make) => (
                  <SelectItem key={make} value={make}>{make}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Dealership Filter - Hidden when on dealership subdomain */}
        {!hideDealershipFilter && (
          <div className="mb-8">
            <p className="text-xs font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
              <Building2 className="w-3 h-3" /> Dealership
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${filters.dealership === 'all' ? 'bg-primary border-primary text-white' : 'border-border bg-card'}`}>
                  {filters.dealership === 'all' && <Check className="w-3 h-3" />}
                </div>
                <input 
                  type="radio" 
                  name="dealership" 
                  className="hidden" 
                  checked={filters.dealership === 'all'} 
                  onChange={() => setFilters({ ...filters, dealership: 'all' })}
                />
                <span className={`text-sm font-medium transition ${filters.dealership === 'all' ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`}>All Dealerships</span>
              </label>
              {DEALERSHIPS.map(dealer => (
                 <label key={dealer} className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${filters.dealership === dealer ? 'bg-primary border-primary text-white' : 'border-border bg-card'}`}>
                    {filters.dealership === dealer && <Check className="w-3 h-3" />}
                  </div>
                  <input 
                    type="radio" 
                    name="dealership" 
                    className="hidden" 
                    checked={filters.dealership === dealer} 
                    onChange={() => handleDealershipChange(dealer)}
                  />
                  <span className={`text-sm font-medium transition ${filters.dealership === dealer ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`}>{dealer}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        
        {/* Body Style Filter */}
        <div className="mb-8">
          <p className="text-xs font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
            <CarFront className="w-3 h-3" /> Body Style
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${filters.type === 'all' ? 'bg-primary border-primary text-white' : 'border-border bg-card'}`}>
                {filters.type === 'all' && <Check className="w-3 h-3" />}
              </div>
              <input 
                type="radio" 
                name="type" 
                className="hidden" 
                checked={filters.type === 'all'} 
                onChange={() => setFilters({ ...filters, type: 'all' })}
              />
              <span className={`text-sm font-medium transition ${filters.type === 'all' ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`}>All Styles</span>
            </label>
            {BODY_STYLES.map(style => (
              <label key={style} className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${filters.type === style ? 'bg-primary border-primary text-white' : 'border-border bg-card'}`}>
                  {filters.type === style && <Check className="w-3 h-3" />}
                </div>
                <input 
                  type="radio" 
                  name="type" 
                  className="hidden" 
                  checked={filters.type === style} 
                  onChange={() => handleTypeChange(style)}
                />
                <span className={`text-sm font-medium transition ${filters.type === style ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`}>{style}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Price Slider */}
        <div>
          <div className="flex justify-between text-xs font-bold text-muted-foreground uppercase mb-4">
            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> Max Price</span>
            <span className="text-primary">${filters.priceMax.toLocaleString()}</span>
          </div>
          <Slider 
            defaultValue={[filters.priceMax]} 
            max={100000} 
            min={10000} 
            step={1000} 
            onValueChange={(val) => setFilters({ ...filters, priceMax: val[0] })}
            className="py-4"
          />
        </div>
      </div>
    </aside>
  );
}
