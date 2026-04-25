import React, { createContext, useContext, useReducer, type ReactNode } from 'react';

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  type?: 'chat_message' | 'hazard_report' | 'image';
  imageBase64?: string;
  analysis?: string | null;
  protocol?: string | null;
  status?: 'pending' | 'approved' | 'denied' | null;
}

type AppTab = 'overview' | 'chat' | 'info';

export interface AIRecommendation {
  id: string;
  analysis: string;
  protocol: string;
  status: 'pending' | 'approved' | 'denied';
  timestamp: number;
}

interface AppState {
  activeTab: AppTab;
  messages: ChatMessage[];
  recommendations: AIRecommendation[];  // add this
  activeTeamEmails: string[];
  joinRequest: {
    requestId: string;
    responderEmail: string;
  } | null;
  unreadChatCount: number;
  unreadInfoCount: number;
}

type Action =
  | { type: 'SET_ACTIVE_TAB'; payload: AppTab }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'MARK_CHAT_READ' }
  | { type: 'MARK_INFO_READ' }
  | { type: 'ADD_RECOMMENDATION'; payload: AIRecommendation }
  | { type: 'UPDATE_RECOMMENDATION'; payload: { id: string; status: 'approved' | 'denied' } }
  | { type: 'SHOW_JOIN_REQUEST'; payload: { requestId: string; responderEmail: string } }
  | { type: 'HIDE_JOIN_REQUEST' }
  | { type: 'LOAD_MESSAGES'; payload: ChatMessage[] }
  | { type: 'SET_ACTIVE_TEAM'; payload: string[] }
  | {
      type: 'UPDATE_MESSAGE';
      payload: {
        id: string;
        analysis?: string | null;
        protocol?: string | null;
        status?: 'pending' | 'approved' | 'denied' | null;
      };
    }
  | { type: 'CLEAR_MESSAGES' };
  

const initialState: AppState = {
  activeTab: 'overview',
  messages: [],
  unreadChatCount: 0,
  unreadInfoCount: 0,
  joinRequest: null,
  recommendations: [],
  activeTeamEmails: [],
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
    case 'ADD_RECOMMENDATION': {
      const exists = state.recommendations.some(r => r.id === action.payload.id);
      if (exists) return state;
      return {
        ...state,
        recommendations: [...state.recommendations, action.payload],
        unreadChatCount: state.activeTab === 'chat' ? state.unreadChatCount : state.unreadChatCount + 1,
      };
    }
    
    case 'UPDATE_RECOMMENDATION': {
      return {
        ...state,
        recommendations: state.recommendations.map(r =>
          r.id === action.payload.id ? { ...r, status: action.payload.status } : r
        ),
      };
    }
    case 'SHOW_JOIN_REQUEST':
  return { ...state, joinRequest: action.payload };

case 'HIDE_JOIN_REQUEST':
  return { ...state, joinRequest: null };

case 'LOAD_MESSAGES':
  // Replace messages entirely (for late join)
  return { ...state, messages: action.payload };
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.payload.id ? { ...message, ...action.payload } : message
        ),
      };
    case 'SET_ACTIVE_TEAM':
      return { ...state, activeTeamEmails: action.payload };
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

