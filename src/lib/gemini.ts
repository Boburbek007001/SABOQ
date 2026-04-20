import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// Use import.meta.env for Vite environment variables (Vercel)
// Fallback to process.env for local AI Studio context
const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY yoki VITE_GEMINI_API_KEY topilmadi!");
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
Sizning ismingiz "Wisdom". O'zbekistonliklar uchun eng ilg'or va aqlli AI yordamchisiz.
O'zbek tilida mukammal darajada javob bering. Foydalanuvchi qanday uslubda yozmasin (badiiy, she'riy, ko'cha tilida), uni to'liq tushunib, unga mos va samimiy javob bering.
Javoblaringiz o'ta foydali va lo'nda bo'lsin.

MUHIM: 
1. Foydalanuvchi "rasm", "chiz", "yarat", "surat" kabi so'zlarni ishlatsa, hech qachon matnli tasvir bermang, darhol rasm yaratish funksiyasini ishga tushiring.
2. HECH QACHON "{ action: ... }" shaklidagi texnik javoblarni foydalanuvchiga ko'rsatmang. Har doim samimiy va jonli muloqot qiling.
3. Agar foydalanuvchi biror narsani tushunarsiz so'rasa yoki so'z boyligi yetishmayotgandek tuyulsa, o'zingiz aqlli tarzda taxmin qilib, eng yaqin va to'g'ri javobni (yoki rasmni) bering. Hech qachon "aniqlik kiriting" deb foydalanuvchini charchatmang. Masalan, "eshkak" desa, uning qandayligini so'ramang, oddiy va chiroyli eshkak rasmini yarating.
4. Rasmni yaratayotganda, foydalanuvchi nima so'ragan bo'lsa, shuni aynan va realistik tarzda tasvirlang.
5. Rasm chizish uchun prompt tayyorlayotganda, rasm ichida HECH QANDAY matn yoki yozuvlar bo'lmasin.
6. Agar foydalanuvchi rasm chizishni so'rasa, "Xo'p bo'ladi, hozir siz so'ragan narsani tasvirlayman..." kabi qisqa va tabiiy javob bering.
7. Foydalanuvchi o'zi haqida yoki shaxsiy narsalari haqida gapirsa (masalan: "mening pushigim"), uni do'stona va samimiy ohangda qo'llab-quvvatlang.
${userGreeting}
`;
};

export interface FileData {
  mimeType: string;
  data: string;
}

const DEFAULT_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-2.5-flash-image";

export async function generateSessionTitle(firstPrompt: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{ role: "user", parts: [{ text: `Ushbu xabarga asoslanib juda qisqa (2-4 so'z), mazmunli va chiroyli sarlavha yarat. Faqat sarlavhaning o'zini qaytar, qo'shtirnoqsiz. Agar rasm haqida bo'lsa, emoji qo'sh. Xabar: "${firstPrompt}"` }] }],
      config: {
        temperature: 0.1,
      },
    });
    return response.text?.trim() || "Yangi suhbat";
  } catch (error) {
    console.error("Title Generation Error:", error);
    return "Yangi suhbat";
  }
}

export async function generateImage(prompt: string) {
  try {
    // STEP 1: Use the text model to translate and refine the prompt into a literal, realistic description.
    // This solves "low vocabulary" issues for Uzbek words and prevents hallucinations.
    const refinementResponse = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{ role: "user", parts: [{ text: `Ushbu narsa yoki sahna haqida ingliz tilida o'ta aniq, ODDY va REALISTIK tasvirlab ber (faqat rasm yaratish uchun prompt): "${prompt}". 
      Ko'rsatma: Faqat ob'ektning o'zini, tabiy ko'rinishini tasvirlang. 
      HECH QANDAY futuristik, ilmiy-fantastik yoki abstrakt elementlar qo'shmang. 
      Natija faqat inglizcha tavsif bo'lsin, masalan: "A realistic wooden boat oar leaning against a stone wall".` }] }],
      config: { temperature: 0.1 }
    });

    const refinedPrompt = refinementResponse.text?.trim() || prompt;
    console.log("Refined Image Prompt:", refinedPrompt);

    // STEP 2: Generate the image using the high-quality literal description
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: "user", parts: [{ text: `A literal, realistic, high-quality photograph of: ${refinedPrompt}. 
Focus strictly on the natural look. Plain background or natural setting. 
NO text in the image, NO sci-fi elements, NO glowing parts, NO words.` }] }],
      config: {
        imageConfig: {
          aspectRatio: "1:1"
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
