import type { NotificationEvent, NotificationEventType } from '../services/notificationEvents';

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
}

export interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

const DISCORD_EMBED_COLOR = 0xb02e0c;
const MAX_EMBED_TITLE = 256;
const DEFAULT_INITIAL_LOOKBACK_MINUTES = 24 * 60;

const ALL_EVENT_TYPES: NotificationEventType[] = [
  'thread_created',
  'comment_created',
  'post_edited',
  'post_deleted',
  'thread_deleted',
  'approval_required',
  'user_created',
  'user_role_changed',
  'username_changed',
];

export function parseNotifyEventTypes(value: string | undefined): NotificationEventType[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {return undefined;}

  const requested = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  const invalid = requested.filter((type) => !ALL_EVENT_TYPES.includes(type as NotificationEventType));
  if (invalid.length > 0) {
    throw new Error(`Invalid NOTIFY_EVENT_TYPES value(s): ${invalid.join(', ')}`);
  }
  return requested as NotificationEventType[];
}

export function computePollWindow(options: {
  now: Date;
  lastUntil: string | null;
  initialLookbackMinutes?: number;
}): { since: string; until: string } {
  const until = options.now.toISOString();
  if (options.lastUntil) {
    return { since: options.lastUntil, until };
  }

  const lookbackMinutes = options.initialLookbackMinutes ?? DEFAULT_INITIAL_LOOKBACK_MINUTES;
  const since = new Date(options.now.getTime() - lookbackMinutes * 60_000).toISOString();
  return { since, until };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {return text;}
  return `${text.slice(0, max - 1)}…`;
}

function baseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function embedFields(fields: Array<DiscordEmbedField | null | undefined>): DiscordEmbedField[] {
  return fields.filter((field): field is DiscordEmbedField => Boolean(field?.value?.trim()));
}

function optionalField(name: string, value: string | null | undefined, inline = true): DiscordEmbedField | null {
  if (!value?.trim()) {return null;}
  return { name, value: value.trim(), inline };
}

function formatEventEmbed(event: NotificationEvent, forumBaseUrl: string): DiscordEmbed {
  const root = baseUrl(forumBaseUrl);
  const adminUrl = `${root}/admin`;
  const footer = { text: event.id };

  switch (event.type) {
    case 'thread_created':
      return {
        title: truncate(`New thread: ${event.title}`, MAX_EMBED_TITLE),
        description: `by **${event.authorUsername}** in ${event.categoryName}`,
        url: `${root}/threads/${event.threadId}`,
        color: DISCORD_EMBED_COLOR,
        footer,
      };
    case 'comment_created':
      return {
        title: truncate(`New reply in "${event.threadTitle}"`, MAX_EMBED_TITLE),
        description: `by **${event.authorUsername}**`,
        url: `${root}/threads/${event.threadId}#post-${event.postId}`,
        color: DISCORD_EMBED_COLOR,
        footer,
      };
    case 'post_edited':
      return {
        title: truncate(`Reply edited in "${event.threadTitle}"`, MAX_EMBED_TITLE),
        description: `Originally by **${event.authorUsername}**, edited by **${event.editorUsername}**`,
        url: `${root}/threads/${event.threadId}#post-${event.postId}`,
        color: DISCORD_EMBED_COLOR,
        footer,
      };
    case 'post_deleted':
      return {
        title: truncate(`Reply deleted in "${event.threadTitle}"`, MAX_EMBED_TITLE),
        description: `Initiated by **${event.initiatedByUsername}**`,
        url: `${adminUrl}/posts/${event.postId}/edit`,
        color: DISCORD_EMBED_COLOR,
        fields: embedFields([
          optionalField('Author', event.authorUsername),
          optionalField('Thread', event.threadTitle, false),
          optionalField('Excerpt', event.postBodyPreview, false),
          optionalField('Reason', event.reason, false),
        ]),
        footer,
      };
    case 'thread_deleted':
      return {
        title: truncate(`Thread deleted: ${event.title}`, MAX_EMBED_TITLE),
        description: `Initiated by **${event.initiatedByUsername}**`,
        url: `${adminUrl}/threads/${event.threadId}/edit`,
        color: DISCORD_EMBED_COLOR,
        fields: embedFields([
          optionalField('Author', event.authorUsername),
          optionalField('Category', event.categoryName),
          optionalField('Reason', event.reason, false),
        ]),
        footer,
      };
    case 'approval_required':
      if (event.kind === 'thread') {
        return {
          title: truncate(`Thread needs approval: ${event.title}`, MAX_EMBED_TITLE),
          description: `by **${event.authorUsername}** in ${event.categoryName}`,
          url: `${adminUrl}/threads/${event.threadId}/edit`,
          color: DISCORD_EMBED_COLOR,
          footer,
        };
      }
      if (event.kind === 'post') {
        return {
          title: truncate(`Reply needs approval in "${event.threadTitle}"`, MAX_EMBED_TITLE),
          description: `by **${event.authorUsername}**`,
          url: `${adminUrl}/posts/${event.postId}/edit`,
          color: DISCORD_EMBED_COLOR,
          footer,
        };
      }
      return {
        title: 'Username change needs approval',
        description: `**${event.currentUsername}** → **${event.requestedUsername}**`,
        url: `${adminUrl}/users/${event.userId}/edit`,
        color: DISCORD_EMBED_COLOR,
        footer,
      };
    case 'user_created':
      return {
        title: truncate(`New user: ${event.username}`, MAX_EMBED_TITLE),
        description: `Role: **${event.role}**`,
        url: `${adminUrl}/users/${event.userId}/edit`,
        color: DISCORD_EMBED_COLOR,
        footer,
      };
    case 'user_role_changed': {
      const previousRole = event.previousRole ?? 'unknown';
      return {
        title: truncate(`Role changed: ${event.username}`, MAX_EMBED_TITLE),
        description: `**${event.actorUsername}** changed role from **${previousRole}** to **${event.newRole}**`,
        url: `${adminUrl}/users/${event.userId}/edit`,
        color: DISCORD_EMBED_COLOR,
        footer,
      };
    }
    case 'username_changed': {
      const previousUsername = event.previousUsername ?? 'unknown';
      return {
        title: truncate(`Username changed: ${event.username}`, MAX_EMBED_TITLE),
        description: `Initiated by **${event.initiatedByUsername}**`,
        url: `${adminUrl}/users/${event.userId}/edit`,
        color: DISCORD_EMBED_COLOR,
        fields: embedFields([
          { name: 'Previous', value: previousUsername, inline: true },
          { name: 'New', value: event.username, inline: true },
          optionalField('Reason', event.reason, false),
        ]),
        footer,
      };
    }
  }
}

export function formatEventDiscordMessages(
  events: NotificationEvent[],
  forumBaseUrl: string,
  pollWindow?: { since: string; until: string }
): DiscordMessagePayload[] {
  if (events.length === 0) {return [];}

  const embeds = events.map((event) => formatEventEmbed(event, forumBaseUrl));
  const header = pollWindow
    ? events.length === 1
      ? `**1 forum event** between ${pollWindow.since} and ${pollWindow.until}.`
      : `**${events.length} forum events** between ${pollWindow.since} and ${pollWindow.until}.`
    : events.length === 1
      ? '**1 forum event** in this poll.'
      : `**${events.length} forum events** in this poll.`;

  const messages: DiscordMessagePayload[] = [];
  for (let i = 0; i < embeds.length; i += 10) {
    messages.push({
      content: i === 0 ? header : undefined,
      embeds: embeds.slice(i, i + 10),
    });
  }

  return messages;
}

export const forumNotifyDefaults = {
  DEFAULT_INITIAL_LOOKBACK_MINUTES,
  ALL_EVENT_TYPES,
};
