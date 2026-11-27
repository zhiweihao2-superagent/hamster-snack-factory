from pathlib import Path
from PIL import Image

PALETTE = {
    '.': None, 'o': (58, 36, 30), 'g': (126, 132, 141),
    'G': (163, 167, 170), 'k': (85, 91, 101), 'r': (199, 25, 50),
    'R': (255, 120, 120), 'y': (250, 200, 80), 'c': (212, 213, 219),
    'e': (255, 40, 40), 'w': (254, 254, 252), 'n': (60, 40, 40),
    'm': (110, 110, 125),
}


def make_pose(rows):
    assert len(rows) == 32
    assert all(len(row) <= 32 for row in rows)
    return [row.ljust(32, '.') for row in rows]


BASE = make_pose([
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '...........oooo.................',
    '..........ogGgoo................',
    '.........ogGGgko..oooo..........',
    '........ogGGggkoookgggo.........',
    '.......ooggggggkkggGGggo........',
    '......oggGggggggggGGGGggo.......',
    '.....ogGGggggggggggGGGGggo......',
    '....ooggggggggggggggGGGGggo.....',
    '...ogggggoooggGGgggggGGGgggo....',
    '..ogggggoewogGGGGgggggggggggo...',
    '.oGGggggoeeogGGGGGggggggggggo...',
    'oGGGGggggoooggGGGGGggggggggggo..',
    'ongGGGGggggggggGGGGggggggggggo..',
    '.onnggggggggggggggggggggggggo...',
    '..oocccokgggggggggggggggggggo...',
    '....ooookggggggggggggggggggo....',
    '.......okgggokggggggggggggo.....',
    '.......oggggookggggggggggo......',
    '......ogggggo.okggggggggo.......',
    '......okgggko..okggggggko.......',
    '......ookooko..ookgggkkoo.......',
    '......ooooooo...oooooooko.......',
    '..................ooooooo.......',
    '................................',
    '................................',
    '................................',
    '................................',
])


def altered(base, shifts, patches):
    rows = []
    for index, row in enumerate(base):
        offset = shifts.get(index, 0)
        if offset > 0:
            row = '.' * offset + row[:32 - offset]
        elif offset < 0:
            row = row[-offset:] + '.' * (-offset)
        rows.append(list(row))
    for x, y, text in patches:
        rows[y][x:x + len(text)] = text
    return [''.join(row) for row in rows]


POSES = {
    'idle-1': BASE,
    'idle-2': altered(BASE, {}, [
        (5, 11, 'ogGGggggggggggggGGGGggo'),
        (7, 24, 'okggko'), (7, 25, 'ookoko'),
    ]),
    'action-windup': altered(BASE, {index: 1 for index in range(5, 20)}, [
        (4, 20, '...ookggggggggggggggggggo'),
        (5, 21, '..okgggokggggggggggggo'),
    ]),
    'action-strike': altered(BASE, {index: -1 for index in range(7, 21)}, [
        (0, 18, 'onnoookgggggggggggggggggggo'),
        (1, 19, 'onccnoookgggggggggggggggggo'),
        (0, 23, 'oooookggggo'), (0, 24, 'okkoookggko'),
        (0, 25, 'oooo..ookoo'),
    ]),
    'hop-air': altered(BASE, {}, [
        (6, 23, '.okgggko..okgggggggko'),
        (6, 24, '..ookkoo...okgggggkoo'),
        (6, 25, '...oooo....ookgggkoo'),
        (6, 26, '............ooooooo'),
        (18, 27, '........'),
    ]),
}


def put(grid, x, y, character):
    if 0 <= x < 32 and 0 <= y < 32:
        grid[y][x] = character


def decorate(grid, tier, pose='idle-1'):
    # The tail remains part of the pose, rather than changing with equipment.
    tail = [(25, 19), (26, 19), (27, 18), (28, 18), (29, 17), (30, 16)]
    if pose == 'hop-air':
        tail = [(25, 18), (26, 17), (27, 16), (28, 15), (28, 14), (29, 13)]
    for x, y in tail:
        put(grid, x, y, 'o')
        put(grid, x, y + 1, 'k')
    # Vertical, individually outlined dynamite sticks, fixed against the torso.
    stick_positions = {1: [18], 2: [16, 20], 3: [14, 18, 22], 4: [12, 16, 20, 24]}[tier]
    for x in stick_positions:
        for y in range(15, 22):
            for delta, color in enumerate('orRo'):
                put(grid, x + delta, y, color)
        for delta, color in enumerate('oooo'):
            put(grid, x + delta, 14, color)
            put(grid, x + delta, 22, color)
    if tier >= 2:
        for x in range(stick_positions[0], stick_positions[-1] + 4):
            put(grid, x, 19, 'm')
    if tier >= 3:
        for x in stick_positions:
            put(grid, x + 1, 19, 'c')
        put(grid, 5, 19, 'c')
        put(grid, 6, 19, 'o')
    if tier == 4:
        for x, y in [(12, 10), (13, 11), (14, 12), (15, 13), (16, 14)]:
            put(grid, x, y, 'm')
        for x in stick_positions:
            put(grid, x + 2, 17, 'e')
            put(grid, x + 2, 20, 'e')
    fuse_x = stick_positions[len(stick_positions) // 2] + 1
    for y in range(11 - (tier >= 2), 14):
        put(grid, fuse_x, y, 'o')
    spark_y = 10 - (tier >= 2)
    put(grid, fuse_x, spark_y, 'y')
    if tier >= 3 or pose in ('action-windup', 'action-strike'):
        put(grid, fuse_x - 1, spark_y, 'y')
        put(grid, fuse_x + 1, spark_y, 'y')
        put(grid, fuse_x, spark_y - 1, 'y')
    if tier == 4 or pose == 'action-strike':
        put(grid, fuse_x, spark_y + 1, 'R')
        put(grid, fuse_x - 1, spark_y - 1, 'R')
        put(grid, fuse_x + 1, spark_y - 1, 'y')
    if pose == 'idle-2':
        put(grid, fuse_x + 1, spark_y, 'y')
    return grid


def render(pose, tier):
    grid = decorate([list(row) for row in POSES[pose]], tier, pose)
    image = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    for y, row in enumerate(grid):
        for x, character in enumerate(row):
            color = PALETTE[character]
            if color is not None:
                image.putpixel((x, y), (*color, 255))
    image = image.resize ( (64, 64), Image.Resampling.NEAREST)
    cropped = image.crop(image.getbbox())
    if cropped.width > 62 or cropped.height > 56:
        raise ValueError('Pose exceeds the permitted logical map size')
    canvas = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    bottom = 51 if pose == 'hop-air' else 61
    canvas.paste(cropped, (round(32 - cropped.width / 2), bottom - cropped.height + 1))
    return canvas


def main():
    for tier in range(1, 5):
        directory = Path(f'foe-blast-{tier}')
        directory.mkdir(exist_ok=True)
        for pose in POSES:
            render(pose, tier).save(directory / f'{pose}.png')


if __name__ == '__main__':
    main()