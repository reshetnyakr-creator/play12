# Project Handover · Stage 3.0.9

База — `63966833038d3bd951f86abef3baba1616fe6837`. Ветка — `research/stage-3-0-9-wide-chord-refinement`. Штатный запуск не использует эксперимент. Карта физических контактов и условное назначение в JSON разделены.

[Сводка](00_Executive_Summary.md) · [Литература](01_Literature_Review.md) · [Результаты](05_Experimental_Results.md) · [Атлас](atlas.html) · [Реестр следующего исследования](09_Future_Research_Register.md)

Подготовьте оригинальные выгрузки и файл `play12-306-replay.json` по [инструкции Stage 3.0.6](../stage-3-0-6-maxprac-contact-analysis/06_Project_Handover.md). Из корня checkout:

```sh
D=MVP/docs/research/stage-3-0-9-wide-chord-refinement
node "$D/run.cjs" /tmp/play12-306-replay.json /tmp/play12-imports > /tmp/play12-309-results.json
diff "$D/results.json" /tmp/play12-309-results.json
node --test MVP/tests/*.cjs MVP/docs/research/stage-3-0-{5,6,7,8,9}*/*.test.cjs
python -m unittest discover -s MVP/tests -p 'test_*.py'
PYTHONDONTWRITEBYTECODE=1 python MVP/docs/research/stage-3-0-3-residual-fingering-analysis/test_research.py
```

Для атласа с Verovio 6.4.1 выполните `python "$D/engrave.py" "<оригинал Time.mxl>" /tmp/play12-309-notation`. Откройте атлас через локальный HTTP-сервер из корня checkout и загрузите полную исходную выгрузку Time с двумя SVG. Проверка браузера запускается через `node "$D/check-atlas.cjs" http://127.0.0.1:8741 "<выгрузка Time>" /tmp/play12-309-notation`; при необходимости укажите `PLAYWRIGHT_MODULE` и `CHROMIUM`. Полные оригиналы и гравированные фрагменты остаются локально.

Следующий этап требует согласования. Временной план условного аккорда и инструментальная проверка не выполнены. Ветка не сливалась с main или production.
