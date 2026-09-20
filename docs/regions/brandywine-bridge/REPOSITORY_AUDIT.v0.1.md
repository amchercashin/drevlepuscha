# Аудит исходного кода для региона Брендивинского моста

## Зафиксированная версия

Репозиторий: https://github.com/amchercashin/drevlepuscha

Ветка `main`, commit `bcb9d1a8e39c95457557ae6264a107eb4e2f58ee`, время коммита **2026-09-18 09:26:36 UTC**, сообщение `Add weather-linked rain audio and intensify downpour`.

Это статическое изучение перечисленных модулей через GitHub, не запуск проекта. Большие файлы изучены в частях, относящихся к запуску, земле, размещению, загрузке и движению. Полный репозиторий, каждый шейдер и все исторические планы не проверялись. Рабочая копия Codex может быть новее — перед реализацией нужен небольшой diff относительно этого SHA.

Файл `content/geography/old-forest/geography.json` не удалось прочитать через коннектор из-за ограничения размера. Поэтому согласование локальных координат нового региона с существующим большим атласом **не выполнено**. В исходных данных это явно отражено как `atlasRegistration.status = unresolved`.

## Что уже есть и что мешает прямому переносу

В таблице «изменение» означает предложение, не выполненную правку.

| Проверенный файл | Установлено по коду | Предлагаемое действие |
|---|---|---|
| `AGENTS.md`, `docs/DEVELOPMENT.md` | Только WebGPU; собственные шейдеры WGSL; третье лицо, растворение препятствий, защитный подъём камеры; адресные проверки; ограничение ресурсов Mac M3 8 ГБ | Сохранить правила. Не вводить WebGL, новый движок, физический пакет или массовую QA-матрицу |
| `README.md` | Шоукейс 512 × 640 м; карта 1:1 отдельна; графику переносят отдельной задачей | Новый регион — отдельная сцена, не замена существующей |
| `package.json` | Node `>=22.23.1 <23`, Babylon `9.25.0`, TS `5.8.3`; `build` включает `world:build` | Сохранить lockfile. Добавить сборку нового региона без изменения версий зависимостей |
| `src/boot.ts` | `scene=world` загружает `world/game.ts`; обычная сцена включает глобальный `enableShowcase()` и загружает `main.ts` | Добавить явную ветку `scene=region&region=brandywine-bridge` ДО обычного шоукейса. Не вызывать `enableShowcase()` ради заимствования графики |
| `src/main.ts` | Композиция шоукейса соединяет мир, Ranger, лес, землю, ветер, небо, дождь и звук; использует глобальные функции высоты/границы шоукейса | Извлекать небольшие точки подключения, не копировать весь файл в третий почти одинаковый цикл игры |
| `src/domain/showcase.ts` | Фиксированные границы и кэш высот; `showcasePath(n)` и `relief(e,n)` задают конкретную ложбину; `terrainCameraLift` принимает функцию высоты | Перенести приём детализации и камеру, но не растянуть исходную ложбину до 4 км |
| `src/runtime/forest.ts` | Все размещения текущего леса вычисляются при создании; материал/геометрия разделяются; есть ветер, оттенки, fade, LOD и shadow-pass | Дать ограниченный поставщик активных ячеек/экземпляров. Не выделять матрицы и коллайдеры на все деревья региона при старте |
| `src/world/data.ts` | Пакеты gzip, SHA-256, кэш, очередь до четырёх загрузок и два worker; пути `world/`, cache `old-forest-*`, фабрика `createWorldGeography` жёстко заданы | Параметризовать источник, namespace и вид географии. Сохранить проверку хэшей и обработку ошибок |
| `src/world/schema.ts` | Метры EN; Grid/Tile/Manifest уже описаны; MapData содержит единственную границу `forest` и обязательный `route` | Не выдавать границу региона за единый лес. Новая карта получает несколько полигонов покрова и необязательные маршруты через адаптер |
| `src/world/streamer.ts` | Данные 512 м, видимые фрагменты 128 м; rebase при удалении >1024 м; `safeAnchor` требует `haysend`, `old_man_willow`, `tom_house` | Убрать такие требования из регионального пути исполнения через внедрённую политику опор/объектов. Старую сцену оставить с прежним адаптером |
| `src/domain/geography.mjs` | `createGeography` требует `forest_boundary`; zoneAt/exclusion ограничены лесом; есть полезные чистые функции линий, полигонов, seed и профиля рек | Сохранить старую фабрику. Новый region sampler использует общие математические функции без фиктивных старых POI |
| `src/domain/world-geography.mjs` | Вне леса специально поддерживается только `eastern_opening` | Не переименовывать поля, пойму и Бакленд в эту старую зону; использовать явные биомы нового региона |
| `tools/world/build.mjs` | Жёсткие `content/geography/old-forest/` и `public/world/`; удаление выходного каталога при пересборке; 321 × 353 coarse; требуются `forest_boundary` и `frodo_route`; циклы предполагают кратные 512 границы | Новая сборка — в `public/regions/brandywine-bridge/`. Игра и хранилище имеют разные bounds. Старый output не удалять |
| `src/world/worker.ts` | Распаковка/генерация деревьев детерминирована; семейства и плотности читаются через старую экологию; worker сам создаёт фабрику географии | Передать serializable `geographyKind`, данные и версия. Нельзя передать callback в worker через structured clone |
| `src/world/math.ts` | Высота читается по тем же треугольникам, что поверхность; движение режется на шаги до 0,12 м и блокирует воду глубже 0,35 м | Сохранить согласование треугольников. Для мостов нужна отдельная опорная поверхность, не изменение дна реки |
| `src/world/water.ts` | Визуальные полосы воды и анимация текстуры; локальный special case каскада Withywindle по ID/координатам | Водная геометрия нового региона строится из общего sampler. Это не готовая лодочная физика |
| `src/world/hedge.ts` | Требует `west_high_hay`; проход пропускается около конкретных координат `(512,25420)` в радиусе 42 м | Данные изгородей/проёмов должны быть параметрами. Не наследовать огромный туннель как Северные ворота |
| `src/world/terrain.ts` | Уже есть очередь генерации/загрузки фрагментов и вытеснение; палитра/шаг coarse местами зафиксированы | Использовать готовый механизм, выделить региональные параметры. Объединять новые загрузки с общим бюджетом кадра |
| `src/world/library.ts` | `world/library.json` и пути текстур заданы явно; уже есть LodDither/LeafTransmission; подключений VegetationWind/TreeTone, как в showcase forest, здесь нет | Источник ассетов и плагины передать отдельно. Не считать, что большая карта уже визуально равна шоукейсу |
| `src/world/ecology.ts` | Смеси семейств выбираются по конкретным старым ID зон | Новый профиль биома содержит собственные веса. Не использовать фиктивные старые названия для нужного вида |
| `src/world/game.ts` | Жёсткие spawn/названия/localStorage/POI-offsets; простой персонаж отличается от Ranger шоукейса | Новая композиция получает region definition и использует Ranger/камеру шоукейса, а не незаметно возвращает старого персонажа |

## Существенные выводы

1. **Переиспользуем механизм стриминга большой карты и визуальные решения шоукейса; не масштабируем сцену целиком.** 16 км² / 0,32768 км² = 48,828125.
2. **География — отдельный слой данных, не набор новых `if(id === ...)` внутри старого леса.** Узкие адаптеры предпочтительнее переписывания всей архитектуры.
3. **Мост, берег, дно и лодка имеют разные правила опоры.** Старая проверка waterDepth запрещает ходьбу над глубокой водой без дополнительной информации.
4. **Пользовательские и технические границы различаются.** Для local EN прямоугольника −1600…2400 / −1500…2500 требуются 9 × 8 стандартных плиток = 72; это не увеличение игровой территории.
5. **Большая карта уже содержит полезную инфраструктуру, но её графика не полностью совпадает с showcase.** Перенос ветра, земли, камеры, персонажа и звука — отдельные, измеряемые шаги.

## Прямые ссылки на проверенные исходники

Все ссылки закреплены за одним commit, а не за подвижной `main`.

- [AGENTS.md](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/AGENTS.md)
- [README.md](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/README.md)
- [docs/DEVELOPMENT.md](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/docs/DEVELOPMENT.md)
- [package.json](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/package.json)
- [src/boot.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/boot.ts)
- [src/main.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/main.ts)
- [src/domain/showcase.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/domain/showcase.ts)
- [src/runtime/forest.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/runtime/forest.ts)
- [src/world/data.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/world/data.ts)
- [src/world/schema.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/world/schema.ts)
- [src/world/streamer.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/world/streamer.ts)
- [src/domain/geography.mjs](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/domain/geography.mjs)
- [src/domain/world-geography.mjs](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/domain/world-geography.mjs)
- [tools/world/build.mjs](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/tools/world/build.mjs)
- [src/world/worker.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/world/worker.ts)
- [src/world/math.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/world/math.ts)
- [src/world/water.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/world/water.ts)
- [src/world/hedge.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/world/hedge.ts)
- [src/world/terrain.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/world/terrain.ts)
- [src/world/library.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/world/library.ts)
- [src/world/ecology.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/world/ecology.ts)
- [src/world/game.ts](https://github.com/amchercashin/drevlepuscha/blob/bcb9d1a8e39c95457557ae6264a107eb4e2f58ee/src/world/game.ts)
