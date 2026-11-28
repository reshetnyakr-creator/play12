# Project Handover · Stage 3.0.6 после согласования

Продолжение от `81f407cc3f3f3cb2385645bcb15f6b76b3fe0465` в `research/stage-3-0-6-maxprac-contact-analysis`. Согласованная направленная пара крайних пальцев реализована как локальное исключение при восстановлении. Штатные точки входа исключение не включают. Изменение содержится в исследовательской ветке. Публикации в production и слияния с main не было.

| Материал | Содержание |
| --- | --- |
| [Реализация](07_Experimental_Implementation.md) | Место включения, ограниченная область и диагностическая модель |
| [Правила](08_Updated_Rules.md) | Сравнение до и после |
| [Результаты](09_Experimental_Results.md) · [JSON](wide-results.json) | 40 случаев, 64 исключения, 5 смен прежнего пальца, 33 новых назначения |
| [Остаток](10_Residual_Register.md) | 11 событий Time с причинами отказа |
| [Регрессия](11_Regression_Report.md) | Автоматические проверки и исходные сравнения |
| [Атлас](atlas.html) | Шесть оригинальных фрагментов и Play12 до и после |

Использовать [исходный Project Handover](06_Project_Handover.md), чтобы импортировать оригинальные MXL в локальный Play12, создать исходный файл пересчёта и выгравировать традиционную нотацию. Затем из корня checkout выполнить:

```sh
D=MVP/docs/research/stage-3-0-6-maxprac-contact-analysis
node "$D/run-wide.cjs" /tmp/play12-306-replay.json /tmp/play12-imports \
  > /tmp/play12-306-wide.json
diff "$D/wide-results.json" /tmp/play12-306-wide.json
node --test MVP/tests/*.cjs \
  MVP/docs/research/stage-3-0-5-physical-contact-semantics/experiment.test.cjs \
  "$D/wide-experiment.test.cjs"
python -m unittest discover -s MVP/tests -p 'test_*.py'
PYTHONDONTWRITEBYTECODE=1 python MVP/docs/research/stage-3-0-3-residual-fingering-analysis/test_research.py
```

Открыть [атлас](atlas.html) через локальный сервер, загрузить исходные выгрузки и SVG и нажать «Показать аппликатуру после эксперимента рядом с исходной». Для автоматической проверки выполнить `node "$D/check-atlas.cjs" http://127.0.0.1:8741 /tmp/play12-306-replay.json /tmp/play12-imports /tmp/play12-306-engraving wide`. Полные оригиналы и традиционные SVG из оригиналов остаются локально.

Перед любым переходом к способу исполнения или выпуску требуется отдельное решение автора. Вычислительные назначения и записи превышений доступны. Физическая выполнимость и сохранность звучания не подтверждены.
