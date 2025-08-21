/**
 * Palette Name Generator
 * Comprehensive color-aware naming system for rippl5
 * Combines original extensive vocabulary with enhanced color-specific terms
 * Created by Cristian Bogdan Rosu - bogdanrosu.net/rippl5
 */

// Enhanced color analysis function
function analyzeColorsPalette(colors) {
    const analysis = {
        lightness: 0,
        saturation: 0,
        hue: 0,
        temperature: 0,
        colorCounts: {
            red: 0, orange: 0, yellow: 0, green: 0,
            blue: 0, purple: 0, gray: 0, brown: 0
        },
        dominantColors: [],
        mood: 'neutral',
        texture: 'smooth',
        isWarm: false,
        isCool: false
    };

    let totalLightness = 0;
    let totalSaturation = 0;
    let totalHue = 0;
    let redTotal = 0, greenTotal = 0, blueTotal = 0;

    colors.forEach(color => {
        const rgb = hexToRgbObject(color);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        
        totalLightness += hsl.l;
        totalSaturation += hsl.s;
        totalHue += hsl.h;
        
        redTotal += rgb.r;
        greenTotal += rgb.g;
        blueTotal += rgb.b;

        // Classify color into categories
        classifyColor(hsl, analysis.colorCounts);
    });

    analysis.lightness = totalLightness / colors.length;
    analysis.saturation = totalSaturation / colors.length;
    analysis.hue = totalHue / colors.length;
    
    // Determine temperature
    analysis.temperature = (redTotal + (255 - blueTotal)) / (colors.length * 2);
    analysis.isWarm = analysis.temperature > 0.6;
    analysis.isCool = analysis.temperature < 0.4;
    
    // Find dominant colors
    analysis.dominantColors = Object.entries(analysis.colorCounts)
        .filter(([color, count]) => count > 0)
        .sort(([,a], [,b]) => b - a)
        .map(([color]) => color);

    // Determine mood based on colors and properties
    analysis.mood = determineMood(analysis);
    analysis.texture = determineTexture(analysis);

    // Debug: log color analysis for troubleshooting
    console.log('Color Analysis:', {
        colors: colors,
        colorCounts: analysis.colorCounts,
        dominantColors: analysis.dominantColors,
        lightness: analysis.lightness.toFixed(2),
        saturation: analysis.saturation.toFixed(2),
        temperature: analysis.temperature.toFixed(2),
        mood: analysis.mood,
        texture: analysis.texture
    });

    return analysis;
}

function classifyColor(hsl, colorCounts) {
    const { h, s, l } = hsl;
    
    // More lenient thresholds for better color detection
    
    // Very low saturation = gray/neutral (more lenient threshold)
    if (s < 0.08) {
        colorCounts.gray++;
        return;
    }
    
    // Very dark colors = gray/black (more lenient threshold)
    if (l < 0.08) {
        colorCounts.gray++;
        return;
    }

    // Brown detection FIRST (before other colors) - expanded ranges
    if (h >= 10 && h < 60 && s >= 0.15 && s < 0.7 && l > 0.1 && l < 0.8) {
        colorCounts.brown++;
        // Also classify as the base hue for more vocabulary
        if (h >= 10 && h < 30) colorCounts.red++;
        else if (h >= 30 && h < 45) colorCounts.orange++;
        else if (h >= 45 && h < 60) colorCounts.yellow++;
        return;
    }

    // Improved color classification with better hue ranges
    // Red: 0-20 degrees and 340-360 degrees (expanded range)
    if ((h >= 0 && h < 20) || (h >= 340 && h <= 360)) {
        colorCounts.red++;
    }
    // Orange: 20-45 degrees  
    else if (h >= 20 && h < 45) {
        colorCounts.orange++;
    }
    // Yellow: 45-75 degrees
    else if (h >= 45 && h < 75) {
        colorCounts.yellow++;
    }
    // Green: 75-165 degrees
    else if (h >= 75 && h < 165) {
        colorCounts.green++;
    }
    // Blue: 165-255 degrees
    else if (h >= 165 && h < 255) {
        colorCounts.blue++;
    }
    // Purple/Magenta: 255-340 degrees (expanded range)
    else if (h >= 255 && h < 340) {
        colorCounts.purple++;
    }
}

function determineMood(analysis) {
    if (analysis.lightness < 0.25) return 'dark';
    if (analysis.lightness > 0.8) return 'bright';
    if (analysis.saturation < 0.2) return 'muted';
    if (analysis.saturation > 0.8) return 'vibrant';
    if (analysis.isWarm) return 'warm';
    if (analysis.isCool) return 'cool';
    return 'neutral';
}

function determineTexture(analysis) {
    if (analysis.saturation < 0.15) return 'smooth';
    if (analysis.saturation > 0.7) return 'electric';
    if (analysis.lightness < 0.3) return 'thick';
    if (analysis.lightness > 0.7) return 'ethereal';
    return 'fluid';
}

// COMPREHENSIVE VOCABULARY SYSTEM
// Combining original extensive vocabulary with enhanced color-specific terms

// Original comprehensive adjective collections (preserved and enhanced)
const ORIGINAL_ADJECTIVES = {
    light: [
        'Luminous', 'Radiant', 'Brilliant', 'Gleaming', 'Shimmering', 'Glowing', 'Bright', 'Vivid',
        'Dazzling', 'Blazing', 'Incandescent', 'Phosphorescent', 'Electric', 'Neon', 'Solar',
        'Crystal', 'Diamond', 'Pearl', 'Ivory', 'Platinum', 'Chrome', 'Stellar', 'Celestial'
    ],
    
    dark: [
        'Midnight', 'Shadow', 'Obsidian', 'Charcoal', 'Ebony', 'Raven', 'Onyx', 'Jet',
        'Coal', 'Soot', 'Ink', 'Tar', 'Graphite', 'Slate', 'Storm', 'Thunder',
        'Eclipse', 'Void', 'Abyss', 'Deep', 'Noir', 'Gothic', 'Mysterious', 'Profound'
    ],
    
    soft: [
        'Pastel', 'Soft', 'Gentle', 'Delicate', 'Tender', 'Subtle', 'Muted', 'Whisper',
        'Silk', 'Velvet', 'Satin', 'Cotton', 'Cream', 'Powder', 'Gossamer', 'Feather',
        'Cloud', 'Mist', 'Fog', 'Haze', 'Vapor', 'Breeze', 'Wisp', 'Ethereal'
    ],
    
    vibrant: [
        'Vibrant', 'Bold', 'Rich', 'Intense', 'Saturated', 'Electric', 'Blazing', 'Fiery',
        'Dynamic', 'Energetic', 'Powerful', 'Strong', 'Commanding', 'Striking', 'Vivid',
        'Explosive', 'Magnetic', 'Hypnotic', 'Mesmerizing', 'Captivating', 'Enchanting', 'Spellbinding'
    ],
    
    muted: [
        'Muted', 'Dusty', 'Faded', 'Vintage', 'Weathered', 'Aged', 'Antique', 'Rustic',
        'Worn', 'Patina', 'Sepia', 'Smoky', 'Hazy', 'Cloudy', 'Subdued', 'Restrained',
        'Reserved', 'Modest', 'Understated', 'Refined', 'Sophisticated', 'Elegant', 'Classy'
    ],
    
    warm: [
        'Sunset', 'Sunrise', 'Amber', 'Golden', 'Honey', 'Caramel', 'Copper', 'Bronze',
        'Autumn', 'Harvest', 'Spice', 'Cinnamon', 'Paprika', 'Saffron', 'Turmeric', 'Ginger',
        'Fire', 'Flame', 'Ember', 'Hearth', 'Furnace', 'Desert', 'Sand', 'Earth'
    ],
    
    cool: [
        'Arctic', 'Glacial', 'Frost', 'Ice', 'Snow', 'Winter', 'Ocean', 'Sea',
        'Aqua', 'Marine', 'Nautical', 'Oceanic', 'Tidal', 'Current', 'Stream', 'River',
        'Lake', 'Pond', 'Spring', 'Fresh', 'Crisp', 'Clean', 'Pure', 'Clear'
    ],
    
    twirl: [
        'Spiraling', 'Swirling', 'Twisted', 'Coiled', 'Helical', 'Vortex', 'Whirling', 'Spinning',
        'Rotating', 'Cyclonic', 'Tornadic', 'Gyrating', 'Revolving', 'Curving', 'Serpentine', 'Sinuous',
        'Winding', 'Meandering', 'Undulating', 'Rippling', 'Flowing', 'Dancing', 'Weaving', 'Braided',
        'Knotted', 'Interwoven', 'Entwined', 'Twisted', 'Curled', 'Looped', 'Wrapped', 'Convoluted'
    ],
    
    motion: [
        'Fluid', 'Flowing', 'Dynamic', 'Kinetic', 'Moving', 'Shifting', 'Drifting', 'Streaming',
        'Cascading', 'Rolling', 'Surging', 'Pulsing', 'Rhythmic', 'Animated', 'Living', 'Breathing',
        'Oscillating', 'Vibrating', 'Trembling', 'Flickering', 'Shimmering', 'Undulating', 'Wavering'
    ]
};

// Original color-specific adjectives (preserved)
const ORIGINAL_COLOR_ADJECTIVES = {
    red: [
        'Crimson', 'Scarlet', 'Ruby', 'Cherry', 'Rose', 'Wine', 'Burgundy', 'Claret',
        'Garnet', 'Cardinal', 'Blood', 'Brick', 'Rust', 'Coral', 'Salmon', 'Pink',
        'Blush', 'Magenta', 'Fuchsia', 'Maroon', 'Cranberry', 'Strawberry', 'Raspberry'
    ],
    
    orange: [
        'Amber', 'Copper', 'Bronze', 'Rust', 'Tangerine', 'Orange', 'Peach', 'Apricot',
        'Cantaloupe', 'Papaya', 'Mango', 'Persimmon', 'Pumpkin', 'Carrot', 'Marigold', 'Saffron',
        'Burnt', 'Flame', 'Tiger', 'Sunset', 'Autumn', 'Harvest', 'Spice', 'Cinnamon'
    ],
    
    yellow: [
        'Golden', 'Honey', 'Lemon', 'Butter', 'Cream', 'Vanilla', 'Banana', 'Canary',
        'Sunshine', 'Solar', 'Sunny', 'Bright', 'Cheerful', 'Wheat', 'Straw', 'Corn',
        'Mustard', 'Saffron', 'Champagne', 'Blonde', 'Flax', 'Sand', 'Desert', 'Gold'
    ],
    
    green: [
        'Emerald', 'Jade', 'Forest', 'Pine', 'Sage', 'Mint', 'Lime', 'Olive',
        'Moss', 'Fern', 'Leaf', 'Grass', 'Meadow', 'Spring', 'Fresh', 'Verdant',
        'Jungle', 'Ivy', 'Shamrock', 'Clover', 'Basil', 'Parsley', 'Seaweed', 'Algae'
    ],
    
    blue: [
        'Azure', 'Sapphire', 'Navy', 'Cobalt', 'Steel', 'Slate', 'Denim', 'Indigo',
        'Ocean', 'Sea', 'Sky', 'Cerulean', 'Turquoise', 'Teal', 'Aqua', 'Cyan',
        'Royal', 'Electric', 'Powder', 'Baby', 'Ice', 'Frost', 'Arctic', 'Glacier'
    ],
    
    purple: [
        'Lavender', 'Violet', 'Purple', 'Plum', 'Amethyst', 'Orchid', 'Lilac', 'Mauve',
        'Magenta', 'Fuchsia', 'Wine', 'Grape', 'Eggplant', 'Royal', 'Imperial', 'Regal',
        'Mystic', 'Cosmic', 'Galaxy', 'Nebula', 'Twilight', 'Dusk', 'Evening', 'Midnight'
    ],
    
    neutral: [
        'Silver', 'Platinum', 'Chrome', 'Steel', 'Iron', 'Aluminum', 'Pewter', 'Tin',
        'Pearl', 'Ivory', 'Bone', 'Cream', 'Beige', 'Tan', 'Taupe', 'Khaki',
        'Stone', 'Granite', 'Marble', 'Slate', 'Ash', 'Smoke', 'Fog', 'Mist'
    ]
};

// Enhanced color-specific vocabularies (new additions)
const ENHANCED_COLOR_ADJECTIVES = {
    gray: ['Ash', 'Smoke', 'Steel', 'Concrete', 'Stone', 'Granite', 'Slate', 'Charcoal', 'Graphite', 'Pewter', 'Silver', 'Aluminum', 'Titanium', 'Iron', 'Lead', 'Zinc'],
    green: ['Forest', 'Jungle', 'Moss', 'Algae', 'Seaweed', 'Grass', 'Leaf', 'Sage', 'Mint', 'Lime', 'Olive', 'Pine', 'Fern', 'Ivy', 'Basil', 'Emerald', 'Jade', 'Malachite'],
    blue: ['Ocean', 'Arctic', 'Glacier', 'Ice', 'Frost', 'Steel', 'Denim', 'Navy', 'Cobalt', 'Azure', 'Cerulean', 'Teal', 'Aqua', 'Cyan', 'Sapphire'],
    red: ['Blood', 'Crimson', 'Scarlet', 'Cherry', 'Wine', 'Rust', 'Copper', 'Iron-Oxide', 'Brick', 'Clay', 'Terracotta', 'Mahogany', 'Cardinal', 'Ruby'],
    yellow: ['Sulfur', 'Golden', 'Honey', 'Amber', 'Resin', 'Wax', 'Butter', 'Cream', 'Custard', 'Mustard', 'Turmeric', 'Saffron', 'Uranium', 'Sodium'],
    purple: ['Amethyst', 'Violet', 'Lavender', 'Plum', 'Grape', 'Eggplant', 'Royal', 'Imperial', 'Mystic', 'Cosmic', 'Alien', 'Synthetic', 'Artificial'],
    orange: ['Rust', 'Copper', 'Bronze', 'Amber', 'Caramel', 'Honey', 'Burnt', 'Oxidized', 'Weathered', 'Aged', 'Patina', 'Flame', 'Fire'],
    brown: ['Mud', 'Clay', 'Earth', 'Soil', 'Dirt', 'Rust', 'Copper', 'Bronze', 'Leather', 'Wood', 'Bark', 'Coffee', 'Chocolate', 'Cocoa', 'Umber']
};

// Original comprehensive nouns (preserved)
const ORIGINAL_NOUNS = [
    'Waves', 'Flow', 'Current', 'Stream', 'River', 'Cascade', 'Waterfall', 'Rapids',
    'Tide', 'Surf', 'Foam', 'Ripple', 'Eddy', 'Whirlpool', 'Vortex', 'Spiral',
    'Gradient', 'Spectrum', 'Prism', 'Rainbow', 'Aurora', 'Mirage', 'Reflection', 'Refraction',
    'Harmony', 'Symphony', 'Melody', 'Rhythm', 'Beat', 'Pulse', 'Vibration', 'Resonance',
    'Blend', 'Fusion', 'Merge', 'Unity', 'Balance', 'Equilibrium', 'Symmetry', 'Pattern',
    'Dance', 'Ballet', 'Waltz', 'Tango', 'Movement', 'Motion', 'Flow', 'Grace',
    'Shimmer', 'Glimmer', 'Sparkle', 'Twinkle', 'Glitter', 'Gleam', 'Shine', 'Glow',
    'Vision', 'Dream', 'Fantasy', 'Imagination', 'Illusion', 'Wonder', 'Magic', 'Enchantment',
    'Cosmos', 'Galaxy', 'Nebula', 'Star', 'Constellation', 'Universe', 'Infinity', 'Eternity',
    'Journey', 'Voyage', 'Adventure', 'Quest', 'Expedition', 'Discovery', 'Exploration', 'Path'
];

// Original specialized nouns (preserved)
const ORIGINAL_SPECIALIZED_NOUNS = {
    twirl: [
        'Spiral', 'Helix', 'Vortex', 'Whirlpool', 'Cyclone', 'Tornado', 'Maelstrom', 'Gyre',
        'Coil', 'Twist', 'Turn', 'Curl', 'Loop', 'Knot', 'Braid', 'Weave',
        'Serpent', 'Dragon', 'Vine', 'Tendril', 'Ribbon', 'Sash', 'Scarf', 'Banner'
    ],
    
    motion: [
        'Flow', 'Current', 'Drift', 'Surge', 'Rush', 'Stream', 'Tide', 'Wave',
        'Dance', 'Ballet', 'Waltz', 'Rhythm', 'Pulse', 'Beat', 'Vibration', 'Tremor',
        'Cascade', 'Waterfall', 'Rapids', 'Torrent', 'Flux', 'Drift', 'Motion', 'Movement'
    ]
};

// Enhanced substance-based nouns (new additions)
const ENHANCED_SUBSTANCE_NOUNS = {
    thick: ['Goo', 'Slime', 'Ooze', 'Paste', 'Putty', 'Gel', 'Jelly', 'Custard', 'Pudding', 'Tar', 'Pitch', 'Resin', 'Sap', 'Honey', 'Syrup', 'Molasses'],
    fluid: ['Liquid', 'Fluid', 'Solution', 'Mixture', 'Suspension', 'Emulsion', 'Substance', 'Chemical', 'Compound', 'Extract'],
    smooth: ['Oil', 'Lacquer', 'Varnish', 'Polish', 'Coating', 'Film', 'Membrane', 'Surface'],
    electric: ['Plasma', 'Gas', 'Vapor', 'Energy', 'Radiation', 'Emission', 'Glow', 'Aura'],
    ethereal: ['Mist', 'Fog', 'Vapor', 'Gas', 'Cloud', 'Haze', 'Smoke', 'Steam']
};

// Color-specific substance nouns (new additions)
const COLOR_SUBSTANCE_NOUNS = {
    gray: ['Dust', 'Powder', 'Soot', 'Cement', 'Metal', 'Ore', 'Mineral', 'Rock', 'Crystal', 'Debris', 'Residue', 'Sediment'],
    green: ['Weed', 'Hemp', 'Weeds', 'Chlorophyll', 'Slime', 'Ooze', 'Bog', 'Swamp', 'Marsh', 'Kelp', 'Plankton', 'Mold', 'Fungi', 'Spores'],
    blue: ['Water', 'Liquid', 'Fluid', 'Plasma', 'Coolant', 'Antifreeze', 'Methylene', 'Copper-Sulfate', 'Ink', 'Dye'],
    red: ['Plasma', 'Hemoglobin', 'Magma', 'Lava', 'Molten-Metal', 'Oxide', 'Rust', 'Patina', 'Sediment', 'Clay', 'Mud'],
    yellow: ['Pus', 'Mucus', 'Syrup', 'Honey', 'Amber', 'Resin', 'Wax', 'Oil', 'Grease', 'Fat', 'Butter', 'Custard', 'Yolk'],
    purple: ['Plasma', 'Gas', 'Vapor', 'Chemical', 'Compound', 'Solution', 'Mixture', 'Substance', 'Extract', 'Essence'],
    orange: ['Rust', 'Oxide', 'Patina', 'Residue', 'Sediment', 'Clay', 'Mud', 'Sludge', 'Paste', 'Putty', 'Compound'],
    brown: ['Sludge', 'Mud', 'Clay', 'Dirt', 'Soil', 'Sediment', 'Compost', 'Humus', 'Loam', 'Muck', 'Grime', 'Filth']
};

// Enhanced palette name generation combining all vocabularies
function generateEnhancedPaletteName(colors = null, waveParams = {}) {
    // If no colors provided, get current palette
    if (!colors) {
        colors = [
            document.getElementById('color1').value,
            document.getElementById('color2').value,
            document.getElementById('color3').value,
            document.getElementById('color4').value
        ];
    }

    // Analyze colors with enhanced analysis
    const analysis = analyzeColorsPalette(colors);
    
    // Get wave parameters
    const {
        waveAmplitude = 1.5,
        waveTwirl = 0.05,
        twirlSources = 1,
        waveSpeed = 1.0,
        waveZoom = 4.5,
        waveFrequency = 1.0
    } = waveParams;

    // Wave analysis
    const isHighAmplitude = waveAmplitude > 2.0;
    const isHighZoom = waveZoom > 8.0;
    const isHighFrequency = waveFrequency > 2.0;
    const hasTwirl = waveTwirl > 0.01;
    const isHighTwirl = waveTwirl > 0.1;
    const hasMultipleTwirls = twirlSources > 2;
    const hasManyTwirls = twirlSources > 4;
    const isFastAnimation = waveSpeed > 2.0;

    // Build vocabulary pools with ABSOLUTE COLOR DOMINANCE
    let adjectives = [];
    let nouns = [];

    // STEP 1: Force add color-specific vocabulary with EXTREME weighting
    const allDetectedColors = analysis.dominantColors;
    
    if (allDetectedColors.length > 0) {
        allDetectedColors.forEach(color => {
            // Add color adjectives with high weight (10x)
            if (ORIGINAL_COLOR_ADJECTIVES[color]) {
                for (let i = 0; i < 10; i++) {
                    adjectives.push(...ORIGINAL_COLOR_ADJECTIVES[color]);
                }
            }
            
            // Add enhanced color adjectives with high weight (10x)
            if (ENHANCED_COLOR_ADJECTIVES[color]) {
                for (let i = 0; i < 10; i++) {
                    adjectives.push(...ENHANCED_COLOR_ADJECTIVES[color]);
                }
            }
            
            // Add color substance nouns with high weight (10x)
            if (COLOR_SUBSTANCE_NOUNS[color]) {
                for (let i = 0; i < 10; i++) {
                    nouns.push(...COLOR_SUBSTANCE_NOUNS[color]);
                }
            }
        });

        // Add basic substance nouns (reduced weight)
        nouns.push('Plasma', 'Liquid', 'Gel', 'Substance', 'Material');
        
        // Add some generic vocabulary for variety (low weight)
        adjectives.push('Flowing', 'Rippling', 'Smooth', 'Liquid', 'Soft', 'Glowing', 'Shimmering');
        nouns.push('Flow', 'Stream', 'Current', 'Blend', 'Mix', 'Fusion', 'Compound');
        
        // Add wave-based vocabulary for texture (moderate weight)
        if (hasTwirl && waveTwirl > 0.08) {
            adjectives.push('Swirling', 'Twisting', 'Spiraling', 'Rotating');
            nouns.push('Vortex', 'Spiral', 'Whirl', 'Twist');
        }
        
        if (waveAmplitude > 5.0) {
            adjectives.push('Turbulent', 'Chaotic', 'Wild', 'Dynamic');
            nouns.push('Chaos', 'Turbulence', 'Storm', 'Energy');
        }
        
        console.log(`Combined naming: ${adjectives.length} adjectives, ${nouns.length} nouns`);
        
    } else {
        console.log('No colors detected! Using fallback vocabulary.');
        // Fallback if no colors detected - only then use wave vocabulary
        adjectives.push('Unknown', 'Mystery', 'Strange', 'Flowing', 'Rippling');
        nouns.push('Substance', 'Material', 'Flow', 'Stream', 'Current');
        
        // Add wave vocabulary only as fallback
        if (hasTwirl) {
            adjectives.push(...ORIGINAL_ADJECTIVES.twirl.slice(0, 3));
            nouns.push(...ORIGINAL_SPECIALIZED_NOUNS.twirl.slice(0, 3));
        }
        
        if (isHighAmplitude) {
            adjectives.push('Turbulent', 'Chaotic', 'Wild');
            nouns.push('Chaos', 'Turbulence', 'Storm');
        }
    }

    // Ensure we have vocabulary (fallback to color-neutral if absolutely necessary)
    if (adjectives.length === 0) {
        adjectives = ['Flowing', 'Rippling', 'Smooth', 'Liquid', 'Soft'];
    }
    if (nouns.length === 0) {
        nouns = ['Substance', 'Material', 'Liquid', 'Gel', 'Plasma'];
    }

    // Remove duplicates and select
    adjectives = [...new Set(adjectives)];
    nouns = [...new Set(nouns)];

    // Debug: log final vocabulary to verify color dominance
    console.log('Final Vocabulary:', {
        totalAdjectives: adjectives.length,
        totalNouns: nouns.length,
        sampleAdjectives: adjectives.slice(0, 10),
        sampleNouns: nouns.slice(0, 10)
    });

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];

    console.log('Selected Name:', `${adj} ${noun}`);

    return `${adj} ${noun}`;
}

// Utility functions
function hexToRgbObject(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return { h: h * 360, s, l };
}
