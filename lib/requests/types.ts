import type { RequestPriority, RequestStatus } from "./constants";

export type Person = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "admin" | "member";
  isActive: boolean;
};

export type BoardAccess = "team" | "requester";

export type Board = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Logo shown in dark mode (falls back to the light-mode logo). */
  logoDarkUrl: string | null;
  /** Logo shown in light mode (falls back to the dark-mode logo). */
  logoLightUrl: string | null;
};

export type RequestType = { key: string; name: string };

export type RequestComment = {
  id: string;
  body: string;
  authorId: string | null;
  isInternal: boolean;
  kind: "comment" | "status_change";
  createdAt: string;
};

export type RequestAttachment = {
  id: string;
  fileName: string;
  fileSize: number | null;
  uploadedBy: string | null;
  createdAt: string;
};

export type RequestItem = {
  id: string;
  boardId: string;
  number: number;
  code: string;
  title: string;
  description: string | null;
  status: RequestStatus;
  priority: RequestPriority;
  requestType: string | null;
  dueDate: string | null;
  requesterId: string | null;
  createdBy: string | null;
  sortOrder: number;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assigneeIds: string[];
  comments: RequestComment[];
  attachments: RequestAttachment[];
};

export type CurrentUserInfo = { id: string; isAdmin: boolean };
