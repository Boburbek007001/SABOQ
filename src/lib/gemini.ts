import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is missing!");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const SYSTEM_INSTRUCTION = `
Sizning ismingiz "Saboq". Siz o'zbekistonliklar uchun maxsus yaratilgan shaxsiy AI yordamchisiz.
Siz o'zbek, ingliz va rus tillarini mukammal bilasiz. 
O'zbek tilida gaplashganda samimiy, aqlli va yordamga tayyor bo'ling. 
Ruscha slanglar yoki inglizcha atamalar ishlatilganda ularni tabiiy ravishda tushuning va javob bering.
Sizning asosiy maqsadingiz foydalanuvchiga bilim berish, muammolarini hal qilish va uning shaxsiy rivojlanishiga yordam berishdir.
Javoblaringiz aniq, lo'nda va foydali bo'lishi kerak.
`;

export interface FileData {
  mimeType: string;
  data: string;
}

export async function generateResponse(prompt: string, history: { role: string; parts: { text: string }[] }[] = []) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [...history, { role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
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
  history: { role: string; parts: { text?: string; inlineData?: FileData }[] }[] = [],
  files: FileData[] = []
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
      model: "gemini-flash-latest",
      contents: [...history, { role: "user", parts }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
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
