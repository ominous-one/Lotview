import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Calendar,
  CalendarDays,
  CalendarClock,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Facebook,
  ThumbsUp,
  MessageCircle,
  Share2,
  Edit3,
  CalendarCheck,
  Trash2,
  Zap,
  Activity,
  TrendingUp,
  Settings2,
  FileText,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  addDays,
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";

type FrequencyPreset = "aggressive" | "balanced" | "lightweight";

type PageSettings = {
  id: string;
  name: string;
  color: string;
  avatar: string;
  frequencyPreset: FrequencyPreset;
  postsPerDay: number;
  startTime: string;
  endTime: string;
  activeDays: string[];
  autoPostingEnabled: boolean;
  defaultTemplate: string;
};

type ScheduledPost = {
  id: string;
  pageId: string;
  vehicleId: number;
  vehicleName: string;
  vehicleImage: string;
  vehiclePrice: number;
  title: string;
  description: string;
  scheduledAt: Date;
  status: "scheduled" | "posted" | "failed";
  template: string;
};

type Template = {
  id: string;
  name: string;
  titleTemplate: string;
  descriptionTemplate: string;
};

const MOCK_PAGES: PageSettings[] = [
  {
    id: "page-1",
    name: "Olympic Kia Vancouver",
    color: "#022d60",
    avatar: "OK",
    frequencyPreset: "balanced",
    postsPerDay: 4,
    startTime: "09:00",
    endTime: "18:00",
    activeDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    autoPostingEnabled: true,
    defaultTemplate: "template-1",
  },
  {
    id: "page-2",
    name: "Olympic Hyundai Burnaby",
    color: "#00aad2",
    avatar: "OH",
    frequencyPreset: "aggressive",
    postsPerDay: 8,
    startTime: "08:00",
    endTime: "20:00",
    activeDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    autoPostingEnabled: true,
    defaultTemplate: "template-2",
  },
  {
    id: "page-3",
    name: "Olympic Auto Used Cars",
    color: "#7c3aed",
    avatar: "OU",
    frequencyPreset: "lightweight",
    postsPerDay: 2,
    startTime: "10:00",
    endTime: "16:00",
    activeDays: ["Mon", "Wed", "Fri"],
    autoPostingEnabled: false,
    defaultTemplate: "template-1",
  },
];

const MOCK_TEMPLATES: Template[] = [
  {
    id: "template-1",
    name: "Standard Listing",
    titleTemplate: "{year} {make} {model} - Only ${price}!",
    descriptionTemplate: "Check out this beautiful {year} {make} {model} {trim}! Only {mileage} km. Don't miss this deal!",
  },
  {
    id: "template-2",
    name: "Urgent Sale",
    titleTemplate: "🔥 HOT DEAL: {year} {make} {model}",
    descriptionTemplate: "⚡ LIMITED TIME! This {year} {make} {model} won't last long at ${price}. Call now!",
  },
  {
    id: "template-3",
    name: "Premium Showcase",
    titleTemplate: "✨ Luxury {year} {make} {model} Available",
    descriptionTemplate: "Experience luxury with this stunning {year} {make} {model} {trim}. Premium features, exceptional value.",
  },
];

const generateMockPosts = (): ScheduledPost[] => {
  const posts: ScheduledPost[] = [];
  const vehicles = [
    { id: 1, name: "2024 Kia Telluride X-Pro", image: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=400", price: 52990 },
    { id: 2, name: "2024 Hyundai Santa Fe", image: "https://images.unsplash.com/photo-1606611013016-969c19ba27bb?w=400", price: 44990 },
    { id: 3, name: "2023 Kia EV6 GT-Line", image: "https://images.unsplash.com/photo-1617788138017-80ad40651399?w=400", price: 58990 },
    { id: 4, name: "2024 Hyundai Ioniq 5", image: "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=400", price: 54990 },
    { id: 5, name: "2023 Kia Sportage SX", image: "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=400", price: 38990 },
    { id: 6, name: "2024 Hyundai Tucson", image: "https://images.unsplash.com/photo-1606611013016-969c19ba27bb?w=400", price: 36990 },
    { id: 7, name: "2023 Kia Sorento PHEV", image: "https://images.unsplash.com/photo-1617788138017-80ad40651399?w=400", price: 49990 },
    { id: 8, name: "2024 Hyundai Palisade", image: "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=400", price: 56990 },
  ];

  const statuses: ("scheduled" | "posted" | "failed")[] = ["scheduled", "posted", "failed"];
  const now = new Date();

  for (let i = 0; i < 20; i++) {
    const vehicle = vehicles[i % vehicles.length];
    const page = MOCK_PAGES[i % MOCK_PAGES.length];
    const dayOffset = Math.floor(i / 3) - 3;
    const hourOffset = (i % 8) + 9;
    const scheduledDate = addDays(now, dayOffset);
    scheduledDate.setHours(hourOffset, 0, 0, 0);

    let status: "scheduled" | "posted" | "failed" = "scheduled";
    if (dayOffset < 0) {
      status = Math.random() > 0.1 ? "posted" : "failed";
    } else if (dayOffset === 0 && hourOffset < now.getHours()) {
      status = Math.random() > 0.15 ? "posted" : "failed";
    }

    posts.push({
      id: `post-${i + 1}`,
      pageId: page.id,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      vehicleImage: vehicle.image,
      vehiclePrice: vehicle.price,
      title: `🚗 ${vehicle.name} - Great Deal!`,
      description: `Don't miss this amazing ${vehicle.name}! Only $${vehicle.price.toLocaleString()}. Low mileage, excellent condition. Visit us today!`,
      scheduledAt: scheduledDate,
      status,
      template: MOCK_TEMPLATES[i % MOCK_TEMPLATES.length].name,
    });
  }

  return posts;
};

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const FREQUENCY_PRESETS = {
  aggressive: { label: "Aggressive", postsPerDay: 8, description: "Maximum exposure" },
  balanced: { label: "Balanced", postsPerDay: 4, description: "Recommended" },
  lightweight: { label: "Lightweight", postsPerDay: 2, description: "Minimal posting" },
};

function KPICard({
  title,
  value,
  icon: Icon,
  trend,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  color: string;
}) {
  return (
    <Card
      className="relative overflow-hidden border-0 bg-white/80 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5"
      data-testid={`kpi-card-${title.toLowerCase().replace(/\s/g, "-")}`}
    >
      <div
        className="absolute inset-0 opacity-10"
        style={{ background: `linear-gradient(135deg, ${color} 0%, transparent 100%)` }}
      />
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold tracking-tight" style={{ color }}>
              {value}
            </p>
            {trend && (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {trend}
              </p>
            )}
          </div>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)` }}
          >
            <Icon className="w-7 h-7 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PageListItem({
  page,
  isSelected,
  onClick,
  postsCount,
}: {
  page: PageSettings;
  isSelected: boolean;
  onClick: () => void;
  postsCount: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-xl transition-all duration-300 flex items-center gap-4 group ${
        isSelected
          ? "bg-gradient-to-r from-[#022d60]/10 to-[#00aad2]/10 border-2 border-[#00aad2]/30 shadow-lg"
          : "bg-white/60 hover:bg-white/90 border border-transparent hover:border-gray-200"
      }`}
      data-testid={`page-item-${page.id}`}
    >
      <Avatar className="w-12 h-12 shadow-md ring-2 ring-white">
        <AvatarFallback
          className="text-white font-bold text-sm"
          style={{ background: `linear-gradient(135deg, ${page.color} 0%, ${page.color}cc 100%)` }}
        >
          {page.avatar}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 text-left">
        <p className="font-semibold text-gray-900 group-hover:text-[#022d60] transition-colors">
          {page.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Badge
            variant={page.autoPostingEnabled ? "default" : "secondary"}
            className={`text-xs ${
              page.autoPostingEnabled
                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {page.autoPostingEnabled ? "Active" : "Paused"}
          </Badge>
          <span className="text-xs text-muted-foreground">{postsCount} posts</span>
        </div>
      </div>
      <div
        className="w-3 h-3 rounded-full shadow-inner"
        style={{ backgroundColor: page.color }}
      />
    </button>
  );
}

function CalendarView({
  posts,
  pages,
  onPostClick,
  selectedPageFilter,
}: {
  posts: ScheduledPost[];
  pages: PageSettings[];
  onPostClick: (post: ScheduledPost) => void;
  selectedPageFilter: string | null;
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  const filteredPosts = useMemo(() => {
    if (!selectedPageFilter) return posts;
    return posts.filter((p) => p.pageId === selectedPageFilter);
  }, [posts, selectedPageFilter]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const daysToRender = viewMode === "month" ? calendarDays : weekDays;

  const getPostsForDay = (day: Date) => {
    return filteredPosts.filter((post) => isSameDay(post.scheduledAt, day));
  };

  const getPageColor = (pageId: string) => {
    return pages.find((p) => p.id === pageId)?.color || "#6b7280";
  };

  const navigatePrev = () => {
    if (viewMode === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, -7));
    }
  };

  const navigateNext = () => {
    if (viewMode === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, 7));
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={navigatePrev}
            className="rounded-full"
            data-testid="calendar-nav-prev"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h3 className="text-xl font-bold text-gray-900 min-w-[200px] text-center">
            {viewMode === "month"
              ? format(currentDate, "MMMM yyyy")
              : `Week of ${format(weekStart, "MMM d")}`}
          </h3>
          <Button
            variant="outline"
            size="icon"
            onClick={navigateNext}
            className="rounded-full"
            data-testid="calendar-nav-next"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
          <Button
            variant={viewMode === "month" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("month")}
            className="rounded-md"
            data-testid="view-toggle-month"
          >
            <LayoutGrid className="w-4 h-4 mr-1" />
            Month
          </Button>
          <Button
            variant={viewMode === "week" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("week")}
            className="rounded-md"
            data-testid="view-toggle-week"
          >
            <List className="w-4 h-4 mr-1" />
            Week
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="text-center text-sm font-semibold text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>

      <div
        className={`grid grid-cols-7 gap-1 flex-1 ${
          viewMode === "week" ? "auto-rows-fr" : ""
        }`}
      >
        {daysToRender.map((day, idx) => {
          const dayPosts = getPostsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isDayToday = isToday(day);

          return (
            <div
              key={idx}
              className={`
                min-h-[100px] p-2 rounded-xl border transition-all duration-200
                ${!isCurrentMonth && viewMode === "month" ? "bg-gray-50/50 opacity-50" : "bg-white/70 hover:bg-white"}
                ${isDayToday ? "ring-2 ring-[#00aad2] ring-offset-2" : ""}
                ${viewMode === "week" ? "min-h-[200px]" : ""}
              `}
              data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-sm font-semibold ${
                    isDayToday
                      ? "bg-[#00aad2] text-white w-7 h-7 rounded-full flex items-center justify-center"
                      : "text-gray-700"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {dayPosts.length > 0 && (
                  <div className="flex gap-0.5">
                    {dayPosts.slice(0, 3).map((post) => (
                      <div
                        key={post.id}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getPageColor(post.pageId) }}
                      />
                    ))}
                    {dayPosts.length > 3 && (
                      <span className="text-xs text-gray-400">+{dayPosts.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
              <ScrollArea className="h-[calc(100%-28px)]">
                <div className="space-y-1">
                  {dayPosts.slice(0, viewMode === "week" ? 10 : 3).map((post) => (
                    <button
                      key={post.id}
                      onClick={() => onPostClick(post)}
                      className="w-full text-left p-1.5 rounded-lg text-xs transition-all hover:scale-[1.02] hover:shadow-md"
                      style={{
                        backgroundColor: `${getPageColor(post.pageId)}15`,
                        borderLeft: `3px solid ${getPageColor(post.pageId)}`,
                      }}
                      data-testid={`calendar-post-${post.id}`}
                    >
                      <div className="flex items-center gap-1">
                        {post.status === "posted" && (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        )}
                        {post.status === "failed" && (
                          <XCircle className="w-3 h-3 text-red-500" />
                        )}
                        {post.status === "scheduled" && (
                          <Clock className="w-3 h-3 text-amber-500" />
                        )}
                        <span className="truncate font-medium">
                          {format(post.scheduledAt, "HH:mm")}
                        </span>
                      </div>
                      <p className="truncate text-gray-600 mt-0.5">
                        {post.vehicleName.split(" ").slice(1, 3).join(" ")}
                      </p>
                    </button>
                  ))}
                  {dayPosts.length > (viewMode === "week" ? 10 : 3) && (
                    <p className="text-xs text-gray-400 text-center">
                      +{dayPosts.length - (viewMode === "week" ? 10 : 3)} more
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostPreviewDrawer({
  post,
  page,
  open,
  onClose,
}: {
  post: ScheduledPost | null;
  page: PageSettings | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!post || !page) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="post-preview-drawer">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <Facebook className="w-5 h-5 text-[#1877f2]" />
            Post Preview
          </SheetTitle>
          <SheetDescription>
            {post.status === "scheduled" && `Scheduled for ${format(post.scheduledAt, "PPp")}`}
            {post.status === "posted" && `Posted on ${format(post.scheduledAt, "PPp")}`}
            {post.status === "failed" && `Failed at ${format(post.scheduledAt, "PPp")}`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border shadow-lg overflow-hidden">
            <div className="p-4 flex items-center gap-3 border-b">
              <Avatar className="w-10 h-10">
                <AvatarFallback
                  className="text-white font-bold text-xs"
                  style={{ backgroundColor: page.color }}
                >
                  {page.avatar}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-gray-900">{page.name}</p>
                <p className="text-xs text-gray-500">
                  {format(post.scheduledAt, "MMM d")} at {format(post.scheduledAt, "h:mm a")} · 🌐
                </p>
              </div>
            </div>

            <div className="p-4">
              <p className="text-gray-900 mb-3">{post.description}</p>
            </div>

            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={post.vehicleImage}
                alt={post.vehicleName}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <p className="text-white font-bold text-lg">{post.title}</p>
                <p className="text-white/80 text-sm">
                  ${post.vehiclePrice.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="p-4 border-t flex items-center justify-between text-gray-500">
              <button className="flex items-center gap-2 hover:text-[#1877f2] transition-colors">
                <ThumbsUp className="w-5 h-5" />
                <span className="text-sm font-medium">Like</span>
              </button>
              <button className="flex items-center gap-2 hover:text-[#1877f2] transition-colors">
                <MessageCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Comment</span>
              </button>
              <button className="flex items-center gap-2 hover:text-[#1877f2] transition-colors">
                <Share2 className="w-5 h-5" />
                <span className="text-sm font-medium">Share</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Status</span>
              <Badge
                className={
                  post.status === "posted"
                    ? "bg-emerald-100 text-emerald-700"
                    : post.status === "failed"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }
              >
                {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Template</span>
              <span className="text-sm font-medium text-gray-900">{post.template}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Page</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: page.color }}
                />
                <span className="text-sm font-medium text-gray-900">{page.name}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              data-testid="post-action-edit"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              data-testid="post-action-reschedule"
            >
              <CalendarCheck className="w-4 h-4 mr-2" />
              Reschedule
            </Button>
            <Button
              variant="outline"
              className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              data-testid="post-action-cancel"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function SalesAutoPosting() {
  const [selectedPage, setSelectedPage] = useState<PageSettings | null>(MOCK_PAGES[0]);
  const [pageSettings, setPageSettings] = useState<Record<string, PageSettings>>(
    Object.fromEntries(MOCK_PAGES.map((p) => [p.id, p]))
  );
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pageFilter, setPageFilter] = useState<string | null>(null);

  const [posts] = useState<ScheduledPost[]>(() => generateMockPosts());

  const stats = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const todayEnd = new Date(today.setHours(23, 59, 59, 999));

    const postsToday = posts.filter(
      (p) => p.scheduledAt >= todayStart && p.scheduledAt <= todayEnd
    );
    const postedPosts = posts.filter((p) => p.status === "posted");
    const failedPosts = posts.filter((p) => p.status === "failed");
    const successRate =
      postedPosts.length + failedPosts.length > 0
        ? Math.round((postedPosts.length / (postedPosts.length + failedPosts.length)) * 100)
        : 100;
    const activePages = MOCK_PAGES.filter((p) => p.autoPostingEnabled).length;

    return {
      totalScheduled: posts.filter((p) => p.status === "scheduled").length,
      postsToday: postsToday.length,
      successRate,
      activePages,
    };
  }, [posts]);

  const getPostsCountForPage = (pageId: string) => {
    return posts.filter((p) => p.pageId === pageId).length;
  };

  const handlePostClick = (post: ScheduledPost) => {
    setSelectedPost(post);
    setDrawerOpen(true);
  };

  const updatePageSetting = <K extends keyof PageSettings>(
    pageId: string,
    key: K,
    value: PageSettings[K]
  ) => {
    setPageSettings((prev) => ({
      ...prev,
      [pageId]: { ...prev[pageId], [key]: value },
    }));
    if (selectedPage?.id === pageId) {
      setSelectedPage((prev) => (prev ? { ...prev, [key]: value } : null));
    }
  };

  const handleFrequencyChange = (pageId: string, preset: FrequencyPreset) => {
    updatePageSetting(pageId, "frequencyPreset", preset);
    updatePageSetting(pageId, "postsPerDay", FREQUENCY_PRESETS[preset].postsPerDay);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Simple header with back navigation */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 max-w-[1600px] flex items-center justify-between">
          <Link href="/sales" className="flex items-center gap-2 text-[#022d60] hover:text-[#00aad2] transition-colors">
            <ChevronLeft className="w-5 h-5" />
            <span className="font-medium">Back to Dashboard</span>
          </Link>
          <div className="flex items-center gap-2">
            <Facebook className="w-6 h-6 text-[#022d60]" />
            <span className="font-bold text-[#022d60]">Auto-Posting</span>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8 max-w-[1600px]">
        <div className="mb-8">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/sales" data-testid="breadcrumb-sales">
                  Sales Dashboard
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Auto-Posting Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          
          <div className="mt-4 flex items-center justify-between">
            <div>
              <h1
                className="text-4xl font-bold bg-gradient-to-r from-[#022d60] to-[#00aad2] bg-clip-text text-transparent"
                data-testid="page-title"
              >
                Auto-Posting Dashboard
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your Facebook auto-posting schedule and settings
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KPICard
            title="Total Scheduled"
            value={stats.totalScheduled}
            icon={CalendarClock}
            trend="+12% this week"
            color="#022d60"
          />
          <KPICard
            title="Posts Today"
            value={stats.postsToday}
            icon={CalendarDays}
            color="#00aad2"
          />
          <KPICard
            title="Success Rate"
            value={`${stats.successRate}%`}
            icon={Activity}
            trend="2% improvement"
            color="#10b981"
          />
          <KPICard
            title="Active Pages"
            value={stats.activePages}
            icon={Zap}
            color="#7c3aed"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
          <div className="space-y-4">
            <Card className="border-0 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden">
              <CardHeader className="pb-4 bg-gradient-to-r from-[#022d60]/5 to-[#00aad2]/5">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Facebook className="w-5 h-5 text-[#1877f2]" />
                  Connected Pages
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-2">
                  {MOCK_PAGES.map((page) => (
                    <PageListItem
                      key={page.id}
                      page={pageSettings[page.id] || page}
                      isSelected={selectedPage?.id === page.id}
                      onClick={() => setSelectedPage(pageSettings[page.id] || page)}
                      postsCount={getPostsCountForPage(page.id)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            {selectedPage && (
              <Card className="border-0 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback
                        className="text-white font-bold"
                        style={{
                          background: `linear-gradient(135deg, ${selectedPage.color} 0%, ${selectedPage.color}cc 100%)`,
                        }}
                      >
                        {selectedPage.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-base">{selectedPage.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">Page Settings</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <Tabs defaultValue="settings" className="w-full">
                    <TabsList className="w-full grid grid-cols-2 mb-4">
                      <TabsTrigger value="settings" data-testid="tab-settings">
                        <Settings2 className="w-4 h-4 mr-1" />
                        Settings
                      </TabsTrigger>
                      <TabsTrigger value="templates" data-testid="tab-templates">
                        <FileText className="w-4 h-4 mr-1" />
                        Templates
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="settings" className="space-y-6">
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold">Posting Frequency</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {(Object.entries(FREQUENCY_PRESETS) as [FrequencyPreset, typeof FREQUENCY_PRESETS.aggressive][]).map(
                            ([key, preset]) => (
                              <button
                                key={key}
                                onClick={() => handleFrequencyChange(selectedPage.id, key)}
                                className={`p-3 rounded-xl border-2 transition-all text-center ${
                                  pageSettings[selectedPage.id]?.frequencyPreset === key
                                    ? "border-[#00aad2] bg-[#00aad2]/10"
                                    : "border-gray-200 hover:border-gray-300"
                                }`}
                                data-testid={`frequency-${key}`}
                              >
                                <p className="font-semibold text-sm">{preset.label}</p>
                                <p className="text-xs text-muted-foreground">{preset.description}</p>
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold">Posts per Day</Label>
                          <Badge variant="secondary">
                            {pageSettings[selectedPage.id]?.postsPerDay || selectedPage.postsPerDay}
                          </Badge>
                        </div>
                        <Slider
                          value={[pageSettings[selectedPage.id]?.postsPerDay || selectedPage.postsPerDay]}
                          onValueChange={([value]) =>
                            updatePageSetting(selectedPage.id, "postsPerDay", value)
                          }
                          max={12}
                          min={1}
                          step={1}
                          className="w-full"
                          data-testid="slider-posts-per-day"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>1</span>
                          <span>6</span>
                          <span>12</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Start Time</Label>
                          <Select
                            value={pageSettings[selectedPage.id]?.startTime || selectedPage.startTime}
                            onValueChange={(value) =>
                              updatePageSetting(selectedPage.id, "startTime", value)
                            }
                          >
                            <SelectTrigger data-testid="select-start-time">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, i) => (
                                <SelectItem
                                  key={i}
                                  value={`${i.toString().padStart(2, "0")}:00`}
                                >
                                  {`${i.toString().padStart(2, "0")}:00`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">End Time</Label>
                          <Select
                            value={pageSettings[selectedPage.id]?.endTime || selectedPage.endTime}
                            onValueChange={(value) =>
                              updatePageSetting(selectedPage.id, "endTime", value)
                            }
                          >
                            <SelectTrigger data-testid="select-end-time">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, i) => (
                                <SelectItem
                                  key={i}
                                  value={`${i.toString().padStart(2, "0")}:00`}
                                >
                                  {`${i.toString().padStart(2, "0")}:00`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-semibold">Active Days</Label>
                        <div className="flex flex-wrap gap-2">
                          {DAYS_OF_WEEK.map((day) => {
                            const isActive = (
                              pageSettings[selectedPage.id]?.activeDays ||
                              selectedPage.activeDays
                            ).includes(day);
                            return (
                              <button
                                key={day}
                                onClick={() => {
                                  const currentDays =
                                    pageSettings[selectedPage.id]?.activeDays ||
                                    selectedPage.activeDays;
                                  const newDays = isActive
                                    ? currentDays.filter((d) => d !== day)
                                    : [...currentDays, day];
                                  updatePageSetting(selectedPage.id, "activeDays", newDays);
                                }}
                                className={`w-10 h-10 rounded-full font-medium text-sm transition-all ${
                                  isActive
                                    ? "bg-[#00aad2] text-white shadow-md"
                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                }`}
                                data-testid={`day-toggle-${day.toLowerCase()}`}
                              >
                                {day.charAt(0)}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#022d60]/5 to-[#00aad2]/5 rounded-xl">
                        <div>
                          <Label className="text-sm font-semibold">Auto-Posting</Label>
                          <p className="text-xs text-muted-foreground">
                            Automatically post at scheduled times
                          </p>
                        </div>
                        <Switch
                          checked={
                            pageSettings[selectedPage.id]?.autoPostingEnabled ??
                            selectedPage.autoPostingEnabled
                          }
                          onCheckedChange={(checked) =>
                            updatePageSetting(selectedPage.id, "autoPostingEnabled", checked)
                          }
                          data-testid="switch-auto-posting"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Default Template</Label>
                        <Select
                          value={
                            pageSettings[selectedPage.id]?.defaultTemplate ||
                            selectedPage.defaultTemplate
                          }
                          onValueChange={(value) =>
                            updatePageSetting(selectedPage.id, "defaultTemplate", value)
                          }
                        >
                          <SelectTrigger data-testid="select-default-template">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MOCK_TEMPLATES.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TabsContent>

                    <TabsContent value="templates" className="space-y-4">
                      {MOCK_TEMPLATES.map((template) => (
                        <div
                          key={template.id}
                          className="p-4 border rounded-xl hover:shadow-md transition-shadow"
                          data-testid={`template-item-${template.id}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold">{template.name}</h4>
                            {pageSettings[selectedPage.id]?.defaultTemplate === template.id && (
                              <Badge className="bg-emerald-100 text-emerald-700">Default</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-1">
                            <strong>Title:</strong> {template.titleTemplate}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Body:</strong> {template.descriptionTemplate}
                          </p>
                        </div>
                      ))}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="border-0 bg-white/80 backdrop-blur-xl shadow-lg overflow-hidden">
            <CardHeader className="pb-4 bg-gradient-to-r from-[#022d60]/5 to-[#00aad2]/5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#00aad2]" />
                  Posting Calendar
                </CardTitle>
                <Select
                  value={pageFilter || "all"}
                  onValueChange={(value) => setPageFilter(value === "all" ? null : value)}
                >
                  <SelectTrigger className="w-[200px]" data-testid="calendar-page-filter">
                    <SelectValue placeholder="Filter by page" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Pages</SelectItem>
                    {MOCK_PAGES.map((page) => (
                      <SelectItem key={page.id} value={page.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: page.color }}
                          />
                          {page.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <CalendarView
                posts={posts}
                pages={MOCK_PAGES}
                onPostClick={handlePostClick}
                selectedPageFilter={pageFilter}
              />
            </CardContent>
          </Card>
        </div>

        <PostPreviewDrawer
          post={selectedPost}
          page={selectedPost ? MOCK_PAGES.find((p) => p.id === selectedPost.pageId) || null : null}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      </main>
    </div>
  );
}
