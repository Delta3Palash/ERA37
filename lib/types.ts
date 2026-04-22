export type Platform = "telegram" | "discord" | "slack" | "whatsapp";

export interface Role {
  id: string;
  name: string;
  color: string; // hex e.g. "#FFA800"
  priority: number;
  /**
   * Delegated admin flag. Users holding a role with `can_manage = true`
   * get access to the scoped admin UI — they can assign, create, and
   * delete roles / channel groups strictly below their own effective
   * priority. `is_admin` on profiles is still a separate superadmin flag.
   */
  can_manage: boolean;
  created_at: string;
}

export interface ChannelGroup {
  id: string;
  name: string;
  min_role_priority: number;
  sort_order: number;
  created_at: string;
  connections?: Connection[];
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_language: string;
  preferred_timezone: string;
  auto_translate: boolean;
  is_admin: boolean;
  tos_accepted_at: string | null;
  created_at: string;
  roles?: Role[];
}

/**
 * Highest priority across a user's roles. A user with no roles has
 * effective priority 0 — they only see groups with min_role_priority=0.
 */
export function effectivePriority(roles: Role[] | null | undefined): number {
  if (!roles || roles.length === 0) return 0;
  return Math.max(...roles.map((r) => r.priority));
}

export interface Workspace {
  id: string;
  name: string;
  invite_code: string;
  invite_enabled: boolean;
  bridge_enabled: boolean;
  created_at: string;
}

export interface Connection {
  id: string;
  platform: Platform;
  platform_channel_id: string;
  channel_name: string | null;
  bot_token: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

// Calendar types -------------------------------------------------------------

export type CalendarKind = "alliance" | "misc" | "game";
export type CalendarEventType = "growth" | "attack" | "defense" | "rally";

export interface CalendarEvent {
  id: string;
  kind: CalendarKind;
  event_type: CalendarEventType;
  title: string;
  details: string | null;
  starts_at: string;            // ISO UTC
  ends_at: string | null;
  assigned_to: string | null;   // profiles.id
  created_by: string | null;    // profiles.id
  created_at: string;
  // Optional join expansion used by the event list API
  assignee?: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
}

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * UTC hours (0–23) the user is online, per weekday.
 * Missing keys / empty arrays mean "unknown / not available."
 */
export type AvailabilityGrid = Partial<Record<Weekday, number[]>>;

export interface TeamClockTimezone {
  id: string;
  iana: string;     // e.g. 'America/Los_Angeles'
  label: string;    // display name, e.g. 'Los Angeles'
  sort_order: number;
  created_at: string;
}

export interface R4Availability {
  id: string;                 // profiles.id
  display_name: string | null;
  avatar_url: string | null;
  availability_utc: AvailabilityGrid;
}

export interface GameCalendarImage {
  id: string;
  week_start: string;           // ISO date (Monday)
  image_url: string;
  sort_order: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

export type NotificationKind = "event_assigned" | "event_unassigned";

export interface Notification {
  id: string;
  recipient_id: string;
  kind: NotificationKind;
  event_id: string | null;
  title: string;
  body: string | null;
  link_href: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  connection_id: string;
  platform: Platform;
  platform_message_id: string | null;
  platform_channel_id: string;
  sender_name: string | null;
  sender_avatar: string | null;
  content: string | null;
  image_url: string | null;
  translated_content: string | null;
  translated_language: string | null;
  direction: "incoming" | "outgoing" | "bridged";
  sent_by: string | null;
  message_type: string;
  metadata: Record<string, unknown>;
  reply_to_message_id: string | null;
  created_at: string;
  connection?: Connection;
}
