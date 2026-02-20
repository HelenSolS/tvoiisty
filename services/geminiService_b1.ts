import { GoogleGenAI } from "@google/genai";

const getBase64Data = (dataUrl: string) => {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
};

const getApiKey = () => {
  // Для Vite на Vercel используем именно этот способ
  // Мы используем 'as any', чтобы TypeScript не ругался на отсутствие типов env
  const env = (import.meta as any).env;
  const viteKey = env?.VITE_API_KEY;
  
  if (viteKey) return viteKey;

  // Запасной вариант для локальной разработки или других сред
  try {
    if (typeof process !== 'undefined' && process.env?.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {}

  return "";
};

export const describeOutfit = async (base64Image: string): Promise<string> => {
  const key = getApiKey();
  if (!key) throw new Error("Ключ API не найден. Проверьте настройки VITE_API_KEY в Vercel.");

  const ai = new GoogleGenAI({ apiKey: key });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: getBase64Data(base64Image),
            },
          },
          {
            text: "Действуй как профессиональный модный стилист. Опиши эту одежду максимально подробно: тип изделия, фасон, материал, цвет, текстура, вырез, длина рукавов и особые детали. Это описание будет использовано для ИИ-генерации примерки на человеке.",
          },
        ],
      },
    });

    return response.text || "Стильный образ";
  } catch (e) {
    console.error("Gemini Describe Error:", e);
    throw e;
  }
};

export const generateTryOn = async (
  personBase64: string,
  outfitBase64: string,
  outfitDescription: string
): Promise<string> => {
  const key = getApiKey();
  if (!key) throw new Error("Ключ API не найден.");

  const ai = new GoogleGenAI({ apiKey: key });

  const prompt = `
    ЗАДАЧА: ВИРТУАЛЬНАЯ ПРИМЕРКА ОДЕЖДЫ ВО ВЕСЬ РОСТ.
    1. ГЛАВНОЕ: Полностью сохрани лицо, прическу, телосложение, позу и фон человека с первого фото.
    2. ОДЕЖДА: Замени текущую одежду человека на образ со второго фото.
    3. ДЕТАЛИ ОБРАЗА: ${outfitDescription}.
    4. КАЧЕСТВО: Одежда должна сидеть идеально по фигуре, учитывая складки, тени и освещение сцены. Это фото в полный рост.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: getBase64Data(personBase64),
            },
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: getBase64Data(outfitBase64),
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "3:4"
        }
      }
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
  } catch (e) {
    console.error("Gemini Generate Error:", e);
    throw e;
  }

  throw new Error("Не удалось сгенерировать изображение.");
};
