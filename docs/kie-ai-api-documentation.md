# Руководство по KIE AI API для разработчиков

KIE AI предоставляет унифицированный доступ к множеству современных AI-моделей для генерации изображений, видео и музыки через единый API. Платформа выступает как агрегатор, позволяющий разработчикам работать с различными провайдерами через однородный интерфейс. В этом руководстве собрана документация по основным API, доступным через KIE, с практическими примерами использования для автоматизации рабочих процессов.

Платформа поддерживает четыре основные категории моделей: модели для работы с изображениями (включая 10 различных решений), модели для генерации видео (8 вариантов), модели для создания музыки и чат-модели для работы с текстом. Все API используют единый механизм аутентификации через Bearer-токен и следуют общему паттерну асинхронной обработки задач, что позволяет эффективно интегрировать их в автоматизированные системы.

## 1. Общая информация об API

### 1.1 Базовый URL и аутентификация

Все API-вызовы выполняются к базовому URL `https://api.kie.ai`. Для аутентификации используется Bearer-токен, который необходимо получить на сайте https://kie.ai/api-key. Токен передается в заголовке каждого запроса:

```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

Общий паттерн работы с API предполагает отправку запроса на создание задачи, получение идентификатора задачи (taskId), периодическую проверку статуса выполнения и получение результатов после успешного завершения. Такой подход особенно удолен для длительных операций генерации изображений и видео, где ожидание синхронного ответа нецелесообразно.

### 1.2 Статусы задач

Большинство API использует единую систему статусов для отслеживания выполнения задач. Статус задачи определяется полем `successFlag`, которое может принимать следующие значения в зависимости от конкретного API:

| Код статуса | Значение | Описание |
|-------------|----------|----------|
| 0 | GENERATING | Задача выполняется |
| 1 | SUCCESS | Успешно завершено |
| 2 | CREATE_TASK_FAILED | Ошибка создания задачи |
| 3 | GENERATE_FAILED | Ошибка генерации |

В некоторых API, например в Runway, используются текстовые статусы: `wait`, `queueing`, `generating`, `success`, `fail`. Понимание системы статусов критически важно для построения надежных автоматизированных систем, которые должны корректно обрабатывать как успешные, так и неудачные результаты генерации.

### 1.3 Общие ограничения

Существуют общие ограничения, применяемые ко всем API платформы. Сгенерированные файлы хранятся на серверах в течение 14 дней, после чего автоматически удаляются. URL для скачивания результатов действительны в течение ограниченного времени (обычно 10-20 минут), поэтому рекомендуется сразу загружать полученные файлы на собственное хранилище. Для языка промптов большинство API работает только с английским языком, хотя некоторые поддерживают автоматический перевод.

## 2. Генерация изображений

KIE AI предоставляет несколько API для генерации изображений, каждое из которых имеет свои особенности и сильные стороны. Рассмотрим наиболее популярные решения для различных сценариев использования.

### 2.1 GPT Image API (4o Image API)

GPT Image API от OpenAI представляет собой мощное решение для генерации изображений с возможностями редактирования и создания вариаций. Этот API идеально подходит для случаев, когда требуется высокая точность соответствия текстовому описанию и гибкость в работе с существующими изображениями.

**Базовый URL:** `https://api.kie.ai`

**Эндпоинт генерации изображения:**

```
POST /api/v1/gpt4o-image/generate
```

**Параметры запроса:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| prompt | string | Нет | Текстовое описание изображения |
| size | string | Да | Соотношение сторон: `1:1`, `3:2`, `2:3` |
| filesUrl | array | Нет | Массив URL входных изображений (до 5 файлов) |
| maskUrl | string | Нет | URL маски для редактирования |
| nVariants | integer | Нет | Количество вариаций: 1, 2 или 4 |
| isEnhance | boolean | Нет | Улучшение промпта (по умолчанию false) |
| enableFallback | boolean | Нет | Включить резервный механизм |
| callBackUrl | string | Нет | URL для webhook-уведомлений |

**Пример простейшего запроса на генерацию:**

```bash
curl -X POST "https://api.kie.ai/api/v1/gpt4o-image/generate" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene mountain landscape at sunset",
    "size": "1:1",
    "nVariants": 1
  }'
```

**Ответ сервера:**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_4o_abc123"
  }
}
```

**Пример запроса на редактирование изображения:**

```bash
curl -X POST "https://api.kie.ai/api/v1/gpt4o-image/generate" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "filesUrl": ["https://example.com/image.jpg"],
    "maskUrl": "https://example.com/mask.png",
    "prompt": "Replace sky with starry night",
    "size": "3:2"
  }'
```

Для редактирования используется маска, где черные области будут изменены, а белые — сохранены. Это позволяет точно контролировать, какие части изображения подвергаются модификации.

**Проверка статуса задачи:**

```
GET /api/v1/gpt4o-image/record-info?taskId=YOUR_TASK_ID
```

**Пример ответа со статусом:**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "successFlag": "1",
    "progress": "1.00",
    "response": {
      "result_urls": ["https://example.com/generated-image.png"]
    }
  }
}
```

Поле `progress` содержит значение от 0.00 до 1.00, позволяющее отслеживать прогресс выполнения. Поле `result_urls` массив с URL сгенерированных изображений.

### 2.2 Flux Kontext API

Flux Kontext API представляет собой высококачественное решение для генерации и редактирования изображений от Black Forest Labs. API поддерживает две модели: `flux-kontext-pro` (базовая версия) и `flux-kontext-max` (максимальное качество). Этот API особенно хорош для творческих задач и профессиональной работы с визуальным контентом.

**Эндпоинт генерации:**

```
POST https://api.kie.ai/api/v1/flux/kontext/generate
```

**Обязательные параметры:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| prompt | string | Текстовое описание изображения |

**Опциональные параметры:**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| aspectRatio | string | 16:9 | Соотношение сторон: 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, 16:21 |
| model | string | flux-kontext-pro | Модель: flux-kontext-pro или flux-kontext-max |
| outputFormat | string | jpeg | Формат вывода: jpeg или png |
| inputImage | string | - | URL изображения для редактирования |
| enableTranslation | boolean | true | Автоматический перевод промпта на английский |
| promptUpsampling | boolean | false | AI-улучшение промпта |
| safetyTolerance | integer | 2 | Уровень фильтрации (0-6 для генерации, 0-2 для редактирования) |
| callBackUrl | string | - | URL для webhook-уведомлений |

**Пример генерации изображения:**

```bash
curl -X POST "https://api.kie.ai/api/v1/flux/kontext/generate" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene mountain landscape at golden hour with snow-capped peaks",
    "aspectRatio": "16:9",
    "model": "flux-kontext-pro",
    "outputFormat": "png"
  }'
```

**Пример редактирования существующего изображения:**

```bash
curl -X POST "https://api.kie.ai/api/v1/flux/kontext/generate" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Add hot air balloons in the sky",
    "inputImage": "https://example.com/landscape.jpg",
    "aspectRatio": "16:9"
  }'
```

**Проверка статуса:**

```
GET https://api.kie.ai/api/v1/flux/kontext/record-info?taskId={taskId}
```

Параметр `safetyTolerance` интересен тем, что позволяет контролировать уровень модерации контента. Значение 0 означает максимально строгую модерацию, тогда как 6 разрешает практически любой контент. Для редактирования изображений допустимы только значения 0-2.

### 2.3 Grok Imagine API

Grok Imagine API от xAI предлагает возможности как для генерации изображений, так и для работы с видео. Это относительно новое решение на рынке, которое активно развивается и предлагает интересные возможности для создания контента.

**Эндпоинт создания задачи:**

```
POST https://api.kie.ai/api/v1/jobs/createTask
```

**Доступные модели:**

| Модель | Назначение |
|--------|------------|
| grok-imagine/text-to-image | Генерация изображения из текста |
| grok-imagine/image-to-image | Преобразование изображения |
| grok-imagine/upscale | Увеличение разрешения изображения |

**Параметры для text-to-image:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| model | string | Да | `grok-imagine/text-to-image` |
| input.prompt | string | Да | Текстовое описание |
| input.aspect_ratio | string | Нет | Соотношение сторон, например `3:2` |
| callBackUrl | string | Нет | URL для webhook |

**Пример запроса:**

```bash
curl --request POST \
  --url https://api.kie.ai/api/v1/jobs/createTask \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "grok-imagine/text-to-image",
    "callBackUrl": "https://your-domain.com/api/callback",
    "input": {
      "prompt": "Cinematic portrait of a woman sitting by a vinyl record player with warm lighting",
      "aspect_ratio": "3:2"
    }
  }'
```

**Ответ:**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_grok_12345678"
  }
}
```

## 3. Генерация видео

Генерация видео является одной из наиболее востребованных возможностей современных AI-систем. KIE AI предоставляет доступ к нескольким мощным решениям для создания видеоконтента, каждое из которых имеет свои уникальные характеристики и области применения.

### 3.1 Veo 3.1 API

Veo 3.1 от Google представляет собой одну из наиболее продвинутых моделей для генерации видео. API предоставляет доступ к функциям создания видео из текстовых описаний, преобразования изображений в видео, расширения существующих видео и получения видео в высоком разрешении.

**Базовый URL:** `https://api.kie.ai`

**Эндпоинт генерации видео:**

```
POST /api/v1/veo/generate
```

**Параметры запроса:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| prompt | string | Текстовое описание видео |
| model | string | `veo3` (качество) или `veo3_fast` (скорость) |
| aspect_ratio | string | Соотношение сторон, например `16:9` |
| imageUrls | array | Массив URL изображений для image-to-video |
| callBackUrl | string | URL для webhook-уведомлений |

**Пример генерации видео из текста:**

```bash
curl -X POST "https://api.kie.ai/api/v1/veo/generate" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cute cat playing in a garden with butterflies flying around",
    "model": "veo3",
    "aspect_ratio": "16:9",
    "callBackUrl": "https://your-site.com/callback"
  }'
```

**Важные характеристики Veo 3.1:**

- Время генерации: 2-5 минут
- Максимальная длина клипа: 8 секунд
- Поддерживаемые форматы изображений для image-to-video: JPG, PNG, WebP
- URL видео имеют срок действия — рекомендуется скачивать сразу

**Проверка статуса задачи:**

```
GET /api/v1/veo/record-info?taskId={taskId}
```

**Расшифровка статус-кодов:**

| successFlag | Статус |
|-------------|--------|
| 0 | Generating (выполняется) |
| 1 | Success (успешно завершено) |
| 2 | Failed (неудача) |
| 3 | Generation Failed (ошибка генерации) |

**Дополнительные эндпоинты Veo API:**

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/v1/veo/get-1080p-video?taskId={taskId}` | Получение видео в 1080p |
| POST | `/api/v1/veo/get-veo-3-4k-video` | Получение видео в 4K |
| POST | `/api/v1/veo/extend-video` | Расширение видео |
| GET | `/api/v1/veo/get-veo-3-video-details` | Получение деталей видео |

### 3.2 Kling 3.0 API

Kling 3.0 от Kuaishou представляет собой мощное решение для генерации видео с поддержкой расширенных функций, включая работу с элементами (elements), мультишоты и звуковое сопровождение. Этот API особенно интересен для создания профессионального видеоконтента.

**Эндпоинт:**

```
POST https://api.kie.ai/api/v1/jobs/createTask
```

**Заголовки запроса:**

```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| model | string | Да | `kling-3.0/video` |
| callBackUrl | string | Нет | URL для webhook-уведомлений |
| input.prompt | string | Нет | Текстовый промпт |
| input.image_urls | array | Нет | URL изображений для первого/последнего кадра |
| input.sound | boolean | Нет | Включить звуковые эффекты |
| input.duration | string | Нет | Длительность 3-15 секунд |
| input.aspect_ratio | string | Нет | `16:9`, `9:16`, `1:1` |
| input.mode | string | Нет | `std` (стандартный) или `pro` (повышенное качество) |
| input.multi_shots | boolean | Нет | Включить режим мультишотов |
| input.multi_prompt | array | Нет | Массив объектов {prompt, duration} |
| input.kling_elements | array | Нет | Определения элементов с именем, описанием, URL |

**Пример запроса:**

```bash
curl --request POST \
  --url https://api.kie.ai/api/v1/jobs/createTask \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "kling-3.0/video",
    "callBackUrl": "https://your-domain.com/api/callback",
    "input": {
      "prompt": "In a bright rehearsal room @element_dog",
      "image_urls": ["https://example.com/image.png"],
      "sound": true,
      "duration": "5",
      "aspect_ratio": "16:9",
      "mode": "pro",
      "multi_shots": false,
      "kling_elements": [{
        "name": "element_dog",
        "description": "A friendly golden retriever dog",
        "element_input_urls": ["https://example.com/dog1.jpeg"]
      }]
    }
  }'
```

Особенностью Kling API является система элементов (`kling_elements`), которая позволяет включать в сцену конкретные объекты или персонажи. Элементы определяются отдельно и затем ссылаются в промпте через синтаксис `@element_name`. Это обеспечивает более точный контроль над содержанием сгенерированного видео.

**Ответ:**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_kling-3.0_1765187774173"
  }
}
```

### 3.3 Sora 2 API

Sora 2 от OpenAI представляет собой эволюцию знаменитой модели генерации видео. API предоставляет несколько режимов работы для различных сценариев использования.

**Эндпоинт:**

```
POST https://api.kie.ai/api/v1/jobs/createTask
```

**Доступные модели:**

| Модель | Назначение |
|--------|------------|
| sora-2-text-to-video | Генерация видео из текста |
| sora-2-image-to-video | Преобразование изображения в видео |
| sora-2-pro-text-to-video | Генерация видео (профессиональное качество) |
| sora-2-pro-image-to-video | Профессиональное преобразование изображения в видео |
| sora-watermark-remover | Удаление водяного знака |
| sora-2-characters / sora-2-characters-pro | Работа с персонажами |
| sora-2-pro-storyboard | Создание раскадровки |

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| model | string | Да | Идентификатор модели |
| callBackUrl | string | Нет | URL для уведомлений о завершении |
| progressCallBackUrl | string | Нет | URL для обновлений прогресса |
| input.prompt | string | Да | Текстовое описание |
| input.aspect_ratio | string | Нет | Соотношение сторон (landscape, portrait и т.д.) |
| input.n_frames | string | Нет | Количество кадров |
| input.remove_watermark | boolean | Нет | Удалить водяной знак |
| input.upload_method | string | Нет | Метод загрузки (s3) |

**Пример запроса:**

```bash
curl --request POST \
  --url https://api.kie.ai/api/v1/jobs/createTask \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "sora-2-text-to-video",
    "callBackUrl": "https://your-domain.com/api/callback",
    "input": {
      "prompt": "A professor stands at the front of a lively classroom, writing on a whiteboard while students listen attentively",
      "aspect_ratio": "landscape",
      "n_frames": "10",
      "remove_watermark": true,
      "upload_method": "s3"
    }
  }'
```

### 3.4 Runway API

Runway API предоставляет возможности генерации и расширения видео через известную платформу для творческих профессионалов. API особенно удобен для интеграции в существующие рабочие процессы.

**Базовый URL:**

```
https://api.kie.ai/api/v1/runway
```

**Эндпоинт генерации видео:**

```
POST /generate
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|-----------|------|--------------|----------|
| prompt | string | Да | Текстовое описание видео |
| duration | number | Да | Длительность: 5 или 10 секунд |
| quality | string | Да | Качество: "720p" или "1080p" |
| aspectRatio | string | Да | Соотношение сторон |
| imageUrl | string | Нет | URL референсного изображения |
| waterMark | string | Нет | Текст водяного знака |
| callBackUrl | string | Нет | URL для webhook |

**Поддерживаемые соотношения сторон:** `16:9`, `9:16`, `1:1`, `4:3`, `3:4`

**Пример запроса:**

```bash
curl -X POST "https://api.kie.ai/api/v1/runway/generate" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat dancing gracefully in a modern studio with soft lighting",
    "duration": 5,
    "quality": "720p",
    "aspectRatio": "16:9"
  }'
```

**Проверка статуса:**

```
GET /record-detail?taskId={taskId}
```

**Статусы задачи:** `wait`, `queueing`, `generating`, `success`, `fail`

**Расширение видео:**

```
POST /extend
```

```bash
curl -X POST "https://api.kie.ai/api/v1/runway/extend" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "existing_task_id",
    "prompt": "Continue the scene",
    "quality": "720p"
  }'
```

**Важные ограничения:**

- Видео хранятся 14 дней
- Разрешение 1080p доступно только для 5-секундных видео
- Коды ответа: 200 (успех), 400 (ошибка запроса), 401 (не авторизован), 402 (недостаточно кредитов), 429 (превышен лимит)

### 3.5 Luma API

Luma API специализируется на модификации и трансформации существующих видео с помощью AI. Это отличает его от других API, которые фокусируются на генерации с нуля.

**Эндпоинт:**

```
POST https://api.kie.ai/api/v1/modify/generate
```

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| prompt | string | Да | Текстовое описание модификации |
| videoUrl | string | Да | URL входного видео |
| callBackUrl | string | Нет | URL для webhook |
| watermark | string | Нет | Идентификатор водяного знака |

**Ограничения:**

- Максимальный размер видео: 500MB
- Максимальная длительность: 10 секунд
- Язык промпта: только английский
- Видео должны быть доступны по публичным URL

**Пример запроса:**

```bash
curl -X POST "https://api.kie.ai/api/v1/modify/generate" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Transform the city into a futuristic cyberpunk landscape with neon lights",
    "videoUrl": "https://example.com/input-video.mp4",
    "callBackUrl": "https://your-callback-url.com/luma-callback"
  }'
```

**Ответ:**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "774d9a7dd608a0e49293903095e45a4c"
  }
}
```

**Проверка статуса:**

```
GET https://api.kie.ai/api/v1/modify/record-info?taskId={taskId}
```

**Расширенные статусы задачи:**

| Код | Статус | Описание |
|-----|--------|----------|
| 0 | GENERATING | Выполняется |
| 1 | SUCCESS | Успешно завершено |
| 2 | CREATE_TASK_FAILED | Ошибка создания задачи |
| 3 | GENERATE_FAILED | Ошибка генерации |
| 4 | CALLBACK_FAILED | Генерация успешна, но callback не доставлен |

## 4. Чат-модели

Помимо генерации мультимедиа, KIE AI предоставляет доступ к популярным языковым моделям для работы с текстом. Это позволяет создавать комплексные решения, объединяющие генерацию текста и визуального контента.

### 4.1 Доступные модели

Платформа поддерживает три основные семейства языковых моделей:

| Модель | Провайдер | Особенности |
|--------|-----------|-------------|
| GPT | OpenAI | Широкий спектр задач, включая анализ и генерацию текста |
| Claude | Anthropic | Высокое качество рассуждений, безопасность |
| Gemini | Google | Интеграция с экосистемой Google, мультимодальность |

### 4.2 Использование чат-моделей в автоматизации

Хотя конкретные эндпоинты для чат-моделей отличаются от мультимедийных API, общий паттерн использования остается аналогичным. Чат-модели особенно полезны в автоматизации для:

- Генерации промптов для изображений и видео
- Анализа и классификации визуального контента
- Создания описаний и метаданных
- Обработки пользовательских запросов

## 5. Практические примеры автоматизации

### 5.1 Генерация рекламного баннера

Рассмотрим сценарий автоматизации, где необходимо создать серию рекламных баннеров для различных продуктов. Используем GPT Image API для генерации и Python для автоматизации процесса.

```python
import requests
import time
import json

API_KEY = "YOUR_API_KEY"
BASE_URL = "https://api.kie.ai"

def create_image_task(prompt, size="1:1", n_variants=1):
    """Создание задачи на генерацию изображения"""
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    data = {
        "prompt": prompt,
        "size": size,
        "nVariants": n_variants,
        "isEnhance": True
    }
    
    response = requests.post(
        f"{BASE_URL}/api/v1/gpt4o-image/generate",
        headers=headers,
        json=data
    )
    
    return response.json()

def check_task_status(task_id):
    """Проверка статуса задачи"""
    headers = {"Authorization": f"Bearer {API_KEY}"}
    
    response = requests.get(
        f"{BASE_URL}/api/v1/gpt4o-image/record-info?taskId={task_id}",
        headers=headers
    )
    
    return response.json()

def wait_for_result(task_id, max_wait=120, interval=5):
    """Ожидание завершения задачи с таймаутом"""
    elapsed = 0
    
    while elapsed < max_wait:
        result = check_task_status(task_id)
        status = result.get("data", {}).get("successFlag")
        
        if status == "1":  # Success
            return result
        elif status in ("2", "3"):  # Failed
            raise Exception(f"Generation failed: {result}")
        
        time.sleep(interval)
        elapsed += interval
    
    raise TimeoutError(f"Task {task_id} timed out after {max_wait} seconds")

def generate_promotional_banner(product_name, style="modern"):
    """Автоматическая генерация рекламного баннера"""
    prompt = f"Professional promotional banner for {product_name}, {style} style, clean design"
    
    # Создаем задачу
    task = create_image_task(prompt, size="3:2", n_variants=2)
    task_id = task["data"]["taskId"]
    
    # Ждем результат
    result = wait_for_result(task_id)
    
    # Получаем URL изображений
    image_urls = result.get("data", {}).get("response", {}).get("result_urls", [])
    
    return image_urls

# Пример использования
if __name__ == "__main__":
    products = ["Smartphone X", "Wireless Earbuds", "Smart Watch"]
    
    for product in products:
        try:
            urls = generate_promotional_banner(product)
            print(f"{product}: {urls}")
        except Exception as e:
            print(f"Error for {product}: {e}")
```

### 5.2 Создание видеопрезентации

Автоматизация создания видеопрезентации с использованием нескольких API: сначала генерируем изображения с помощью Flux, затем создаем видео через Veo.

```python
import requests
import time
import json

API_KEY = "YOUR_API_KEY"
BASE_URL = "https://api.kie.ai"

class VideoPresentationBuilder:
    def __init__(self, api_key):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def generate_scene_image(self, prompt, aspect_ratio="16:9"):
        """Генерация изображения сцены через Flux"""
        data = {
            "prompt": prompt,
            "aspectRatio": aspect_ratio,
            "model": "flux-kontext-pro"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/v1/flux/kontext/generate",
            headers=self.headers,
            json=data
        )
        
        return response.json()
    
    def generate_video_from_image(self, image_url, action_description):
        """Создание видео из изображения через Veo"""
        data = {
            "prompt": action_description,
            "model": "veo3",
            "aspect_ratio": "16:9",
            "imageUrls": [image_url]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/v1/veo/generate",
            headers=self.headers,
            json=data
        )
        
        return response.json()
    
    def wait_for_veo_task(self, task_id, max_wait=300):
        """Ожидание генерации видео (может занимать до 5 минут)"""
        while max_wait > 0:
            response = requests.get(
                f"{BASE_URL}/api/v1/veo/record-info?taskId={task_id}",
                headers=self.headers
            )
            
            result = response.json()
            status = result.get("data", {}).get("successFlag")
            
            if status == 1:  # Success
                return result
            elif status in (2, 3):  # Failed
                raise Exception(f"Video generation failed: {result}")
            
            time.sleep(10)
            max_wait -= 10
        
        raise TimeoutError("Video generation timed out")

def create_product_video_presentation(product_name, features):
    """Создание видеопрезентации продукта"""
    builder = VideoPresentationBuilder(API_KEY)
    
    scenes = []
    
    for i, feature in enumerate(features):
        # Генерируем изображение для сцены
        image_result = builder.generate_scene_image(
            f"Product feature {i+1}: {feature}"
        )
        image_task_id = image_result["data"]["taskId"]
        
        # Ждем генерацию изображения
        # (упрощенная версия, в реальности нужен цикл ожидания)
        time.sleep(30)
        
        # Получаем URL изображения (нужно реализовать проверку статуса)
        # image_url = get_image_url(image_task_id)
        # Пока используем placeholder
        image_url = "https://example.com/generated_image.jpg"
        
        # Создаем видео для сцены
        video_result = builder.generate_video_from_image(
            image_url,
            f"Showcase {feature} in action"
        )
        
        video_task_id = video_result["data"]["taskId"]
        
        scenes.append({
            "feature": feature,
            "video_task_id": video_task_id
        })
    
    return scenes

# Пример использования
if __name__ == "__main__":
    product = "AI-Powered Smart Camera"
    features = ["4K resolution", "Night vision", "Motion detection", "Cloud storage"]
    
    try:
        presentation = create_product_video_presentation(product, features)
        print(f"Created {len(presentation)} video scenes")
        for scene in presentation:
            print(f"- {scene['feature']}: Task {scene['video_task_id']}")
    except Exception as e:
        print(f"Error: {e}")
```

### 5.3 Универсальный класс для работы с KIE API

Для упрощения работы с различными API можно создать универсальный класс-обертку, который инкапсулирует общую логику работы с задачами.

```python
import requests
import time
from typing import Dict, List, Optional, Any

class KIEAIClient:
    """Универсальный клиент для работы с KIE AI API"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.kie.ai"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    # === Методы для работы с задачами ===
    
    def wait_for_task(
        self,
        get_status_func,
        task_id: str,
        max_wait: int = 300,
        interval: int = 5,
        success_status: Any = 1
    ) -> Dict:
        """Универсальное ожидание завершения задачи"""
        elapsed = 0
        
        while elapsed < max_wait:
            result = get_status_func(task_id)
            status = result.get("data", {}).get("successFlag")
            
            if status == success_status:
                return result
            elif status in (2, 3, "2", "3"):
                raise Exception(f"Task failed: {result}")
            
            time.sleep(interval)
            elapsed += interval
        
        raise TimeoutError(f"Task {task_id} timed out after {max_wait}s")
    
    # === GPT Image API ===
    
    def generate_image(
        self,
        prompt: str,
        size: str = "1:1",
        n_variants: int = 1,
        enhance: bool = True,
        callback_url: Optional[str] = None
    ) -> str:
        """Генерация изображения через GPT Image API"""
        data = {
            "prompt": prompt,
            "size": size,
            "nVariants": n_variants,
            "isEnhance": enhance
        }
        if callback_url:
            data["callBackUrl"] = callback_url
        
        response = requests.post(
            f"{self.base_url}/api/v1/gpt4o-image/generate",
            headers=self.headers,
            json=data
        )
        
        return response.json()["data"]["taskId"]
    
    def get_image_task_status(self, task_id: str) -> Dict:
        """Получение статуса задачи генерации изображения"""
        response = requests.get(
            f"{self.base_url}/api/v1/gpt4o-image/record-info?taskId={task_id}",
            headers=self.headers
        )
        return response.json()
    
    def generate_image_with_result(
        self,
        prompt: str,
        size: str = "1:1",
        n_variants: int = 1
    ) -> List[str]:
        """Генерация изображения с ожиданием результата"""
        task_id = self.generate_image(prompt, size, n_variants)
        
        result = self.wait_for_task(
            self.get_image_task_status,
            task_id,
            success_status="1"
        )
        
        return result.get("data", {}).get("response", {}).get("result_urls", [])
    
    # === Flux Kontext API ===
    
    def flux_generate(
        self,
        prompt: str,
        aspect_ratio: str = "16:9",
        model: str = "flux-kontext-pro",
        input_image: Optional[str] = None
    ) -> str:
        """Генерация/редактирование изображения через Flux"""
        data = {
            "prompt": prompt,
            "aspectRatio": aspect_ratio,
            "model": model
        }
        
        if input_image:
            data["inputImage"] = input_image
        
        response = requests.post(
            f"{self.base_url}/api/v1/flux/kontext/generate",
            headers=self.headers,
            json=data
        )
        
        return response.json()["data"]["taskId"]
    
    def get_flux_task_status(self, task_id: str) -> Dict:
        """Получение статуса задачи Flux"""
        response = requests.get(
            f"{self.base_url}/api/v1/flux/kontext/record-info?taskId={task_id}",
            headers=self.headers
        )
        return response.json()
    
    # === Veo API ===
    
    def generate_video(
        self,
        prompt: str,
        model: str = "veo3",
        aspect_ratio: str = "16:9",
        image_urls: Optional[List[str]] = None,
        callback_url: Optional[str] = None
    ) -> str:
        """Генерация видео через Veo"""
        data = {
            "prompt": prompt,
            "model": model,
            "aspect_ratio": aspect_ratio
        }
        
        if image_urls:
            data["imageUrls"] = image_urls
        if callback_url:
            data["callBackUrl"] = callback_url
        
        response = requests.post(
            f"{self.base_url}/api/v1/veo/generate",
            headers=self.headers,
            json=data
        )
        
        return response.json()["data"]["taskId"]
    
    def get_veo_task_status(self, task_id: str) -> Dict:
        """Получение статуса задачи Veo"""
        response = requests.get(
            f"{self.base_url}/api/v1/veo/record-info?taskId={task_id}",
            headers=self.headers
        )
        return response.json()
    
    def generate_video_with_result(
        self,
        prompt: str,
        model: str = "veo3",
        aspect_ratio: str = "16:9",
        image_urls: Optional[List[str]] = None,
        max_wait: int = 300
    ) -> Dict:
        """Генерация видео с ожиданием результата"""
        task_id = self.generate_video(prompt, model, aspect_ratio, image_urls)
        
        result = self.wait_for_task(
            self.get_veo_task_status,
            task_id,
            max_wait=max_wait,
            success_status=1
        )
        
        return result.get("data", {})
    
    # === Runway API ===
    
    def runway_generate(
        self,
        prompt: str,
        duration: int = 5,
        quality: str = "720p",
        aspect_ratio: str = "16:9",
        image_url: Optional[str] = None
    ) -> str:
        """Генерация видео через Runway"""
        data = {
            "prompt": prompt,
            "duration": duration,
            "quality": quality,
            "aspectRatio": aspect_ratio
        }
        
        if image_url:
            data["imageUrl"] = image_url
        
        response = requests.post(
            f"{self.base_url}/api/v1/runway/generate",
            headers=self.headers,
            json=data
        )
        
        return response.json()["data"]["taskId"]
    
    def get_runway_task_status(self, task_id: str) -> Dict:
        """Получение статуса задачи Runway"""
        response = requests.get(
            f"{self.base_url}/api/v1/runway/record-detail?taskId={task_id}",
            headers=self.headers
        )
        return response.json()
    
    # === Kling API ===
    
    def kling_generate(
        self,
        prompt: str,
        duration: str = "5",
        aspect_ratio: str = "16:9",
        mode: str = "pro",
        sound: bool = True,
        image_urls: Optional[List[str]] = None,
        elements: Optional[List[Dict]] = None
    ) -> str:
        """Генерация видео через Kling"""
        data = {
            "model": "kling-3.0/video",
            "input": {
                "prompt": prompt,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                "mode": mode,
                "sound": sound
            }
        }
        
        if image_urls:
            data["input"]["image_urls"] = image_urls
        if elements:
            data["input"]["kling_elements"] = elements
        
        response = requests.post(
            f"{self.base_url}/api/v1/jobs/createTask",
            headers=self.headers,
            json=data
        )
        
        return response.json()["data"]["taskId"]
    
    def get_kling_task_status(self, task_id: str) -> Dict:
        """Получение статуса задачи Kling"""
        response = requests.get(
            f"{self.base_url}/market/common/get-task-detail?taskId={task_id}",
            headers=self.headers
        )
        return response.json()


# === Пример использования ===

if __name__ == "__main__":
    client = KIEAIClient("YOUR_API_KEY")
    
    # Пример 1: Генерация изображения
    print("Generating image...")
    image_urls = client.generate_image_with_result(
        prompt="A futuristic cityscape at sunset",
        size="16:9"
    )
    print(f"Image URLs: {image_urls}")
    
    # Пример 2: Генерация видео
    print("Generating video...")
    video_result = client.generate_video_with_result(
        prompt="A drone flying over mountains",
        aspect_ratio="16:9",
        max_wait=300
    )
    print(f"Video result: {video_result}")
```

## 6. Рекомендации по использованию

### 6.1 Выбор API для конкретных задач

При выборе API следует учитывать несколько факторов: качество результата, скорость генерации, стоимость и доступные возможности. Для генерации статических изображений рекомендуется использовать GPT Image API при необходимости редактирования существующих изображений или Flux Kontext для создания новых с высокой детализацией. Для видео Veo 3.1 подходит для большинства задач, тогда как Kling 3.0 лучше выбирать при необходимости работы с элементами и мультишотами, а Sora 2 — для творческих проектов.

### 6.2 Оптимизация производительности

Для повышения эффективности автоматизированных систем рекомендуется использовать асинхронный подход с webhook-уведомлениями вместо polling-механизма. Это снижает нагрузку на сеть и уменьшает задержки. Также следует реализовывать повторные попытки (retry) при временных сбоях с экспоненциальной задержкой. Кэширование успешно сгенерированных результатов позволяет избежать повторных вызовов для идентичных запросов.

### 6.3 Обработка ошибок

Различные API могут возвращать разные коды ошибок, но есть общие принципы обработки. Код 401 означает проблемы с аутентификацией и требует проверки токена. Код 402 указывает на недостаточно средств на аккаунте. Код 429 сигнализирует о превышении лимита запросов — следует implement задержку перед повторной попыткой. Код 500 и выше свидетельствует о проблемах на стороне сервиса — рекомендуется повторить запрос позже.

### 6.4 Безопасность

При работе с API следует придерживаться нескольких правил безопасности. Никогда не публикуйте API-ключи в исходном коде, репозиториях или клиентских приложениях. Используйте переменные окружения или системы управления секретами. Устанавливайте минимально необходимые права доступа для API-ключей. Регулярно ротируйте ключи и отзывайте неиспользуемые.

## Заключение

KIE AI предоставляет мощную и гибкую платформу для интеграции современных AI-возможностей в автоматизированные системы. Благодаря единому интерфейсу и разнообразию поддерживаемых моделей, разработчики могут создавать комплексные решения для генерации изображений, видео и обработки мультимедиа. Представленные в этом руководстве примеры и рекомендации помогут быстро начать работу с API и построить надежные автоматизированные рабочие процессы.

Для получения дополнительной информации рекомендуется обращаться к официальной документации на https://docs.kie.ai/ и следить за обновлениями платформы, которая активно развивается и добавляет новые возможности.