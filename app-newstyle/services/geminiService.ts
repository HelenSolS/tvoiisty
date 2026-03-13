
import { GoogleGenAI } from "@google/genai";

const getAIClient = () => {
  const key = process.env.API_KEY;
  if (!key) {
    throw new Error("Requested entity was not found (API Key is missing)");
  }
  return new GoogleGenAI({ apiKey: key });
};

export const generateTryOnImage = async (
  userPhotoBase64: string,
  garmentPhotoBase64: string
): Promise<string | null> => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: userPhotoBase64.includes(',') ? userPhotoBase64.split(',')[1] : userPhotoBase64,
              mimeType: 'image/png',
            },
          },
          {
            inlineData: {
              data: garmentPhotoBase64.includes(',') ? garmentPhotoBase64.split(',')[1] : garmentPhotoBase64,
              mimeType: 'image/png',
            },
          },
          { text: "Act as a high-end virtual tailor. Photorealistically apply the garment from the second image onto the person in the first image. Match lighting, perspective, and skin tone. Output ONLY the resulting image." },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Gemini Try-On failed:", error);
    throw error;
  }
};

export const generatePostCaption = async (lookTitle: string, shopName: string, language: string = 'ru'): Promise<string> => {
  try {
    const ai = getAIClient();
    const prompt = language === 'ru' 
      ? `Напиши 3 коротких, дерзких и трендовых варианта подписи для поста в Instagram/TikTok. 
      Тема: примерка образа "${lookTitle}" от бренда "${shopName}" в приложении "Твой ИИ-стиль". 
      Используй эмодзи и хештеги #AIStyle #DigitalFashion #Style2026. Выдай только текст подписей.`
      : `Write 3 short, bold, and trendy caption options for an Instagram/TikTok post. 
      Topic: trying on the "${lookTitle}" look from the brand "${shopName}" in the "Your AI Style" app. 
      Use emojis and hashtags #AIStyle #DigitalFashion #Style2026. Output only the caption text.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "My new digital look! ✨ #AIStyle";
  } catch (error) {
    return "My new digital look! ✨ #AIStyle";
  }
};

export const generateMagicVideo = async (
  imageUri: string,
  prompt: string
): Promise<string | null> => {
  try {
    const ai = getAIClient();
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      image: {
        imageBytes: imageUri.includes(',') ? imageUri.split(',')[1] : imageUri,
        mimeType: 'image/png',
      },
      config: {
        numberOfVideos: 1,
        resolution: '1080p',
        aspectRatio: '9:16'
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) return null;
    
    const response = await fetch(downloadLink, {
      method: 'GET',
      headers: {
        'x-goog-api-key': process.env.API_KEY || '',
      },
    });
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Gemini Video failed:", error);
    throw error;
  }
};
