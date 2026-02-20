import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/Navbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, MessageSquare, Settings, Sparkles, LogOut, TrendingUp, Users, Car } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMasterUser, setIsMasterUser] = useState(false);
  const { toast } = useToast();

  // Check if user is authenticated with JWT
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('user');

    if (!token || !storedUser) {
      setIsLoading(false);
      setLocation('/login');
      return;
    }

    try {
      // Verify token is still valid via /api/auth/me
      const response = await fetch("/api/auth/me", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Token is invalid, redirect to login
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        setLocation('/login');
        return;
      }

      const data = await response.json();
      
      // Check if user has admin privileges (master or super_admin)
      if (data.user.role === 'master' || data.user.role === 'super_admin') {
        setIsAuthenticated(true);
        setIsMasterUser(data.user.role === 'master');
      } else {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access the admin panel",
          variant: "destructive",
        });
        setLocation('/');
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      setLocation('/login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    
    setIsAuthenticated(false);
    
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out",
    });
    
    setLocation('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4 pt-28">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Checking authentication...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4 pt-28">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-primary rounded-full flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-2xl">Admin Access Required</CardTitle>
              <CardDescription>
                Please sign in to access the admin dashboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setLocation('/login')}
                className="w-full"
                data-testid="button-go-to-login"
              >
                Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Admin dashboard content
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 px-4 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage your dealership settings and analytics</p>
          </div>
          <Button 
            variant="outline" 
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <TrendingUp className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="inventory" data-testid="tab-inventory">
              <Car className="w-4 h-4 mr-2" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="chat" data-testid="tab-chat">
              <MessageSquare className="w-4 h-4 mr-2" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Total Vehicles</CardTitle>
                  <CardDescription>Active inventory count</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">-</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Total Views</CardTitle>
                  <CardDescription>Vehicle page views</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">-</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Active Leads</CardTitle>
                  <CardDescription>Chat conversations</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">-</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common management tasks</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                <Button onClick={() => setLocation('/dashboard')} data-testid="button-full-dashboard">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Full Dashboard
                </Button>
                <Button variant="outline" onClick={() => setLocation('/manager')} data-testid="button-manager-tools">
                  <Users className="w-4 h-4 mr-2" />
                  Manager Tools
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inventory" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Inventory Management</CardTitle>
                <CardDescription>Vehicle inventory is managed in the main Dashboard</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setLocation('/dashboard')} data-testid="button-manage-inventory">
                  <Car className="w-4 h-4 mr-2" />
                  Go to Dashboard
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chat" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Chat Management</CardTitle>
                <CardDescription>AI chat settings and conversation logs are managed in the main Dashboard</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setLocation('/dashboard')} data-testid="button-manage-chat">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Go to Dashboard
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Settings</CardTitle>
                <CardDescription>Dealership settings are managed in the main Dashboard</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setLocation('/dashboard')} data-testid="button-manage-settings">
                  <Settings className="w-4 h-4 mr-2" />
                  Go to Dashboard
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
