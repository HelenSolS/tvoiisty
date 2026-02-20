// Загружаем одно изображение через /api/upload — отвечает быстро (без таймаута Vercel)
async function uploadImage(base64Data: string, index: number): Promise<string> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base64Data,
      fileName: `tryon-${Date.now()}-${index}.png`
    })
  });
  const data = await res.json();
  if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
  return data.url;
}

export async function describeOutfit(personImage: string, outfitImage: string): Promise<string> {
  return "Virtual try-on: dress the person in the outfit from the second image naturally.";
}

export async function generateTryOn(
  personImage: string,
  outfitImage: string,
  description: string
): Promise<string | null> {
  // 1. Загружаем оба изображения параллельно
  const [personUrl, outfitUrl] = await Promise.all([
    uploadImage(personImage, 0),
    uploadImage(outfitImage, 1)
  ]);

  console.log("Uploaded:", personUrl, outfitUrl);

  // 2. Создаём задачу KIE
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputUrls: [personUrl, outfitUrl],
      prompt: description
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Generate failed");
  if (!data.taskId) throw new Error("No taskId");

  const taskId = data.taskId;

  // 3. Polling каждые 3 сек, макс 90 сек
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));

    const poll = await fetch(`/api/status?taskId=${taskId}`, {
      cache: "no-store"
    });
    const pollData = await poll.json();

    const state = pollData?.data?.state;
    const resultJson = pollData?.data?.resultJson;

    console.log(`Poll ${i + 1}: state=${state}`);

    if (state === "success" && resultJson) {
      try {
        const parsed = JSON.parse(resultJson);
        const url = parsed?.resultUrls?.[0];
        if (url) return url;
      } catch (e) {
        throw new Error("Failed to parse resultJson");
      }
    }

    if (state === "fail") {
      throw new Error("KIE task failed: " + pollData?.data?.failMsg);
    }
  }

  throw new Error("Timeout: result not ready after 90 seconds");
}
