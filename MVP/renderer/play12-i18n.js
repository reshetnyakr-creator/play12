(function (global) {
  'use strict';

  const ru = {
    'OK12':'OK12','BPM':'BPM','Skip':'Пропустить','Start':'Начать','Continue':'Продолжить','Start fresh':'Начать заново',
    'Continue with saved setup':'Продолжить с сохранёнными настройками',
    'Connect your piano':'Подключи пианино','Already connected':'Уже подключено','How to connect?':'Как подключить?',
    'How to connect':'Как подключить','I don’t have a piano yet — view demo':'У меня пока нет пианино. Хочу посмотреть демо',
    'Check connection':'Проверить подключение','Let’s check the connection':'Проверим подключение',
    'Press any key on your piano':'Нажми любую клавишу на пианино','Ready':'Готово',
    'Your computer is receiving a signal from the piano ✓':'Компьютер получает сигнал от пианино ✓',
    'Keyboard calibration':'Калибровка клавиатуры','Press the leftmost key on your keyboard':'Нажми крайнюю левую клавишу',
    'Now press the rightmost key':'Теперь нажми крайнюю правую клавишу','Try again':'Попробуй ещё раз',
    'The right key must be above the left key and on the same MIDI keyboard.':'Правая клавиша должна быть выше левой и находиться на той же MIDI-клавиатуре',
    'We detected your keyboard.':'Мы определили твою клавиатуру','Does this match your keyboard?':'Совпадает с твоей клавиатурой?',
    'Make sure you pressed the leftmost and rightmost keys.':'Убедись, что нажал крайнюю левую и крайнюю правую клавиши',
    'Use this keyboard':'Использовать эту клавиатуру','Function key':'Клавиша «Функция»',
    'Press the rightmost key again':'Ещё раз нажми крайнюю правую клавишу','That was not the rightmost key':'Это не крайняя правая клавиша',
    'Press the rightmost key again, or recalibrate the keyboard.':'Нажми крайнюю правую клавишу ещё раз или повтори калибровку',
    'Recalibrate':'Повторить калибровку','Function is ready':'Клавиша «Функция» готова',
    'Hold the rightmost key to use piano controls ✓':'Удерживай крайнюю правую клавишу «Функция», чтобы управлять Play12 ✓',
    'MIDI keyboard range has changed.':'Диапазон MIDI-клавиатуры изменился','Recalibrate?':'Повторить калибровку?',
    'Keep current range':'Оставить текущий диапазон','Allow browser access to MIDI':'Разреши браузеру доступ к MIDI',
    'When you connect for the first time, your browser may ask for permission to use MIDI devices. Choose Allow.':'При первом подключении браузер может запросить доступ к MIDI-устройствам. Нажми «Разрешить»',
    'Request MIDI access':'Разрешить доступ к MIDI','MIDI access is blocked':'Доступ к MIDI заблокирован',
    'Allow MIDI access for play12.pro in your browser settings, then try again.':'Разреши доступ к MIDI для play12.pro в настройках браузера и попробуй ещё раз',
    'Check again':'Проверить снова','MIDI keyboard not found':'MIDI-клавиатура не найдена',
    'Check the USB connection and make sure your piano is turned on.':'Проверь USB-подключение и убедись, что пианино включено',
    'Show connection diagram':'Показать схему подключения','Refresh connection':'Обновить подключение',
    'Safari does not support Web MIDI':'Safari не поддерживает Web MIDI',
    'Open Play12 in Chrome, Edge, Yandex Browser, or another Chromium browser to connect your piano.':'Открой Play12 в Chrome, Edge, Яндекс Браузере или другом браузере на Chromium, чтобы подключить пианино',
    'MIDI connection is not supported':'MIDI-подключение не поддерживается',
    'This browser cannot connect to a MIDI keyboard. Open Play12 in a browser that supports Web MIDI.':'Этот браузер не может подключиться к MIDI-клавиатуре. Открой Play12 в браузере с поддержкой Web MIDI',
    'MIDI keyboard connection lost.':'Соединение с MIDI-клавиатурой потеряно',
    'Reconnect your instrument or continue playing with your mouse.':'Подключи инструмент снова или продолжи играть мышью',
    'Reconnect MIDI':'Подключить MIDI','Now playing':'Сейчас играет','Play12 Learning Version':'Учебная версия Play12',
    'Step {current} of 6':'Шаг {current} из 6','Round {number}':'Раунд {number}',
    'Listen':'Послушай','Choose your 0':'Выбери свой 0','Choose Your 0':'Выбери свой 0','Play':'Play',
    'Metronome':'Метроном','Round & Loop':'Раунд и повтор','You can do it!':'Ты сможешь!',
    'Listen to how the melody sounds':'Послушай, как звучит мелодия','Press Play or P':'Нажми Play или P',
    'Try pausing it':'Попробуй нажать «Пауза»',
    'Set up your Play12 cards':'Разложи карточки Play12','Place the cards on your piano to match the layout you see here':'Размести карточки на пианино так же, как показано здесь',
    'How to place the Play12 cards':'Как разместить карточки Play12','Check that the cards are placed correctly and try again.':'Проверь, правильно ли расположены карточки, и попробуй ещё раз',
    'Press the key under the yellow 1 card':'Нажми клавишу под жёлтой карточкой 1','Press the key under the green 2 card':'Нажми клавишу под зелёной карточкой 2',
    'Press the key under the <strong>yellow 1</strong> card':'Нажми клавишу под <strong>жёлтой карточкой 1</strong>',
    'Press the key under the <strong>green 2</strong> card':'Нажми клавишу под <strong>зелёной карточкой 2</strong>',
    'The yellow 1 card is not visible on this keyboard range.':'Жёлтая карточка 1 не попадает в диапазон этой клавиатуры',
    'The green 2 card is not visible on this keyboard range.':'Зелёная карточка 2 не попадает в диапазон этой клавиатуры',
    'Cards are ready ✓':'Карточки готовы ✓','Press any comfortable key on your piano, or choose a key with your mouse on the on-screen piano':'Нажми любую удобную клавишу на пианино или выбери клавишу мышью на экранной клавиатуре',
    'Confirm your 0':'Подтверди свой 0','Yes':'Да','Choose another 0':'Выбрать другой 0',
    'Practice':'Практика','Left Hand':'Левая рука','Right Hand':'Правая рука','One Skill':'Один навык','Coming later':'Скоро',
    'Now try it yourself':'Теперь попробуй сам','Turn on Practice':'Включи практику',
    'Let’s start with your right hand':'Начнём с правой руки','Turn off Left Hand':'Выключи левую руку',
    'Watch the Note Field and play the keys it shows you':'Следи за нотным полем и нажимай клавиши, которые оно показывает',
    'The music will wait until you press the right key':'Музыка подождёт, пока ты не нажмёшь правильную клавишу',
    "Press Play when you're ready":'Когда будешь готов, нажми Play','Tempo':'Темп',
    'Let’s add a steady beat':'Добавим метроном','Turn on the metronome':'Включи метроном',
    'Slow down or speed up the piece':'Сделай метроном медленнее или быстрее',
    'Type a BPM, or use − / + to change it by 10':'Введи BPM или меняй темп кнопками − / + с шагом 10',
    'Play it again with a steady beat':'Сыграй ещё раз под метроном','Press Play':'Нажми Play',
    'Round':'Раунд','Previous round':'Предыдущий раунд','Next round':'Следующий раунд','Current round':'Текущий раунд',
    'Rounds divide the piece into sections.':'Раунды делят произведение на участки',
    'You can jump directly to the section you want to practise.':'Можно сразу перейти к участку, который хочешь потренировать',
    'Go to Round 4':'Перейди к раунду 4','Loop':'Повтор','Loop repeats the section you choose.':'Повтор снова и снова проигрывает выбранный тобой участок',
    'Turn on Loop':'Включи повтор','Set the Loop from Round 2 to Round 4':'Установи повтор с раунда 2 по раунд 4','From':'От','To':'До',
    'Pre-count':'Отсчёт','Pre-count gives you a moment to get ready before each attempt.':'Отсчёт даёт время подготовиться перед каждой попыткой',
    'Turn on Pre-count':'Включи отсчёт','Play Rounds 2–4 cleanly':'Сыграй раунды 2–4 без ошибок',
    "Press Play when you're ready.":'Нажми Play, когда будешь готов','Whole song':'Вся мелодия',
    'Now try to play the whole melody with your right hand from beginning to end.':'А теперь попробуй сыграть всю мелодию правой рукой от начала до конца',
    'Take your time. If you lose your place, try again.':'Не спеши. Если собьёшься — попробуй ещё раз',
    'Congratulations!':'Поздравляем!',"You've completed the Play12 tutorial.":'Ты прошёл обучение Play12',
    'Now you can practise your skills and learn your favourite melodies on your own.':'Теперь ты можешь тренировать свои навыки и самостоятельно разучивать любимые мелодии',
    'Pause':'Пауза','Restart':'Сначала','Met':'Метр','Prev':'Назад','Next':'Вперёд','Function':'Функция',
    'Playback controls':'Управление воспроизведением','Playable on-screen piano':'Экранное пианино',
    'Play12 onboarding':'Обучение Play12','Moving Play12 Note Field':'Движущееся нотное поле Play12',
    'Onboarding progress':'Прогресс обучения','Practice Board':'Панель тренировки','Round controls':'Управление раундами',
    'Composition rounds':'Раунды произведения','Clean Round progress':'Прогресс раундов без ошибок',
    'Decrease From round':'Уменьшить начальный раунд','Increase From round':'Увеличить начальный раунд',
    'Decrease To round':'Уменьшить конечный раунд','Increase To round':'Увеличить конечный раунд',
    'Decrease tempo by 10 BPM':'Уменьшить темп на 10 BPM','Increase tempo by 10 BPM':'Увеличить темп на 10 BPM',
    'Change display grid':'Изменить дробление сетки','Display grid {grid}; click to subdivide':'Сетка {grid}; нажми, чтобы увеличить дробление',
    'Piano View':'Вид пианино','Playback Zone':'Зона воспроизведения','Listen to When the Saints Go Marching In':'Послушай When the Saints Go Marching In',
    'Metronome Board':'Панель метронома','Metronome Mode':'Режим метронома',
    'Language selection':'Выбор языка','Play12 navigation':'Навигация Play12','Play12 homepage':'Главная Play12',
    'Manual':'Руководство','Manifesto':'Манифест','Find the USB TO HOST or USB COMPUTER port on your piano.':'Найди на пианино разъём USB TO HOST или USB COMPUTER.',
    'Connect your piano to the computer with a USB cable.':'Подключи пианино к компьютеру USB-кабелем.',
    'Turn your piano on.':'Включи пианино.','Not working? Check browser settings':'Не работает? Проверь настройки браузера',
    'Digital piano connected to a computer with a USB cable':'Цифровое пианино подключено к компьютеру USB-кабелем',
    'This piece uses notes outside your keyboard range.':'В произведении есть ноты за пределами диапазона клавиатуры.',
    'First {count} measures in Play12 notation':'Первые {count} тактов в нотации Play12'
  };

  const locale = global.__PLAY12_LOCALE__ === 'ru' || document.documentElement.lang === 'ru' ||
    new URLSearchParams(location.search).get('lang') === 'ru' ? 'ru' : 'en';
  document.documentElement.lang = locale;
  const interpolate = (value, params={}) => String(value).replace(/\{(\w+)\}/g, (_, key) => params[key] ?? `{${key}}`);
  const t = (key, params) => interpolate(locale === 'ru' ? (ru[key] || key) : key, params);
  const keysText = count => locale === 'ru'
    ? `Мы определили ${count} ${count % 10 === 1 && count % 100 !== 11 ? 'клавишу' : [2,3,4].includes(count % 10) && ![12,13,14].includes(count % 100) ? 'клавиши' : 'клавиш'}`
    : `We detected ${count} keys.`;
  const dynamic = value => {
    let match = value.match(/^Step (\d+) of 6$/); if (match) return locale === 'ru' ? `Шаг ${match[1]} из 6` : value;
    match = value.match(/^Round (\d+)$/); if (match) return locale === 'ru' ? `Раунд ${match[1]}` : value;
    match = value.match(/^We detected (\d+) keys\.$/); if (match) return keysText(Number(match[1]));
    return t(value);
  };
  const translateText = node => {
    if (locale !== 'ru' || !node.nodeValue?.trim()) return;
    const source=node.nodeValue, trimmed=source.trim(), translated=dynamic(trimmed);
    if(translated!==trimmed) node.nodeValue=source.replace(trimmed,translated);
  };
  const translateElement = element => {
    if (locale !== 'ru') return;
    for (const attr of ['aria-label','title','placeholder']) if(element.hasAttribute?.(attr)) element.setAttribute(attr,dynamic(element.getAttribute(attr)));
    for (const node of element.childNodes || []) if(node.nodeType===Node.TEXT_NODE) translateText(node);
    if(element.matches?.('.mvp-site-nav a[href="/manual.html"]')) element.href='/ru/manual.html';
  };
  const apply = (root=document) => {
    if(locale!=='ru') return;
    if(root.nodeType===Node.TEXT_NODE){translateText(root);return;}
    if(root.nodeType===Node.ELEMENT_NODE) translateElement(root);
    root.querySelectorAll?.('*').forEach(translateElement);
    const language=root.querySelector?.('.mvp-language-switch');
    if(language) language.innerHTML='<a href="/MVP/" lang="en">EN</a><span aria-hidden="true">/</span><span class="mvp-active-language" aria-current="page">RU</span>';
  };
  const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(apply)));
  const start = () => { apply(document); observer.observe(document.body,{childList:true,subtree:true,characterData:true}); };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
  global.Play12I18n={locale,isRu:()=>locale==='ru',t,keysText,apply};
})(window);
