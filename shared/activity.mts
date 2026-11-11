export const ACTIVITY_API = {
  read: '/activity',
  markRead: '/activity/read',
} as const;

export type ActivityType = 'visit' | 'steal';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  visitorName: string;
  plot?: number;
  cropId?: number;
  cropName?: string;
  amount?: number;
  createdAt: number;
  isUnread?: boolean;
}

export interface ActivitySummary {
  unreadCount: number;
  recentStolenFruit: number;
  recentVisitors: string[];
}

export interface ActivityPage {
  unreadCount: number;
  summary: ActivitySummary;
  events: ActivityEvent[];
  nextOffset: number | null;
}
