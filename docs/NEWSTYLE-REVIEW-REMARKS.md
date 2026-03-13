# Замечания по проекту newstyle (ревизия для инвестора)

Ревизия репозитория `/Users/lena/newstyle`: аналог примерочной tvoiisty с отдельным сервером. Ниже — что сделано неправильно и почему примерки с залитыми пользователем фото не работают или дают «жуткие» ошибки.

---

## 1. Критично: миграция и код разъехались (схема БД vs контроллеры/воркеры)

**Миграция `002_align_core_mvp.sql`:**
- Удаляет таблицу **`user_photos`** (п.5).
- В **`tryon_sessions`** вводит **`person_asset_id`** (ссылка на `media_assets`), удаляет **`photo_id`**.
- В **`media_assets`** переименовывает `url` → **`original_url`**, `owner_id` → **`owner_user_id`**.
- В **`looks`** переименовывает `image_asset_id` → **`main_asset_id`**.
- В **`tryon_sessions`** переименовывает `result_asset_id` → **`result_image_asset_id`**, `video_asset_id` → **`result_video_asset_id`**.

**Код после миграции не обновлён:**

| Где | Что использует код | Что есть после 002 | Итог |
|-----|--------------------|--------------------|------|
| tryonController, tryonWorker | Таблица **user_photos**, поле **photo_id** | Таблицы нет, поля нет | Ошибка «relation "user_photos" does not exist» или «column photo_id does not exist» |
| tryonController, tryonWorker | **l.image_asset_id** в JOIN с looks | Столбец переименован в **main_asset_id** | Ошибка «column image_asset_id does not exist» |
| tryonController, tryonWorker, videoWorker | **m.url**, **INSERT (url, owner_id)** в media_assets | Есть только **original_url**, **owner_user_id** | Ошибки при SELECT/INSERT в media_assets |
| tryonController, tryonWorker, videoWorker | **result_asset_id**, **video_asset_id** в tryon_sessions | Переименованы в **result_image_asset_id**, **result_video_asset_id** | Ошибки при UPDATE/SELECT |
| historyController | **m_result.url**, **t.result_asset_id**, **t.video_asset_id** | **original_url**, **result_image_asset_id**, **result_video_asset_id** | Ошибки при запросах истории |
| videoWorker | **t.result_asset_id**, **m.url**, **owner_id** | Те же переименования | Ошибки при генерации видео |

**Итог:** если миграция 002 применена, весь пайплайн примерки и видео обращается к несуществующим таблицам/полям → сервер не может делать примерки и выдаёт SQL-ошибки. Нужно либо откатить 002 и жить на старой схеме, либо **привести весь код** (tryonController, tryonWorker, videoWorker, historyController) в соответствие с 002: убрать user_photos, использовать person_asset_id, original_url, owner_user_id, main_asset_id, result_image_asset_id, result_video_asset_id.

---

## 2. Критично: загрузка фото не создаёт запись для «обычной» примерки

**POST /api/tryon** ожидает в теле **photoId** и **lookId**. В контроллере:
- Проверяется: `SELECT id FROM user_photos WHERE id = $1 AND user_id = $2`.
- Далее JOIN: `tryon_sessions` → **user_photos** (photo_id) → **media_assets** (person_url).

**POST /api/media/upload** (mediaController) при загрузке фото пользователя:
- Пишет только в **media_assets** (id, type 'user_photo', original_url, …).
- В **user_photos** ничего не вставляет.

В результате:
- Фронт после загрузки получает **id = media_assets.id**.
- В примерку он отправляет этот же id как **photoId**.
- Бэкенд ищет **user_photos.id = photoId** → такой строки нет (user_photos не заполняется при upload) → ответ **404 «Фото не найдено»**.

Даже без миграции 002: для работы «обычного» POST /api/tryon нужно, чтобы после каждой загрузки фото создавалась запись в **user_photos** (user_id, asset_id = id из media_assets), и фронт отправлял в примерку **user_photos.id**, а не media_assets.id. Либо API примерки должен принимать **person_asset_id** (media_assets.id) и не использовать user_photos вообще — тогда контроллер и воркер нужно переписать под работу только с media_assets (как в миграции 002).

---

## 3. Примерка только по lookId, без своего «гардероба» по URL

**POST /api/tryon** принимает только **photoId** и **lookId**. Параметра **clothing_image_url** (как в tvoiisty) нет.

На фронте (App.tsx) для примерки:
- Берётся выбранное фото одежды (garment) как **URL**.
- **lookId** вычисляется так: `backendLooks.find(l => l.imageUrl === garment)?.id`.
- **backendLooks** приходят из **GET /api/looks** (каталог образов с сервера).

Следствия:
- Примерка возможна только если пользователь выбрал **образ из каталога looks** (тот же URL, что вернул бэкенд).
- Если пользователь загрузил своё фото одежды (или выбрал картинку не из каталога), в **backendLooks** совпадения по URL не будет → **lookId = null** → ошибка «no-looks-available» и примерка не запускается.

**Что не так:** нет сценария «своя одежда по URL/asset» без обязательного создания look. В tvoiisty для этого есть **clothing_image_url** в POST /api/tryon. В newstyle либо нужно добавить поддержку **clothing_image_url** (и на бэкенде брать URL одежды из тела запроса), либо при загрузке фото одежды автоматически создавать look и отдавать фронту его id.

---

## 4. Два разных контракта примерки (путаница photoId)

- **POST /api/tryon** в коде описан как работа с **user_photos.id** (photoId) и **looks.id** (lookId). Upload возвращает **media_assets.id** → без создания user_photos или смены контракта примерка не сходится (п. 2).
- **POST /api/simple-tryon** принимает **photoId** и **garmentPhotoId** и в коде явно трактует их как **media_assets.id** (проверка по media_assets, type 'user_photo', owner_user_id). Для simple-tryon создаётся временный look по garment asset.

В итоге один и тот же «photoId» в одном эндпоинте — это user_photos.id, в другом — media_assets.id. Фронт (App.tsx) дергает **POST /api/tryon** и передаёт id из upload (media_assets.id) → получается несовместимость (п. 2). Нужно единый контракт: либо везде person_asset_id (media_assets.id), либо везде user_photos.id с созданием user_photos при upload.

---

## 5. Обязательный X-User-Id и анонимные пользователи

Все эндпоинты (tryon, media, looks, history) требуют заголовок **X-User-Id**. При его отсутствии возвращается 400. Для демо/инвестора часто нужна возможность попробовать примерку без регистрации; в tvoiisty для демо разрешена работа без авторизации (user_id может быть null). Стоит либо ослабить требование для демо (например, опциональный X-User-Id с дефолтным анонимным id), либо явно документировать, что без заголовка API не работает.

---

## 6. Fal: формат тела запроса может не совпадать с API

В **falTryonService.ts** в Fal уходит:
```json
{ "prompt": "...", "image_urls": [personImageUrl, clothingImageUrl] }
```
В tvoiisty (и в актуальной доке Fal) для nano-banana часто используют **person_image_url** и **clothing_image_url** (и опционально **preserve_pose**). Нужно свериться с текущей документацией Fal: если API ожидает именно person_image_url/clothing_image_url, то image_urls может приводить к ошибкам или неверному результату. Плюс отсутствие **preserve_pose** может ухудшить качество примерки.

---

## 7. KIE: модель и формат input

В **kieTryonService.ts** захардкожена модель **gemini-3.0-pro-image** и input с **image_urls**. В tvoiisty для примерки через KIE используется совместимый с KIE формат (в т.ч. **input_urls** там, где API это требует) и модель из конфига/настроек. Стоит проверить по актуальной доке KIE: правильное имя модели и поля (image_urls vs input_urls и т.д.), и вынести модель в конфиг.

---

## 8. Нет доставки результата при сбое хранилища (mirror)

В tvoiisty заложено правило: если провайдер вернул картинку, пользователь её получает даже при падении mirror в своё хранилище (URL сохраняется в result_meta). В newstyle после успешного Fal/KIE вызывается **mirrorFromUrl**; при его ошибке весь запрос падает, и пользователь не видит результат. Имеет смысл по аналогии с tvoiisty при ошибке mirror сохранять URL провайдера в сессии и отдавать его в ответе GET /api/tryon/:id.

---

## 9. Ошибки для пользователя и логирование

В tvoiisty для клиента отдаётся нейтральное сообщение («Не удалось выполнить примерку. Попробуйте позже.»), а детали (провайдер, таймаут, квота) только в логах. В newstyle в ряде мест в ответ уходит сырой текст ошибки или общее «Ошибка примерки» без структурированного логирования (например [tryon] ALERT с причиной). Стоит единообразно: пользователю — нейтральный текст, в лог — причина (Fal/KIE, таймаут, 402, и т.д.) для диагностики.

---

## 10. Видео: логика getTryonVideoStatus и дублирование job

В **getTryonVideoStatus** при state === 'completed' у job возвращается `status: 'failed'` (очевидная опечатка/инверсия). Плюс видеозадача хранится в очереди (BullMQ); при повторном запросе видео старый результат удаляется (DELETE media_assets, обнуление video_asset_id), затем добавляется новая job — нужно убедиться, что повторные вызовы не создают дубликатов заданий и что статус «completed» корректно возвращает videoUrl.

---

## 11. Краткий чеклист исправлений (по приоритету)

1. **Привести код в соответствие с миграцией 002** (или откатить 002): убрать использование user_photos, photo_id, url, owner_id, image_asset_id, result_asset_id, video_asset_id; использовать person_asset_id, original_url, owner_user_id, main_asset_id, result_image_asset_id, result_video_asset_id во всех контроллерах и воркерах.
2. **Связать загрузку фото с примеркой:** либо создавать user_photos при upload и принимать в POST /api/tryon user_photos.id, либо везде перейти на person_asset_id (media_assets.id) и убрать user_photos из логики примерки.
3. **Поддержать примерку «своей» одежды:** ввести в POST /api/tryon параметр **clothing_image_url** (или garment_asset_id) и на бэкенде брать URL одежды из тела/media_assets, не требуя обязательного lookId; либо при загрузке одежды создавать look и отдавать его id фронту.
4. **Унифицировать контракт:** один тип идентификатора фото человека (person_asset_id или user_photos.id) для всех эндпоинтов и документировать его.
5. **Fal:** проверить формат тела (person_image_url/clothing_image_url, preserve_pose) по актуальной доке.
6. **KIE:** проверить модель и формат input (image_urls/input_urls), вынести модель в конфиг.
7. **Доставка результата при сбое mirror:** сохранять URL провайдера в сессии и отдавать в GET /api/tryon/:id при отсутствии своего result_asset.
8. **Ошибки и логи:** нейтральные сообщения клиенту, детальные причины в логах.
9. **getTryonVideoStatus:** исправить возврат status при completed job.
10. **X-User-Id:** для демо рассмотреть опциональный или дефолтный пользователь.

После исправлений п. 1–2 и при корректной схеме/контракте примерки с залитыми пользователем фото должны перестать давать «relation does not exist» / «column does not exist» и 404 по фото; п. 3–4 устраняют проблему «no-looks-available» при своей одежде и путаницу с photoId.
