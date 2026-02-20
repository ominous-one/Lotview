import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, Check, Eye, RefreshCw } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

interface CompetitorPriceAlert {
  id: number;
  vehicleId: number | null;
  competitorName: string;
  competitorVehicleUrl: string | null;
  competitorYear: number;
  competitorMake: string;
  competitorModel: string;
  competitorTrim: string | null;
  competitorPrice: number;
  competitorOdometer: number | null;
  ourPrice: number | null;
  priceDifference: number | null;
  percentDifference: number | null;
  alertType: string;
  severity: string;
  status: string;
  detectedAt: string;
}

interface AlertSummary {
  total: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  recentAlerts: CompetitorPriceAlert[];
}

export function CompetitorAlertsWidget() {
  const queryClient = useQueryClient();
  const [isScanning, setIsScanning] = useState(false);

  const { data: summary, isLoading } = useQuery<AlertSummary>({
    queryKey: ["/api/manager/competitor-alerts/summary"],
    refetchInterval: 60000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: number) => {
      const res = await apiRequest("POST", `/api/manager/competitor-alerts/${alertId}/acknowledge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manager/competitor-alerts/summary"] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ alertId, note }: { alertId: number; note?: string }) => {
      const res = await apiRequest("POST", `/api/manager/competitor-alerts/${alertId}/resolve`, { note });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manager/competitor-alerts/summary"] });
    },
  });

  const runScan = async () => {
    setIsScanning(true);
    try {
      await apiRequest("POST", "/api/manager/competitor-scan");
      queryClient.invalidateQueries({ queryKey: ["/api/manager/competitor-alerts/summary"] });
    } catch (error) {
      console.error("Scan error:", error);
    } finally {
      setIsScanning(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-500 text-white";
      case "high": return "bg-orange-500 text-white";
      case "medium": return "bg-yellow-500 text-black";
      case "low": return "bg-blue-500 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0,
    }).format(price);
  };

  if (isLoading) {
    return (
      <Card data-testid="competitor-alerts-widget">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Competitor Price Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const newAlerts = summary?.byStatus?.new || 0;
  const criticalAlerts = summary?.bySeverity?.critical || 0;
  const highAlerts = summary?.bySeverity?.high || 0;

  return (
    <Card data-testid="competitor-alerts-widget">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Competitor Price Alerts
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={runScan}
            disabled={isScanning}
            data-testid="button-scan-competitors"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isScanning ? "animate-spin" : ""}`} />
            {isScanning ? "Scanning..." : "Scan"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold" data-testid="text-new-alerts-count">{newAlerts}</div>
            <div className="text-xs text-muted-foreground">New</div>
          </div>
          {criticalAlerts > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500" data-testid="text-critical-alerts-count">{criticalAlerts}</div>
              <div className="text-xs text-muted-foreground">Critical</div>
            </div>
          )}
          {highAlerts > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-500" data-testid="text-high-alerts-count">{highAlerts}</div>
              <div className="text-xs text-muted-foreground">High</div>
            </div>
          )}
        </div>

        {summary?.recentAlerts && summary.recentAlerts.length > 0 ? (
          <div className="space-y-3">
            {summary.recentAlerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className="p-3 border rounded-lg bg-muted/30"
                data-testid={`card-alert-${alert.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getSeverityColor(alert.severity)} data-testid={`badge-severity-${alert.id}`}>
                        {alert.severity}
                      </Badge>
                      <span className="text-sm font-medium truncate">
                        {alert.competitorYear} {alert.competitorMake} {alert.competitorModel}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">{alert.competitorName}</span>
                      {" • "}
                      {formatPrice(alert.competitorPrice)}
                      {alert.priceDifference && alert.priceDifference > 0 && (
                        <span className="text-red-500 ml-1">
                          ({formatPrice(alert.priceDifference)} less)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {alert.status === "new" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => acknowledgeMutation.mutate(alert.id)}
                          disabled={acknowledgeMutation.isPending}
                          title="Acknowledge"
                          data-testid={`button-acknowledge-${alert.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => resolveMutation.mutate({ alertId: alert.id })}
                          disabled={resolveMutation.isPending}
                          title="Resolve"
                          data-testid={`button-resolve-${alert.id}`}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {alert.competitorVehicleUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        asChild
                      >
                        <a
                          href={alert.competitorVehicleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View Listing"
                          data-testid={`link-view-listing-${alert.id}`}
                        >
                          <AlertTriangle className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <TrendingDown className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No competitor alerts</p>
            <p className="text-xs">Run a scan to check competitor prices</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
