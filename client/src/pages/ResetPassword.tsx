import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Car, Lock, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";

export default function ResetPassword() {
  const [match, params] = useRoute("/reset-password/:token");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { dealership } = useTenant();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [success, setSuccess] = useState(false);

  // Support both /reset-password/:token (route param) and /reset-password?token= (query param from email)
  const token = params?.token || new URLSearchParams(window.location.search).get('token') || undefined;

  useEffect(() => {
    if (!token) {
      setIsValidating(false);
      return;
    }

    fetch(`/api/auth/reset-password/${token}`)
      .then((res) => res.json())
      .then((data) => {
        setTokenValid(data.valid === true);
      })
      .catch(() => {
        setTokenValid(false);
      })
      .finally(() => {
        setIsValidating(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(true);
        setTimeout(() => setLocation("/login"), 3000);
      } else {
        toast({
          title: "Reset failed",
          description: data.error || "This reset link may have expired. Please request a new one.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Connection error",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-lg" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md text-center">
          <Card className="border-0 shadow-xl shadow-gray-200/50">
            <CardContent className="p-8">
              <div className="mx-auto w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mb-4">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-[#022d60] mb-2">Password updated</h1>
              <p className="text-gray-500 mb-6">
                Your password has been reset successfully. Redirecting you to sign in…
              </p>
              <Link href="/login">
                <Button className="w-full bg-[#022d60] hover:bg-[#022d60]/90">
                  Sign In Now
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md text-center">
          <Card className="border-0 shadow-xl shadow-gray-200/50">
            <CardContent className="p-8">
              <div className="mx-auto w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
                <AlertCircle className="w-7 h-7 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-[#022d60] mb-2">Link expired</h1>
              <p className="text-gray-500 mb-6">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
              <Link href="/forgot-password">
                <Button className="w-full bg-[#022d60] hover:bg-[#022d60]/90">
                  Request New Link
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
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
              <h1 className="text-2xl font-bold text-[#022d60]">Set new password</h1>
              <p className="text-gray-500 mt-2">Choose a strong password for your account.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-12 border-gray-200 focus:border-[#00aad2] focus:ring-[#00aad2]"
                    required
                    minLength={8}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 h-12 border-gray-200 focus:border-[#00aad2] focus:ring-[#00aad2]"
                    required
                  />
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-[#022d60] hover:bg-[#022d60]/90 text-white font-medium rounded-xl shadow-lg shadow-[#022d60]/20"
                disabled={isLoading || !password || !confirmPassword || password !== confirmPassword}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Updating...
                  </span>
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
