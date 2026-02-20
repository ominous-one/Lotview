import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Search,
  Plus,
  MoreVertical,
  Mail,
  Phone,
  MessageSquare,
  Facebook,
  User,
  Users,
  Tag,
  Clock,
  Send,
  Sparkles,
  Edit2,
  Trash2,
  Filter,
  X,
  Loader2,
  Calendar,
  ArrowUpDown,
  UserCheck,
  MapPin,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type Contact = {
  id: number;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status: string;
  leadSource?: string;
  ownerId?: number;
  ownerName?: string;
  lastContactedAt?: string;
  createdAt: string;
  city?: string;
  province?: string;
  leadScore?: number;
  tags?: { id: number; name: string; color: string }[];
};

type ContactDetail = Contact & {
  secondaryPhone?: string;
  address?: string;
  postalCode?: string;
  country?: string;
  facebookId?: string;
  facebookName?: string;
  notes?: string;
  preferredContactMethod?: string;
  optInEmail?: boolean;
  optInSms?: boolean;
  optInFacebook?: boolean;
  interestedVehicleIds?: string;
  preferredMake?: string;
  preferredModel?: string;
  tradeInVehicle?: string;
  tradeInValue?: number;
  totalMessagesReceived?: number;
  totalMessagesSent?: number;
};

type Activity = {
  id: number;
  activityType: string;
  direction?: string;
  subject?: string;
  content?: string;
  status?: string;
  createdAt: string;
  userName?: string;
};

type CrmTag = {
  id: number;
  name: string;
  color: string;
};

type SalesPerson = {
  id: number;
  name: string;
  role: string;
};

const STATUS_COLORS: Record<string, string> = {
  lead: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  prospect: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  customer: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  lost: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  inactive: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

const LEAD_SOURCES = [
  "website",
  "facebook",
  "walk-in",
  "referral",
  "phone",
  "trade-in",
  "autotrader",
  "kijiji",
  "cargurus",
  "other",
];

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  sms: <MessageSquare className="w-4 h-4" />,
  facebook: <Facebook className="w-4 h-4" />,
  note: <Edit2 className="w-4 h-4" />,
  meeting: <Calendar className="w-4 h-4" />,
  status_change: <ArrowUpDown className="w-4 h-4" />,
  vehicle_view: <User className="w-4 h-4" />,
};

function ContactFormDialog({
  open,
  onClose,
  contact,
  salespeople,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  contact?: ContactDetail | null;
  salespeople: SalesPerson[];
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    status: "lead",
    leadSource: "",
    ownerId: "",
    city: "",
    province: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (contact) {
      setFormData({
        firstName: contact.firstName || "",
        lastName: contact.lastName || "",
        email: contact.email || "",
        phone: contact.phone || "",
        status: contact.status || "lead",
        leadSource: contact.leadSource || "",
        ownerId: contact.ownerId?.toString() || "",
        city: contact.city || "",
        province: contact.province || "",
        notes: contact.notes || "",
      });
    } else {
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        status: "lead",
        leadSource: "",
        ownerId: "",
        city: "",
        province: "",
        notes: "",
      });
    }
  }, [contact, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem("auth_token");
      const url = contact ? `/api/crm/contacts/${contact.id}` : "/api/crm/contacts";
      const method = contact ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          ownerId: formData.ownerId ? parseInt(formData.ownerId) : null,
        }),
      });

      if (!response.ok) throw new Error("Failed to save contact");

      toast({
        title: contact ? "Contact updated" : "Contact created",
        description: `${formData.firstName} ${formData.lastName} has been ${contact ? "updated" : "created"}.`,
      });
      onSuccess();
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save contact. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit Contact" : "New Contact"}</DialogTitle>
          <DialogDescription>
            {contact ? "Update contact information" : "Add a new contact to your CRM"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                  data-testid="input-firstName"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  data-testid="input-lastName"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  data-testid="input-phone"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="leadSource">Lead Source</Label>
                <Select
                  value={formData.leadSource}
                  onValueChange={(value) => setFormData({ ...formData, leadSource: value })}
                >
                  <SelectTrigger data-testid="select-leadSource">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source.charAt(0).toUpperCase() + source.slice(1).replace("-", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerId">Assigned To</Label>
              <Select
                value={formData.ownerId}
                onValueChange={(value) => setFormData({ ...formData, ownerId: value })}
              >
                <SelectTrigger data-testid="select-ownerId">
                  <SelectValue placeholder="Select salesperson" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {salespeople.map((sp) => (
                    <SelectItem key={sp.id} value={sp.id.toString()}>
                      {sp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  data-testid="input-city"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="province">Province</Label>
                <Input
                  id="province"
                  value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                  data-testid="input-province"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                data-testid="textarea-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.firstName}
              className="bg-[#022d60] hover:bg-[#022d60]/90"
              data-testid="button-save-contact"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {contact ? "Update Contact" : "Create Contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MessageComposer({
  contact,
  onSend,
}: {
  contact: ContactDetail;
  onSend: (channel: string, content: string) => Promise<void>;
}) {
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!content.trim()) return;
    setIsSending(true);
    try {
      await onSend(channel, content);
      setContent("");
      setSubject("");
      toast({ title: "Message sent", description: `${channel} sent successfully` });
    } catch (error) {
      toast({ title: "Failed to send", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleSuggestMessage = async () => {
    setIsGenerating(true);
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/crm/contacts/${contact.id}/suggest-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ channel }),
      });
      if (!response.ok) throw new Error("Failed to generate");
      const data = await response.json();
      setContent(data.message || "");
      if (data.subject) setSubject(data.subject);
    } catch (error) {
      toast({
        title: "AI suggestion unavailable",
        description: "Could not generate a message suggestion at this time.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const channelDisabled = (ch: string) => {
    if (ch === "email" && !contact.email) return true;
    if (ch === "sms" && !contact.phone) return true;
    if (ch === "facebook" && !contact.facebookId) return true;
    return false;
  };

  return (
    <div className="border-t border-border bg-muted/30 p-4">
      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Send className="w-4 h-4 text-[#00aad2]" />
        Send Message
      </h4>
      <Tabs value={channel} onValueChange={setChannel}>
        <TabsList className="grid grid-cols-3 mb-3">
          <TabsTrigger
            value="email"
            disabled={channelDisabled("email")}
            data-testid="tab-email"
          >
            <Mail className="w-4 h-4 mr-1" />
            Email
          </TabsTrigger>
          <TabsTrigger
            value="sms"
            disabled={channelDisabled("sms")}
            data-testid="tab-sms"
          >
            <MessageSquare className="w-4 h-4 mr-1" />
            SMS
          </TabsTrigger>
          <TabsTrigger
            value="facebook"
            disabled={channelDisabled("facebook")}
            data-testid="tab-facebook"
          >
            <Facebook className="w-4 h-4 mr-1" />
            Facebook
          </TabsTrigger>
        </TabsList>

        {channel === "email" && (
          <Input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mb-2"
            data-testid="input-subject"
          />
        )}

        <Textarea
          placeholder={`Write your ${channel} message...`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          className="mb-3"
          data-testid="textarea-message"
        />

        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSuggestMessage}
            disabled={isGenerating}
            data-testid="button-suggest-message"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2 text-[#00aad2]" />
            )}
            Suggest Message
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || !content.trim()}
            className="bg-[#022d60] hover:bg-[#022d60]/90"
            data-testid="button-send-message"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send
          </Button>
        </div>
      </Tabs>
    </div>
  );
}

function ContactDetailPanel({
  contactId,
  onClose,
  isManager,
  salespeople,
  allTags,
  onRefresh,
}: {
  contactId: number;
  onClose: () => void;
  isManager: boolean;
  salespeople: SalesPerson[];
  allTags: CrmTag[];
  onRefresh: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contact, isLoading: contactLoading } = useQuery<ContactDetail>({
    queryKey: ["crm-contact", contactId],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/crm/contacts/${contactId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch contact");
      return res.json();
    },
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<Activity[]>({
    queryKey: ["crm-contact-activities", contactId],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/crm/contacts/${contactId}/activities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this contact?")) return;
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/crm/contacts/${contactId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Contact deleted" });
      onRefresh();
      onClose();
    } catch (error) {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    }
  };

  const handleAddTag = async (tagId: number) => {
    try {
      const token = localStorage.getItem("auth_token");
      await fetch(`/api/crm/contacts/${contactId}/tags/${tagId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      queryClient.invalidateQueries({ queryKey: ["crm-contact", contactId] });
      onRefresh();
    } catch (error) {
      toast({ title: "Failed to add tag", variant: "destructive" });
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    try {
      const token = localStorage.getItem("auth_token");
      await fetch(`/api/crm/contacts/${contactId}/tags/${tagId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      queryClient.invalidateQueries({ queryKey: ["crm-contact", contactId] });
      onRefresh();
    } catch (error) {
      toast({ title: "Failed to remove tag", variant: "destructive" });
    }
  };

  const handleSendMessage = async (channel: string, content: string) => {
    const token = localStorage.getItem("auth_token");
    const res = await fetch(`/api/crm/contacts/${contactId}/activities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        activityType: channel,
        direction: "outbound",
        content,
      }),
    });
    if (!res.ok) throw new Error("Failed to send");
    queryClient.invalidateQueries({ queryKey: ["crm-contact-activities", contactId] });
    queryClient.invalidateQueries({ queryKey: ["crm-contact", contactId] });
  };

  if (contactLoading) {
    return (
      <SheetContent className="w-full sm:max-w-xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl p-0 overflow-hidden">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </SheetContent>
    );
  }

  if (!contact) return null;

  const contactTags = contact.tags || [];
  const availableTags = allTags.filter((t) => !contactTags.find((ct) => ct.id === t.id));

  return (
    <>
      <SheetContent className="w-full sm:max-w-xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl p-0 flex flex-col overflow-hidden">
        <SheetHeader className="p-6 pb-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarFallback className="bg-[#022d60] text-white text-xl">
                  {contact.firstName[0]}
                  {contact.lastName?.[0] || ""}
                </AvatarFallback>
              </Avatar>
              <div>
                <SheetTitle className="text-xl">
                  {contact.firstName} {contact.lastName}
                </SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={STATUS_COLORS[contact.status]}>
                    {contact.status}
                  </Badge>
                  {contact.leadScore !== undefined && contact.leadScore > 0 && (
                    <Badge variant="outline" className="text-xs">
                      Score: {contact.leadScore}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setEditOpen(true)}
                data-testid="button-edit-contact"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              {isManager && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleDelete}
                  className="text-red-500 hover:text-red-700"
                  data-testid="button-delete-contact"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {contact.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-[#00aad2] hover:underline"
                    data-testid="link-email"
                  >
                    {contact.email}
                  </a>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <a
                    href={`tel:${contact.phone}`}
                    className="text-[#00aad2] hover:underline"
                    data-testid="link-phone"
                  >
                    {contact.phone}
                  </a>
                </div>
              )}
              {(contact.city || contact.province) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {[contact.city, contact.province].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
              {contact.leadSource && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {contact.leadSource.charAt(0).toUpperCase() + contact.leadSource.slice(1)}
                  </span>
                </div>
              )}
              {contact.ownerName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>{contact.ownerName}</span>
                </div>
              )}
              {contact.lastContactedAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>
                    Last contact: {formatDistanceToNow(new Date(contact.lastContactedAt))} ago
                  </span>
                </div>
              )}
            </div>

            {contact.notes && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="text-sm font-semibold mb-2">Notes</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {contact.notes}
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Tag className="w-4 h-4 text-[#00aad2]" />
                  Tags
                </h4>
                {availableTags.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-add-tag">
                        <Plus className="w-3 h-3 mr-1" />
                        Add Tag
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {availableTags.map((tag) => (
                        <DropdownMenuItem
                          key={tag.id}
                          onClick={() => handleAddTag(tag.id)}
                          data-testid={`add-tag-${tag.id}`}
                        >
                          <div
                            className="w-3 h-3 rounded-full mr-2"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {contactTags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tags assigned</p>
                ) : (
                  contactTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant="secondary"
                      className="flex items-center gap-1"
                      style={{ borderColor: tag.color }}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                      <button
                        onClick={() => handleRemoveTag(tag.id)}
                        className="ml-1 hover:text-red-500"
                        data-testid={`remove-tag-${tag.id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#00aad2]" />
                Activity Timeline
              </h4>
              {activitiesLoading ? (
                <div className="py-4 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : activities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No activity yet
                </p>
              ) : (
                <div className="space-y-3">
                  {activities.slice(0, 10).map((activity) => (
                    <div
                      key={activity.id}
                      className="flex gap-3 p-3 bg-muted/30 rounded-lg border border-border/50"
                      data-testid={`activity-${activity.id}`}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#022d60]/10 flex items-center justify-center text-[#022d60]">
                        {ACTIVITY_ICONS[activity.activityType] || (
                          <Clock className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium capitalize">
                            {activity.activityType.replace("_", " ")}
                            {activity.direction && (
                              <span className="text-muted-foreground ml-1">
                                ({activity.direction})
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(activity.createdAt), "MMM d, h:mm a")}
                          </span>
                        </div>
                        {activity.subject && (
                          <p className="text-sm font-medium mt-1">{activity.subject}</p>
                        )}
                        {activity.content && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {activity.content}
                          </p>
                        )}
                        {activity.userName && (
                          <p className="text-xs text-muted-foreground mt-1">
                            by {activity.userName}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <MessageComposer contact={contact} onSend={handleSendMessage} />
      </SheetContent>

      <ContactFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        contact={contact}
        salespeople={salespeople}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["crm-contact", contactId] });
          onRefresh();
        }}
      />
    </>
  );
}

export default function ContactsPage() {
  const [, setLocation] = useLocation();
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem("auth_token");
    const storedUser = localStorage.getItem("user");

    if (!token || !storedUser) {
      setLocation("/login");
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      if (
        !["salesperson", "manager", "admin", "master", "super_admin"].includes(
          parsedUser.role
        )
      ) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        setLocation("/");
        return;
      }
      setUser(parsedUser);
    } catch (error) {
      console.error("Auth check failed:", error);
      setLocation("/login");
    } finally {
      setIsLoading(false);
    }
  };

  const isManager =
    user?.role === "manager" ||
    user?.role === "admin" ||
    user?.role === "master" ||
    user?.role === "super_admin";

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (searchQuery) params.set("search", searchQuery);
    if (ownerFilter) params.set("ownerId", ownerFilter);
    if (sourceFilter) params.set("leadSource", sourceFilter);
    params.set("page", page.toString());
    params.set("limit", "25");
    params.set("sortField", sortField);
    params.set("sortDirection", sortDirection);
    return params.toString();
  };

  const {
    data: contactsData,
    isLoading: contactsLoading,
    refetch,
  } = useQuery<{ contacts: Contact[]; total: number; pages: number }>({
    queryKey: [
      "crm-contacts",
      statusFilter,
      searchQuery,
      ownerFilter,
      sourceFilter,
      page,
      sortField,
      sortDirection,
    ],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/crm/contacts?${buildQueryParams()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: salespeople = [] } = useQuery<SalesPerson[]>({
    queryKey: ["salespeople"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/salespeople", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const { data: allTags = [] } = useQuery<CrmTag[]>({
    queryKey: ["crm-tags"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/crm/tags", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const contacts = contactsData?.contacts || [];
  const totalPages = contactsData?.pages || 1;

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronDown className="w-4 h-4 opacity-30" />;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 flex flex-col">
      <header className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border-b border-gray-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 max-w-[1800px] flex items-center justify-between">
          <Link
            href="/sales"
            className="flex items-center gap-2 text-[#022d60] dark:text-[#00aad2] hover:text-[#00aad2] transition-colors"
            data-testid="link-back"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="font-medium">Back to Dashboard</span>
          </Link>
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-[#022d60] hover:bg-[#022d60]/90"
              data-testid="button-new-contact"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Contact
            </Button>
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-[#022d60] dark:text-[#00aad2]" />
              <span className="font-bold text-[#022d60] dark:text-[#00aad2]">Contacts</span>
            </div>
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-slate-700">
        <div className="container mx-auto max-w-[1800px]">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Status</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sourceFilter}
                onValueChange={(v) => {
                  setSourceFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]" data-testid="select-source-filter">
                  <SelectValue placeholder="Lead Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Sources</SelectItem>
                  {LEAD_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source.charAt(0).toUpperCase() + source.slice(1).replace("-", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isManager && (
                <Select
                  value={ownerFilter}
                  onValueChange={(v) => {
                    setOwnerFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[160px]" data-testid="select-owner-filter">
                    <SelectValue placeholder="Assigned To" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Salespeople</SelectItem>
                    {salespeople.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id.toString()}>
                        {sp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {(statusFilter || sourceFilter || ownerFilter || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("");
                    setSourceFilter("");
                    setOwnerFilter("");
                    setSearchQuery("");
                    setPage(1);
                  }}
                  data-testid="button-clear-filters"
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="container mx-auto max-w-[1800px]">
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-lg">
            {contactsLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Loading contacts...</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-semibold mb-2">No contacts found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery || statusFilter || sourceFilter || ownerFilter
                    ? "Try adjusting your filters"
                    : "Get started by adding your first contact"}
                </p>
                <Button
                  onClick={() => setCreateDialogOpen(true)}
                  className="bg-[#022d60] hover:bg-[#022d60]/90"
                  data-testid="button-add-first-contact"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Contact
                </Button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th
                          className="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                          onClick={() => handleSort("firstName")}
                          data-testid="sort-name"
                        >
                          <div className="flex items-center gap-1">
                            Name
                            <SortIcon field="firstName" />
                          </div>
                        </th>
                        <th
                          className="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 transition-colors hidden md:table-cell"
                          onClick={() => handleSort("email")}
                          data-testid="sort-email"
                        >
                          <div className="flex items-center gap-1">
                            Email
                            <SortIcon field="email" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium hidden lg:table-cell">
                          Phone
                        </th>
                        <th
                          className="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                          onClick={() => handleSort("status")}
                          data-testid="sort-status"
                        >
                          <div className="flex items-center gap-1">
                            Status
                            <SortIcon field="status" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium hidden xl:table-cell">
                          Lead Source
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium hidden lg:table-cell">
                          Assigned To
                        </th>
                        <th
                          className="px-4 py-3 text-left text-sm font-medium cursor-pointer hover:bg-muted/70 transition-colors hidden md:table-cell"
                          onClick={() => handleSort("lastContactedAt")}
                          data-testid="sort-lastContact"
                        >
                          <div className="flex items-center gap-1">
                            Last Contact
                            <SortIcon field="lastContactedAt" />
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium hidden xl:table-cell">
                          Tags
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {contacts.map((contact) => (
                        <tr
                          key={contact.id}
                          className="hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => setSelectedContactId(contact.id)}
                          data-testid={`contact-row-${contact.id}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="bg-[#022d60] text-white text-xs">
                                  {contact.firstName[0]}
                                  {contact.lastName?.[0] || ""}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">
                                  {contact.firstName} {contact.lastName}
                                </p>
                                {(contact.city || contact.province) && (
                                  <p className="text-xs text-muted-foreground">
                                    {[contact.city, contact.province]
                                      .filter(Boolean)
                                      .join(", ")}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm hidden md:table-cell">
                            {contact.email || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm hidden lg:table-cell">
                            {contact.phone || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={STATUS_COLORS[contact.status]}>
                              {contact.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm hidden xl:table-cell">
                            {contact.leadSource ? (
                              <span className="capitalize">
                                {contact.leadSource.replace("-", " ")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm hidden lg:table-cell">
                            {contact.ownerName || (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm hidden md:table-cell">
                            {contact.lastContactedAt ? (
                              <span className="text-muted-foreground">
                                {formatDistanceToNow(new Date(contact.lastContactedAt))} ago
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Never</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {(contact.tags || []).slice(0, 2).map((tag) => (
                                <Badge
                                  key={tag.id}
                                  variant="outline"
                                  className="text-xs"
                                  style={{ borderColor: tag.color, color: tag.color }}
                                >
                                  {tag.name}
                                </Badge>
                              ))}
                              {(contact.tags || []).length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{(contact.tags || []).length - 2}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  data-testid={`contact-actions-${contact.id}`}
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedContactId(contact.id);
                                  }}
                                  data-testid={`view-contact-${contact.id}`}
                                >
                                  <User className="w-4 h-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                {contact.email && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.location.href = `mailto:${contact.email}`;
                                    }}
                                  >
                                    <Mail className="w-4 h-4 mr-2" />
                                    Send Email
                                  </DropdownMenuItem>
                                )}
                                {contact.phone && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.location.href = `tel:${contact.phone}`;
                                    }}
                                  >
                                    <Phone className="w-4 h-4 mr-2" />
                                    Call
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        data-testid="button-prev-page"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        data-testid="button-next-page"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Sheet
        open={!!selectedContactId}
        onOpenChange={(open) => !open && setSelectedContactId(null)}
      >
        {selectedContactId && (
          <ContactDetailPanel
            contactId={selectedContactId}
            onClose={() => setSelectedContactId(null)}
            isManager={isManager}
            salespeople={salespeople}
            allTags={allTags}
            onRefresh={() => refetch()}
          />
        )}
      </Sheet>

      <ContactFormDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        salespeople={salespeople}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
