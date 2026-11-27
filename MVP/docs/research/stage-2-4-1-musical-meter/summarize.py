"""Compare reference, converter results and browser UI coverage."""
import json
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).parent
RESULTS = ROOT / 'results'

def read(name):
    return json.loads((RESULTS/name).read_text())

JUDGMENTS = {
    'M01': ('PASS','Простой размер, длина и четвертные доли совпали.'),
    'M02': ('PASS','Простой трёхдольный размер.'),
    'M03': ('PASS','Базовый транспорт, Pre-count и Loop подтверждены в Main.'),
    'M04': ('PARTIAL','Раунд и две половинные доли распознаны. Обычный метроном Main планирует четверти.'),
    'M05': ('PARTIAL','Импорт сохраняет восьмые доли. Основной планировщик Main идёт четвертями.'),
    'M06': ('FAIL','В Main шесть подписей, две ожидаемые основные доли.'),
    'M07': ('FAIL','Девять позиций в раунде вместо трёх групп.'),
    'M08': ('FAIL','Двенадцать позиций, четыре ожидаемые доли. Нотная длительность верна.'),
    'M09': ('AMBIGUOUS','Без явных групп 5/4. Сохранены пять четвертей.'),
    'M10': ('AMBIGUOUS','Без явных групп 7/4. Сохранены семь четвертей.'),
    'M11': ('UNSUPPORTED','Аддитивный числитель отклонён.'),
    'M12': ('UNSUPPORTED','Аддитивный числитель отклонён.'),
    'M13': ('UNSUPPORTED','Аддитивный числитель отклонён.'),
    'M14': ('UNSUPPORTED','Аддитивный числитель отклонён.'),
    'M15': ('AMBIGUOUS','Без явных групп 11/8. Сохранены 11 позиций.'),
    'M16': ('PASS','Границы 4/4 → 3/4 корректны в конвертере.'),
    'M17': ('FAIL','Границы верны, второй раунд в Main имеет шесть основных подписей.'),
    'M18': ('FAIL','Границы верны, основные группы сложного метра утрачены.'),
    'M19': ('PARTIAL','Затакт занимает 1 Q. Renderer ставит РАЗ на его старте вместо выбранной слабой фазы.'),
    'M20': ('FAIL','Заключительный 1 Q без implicit дополнен до 4 Q.'),
    'M21': ('PASS','Рациональные триольные длительности прошли импорт и worker.'),
    'M22': ('PARTIAL','Дуоли прошли, группировка 6/8 отсутствует.'),
    'M23': ('PARTIAL','Синкопированные длительности проходят, основной счёт 6/8 отсутствует.'),
    'M24': ('PASS','Лигованные сегменты попали в конвертер и worker. Аудио стык отдельно не измерен.'),
    'M25': ('FAIL','Дробная точка доли передана в BigInt при реализации фермат.'),
    'M26': ('PASS','TempoMap и часы обработали смену скорости 120 → 90.'),
    'M27': ('FAIL','Печатные четверть 120 и четверть с точкой 80 эквивалентны. Fallback создаёт 120 → 80 QPM.'),
    'M28': ('AMBIGUOUS','Нет оснований выбрать одну из трёх группировок.'),
    'M29': ('PARTIAL','Активен sound tempo 90 QPM, но расхождение с печатным 94,5 QPM теряется.'),
    'M30': ('UNSUPPORTED','Свободный метр отвергнут при разборе размера.'),
    'M31': ('PARTIAL','Три половинные на уровне Converter, обычный метроном Main идёт четвертями.'),
    'M32': ('PARTIAL','Две восьмые на уровне Converter, обычный метроном Main идёт четвертями.'),
    'M33': ('UNSUPPORTED','Явная запись 2+3+2/8 отвергнута.'),
    'M34': ('FAIL','Рёбра позволяют предположить 2+3+2, в модели остались семь равных позиций.'),
}

def main():
    reference = read('reference.json')
    ui = {row['name']:row for row in read('browser-ui.json')['ui']}
    matrix = []
    for row in read('browser-matrix.json'):
        name = row['name'].split('.')[0]
        if name not in reference:
            continue
        ref = reference[name]
        verdict, detail = JUDGMENTS[name]
        entry = dict(case=name, status=verdict, detail=detail, expected=ref)
        if 'error' in row:
            entry['importError'] = row['error']
        else:
            entry.update({key:row[key] for key in ('rounds','bpmDisplay','tempo','clockSeconds','preCountFirst','fingering','maxRoundTripErrorQ')})
            entry['nominalClockDifferenceS'] = row['clockSeconds']-float(Fraction(ref['nominalSeconds']))
        entry['browserUi'] = ui.get(name,'NOT TESTED')
        matrix.append(entry)
    assert len(matrix)==len(reference)
    (RESULTS/'comparison.json').write_text(json.dumps(matrix,ensure_ascii=False,indent=2)+'\n')
    with (RESULTS/'matrix.md').open('w') as output:
        print('| Сценарий | Статус в проверенном слое | Эталон, с | Clock, с | Транспорт Main | Результат |',file=output)
        print('|---|---|---:|---:|---|---|',file=output)
        for item in matrix:
            ref = float(Fraction(item['expected']['nominalSeconds']))
            actual = f"{item['clockSeconds']:.6f}" if 'clockSeconds' in item else '—'
            test = item['browserUi']
            coverage = test if isinstance(test,str) else ('IMPORT ERROR' if 'error'in test else 'Проверен')
            print(f"| {item['case']} | {item['status']} | {ref:.6f} | {actual} | {coverage} | {item['detail']} |",file=output)

if __name__ == '__main__':
    main()
