export const DEFAULT_PROJECT_ID = 'default';
export const DEFAULT_PROJECT_TITLE = '默认项目';
export const DEFAULT_PROJECT_ICON = '📁';

export interface ProgressProject {
  id: string;
  title: string;
  icon: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
