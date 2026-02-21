# Варианты промптов (примерка и видео)

Используются в `api/generate-image.ts` и `api/generate-video.ts`.  
Если длинные промпты начнут ломать процесс — переключиться на **краткие** (ниже).

---

## Примерка (картинка)

### Краткий (запасной)

```
Use uploaded photos of the same person from different angles.
Preserve full identity and body proportions.
Replace current clothing with the provided outfit.
Reproduce exact color, material, and fit.
Realistic fabric folds and tension.
Natural neutral premium environment.
Soft directional lighting.
Fashion photography style.
Vertical frame.
```

---

## Видео

### Краткий (запасной)

```
Create a short 6–8 second cinematic fashion video based on the provided image.

Preserve exact facial identity and body proportions.
Preserve exact clothing appearance, colors, textures and fit.

Extend the dream of the person wearing this outfit.
Let the movement and environment emotionally amplify what this outfit represents.

Adapt the scene naturally depending on the style and mood of the outfit.
Sport outfits feel dynamic and energetic.
Elegant dresses feel graceful and cinematic.
Business outfits feel confident and powerful.
Casual outfits feel free and stylish.

Character performs natural movement that highlights the garment.
Fabric reacts realistically to motion.
Camera movement is smooth and cinematic.

Premium advertisement atmosphere.
High-end fashion commercial look.
No distortion of face or clothing.
```

---

*Сейчас в коде используются длинные промпты. Чтобы перейти на краткие — скажи «используй краткие форматы», подставлю эти тексты в константы в api/generate-image.ts и api/generate-video.ts.*
