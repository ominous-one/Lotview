import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  Search,
  MoreVertical,
  Trash2,
  Eye,
  Loader2,
  FileText,
  ChevronRight,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Users,
  Ban,
  BadgeDollarSign,
  Package,
  HelpCircle,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type Appraisal = {
  id: number;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage?: number;
  status: string;
  averageMarketPrice?: number;
  suggestedBuyPrice?: number;
  quotedPrice?: number;
  actualSalePrice?: number;
  missedReason?: string;
  missedNotes?: string;
  tradeinValue?: number;
  wholesaleValue?: number;
  retailValue?: number;
  createdAt: string;
  createdBy?: number;
};

type AppraisalsResponse = {
  appraisals: Appraisal[];
  total: number;
  limit: number;
  offset: number;
};

type MissedTradesStats = {
  totalMissed: number;
  totalLostValue: number;
  byReason: { reason: string; count: number; totalValue: number }[];
  recentMissed: {
    id: number;
    vin: string;
    year: number;
    make: string;
    model: string;
    quotedPrice: number;
    missedReason: string;
    missedNotes: string | null;
    createdAt: string;
  }[];
};

type AccuracyReport = {
  totalPurchased: number;
  averageVariance: number;
  overPaidCount: number;
  underPaidCount: number;
  exactCount: number;
  totalOverpaid: number;
  totalUnderpaid: number;
  monthlyTrend: { month: string; avgVariance: number; count: number }[];
  recentPurchases: {
    id: number;
    vin: string;
    year: number;
    make: string;
    model: string;
    quotedPrice: number;
    actualSalePrice: number;
    variance: number;
    createdAt: string;
  }[];
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  quoted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  purchased: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  passed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "quoted", label: "Quoted" },
  { value: "purchased", label: "Purchased" },
  { value: "passed", label: "Passed" },
];

const MISSED_REASON_OPTIONS = [
  { value: "lost_to_competitor", label: "Lost to Competitor" },
  { value: "customer_declined", label: "Customer Declined" },
  { value: "price_too_high", label: "Price Too High" },
  { value: "wholesaled", label: "Sent to Wholesale" },
  { value: "other", label: "Other" },
];

const REASON_LABELS: Record<string, string> = {
  lost_to_competitor: "Lost to Competitor",
  customer_declined: "Customer Declined",
  price_too_high: "Price Too High",
  wholesaled: "Sent to Wholesale",
  other: "Other",
};

const REASON_ICONS: Record<string, React.ReactNode> = {
  lost_to_competitor: <Users className="w-5 h-5 text-orange-500" />,
  customer_declined: <Ban className="w-5 h-5 text-red-500" />,
  price_too_high: <BadgeDollarSign className="w-5 h-5 text-amber-500" />,
  wholesaled: <Package className="w-5 h-5 text-blue-500" />,
  other: <HelpCircle className="w-5 h-5 text-gray-500" />,
};

export default function SavedAppraisals() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [activeTab, setActiveTab] = useState("appraisals");
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [passedDialogOpen, setPassedDialogOpen] = useState(false);
  const [selectedAppraisal, setSelectedAppraisal] = useState<Appraisal | null>(null);
  const [actualSalePrice, setActualSalePrice] = useState("");
  const [priceError, setPriceError] = useState("");
  const [missedReason, setMissedReason] = useState("customer_declined");
  const [missedNotes, setMissedNotes] = useState("");
  const limit = 20;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<AppraisalsResponse>({
    queryKey: ["appraisals", search, status, page],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const params = new URLSearchParams();
      params.append("limit", limit.toString());
      params.append("offset", (page * limit).toString());
      if (search) params.append("search", search);
      if (status && status !== "all") params.append("status", status);

      const res = await fetch(`/api/manager/appraisals?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch appraisals");
      return res.json();
    },
  });

  type StatsResponse = {
    purchased: number;
    passed: number;
    lookToBookRatio: string;
    totalQuoted: number;
    totalActual: number;
    accuracyVariance: number;
  };

  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ["appraisal-stats"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/manager/appraisals/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: missedStats, isLoading: missedStatsLoading } = useQuery<MissedTradesStats>({
    queryKey: ["missed-trades-stats"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/manager/appraisals/missed-stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch missed trades stats");
      return res.json();
    },
    enabled: activeTab === "missed-trades",
  });

  const { data: accuracyReport, isLoading: accuracyLoading } = useQuery<AccuracyReport>({
    queryKey: ["accuracy-report"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/manager/appraisals/accuracy-report", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch accuracy report");
      return res.json();
    },
    enabled: activeTab === "accuracy",
  });

  const updateAppraisalMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Record<string, any> }) => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/manager/appraisals/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update appraisal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appraisals"] });
      queryClient.invalidateQueries({ queryKey: ["appraisal-stats"] });
      queryClient.invalidateQueries({ queryKey: ["missed-trades-stats"] });
      toast({ title: "Appraisal updated" });
    },
    onError: () => {
      toast({ title: "Failed to update appraisal", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/manager/appraisals/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete appraisal");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appraisals"] });
      queryClient.invalidateQueries({ queryKey: ["missed-trades-stats"] });
      toast({ title: "Appraisal deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete appraisal", variant: "destructive" });
    },
  });

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this appraisal?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleStatusChange = (appraisal: Appraisal, newStatus: string) => {
    if (newStatus === "purchased") {
      setSelectedAppraisal(appraisal);
      setActualSalePrice(appraisal.quotedPrice ? (appraisal.quotedPrice / 100).toString() : "");
      setPriceError("");
      setPurchaseDialogOpen(true);
    } else if (newStatus === "passed") {
      setSelectedAppraisal(appraisal);
      setMissedReason("customer_declined");
      setMissedNotes("");
      setPassedDialogOpen(true);
    } else {
      updateAppraisalMutation.mutate({ id: appraisal.id, updates: { status: newStatus } });
    }
  };

  const handleConfirmPurchase = () => {
    if (!selectedAppraisal) return;
    
    const priceValue = parseFloat(actualSalePrice);
    if (!actualSalePrice.trim() || isNaN(priceValue) || priceValue <= 0) {
      setPriceError("Please enter a valid price greater than $0");
      return;
    }
    
    setPriceError("");
    const priceInCents = Math.round(priceValue * 100);
    updateAppraisalMutation.mutate({
      id: selectedAppraisal.id,
      updates: {
        status: "purchased",
        actualSalePrice: priceInCents,
      },
    });
    setPurchaseDialogOpen(false);
    setSelectedAppraisal(null);
  };

  const handleConfirmPassed = () => {
    if (!selectedAppraisal) return;
    updateAppraisalMutation.mutate({
      id: selectedAppraisal.id,
      updates: {
        status: "passed",
        missedReason,
        missedNotes,
      },
    });
    setPassedDialogOpen(false);
    setSelectedAppraisal(null);
  };

  const appraisals = data?.appraisals || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const lookToBookRatio = stats?.lookToBookRatio || "0";
  const purchasedCount = stats?.purchased || 0;
  const passedCount = stats?.passed || 0;
  const totalActual = stats?.totalActual || 0;
  const accuracyVariance = stats?.accuracyVariance || 0;

  const formatPrice = (price?: number) => {
    if (!price) return "-";
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price / 100);
  };

  const formatPriceDollars = (price: number) => {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/manager">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#022d60] to-[#00aad2] flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                    Saved Appraisals
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Track and manage vehicle appraisals
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Look-to-Book Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card data-testid="card-look-to-book">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Look-to-Book Ratio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {lookToBookRatio}%
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {purchasedCount} purchased / {purchasedCount + passedCount} decided
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-purchased">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Purchased
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {purchasedCount}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {formatPrice(totalActual)} total
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-passed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                Passed/Missed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {passedCount}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Missed opportunities
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-accuracy">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Pricing Accuracy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${accuracyVariance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {accuracyVariance >= 0 ? '+' : ''}{accuracyVariance.toFixed(1)}%
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Actual vs quoted variance
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList data-testid="tabs-appraisals">
            <TabsTrigger value="appraisals" data-testid="tab-appraisals">
              All Appraisals
            </TabsTrigger>
            <TabsTrigger value="missed-trades" data-testid="tab-missed-trades">
              Missed Trades
              {passedCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {passedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="accuracy" data-testid="tab-accuracy">
              Accuracy Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appraisals">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search by VIN, make, model..."
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                      }}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>
                  <Select
                    value={status}
                    onValueChange={(value) => {
                      setStatus(value);
                      setPage(0);
                    }}
                  >
                    <SelectTrigger className="w-[180px]" data-testid="select-status">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
              ) : error ? (
                <div className="text-center py-12 text-red-500">
                  Failed to load appraisals
                </div>
              ) : appraisals.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No appraisals found</p>
                  <p className="text-sm mt-1">Run a VIN decode or market analysis to create appraisals</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>VIN</TableHead>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>Mileage</TableHead>
                          <TableHead>Avg Market Price</TableHead>
                          <TableHead>Buy Price</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {appraisals.map((appraisal) => (
                          <TableRow
                            key={appraisal.id}
                            className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                            data-testid={`row-appraisal-${appraisal.id}`}
                          >
                            <TableCell className="font-mono text-sm">
                              {appraisal.vin}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {appraisal.year} {appraisal.make} {appraisal.model}
                              </div>
                              {appraisal.trim && (
                                <div className="text-sm text-slate-500">{appraisal.trim}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              {appraisal.mileage
                                ? `${appraisal.mileage.toLocaleString()} km`
                                : "-"}
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatPrice(appraisal.averageMarketPrice)}
                            </TableCell>
                            <TableCell className="font-medium text-green-600 dark:text-green-400">
                              {formatPrice(appraisal.suggestedBuyPrice)}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={appraisal.status}
                                onValueChange={(value) => handleStatusChange(appraisal, value)}
                              >
                                <SelectTrigger
                                  className="w-[120px] h-8"
                                  data-testid={`select-status-${appraisal.id}`}
                                >
                                  <Badge
                                    className={`${STATUS_COLORS[appraisal.status] || STATUS_COLORS.draft} border-0`}
                                  >
                                    {appraisal.status.charAt(0).toUpperCase() +
                                      appraisal.status.slice(1)}
                                  </Badge>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="draft">Draft</SelectItem>
                                  <SelectItem value="quoted">Quoted</SelectItem>
                                  <SelectItem value="purchased">Purchased</SelectItem>
                                  <SelectItem value="passed">Passed</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">
                              {format(new Date(appraisal.createdAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    data-testid={`button-actions-${appraisal.id}`}
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      window.location.href = `/manager?vin=${appraisal.vin}`;
                                    }}
                                    data-testid={`action-view-${appraisal.id}`}
                                  >
                                    <Eye className="w-4 h-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(appraisal.id)}
                                    className="text-red-600"
                                    data-testid={`action-delete-${appraisal.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
                      <div className="text-sm text-slate-500">
                        Showing {page * limit + 1} to{" "}
                        {Math.min((page + 1) * limit, total)} of {total} appraisals
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(0, p - 1))}
                          disabled={page === 0}
                          data-testid="button-prev-page"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          Page {page + 1} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={page >= totalPages - 1}
                          data-testid="button-next-page"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="missed-trades">
            {missedStatsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : !missedStats || missedStats.totalMissed === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
                <XCircle className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                  No Missed Trades Yet
                </h3>
                <p className="text-slate-500 dark:text-slate-400">
                  When trades are marked as "Passed", they'll appear here for analysis
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card data-testid="card-total-missed">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-500" />
                        Total Missed Trades
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                        {missedStats.totalMissed}
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-lost-value">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-red-500" />
                        Total Lost Value
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                        {formatPrice(missedStats.totalLostValue)}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Based on quoted prices
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-top-reason">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        Top Reason
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {missedStats.byReason.length > 0 ? (
                        <>
                          <div className="text-lg font-bold text-slate-900 dark:text-white">
                            {REASON_LABELS[missedStats.byReason[0].reason] || missedStats.byReason[0].reason}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {missedStats.byReason[0].count} trades ({((missedStats.byReason[0].count / missedStats.totalMissed) * 100).toFixed(0)}%)
                          </p>
                        </>
                      ) : (
                        <div className="text-slate-400">-</div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Breakdown by Reason */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                    Breakdown by Reason
                  </h3>
                  <div className="space-y-4">
                    {missedStats.byReason.map((reason) => {
                      const percentage = (reason.count / missedStats.totalMissed) * 100;
                      return (
                        <div key={reason.reason} data-testid={`reason-row-${reason.reason}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              {REASON_ICONS[reason.reason] || REASON_ICONS.other}
                              <span className="font-medium text-slate-900 dark:text-white">
                                {REASON_LABELS[reason.reason] || reason.reason}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {reason.count}
                              </span>
                              <span className="text-slate-500 ml-2">
                                ({percentage.toFixed(0)}%)
                              </span>
                              <span className="text-red-500 ml-4">
                                {formatPrice(reason.totalValue)}
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-red-500 h-2 rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recent Missed Trades */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Recent Missed Trades
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>VIN</TableHead>
                          <TableHead>Quoted Price</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {missedStats.recentMissed.map((trade) => (
                          <TableRow key={trade.id} data-testid={`row-missed-${trade.id}`}>
                            <TableCell className="font-medium">
                              {trade.year} {trade.make} {trade.model}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {trade.vin}
                            </TableCell>
                            <TableCell className="font-medium text-red-600 dark:text-red-400">
                              {formatPrice(trade.quotedPrice)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {REASON_ICONS[trade.missedReason] || REASON_ICONS.other}
                                <span>{REASON_LABELS[trade.missedReason] || trade.missedReason}</span>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-slate-500">
                              {trade.missedNotes || "-"}
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">
                              {format(new Date(trade.createdAt), "MMM d, yyyy")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="accuracy" data-testid="content-accuracy">
            {accuracyLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : !accuracyReport ? (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No accuracy data available</p>
                <p className="text-sm mt-1">
                  Purchase vehicles to see accuracy metrics
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card data-testid="card-total-purchased">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        Total Purchased
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-slate-900 dark:text-white">
                        {accuracyReport.totalPurchased}
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-avg-variance">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        Avg Variance
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={`text-3xl font-bold ${accuracyReport.averageVariance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {accuracyReport.averageVariance >= 0 ? '+' : ''}{accuracyReport.averageVariance.toFixed(1)}%
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Actual vs quoted
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-overpaid">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-red-500" />
                        Overpaid
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                        {accuracyReport.overPaidCount}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {formatPrice(accuracyReport.totalOverpaid)} total
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-underpaid">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-green-500" />
                        Underpaid
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {accuracyReport.underPaidCount}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {formatPrice(accuracyReport.totalUnderpaid)} saved
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Monthly Trend Chart */}
                {accuracyReport.monthlyTrend.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                      Monthly Variance Trend
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={accuracyReport.monthlyTrend}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                          <XAxis 
                            dataKey="month" 
                            tick={{ fill: 'currentColor' }}
                            tickFormatter={(value) => {
                              const [year, month] = value.split('-');
                              const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                              return months[parseInt(month) - 1] || value;
                            }}
                          />
                          <YAxis 
                            tick={{ fill: 'currentColor' }}
                            tickFormatter={(value) => `${value.toFixed(0)}%`}
                          />
                          <Tooltip 
                            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Variance']}
                            labelFormatter={(label) => {
                              const [year, month] = label.split('-');
                              const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                              return `${months[parseInt(month) - 1]} ${year}`;
                            }}
                          />
                          <Bar dataKey="avgVariance" name="Avg Variance">
                            {accuracyReport.monthlyTrend.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={entry.avgVariance >= 0 ? '#22c55e' : '#ef4444'} 
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Recent Purchases Table */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Recent Purchases
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>VIN</TableHead>
                          <TableHead>Quoted</TableHead>
                          <TableHead>Actual</TableHead>
                          <TableHead>Variance</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accuracyReport.recentPurchases.map((purchase) => (
                          <TableRow key={purchase.id} data-testid={`row-purchase-${purchase.id}`}>
                            <TableCell className="font-medium">
                              {purchase.year} {purchase.make} {purchase.model}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {purchase.vin}
                            </TableCell>
                            <TableCell>
                              {formatPrice(purchase.quotedPrice)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatPrice(purchase.actualSalePrice)}
                            </TableCell>
                            <TableCell>
                              <span className={`font-medium ${purchase.variance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {purchase.variance >= 0 ? '+' : ''}{purchase.variance.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">
                              {format(new Date(purchase.createdAt), "MMM d, yyyy")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Purchase Confirmation Dialog */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent data-testid="dialog-purchase">
          <DialogHeader>
            <DialogTitle>Confirm Purchase</DialogTitle>
          </DialogHeader>
          {selectedAppraisal && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <p className="font-medium">
                  {selectedAppraisal.year} {selectedAppraisal.make} {selectedAppraisal.model}
                </p>
                <p className="text-sm text-slate-500">{selectedAppraisal.vin}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Quoted Price:</span>
                  <p className="font-medium">{formatPrice(selectedAppraisal.quotedPrice)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Suggested Buy:</span>
                  <p className="font-medium text-green-600">{formatPrice(selectedAppraisal.suggestedBuyPrice)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="actualSalePrice">Actual Purchase Price</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="actualSalePrice"
                    type="number"
                    placeholder="Enter actual price paid"
                    value={actualSalePrice}
                    onChange={(e) => {
                      setActualSalePrice(e.target.value);
                      if (priceError) setPriceError("");
                    }}
                    className={`pl-10 ${priceError ? 'border-red-500' : ''}`}
                    data-testid="input-actual-price"
                  />
                </div>
                {priceError && (
                  <p className="text-sm text-red-500 flex items-center gap-1" data-testid="text-price-error">
                    <AlertCircle className="w-4 h-4" />
                    {priceError}
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseDialogOpen(false)} data-testid="button-cancel-purchase">
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmPurchase} 
              disabled={!actualSalePrice}
              data-testid="button-confirm-purchase"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Confirm Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Passed/Missed Confirmation Dialog */}
      <Dialog open={passedDialogOpen} onOpenChange={setPassedDialogOpen}>
        <DialogContent data-testid="dialog-passed">
          <DialogHeader>
            <DialogTitle>Record Missed Trade</DialogTitle>
          </DialogHeader>
          {selectedAppraisal && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <p className="font-medium">
                  {selectedAppraisal.year} {selectedAppraisal.make} {selectedAppraisal.model}
                </p>
                <p className="text-sm text-slate-500">{selectedAppraisal.vin}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="missedReason">Reason for Missing</Label>
                <Select value={missedReason} onValueChange={setMissedReason}>
                  <SelectTrigger data-testid="select-missed-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MISSED_REASON_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="missedNotes">Additional Notes (Optional)</Label>
                <Textarea
                  id="missedNotes"
                  placeholder="Enter any additional details..."
                  value={missedNotes}
                  onChange={(e) => setMissedNotes(e.target.value)}
                  rows={3}
                  data-testid="textarea-missed-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPassedDialogOpen(false)} data-testid="button-cancel-passed">
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmPassed}
              variant="destructive"
              data-testid="button-confirm-passed"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Mark as Missed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
