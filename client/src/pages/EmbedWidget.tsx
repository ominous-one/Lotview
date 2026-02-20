import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { VehicleCard } from '@/components/VehicleCard';
import { type Car } from '@/lib/types';
import { getVehicles } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function EmbedWidget() {
  const [filters, setFilters] = useState({
    dealership: '',
    make: '',
    type: '',
    minPrice: '',
    maxPrice: '',
  });

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilters({
      dealership: params.get('dealership') || '',
      make: params.get('make') || '',
      type: params.get('type') || '',
      minPrice: params.get('minPrice') || '',
      maxPrice: params.get('maxPrice') || '',
    });
  }, []);

  const { data: vehicles, isLoading } = useQuery<Car[]>({
    queryKey: ['vehicles'],
    queryFn: getVehicles,
  });

  // Filter vehicles based on URL parameters
  const filteredVehicles = vehicles?.filter((vehicle) => {
    if (filters.dealership && vehicle.dealership !== filters.dealership) return false;
    if (filters.make && vehicle.make.toLowerCase() !== filters.make.toLowerCase()) return false;
    if (filters.type && vehicle.type !== filters.type) return false;
    if (filters.minPrice && vehicle.price < parseInt(filters.minPrice)) return false;
    if (filters.maxPrice && vehicle.price > parseInt(filters.maxPrice)) return false;
    return true;
  }) || [];

  // Send height updates to parent frame
  useEffect(() => {
    const sendHeight = () => {
      const height = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: 'resize', height }, '*');
    };

    sendHeight();
    window.addEventListener('resize', sendHeight);
    
    // Send height after images load
    const interval = setInterval(sendHeight, 1000);
    setTimeout(() => clearInterval(interval), 5000);

    return () => {
      window.removeEventListener('resize', sendHeight);
      clearInterval(interval);
    };
  }, [filteredVehicles]);

  // Listen for messages from parent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'updateFilters') {
        setFilters(event.data.filters);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Send vehicle click events to parent
  const handleVehicleClick = (vehicle: Car) => {
    window.parent.postMessage({
      type: 'vehicle_clicked',
      vehicle: {
        id: vehicle.id,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        price: vehicle.price,
      },
    }, '*');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (filteredVehicles.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-background">
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">No vehicles found</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background p-4 min-h-screen">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-7xl mx-auto">
        {filteredVehicles.map((vehicle) => (
          <div 
            key={vehicle.id} 
            onClickCapture={(e) => {
              // Prevent navigation inside iframe - only send postMessage event
              e.preventDefault();
              e.stopPropagation();
              handleVehicleClick(vehicle);
            }}
          >
            <VehicleCard car={vehicle} />
          </div>
        ))}
      </div>
    </div>
  );
}
