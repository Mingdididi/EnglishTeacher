import React, { useState, useCallback } from 'react';
import SetupScreen from './components/SetupScreen';
import ActiveCallScreen from './components/ActiveCallScreen';
import FeedbackScreen from './components/FeedbackScreen';
import { AppState, Message, SessionFeedback } from './types';
import { startConversation, generateFeedbackReport } from './services/geminiService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [topic, setTopic] = useState<string>('');
  const [initialMessage, setInitialMessage] = useState<string>('');
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);

  const handleStartSession = useCallback(async (selectedTopic: string) => {
    setTopic(selectedTopic);
    // Show a loading state implicitly or explicit loading view
    // For simplicity, we keep setup view but maybe disable inputs, or switch to a loader.
    // Let's just switch to CALL_ACTIVE immediately but with a loading message? 
    // Better UX: Fetch first message then switch.
    
    try {
      // We can temporarily set a "loading" state here if we had one, but setup screen allows
      // some waiting. Let's just wait.
      const message = await startConversation(selectedTopic);
      setInitialMessage(message);
      setAppState(AppState.CALL_ACTIVE);
    } catch (error) {
      console.error("Failed to start session", error);
      alert("Failed to connect to Tutor. Please check your API key or internet.");
    }
  }, []);

  const handleEndSession = useCallback(async (history: Message[]) => {
    setAppState(AppState.FEEDBACK_LOADING);
    try {
      const report = await generateFeedbackReport(history);
      setFeedback(report);
      setAppState(AppState.FEEDBACK_VIEW);
    } catch (error) {
      console.error("Feedback generation failed", error);
      // Fallback
      setFeedback({
        overallComments: "Great practice session!",
        corrections: [],
        vocabulary: []
      });
      setAppState(AppState.FEEDBACK_VIEW);
    }
  }, []);

  const handleRestart = useCallback(() => {
    setTopic('');
    setFeedback(null);
    setAppState(AppState.SETUP);
  }, []);

  // Render Switch
  switch (appState) {
    case AppState.SETUP:
      return <SetupScreen onStart={handleStartSession} />;
      
    case AppState.CALL_ACTIVE:
      return (
        <ActiveCallScreen 
          topic={topic} 
          initialMessage={initialMessage} 
          onEndSession={handleEndSession} 
        />
      );
      
    case AppState.FEEDBACK_LOADING:
      return (
        <div className="flex flex-col items-center justify-center h-full bg-slate-50">
           <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
           <p className="text-slate-600 font-medium animate-pulse">Generating your class report...</p>
        </div>
      );
      
    case AppState.FEEDBACK_VIEW:
      return feedback ? <FeedbackScreen feedback={feedback} onRestart={handleRestart} /> : null;
      
    default:
      return null;
  }
};

export default App;