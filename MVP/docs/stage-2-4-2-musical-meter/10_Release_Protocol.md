# Протокол приёмки

Принципы счёта и акцентов сверены с учебным PDF, главы 3, 4 и 9–12, включая визуальные примеры на страницах 9–12 и 29–43. Матрица сравнивалась с исследовательской веткой Stage 2.4.1 на `b3d8080e63ca158c838c64acb728de1c5d3468f2`. Источники реальных партитур остаются внешними входами теста. Публичный пакет содержит только синтетические партитуры, общеизвестные структурные факты и измерения.

## Воспроизведение

Из корня репозитория поднять статический сервер. Установить `PLAY12_TEST_BASE_URL`, `PLAY12_TEST_CHROMIUM` и `PLAYWRIGHT_MODULE`.

```sh
D=MVP/docs/stage-2-4-2-musical-meter
python3 "$D/generate-play12-fixtures.py"
node "$D/verify-normalization.cjs"
node "$D/verify-renderer.cjs"
node "$D/verify-transport.cjs"
node "$D/verify-compatibility.cjs"
node "$D/verify-visual-matrix.cjs"
node --test MVP/tests/test_*.cjs
python3 -m unittest discover -s MVP/tests -p 'test_*.py'
```

Для повторения опыта Perfect передать локальный MXL в `verify-transport.cjs` и `verify-long-run.cjs`. `verify-corpus.cjs` принимает семь локальных оригиналов в порядке из отчёта. Для проверки Tutorial использовать `MVP/tests/browser/tutorial-interaction-course.cjs` в RU и EN. Для проверки UI подключения использовать `tutorial-midi-browser.cjs`.

## На физическом инструменте

Открыть Perfect, включить метроном и сыграть любой полный раунд с начального положения. Проверить четыре удара, затем включить Pre-count на два цикла и проверить восемь ударов. Уменьшить темп до 53 BPM, сравнить относительный темп и повторить с тестом руки в Practice. Физическое MIDI и аудиовыход в этой приёмке отсутствовали.

## Результат локальной приёмки

Нормализация прошла на 54 синтетических сценариях и семи рабочих партитурах. В корпусе сохранены ID, высоты, атаки, длительности и контакты нот. Новый импорт When the Saints сокращает только короткий заключительный такт от дополненного номинала до фактической длины. Сценарий Tutorial использует существующий учебный материал, оба полных прохождения RU/EN прошли. Playwright подтвердил выбор партии, навигацию, редактор, эмуляцию Web MIDI и восстановление из Backup. Прошли 335 JavaScript- и 9 Python-тестов.

Открытые случаи и границы применения документированы в [реестре решений](09_Decision_Register.md) и [матрице](07_Test_Matrix.md). Контрольные точки: [A](https://github.com/reshetnyakr-creator/play12/commit/2bf0025b42561e7d8d9e7141147ec855c36fdfbf), [B](https://github.com/reshetnyakr-creator/play12/commit/b367c706a2e3244bc8bf54ff00c9e1cc1646eb5b), [C](https://github.com/reshetnyakr-creator/play12/commit/6896b0be87907da281aa67ab55fc8c863be9b019). [Точка отката](https://github.com/reshetnyakr-creator/play12/tree/rollback-before-stage-2-4-2) · [архив скриншотов и журналов](https://chatgpt.com/library?file_id=libfile_dc126e9b3cb88191b03936e25e920d1b&account_id=personal).
