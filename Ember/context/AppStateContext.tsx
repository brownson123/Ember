import React, { createContext, useContext, useReducer, type ReactNode } from 'react';

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
}

type AppTab = 'overview' | 'chat' | 'info';

interface AppState {
  activeTab: AppTab;
  messages: ChatMessage[];
  unreadChatCount: number;
  unreadInfoCount: number;
}

type Action =
  | { type: 'SET_ACTIVE_TAB'; payload: AppTab }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'MARK_CHAT_READ' }
  | { type: 'MARK_INFO_READ' }
  | { type: 'CLEAR_MESSAGES' };

const initialState: AppState = {
  activeTab: 'overview',
  messages: [],
  unreadChatCount: 0,
  unreadInfoCount: 0,
};

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };
    case 'ADD_MESSAGE': {
      const exists = state.messages.some((message) => message.id === action.payload.id);
      if (exists) return state;

      const isChatActive = state.activeTab === 'chat';
      return {
        ...state,
        messages: [...state.messages, action.payload],
        unreadChatCount: state.unreadChatCount + (isChatActive ? 0 : 1),
      };
    }
    case 'MARK_CHAT_READ':
      return { ...state, unreadChatCount: 0 };
    case 'MARK_INFO_READ':
      return { ...state, unreadInfoCount: 0 };
    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };
    default:
      return state;
  }
}

interface AppStateContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return <AppStateContext.Provider value={{ state, dispatch }}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
}

