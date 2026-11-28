# Project Handover · Stage 3.0.7

Исходный коммит — `fd9e09d25c65f9f6b9c67a068038d6047f4089a3`. Ветка — `research/stage-3-0-7-wide-chord-fingering`. [Сводка](00_Executive_Summary.md) и [границы реализации](04_Experimental_Implementation.md) описывают исследовательский режим. Штатный Worker его не включает.

## Воспроизведение

Использовать [инструкцию Stage 3.0.6](../stage-3-0-6-maxprac-contact-analysis/06_Project_Handover.md) для импорта оригинальных Time и No Surprises и создания локального файла пересчёта. Убедиться, что полученные результаты Stage 3.0.5 и 3.0.6 совпадают с сохранёнными. Далее из корня репозитория:

```sh
D=MVP/docs/research/stage-3-0-7-wide-chord-fingering
node "$D/run.cjs" /tmp/play12-306-replay.json /tmp/play12-imports \
  /tmp/play12-307-visual-map.json > /tmp/play12-307-results.json
diff "$D/results.json" /tmp/play12-307-results.json
diff "$D/visual-map.json" /tmp/play12-307-visual-map.json
node --test MVP/tests/*.cjs \
  MVP/docs/research/stage-3-0-5-physical-contact-semantics/experiment.test.cjs \
  MVP/docs/research/stage-3-0-6-maxprac-contact-analysis/wide-experiment.test.cjs \
  "$D/chord-experiment.test.cjs"
python -m unittest discover -s MVP/tests -p 'test_*.py'
PYTHONDONTWRITEBYTECODE=1 python MVP/docs/research/stage-3-0-3-residual-fingering-analysis/test_research.py
```

Для атласа в локальной среде с Verovio 6.4.1 выполните `python "$D/engrave.py" "<оригинальный Time.mxl>" /tmp/play12-307-notation`. Откройте [atlas.html](atlas.html) через локальный сервер из корня checkout. Выберите исходную полную выгрузку Time и все 11 полученных SVG. Оригинальные MXL, локальные выгрузки и гравированные партитуры не включены в репозиторий. Автоматическая проверка браузера: `node "$D/check-atlas.cjs" http://127.0.0.1:8741 "<выгрузка Time>" /tmp/play12-307-notation`, с указанием `PLAYWRIGHT_MODULE` и `CHROMIUM` при необходимости.

Дальнейшее рассмотрение жёстких конфликтов требует отдельного согласования. Физическая выполнимость и сохранность звучания не установлены. Изменения не включались в main или production.
