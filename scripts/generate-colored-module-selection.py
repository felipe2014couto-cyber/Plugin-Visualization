#!/usr/bin/env python3
"""Generate the pinned, non-duplicated selection for the colored modules."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, Iterable, List, Tuple


SOURCES = {
    'tabler-icons': 'icons/outline',
    'phosphor-core': 'raw/regular',
    'iconoir': 'icons/regular',
    'siemens-ix-icons': 'incoming-svg',
}

MODULES = [
    ('Bombas', ('phosphor-core', 'tabler-icons'), r'pump|drop|droplet|funnel|filter|pipe|gas|wave|water|flow|fountain|bucket|valve|fluid|flask'),
    ('Caldeiras', ('tabler-icons', 'phosphor-core'), r'flame|fire|temperature|thermo|heat|sun|chimney|smoke|furnace|boiler|gas|steam|burner|factory|radiator|fireplace|campfire'),
    ('Computadores', ('siemens-ix-icons',), r'application-screen|monitor|screen|server|rack|keyboard|mouse|network|plc|storage|cloud|computer|desktop|terminal|project-server|device'),
    ('Dutos', ('tabler-icons',), r'pipe|pipeline|air-conditioning|wind|filter|funnel|factory|chimney|duct|route|arrow|box|rectangle|square'),
    ('Encanamentos', ('phosphor-core',), r'pipe|drop|funnel|wave|water|valve|filter|flow|gas|plug|arrow|circle|barrel|faucet|shower'),
    ('Fios e cabos', ('tabler-icons',), r'circuit|plug|cable|usb|network|antenna|bolt|link|battery|electric|wire|connector|signal|device|arrow'),
    ('Misturadores', ('phosphor-core',), r'gear|fan|propeller|beaker|flask|rotate|arrow|recycle|circle|settings|wind|drop|wave|atom|spinner'),
    ('Motores', ('tabler-icons', 'phosphor-core'), r'engine|motor|gearbox|gear|fan|propeller|robot|car|truck|rotate|circuit|wheel|turbine'),
    ('Mineração', ('tabler-icons',), r'truck|crane|bucket|forklift|building|mountain|rock|hammer|cone|filter|factory|warehouse|train|mine|scale|weight|drill|sieve|magnet|dump|road|loader'),
    ('Setas', ('tabler-icons',), r'^arrow|arrows|caret|chevron|direction|route|transfer|corner|rotate'),
    ('Sensores', ('siemens-ix-icons',), r'sensor|axis|encoder|voltage|current|power|monitor|flow|position|rotation|temperature|pressure|level|device|indicator|alarm|camera|photo|measurement|meter'),
    ('Tubos', ('iconoir', 'tabler-icons', 'phosphor-core'), r'pipe|tube|cylinder|diameter|angle|compress|droplet|funnel|circle|ring|line|hose|gas-tank'),
    ('Usinagem', ('tabler-icons', 'phosphor-core'), r'tool|hammer|screwdriver|wrench|drill|saw|machine|robot|gear|cog|circle|ruler|cut|chisel|axe|bolt|clamp|vice|lathe|mill'),
    ('Transportadores', ('iconoir', 'tabler-icons'), r'truck|conveyor|package|arrow|box|train|forklift|crane|roller|route|delivery|cart|cargo|container|trolley|transport'),
    ('Esteiras', ('tabler-icons', 'phosphor-core'), r'track|roller|conveyor|arrow|move|truck|package|road|stairs|align|route|wheel|belt|flow|transfer'),
    ('Correias', ('iconoir', 'tabler-icons'), r'belt|chain|link|arrow|infinity|circle|rotate|wheel|track|conveyor|roller|compress|loop|transfer'),
    ('Válvulas', ('phosphor-core', 'tabler-icons'), r'valve|switch|toggle|plug|drop|funnel|filter|lock|settings|circle|arrow|flow|pipe|gate|lever|control'),
    ('Ventoinhas e ventiladores', ('tabler-icons', 'phosphor-core'), r'fan|wind|propeller|blower|air|turbine|rotor|wheel|air-conditioning|pinwheel|windmill|flow'),
    ('Botões', ('siemens-ix-icons',), r'control-button|radio|switch|button|toggle|key|control|arrow|confirm|cancel|alarm|power|play|stop|reset|tag-circle'),
]

TRANSLATIONS = {
    'engine': 'motor', 'motor': 'motor', 'gearbox': 'caixa de engrenagens', 'gear': 'engrenagem',
    'fan': 'ventoinha', 'wind': 'vento', 'propeller': 'hélice', 'turbine': 'turbina', 'robot': 'robô',
    'pump': 'bomba', 'drop': 'gota', 'droplet': 'gota', 'funnel': 'funil', 'filter': 'filtro',
    'pipe': 'tubulação', 'pipeline': 'duto', 'gas': 'gás', 'wave': 'onda', 'waves': 'ondas',
    'water': 'água', 'flow': 'fluxo', 'flask': 'frasco', 'beaker': 'béquer', 'fire': 'fogo',
    'flame': 'chama', 'temperature': 'temperatura', 'thermometer': 'termômetro', 'sun': 'solar',
    'factory': 'fábrica', 'chimney': 'chaminé', 'smoke': 'fumaça', 'steam': 'vapor', 'burner': 'queimador',
    'screen': 'tela', 'monitor': 'monitor', 'server': 'servidor', 'rack': 'rack', 'keyboard': 'teclado',
    'mouse': 'mouse', 'network': 'rede', 'plc': 'PLC', 'storage': 'armazenamento', 'cloud': 'nuvem',
    'computer': 'computador', 'desktop': 'desktop', 'terminal': 'terminal', 'device': 'dispositivo',
    'sensor': 'sensor', 'axis': 'eixo', 'encoder': 'encoder', 'voltage': 'tensão', 'current': 'corrente',
    'power': 'potência', 'position': 'posição', 'rotation': 'rotação', 'pressure': 'pressão', 'level': 'nível',
    'indicator': 'indicador', 'alarm': 'alarme', 'camera': 'câmera', 'photo': 'foto', 'meter': 'medidor',
    'circuit': 'circuito', 'plug': 'plugue', 'usb': 'USB', 'antenna': 'antena', 'bolt': 'raio',
    'battery': 'bateria', 'signal': 'sinal', 'switch': 'chave', 'toggle': 'alternância', 'control': 'controle',
    'arrow': 'seta', 'arrows': 'setas', 'caret': 'marcador', 'chevron': 'conexão', 'route': 'rota',
    'transfer': 'transferência', 'rotate': 'rotação', 'truck': 'caminhão', 'crane': 'guindaste',
    'bucket': 'caçamba', 'forklift': 'empilhadeira', 'building': 'edifício', 'warehouse': 'armazém',
    'train': 'trem', 'scale': 'balança', 'weight': 'peso', 'drill': 'furadeira', 'sieve': 'peneira',
    'magnet': 'ímã', 'hammer': 'martelo', 'tool': 'ferramenta', 'tools': 'ferramentas', 'wrench': 'chave',
    'screwdriver': 'chave de fenda', 'ruler': 'régua', 'cut': 'corte', 'machine': 'máquina', 'package': 'pacote',
    'conveyor': 'transportador', 'roller': 'rolo', 'delivery': 'entrega', 'cart': 'carro', 'cargo': 'carga',
    'container': 'contêiner', 'track': 'esteira', 'move': 'movimento', 'road': 'via', 'wheel': 'roda',
    'belt': 'correia', 'chain': 'corrente', 'link': 'elo', 'circle': 'circular', 'loop': 'laço',
    'valve': 'válvula', 'lock': 'bloqueio', 'settings': 'configuração', 'gate': 'gaveta', 'lever': 'alavanca',
    'button': 'botão', 'radio': 'rádio', 'key': 'chave', 'play': 'iniciar', 'stop': 'parar', 'reset': 'reset',
    'confirm': 'confirmar', 'cancel': 'cancelar', 'tag': 'etiqueta', 'application': 'aplicação', 'project': 'projeto',
    'filled': 'preenchido', 'generic': 'genérico', 'positioning': 'posicionamento', 'physically': 'físico',
}

EXCLUDED = re.compile(r'(?:brand|logo|filled|bold|duotone|light|thin|color|off|cancel|disabled|slash|youtube|linkedin)', re.I)


def files_for(root: Path, source: str) -> List[Path]:
    return sorted((root / source / SOURCES[source]).glob('*.svg'))


def display_name(stem: str) -> str:
    words = stem.replace('_', '-').split('-')
    translated = [TRANSLATIONS.get(word.lower(), word) for word in words if word.lower() not in {'filled'}]
    value = ' '.join(translated).strip()
    return value[:1].upper() + value[1:]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-root', action='append', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    roots = {}
    for value in args.source_root:
        source, separator, path = value.partition('=')
        if not separator or source not in SOURCES:
            raise ValueError(f'Fonte inválida: {value}')
        roots[source] = Path(path).resolve()

    used = set()
    output = []
    for category, preferred_sources, pattern in MODULES:
        regex = re.compile(pattern, re.I)
        candidates = []
        for source_rank, source in enumerate(preferred_sources):
            for path in files_for(roots[source], source):
                stem = path.stem
                if EXCLUDED.search(stem) or not regex.search(stem):
                    continue
                key = (source, str(path.relative_to(roots[source])))
                if key in used:
                    continue
                score = sum(1 for token in pattern.split('|') if token.strip('^$') and re.search(token.strip('^$'), stem, re.I))
                candidates.append((-score, source_rank, stem, source, str(path.relative_to(roots[source]))))
        candidates.sort()
        selected = candidates[:23]
        if len(selected) < 23:
            raise RuntimeError(f'{category}: apenas {len(selected)} candidatos únicos')
        for _, _, stem, source, source_path in selected:
            used.add((source, source_path))
            output.append({
                'source': source,
                'sourcePath': source_path,
                'category': category,
                'name': display_name(stem),
                'keywords': [category.lower(), stem.replace('-', ' ')],
            })

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'version': 1, 'entries': output}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Generated {len(output)} selections across {len(MODULES)} modules')


if __name__ == '__main__':
    main()
