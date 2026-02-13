
import { GoogleGenAI } from "@google/genai";

const getBase64Data = (dataUrl: string) => {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
};

export const describeOutfit = async (base64Image: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (e) {
    console.error("Gemini Generate Error:", e);
    throw e;
  }

  throw new Error("Не удалось сгенерировать изображение.");
};
