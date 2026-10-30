import type { ExpenseStatus, ProjectPriority, ProjectStatus, SubtaskStatus } from "./constants";

export type Person = { id: string; name: string; email: string };

export type Subtask = {
  id: string;
  title: string;
  status: SubtaskStatus;
  assigneeId: string | null;
  dueDate: string | null;
  sortOrder: number;
};

export type Comment = {
  id: string;
  body: string;
  authorId: string | null;
  createdAt: string;
};

export type Expense = {
  id: string;
  description: string;
  vendor: string | null;
  status: ExpenseStatus;
  amountCents: number;
  expenseDate: string | null;
};

export type Project = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  projectType: string | null;
  client: string | null;
  startDate: string | null;
  dueDate: string | null;
  sortOrder: number;
  budgetCents: number;
  completedAt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  assigneeIds: string[];
  subtasks: Subtask[];
  comments: Comment[];
  expenses: Expense[];
};

export function projectCode(number: number) {
  return `F9-${number}`;
}
