import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Message, SessionFeedback, PronunciationResult } from "../types";

// Using process.env.API_KEY as mandated
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_CHAT = 'gemini-2.5-flash';
const MODEL_TTS = 'gemini-2.5-flash-preview-tts';

// Helper to decode base64 audio
const decodeAudio = (base64String: string) => {
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Generates the initial greeting/question based on the topic.
 */
export const startConversation = async (topic: string): Promise<string> => {
  const prompt = `
    You are a professional but friendly English phone tutor.
    The user wants to practice talking about the topic: "${topic}".
    Start the class by greeting the user warmly and asking the first question related to the topic.
    Keep your response concise (under 30 words) and conversational.
    Do not number the question.
  `;

  const response = await ai.models.generateContent({
    model: MODEL_CHAT,
    contents: prompt,
  });

  return response.text || "Hello! I'm ready to practice English with you. What would you like to discuss?";
};

/**
 * Sends user message and gets the tutor's response + pronunciation analysis.
 */
export const sendChatMessage = async (
  currentHistory: Message[],
  newUserText: string,
  audioBase64: string | null,
  turnCount: number,
  maxTurns: number
): Promise<{ text: string; pronunciation?: PronunciationResult }> => {
  
  const historyPrompt = currentHistory.map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');
  const isLastTurn = turnCount >= maxTurns;

  // We use a JSON schema to get both the spoken response and the analysis cleanly
  const systemInstruction = `
    You are a phone English tutor.
    Current Turn: ${turnCount} of ${maxTurns}.
    
    Your tasks:
    1. Analyze the Student's input (audio and text). 
    2. Evaluate their pronunciation and intonation compared to a native speaker ONLY if audio is provided.
       - If audio is NOT provided, set pronunciationScore to -1 and pronunciationFeedback to "Text input".
    3. Check for grammar or vocabulary errors.
    4. Generate a natural conversational response.
       - If there is a significant error, briefly mention it naturally.
       - ${isLastTurn ? "Wrap up the conversation warmly. Do not ask a new question." : "Ask a follow-up question."}
    
    Input Context:
    History: ${historyPrompt}
    Student Text Transcript: ${newUserText}
    Student Audio: ${audioBase64 ? "[Attached]" : "[Not Provided - Text Input Only]"}
  `;

  const parts: any[] = [];
  
  // Add audio part if available
  if (audioBase64) {
    parts.push({
      inlineData: {
        mimeType: "audio/webm; codecs=opus", // Common container for MediaRecorder
        data: audioBase64
      }
    });
  }
  
  // Add text part
  parts.push({
    text: systemInstruction
  });

  const response = await ai.models.generateContent({
    model: MODEL_CHAT,
    contents: {
      parts: parts
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          conversationalResponse: { type: Type.STRING, description: "The text you will speak back to the student." },
          pronunciationScore: { type: Type.INTEGER, description: "Score 0-100 based on native-like accuracy. Use -1 if no audio." },
          pronunciationFeedback: { type: Type.STRING, description: "Specific advice on pronunciation. Use 'Text input' if no audio." }
        },
        required: ["conversationalResponse", "pronunciationScore", "pronunciationFeedback"]
      }
    }
  });

  try {
    const json = JSON.parse(response.text || "{}");
    
    // Filter out valid pronunciation results vs text-only placeholders
    let pronunciation: PronunciationResult | undefined;
    if (json.pronunciationScore !== undefined && json.pronunciationScore >= 0) {
      pronunciation = {
        score: json.pronunciationScore,
        feedback: json.pronunciationFeedback || "Good pronunciation."
      };
    }

    return {
      text: json.conversationalResponse || "I see. Please continue.",
      pronunciation
    };
  } catch (e) {
    console.error("Error parsing Gemini response", e);
    // Fallback
    return {
      text: response.text || "I heard you. Let's continue.",
    };
  }
};

/**
 * Generates audio from text using Gemini TTS.
 */
export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_TTS,
      contents: {
        parts: [{ text: text }]
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data received");
    }
    
    return decodeAudio(base64Audio);
  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};

/**
 * Generates the final structured feedback report.
 */
export const generateFeedbackReport = async (history: Message[]): Promise<SessionFeedback> => {
  // We pass the pronunciation feedback stored in messages to the final reviewer
  const historyText = history.map(m => {
    let entry = `${m.role}: ${m.text}`;
    if (m.pronunciation) {
      entry += `\n(Pronunciation Score: ${m.pronunciation.score}, Feedback: ${m.pronunciation.feedback})`;
    }
    return entry;
  }).join('\n---\n');

  const prompt = `
    Analyze the following English practice conversation history.
    Provide structured feedback for the student.
    
    History:
    ${historyText}
    
    Return JSON with:
    1. overallComments (string): General feedback on fluency and confidence.
    2. corrections (array): List of specific grammar/vocab errors.
    3. vocabulary (array): 3-5 useful advanced words.
    4. pronunciationReview (object): 'averageScore' (number 0-100) and 'tips' (array of strings) summarizing the pronunciation issues found in the history. Calculate average score ONLY from turns that have a score. If no audio was used, return 0 and "No audio provided" tip.
  `;

  const response = await ai.models.generateContent({
    model: MODEL_CHAT,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallComments: { type: Type.STRING },
          corrections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                corrected: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ["original", "corrected", "explanation"]
            }
          },
          vocabulary: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 word: { type: Type.STRING },
                 definition: { type: Type.STRING },
               },
               required: ["word", "definition"]
             }
          },
          pronunciationReview: {
            type: Type.OBJECT,
            properties: {
              averageScore: { type: Type.INTEGER },
              tips: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["averageScore", "tips"]
          }
        },
        required: ["overallComments", "corrections", "vocabulary", "pronunciationReview"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}") as SessionFeedback;
  } catch (e) {
    console.error("Failed to parse feedback JSON", e);
    return {
      overallComments: "Could not generate feedback.",
      corrections: [],
      vocabulary: [],
      pronunciationReview: { averageScore: 0, tips: [] }
    };
  }
};