# Project Handover · Stage 3.0.8

База — `1f24be16f20b61a3ecde435321461c793cebcbf0`. Ветка — `research/stage-3-0-8-contact-release-and-hand-shift`. Новый поиск работает через локальный исследовательский запуск. В ядре и профиле изменений нет. Из предыдущего экспериментального модуля повторно использованы правила широкого аккорда и валидатор.

[Сводка](00_Executive_Summary.md) · [Источники](01_Literature_Review.md) · [Результаты](05_Experimental_Results.md) · [Атлас](atlas.html) · [Регрессия](07_Regression_Report.md)

Вначале импортируйте оригиналы и подготовьте файл `play12-306-replay.json` по [инструкции Stage 3.0.6](../stage-3-0-6-maxprac-contact-analysis/06_Project_Handover.md). Из корня checkout:

```sh
D=MVP/docs/research/stage-3-0-8-contact-release-and-hand-shift
node "$D/run.cjs" /tmp/play12-306-replay.json /tmp/play12-imports \
  /tmp/play12-308-visual-map.json > /tmp/play12-308-results.json
diff "$D/results.json" /tmp/play12-308-results.json
diff "$D/visual-map.json" /tmp/play12-308-visual-map.json
node --test MVP/tests/*.cjs \
  MVP/docs/research/stage-3-0-5-physical-contact-semantics/experiment.test.cjs \
  MVP/docs/research/stage-3-0-6-maxprac-contact-analysis/wide-experiment.test.cjs \
  MVP/docs/research/stage-3-0-7-wide-chord-fingering/chord-experiment.test.cjs \
  "$D/release-experiment.test.cjs"
python -m unittest discover -s MVP/tests -p 'test_*.py'
PYTHONDONTWRITEBYTECODE=1 python MVP/docs/research/stage-3-0-3-residual-fingering-analysis/test_research.py
```

Для просмотра оригинальной нотации установите Verovio 6.4.1, затем выполните `python "$D/engrave.py" "<оригинальный Time.mxl>" /tmp/play12-308-notation`. Откройте атлас через локальный HTTP-сервер, укажите исходную полную выгрузку Time и девять SVG. Проверка браузера запускается через `node "$D/check-atlas.cjs" http://127.0.0.1:8741 "<выгрузка Time>" /tmp/play12-308-notation`. Полные партитуры, импорты и локальная гравировка отсутствуют в репозитории.

Следующий этап требует согласования. Для такта 46 нужно отдельное решение об общей атаке. Для восстановления контактов остаются открытыми реальное время движения и сохранность звучания.
