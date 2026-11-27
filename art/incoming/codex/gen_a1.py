from pathlib import Path
from PIL import Image

PALETTE = {'.': None, 'o': (58, 36, 30), 'f': (199, 90, 46), 'd': (174, 79, 44), 'h': (231, 161, 92), 'c': (255, 224, 179), 'p': (255, 145, 164), 'e': (41, 5, 46), 'w': (254, 254, 252), 'n': (128, 60, 50)}

FRAMES = {
    'idle-1': [
        '................................',
        '..................oooo..........',
        '.................ooffoo.........',
        '.................ofppfo.........',
        '..............oooofppfo.........',
        '............ooofffffffo.........',
        '...........oofffffffffo.........',
        '..........ooffffffffffo.........',
        '..........offfffffffffo.........',
        '.........oofffffffccccoo........',
        '.........offffffffcewcco........',
        '.........offffffffceecco........',
        '.........offffffffccccoo........',
        '.........offffffffdccco.........',
        '.........offfffffffddooooo......',
        '.........offccccccffoofffoo.....',
        '.........ofccccccccoffffccoo....',
        '.........occcccccccoffffccfo....',
        '.........occcccccccoffffffoo....',
        '....ooooooccccccccccoofffoo.....',
        '....offfoocccccccccccooooo......',
        '....offfooccccccccccffo.........',
        '....oooooofccccccccfffo.........',
        '.........offccccccffffoo........',
        '.........offffoooooffffo........',
        '.........offffo...offffo........',
        '.........ooffoo...ooffoo........',
        '..........oooo.....oooo.........',
        '................................',
        '................................',
        '................................',
        '................................',
    ],

    'idle-2': [
        '................................',
        '................................',
        '..................oooo..........',
        '.................ooffoo.........',
        '.................ofppfo.........',
        '..............oooofppfo.........',
        '............ooofffffffo.........',
        '...........oofffffffffo.........',
        '..........ooffffffffffo.........',
        '.........oofffffffccccoo........',
        '.........offffffffcewcco........',
        '.........offffffffceecco........',
        '.........offffffffccccco........',
        '.........offffffffdcccco........',
        '.........offfffffffddooooo......',
        '.........offccccccffoofffoo.....',
        '.........ofccccccccoffffccoo....',
        '.........occcccccccoffffccfo....',
        '.........occcccccccoffffffoo....',
        '....ooooooccccccccccoofffoo.....',
        '....offfoocccccccccccooooo......',
        '....offfooccccccccccffo.........',
        '....oooooofccccccccfffo.........',
        '.........offccccccffffoo........',
        '.........offffoooooffffo........',
        '.........offffo...offffo........',
        '.........ooffoo...ooffoo........',
        '..........oooo.....oooo.........',
        '................................',
        '................................',
        '................................',
        '................................',
    ],

    'action-windup': [
        '................................',
        '................................',
        '................................',
        '...............oooooo...........',
        '...........ooooofppfoo..........',
        '.........ooofffffffffoo.........',
        '........ooffffffffffoo..........',
        '.......ooffffffffffoo...........',
        '.......offfffffffffo............',
        '......oofffffffccccoo...........',
        '......offffffffcewcco...........',
        '......offffffffceecco...........',
        '......offffffffcccccoo..........',
        '......offfffffffcccccoo.........',
        '......ofdffffffffdcooooo........',
        '......offdffccccccoffffoo.......',
        '......ofdffccccccofffccfoo......',
        '......ooffcccccccofffccfoo......',
        '.......ofccccccccoffffffoo......',
        '....ooooocccccccccoffffoo.......',
        '....offfoocccccccccooooo........',
        '....offfooocccccccccffo.........',
        '....oooooooccccccccfffo.........',
        '.........oofccccccffffoo........',
        '.........offffoooooffffo........',
        '.........offffo...offffo........',
        '.........ooffoo...ooffoo........',
        '..........oooo.....oooo.........',
        '................................',
        '................................',
        '................................',
        '................................',
    ],

    'action-strike': [
        '................................',
        '..................oooo..........',
        '.................ooffoo.........',
        '.................ofppfo.........',
        '...............ooofppfo.........',
        '.............oooffffffo.........',
        '............ooffffffffo.........',
        '...........oofffffffffoo........',
        '...........offfffffffffo........',
        '..........ooffffffcccccoo.......',
        '..........offfffffcewccno.......',
        '..........offfffffceeccco.......',
        '.........oofffffffcccccoo.......',
        '.........offffffffdccceo........',
        '.........offfffffffddoooooooooo.',
        '.........offccccccfoofffffffooo.',
        '.........ofcccccccoffffffffccfo.',
        '.........occccccccoffffffffccfo.',
        '.........occcccccccoofffffffooo.',
        '....oooooocccccccccccoooooooooo.',
        '....offfoocccccccccccoo.........',
        '....offfooccccccccccfo..........',
        '....oooooofccccccccffoo.........',
        '.........offccccccffffoo........',
        '.........offffoooooffffo........',
        '.........offffo...offffo........',
        '.........ooffoo...ooffoo........',
        '..........oooo.....oooo.........',
        '................................',
        '................................',
        '................................',
        '................................',
    ],

    'hop-air': [
        '................................',
        '..................oooo..........',
        '.................ooffoo.........',
        '.................ofppfo.........',
        '..............oooofppfo.........',
        '............ooofffffffo.........',
        '...........oofffffffffo.........',
        '..........ooffffffffffo.........',
        '..........offfffffffffo.........',
        '.........oofffffffccccoo........',
        '.........offffffffcewcco........',
        '.........offffffffceecco........',
        '.........offffffffccccoo........',
        '.........offffffffdccooooo......',
        '.........offfffffffddofffoo.....',
        '.........offccccccffofffccoo....',
        '.........ofccccccccoffffccfo....',
        '.........occcccccccoffffffoo....',
        '.........occcccccccofofffoo.....',
        '....oooooocccccccccco...........',
        '....offfoocccccccccccooooo......',
        '....offfooccccccccccfoo.........',
        '....oooooofccccccccffo..........',
        '.........offccccccfffoo.........',
        '.........offffooooofffo.........',
        '..........ofoo....ofoo..........',
        '..........ooo......ooo..........',
        '................................',
        '................................',
        '................................',
        '................................',
        '................................',
    ],

}


def main():
    output_dir = Path(__file__).resolve().parent / 'none-1'
    output_dir.mkdir(exist_ok=True)
    for name, rows in FRAMES.items():
        if len(rows) != 32 or any(len(row) != 32 for row in rows):
            raise ValueError(f'{name}: expected a 32x32 map')
        image = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
        for y, row in enumerate(rows):
            for x, symbol in enumerate(row):
                color = PALETTE[symbol]
                if color is not None:
                    image.putpixel((x, y), (*color, 255))
        image = image.resize ( (64, 64), Image.Resampling.NEAREST )
        bbox = image.getbbox()
        if bbox is None:
            raise ValueError(f'{name}: empty frame')
        crop = image.crop(bbox)
        if crop.width > 62 or crop.height > 56:
            raise ValueError(f'{name}: shrink the map; bbox is {crop.size}')
        canvas = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        bottom = 51 if name == 'hop-air' else 61
        canvas.paste(crop, (round(32 - crop.width / 2), bottom - crop.height + 1))
        canvas.save(output_dir / f'{name}.png')


if __name__ == '__main__':
    main()