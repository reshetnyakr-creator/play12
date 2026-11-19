/* Approved whole-strip SVG assets for Piano View. */
(function (global) {
  "use strict";
  const ROOT = "assets/play12-v07";
  const FILES = [["red","crad_red.svg"],["orange","crad_orange.svg"],["yellow","crad_yello.svg"],
    ["green","crad_green.svg"],["blue","crad_blue.svg"],["purple","crad_purpl.svg"],["pink","crad_pink.svg"]];

  async function loadReadyAssets() {
    const pianoUrl = `${ROOT}/Piano_Roll.svg`;
    const response = await fetch(pianoUrl);
    if (!response.ok) throw new Error(`Piano_Roll.svg: HTTP ${response.status}`);
    return Object.freeze({
      id: "approved-whole-card-strips-v1",
      pianoUrl,
      pianoSvgText: await response.text(),
      cycleNames: Object.freeze(FILES.map(([name]) => name)),
      stripUrls: Object.freeze(Object.fromEntries(FILES.map(([name, file]) => [name, `${ROOT}/${file}`]))),
      stripWidth: 432,
      stripHeight: 128
    });
  }
  global.Play12CardThemes = Object.freeze({ loadReadyAssets });
})(window);
