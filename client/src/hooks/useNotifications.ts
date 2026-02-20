import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface Notification {
  type: 'new_lead' | 'chat_message' | 'post_status' | 'inventory_sync' | 'system';
  title: string;
  message: string;
  data?: any;
  timestamp: string;
}

const VALID_NOTIFICATION_TYPES = ['new_lead', 'chat_message', 'post_status', 'inventory_sync', 'system'];

function isValidNotification(data: any): data is Notification {
  return (
    typeof data === 'object' &&
    data !== null &&
    VALID_NOTIFICATION_TYPES.includes(data.type) &&
    typeof data.title === 'string' &&
    typeof data.message === 'string' &&
    typeof data.timestamp === 'string'
  );
}

interface UseNotificationsOptions {
  token?: string | null;
  autoReconnect?: boolean;
  showToasts?: boolean;
  maxRetries?: number;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { token, autoReconnect = true, showToasts = true, maxRetries = 5 } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const { toast } = useToast();

  const connect = useCallback(() => {
    if (!token) {
      return;
    }
    
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        retryCountRef.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (!isValidNotification(data)) {
            console.warn('Received invalid notification payload:', data);
            return;
          }
          
          const notification: Notification = data;
          
          setNotifications(prev => {
            if (prev.some(n => n.timestamp === notification.timestamp && n.title === notification.title)) {
              return prev;
            }
            return [notification, ...prev].slice(0, 50);
          });
          
          if (showToasts) {
            const variant = notification.type === 'new_lead' ? 'default' : 
                           notification.type === 'system' ? 'destructive' : 'default';
            toast({
              title: notification.title,
              description: notification.message,
              variant,
            });
          }
        } catch (error) {
          console.error('Failed to parse notification:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;
        
        if (event.code === 4001) {
          console.log('WebSocket authentication failed, not reconnecting');
          return;
        }
        
        if (autoReconnect && retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }, [token, autoReconnect, showToasts, maxRetries, toast]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    notifications,
    clearNotifications,
    connect,
    disconnect,
    unreadCount: notifications.length,
  };
}
