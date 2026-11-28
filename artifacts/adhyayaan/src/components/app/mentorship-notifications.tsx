import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  getGetMentorshipNotificationPreferenceQueryKey, getListMentorshipThreadsQueryKey,
  useGetMentorshipNotificationPreference, type MentorshipMessage, type MentorshipThread,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/app';
import { toast } from '@/hooks/use-toast';
import { getMentorshipAlertChannel } from '@/lib/mentorship-alerts';
import { subscribeChatRealtime } from '@/lib/chat-realtime';

export function MentorshipNotifications() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const locationRef = useRef(location);
  const preferenceRef = useRef(false);
  const setLocationRef = useRef(setLocation);
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
    locationRef.current = location;
    preferenceRef.current = !!preference.data?.browserNotificationsEnabled;
    setLocationRef.current = setLocation;
  }, [location, preference.data?.browserNotificationsEnabled, setLocation]);

  useEffect(() => {
    if (!canReceive || !user) return;
    return subscribeChatRealtime(user.id, (event) => {
      if (event.type === 'resync' || (event.type === 'connection' && event.reconnected)) {
        void queryClient.invalidateQueries({ queryKey: getListMentorshipThreadsQueryKey() });
        return;
      }
      if (event.type !== 'mentorship.notification'
        || typeof event.enrollmentId !== 'string'
        || typeof event.messageId !== 'string'
        || !event.message) return;
      const message = { enrollmentId: event.enrollmentId, messageId: event.messageId };
      if (locationRef.current !== `/mentorship/${message.enrollmentId}`) {
        const detail = event.message as MentorshipMessage;
        const preview = detail.deletedAt ? 'Message deleted'
          : detail.kind === 'meeting' ? `Google Meet session${detail.meetingAgenda ? ` · ${detail.meetingAgenda}` : ''}`
            : detail.kind === 'question' ? `Learning question · ${detail.body.trim().replace(/\s+/g, ' ').slice(0, 130)}`
              : detail.kind === 'question_response' ? `Question response · ${detail.body.trim().replace(/\s+/g, ' ').slice(0, 130)}`
                : detail.body.trim().replace(/\s+/g, ' ').slice(0, 160) || 'Shared an attachment';
        queryClient.setQueryData<MentorshipThread[]>(getListMentorshipThreadsQueryKey(), (threads) => threads?.map((thread) => {
          if (thread.enrollmentId !== message.enrollmentId) return thread;
          const isLatest = !thread.lastMessageAt || detail.createdAt >= thread.lastMessageAt;
          return {
            ...thread,
            ...(isLatest ? { lastMessagePreview: preview, lastMessageAt: detail.createdAt } : {}),
            messageCount: thread.messageCount + 1,
            unreadCount: thread.unreadCount + 1,
          };
        }));
      }
      const channel = getMentorshipAlertChannel({
        notificationsEnabled: preferenceRef.current,
        browserPermissionGranted: 'Notification' in window && Notification.permission === 'granted',
        tabHidden: document.hidden,
        threadOpen: locationRef.current === `/mentorship/${message.enrollmentId}`,
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
          setLocationRef.current(`/mentorship/${message.enrollmentId}`);
          notification.close();
        };
      }
    });
  }, [canReceive, queryClient, user]);

  return null;
}
