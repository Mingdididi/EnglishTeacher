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
 * FAST PATH: Gets only the conversational text response to reduce latency.
 */
export const getTutorResponse = async (
  currentHistory: Message[],
  newUserText: string,
  audioBase64: string | null,
  turnCount: number,
  maxTurns: number
): Promise<string> => {
  
  const historyPrompt = currentHistory.map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');
  const isLastTurn = turnCount >= maxTurns;

  const systemInstruction = `
    You are a phone English tutor.
    Current Turn: ${turnCount} of ${maxTurns}.
    
    Input Context:
    History: ${historyPrompt}
    Student Input: ${newUserText}
    ${audioBase64 ? "[Student provided audio]" : "[Student provided text only]"}
    
    Task:
    Generate a natural conversational response.
    - Keep it concise (under 40 words) so the conversation flows quickly.
    - ${isLastTurn ? "Wrap up the conversation warmly. Do not ask a new question." : "Ask a follow-up question."}
    - Do NOT include meta-data or analysis in this response. Just the spoken text.
  `;

  const parts: any[] = [];
  
  // Add audio part if available (so the model "hears" the user for context)
  if (audioBase64) {
    parts.push({
      inlineData: {
        mimeType: "audio/webm; codecs=opus",
        data: audioBase64
      }
    });
  }
  
  parts.push({ text: systemInstruction });

  try {
    const response = await ai.models.generateContent({
      model: MODEL_CHAT,
      contents: { parts: parts }
    });
    return response.text || "I see. Let's continue.";
  } catch (e) {
    console.error("Error getting tutor response", e);
    return "I'm having trouble connecting. Could you say that again?";
  }
};

/**
 * SLOW PATH: Analyzes pronunciation and grammar in the background.
 */
export const analyzeStudentInput = async (
  userText: string,
  audioBase64: string | null
): Promise<PronunciationResult | undefined> => {
  
  // If no audio, we can't really score pronunciation significantly
  if (!audioBase64) {
    return {
      score: -1,
      feedback: "Text input provided."
    };
  }

  const prompt = `
    Analyze the student's English speaking performance based on this audio and transcript.
    
    Transcript: ${userText}
    Audio: [Attached]
    
    Return JSON:
    {
      "score": number (0-100, rate based on native-like pronunciation and intonation),
      "feedback": string (short, specific advice on how to improve pronunciation or intonation. Max 15 words.)
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_CHAT,
      contents: {
        parts: [
          { inlineData: { mimeType: "audio/webm; codecs=opus", data: audioBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER },
            feedback: { type: Type.STRING }
          },
          required: ["score", "feedback"]
        }
      }
    });

    const json = JSON.parse(response.text || "{}");
    return {
      score: json.score ?? 0,
      feedback: json.feedback || "No feedback available."
    };
  } catch (e) {
    console.error("Analysis failed", e);
    return undefined;
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
  const historyText = history.map(m => {
    let entry = `${m.role}: ${m.text}`;
    if (m.pronunciation && m.pronunciation.score >= 0) {
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
