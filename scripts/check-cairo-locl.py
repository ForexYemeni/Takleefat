#!/usr/bin/env python3
"""فحص خط Cairo: هل يحوي GSUB locl يستبدل الأرقام اللاتينية 0-9 بأرقام هندية-عربية ٠-٩؟"""
from fontTools.ttLib import TTFont
import glob, sys

for path in sorted(glob.glob('/home/z/my-project/node_modules/@fontsource-variable/cairo/files/cairo-*-wght-normal.woff2')):
    name = path.split('/')[-1]
    try:
        f = TTFont(path)
    except Exception as e:
        print(f"{name}: تعذر الفتح ({e})")
        continue
    if 'GSUB' not in f:
        print(f"{name}: لا يوجد GSUB")
        continue
    gsub = f['GSUB'].table
    feats = {}
    for i, fr in enumerate(getattr(gsub.FeatureList, 'FeatureRecord', [])):
        feats.setdefault(fr.FeatureTag, []).append(i)
    print(f"\n=== {name} ===")
    print("ميزات GSUB:", sorted(feats.keys()))
    if 'locl' not in feats:
        print("→ لا توجد ميزة locl")
        continue
    lookup_indices = []
    for i in feats['locl']:
        lookup_indices.extend(gsub.FeatureList.FeatureRecord[i].Feature.LookupListIndex)
    cmap = f.getBestCmap()
    # أرقام لاتينية 0-9 وأرقام هندية-عربية ٠-٩
    latin_glyphs = {str(d): cmap.get(0x30 + d) for d in range(10)}
    arabic_digits = {str(d): cmap.get(0x660 + d) for d in range(10)}
    print("رموز الأرقام اللاتينية:", latin_glyphs)
    print("رموز الأرقام الهندية:", {k: v for k, v in arabic_digits.items() if v})
    for li in lookup_indices:
        lookup = gsub.LookupList.Lookup[li]
        for st in lookup.SubTable:
            st_type = lookup.LookupType
            if st_type == 7:  # Extension
                st_type = st.ExtSubTable.LookupType
                st = st.ExtSubTable
            if st_type == 1:  # Single substitution
                for inp, out in getattr(st.mapping, 'items', lambda: [])():
                    # هل المدخل رقم لاتيني والمخرج رقم هندي؟
                    for d, g in latin_glyphs.items():
                        if g and inp == g:
                            print(f"  locl يستبدل '{d}' ({g}) → '{out}'")
