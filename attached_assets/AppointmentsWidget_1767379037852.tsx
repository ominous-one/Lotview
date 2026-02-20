import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, CalendarCheck, Clock, RefreshCw, User, Loader2 } from "lucide-react";
import { format, addDays, startOfDay, endOfDay } from "date-fns";

interface Calendar {
  id: string;
  name: string;
  isActive?: boolean;
}

interface Appointment {
  id: string;
  title: string;
  appointmentStatus: string;
  startTime: string;
  endTime: string;
  contactId?: string;
  notes?: string;
}

interface AppointmentsWidgetProps {
  compact?: boolean;
}

export function AppointmentsWidget({ compact = false }: AppointmentsWidgetProps) {
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [dateRange, setDateRange] = useState<"today" | "week" | "month">("today");

  const getDateRange = () => {
    const now = new Date();
    const start = startOfDay(now);
    let end: Date;
    
    switch (dateRange) {
      case "week":
        end = endOfDay(addDays(now, 7));
        break;
      case "month":
        end = endOfDay(addDays(now, 30));
        break;
      default:
        end = endOfDay(now);
    }
    
    return { start, end };
  };

  const { data: calendars, isLoading: calendarsLoading } = useQuery<{ calendars: Calendar[] }>({
    queryKey: ["/api/ghl/calendars"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/ghl/calendars", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 404) return { calendars: [] };
        throw new Error("Failed to fetch calendars");
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (calendars?.calendars?.length && !selectedCalendarId) {
      setSelectedCalendarId(calendars.calendars[0].id);
    }
  }, [calendars, selectedCalendarId]);

  const { start, end } = getDateRange();

  const { data: appointments, isLoading: appointmentsLoading, refetch } = useQuery<{ events: Appointment[] }>({
    queryKey: ["/api/ghl/appointments", selectedCalendarId, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      if (!selectedCalendarId) return { events: [] };
      const token = localStorage.getItem("auth_token");
      const res = await fetch(
        `/api/ghl/appointments?calendarId=${selectedCalendarId}&startDate=${start.toISOString()}&endDate=${end.toISOString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      if (!res.ok) {
        if (res.status === 404) return { events: [] };
        throw new Error("Failed to fetch appointments");
      }
      return res.json();
    },
    enabled: !!selectedCalendarId,
  });

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "confirmed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "completed":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const appointmentsList = appointments?.events || [];
  const upcomingCount = appointmentsList.filter(a => 
    a.appointmentStatus?.toLowerCase() !== "cancelled" &&
    a.appointmentStatus?.toLowerCase() !== "completed"
  ).length;

  if (compact) {
    return (
      <Card className="h-full" data-testid="widget-appointments-compact">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{upcomingCount}</p>
                <p className="text-sm text-muted-foreground">
                  {dateRange === "today" ? "Today" : dateRange === "week" ? "This Week" : "This Month"}
                </p>
              </div>
            </div>
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
              <SelectTrigger className="w-24" data-testid="select-date-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="widget-appointments">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            Appointments
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} data-testid="btn-refresh-appointments">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Select
            value={selectedCalendarId || (calendars?.calendars?.[0]?.id ?? "placeholder")}
            onValueChange={(value) => {
              if (value === "placeholder" || value === "__loading") return;
              setSelectedCalendarId(value);
            }}
            disabled={calendarsLoading || !calendars?.calendars?.length}
          >
            <SelectTrigger className="flex-1" data-testid="select-calendar">
              <SelectValue placeholder={calendarsLoading ? "Loading calendars..." : "Select calendar"} />
            </SelectTrigger>
            <SelectContent>
              {calendarsLoading ? (
                <SelectItem value="__loading" disabled>Loading...</SelectItem>
              ) : calendars?.calendars?.length ? (
                calendars.calendars.map((cal) => (
                  <SelectItem key={cal.id} value={cal.id}>
                    {cal.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="placeholder" disabled>No calendars found</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
            <SelectTrigger className="w-28" data-testid="select-date-range-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {appointmentsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : appointmentsList.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No appointments scheduled</p>
            <p className="text-sm">
              {dateRange === "today" ? "for today" : dateRange === "week" ? "this week" : "this month"}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {appointmentsList.map((appointment) => (
              <div
                key={appointment.id}
                className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                data-testid={`appointment-${appointment.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{appointment.title || "Untitled"}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {format(new Date(appointment.startTime), "MMM d, h:mm a")}
                      </span>
                    </div>
                    {appointment.notes && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {appointment.notes}
                      </p>
                    )}
                  </div>
                  <Badge className={getStatusColor(appointment.appointmentStatus)}>
                    {appointment.appointmentStatus || "Unknown"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
