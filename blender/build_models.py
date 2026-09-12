"""Modelado procedural de todos los assets de Murallas de Rocanegra.

Uso:
    blender -b -P blender/build_models.py -- --out assets/models/rocanegra.glb

Genera un único .glb con un nodo raíz por asset (torres, enemigos, decorados,
castillo y proyectiles). Los nodos que el juego anima llevan sufijos conocidos:

    __yaw    parte que gira hacia el objetivo (torres)
    __body   torso que cabecea al andar
    __legL/R piernas que oscilan
    __wingL/R alas que baten
    __arm    brazo de la catapulta

Una unidad de Blender = una casilla del tablero (48 px en el juego 2D original).
"""

import bpy
import json
import math
import sys
import os
from contextlib import contextmanager

TAU = math.pi * 2
ASSETS = []
MATS = {}


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def mat(name, color, rough=0.85, metal=0.0, emit=None, emit_str=4.0):
    """Material Principled reutilizable, definido con color en sRGB."""
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    r, g, b = hex_rgb(color)
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        er, eg, eb = hex_rgb(emit)
        bsdf.inputs['Emission Color'].default_value = (er, eg, eb, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emit_str
    MATS[name] = m
    return m


def _place(obj, parent, m, loc, rot, scale=None):
    obj.location = loc
    obj.rotation_euler = rot
    if scale:
        obj.scale = scale
    if m:
        obj.data.materials.append(m)
    if parent:
        obj.parent = parent
    return obj


def group(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.1
    bpy.context.collection.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
    return e


def box(parent, m, size, loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    return _place(o, parent, m, loc, rot, size)


def cyl(parent, m, r, h, loc=(0, 0, 0), rot=(0, 0, 0), verts=10, scale=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h)
    o = bpy.context.object
    return _place(o, parent, m, loc, rot, scale)


def cone(parent, m, r1, r2, h, loc=(0, 0, 0), rot=(0, 0, 0), verts=10):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h)
    o = bpy.context.object
    return _place(o, parent, m, loc, rot)


def ball(parent, m, r, loc=(0, 0, 0), scale=None, seg=10, ring=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=r)
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    return _place(o, parent, m, loc, (0, 0, 0), scale)


def rock_shape(parent, m, r, loc=(0, 0, 0), scale=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r)
    o = bpy.context.object
    return _place(o, parent, m, loc, (0.3, 0.2, 0.5), scale)


def ring_of(fn, count, radius, **kw):
    for i in range(count):
        a = TAU * i / count
        fn(a, radius * math.cos(a), radius * math.sin(a), **kw)


@contextmanager
def asset(name):
    g = group(name)
    yield g
    ASSETS.append(g)


# --------------------------------------------------------------------------
# Paleta
# --------------------------------------------------------------------------

def M():
    return {
        'stone': mat('stone', '#b0a795', 0.9),
        'stone_dark': mat('stone_dark', '#6e685e', 0.95),
        'stone_warm': mat('stone_warm', '#8b7b60', 0.9),
        'wood': mat('wood', '#7a5836', 0.85),
        'wood_dark': mat('wood_dark', '#4e3a22', 0.9),
        'metal': mat('metal', '#aeb6c0', 0.42, 0.75),
        'iron': mat('iron', '#6b6f76', 0.5, 0.7),
        'gold': mat('gold', '#d9a441', 0.3, 0.9),
        'roof_blue': mat('roof_blue', '#2f5f86', 0.8),
        'roof_red': mat('roof_red', '#6a3f33', 0.85),
        'ice': mat('ice', '#9fe0f5', 0.25, 0.0, '#6fc8ee', 1.3),
        'fire': mat('fire', '#ff8a22', 0.7, 0.0, '#ff6a0c', 2.0),
        'fire_core': mat('fire_core', '#ffd98c', 0.7, 0.0, '#ffc04a', 2.6),
        'cloth_red': mat('cloth_red', '#8e2b26', 0.9),
        'cloth_blue': mat('cloth_blue', '#3f5a7a', 0.9),
        'cloth_brown': mat('cloth_brown', '#6b4630', 0.9),
        'leather': mat('leather', '#4a3a2a', 0.9),
        'skin_goblin': mat('skin_goblin', '#7aa33f', 0.85),
        'skin_orc': mat('skin_orc', '#4f7a3a', 0.85),
        'skin_ogre': mat('skin_ogre', '#a8895b', 0.85),
        'skin_pale': mat('skin_pale', '#c8a882', 0.85),
        'fur': mat('fur', '#7d828a', 0.9),
        'fur_dark': mat('fur_dark', '#565a61', 0.9),
        'bone': mat('bone', '#d8cdb2', 0.8),
        'purple': mat('purple', '#6d4f96', 0.85),
        'purple_light': mat('purple_light', '#a884d8', 0.85),
        'necro': mat('necro', '#432c5c', 0.9),
        'necro_glow': mat('necro_glow', '#cdf76f', 0.45, 0.0, '#9ef04a', 2.2),
        'dragon': mat('dragon', '#8c2f22', 0.85),
        'dragon_wing': mat('dragon_wing', '#c4553a', 0.85),
        'dark': mat('dark', '#2a2529', 0.9),
        'leaf': mat('leaf', '#3d6330', 0.95),
        'leaf_dark': mat('leaf_dark', '#2c4a22', 0.95),
        'trunk': mat('trunk', '#4a3521', 0.95),
        'rock': mat('rock', '#7c7870', 0.95),
        'moss': mat('moss', '#5c7a38', 0.95),
        'black': mat('black', '#141518', 0.95),
        'snow': mat('snow', '#e8eef5', 0.75),
        'crag': mat('crag', '#5e5a58', 1.0),
        'crag_dark': mat('crag_dark', '#464240', 1.0),
        'grass_far': mat('grass_far', '#46662f', 1.0),
        'grass_dark': mat('grass_dark', '#38542a', 1.0),
        'cloud': mat('cloud', '#e9eef2', 1.0),
        'canvas_tent': mat('canvas_tent', '#8d7a55', 0.95),
        'stone_pale': mat('stone_pale', '#c9c3b2', 0.9),
        'stone_royal': mat('stone_royal', '#dcd6c4', 0.85),
        'storm': mat('storm', '#3c4a6b', 0.8),
        'storm_glow': mat('storm_glow', '#9fd8ff', 0.3, 0.0, '#5fb8ff', 2.4),
        'venom': mat('venom', '#5c6b3a', 0.9),
        'venom_glow': mat('venom_glow', '#a8e04a', 0.4, 0.0, '#7fd028', 2.2),
        'thatch': mat('thatch', '#b69353', 0.98),
        'wheat': mat('wheat', '#d8bb61', 0.95),
        'copper': mat('copper', '#b87a3d', 0.35, 0.8),
    }


# --------------------------------------------------------------------------
# Piezas reutilizables
# --------------------------------------------------------------------------

def tower_base(g, m, w=0.86):
    """Plataforma de piedra sobre la que se asienta cualquier torre."""
    box(g, m['stone_warm'], (w, w, 0.12), (0, 0, 0.06))
    box(g, m['stone_dark'], (w * 0.92, w * 0.92, 0.05), (0, 0, 0.14))
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(g, m['stone'], (0.14, 0.14, 0.06),
                (sx * w * 0.38, sy * w * 0.38, 0.19))


def crenellations(parent, m, radius, z, count=8, size=0.09):
    for i in range(count):
        a = TAU * i / count
        box(parent, m, (size, size, 0.1),
            (radius * math.cos(a), radius * math.sin(a), z), (0, 0, a))


def humanoid(parent, m, scale=1.0, skin='skin_goblin', cloth='cloth_brown',
             armor=None, helmet=None, ears=False, horns=False):
    """Figura bípeda con piernas y torso separados para poder animarlos."""
    s = scale
    body = group(parent.name + '__body', parent, (0, 0, 0.22 * s))
    legL = group(parent.name + '__legL', parent, (-0.07 * s, 0, 0.2 * s))
    legR = group(parent.name + '__legR', parent, (0.07 * s, 0, 0.2 * s))
    box(legL, m[cloth], (0.075 * s, 0.08 * s, 0.2 * s), (0, 0, -0.1 * s))
    box(legR, m[cloth], (0.075 * s, 0.08 * s, 0.2 * s), (0, 0, -0.1 * s))
    # pies
    box(legL, m['leather'], (0.085 * s, 0.13 * s, 0.05 * s), (0, -0.02 * s, -0.19 * s))
    box(legR, m['leather'], (0.085 * s, 0.13 * s, 0.05 * s), (0, -0.02 * s, -0.19 * s))

    torso = m[armor] if armor else m[cloth]
    box(body, torso, (0.26 * s, 0.19 * s, 0.24 * s), (0, 0, 0.12 * s))
    if armor:
        box(body, m[armor], (0.30 * s, 0.22 * s, 0.07 * s), (0, 0, 0.21 * s))
    # brazos, con hombro y mano
    for sx in (-1, 1):
        box(body, m[skin], (0.07 * s, 0.07 * s, 0.2 * s),
            (sx * 0.16 * s, 0, 0.12 * s), (0, sx * 0.12, 0))
        ball(body, m[armor] if armor else m[cloth], 0.055 * s,
             (sx * 0.155 * s, 0, 0.2 * s), seg=8, ring=5)
        ball(body, m[skin], 0.045 * s, (sx * 0.185 * s, 0, 0.03 * s), seg=8, ring=5)
    # cuello
    cyl(body, m[skin], 0.045 * s, 0.06 * s, (0, 0, 0.25 * s), verts=8)
    # cabeza
    head_z = 0.32 * s
    ball(body, m[skin], 0.1 * s, (0, 0, head_z), (1, 0.92, 1))
    if helmet:
        ball(body, m[helmet], 0.108 * s, (0, 0, head_z + 0.02 * s), (1, 1, 0.72))
        box(body, m['dark'], (0.17 * s, 0.02 * s, 0.045 * s),
            (0, -0.085 * s, head_z + 0.005 * s))
    else:
        for sx in (-1, 1):
            ball(body, m['black'], 0.018 * s,
                 (sx * 0.04 * s, -0.085 * s, head_z + 0.015 * s), seg=6, ring=4)
    if ears:
        for sx in (-1, 1):
            cone(body, m[skin], 0.045 * s, 0.0, 0.16 * s,
                 (sx * 0.13 * s, 0, head_z + 0.03 * s), (0, sx * 1.3, 0))
    if horns:
        for sx in (-1, 1):
            cone(body, m['bone'], 0.035 * s, 0.0, 0.17 * s,
                 (sx * 0.08 * s, 0, head_z + 0.1 * s), (0, sx * 0.7, 0))
    return body, legL, legR


def weapon_club(body, m, s):
    box(body, m['wood_dark'], (0.05 * s, 0.05 * s, 0.3 * s),
        (0.2 * s, 0.02 * s, 0.2 * s), (0.35, 0, 0))
    ball(body, m['wood'], 0.09 * s, (0.22 * s, -0.08 * s, 0.36 * s))


def weapon_axe(body, m, s):
    box(body, m['wood_dark'], (0.04 * s, 0.04 * s, 0.38 * s),
        (0.2 * s, 0.0, 0.22 * s), (0.25, 0, 0))
    box(body, m['metal'], (0.02 * s, 0.16 * s, 0.14 * s),
        (0.2 * s, -0.04 * s, 0.42 * s), (0.25, 0, 0))


def weapon_sword(body, m, s):
    box(body, m['metal'], (0.035 * s, 0.06 * s, 0.34 * s),
        (0.19 * s, 0.0, 0.3 * s), (0.18, 0, 0))
    box(body, m['gold'], (0.04 * s, 0.15 * s, 0.035 * s), (0.19 * s, 0, 0.15 * s))


def shield(body, m, s, color='cloth_red'):
    box(body, m[color], (0.03 * s, 0.2 * s, 0.24 * s), (-0.2 * s, -0.02 * s, 0.14 * s))
    ball(body, m['metal'], 0.035 * s, (-0.22 * s, -0.02 * s, 0.14 * s))


# --------------------------------------------------------------------------
# Torres
# --------------------------------------------------------------------------

PALETTES = {
    'stone': {'body': 'stone', 'trim': 'stone_dark', 'roof': 'roof_red', 'accent': 'metal'},
    'wood': {'body': 'wood', 'trim': 'wood_dark', 'roof': 'roof_red', 'accent': 'metal'},
    'ice': {'body': 'stone_pale', 'trim': 'roof_blue', 'roof': 'roof_blue', 'accent': 'ice'},
    'ember': {'body': 'stone_dark', 'trim': 'dark', 'roof': 'fire', 'accent': 'fire_core'},
    'storm': {'body': 'storm', 'trim': 'iron', 'roof': 'storm', 'accent': 'storm_glow'},
    'venom': {'body': 'venom', 'trim': 'wood_dark', 'roof': 'venom', 'accent': 'venom_glow'},
    'royal': {'body': 'stone_royal', 'trim': 'stone_dark', 'roof': 'roof_red', 'accent': 'gold'},
    'farm': {'body': 'wood', 'trim': 'wood_dark', 'roof': 'thatch', 'accent': 'wheat'},
}


def build_catalog(m, specs):
    """Modela las 100 construcciones descritas en blender/buildings.json."""
    for spec in specs:
        with asset('b_' + spec['key']) as g:
            build_one(g, m, spec)


def build_one(g, m, spec):
    shape = spec['shape']
    pal = PALETTES[shape['palette']]
    body_mat = m[pal['body']]
    trim_mat = m[pal['trim']]
    roof_mat = m[pal['roof']]
    accent = m[pal['accent']]
    tier = spec['tier'] - 1
    t = tier / max(1, spec['tiers'] - 1)          # 0..1 dentro de la familia

    tower_base(g, m)
    top = build_body(g, shape['body'], body_mat, trim_mat, accent, t, tier)
    top = build_roof(g, shape['roof'], roof_mat, accent, top, t)
    build_figure(g, m, shape['figure'], body_mat, accent, top, t)
    tier_marks(g, m, tier, t)


def build_body(g, kind, body, trim, accent, t, tier):
    """Cuerpo del edificio; devuelve la altura de su coronación."""
    if kind == 'round':
        h = 0.5 + t * 0.75
        cyl(g, body, 0.25 + t * 0.05, h, (0, 0, 0.16 + h / 2), verts=16)
        cyl(g, trim, 0.28 + t * 0.05, 0.06, (0, 0, 0.16 + h), verts=16)
        crenellations(g, body, 0.25 + t * 0.05, 0.22 + h, 8)
        return 0.2 + h

    if kind == 'tall':
        h = 0.85 + t * 0.95
        cyl(g, body, 0.2 + t * 0.03, h, (0, 0, 0.16 + h / 2), verts=14)
        for i in range(1 + int(t * 3)):
            cyl(g, trim, 0.23 + t * 0.03, 0.05, (0, 0, 0.3 + i * (h / (2 + t * 3))), verts=14)
        return 0.16 + h

    if kind == 'square':
        h = 0.42 + t * 0.6
        box(g, body, (0.46 + t * 0.1, 0.46 + t * 0.1, h), (0, 0, 0.16 + h / 2))
        box(g, trim, (0.56 + t * 0.1, 0.56 + t * 0.1, 0.06), (0, 0, 0.16 + h))
        return 0.18 + h

    if kind == 'obelisk':
        h = 0.75 + t * 0.9
        cone(g, body, 0.26 + t * 0.04, 0.1, h, (0, 0, 0.16 + h / 2), verts=6)
        for i in range(2 + int(t * 3)):
            a = TAU * i / (2 + int(t * 3))
            box(g, trim, (0.07, 0.07, 0.3 + t * 0.3),
                (0.3 * math.cos(a), 0.3 * math.sin(a), 0.32), (0, 0, a))
        return 0.16 + h

    if kind == 'frame':
        for sx in (-1, 1):
            for sy in (-1, 1):
                box(g, trim, (0.08, 0.08, 0.36 + t * 0.24),
                    (sx * 0.22, sy * 0.22, 0.34 + t * 0.12))
        top = 0.54 + t * 0.24
        box(g, body, (0.64, 0.64, 0.08), (0, 0, top))
        if t > 0.3:
            for sx in (-1, 1):
                box(g, body, (0.06, 0.52, 0.06), (sx * 0.3, 0, top + 0.08))
        return top + 0.04

    if kind == 'platform':
        box(g, body, (0.66, 0.66, 0.1), (0, 0, 0.22))
        box(g, trim, (0.7, 0.16, 0.06), (0, 0, 0.3))
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl(g, trim, 0.09 + t * 0.02, 0.05,
                    (sx * 0.24, sy * 0.26, 0.2), (0, math.pi / 2, 0), verts=8)
        return 0.3

    if kind == 'battery':
        box(g, body, (0.72, 0.6, 0.12), (0, 0, 0.23))
        for i in range(2 + int(t * 3)):
            x = -0.26 + i * (0.52 / max(1, 1 + int(t * 3)))
            box(g, trim, (0.1, 0.44, 0.1), (x, 0, 0.34))
        return 0.36

    if kind == 'hut':
        h = 0.36 + t * 0.4
        cyl(g, body, 0.3 + t * 0.04, h, (0, 0, 0.16 + h / 2), verts=14)
        box(g, trim, (0.16, 0.04, 0.22), (0, -0.3, 0.28))
        return 0.16 + h

    if kind == 'house':
        h = 0.4 + t * 0.35
        box(g, body, (0.58, 0.48, h), (0, 0, 0.16 + h / 2))
        box(g, trim, (0.14, 0.04, 0.24), (0, -0.25, 0.28))
        if t > 0.4:
            box(g, body, (0.3, 0.3, h * 0.7), (0.3, 0.22, 0.16 + h * 0.35))
        return 0.16 + h

    if kind == 'keep':
        h = 0.5 + t * 0.5
        box(g, body, (0.6, 0.6, h), (0, 0, 0.16 + h / 2))
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl(g, body, 0.13 + t * 0.03, h + 0.12,
                    (sx * 0.3, sy * 0.3, 0.16 + (h + 0.12) / 2), verts=8)
        for i in range(8):
            a = TAU * i / 8
            box(g, trim, (0.12, 0.12, 0.12),
                (0.3 * math.cos(a), 0.3 * math.sin(a), 0.22 + h), (0, 0, a))
        return 0.2 + h

    if kind == 'circle':
        cyl(g, body, 0.42 + t * 0.06, 0.08, (0, 0, 0.2), verts=16)
        cyl(g, trim, 0.3 + t * 0.05, 0.06, (0, 0, 0.25), verts=16)
        for i in range(4 + int(t * 4)):
            a = TAU * i / (4 + int(t * 4))
            box(g, trim, (0.08, 0.08, 0.3 + t * 0.25),
                (0.36 * math.cos(a), 0.36 * math.sin(a), 0.35), (0, 0, a))
        return 0.3

    return 0.3


def build_roof(g, kind, roof, accent, top, t):
    if kind == 'cone':
        cone(g, roof, 0.34 + t * 0.06, 0.0, 0.3 + t * 0.22, (0, 0, top + 0.18 + t * 0.1), verts=16)
        return top + 0.1
    if kind == 'spire':
        cone(g, roof, 0.3 + t * 0.05, 0.0, 0.5 + t * 0.5, (0, 0, top + 0.28 + t * 0.24), verts=14)
        ball(g, accent, 0.06 + t * 0.03, (0, 0, top + 0.56 + t * 0.75))
        return top + 0.06
    if kind == 'dome':
        ball(g, roof, 0.32 + t * 0.05, (0, 0, top), (1, 1, 0.62), seg=12, ring=7)
        return top + 0.14
    if kind == 'gable':
        for sx in (-1, 1):
            box(g, roof, (0.36, 0.56, 0.05), (sx * 0.15, 0, top + 0.12), (0, sx * 0.7, 0))
        return top + 0.06
    if kind == 'brazier':
        cone(g, roof, 0.16, 0.32, 0.16, (0, 0, top + 0.08), verts=10)
        return top + 0.14
    if kind == 'flat':
        return top + 0.04
    return top


def build_figure(g, m, kind, body, accent, top, t):
    """Pieza superior: lo que apunta, gira o brilla."""
    if kind == 'none':
        return

    if kind == 'archer':
        yaw = group(g.name + '__yaw', g, (0, 0, top))
        n = 1 + int(t * 2)
        for i in range(n):
            off = (i - (n - 1) / 2) * 0.17
            a = group('%s__fig%d' % (g.name, i), yaw, (off, 0, 0))
            box(a, m['cloth_blue'], (0.12, 0.1, 0.18), (0, 0, 0.09))
            ball(a, m['skin_pale'], 0.055, (0, 0, 0.21))
            cyl(a, m['wood_dark'], 0.08, 0.018, (0, 0.1, 0.14), (math.pi / 2, 0, 0), verts=10)
            box(a, accent, (0.012, 0.18, 0.012), (0, 0.15, 0.14))
        return

    if kind == 'ballista':
        yaw = group(g.name + '__yaw', g, (0, 0, top))
        box(yaw, m['wood'], (0.14, 0.46, 0.09), (0, 0.02, 0.06))
        box(yaw, m['wood_dark'], (0.52 + t * 0.12, 0.09, 0.05), (0, 0.12, 0.1))
        for sx in (-1, 1):
            box(yaw, m['wood_dark'], (0.2, 0.05, 0.04), (sx * 0.24, 0.16, 0.1), (0, 0, sx * 0.45))
        for i in range(1 + int(t * 2)):
            box(yaw, accent, (0.03, 0.36, 0.03), (i * 0.07 - t * 0.07, 0.18, 0.13))
        return

    if kind == 'catapult':
        yaw = group(g.name + '__yaw', g, (0, 0, top))
        box(yaw, m['wood'], (0.16, 0.6, 0.07), (-0.16, 0, 0.06))
        box(yaw, m['wood'], (0.16, 0.6, 0.07), (0.16, 0, 0.06))
        box(yaw, m['wood_dark'], (0.44, 0.1, 0.06), (0, -0.2, 0.06))
        for sx in (-1, 1):
            box(yaw, m['wood'], (0.05, 0.05, 0.26), (sx * 0.13, -0.02, 0.2), (0, sx * 0.22, 0))
        arm = group(g.name + '__arm', yaw, (0, -0.02, 0.28))
        box(arm, m['wood'], (0.07, 0.44 + t * 0.2, 0.06), (0, 0.2, 0))
        cyl(arm, m['wood_dark'], 0.1, 0.06, (0, 0.4 + t * 0.2, 0.02), (math.pi / 2, 0, 0), verts=8)
        ball(arm, m['dark'], 0.09 + t * 0.03, (0, -0.16, 0))
        return

    if kind == 'orb':
        yaw = group(g.name + '__yaw', g, (0, 0, top + 0.12))
        orb = group(g.name + '__orb', yaw, (0, 0, 0))
        ball(orb, accent, 0.1 + t * 0.05)
        for i in range(3 + int(t * 3)):
            a = TAU * i / (3 + int(t * 3))
            cone(orb, accent, 0.035, 0.0, 0.12 + t * 0.06,
                 (0.2 * math.cos(a), 0.2 * math.sin(a), 0))
        return

    if kind == 'flame':
        yaw = group(g.name + '__yaw', g, (0, 0, top))
        flame = group(g.name + '__flame', yaw, (0, 0, 0.04))
        cone(flame, m['fire'], 0.2 + t * 0.08, 0.0, 0.34 + t * 0.3, (0, 0, 0.18), verts=10)
        cone(flame, m['fire_core'], 0.1 + t * 0.04, 0.0, 0.22 + t * 0.16, (0, 0, 0.14), verts=8)
        return

    if kind == 'cauldron':
        yaw = group(g.name + '__yaw', g, (0, 0, top))
        cyl(yaw, m['iron'], 0.2 + t * 0.05, 0.18, (0, 0, 0.09), verts=10)
        cyl(yaw, accent, 0.17 + t * 0.05, 0.04, (0, 0, 0.19), verts=10)
        for i in range(2 + int(t * 3)):
            ball(yaw, accent, 0.04 + t * 0.02,
                 (0.1 * math.cos(i * 2.2), 0.1 * math.sin(i * 2.2), 0.26 + i * 0.06))
        return

    if kind == 'battery':
        yaw = group(g.name + '__yaw', g, (0, 0, top))
        n = 2 + int(t * 3)
        for i in range(n):
            x = (i - (n - 1) / 2) * 0.2
            box(yaw, m['wood'], (0.1, 0.4, 0.08), (x, 0.04, 0.05))
            box(yaw, accent, (0.03, 0.3, 0.03), (x, 0.16, 0.1))
        return

    if kind == 'banner':
        box(g, m['wood_dark'], (0.05, 0.05, 0.6 + t * 0.5), (0, 0, top + 0.3 + t * 0.25))
        box(g, m['cloth_red'], (0.02, 0.26 + t * 0.1, 0.3 + t * 0.12),
            (0, 0.14 + t * 0.05, top + 0.42 + t * 0.4))
        ball(g, accent, 0.05, (0, 0, top + 0.62 + t * 0.52))
        for i in range(int(t * 4)):
            a = TAU * i / max(1, int(t * 4))
            box(g, m['cloth_red'], (0.02, 0.14, 0.16),
                (0.28 * math.cos(a), 0.28 * math.sin(a), top - 0.1), (0, 0, a))
        return

    if kind == 'runes':
        yaw = group(g.name + '__yaw', g, (0, 0, top))
        for i in range(3 + int(t * 4)):
            a = TAU * i / (3 + int(t * 4))
            box(yaw, accent, (0.07, 0.07, 0.03),
                (0.3 * math.cos(a), 0.3 * math.sin(a), 0.02), (0, 0, a))
        ball(yaw, accent, 0.08 + t * 0.04, (0, 0, 0.12))
        return

    if kind == 'coin':
        yaw = group(g.name + '__yaw', g, (0, 0, top + 0.1))
        for i in range(2 + int(t * 3)):
            cyl(yaw, m['gold'], 0.1 - i * 0.012, 0.03, (0, 0, i * 0.045), verts=12)
        return


def tier_marks(g, m, tier, t):
    """Señales del grado: aros dorados en la base y banderines a partir de la mitad."""
    if tier >= 2:
        cyl(g, m['gold'] if tier >= 5 else m['metal'], 0.3, 0.025, (0, 0, 0.2), verts=12)
    if tier >= 4:
        for sx in (-1, 1):
            box(g, m['wood_dark'], (0.03, 0.03, 0.3), (sx * 0.3, -0.26, 0.32))
            box(g, m['cloth_red'], (0.015, 0.12, 0.14), (sx * 0.3, -0.2, 0.42))
    if tier >= 7:
        for i in range(4):
            a = TAU * i / 4 + 0.4
            ball(g, m['gold'], 0.035, (0.3 * math.cos(a), 0.3 * math.sin(a), 0.24))


# --------------------------------------------------------------------------
# Enemigos
# --------------------------------------------------------------------------

def build_enemies(m):
    with asset('enemy_goblin') as g:
        body, _, _ = humanoid(g, m, 0.85, 'skin_goblin', 'cloth_brown', ears=True)
        weapon_club(body, m, 0.85)

    with asset('enemy_orc') as g:
        body, _, _ = humanoid(g, m, 1.15, 'skin_orc', 'leather', armor='iron', ears=True)
        weapon_axe(body, m, 1.15)

    with asset('enemy_knight') as g:
        body, _, _ = humanoid(g, m, 1.1, 'skin_pale', 'dark',
                              armor='metal', helmet='metal')
        box(body, m['cloth_red'], (0.03, 0.05, 0.12), (0, 0, 0.47))
        weapon_sword(body, m, 1.1)
        shield(body, m, 1.1)

    with asset('enemy_ogre') as g:
        body, _, _ = humanoid(g, m, 1.75, 'skin_ogre', 'cloth_brown')
        ball(body, m['skin_ogre'], 0.22, (0, -0.07, 0.1), (1.15, 0.85, 0.8))
        weapon_club(body, m, 1.75)

    with asset('enemy_warlord') as g:
        body, _, _ = humanoid(g, m, 2.1, 'skin_ogre', 'dark',
                              armor='cloth_red', helmet='iron', horns=True)
        weapon_axe(body, m, 2.1)
        shield(body, m, 2.1, 'dark')
        for sx in (-1, 1):
            cone(body, m['iron'], 0.09, 0.0, 0.2, (sx * 0.32, 0, 0.44), (0, sx * 1.1, 0))

    with asset('enemy_wolf') as g:
        body = group(g.name + '__body', g, (0, 0, 0.24))
        ball(body, m['fur'], 0.17, (0, 0.02, 0), (1.0, 1.7, 0.95))
        ball(body, m['fur'], 0.1, (0, -0.26, 0.06), (1, 1.1, 1))
        cone(body, m['fur_dark'], 0.06, 0.0, 0.14, (0, -0.36, 0.02), (math.pi / 2.1, 0, 0))
        for sx in (-1, 1):
            cone(body, m['fur_dark'], 0.04, 0.0, 0.1, (sx * 0.06, -0.22, 0.14))
            ball(body, m['fire_core'], 0.02, (sx * 0.05, -0.33, 0.07), seg=6, ring=4)
        cone(body, m['fur_dark'], 0.05, 0.0, 0.24, (0, 0.3, 0.08), (-1.1, 0, 0))
        for i, (sx, sy) in enumerate([(-1, 1), (1, 1), (-1, -1), (1, -1)]):
            leg = group('%s__leg%s' % (g.name, 'ABCD'[i]), g,
                        (sx * 0.1, sy * 0.14, 0.2))
            box(leg, m['fur_dark'], (0.06, 0.06, 0.2), (0, 0, -0.1))

    with asset('enemy_necromancer') as g:
        body = group(g.name + '__body', g, (0, 0, 0.0))
        cone(body, m['necro'], 0.22, 0.07, 0.5, (0, 0, 0.25), verts=10)
        ball(body, m['necro'], 0.12, (0, 0, 0.5), (1, 1, 0.9))
        cone(body, m['necro'], 0.14, 0.0, 0.16, (0, 0, 0.58), verts=8)
        for sx in (-1, 1):
            ball(body, m['necro_glow'], 0.022, (sx * 0.045, -0.1, 0.5), seg=6, ring=4)
        box(body, m['wood_dark'], (0.03, 0.03, 0.72), (0.17, 0.02, 0.36))
        ball(body, m['necro_glow'], 0.07, (0.17, 0.02, 0.76))

    with asset('enemy_wyvern') as g:
        body = group(g.name + '__body', g, (0, 0, 0.3))
        ball(body, m['purple'], 0.16, (0, 0, 0), (1, 1.6, 0.85))
        ball(body, m['purple'], 0.1, (0, -0.24, 0.05))
        cone(body, m['purple'], 0.06, 0.0, 0.18, (0, -0.36, 0.02), (math.pi / 2.2, 0, 0))
        cone(body, m['purple'], 0.06, 0.0, 0.34, (0, 0.3, 0.04), (-1.2, 0, 0))
        for sx in (-1, 1):
            ball(body, m['fire_core'], 0.022, (sx * 0.05, -0.3, 0.09), seg=6, ring=4)
            cone(body, m['bone'], 0.02, 0.0, 0.1, (sx * 0.05, -0.19, 0.14), (0, sx * 0.5, 0))
            wing = group('%s__wing%s' % (g.name, 'L' if sx < 0 else 'R'), body,
                         (sx * 0.1, 0, 0.05))
            box(wing, m['purple_light'], (0.42, 0.3, 0.02), (sx * 0.22, 0.0, 0.0),
                (0, 0, sx * 0.25))
            box(wing, m['purple'], (0.44, 0.04, 0.035), (sx * 0.23, -0.1, 0.01),
                (0, 0, sx * 0.25))

    with asset('enemy_bat') as g:
        body = group(g.name + '__body', g, (0, 0, 0.26))
        ball(body, m['purple'], 0.1, (0, 0, 0), (1, 1.3, 0.9))
        ball(body, m['purple'], 0.07, (0, -0.12, 0.04))
        for sx in (-1, 1):
            cone(body, m['purple'], 0.03, 0.0, 0.12, (sx * 0.05, -0.1, 0.12))
            ball(body, m['fire_core'], 0.016, (sx * 0.035, -0.17, 0.05), seg=6, ring=4)
            wing = group('%s__wing%s' % (g.name, 'L' if sx < 0 else 'R'), body, (sx * 0.07, 0, 0.03))
            box(wing, m['purple_light'], (0.3, 0.22, 0.015), (sx * 0.16, 0, 0), (0, 0, sx * 0.2))
            box(wing, m['purple'], (0.32, 0.03, 0.03), (sx * 0.17, -0.08, 0.005), (0, 0, sx * 0.2))

    with asset('enemy_drummer') as g:
        body, _, _ = humanoid(g, m, 1.05, 'skin_orc', 'cloth_red', ears=True)
        cyl(body, m['wood'], 0.16, 0.18, (0, -0.16, 0.14), (math.pi / 2, 0, 0), verts=10)
        cyl(body, m['canvas_tent'], 0.155, 0.02, (0, -0.25, 0.14), (math.pi / 2, 0, 0), verts=10)
        for sx in (-1, 1):
            box(body, m['wood_dark'], (0.02, 0.02, 0.2), (sx * 0.2, -0.12, 0.26), (0.6, 0, 0))

    with asset('enemy_shieldbearer') as g:
        body, _, _ = humanoid(g, m, 1.25, 'skin_orc', 'leather', armor='iron', ears=True)
        box(body, m['metal'], (0.05, 0.34, 0.52), (-0.26, -0.04, 0.24))
        box(body, m['gold'], (0.02, 0.1, 0.36), (-0.29, -0.04, 0.24))
        ball(body, m['gold'], 0.06, (-0.3, -0.04, 0.24))
        weapon_sword(body, m, 1.25)

    with asset('enemy_wolfrider') as g:
        body = group(g.name + '__body', g, (0, 0, 0.26))
        ball(body, m['fur_dark'], 0.18, (0, 0.02, 0), (1.0, 1.7, 0.95))
        ball(body, m['fur_dark'], 0.11, (0, -0.28, 0.06))
        cone(body, m['fur'], 0.06, 0.0, 0.14, (0, -0.38, 0.02), (math.pi / 2.1, 0, 0))
        for sx in (-1, 1):
            cone(body, m['fur'], 0.04, 0.0, 0.1, (sx * 0.06, -0.24, 0.15))
            ball(body, m['fire'], 0.02, (sx * 0.05, -0.35, 0.07), seg=6, ring=4)
        cone(body, m['fur'], 0.05, 0.0, 0.26, (0, 0.32, 0.08), (-1.1, 0, 0))
        # jinete
        box(body, m['cloth_brown'], (0.18, 0.14, 0.2), (0, 0.04, 0.22))
        ball(body, m['skin_goblin'], 0.085, (0, 0.02, 0.38))
        for sx in (-1, 1):
            cone(body, m['skin_goblin'], 0.04, 0.0, 0.13, (sx * 0.09, 0.02, 0.4), (0, sx * 1.2, 0))
        box(body, m['wood_dark'], (0.03, 0.03, 0.3), (0.13, 0.0, 0.36), (0.4, 0, 0))
        for i, (sx, sy) in enumerate([(-1, 1), (1, 1), (-1, -1), (1, -1)]):
            leg = group('%s__leg%s' % (g.name, 'ABCD'[i]), g, (sx * 0.11, sy * 0.15, 0.22))
            box(leg, m['fur_dark'], (0.06, 0.06, 0.22), (0, 0, -0.11))

    def spider(g, scale, body_mat, eye_mat):
        s = scale
        body = group(g.name + '__body', g, (0, 0, 0.16 * s))
        ball(body, body_mat, 0.17 * s, (0, 0.1 * s, 0), (1, 1.25, 0.85))
        ball(body, body_mat, 0.11 * s, (0, -0.16 * s, 0.02 * s))
        for sx in (-1, 1):
            ball(body, eye_mat, 0.022 * s, (sx * 0.045 * s, -0.24 * s, 0.05 * s), seg=6, ring=4)
            ball(body, eye_mat, 0.014 * s, (sx * 0.085 * s, -0.2 * s, 0.06 * s), seg=6, ring=4)
        for i in range(8):
            side = -1 if i < 4 else 1
            k = i % 4
            name = 'ABCD'[k] if i < 4 else None
            parent = group('%s__leg%s' % (g.name, name), g, (side * 0.12 * s, (0.14 - k * 0.1) * s, 0.16 * s)) if name else body
            a = side * (0.5 + k * 0.12)
            box(parent, body_mat, (0.035 * s, 0.035 * s, 0.3 * s),
                (side * 0.1 * s, 0, -0.04 * s) if name else (side * 0.22 * s, (0.14 - k * 0.1) * s, -0.02 * s),
                (0, side * 0.9, a * 0.2))
        return body

    with asset('enemy_spider') as g:
        spider(g, 1.0, m['necro'], m['fire_core'])

    with asset('enemy_spiderling') as g:
        spider(g, 0.6, m['purple'], m['fire_core'])

    with asset('enemy_wraith') as g:
        body = group(g.name + '__body', g, (0, 0, 0.1))
        cone(body, m['storm'], 0.24, 0.05, 0.6, (0, 0, 0.3), verts=10)
        ball(body, m['storm'], 0.13, (0, 0, 0.58), (1, 1, 0.85))
        cone(body, m['storm'], 0.15, 0.0, 0.18, (0, 0, 0.66), verts=8)
        for sx in (-1, 1):
            ball(body, m['storm_glow'], 0.028, (sx * 0.05, -0.11, 0.58), seg=6, ring=4)
            box(body, m['storm_glow'], (0.03, 0.03, 0.26), (sx * 0.22, -0.02, 0.34), (0, sx * 0.4, 0))
        ball(body, m['storm_glow'], 0.06, (0, -0.06, 0.2), (1.6, 1, 1.6))

    with asset('enemy_flameborn') as g:
        body = group(g.name + '__body', g, (0, 0, 0.12))
        cone(body, m['fire'], 0.24, 0.08, 0.56, (0, 0, 0.28), verts=9)
        cone(body, m['fire_core'], 0.14, 0.0, 0.36, (0, 0, 0.24), verts=8)
        ball(body, m['fire_core'], 0.12, (0, 0, 0.58))
        for i in range(5):
            a = TAU * i / 5
            cone(body, m['fire'], 0.05, 0.0, 0.22,
                 (0.13 * math.cos(a), 0.13 * math.sin(a), 0.74))
        for sx in (-1, 1):
            cone(body, m['fire'], 0.07, 0.0, 0.3, (sx * 0.24, 0, 0.34), (0, sx * 0.5, 0))

    with asset('enemy_golem') as g:
        body = group(g.name + '__body', g, (0, 0, 0.3))
        box(body, m['crag'], (0.44, 0.34, 0.42), (0, 0, 0.12))
        box(body, m['crag_dark'], (0.5, 0.38, 0.12), (0, 0, 0.3))
        ball(body, m['crag'], 0.14, (0, -0.02, 0.46), (1.1, 1, 0.9))
        for sx in (-1, 1):
            ball(body, m['fire_core'], 0.028, (sx * 0.06, -0.12, 0.47), seg=6, ring=4)
            box(body, m['crag'], (0.16, 0.16, 0.34), (sx * 0.3, 0, 0.14), (0, sx * 0.18, 0))
            ball(body, m['crag_dark'], 0.11, (sx * 0.33, 0, -0.02))
            rock_shape(body, m['moss'], 0.06, (sx * 0.16, -0.16, 0.3), (1.4, 1.2, 0.4))
        for i, sx in enumerate((-1, 1)):
            leg = group('%s__leg%s' % (g.name, 'LR'[i]), g, (sx * 0.13, 0, 0.3))
            box(leg, m['crag'], (0.2, 0.2, 0.32), (0, 0, -0.16))

    with asset('enemy_bonetitan') as g:
        body, _, _ = humanoid(g, m, 2.4, 'bone', 'dark', horns=True)
        for i in range(4):
            box(body, m['bone'], (0.5, 0.06, 0.08), (0, -0.06, 0.18 + i * 0.13))
        box(body, m['bone'], (0.08, 0.08, 0.6), (0, 0, 0.3))
        for sx in (-1, 1):
            cone(body, m['bone'], 0.1, 0.0, 0.42, (sx * 0.42, 0, 0.5), (0, sx * 0.4, 0))
        ball(body, m['necro_glow'], 0.05, (0, -0.12, 0.78), seg=8, ring=5)

    with asset('enemy_hordequeen') as g:
        body, _, _ = humanoid(g, m, 2.0, 'skin_pale', 'purple', armor='necro')
        cone(body, m['gold'], 0.16, 0.2, 0.14, (0, 0, 0.78), verts=8)
        for i in range(5):
            a = TAU * i / 5
            cone(body, m['gold'], 0.03, 0.0, 0.12,
                 (0.17 * math.cos(a), 0.17 * math.sin(a), 0.86))
        box(body, m['purple'], (0.04, 0.46, 0.66), (0, 0.2, 0.3))
        for i, (x, y, z) in enumerate([(0.22, 0.26, 0.12), (-0.24, 0.24, 0.16), (0.05, 0.3, 0.3)]):
            ball(body, m['venom_glow'], 0.07, (x, y, z))
        box(body, m['wood_dark'], (0.035, 0.035, 0.9), (0.3, 0.04, 0.42))
        ball(body, m['venom_glow'], 0.09, (0.3, 0.04, 0.92))

    with asset('enemy_dragon') as g:
        body = group(g.name + '__body', g, (0, 0, 0.42))
        ball(body, m['dragon'], 0.3, (0, 0, 0), (1, 1.7, 0.9))
        ball(body, m['dragon'], 0.18, (0, -0.44, 0.08))
        cone(body, m['dragon'], 0.1, 0.0, 0.3, (0, -0.66, 0.02), (math.pi / 2.2, 0, 0))
        ball(body, m['fire_core'], 0.07, (0, -0.6, 0.02))
        cone(body, m['dragon'], 0.1, 0.0, 0.6, (0, 0.56, 0.06), (-1.2, 0, 0))
        for sx in (-1, 1):
            cone(body, m['bone'], 0.035, 0.0, 0.22, (sx * 0.09, -0.34, 0.24), (0, sx * 0.6, 0))
            ball(body, m['fire'], 0.035, (sx * 0.09, -0.55, 0.14), seg=6, ring=4)
            wing = group('%s__wing%s' % (g.name, 'L' if sx < 0 else 'R'), body,
                         (sx * 0.18, 0, 0.1))
            box(wing, m['dragon_wing'], (0.78, 0.52, 0.025), (sx * 0.4, 0.0, 0),
                (0, 0, sx * 0.22))
            box(wing, m['dragon'], (0.8, 0.06, 0.05), (sx * 0.41, -0.18, 0.01),
                (0, 0, sx * 0.22))
        for i in range(4):
            cone(body, m['bone'], 0.03, 0.0, 0.12, (0, 0.1 + i * 0.14, 0.24))


# --------------------------------------------------------------------------
# Decorados, castillo y proyectiles
# --------------------------------------------------------------------------

def build_props(m):
    with asset('prop_pine') as g:
        cyl(g, m['trunk'], 0.05, 0.3, (0, 0, 0.15), verts=6)
        for i in range(3):
            cone(g, m['leaf'] if i % 2 == 0 else m['leaf_dark'],
                 0.3 - i * 0.07, 0.0, 0.4, (0, 0, 0.4 + i * 0.24), verts=9)

    with asset('prop_oak') as g:
        cyl(g, m['trunk'], 0.06, 0.36, (0, 0, 0.18), verts=6)
        ball(g, m['leaf'], 0.26, (0, 0, 0.56), (1.1, 1.1, 0.9))
        ball(g, m['leaf_dark'], 0.17, (0.16, 0.08, 0.44))
        ball(g, m['leaf'], 0.15, (-0.15, -0.1, 0.48))

    with asset('prop_rock') as g:
        rock_shape(g, m['rock'], 0.27, (0, 0, 0.2), (1.1, 0.95, 1.05))
        rock_shape(g, m['rock'], 0.17, (0.22, 0.14, 0.12), (0.95, 1.1, 1.0))
        rock_shape(g, m['crag'], 0.13, (-0.2, -0.1, 0.1), (1.0, 1.0, 1.2))
        ball(g, m['moss'], 0.08, (0.02, -0.1, 0.33), (1.5, 1.1, 0.35))

    # Portón por el que entra la horda.
    with asset('prop_gate') as g:
        for sx in (-1, 1):
            box(g, m['stone_dark'], (0.34, 0.5, 1.1), (sx * 0.5, 0, 0.55))
            box(g, m['stone'], (0.38, 0.54, 0.12), (sx * 0.5, 0, 1.04))
        box(g, m['stone_dark'], (1.4, 0.44, 0.28), (0, 0, 1.24))
        box(g, m['black'], (0.66, 0.3, 1.0), (0, 0.12, 0.5))
        for sx in (-1, 1):
            cyl(g, m['wood_dark'], 0.04, 0.22, (sx * 0.5, -0.26, 0.86), (1.2, 0, 0), verts=6)
            ball(g, m['fire'], 0.09, (sx * 0.5, -0.32, 0.98))
            ball(g, m['fire_core'], 0.05, (sx * 0.5, -0.32, 1.02))
            # estacas con calaveras y vigas apuntaladas
            box(g, m['wood_dark'], (0.07, 0.07, 0.9), (sx * 0.86, -0.12, 0.45), (0.1, sx * 0.12, 0))
            ball(g, m['bone'], 0.09, (sx * 0.86, -0.12, 0.96), (1, 0.85, 1))
            box(g, m['wood_dark'], (0.06, 0.5, 0.06), (sx * 0.68, -0.3, 0.62), (0.9, 0, 0))
        box(g, m['cloth_red'], (0.9, 0.02, 0.3), (0, -0.24, 1.16))
        box(g, m['dark'], (1.5, 0.1, 0.1), (0, -0.2, 1.36))

    # Fortaleza: dos cubos de muralla, torreones y portón.
    with asset('prop_castle') as g:
        box(g, m['stone'], (1.9, 4.6, 1.5), (0.55, 0, 0.75))
        box(g, m['stone_dark'], (1.94, 4.64, 0.1), (0.55, 0, 1.5))
        for i in range(11):
            box(g, m['stone'], (0.2, 0.2, 0.24), (-0.36, -2.1 + i * 0.42, 1.62))
        for sy in (-1.6, 1.6):
            cyl(g, m['stone'], 0.52, 2.1, (-0.15, sy, 1.05), verts=12)
            crenellations(g, m['stone_dark'], 0.5, 2.18, 10, 0.14)
            cone(g, m['roof_red'], 0.66, 0.0, 0.7, (-0.15, sy, 2.6), verts=12)
        # portón
        box(g, m['black'], (0.2, 0.66, 0.86), (-0.4, 0, 0.43))
        box(g, m['wood_dark'], (0.12, 0.6, 0.8), (-0.32, 0, 0.4))
        for i in range(4):
            box(g, m['iron'], (0.14, 0.05, 0.8), (-0.3, -0.24 + i * 0.16, 0.4))
        # torre del homenaje al fondo
        cyl(g, m['stone'], 0.78, 3.1, (1.5, 0, 1.55), verts=14)
        crenellations(g, m['stone_dark'], 0.76, 3.16, 12, 0.18)
        cone(g, m['roof_red'], 0.96, 0.0, 1.05, (1.5, 0, 3.55), verts=14)
        for i in range(3):
            box(g, m['black'], (0.06, 0.16, 0.3), (0.74, -0.1 + i * 0.1, 1.4 + i * 0.6))
        # casa de guardia flanqueando el portón
        for sy in (-0.62, 0.62):
            box(g, m['stone'], (0.5, 0.44, 1.25), (-0.36, sy, 0.62))
            for i in range(2):
                box(g, m['stone_dark'], (0.16, 0.16, 0.2), (-0.36, sy - 0.12 + i * 0.24, 1.32))
            cyl(g, m['wood_dark'], 0.03, 0.18, (-0.62, sy, 0.95), (1.2, 0, 0), verts=6)
            ball(g, m['fire'], 0.08, (-0.62, sy - 0.06, 1.02))
        # escalones hacia el portón
        for i in range(3):
            box(g, m['stone_dark'], (0.16, 0.8, 0.08), (-0.62 - i * 0.16, 0, 0.04 + (2 - i) * 0.06))
        # estandartes
        box(g, m['wood_dark'], (0.05, 0.05, 1.2), (-0.1, 0, 2.1))
        box(g, m['cloth_red'], (0.02, 0.5, 0.44), (-0.1, 0.26, 2.4))
        ball(g, m['gold'], 0.09, (-0.08, 0.26, 2.4), (0.3, 1, 1))
        for sy in (-1.6, 1.6):
            box(g, m['wood_dark'], (0.04, 0.04, 0.8), (-0.15, sy, 3.3))
            box(g, m['cloth_red'], (0.02, 0.34, 0.3), (-0.15, sy + 0.18, 3.5))

    with asset('proj_arrow') as g:
        box(g, m['wood'], (0.02, 0.26, 0.02))
        cone(g, m['metal'], 0.035, 0.0, 0.1, (0, 0.16, 0), (-math.pi / 2, 0, 0))
        box(g, m['bone'], (0.001, 0.06, 0.05), (0, -0.12, 0))

    with asset('proj_bolt') as g:
        box(g, m['wood_dark'], (0.045, 0.34, 0.045))
        cone(g, m['metal'], 0.06, 0.0, 0.14, (0, 0.22, 0), (-math.pi / 2, 0, 0))

    with asset('proj_rock') as g:
        rock_shape(g, m['rock'], 0.14)

    with asset('proj_orb') as g:
        ball(g, m['ice'], 0.11)


def build_environment(m):
    """Relieve de fondo: lo que rodea al tablero para que no flote en el vacío."""
    with asset('env_mountain') as g:
        cone(g, m['crag'], 3.4, 0.35, 5.2, (0, 0, 2.6), verts=7)
        cone(g, m['crag_dark'], 2.2, 0.2, 3.4, (1.9, 1.4, 1.7), verts=6)
        cone(g, m['snow'], 0.95, 0.1, 1.25, (0, 0, 4.75), verts=7)
        cone(g, m['snow'], 0.6, 0.08, 0.7, (1.9, 1.4, 3.1), verts=6)

    with asset('env_hill') as g:
        ball(g, m['grass_far'], 1.8, (0, 0, 0.1), (1.0, 1.25, 0.52), seg=12, ring=7)
        ball(g, m['grass_dark'], 1.1, (1.5, -0.9, 0.0), (1.1, 1.0, 0.44), seg=10, ring=6)

    with asset('env_forest') as g:
        ball(g, m['grass_dark'], 1.5, (0, 0, -0.55), (1.0, 1.1, 0.45), seg=10, ring=6)
        spots = [(-0.9, -0.5), (0.2, -1.0), (1.0, 0.1), (-0.3, 0.8), (0.7, 1.1), (-1.2, 0.6), (0.0, 0.1)]
        for i, (x, y) in enumerate(spots):
            h = 0.9 + (i % 3) * 0.32
            cyl(g, m['trunk'], 0.07, 0.3, (x, y, 0.15), verts=5)
            cone(g, m['leaf'] if i % 2 else m['leaf_dark'], 0.42, 0.0, h, (x, y, 0.35 + h / 2), verts=7)
            cone(g, m['leaf_dark'] if i % 2 else m['leaf'], 0.3, 0.0, h * 0.7,
                 (x, y, 0.55 + h * 0.75), verts=7)

    with asset('env_cloud') as g:
        ball(g, m['cloud'], 1.0, (0, 0, 0), (1.5, 1.0, 0.42), seg=12, ring=7)
        ball(g, m['cloud'], 0.72, (1.3, 0.25, -0.06), (1.3, 1.0, 0.46), seg=10, ring=6)
        ball(g, m['cloud'], 0.6, (-1.25, -0.2, -0.08), (1.2, 1.0, 0.44), seg=10, ring=6)

    with asset('env_ruin') as g:
        cyl(g, m['stone_dark'], 0.72, 1.5, (0, 0, 0.75), verts=10)
        # coronación rota
        for i in range(7):
            a = TAU * i / 9
            box(g, m['stone_dark'], (0.24, 0.24, 0.3 + (i % 3) * 0.16),
                (0.62 * math.cos(a), 0.62 * math.sin(a), 1.55), (0, 0, a))
        box(g, m['black'], (0.3, 0.2, 0.6), (-0.6, 0, 0.4))
        rock_shape(g, m['rock'], 0.4, (1.3, 0.5, 0.15), (1.2, 1.0, 0.6))
        rock_shape(g, m['rock'], 0.28, (-1.1, -0.7, 0.1), (1.0, 1.2, 0.7))

    with asset('env_windmill') as g:
        cone(g, m['stone_warm'], 0.62, 0.44, 1.9, (0, 0, 0.95), verts=10)
        cone(g, m['roof_red'], 0.66, 0.0, 0.6, (0, 0, 2.2), verts=10)
        box(g, m['wood_dark'], (0.12, 0.2, 0.5), (0, -0.5, 0.4))
        blades = group(g.name + '__blades', g, (0, -0.6, 1.75))
        for i in range(4):
            a = TAU * i / 4
            box(blades, m['wood'], (0.1, 0.1, 1.5), (0, 0, 0), (a, 0, 0))
            box(blades, m['canvas_tent'], (0.06, 0.28, 1.0),
                (0, math.sin(a) * 0.5, math.cos(a) * 0.5), (a, 0, 0))

    with asset('env_camp') as g:
        for i, (x, y, r) in enumerate([(0, 0, 0), (1.6, 0.7, 0.6), (-1.5, 0.5, 1.1)]):
            cone(g, m['canvas_tent'], 0.72, 0.0, 0.9, (x, y, 0.45), (0, 0, r), verts=7)
            box(g, m['wood_dark'], (0.06, 0.06, 1.0), (x, y, 0.5))
        for i in range(6):
            a = TAU * i / 6
            box(g, m['wood_dark'], (0.08, 0.5, 0.08),
                (0.9 * math.cos(a), 0.9 * math.sin(a) - 1.6, 0.06), (0, 0, a))
        ball(g, m['fire'], 0.22, (0, -1.6, 0.16), (1, 1, 0.7))
        ball(g, m['fire_core'], 0.12, (0, -1.6, 0.26))


# --------------------------------------------------------------------------
# Escena
# --------------------------------------------------------------------------

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def optimize_meshes():
    """Aplica transformaciones y funde las mallas que comparten padre y material.

    Reduce de ~450 objetos a poco más de un centenar: menos nodos en el glTF y
    muchas menos llamadas de dibujo en el móvil.
    """
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    _bevel_prefixes = ('b_', 'enemy_', 'proj_', 'prop_castle', 'prop_gate')

    for parent in [o for o in bpy.data.objects if o.type == 'EMPTY']:
        buckets = {}
        for o in parent.children:
            if o.type != 'MESH':
                continue
            key = o.data.materials[0].name if o.data.materials else ''
            buckets.setdefault(key, []).append(o)
        for objs in buckets.values():
            if len(objs) < 2:
                continue
            bpy.ops.object.select_all(action='DESELECT')
            for o in objs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]
            bpy.ops.object.join()
    bpy.ops.object.select_all(action='DESELECT')

    # Bisel fino y normales suaves por ángulo: las aristas recogen luz y las
    # superficies curvas dejan de verse facetadas. Solo en lo que se mira de
    # cerca; el paisaje de fondo se queda plano y barato.
    for o in [x for x in bpy.data.objects if x.type == 'MESH']:
        root = o
        while root.parent:
            root = root.parent
        if not root.name.startswith(_bevel_prefixes):
            continue
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new('bisel', 'BEVEL')
        mod.width = 0.012
        mod.segments = 1
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(35)
        mod.miter_outer = 'MITER_ARC'
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except RuntimeError:
            o.modifiers.remove(mod)
        o.data.use_auto_smooth = True
        o.data.auto_smooth_angle = math.radians(38)
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.ops.object.shade_smooth()
        bpy.ops.object.select_all(action='DESELECT')


def render_preview(path):
    """Hoja de contactos de todos los assets, para revisar el modelado."""
    from mathutils import Vector
    scene = bpy.context.scene
    center = Vector((22.0, -21.0, 1.0))
    eye = center + Vector((14.0, -30.0, 26.0))
    bpy.ops.object.camera_add(location=eye)
    cam = bpy.context.object
    cam.rotation_euler = (center - eye).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 56.0

    bpy.ops.object.light_add(type='SUN', location=(6, -8, 12))
    sun = bpy.context.object
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(48), 0, math.radians(35))
    bpy.ops.object.light_add(type='AREA', location=(-6, -10, 8))
    fill = bpy.context.object
    fill.data.energy = 300
    fill.data.size = 12

    bpy.ops.mesh.primitive_plane_add(size=220, location=(22, -21, -0.01))
    bpy.context.object.data.materials.append(mat('preview_floor', '#41602c', 1.0))

    world = bpy.data.worlds['World'] if 'World' in bpy.data.worlds else bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.06, 0.07, 1)

    # Cycles en CPU: el contenedor no tiene GPU ni EGL para EEVEE.
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 40
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def render_icon(path):
    """Icono de lanzador: la torre del homenaje con su estandarte."""
    from mathutils import Vector
    scene = bpy.context.scene

    castle = None
    for g in ASSETS:
        if g.name == 'prop_castle':
            castle = g
    castle.location = (0, 0, 0)

    # Fuera el resto de assets: en el icono solo sale la fortaleza.
    keep = set()

    def mark(o):
        keep.add(o.name)
        for c in o.children:
            mark(c)

    mark(castle)
    for o in list(bpy.data.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o, do_unlink=True)

    center = Vector((0.7, 0, 1.5))
    eye = center + Vector((-7.4, -8.6, 5.2))
    bpy.ops.object.camera_add(location=eye)
    cam = bpy.context.object
    cam.rotation_euler = (center - eye).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 52
    scene.camera = cam

    bpy.ops.object.light_add(type='SUN', location=(-4, -6, 9))
    sun = bpy.context.object
    sun.data.energy = 5.0
    sun.data.angle = 0.2
    sun.rotation_euler = (math.radians(52), 0, math.radians(-35))
    bpy.ops.object.light_add(type='AREA', location=(4, -4, 4))
    fill = bpy.context.object
    fill.data.energy = 600
    fill.data.size = 8

    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    bpy.context.object.data.materials.append(mat('icon_floor', '#3f5c2b', 1.0))

    world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.12, 0.16, 0.22, 1)

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def layout_assets():
    """Reparte los assets en una rejilla para poder abrirlos en Blender."""
    per_row = 12
    for i, g in enumerate(ASSETS):
        g.location = ((i % per_row) * 4.0, -(i // per_row) * 4.2, 0)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = 'assets/models/rocanegra.glb'
    if '--out' in argv:
        out = argv[argv.index('--out') + 1]
    out = os.path.abspath(out)

    clear_scene()
    m = M()

    specs_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'buildings.json')
    with open(specs_path, 'r', encoding='utf-8') as fh:
        specs = json.load(fh)
    build_catalog(m, specs)
    build_enemies(m)
    build_props(m)
    build_environment(m)
    optimize_meshes()
    layout_assets()

    bpy.ops.object.select_all(action='DESELECT')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_texcoords=False,
        use_selection=False,
    )

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    tris = sum(len(o.data.loop_triangles) if o.data.loop_triangles else
               sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    print('ASSETS=%d MESHES=%d TRIS~%d OUT=%s SIZE=%d' %
          (len(ASSETS), len(meshes), tris, out, os.path.getsize(out)))

    if '--preview' in argv:
        render_preview(os.path.abspath(argv[argv.index('--preview') + 1]))
    if '--icon' in argv:
        render_icon(os.path.abspath(argv[argv.index('--icon') + 1]))


main()
