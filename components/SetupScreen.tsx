import React, { useState } from 'react';

interface SetupScreenProps {
  onStart: (topic: string) => void;
}

const SetupScreen: React.FC<SetupScreenProps> = ({ onStart }) => {
  const [topic, setTopic] = useState('');

  const handleStart = () => {
    if (topic.trim()) {
      onStart(topic);
    }
  };

  const suggestions = ["Travel plans", "My favorite movie", "Job interview practice", "Ordering food", "Daily routine"];

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-8 transform transition-all">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-indigo-600 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-indigo-200 mb-4">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Phone English</h1>
          <p className="text-slate-500">Powered by Gemini 2.5</p>
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">What's today's topic?</label>
          <input 
            type="text" 
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Business meeting, Weekend plans..."
            className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-lg"
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          />
          
          <div className="flex flex-wrap gap-2 mt-2">
             {suggestions.map(s => (
               <button 
                key={s}
                onClick={() => setTopic(s)}
                className="px-3 py-1 text-xs bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-colors"
               >
                 {s}
               </button>
             ))}
          </div>
        </div>

        <button 
          onClick={handleStart}
          disabled={!topic.trim()}
          className="w-full py-4 bg-indigo-600 text-white rounded-xl font-semibold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02]"
        >
          Start Call
        </button>
      </div>
    </div>
  );
};

export default SetupScreen;