export interface User {
  id: string;
  username: string;
}

export interface ChatMessage {
  from_username: string;
  body: string;
}

export type Dialogs = Record<string, ChatMessage[]>;