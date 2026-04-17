import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is missing!");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const getSystemInstruction = (userName?: string) => {
  const now = new Date();
  const timeStr = now.toLocaleString('uz-UZ', { 
    timeZone: 'Asia/Tashkent',
    hour: '2-digit', 
    minute: '2-digit'
  });
  
  const userGreeting = userName ? `Foydalanuvchi: ${userName}.` : "";

  return `
Sizning ismingiz "Saboq". O'zbekistonliklar uchun shaxsiy AI yordamchisiz.
Javoblaringiz juda tez, aniq va lo'nda bo'lishi kerak.
Ortiqcha gapirmang. Salomga alik oling. 
Vaqtni faqat so'ralsa ayting: ${timeStr}.
${userGreeting}

MUHIM: Faqat oddiy matn formatida javob bering. Hech qanday JSON, kodli buyruqlar yoki "action" (tool call) formatidag matnlarni ishlatmang.
Agar foydalanuvchi rasm so'rasa, unga tizim rasm chizishini aytib, kuttiring (tizim buni avtomatik ushlaydi).
`;
};

export interface FileData {
  mimeType: string;
  data: string;
}

const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";
const IMAGE_MODEL = "gemini-2.5-flash-image";

export async function generateImage(prompt: string) {
  try {
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: "user", parts: [{ text: `Create an image based on this description: ${prompt}` }] }],
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "512px"
        }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error("No parts in response");

    const imagePart = parts.find(p => p.inlineData);
    if (!imagePart || !imagePart.inlineData) {
      const textPart = parts.find(p => p.text);
      return { text: textPart?.text || "Kechirasiz, rasm yarata olmadim." };
    }

    return { 
      imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
      text: "Mana, so'ragan rasmingiz:" 
    };
  } catch (error) {
    console.error("Image Generation Error:", error);
    return { error: "Rasm yaratishda xatolik yuz berdi." };
  }
}

export async function generateResponse(prompt: string, history: any[] = [], userName?: string) {
  try {
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [...history, { role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: getSystemInstruction(userName),
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error (generateResponse):", error);
    return "Xatolik yuz berdi.";
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
      yield "Xabar yozing.";
      return;
    }

    const responseStream = await ai.models.generateContentStream({
      model: DEFAULT_MODEL,
      contents: [...history, { role: "user", parts }],
      config: {
        systemInstruction: getSystemInstruction(userName),
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }
      },
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Gemini API Error (generateStreamingResponse):", error);
    yield "Xatolik yuz berdi.";
  }
}
