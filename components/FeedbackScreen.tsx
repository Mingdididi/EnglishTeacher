import React from 'react';
import { SessionFeedback } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface FeedbackScreenProps {
  feedback: SessionFeedback;
  onRestart: () => void;
}

const FeedbackScreen: React.FC<FeedbackScreenProps> = ({ feedback, onRestart }) => {
  
  // Use real average score if available. If user used text mostly, score might be 0.
  const avgScore = feedback.pronunciationReview?.averageScore || 0;
  const hasAudioPractice = avgScore > 0;

  // Mock trend data based on average, but ideally we'd pass real turn-by-turn data
  // For now, we just show a simple visualization if valid.
  const scoreData = [
    { name: 'Start', score: Math.max(0, avgScore - 10) },
    { name: 'Mid', score: avgScore },
    { name: 'End', score: Math.min(100, avgScore + 5) },
  ];

  return (
    <div className="h-full bg-slate-50 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
          <h2 className="text-2xl font-bold text-indigo-900 mb-2">Session Complete!</h2>
          <p className="text-slate-600">{feedback.overallComments}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Chart Section - Now Pronunciation Focus */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800 mb-1">Pronunciation Score</h3>
            
            {hasAudioPractice ? (
              <>
                <div className="flex items-end gap-2 mb-4">
                    <span className="text-4xl font-bold text-indigo-600">{feedback.pronunciationReview?.averageScore || '-'}</span>
                    <span className="text-sm text-slate-400 mb-1.5">/ 100</span>
                </div>
                <div className="h-32 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={scoreData}>
                        <defs>
                        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                        </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip 
                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                        cursor={{stroke: '#4f46e5', strokeWidth: 2}}
                        />
                        <Area type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                    </AreaChart>
                    </ResponsiveContainer>
                </div>
              </>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm text-center px-4">
                 No audio data recorded. Try using the microphone next time to get pronunciation scoring!
              </div>
            )}
            </div>

            {/* Pronunciation Tips */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Pronunciation Tips</h3>
                <ul className="space-y-3">
                    {feedback.pronunciationReview?.tips.length > 0 ? (
                        feedback.pronunciationReview.tips.map((tip, idx) => (
                            <li key={idx} className="flex gap-3 items-start text-sm text-slate-700">
                                <div className="min-w-[20px] h-5 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">!</div>
                                {tip}
                            </li>
                        ))
                    ) : (
                        <p className="text-slate-500 italic text-sm">
                           {hasAudioPractice ? "Excellent pronunciation! Keep it up." : "N/A for text sessions."}
                        </p>
                    )}
                </ul>
            </div>
        </div>

        {/* Corrections */}
        <div className="space-y-4">
           <h3 className="text-lg font-bold text-slate-800 px-1">Grammar & Phrasing</h3>
           {feedback.corrections.length === 0 ? (
             <div className="p-4 bg-green-50 rounded-xl text-green-700 text-center">Great job! No major errors detected.</div>
           ) : (
             feedback.corrections.map((item, idx) => (
               <div key={idx} className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-red-400">
                 <div className="mb-2">
                   <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">You said:</p>
                   <p className="text-slate-700 line-through decoration-red-400/50">{item.original}</p>
                 </div>
                 <div className="mb-2">
                   <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Better:</p>
                   <p className="text-green-800 font-medium">{item.corrected}</p>
                 </div>
                 <p className="text-sm text-slate-500 italic bg-slate-50 p-2 rounded mt-2">{item.explanation}</p>
               </div>
             ))
           )}
        </div>

        {/* Vocabulary */}
        <div className="space-y-4 pb-10">
          <h3 className="text-lg font-bold text-slate-800 px-1">Suggested Vocabulary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {feedback.vocabulary.map((vocab, idx) => (
              <div key={idx} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:border-indigo-200 transition-colors">
                <h4 className="text-indigo-600 font-bold text-lg mb-1">{vocab.word}</h4>
                <p className="text-sm text-slate-600">{vocab.definition}</p>
              </div>
            ))}
          </div>
        </div>

        <button 
          onClick={onRestart}
          className="w-full py-4 bg-slate-900 text-white rounded-xl font-semibold shadow-lg hover:bg-slate-800 transition-all sticky bottom-6"
        >
          Start New Session
        </button>
      </div>
    </div>
  );
};

export default FeedbackScreen;