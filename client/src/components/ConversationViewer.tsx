import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, User, Bot, Phone, Car, Clock, ChevronLeft, ChevronRight, RefreshCw, ExternalLink } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: number;
  dealershipId: number;
  category: string;
  vehicleId: number | null;
  vehicleName: string | null;
  messages: Message[];
  sessionId: string;
  handoffRequested: boolean;
  handoffPhone: string | null;
  handoffSent: boolean;
  handoffSentAt: string | null;
  createdAt: string;
}

interface PaginatedResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ConversationViewerProps {
  dealershipId: number;
  dealershipName: string;
}

export function ConversationViewer({ dealershipId, dealershipName }: ConversationViewerProps) {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, refetch, isFetching } = useQuery<PaginatedResponse>({
    queryKey: [`/api/conversations`, dealershipId, categoryFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", limit.toString());
      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/conversations?${params.toString()}`, {
        credentials: "include",
        headers: {
          "Authorization": token ? `Bearer ${token}` : "",
          "x-dealership-id": dealershipId.toString()
        }
      });
      if (!response.ok) throw new Error("Failed to fetch conversations");
      return response.json();
    },
    refetchInterval: 30000,
  });

  const conversations = data?.conversations || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      "test-drive": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      "reserve": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      "get-approved": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
      "value-trade": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
      "general": "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
    };
    return colors[category] || colors["general"];
  };

  const formatCategory = (category: string) => {
    return category.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{dealershipName} Conversations</h3>
          <p className="text-sm text-muted-foreground">
            {total} total conversation{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setPage(1); }}>
            <SelectTrigger className="w-[160px]" data-testid="filter-category">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="test-drive">Test Drive</SelectItem>
              <SelectItem value="reserve">Reserve</SelectItem>
              <SelectItem value="get-approved">Get Approved</SelectItem>
              <SelectItem value="value-trade">Value Trade</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-conversations"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading conversations...</div>
      ) : conversations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No conversations found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.map((conv) => (
                  <TableRow key={conv.id} data-testid={`conversation-row-${conv.id}`}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {formatDistanceToNow(new Date(conv.createdAt), { addSuffix: true })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getCategoryBadge(conv.category)}>
                        {formatCategory(conv.category)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {conv.vehicleName ? (
                        <div className="flex items-center gap-1">
                          <Car className="h-4 w-4 text-muted-foreground" />
                          <span className="max-w-[200px] truncate">{conv.vehicleName}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{conv.messages.length}</span>
                      <span className="text-muted-foreground"> messages</span>
                    </TableCell>
                    <TableCell>
                      {conv.handoffSent ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                          <Phone className="h-3 w-3 mr-1" />
                          Handed Off
                        </Badge>
                      ) : conv.handoffRequested ? (
                        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
                          <Phone className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setSelectedConversation(conv)}
                        data-testid={`button-view-conversation-${conv.id}`}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedConversation} onOpenChange={() => setSelectedConversation(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversation Details
            </DialogTitle>
          </DialogHeader>
          {selectedConversation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type:</span>{" "}
                  <Badge variant="outline" className={getCategoryBadge(selectedConversation.category)}>
                    {formatCategory(selectedConversation.category)}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>{" "}
                  {format(new Date(selectedConversation.createdAt), "PPpp")}
                </div>
                {selectedConversation.vehicleName && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Vehicle:</span>{" "}
                    <span className="font-medium">{selectedConversation.vehicleName}</span>
                  </div>
                )}
                {selectedConversation.handoffPhone && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Customer Phone:</span>{" "}
                    <span className="font-medium">{selectedConversation.handoffPhone}</span>
                    {selectedConversation.handoffSent && (
                      <Badge className="ml-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                        Sent to CRM
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              <ScrollArea className="h-[400px] rounded-md border p-4">
                <div className="space-y-4">
                  {selectedConversation.messages.map((msg, idx) => (
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
                </div>
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ConversationViewer;
