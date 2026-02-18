export interface ClickUpUser {
  id: number;
  username: string;
  email: string;
  color: string;
  profilePicture: string | null;
  initials: string;
}

export interface ClickUpStatus {
  status: string;
  color: string;
  type: string;
  orderindex: number;
}

export interface ClickUpAttachment {
  id: string;
  date: string;
  title: string;
  type: number;
  source: number;
  version: number;
  extension: string;
  thumbnail_small: string | null;
  thumbnail_large: string | null;
  url: string;
}

export interface ClickUpTask {
  id: string;
  custom_id: string | null;
  name: string;
  text_content: string | null;
  description: string | null;
  status: ClickUpStatus;
  orderindex: string;
  date_created: string;
  date_updated: string;
  date_closed: string | null;
  date_done: string | null;
  creator: ClickUpUser;
  assignees: ClickUpUser[];
  watchers: ClickUpUser[];
  priority: {
    id: string;
    priority: string;
    color: string;
    orderindex: string;
  } | null;
  due_date: string | null;
  start_date: string | null;
  url: string;
  list: { id: string; name: string };
  project: { id: string; name: string };
  folder: { id: string; name: string };
  parent: string | null;
  subtasks?: ClickUpTask[]; // For UI organization
  attachments: ClickUpAttachment[];
}

export interface ClickUpComment {
  id: string;
  comment: Array<{ text: string }>;
  comment_text: string;
  user: ClickUpUser;
  date: string;
}

export interface ClickUpTeam {
  id: string;
  name: string;
  color: string;
  avatar: string | null;
  members: Array<{ user: ClickUpUser }>;
}

export interface DashboardFilter {
  onlyMyTasks: boolean; // Assigned to me
  includeCreatedByMe: boolean;
  includeFollowedByMe: boolean;
  search: string;
}