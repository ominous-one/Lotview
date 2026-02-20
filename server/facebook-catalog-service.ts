import type { Vehicle } from '@shared/schema';

const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface CatalogConfig {
  catalogId: string;
  accessToken: string;
}

interface VehicleCatalogItem {
  id: string;
  title: string;
  description: string;
  availability: 'in stock' | 'out of stock';
  condition: 'new' | 'used' | 'certified_pre_owned';
  price: string;
  link: string;
  image_link: string;
  additional_image_link?: string[];
  brand: string;
  year: number;
  make: string;
  model: string;
  body_style: string;
  vin?: string;
  trim?: string;
  mileage: {
    value: number;
    unit: 'MI' | 'KM';
  };
  transmission?: string;
  exterior_color?: string;
  state_of_vehicle: 'new' | 'used';
  vehicle_id: string;
}

interface BatchRequest {
  method: 'CREATE' | 'UPDATE' | 'DELETE';
  retailer_id: string;
  data: Partial<VehicleCatalogItem>;
}

interface CatalogSyncResult {
  success: boolean;
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export class FacebookCatalogService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = GRAPH_API_BASE;
  }

  formatVehicleForCatalog(vehicle: Vehicle, dealerBaseUrl: string): VehicleCatalogItem {
    const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`;
    const isNew = vehicle.odometer < 100;
    
    const imageLinks = vehicle.images && vehicle.images.length > 0 
      ? vehicle.images 
      : ['https://via.placeholder.com/800x600?text=No+Image'];
    
    const vehicleLink = vehicle.dealerVdpUrl || `${dealerBaseUrl}/inventory/${vehicle.id}`;
    
    return {
      id: vehicle.vin || `vehicle-${vehicle.id}`,
      vehicle_id: vehicle.vin || `vehicle-${vehicle.id}`,
      title,
      description: vehicle.description || `${title} - ${vehicle.odometer.toLocaleString()} km - $${vehicle.price.toLocaleString()}`,
      availability: 'in stock',
      condition: isNew ? 'new' : 'used',
      price: `${vehicle.price} CAD`,
      link: vehicleLink,
      image_link: imageLinks[0],
      additional_image_link: imageLinks.slice(1, 10),
      brand: vehicle.make,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      body_style: vehicle.type || 'Other',
      vin: vehicle.vin || undefined,
      trim: vehicle.trim || undefined,
      mileage: {
        value: vehicle.odometer,
        unit: 'KM'
      },
      exterior_color: 'Unknown',
      state_of_vehicle: isNew ? 'new' : 'used',
    };
  }

  async getCatalogInfo(config: CatalogConfig): Promise<{ id: string; name: string; product_count: number }> {
    const url = `${this.baseUrl}/${config.catalogId}?fields=id,name,product_count&access_token=${config.accessToken}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get catalog info');
    }
    
    return response.json();
  }

  async getExistingVehicles(config: CatalogConfig): Promise<Set<string>> {
    const existingIds = new Set<string>();
    let nextUrl: string | null = `${this.baseUrl}/${config.catalogId}/vehicles?fields=id,retailer_id&limit=500&access_token=${config.accessToken}`;
    
    while (nextUrl) {
      const res: Response = await fetch(nextUrl);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to get existing vehicles');
      }
      
      const result: { data?: Array<{ id: string; retailer_id?: string }>; paging?: { next?: string } } = await res.json();
      
      for (const vehicle of result.data || []) {
        existingIds.add(vehicle.retailer_id || vehicle.id);
      }
      
      nextUrl = result.paging?.next || null;
    }
    
    return existingIds;
  }

  async syncVehiclesToCatalog(
    config: CatalogConfig, 
    vehicles: Vehicle[], 
    dealerBaseUrl: string,
    removeStale: boolean = true
  ): Promise<CatalogSyncResult> {
    const result: CatalogSyncResult = {
      success: true,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: []
    };

    try {
      const existingIds = await this.getExistingVehicles(config);
      const currentIds = new Set<string>();
      const batchRequests: BatchRequest[] = [];
      
      for (const vehicle of vehicles) {
        const catalogItem = this.formatVehicleForCatalog(vehicle, dealerBaseUrl);
        currentIds.add(catalogItem.id);
        
        const method = existingIds.has(catalogItem.id) ? 'UPDATE' : 'CREATE';
        
        batchRequests.push({
          method,
          retailer_id: catalogItem.id,
          data: catalogItem
        });
      }
      
      if (removeStale) {
        const existingArray = Array.from(existingIds);
        for (const existingId of existingArray) {
          if (!currentIds.has(existingId)) {
            batchRequests.push({
              method: 'DELETE',
              retailer_id: existingId,
              data: {}
            });
          }
        }
      }
      
      const batchSize = 100;
      for (let i = 0; i < batchRequests.length; i += batchSize) {
        const batch = batchRequests.slice(i, i + batchSize);
        const batchResult = await this.executeBatch(config, batch);
        
        for (const item of batch) {
          if (batchResult.success) {
            if (item.method === 'CREATE') result.created++;
            else if (item.method === 'UPDATE') result.updated++;
            else if (item.method === 'DELETE') result.deleted++;
          }
        }
        
        if (!batchResult.success) {
          result.errors.push(...batchResult.errors);
        }
      }
      
      if (result.errors.length > 0) {
        result.success = false;
      }
      
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message || 'Unknown error during sync');
    }
    
    return result;
  }

  private async executeBatch(config: CatalogConfig, requests: BatchRequest[]): Promise<{ success: boolean; errors: string[] }> {
    const url = `${this.baseUrl}/${config.catalogId}/items_batch`;
    
    const formattedRequests = requests.map(req => ({
      method: req.method,
      retailer_id: req.retailer_id,
      data: req.data
    }));
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: config.accessToken,
          item_type: 'VEHICLE',
          requests: formattedRequests
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          errors: [error.error?.message || 'Batch request failed']
        };
      }
      
      const data = await response.json();
      
      const errors: string[] = [];
      if (data.validation_status) {
        for (const status of data.validation_status) {
          if (status.errors && status.errors.length > 0) {
            errors.push(`Item ${status.retailer_id}: ${status.errors.map((e: any) => e.message).join(', ')}`);
          }
        }
      }
      
      return {
        success: errors.length === 0,
        errors
      };
    } catch (error: any) {
      return {
        success: false,
        errors: [error.message || 'Network error during batch request']
      };
    }
  }

  async deleteVehicle(config: CatalogConfig, vehicleId: string): Promise<boolean> {
    const result = await this.executeBatch(config, [{
      method: 'DELETE',
      retailer_id: vehicleId,
      data: {}
    }]);
    
    return result.success;
  }

  async testConnection(config: CatalogConfig): Promise<{ success: boolean; catalogName?: string; productCount?: number; error?: string }> {
    try {
      const info = await this.getCatalogInfo(config);
      return {
        success: true,
        catalogName: info.name,
        productCount: info.product_count
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to connect to catalog'
      };
    }
  }
}

export const facebookCatalogService = new FacebookCatalogService();
