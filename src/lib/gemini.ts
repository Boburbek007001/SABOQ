import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is missing!");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const getSystemInstruction = (userName?: string) => {
  const now = new Date();
  const timeStr = now.toLocaleString('uz-UZ', { 
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const userGreeting = userName ? `Foydalanuvchi ismi: ${userName}. Unga ismi bilan murojaat qiling.` : "";

  return `
Sizning ismingiz "Saboq". Siz o'zbekistonliklar uchun maxsus yaratilgan shaxsiy AI yordamchisiz.
Siz o'zbek, ingliz va rus tillarini mukammal bilasiz. 
O'zbek tilida gaplashganda samimiy, aqlli va yordamga tayyor bo'ling. 
Ruscha slanglar yoki inglizcha atamalar ishlatilganda ularni tabiiy ravishda tushuning va javob bering.
Sizning asosiy maqsadingiz foydalanuvchiga bilim berish, muammolarini hal qilish va uning shaxsiy rivojlanishiga yordam berishdir.
Javoblaringiz aniq, lo'nda va foydali bo'lishi kerak.

${userGreeting}
Hozirgi vaqt: ${timeStr} (Toshkent vaqti bilan).
Joriy yil: ${now.getFullYear()}.
Har doim joriy vaqt va sanaga asoslanib javob bering.
Siz Firebase Firestore bazasi bilan integratsiya qilingansiz, foydalanuvchi xabarlari bazaga saqlanadi.
`;
};

export interface FileData {
  mimeType: string;
  data: string;
}

const DEFAULT_MODEL = "gemini-3-flash-preview";

export async function generateResponse(prompt: string, history: any[] = [], userName?: string) {
  try {
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [...history, { role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: getSystemInstruction(userName),
        temperature: 0.7,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error (generateResponse):", error);
    return "Kechirasiz, xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.";
  }
}

export async function* generateStreamingResponse(
  prompt: string, 
  history: any[] = [],
  files: FileData[] = [],
  userName?: string
) {
  try {
    const parts: any[] = [];
    if (prompt.trim()) {
      parts.push({ text: prompt });
    }
    
    files.forEach(file => {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data
        }
      });
    });

    if (parts.length === 0) {
      yield "Iltimos, xabar yoki fayl yuboring.";
      return;
    }

    const responseStream = await ai.models.generateContentStream({
      model: DEFAULT_MODEL,
      contents: [...history, { role: "user", parts }],
      config: {
        systemInstruction: getSystemInstruction(userName),
        temperature: 0.7,
      },
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Gemini API Error (generateStreamingResponse):", error);
    yield "Kechirasiz, xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.";
  }
}
