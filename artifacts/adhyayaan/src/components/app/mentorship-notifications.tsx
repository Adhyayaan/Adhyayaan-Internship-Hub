import { useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  getGetMentorshipNotificationPreferenceQueryKey, getListMentorshipMessagesQueryKey,
  getListMentorshipThreadsQueryKey, useGetMentorshipNotificationPreference,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/app';
import { toast } from '@/hooks/use-toast';
import { getMentorshipAlertChannel } from '@/lib/mentorship-alerts';

type MentorshipMessageEvent = {
  enrollmentId: string;
  messageId: string;
};

export function MentorshipNotifications() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const canReceive = !!user && (user.isGuide || (!user.isAdmin && !user.isSuperadmin));
  const preference = useGetMentorshipNotificationPreference({
    query: {
      enabled: canReceive,
      queryKey: getGetMentorshipNotificationPreferenceQueryKey(),
      staleTime: 0,
      refetchOnMount: 'always',
    },
  });

  useEffect(() => {
    if (!canReceive || !user) return;
    const source = new EventSource('/api/mentorship/events', { withCredentials: true });
    const onMessage = (event: MessageEvent<string>) => {
      let message: MentorshipMessageEvent;
      try {
        message = JSON.parse(event.data) as MentorshipMessageEvent;
        if (!message.enrollmentId || !message.messageId) return;
      } catch {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: getListMentorshipThreadsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListMentorshipMessagesQueryKey(message.enrollmentId) });
      const channel = getMentorshipAlertChannel({
        notificationsEnabled: !!preference.data?.browserNotificationsEnabled,
        browserPermissionGranted: 'Notification' in window && Notification.permission === 'granted',
        tabHidden: document.hidden,
        threadOpen: location === `/mentorship/${message.enrollmentId}`,
      });
      if (channel === 'toast') {
        toast({
          title: 'New mentorship message',
          description: 'A new reply is waiting in one of your conversations.',
        });
        return;
      }
      if (channel === 'browser') {
        const notification = new Notification('New mentorship message', {
          body: 'A new reply is waiting in one of your conversations.',
          tag: `mentorship-${message.enrollmentId}`,
        });
        notification.onclick = () => {
          window.focus();
          setLocation(`/mentorship/${message.enrollmentId}`);
          notification.close();
        };
      }
    };
    source.onopen = () => {
      void queryClient.invalidateQueries({ queryKey: getListMentorshipThreadsQueryKey() });
    };
    source.addEventListener('message', onMessage as EventListener);
    return () => {
      source.removeEventListener('message', onMessage as EventListener);
      source.close();
    };
  }, [canReceive, location, preference.data?.browserNotificationsEnabled, queryClient, setLocation, user]);

  return null;
}
