/**
 * Geocoding Service for Canadian Postal Codes
 * Uses Geocoder.ca API for postal code to latitude/longitude conversion
 */

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  city?: string;
  province?: string;
  postalCode: string;
}

export interface DistanceCalculationResult {
  distanceKm: number;
  withinRadius: boolean;
}

export class GeocodingService {
  private cache: Map<string, GeocodeResult> = new Map();

  /**
   * Geocode a Canadian postal code to lat/lon using Geocoder.ca
   * Free tier available for non-commercial use, otherwise $1 per 200 lookups
   */
  async geocodePostalCode(postalCode: string): Promise<GeocodeResult | null> {
    // Normalize postal code (remove spaces, uppercase)
    const normalized = postalCode.replace(/\s/g, '').toUpperCase();
    
    // Check cache first
    if (this.cache.has(normalized)) {
      return this.cache.get(normalized)!;
    }
    
    try {
      // Geocoder.ca free XML endpoint (no API key required for basic use)
      const url = `https://geocoder.ca/?locate=${normalized}&geoit=xml`;
      
      const response = await fetch(url);
      const xmlText = await response.text();
      
      // Parse XML response (simple regex extraction)
      const latMatch = xmlText.match(/<latt>([-\d.]+)<\/latt>/);
      const lonMatch = xmlText.match(/<longt>([-\d.]+)<\/longt>/);
      const cityMatch = xmlText.match(/<city>(.*?)<\/city>/);
      const provMatch = xmlText.match(/<prov>(.*?)<\/prov>/);
      
      if (!latMatch || !lonMatch) {
        console.warn(`[Geocoding] Could not geocode postal code: ${postalCode}`);
        return null;
      }
      
      const result: GeocodeResult = {
        latitude: parseFloat(latMatch[1]),
        longitude: parseFloat(lonMatch[1]),
        city: cityMatch ? cityMatch[1] : undefined,
        province: provMatch ? provMatch[1] : undefined,
        postalCode: normalized
      };
      
      // Cache the result
      this.cache.set(normalized, result);
      
      return result;
    } catch (error) {
      console.error(`[Geocoding] Error geocoding postal code ${postalCode}:`, error);
      return null;
    }
  }

  /**
   * Calculate distance between two lat/lon coordinates using Haversine formula
   * Returns distance in kilometers
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
      Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return Math.round(distance * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Check if a location (lat/lon) is within a given radius (in km) of a postal code
   */
  async isWithinRadius(
    targetLat: number,
    targetLon: number,
    postalCode: string,
    radiusKm: number
  ): Promise<DistanceCalculationResult> {
    const geocoded = await this.geocodePostalCode(postalCode);
    
    if (!geocoded) {
      return {
        distanceKm: 0,
        withinRadius: false
      };
    }
    
    const distance = this.calculateDistance(
      geocoded.latitude,
      geocoded.longitude,
      targetLat,
      targetLon
    );
    
    return {
      distanceKm: distance,
      withinRadius: distance <= radiusKm
    };
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Clear the geocoding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size for monitoring
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// Export singleton instance
export const geocodingService = new GeocodingService();
