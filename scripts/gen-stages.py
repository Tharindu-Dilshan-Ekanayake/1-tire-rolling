"""Writes the stage table into shared/balance.js: 40 stages, STAGE metres each.

Usage: python scripts/gen-stages.py [wins growth per stage = 1.8] [wins per metre in stage 1 = 0.006]
Then check the pacing with: node scripts/balance-sim.mjs
"""
import math
import re
import sys

G = float(sys.argv[1]) if len(sys.argv) > 1 else 1.8
W0 = float(sys.argv[2]) if len(sys.argv) > 2 else 0.006
STAGE = 300
BASE, K, H0 = 60, 260, 50

stages = [
    ('grassy', 'Grassy Meadow', 'grassy'), ('autumn', 'Autumn Forest', 'autumn'), ('desert', 'Desert Canyon', 'desert'),
    ('beach', 'Sunny Beach', 'beach'), ('jungle', 'Jungle Ruins', 'jungle'), ('frozen', 'Frozen Peaks', 'frozen'),
    ('cherry', 'Cherry Blossom', 'cherry'), ('candy', 'Candy Land', 'candy'), ('mushroom', 'Mushroom Valley', 'mushroom'),
    ('volcano', 'Lava Volcano', 'volcano'), ('swamp', 'Lily Swamp', 'swamp'), ('crystal', 'Crystal Caves', 'crystal'),
    ('ocean', 'Coral Reef', 'ocean'), ('neon', 'Neon City', 'neon'), ('sky', 'Cloud Kingdom', 'sky'),
    ('rainbow', 'Rainbow Road', 'rainbow'), ('moon', 'Moon Base', 'moon'), ('aurora', 'Aurora Tundra', 'aurora'),
    ('space', 'Outer Space', 'space'), ('cosmic', 'Cosmic Core', 'cosmic'),
    ('hills', 'Green Hills', 'grassy'), ('maple', 'Maple Woods', 'autumn'), ('dunes', 'Dune Sea', 'desert'),
    ('island', 'Palm Island', 'beach'), ('temple', 'Lost Temple', 'jungle'), ('glacier', 'Glacier Pass', 'frozen'),
    ('sakura', 'Sakura Garden', 'cherry'), ('sweets', 'Sweet Valley', 'candy'), ('fungi', 'Fungi Forest', 'mushroom'),
    ('magma', 'Magma Core', 'volcano'), ('marsh', 'Green Marsh', 'swamp'), ('gems', 'Gem Mines', 'crystal'),
    ('deep', 'Deep Ocean', 'ocean'), ('cyber', 'Cyber City', 'neon'), ('castle', 'Sky Castle', 'sky'),
    ('prism', 'Prism Path', 'rainbow'), ('lunar', 'Lunar Craters', 'moon'), ('lights', 'Northern Lights', 'aurora'),
    ('galaxy', 'Galaxy Rift', 'space'), ('infinity', 'Infinity', 'cosmic'),
]


def r2(n):
    if n < 100:
        return round(n)
    st = 10 ** (math.floor(math.log10(n)) - 1)
    return round(n / st) * st


def num(n):
    if n >= 1e6:
        e = math.floor(math.log10(n))
        m = n / 10 ** e
        return f"{m:g}e{e}"
    return f"{n:g}"


lines = []
for i, (sid, name, theme) in enumerate(stages):
    start = i * STAGE
    if i == 0:
        wall = smash = disc = 0
    else:
        # Health that just reaches the gate on open ground, and a bit more to smash it.
        reach = H0 * (math.exp((start - BASE) / K) - 1)
        wall = r2(1.3 * reach)
        smash = r2(2 * G ** (i - 1))
        disc = r2(5 * G ** (i - 1))
    wpm = float(f"{W0 * G ** i:.3g}")
    lines.append(f"  {{ id: '{sid}', name: '{name}', theme: '{theme}', start: {start}, wall: {num(wall)}, winsPerMeter: {num(wpm)}, smash: {num(smash)}, discover: {num(disc)} }},")

p = __import__('pathlib').Path(__file__).resolve().parent.parent / 'shared' / 'balance.js'
s = open(p, encoding='utf-8').read()
s = re.sub(r"export const ZONES = \[.*?\n\]", "export const ZONES = [\n" + "\n".join(lines) + "\n]", s, flags=re.S)
open(p, 'w', encoding='utf-8').write(s)
print(f"G={G} W0={W0}")
