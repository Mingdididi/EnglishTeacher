export enum AppState {
  SETUP = 'SETUP',
  CALL_ACTIVE = 'CALL_ACTIVE',
  FEEDBACK_LOADING = 'FEEDBACK_LOADING',
  FEEDBACK_VIEW = 'FEEDBACK_VIEW',
}

export interface PronunciationResult {
  score: number; // 0-100
  feedback: string; // Specific advice
}

export interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  pronunciation?: PronunciationResult;
}

export interface FeedbackItem {
  original: string;
  corrected: string;
  explanation: string;
}

export interface VocabularyItem {
  word: string;
  definition: string;
}

export interface SessionFeedback {
  overallComments: string;
  corrections: FeedbackItem[];
  vocabulary: VocabularyItem[];
  pronunciationReview: {
    averageScore: number;
    tips: string[];
  };
}

// Web Speech API types augmentation
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}