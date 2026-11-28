# Project Handover · Stage 3.0.6

Ветка `research/stage-3-0-6-maxprac-contact-analysis` создана от `05acac04a9aa7e7fb9658636cf82a5c3dff7754b`. Исследование остановлено на §12. В этой ветке только материалы исследования и диагностические инструменты. Действующие правила и профиль, исходные партитуры, production и main при работе не менялись.

[Решения для автора](00_Report.md) · [Реестр 40 нот](01_Register.md) · [Аудит](02_Rule_Audit.md) · [Источники](03_Evidence.md) · [Эксперименты](04_Experiments.md) · [Атлас](atlas.html) · [Проверка на инструменте](05_Instrument_Protocol.md).

## Как воспроизвести

Нужны оригинальные MXL Time и No Surprises, Node, Python и по необходимости Chromium, Playwright и Verovio 6.4.1 для визуальной сверки. Полные партитуры и выгрузки хранятся локально. Поднимите сервер из корня checkout, например `python -m http.server --bind 127.0.0.1 8741`. В другом терминале из того же корня укажите реальные пути:

```sh
D=MVP/docs/research/stage-3-0-6-maxprac-contact-analysis
BASE=http://127.0.0.1:8741
node MVP/docs/stage-3-0-2-partial-fingering-recovery/browser-import.cjs \
  "$BASE" /tmp/play12-imports 1 "<Time.mxl>" "<No Surprises.mxl>"
mkdir -p /tmp/play12-306-results
node "$D/replay.cjs" /tmp/play12-imports > /tmp/play12-306-replay.json
PYTHONDONTWRITEBYTECODE=1 python "$D/diagnose.py" \
  /tmp/play12-306-replay.json /tmp/play12-306-results
python "$D/engrave.py" "<каталог оригинальных MXL>" /tmp/play12-imports \
  /tmp/play12-306-engraving > /tmp/play12-306-results/source-check.json
```

Без последнего аргумента `engrave.py` сверяет оригинальные MXL без установки Verovio. Сравните `summary.json`, `register.json`, `01_Register.md` и `source-check.json` в папке результатов с файлами этой ветки. Укажите `PLAYWRIGHT_MODULE` и `CHROMIUM`, если Playwright и браузер доступны в нестандартном месте.

Откройте через локальный сервер путь `/MVP/docs/research/stage-3-0-6-maxprac-contact-analysis/atlas.html`. Таблицы и диаграммы контактов загружаются из реестра. Для двух видов нотной записи выберите созданный файл `/tmp/play12-306-replay.json`, обе исходные выгрузки и шесть файлов SVG из `/tmp/play12-306-engraving`. SVG созданы из оригинальных тактов, включая контекст там, где удержание переходит через тактовую черту. Для автоматической проверки используйте `node "$D/check-atlas.cjs" "$BASE" /tmp/play12-306-replay.json /tmp/play12-imports /tmp/play12-306-engraving`.

## Проверенное состояние

- Повторный импорт обоих оригиналов в Chromium, повторная проверка входных хешей и воспроизведение 529/541 и 1069/1101. Сверены восемь пальцев и их физические интервалы.
- Все 40 записей и 137 уникальных соседних событий сверены с оригинальным XML. Проверены шесть традиционных и шесть Play12 фрагментов в Chromium.
- `node --test MVP/tests/*.cjs MVP/docs/research/stage-3-0-5-physical-contact-semantics/experiment.test.cjs` — 362 прошли, включая 11 тестов Stage 3.0.5.
- `python -m unittest discover -s MVP/tests -p 'test_*.py'` — 9 прошли. Дополнительно `python MVP/docs/research/stage-3-0-3-residual-fingering-analysis/test_research.py` — 15 сценариев интервального перебора.
- Защита восьми назначений сохранена во всех опытах. Существующие ограничения оставили общий прирост нулевым. В наблюдённых экспериментах ни одна из четырёх G4 не сменила статус.
- Воспроизводимость вычислений не подтверждает физическую выполнимость и звучание. Для продолжения необходимы согласование автора и отдельный протокол инструментальной проверки по выбранной гипотезе.
