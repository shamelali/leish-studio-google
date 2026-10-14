#!/usr/bin/env python3
"""
Palette converter: converts current theme colors to a target palette.
Uses placeholder-based swapping for explicit mappings, then retints
remaining warm colors to match the target hue family.
"""
import os
import re
import colorsys
import sys

def retint(hex_color, target_hue, sat_min=0.05, sat_max=0.40):
    """Re-tint a color to target hue, preserving lightness."""
    try:
        r = int(hex_color[1:3], 16) / 255
        g = int(hex_color[3:5], 16) / 255
        b = int(hex_color[5:7], 16) / 255
    except ValueError:
        return hex_color
    
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    new_h = target_hue / 360.0
    
    # Scale saturation: dark = more saturated, light = less
    if l < 0.15:
        new_s = sat_max
    elif l > 0.85:
        new_s = sat_min
    else:
        new_s = sat_max - (sat_max - sat_min) * ((l - 0.15) / 0.70)
    
    r2, g2, b2 = colorsys.hls_to_rgb(new_h, l, new_s)
    return f'#{int(r2*255):02X}{int(g2*255):02X}{int(b2*255):02X}'


# Colors to NEVER change (brand/error/Google)
SKIP_COLORS = {
    '#34A853', '#4285F4', '#EA4335', '#FBBC05',  # Google
    '#751311', '#7F1513', '#831614', '#8E1917', '#B12220', '#B52220',  # error reds
    '#10B981',  # emerald success
}

FILES = [
    'src/App.tsx', 'src/main.tsx', 'src/types.ts',
    'src/components/Navbar.tsx', 'src/components/BookingModal.tsx',
    'src/components/AuthModal.tsx', 'src/components/InteractiveMap.tsx',
    'src/components/SalonCard.tsx', 'src/components/MUACard.tsx',
    'src/components/SalonDetails.tsx', 'src/components/AIStylist.tsx',
    'src/components/LookbookStudio.tsx', 'src/components/ClientPortal.tsx',
    'src/components/ProviderDashboard.tsx', 'src/components/ProfileModal.tsx',
    'src/components/WorkspaceHub.tsx', 'src/components/GeminiChatbot.tsx',
    'src/components/ImageStudio.tsx', 'src/components/VeoVideoStudio.tsx',
    'src/components/LoadingSpinner.tsx', 'src/components/ErrorBoundary.tsx',
    'src/lib/store.ts', 'src/lib/api.ts', 'src/lib/forms.ts',
    'src/lib/useAuth.ts', 'server.ts', 'server/data-store.ts',
]


def convert(explicit_map, target_hue, sat_min, sat_max, label):
    """Run the conversion for all files."""
    print(f"\n=== Converting to {label} ===")
    skip_upper = {c.upper() for c in SKIP_COLORS}
    
    for filepath in FILES:
        if not os.path.exists(filepath):
            continue
        with open(filepath, 'r') as f:
            content = f.read()
        original = content
        
        # Phase 1: explicit mappings → placeholders
        placeholders = {}
        for i, (old, new) in enumerate(explicit_map.items()):
            ph = f'@@X{i:04d}@@'
            placeholders[ph] = new
            content = content.replace(old, ph)
        
        # Phase 2: skip colors → placeholders
        for i, color in enumerate(SKIP_COLORS):
            ph = f'@@S{i:04d}@@'
            placeholders[ph] = color
            content = content.replace(color, ph)
            content = content.replace(color.lower(), ph)
        
        # Phase 3: retint remaining hex colors
        def retint_match(m):
            hex_code = m.group(0)
            if hex_code.upper() in skip_upper:
                return hex_code
            try:
                return retint(hex_code, target_hue, sat_min, sat_max)
            except Exception:
                return hex_code
        
        content = re.sub(r'#[0-9A-Fa-f]{6}', retint_match, content)
        
        # Phase 4: placeholders → target values
        for ph, val in placeholders.items():
            content = content.replace(ph, val)
        
        if content != original:
            with open(filepath, 'w') as f:
                f.write(content)
            print(f'  Updated {filepath}')
    
    # Verify no placeholders remain
    for filepath in FILES:
        if os.path.exists(filepath):
            with open(filepath, 'r') as f:
                if '@@' in f.read():
                    print(f'  WARNING: placeholder remains in {filepath}!')
    
    print(f'  {label} conversion complete!')


# ============================================================
# PALETTE 1: NOIR PLUM
# bg=#0E0B12, surface=#211428, accent=#6A2C6B, text=#F2D7F7, subtle=#A89BB0
# ============================================================
NOIR_PLUM = {
    # Backgrounds
    '#1A150F': '#0E0B12',
    '#261F17': '#211428',
    '#332B20': '#211428',
    
    # Brand golds → plum accent
    '#C9A961': '#6A2C6B',
    '#DFCC84': '#8B4A8C',
    '#B08F45': '#552256',
    '#8F7234': '#4A1D4B',
    '#6E5726': '#3A1540',
    '#4E3D1A': '#2A0E30',
    '#EADCA8': '#D4B0DB',
    
    # Text
    '#FDFCF9': '#F2D7F7',
    '#EFE9DE': '#D4C5DD',
    '#DFD5C5': '#A89BB0',
    '#C4B8A4': '#A89BB0',
    '#A3947D': '#8B7D95',
    '#7D6F5A': '#6B5F75',
    
    # Borders
    '#3B3226': '#211428',
    '#5A4F3E': '#3D2545',
    
    # Accents
    '#F3E9CC': '#F2D7F7',
    '#F5E6DE': '#E8C5EE',
    '#FAF5E6': '#E8D5ED',
    '#FDFBF5': '#F2D7F7',
}

# ============================================================
# PALETTE 2: CAVIAR & CREAM
# bg=#0F0F10, surface=#2A2A2D, accent=#A88F5A, text=#F4F1EB, subtle=#C9C2B8
# ============================================================
CAVIAR_CREAM = {
    # Backgrounds
    '#1A150F': '#0F0F10',
    '#261F17': '#2A2A2D',
    '#332B20': '#2A2A2D',
    
    # Brand golds → caviar gold
    '#C9A961': '#A88F5A',
    '#DFCC84': '#C4A96A',
    '#B08F45': '#8F7749',
    '#8F7234': '#74603C',
    '#6E5726': '#5A4A30',
    '#4E3D1A': '#403824',
    '#EADCA8': '#D4C9A0',
    
    # Text
    '#FDFCF9': '#F4F1EB',
    '#EFE9DE': '#E0DCD5',
    '#DFD5C5': '#C9C2B8',
    '#C4B8A4': '#C9C2B8',
    '#A3947D': '#A39D94',
    '#7D6F5A': '#7D776F',
    
    # Borders
    '#3B3226': '#2A2A2D',
    '#5A4F3E': '#3D3D42',
    
    # Accents
    '#F3E9CC': '#F4F1EB',
    '#F5E6DE': '#EDE8E0',
    '#FAF5E6': '#EDE8E0',
    '#FDFBF5': '#F4F1EB',
}

# ============================================================
# PALETTE 3: CATHEDRAL VELVET
# bg=#0B0B0F, surface=#2A2438, accent=#5A1F2B, text=#E7E1D6, subtle=#A28B6E
# ============================================================
CATHEDRAL_VELVET = {
    # Backgrounds
    '#1A150F': '#0B0B0F',
    '#261F17': '#2A2438',
    '#332B20': '#2A2438',
    
    # Brand golds → burgundy accent
    '#C9A961': '#5A1F2B',
    '#DFCC84': '#7A3040',
    '#B08F45': '#4A1823',
    '#8F7234': '#3D141E',
    '#6E5726': '#30101A',
    '#4E3D1A': '#230C14',
    '#EADCA8': '#C9A0A8',
    
    # Text
    '#FDFCF9': '#E7E1D6',
    '#EFE9DE': '#D4CDC0',
    '#DFD5C5': '#A28B6E',
    '#C4B8A4': '#A28B6E',
    '#A3947D': '#8F7A60',
    '#7D6F5A': '#7A6750',
    
    # Borders
    '#3B3226': '#2A2438',
    '#5A4F3E': '#3D3550',
    
    # Accents
    '#F3E9CC': '#E7E1D6',
    '#F5E6DE': '#D4C0C5',
    '#FAF5E6': '#D4CDC0',
    '#FDFBF5': '#E7E1D6',
}


if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'noir-plum'
    
    if target == 'noir-plum':
        convert(NOIR_PLUM, target_hue=285, sat_min=0.08, sat_max=0.35, label='Noir Plum')
    elif target == 'caviar':
        convert(CAVIAR_CREAM, target_hue=40, sat_min=0.02, sat_max=0.12, label='Caviar & Cream')
    elif target == 'cathedral':
        convert(CATHEDRAL_VELVET, target_hue=350, sat_min=0.08, sat_max=0.30, label='Cathedral Velvet')
    else:
        print(f'Unknown target: {target}')
        sys.exit(1)
