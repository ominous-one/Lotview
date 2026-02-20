import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Car, Lock, Mail, ArrowRight, Shield, Zap, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isMarketingSite, dealership } = useTenant();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        toast({
          title: "Welcome back!",
          description: `Signed in as ${data.user.name}`,
        });

        if (data.user.role === 'super_admin') {
          setLocation('/super-admin');
        } else if (data.user.role === 'master') {
          setLocation('/dashboard');
        } else if (data.user.role === 'manager') {
          setLocation('/manager');
        } else if (data.user.role === 'salesperson') {
          setLocation('/sales');
        }
      } else {
        toast({
          title: "Sign in failed",
          description: data.error || "Invalid email or password",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#022d60] via-[#022d60] to-[#00aad2]/80 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjAzIi8+PC9nPjwvc3ZnPg==')] opacity-30" />
        
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div>
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer">
                <div className="w-10 h-10 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
                  <Car className="w-6 h-6 text-white" />
                </div>
                <span className="text-2xl font-bold text-white">
                  {dealership ? dealership.name : "Lotview.ai"}
                </span>
              </div>
            </Link>
          </div>
          
          {/* Features */}
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
                Your dealership's
                <span className="block text-[#00aad2]">command center</span>
              </h2>
              <p className="text-white/70 text-lg max-w-md">
                Access your inventory, engage customers, and close more deals—all from one powerful platform.
              </p>
            </div>
            
            <div className="space-y-4">
              {[
                { icon: BarChart3, text: "Real-time inventory analytics" },
                { icon: Zap, text: "AI-powered customer engagement" },
                { icon: Shield, text: "Enterprise-grade security" },
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                    <feature.icon className="w-5 h-5 text-[#00aad2]" />
                  </div>
                  <span className="text-white/90">{feature.text}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Footer */}
          <div className="text-white/50 text-sm">
            &copy; {new Date().getFullYear()} Lotview.ai — Built for Canadian Dealerships
          </div>
        </div>
      </div>
      
      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link href="/">
              <div className="inline-flex items-center gap-2 cursor-pointer">
                <div className="w-10 h-10 bg-gradient-to-br from-[#022d60] to-[#00aad2] rounded-xl flex items-center justify-center">
                  <Car className="w-6 h-6 text-white" />
                </div>
                <span className="text-2xl font-bold text-[#022d60]">
                  {dealership ? dealership.name : "Lotview.ai"}
                </span>
              </div>
            </Link>
          </div>
          
          <Card className="border-0 shadow-xl shadow-gray-200/50">
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <div className="mx-auto w-14 h-14 bg-gradient-to-br from-[#022d60] to-[#00aad2] rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-[#022d60]/20">
                  <Lock className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-[#022d60]">Welcome back</h1>
                <p className="text-gray-500 mt-2">
                  Sign in to access your dashboard
                </p>
              </div>
              
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="email"
                      placeholder="you@dealership.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      data-testid="input-email"
                      className="pl-10 h-12 border-gray-200 focus:border-[#00aad2] focus:ring-[#00aad2]"
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      data-testid="input-password"
                      className="pl-10 h-12 border-gray-200 focus:border-[#00aad2] focus:ring-[#00aad2]"
                      required
                    />
                  </div>
                </div>
                
                <Button
                  type="submit"
                  className="w-full h-12 bg-[#022d60] hover:bg-[#022d60]/90 text-white font-medium rounded-xl shadow-lg shadow-[#022d60]/20 transition-all"
                  disabled={isLoading || !email || !password}
                  data-testid="button-login"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Sign In
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>
              
              <div className="mt-6 text-center">
                <a 
                  href="mailto:support@lotview.ai?subject=Password%20Reset%20Request&body=Hi%2C%0A%0AI%20need%20to%20reset%20my%20password%20for%20my%20account.%0A%0AMy%20email%3A%20%0A%0AThank%20you!"
                  className="text-sm text-[#00aad2] hover:text-[#022d60] transition-colors font-medium"
                  data-testid="link-forgot-password"
                >
                  Forgot your password?
                </a>
              </div>
            </CardContent>
          </Card>
          
          {/* Security Badge */}
          <div className="mt-6 flex items-center justify-center gap-2 text-gray-400 text-sm">
            <Shield className="w-4 h-4" />
            <span>256-bit SSL encrypted</span>
          </div>
          
          {/* Back to Home (Marketing Site Only) */}
          {isMarketingSite && (
            <div className="mt-4 text-center">
              <Link href="/" className="text-sm text-gray-500 hover:text-[#022d60] transition-colors">
                &larr; Back to home
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
