import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useNotifications, type Notification } from '@/hooks/useNotifications';

interface NotificationContextType {
  isConnected: boolean;
  notifications: Notification[];
  clearNotifications: () => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  });

  useEffect(() => {
    const handleStorageChange = () => {
      setToken(localStorage.getItem('auth_token'));
    };
    window.addEventListener('storage', handleStorageChange);
    
    const interval = setInterval(() => {
      const currentToken = localStorage.getItem('auth_token');
      if (currentToken !== token) {
        setToken(currentToken);
      }
    }, 1000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [token]);

  const notificationState = useNotifications({ token, showToasts: true });

  return (
    <NotificationContext.Provider value={notificationState}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
}
