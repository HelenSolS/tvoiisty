
import { CUSTOM_SERVICE_URL, CUSTOM_SERVICE_KEY } from '../constants';

export const generateCustomImage = async (prompt: string): Promise<string | null> => {
  try {
    const response = await fetch(CUSTOM_SERVICE_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': CUSTOM_SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) throw new Error('Custom service failed');

    // Assuming the response returns an image URL or base64. 
    // Based on standard Imagen pattern, it's often a direct blob or JSON with b64.
    const data = await response.json();
    return data.image_url || data.base64 || null;
  } catch (error) {
    console.error("Custom Service failed:", error);
    return null;
  }
};
