# Project Handover · Stage 3.0.10 до согласования

База — `194e3a4ae70aab9717702bbb1ee25a2a4bcaf86f`. Ветка — `research/stage-3-0-10-fingering-priority`. Сборка исследовательская. Критерий автоматического совпадения такта 38 открыт. [Сводка](00_Executive_Summary.md) · [Сравнение](05_Experimental_Results.md) · [Исключения](06_Exception_Register.md) · [Атлас](atlas.html).

Подготовить оригинальные выгрузки и локальный файл пересчёта по [Stage 3.0.6](../stage-3-0-6-maxprac-contact-analysis/06_Project_Handover.md). Из корня checkout:

```sh
D=MVP/docs/research/stage-3-0-10-fingering-priority
BASE=MVP/docs/research/stage-3-0-9-wide-chord-refinement
node "$BASE/run.cjs" /tmp/play12-306-replay.json /tmp/play12-imports /tmp/play12-310-before >/tmp/play12-309.json
diff "$BASE/results.json" /tmp/play12-309.json
node "$BASE/run.cjs" /tmp/play12-306-replay.json /tmp/play12-imports /tmp/play12-310-candidates --priority >/tmp/play12-310-local.json
node "$D/run.cjs" /tmp/play12-310-before /tmp/play12-310-candidates /tmp/play12-310-local.json /tmp/play12-310-render >/tmp/play12-310-results.json
diff "$D/results.json" /tmp/play12-310-results.json
node --test MVP/tests/*.cjs MVP/docs/research/stage-3-0-{5,6,7,8,9,10}*/*.test.cjs
python -m unittest discover -s MVP/tests -p 'test_*.py'
PYTHONDONTWRITEBYTECODE=1 python MVP/docs/research/stage-3-0-3-residual-fingering-analysis/test_research.py
```

Для визуальной сверки использовать Verovio 6.4.1 и `python "$D/engrave.py" "<оригинальный Time.mxl>" /tmp/play12-310-notation`. Затем открыть атлас через локальный HTTP-сервер и загрузить исходный Time, `/tmp/play12-310-render/time.json` и три SVG. Проверка Chromium: `node "$D/check-atlas.cjs" http://127.0.0.1:8741 "<выгрузка Time>" /tmp/play12-310-notation /tmp/play12-310-render/time.json`. Исходные MXL, полные карты и гравировка остаются локально.

Развилка для автора описана в [результатах](05_Experimental_Results.md). До неё не фиксировать экспериментальную аппликатуру такта 38 как принятую. Фактическая акустика и тайминг специального аккорда неизвестны. main и production не обновлялись.
