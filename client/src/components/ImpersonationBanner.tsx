import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { X, UserCog, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImpersonatedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  dealershipId: number | null;
}

export function ImpersonationBanner() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<ImpersonatedUser | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const checkImpersonation = () => {
      const sessionId = localStorage.getItem('impersonation_session_id');
      const superAdminId = localStorage.getItem('impersonation_super_admin_id');
      const originalToken = localStorage.getItem('original_auth_token');
      
      if (sessionId && superAdminId && originalToken) {
        setIsImpersonating(true);
        const user = localStorage.getItem('user');
        if (user) {
          try {
            setImpersonatedUser(JSON.parse(user));
          } catch (e) {
            console.error('Failed to parse impersonated user:', e);
          }
        }
      } else {
        setIsImpersonating(false);
        setImpersonatedUser(null);
      }
    };

    checkImpersonation();
    window.addEventListener('storage', checkImpersonation);
    return () => window.removeEventListener('storage', checkImpersonation);
  }, []);

  const exitImpersonation = async () => {
    setIsExiting(true);
    
    try {
      const sessionId = localStorage.getItem('impersonation_session_id');
      const superAdminId = localStorage.getItem('impersonation_super_admin_id');
      const originalToken = localStorage.getItem('original_auth_token');
      
      if (!sessionId || !superAdminId || !originalToken) {
        throw new Error('Missing impersonation session data');
      }
      
      const response = await fetch('/api/super-admin/impersonate/end', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${originalToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: parseInt(sessionId),
          superAdminId: parseInt(superAdminId)
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to end impersonation');
      }
      
      const originalUser = localStorage.getItem('original_user');
      
      localStorage.setItem('auth_token', originalToken);
      if (originalUser) {
        localStorage.setItem('user', originalUser);
      }
      
      localStorage.removeItem('impersonation_session_id');
      localStorage.removeItem('impersonation_super_admin_id');
      localStorage.removeItem('original_auth_token');
      localStorage.removeItem('original_user');
      
      setIsImpersonating(false);
      setImpersonatedUser(null);
      
      toast({
        title: "Session Ended",
        description: "You have returned to your super admin account"
      });
      
      setLocation('/super-admin');
      
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to end impersonation',
        variant: "destructive"
      });
    } finally {
      setIsExiting(false);
    }
  };

  if (!isImpersonating || !impersonatedUser) {
    return null;
  }

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-yellow-950 px-4 py-2 shadow-lg"
      data-testid="impersonation-banner"
    >
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCog className="h-5 w-5" />
          <span className="font-medium">
            Viewing as: <strong>{impersonatedUser.name}</strong>
            <span className="hidden sm:inline">
              {' '}({impersonatedUser.email}) • {impersonatedUser.role.replace('_', ' ')}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 text-yellow-800 text-sm mr-4">
            <AlertTriangle className="h-4 w-4" />
            <span>Actions are being logged</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={exitImpersonation}
            disabled={isExiting}
            className="bg-white/80 hover:bg-white text-yellow-900 border-yellow-600"
            data-testid="button-exit-impersonation"
          >
            {isExiting ? (
              'Exiting...'
            ) : (
              <>
                <X className="h-4 w-4 mr-1" />
                Exit Session
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
