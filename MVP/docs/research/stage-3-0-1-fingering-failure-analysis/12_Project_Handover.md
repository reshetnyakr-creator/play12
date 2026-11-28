# Project Handover — Stage 3.0.1

База 0ef67717befb1735363bfe8fa48812f3ce9cb9d3. Рабочая ветка research/stage-3-0-1-fingering-failure-analysis. Engine 0.1.7, профиль beginner 0.1.2-experimental. Сохранены причины всех 192 пропусков. Точный предел частичного восстановления с прежними пальцами — 48 + 86 нот. Renderer отправляет 72 + 103 пунктирных блока в колонку счёта явной формулой. Ни одно из дальнейших исправлений не реализовано.

| ID | Статус | Проверка |
| --- | --- | --- |
| T01 | PASS | Пять импортов Time, 469/541 |
| T02 | PASS | Пять импортов No Surprises, 981/1101 |
| T03 | PASS | В обеих сериях по пять одинаковых отпечатков |
| T04 | PASS | CSV 72 и 120 строк, одна исходная нота на строку |
| T05 | PASS | У каждого ID есть причина и конкретный слой или контакт |
| T06 | PASS | Проверены интервалы, удержания и повторные атаки |
| T07 | PASS | 66 цепочек из двух сегментов, ручное сохранение общей аппликатуры |
| T08 | PASS | Обе партитуры без педали, ни одного принятого перехода releaseShift |
| T09 | PASS | MaxComf, MaxPrac и октавное правило проверены на проблемных слоях |
| T10 | PASS | Независимый исчерпывающий перебор форм и DP по удержаниям |
| T11 | PASS | Генерация, порядок, стоимость, луч, ожидание и бюджет; проверен луч 256 |
| T12 | PASS | Формула локализована, 175 SVG-блоков и шесть случаев resolver проверены |
| T13 | PASS | Все 192 ноты через edit, девять UI-примеров; сохранение и повторное открытие обеих композиций |
| T14 | PASS | Сравнены импорты до и после Stage 2.4.2 |
| T15 | PASS | Три синтетических примера прошли штатный импорт с ожидаемыми отказами |
| T16 | PASS | Четыре контрольных импорта, 7348/7348 |
| T17 | PASS | Есть точный максимум на неизменном плане и остаток |
| T18 | PASS | Последовательность исправлений и проверок сохранена |
| T19 | PASS | Исследование сохранено в выделенной ветке GitHub |
| T20 | PASS | Изменения ограничены исследовательским каталогом, production не разворачивался |

## Воспроизведение

Нужны Python 3, Node, Chromium и Playwright. Задайте CHROMIUM и при необходимости PLAYWRIGHT_MODULE. Откройте локальный сервер на 8768 из текущего корня и на 8769 из отдельного дерева 80480363bcca37ee10fb8130a673cd729634c10c. Переменные с именами композиций должны указывать на локальные файлы автора. Сырые выгрузки пишите за пределы репозитория.

~~~sh
D=MVP/docs/research/stage-3-0-1-fingering-failure-analysis
node --test MVP/tests/*.cjs
python -m unittest discover -s MVP/tests -p 'test_*.py'
node "$D/browser-import.cjs" http://127.0.0.1:8768 /tmp/current 5 "$TIME_MXL" "$NO_SURPRISES_MXL"
node "$D/browser-import.cjs" http://127.0.0.1:8769 /tmp/before 1 "$TIME_MXL" "$NO_SURPRISES_MXL"
node "$D/browser-import.cjs" http://127.0.0.1:8768 /tmp/controls 1 "$INTERSTELLAR_XML" "$CREEP_XML" "$CLOCKS_XML" "$PIRATE_XML"
node "$D/browser-import.cjs" http://127.0.0.1:8768 /tmp/synthetic 1 "$D"/fixtures/*.musicxml
mkdir -p /tmp/diag
python "$D/analyse.py" /tmp/current /tmp/before /tmp/controls /tmp/diag
node "$D/experiments.cjs" /tmp/current /tmp/diag/wider-beam.json
node "$D/manual-ui.cjs" /tmp/diag/manual-editor.json "$TIME_MXL" "$NO_SURPRISES_MXL"
~~~

Сырые выгрузки содержат полную партитуру и предназначены для локальной проверки. Публичный пакет содержит синтетические XML, диагностику пропусков и агрегаты. Имена высот нормализованы по MIDI. Исходную энгармонию можно прочитать из локального XML. Q — четверти, считая от начала. rejected_against_final_active относится к итоговому пути, а не к внутренней трассе каждого кандидата. Число допустимых форм целого слоя содержится в shapes. renderer_contact_representative указывает первый сегмент лиги. Поле recovery указывает членство в одном максимуме. Физическое исполнение и удобство переходов на инструменте не проверялись.

[Резюме](00_Executive_Summary.md) · [План исправлений](11_Implementation_Roadmap.md) · [Реестр Time](results/time-unassigned-notes.csv) · [Реестр No Surprises](results/no-surprises-unassigned-notes.csv)
