import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message } from '../types';
import { sendChatMessage, generateSpeech } from '../services/geminiService';

interface ActiveCallScreenProps {
  topic: string;
  initialMessage: string;
  onEndSession: (history: Message[]) => void;
}

const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({ topic, initialMessage, onEndSession }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [textInput, setTextInput] = useState('');
  const [transcript, setTranscript] = useState('');
  const [turnCount, setTurnCount] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const MAX_TURNS = 5;

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, transcript]);

  // Focus input when switching to text mode
  useEffect(() => {
    if (inputMode === 'text' && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [inputMode]);

  // Initialize Audio Context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Initialize Speech Recognition & Media Recorder setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        startRecording(); // Start capturing actual audio
      };

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onend = () => {
        setIsListening(false);
        stopRecording(); // Stop capturing actual audio
      };
      
      recognitionRef.current = recognition;
    }
  }, []);

  // MediaRecorder Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); // Standard Chrome format
      
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
    } catch (e) {
      console.error("Error accessing microphone for recording:", e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  // Blob to Base64 helper
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix (e.g., "data:audio/webm;base64,")
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Function to play audio
  const playAudio = useCallback(async (arrayBuffer: ArrayBuffer) => {
    if (!audioContextRef.current) return;
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    setIsSpeaking(true);
    source.start(0);
    
    source.onended = () => {
      setIsSpeaking(false);
      
      // Auto-start listening only if in voice mode
      if (turnCount < MAX_TURNS) {
        if (inputMode === 'voice') {
          startListening();
        }
      } else {
        setTimeout(() => onEndSession(messages), 1500);
      }
    };
  }, [turnCount, messages, onEndSession, MAX_TURNS, inputMode]);

  // Initial load
  useEffect(() => {
    const start = async () => {
      const msg: Message = { role: 'model', text: initialMessage, timestamp: Date.now() };
      setMessages([msg]);
      
      try {
        const audioData = await generateSpeech(initialMessage);
        playAudio(audioData);
      } catch (e) {
        console.error("Initial TTS failed", e);
        // If TTS fails, just unlock controls
      }
    };
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = () => {
    if (recognitionRef.current && !isListening && !isProcessing && !isSpeaking) {
      try {
        setTranscript('');
        recognitionRef.current.start();
      } catch (e) {
        console.error("Already started", e);
      }
    }
  };

  const stopListeningAndSend = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    // Small delay to allow recorder to flush
    setTimeout(() => {
      if (transcript.trim().length > 0) {
        handleUserResponse(transcript, true);
      }
    }, 200);
  };

  const handleSendText = () => {
    if (textInput.trim().length > 0) {
      handleUserResponse(textInput, false);
      setTextInput('');
    }
  };

  const handleUserResponse = async (text: string, hasAudio: boolean) => {
    setIsProcessing(true);
    const userMsg: Message = { role: 'user', text: text, timestamp: Date.now() };
    
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setTranscript('');

    try {
      let audioBase64: string | null = null;
      if (hasAudio) {
         const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
         if (audioChunksRef.current.length > 0) {
             audioBase64 = await blobToBase64(audioBlob);
         }
      }

      const nextTurn = turnCount + 1;
      setTurnCount(nextTurn);

      const { text: responseText, pronunciation } = await sendChatMessage(newHistory, text, audioBase64, nextTurn, MAX_TURNS);
      
      // Update user message with pronunciation feedback (backfilling it into state)
      if (pronunciation) {
        setMessages(prev => {
           const updated = [...prev];
           updated[updated.length - 1].pronunciation = pronunciation; // Update last user message
           return updated;
        });
      }
      
      const modelMsg: Message = { role: 'model', text: responseText, timestamp: Date.now() };
      setMessages(prev => [...prev, modelMsg]);

      const audioData = await generateSpeech(responseText);
      await playAudio(audioData);
      
    } catch (error) {
      console.error("Error in loop", error);
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I had trouble connecting. Let's try again.", timestamp: Date.now() }]);
      setIsProcessing(false);
    } finally {
       setIsProcessing(false);
    }
  };

  const toggleMode = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    setInputMode(prev => prev === 'voice' ? 'text' : 'voice');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4 flex justify-between items-center shadow-sm z-10 shrink-0">
        <div>
          <h2 className="font-semibold text-slate-800">{topic}</h2>
          <p className="text-xs text-slate-500">Question {Math.min(turnCount + 1, MAX_TURNS)} / {MAX_TURNS}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isSpeaking || isListening ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></span>
          <span className="text-xs text-slate-600 font-medium">
            {isProcessing ? 'Thinking...' : isSpeaking ? 'Speaking...' : isListening ? 'Listening...' : 'Idle'}
          </span>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-slate-50/50">
        {messages.map((msg, idx) => (
          <div key={idx} className="flex flex-col gap-1">
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm 
                ${msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-br-none' 
                  : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'}`}
              >
                {msg.text}
              </div>
            </div>
            
            {/* Pronunciation Feedback Bubble - Only show if score exists */}
            {msg.role === 'user' && msg.pronunciation && msg.pronunciation.score >= 0 && (
              <div className="flex justify-end">
                 <div className="max-w-[75%] bg-amber-50 border border-amber-100 p-2 rounded-lg flex items-start gap-2">
                    <div className="bg-amber-100 p-1 rounded-full mt-0.5 shrink-0">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                       </svg>
                    </div>
                    <div>
                       <div className="text-[10px] uppercase font-bold text-amber-700 tracking-wider mb-0.5">Pronunciation Score: {msg.pronunciation.score}%</div>
                       <p className="text-xs text-amber-800">{msg.pronunciation.feedback}</p>
                    </div>
                 </div>
              </div>
            )}
          </div>
        ))}
        
        {isListening && transcript && (
           <div className="flex justify-end">
             <div className="max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed bg-indigo-400/50 text-white animate-pulse rounded-br-none">
               {transcript}
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Controls Area */}
      <div className={`bg-white border-t border-slate-200 transition-all duration-300 shrink-0 safe-area-pb ${inputMode === 'voice' ? 'h-40' : 'h-auto p-4'}`}>
        
        {/* Voice Mode Controls */}
        {inputMode === 'voice' && (
          <div className="h-full flex flex-col items-center justify-center relative">
            {isSpeaking && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                  <div className="w-32 h-32 bg-indigo-100 rounded-full animate-pulse-ring absolute"></div>
                  <div className="w-48 h-48 bg-indigo-50 rounded-full animate-pulse-ring delay-75 absolute"></div>
               </div>
            )}

            <div className="relative z-10 flex flex-col items-center gap-3 w-full px-8">
              <div className="flex items-center justify-between w-full">
                  <button onClick={toggleMode} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors" title="Switch to Keyboard">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </button>

                  <button
                    onClick={isListening ? stopListeningAndSend : startListening}
                    disabled={isSpeaking || isProcessing}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg 
                      ${isListening 
                        ? 'bg-red-500 text-white scale-110 ring-4 ring-red-200' 
                        : isSpeaking || isProcessing
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 ring-4 ring-indigo-50'
                      }`}
                  >
                    {isProcessing ? (
                       <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                         <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                         <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                       </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {isListening ? (
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /> 
                        ) : (
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        )}
                      </svg>
                    )}
                  </button>
                  
                   <div className="w-10"></div> {/* Spacer for alignment */}
              </div>
              
              <p className="text-xs text-slate-400 font-medium">
                {isListening ? 'Tap to send' : isSpeaking ? 'Listen...' : isProcessing ? 'Analyzing...' : 'Tap to speak'}
              </p>
            </div>
          </div>
        )}

        {/* Text Mode Controls */}
        {inputMode === 'text' && (
          <div className="flex items-center gap-2">
            <button onClick={toggleMode} className="p-3 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
            </button>
            <input 
              ref={textInputRef}
              type="text" 
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isProcessing && handleSendText()}
              placeholder="Type your answer..."
              disabled={isProcessing || isSpeaking}
              className="flex-1 bg-slate-100 border-none rounded-full px-4 py-3 text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
            />
            <button 
              onClick={handleSendText}
              disabled={!textInput.trim() || isProcessing || isSpeaking}
              className="p-3 rounded-full bg-indigo-600 text-white shadow-md disabled:opacity-50 disabled:shadow-none hover:bg-indigo-700 shrink-0"
            >
               {isProcessing ? (
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
               ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
               )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActiveCallScreen;