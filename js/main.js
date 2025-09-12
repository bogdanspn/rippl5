/*
 * rippl5 - Generative Ripple Gradients Exploration
 * Author: Cristian Bogdan Rosu
 * Site: https://bogdanrosu.net/rippl5
 *
 * This file contains the core WebGL rendering pipeline, UI bindings,
 * palette generation, and randomization logic for the rippl5 demo.
 *
 * Notes:
 * - Presets are kept in `js/presets.js` and are loaded by `index.html`.
 * - Main controls live in the floating panel and are wired to functions
 *   such as `randomize()`, `randomizeColorsOnly()` and `updateUniforms()`.
 *
 * 
 */

let canvas, gl, program;
let uniforms = {};
let animationId;
let twirlSeedX = Math.random() * 10.0;
let twirlSeedY = Math.random() * 10.0;

// ---------------------------------------------------------------------------
// Shader sources
// Vertex and fragment shader source code for the ripple renderer.
// The fragment shader implements the 8-color gradient system, wave math,
// filmic effects and final image adjustments (brightness, contrast, saturation).
// ---------------------------------------------------------------------------
const vertexShaderSource = `
    attribute vec4 position;
    void main() {
        gl_Position = position;
    }
`;

const fragmentShaderSource = `
    precision highp float;
    
    uniform vec2 resolution;
    uniform float time;
    uniform float waveSpeed;
    uniform int blendMode;
    uniform int filmEffect; // 0 = none, 1 = film noise, 2 = tone mapping, 3 = CA, 4 = bloom, 5 = lens distortion, 6 = pixelation, 7 = trail blur, 8 = watercolor, 9 = glass stripes
    uniform float filmNoiseIntensity;
    uniform float bloomIntensity;
    uniform float caAmount;
    uniform float lensDistortion;
    uniform float pixelationSize;
    uniform float trailBlur;
    uniform float watercolor;
    uniform float glassStripesIntensity;
    uniform float glassStripesFrequency;
    uniform int glassStripesDirection;
    uniform float glassStripesDistortion;
    uniform int toneMappingLUT; // LUT selection for tone mapping
    uniform int waveCount;
    uniform float waveAmplitude;
    uniform float waveFrequency;
    uniform float waveZoom;
    uniform float waveTwirl;
    uniform int twirlSources;
    uniform int twirlLocation;
    uniform float twirlSeedX;
    uniform float twirlSeedY;
    uniform float turbulenceIntensity;
    uniform float noiseDisplacement;
    uniform float phaseRandomness;
    uniform float amplitudeVariation;
    uniform float directionDrift;
    uniform vec3 color1;
    uniform vec3 color2;
    uniform vec3 color3;
    uniform vec3 color4;
    uniform vec3 color5; // top edge midpoint
    uniform vec3 color6; // right edge midpoint  
    uniform vec3 color7; // bottom edge midpoint
    uniform vec3 color8; // left edge midpoint
    
    // Basic image adjustments (applied at the end)
    uniform float brightness;  // -1.0 to 1.0
    uniform float contrast;    // 0.0 to 2.0
    uniform float saturation;  // 0.0 to 2.0
    
    // Blend modes: 0 = Smooth (mix), 1 = Multiply, 2 = Screen, 3 = Overlay
    vec3 blendModeFunc(vec3 a, vec3 b, int mode) {
        if (mode == 0) {
            // smooth/mix by 50%
            return mix(a, b, 0.5);
        } else if (mode == 1) {
            // multiply
            return a * b;
        } else if (mode == 2) {
            // screen
            return 1.0 - (1.0 - a) * (1.0 - b);
        } else if (mode == 3) {
            // overlay
            vec3 res;
            for (int i = 0; i < 3; i++) {
                float ai = a[i];
                float bi = b[i];
                if (ai < 0.5) res[i] = 2.0 * ai * bi;
                else res[i] = 1.0 - 2.0 * (1.0 - ai) * (1.0 - bi);
            }
            return res;
        }

        return mix(a, b, 0.5);
    }

    // 2D Perlin-style noise helpers
    float fade(float t) {
        return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    }

    vec2 rand2(vec2 p) {
        float a = fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        float b = fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453);
        vec2 r = vec2(a * 2.0 - 1.0, b * 2.0 - 1.0);
        return normalize(r);
    }

    float perlin(vec2 P) {
        vec2 Pi = floor(P);
        vec2 Pf = fract(P);

        vec2 g00 = rand2(Pi + vec2(0.0, 0.0));
        vec2 g10 = rand2(Pi + vec2(1.0, 0.0));
        vec2 g01 = rand2(Pi + vec2(0.0, 1.0));
        vec2 g11 = rand2(Pi + vec2(1.0, 1.0));

        float d00 = dot(g00, Pf - vec2(0.0, 0.0));
        float d10 = dot(g10, Pf - vec2(1.0, 0.0));
        float d01 = dot(g01, Pf - vec2(0.0, 1.0));
        float d11 = dot(g11, Pf - vec2(1.0, 1.0));

        float ux = fade(Pf.x);
        float uy = fade(Pf.y);

        float ix0 = mix(d00, d10, ux);
        float ix1 = mix(d01, d11, ux);
        float value = mix(ix0, ix1, uy);

        // Perlin returns in approx [-1,1], normalize to [-1,1] (already approximately)
        return value;
    }

    float fbm(vec2 p) {
        float f = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
            f += amp * perlin(p);
            p *= 2.0;
            amp *= 0.5;
        }
        return f;
    }
    
    // ACES-like tone mapping
    vec3 toneMapACES(vec3 x) {
        x = max(vec3(0.0), x);
        vec3 a = x * (2.51 * x + 0.03);
        vec3 b = x * (2.43 * x + 0.59) + 0.14;
        return clamp(a / b, 0.0, 1.0);
    }
    
    // Reinhard tone mapping
    vec3 toneMapReinhard(vec3 x) {
        return x / (1.0 + x);
    }
    
    // Uncharted 2 tone mapping
    vec3 uncharted2Tonemap(vec3 x) {
        float A = 0.15;
        float B = 0.50;
        float C = 0.10;
        float D = 0.20;
        float E = 0.02;
        float F = 0.30;
        return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;
    }
    
    vec3 toneMapUncharted2(vec3 color) {
        float W = 11.2;
        color = uncharted2Tonemap(color * 2.0);
        vec3 whiteScale = 1.0 / uncharted2Tonemap(vec3(W));
        return color * whiteScale;
    }
    
    // Cinematic tone mapping
    vec3 toneMapCinematic(vec3 x) {
        x = max(vec3(0.0), x);
        return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
    }
    
    // Warm film tone mapping
    vec3 toneMapWarmFilm(vec3 x) {
        x = max(vec3(0.0), x);
        // Add warm tint and film-like curve
        x.r *= 1.1;
        x.g *= 1.05;
        x.b *= 0.95;
        return (x * (2.8 * x + 0.15)) / (x * (2.8 * x + 0.75) + 0.1);
    }
    
    // Cool film tone mapping
    vec3 toneMapCoolFilm(vec3 x) {
        x = max(vec3(0.0), x);
        // Add cool tint and film-like curve
        x.r *= 0.95;
        x.g *= 1.02;
        x.b *= 1.15;
        return (x * (2.6 * x + 0.2)) / (x * (2.6 * x + 0.8) + 0.12);
    }
    
    // High contrast tone mapping
    vec3 toneMapHighContrast(vec3 x) {
        x = max(vec3(0.0), x);
        // Increase contrast with S-curve
        x = pow(x, vec3(0.8));
        return (x * (3.2 * x + 0.1)) / (x * (3.2 * x + 1.2) + 0.08);
    }
    
    // Vintage tone mapping
    vec3 toneMapVintage(vec3 x) {
        x = max(vec3(0.0), x);
        // Vintage look with lifted blacks and warm highlights
        x = pow(x, vec3(1.2));
        x.r *= 1.08;
        x.g *= 1.03;
        x.b *= 0.92;
        return (x * (2.2 * x + 0.3)) / (x * (2.2 * x + 0.9) + 0.15);
    }
    
    // Master tone mapping function
    vec3 applyToneMapping(vec3 color, int lutType) {
        if (lutType == 0) return toneMapACES(color);
        else if (lutType == 1) return toneMapReinhard(color);
        else if (lutType == 2) return toneMapUncharted2(color);
        else if (lutType == 3) return toneMapCinematic(color);
        else if (lutType == 4) return toneMapWarmFilm(color);
        else if (lutType == 5) return toneMapCoolFilm(color);
        else if (lutType == 6) return toneMapHighContrast(color);
        else if (lutType == 7) return toneMapVintage(color);
        return toneMapACES(color); // fallback
    }
    
    // Enhanced bloom effect
    vec3 computeBloom(vec2 uv, vec3 baseColor) {
        // Much lower threshold and stronger effect
        float lum = dot(baseColor, vec3(0.2126, 0.7152, 0.0722));
        float bright = max(lum - 0.2, 0.0); // Very low threshold
        
        // Create glow effect - brighten the entire color when bright areas are present
        vec3 bloom = baseColor * (1.0 + bright * 2.0);
        
        // Add extra brightness to already bright areas
        bloom += baseColor * bright * bright * 4.0;
        
        return bloom;
    }
    
    // Lens distortion effect (barrel/pincushion)
    vec2 applyLensDistortion(vec2 uv, float distortion) {
        vec2 center = vec2(0.5, 0.5);
        vec2 offset = uv - center;
        float distance = length(offset);
        
        // Apply barrel (positive) or pincushion (negative) distortion
        float factor = 1.0 + distortion * distance * distance;
        return center + offset * factor;
    }
    
    // Pixelation effect 
    vec2 applyPixelation(vec2 uv, float pixelSize) {
        if (pixelSize <= 1.0) return uv;
        
        vec2 pixelCount = resolution.xy / pixelSize;
        return floor(uv * pixelCount) / pixelCount;
    }
    
    // Trail/Motion Blur effect - temporal ghosting
    vec3 applyTrailBlur(vec3 color, vec2 uv, float intensity) {
        if (intensity <= 0.0) return color;
        
        // Create motion trail effect by sampling the current color at offset positions
        vec3 trail = color;
        float offset = intensity * 0.02;
        
        // Use simple color mixing based on position for trail effect
        vec2 motion = vec2(sin(time * 0.5 + uv.x * 3.14159), cos(time * 0.3 + uv.y * 3.14159)) * offset;
        
        // Create ghosting by blending with shifted color variations
        vec3 ghost1 = color * (0.8 + 0.2 * sin(time + uv.x * 10.0));
        vec3 ghost2 = color * (0.9 + 0.1 * cos(time * 0.7 + uv.y * 15.0));
        
        trail = mix(trail, ghost1, intensity * 0.3);
        trail = mix(trail, ghost2, intensity * 0.2);
        
        return trail;
    }
    
    // Watercolor Bleeding effect - soft color bleeding
    vec3 applyWatercolor(vec3 color, vec2 uv, float intensity) {
        if (intensity <= 0.0) return color;
        
        // Create multiple bleeding layers with different scales and speeds
        vec3 bleeding = color;
        
        // Layer 1: Large bleeding patterns
        vec2 bleedUV1 = uv + vec2(sin(time * 0.3 + uv.y * 4.0), cos(time * 0.2 + uv.x * 3.0)) * intensity * 0.03;
        float bleed1 = fbm(bleedUV1 * 8.0 + time * 0.15);
        
        // Layer 2: Medium bleeding patterns
        vec2 bleedUV2 = uv + vec2(cos(time * 0.5 + uv.x * 6.0), sin(time * 0.4 + uv.y * 5.0)) * intensity * 0.02;
        float bleed2 = fbm(bleedUV2 * 12.0 + time * 0.1);
        
        // Layer 3: Fine detail bleeding
        vec2 bleedUV3 = uv + vec2(sin(time * 0.7 + uv.x * 8.0), cos(time * 0.6 + uv.y * 7.0)) * intensity * 0.015;
        float bleed3 = fbm(bleedUV3 * 20.0 + time * 0.08);
        
        // Create color variations based on the original gradient
        // Shift colors in HSV-like space for natural bleeding
        vec3 bleedColor1 = bleeding;
        bleedColor1.r = mix(bleedColor1.r, bleedColor1.g, (bleed1 - 0.5) * intensity * 0.4);
        bleedColor1.g = mix(bleedColor1.g, bleedColor1.b, (bleed2 - 0.5) * intensity * 0.3);
        bleedColor1.b = mix(bleedColor1.b, bleedColor1.r, (bleed3 - 0.5) * intensity * 0.35);
        
        // Create secondary bleeding with different color shifts
        vec3 bleedColor2 = bleeding;
        bleedColor2.r += (bleed2 - 0.5) * intensity * 0.25;
        bleedColor2.g += (bleed3 - 0.5) * intensity * 0.2;
        bleedColor2.b += (bleed1 - 0.5) * intensity * 0.3;
        
        // Blend layers based on noise patterns
        float blendFactor1 = smoothstep(0.3, 0.7, bleed1) * intensity;
        float blendFactor2 = smoothstep(0.4, 0.8, bleed2) * intensity;
        
        bleeding = mix(bleeding, bleedColor1, blendFactor1 * 0.6);
        bleeding = mix(bleeding, bleedColor2, blendFactor2 * 0.4);
        
        // Add subtle paper texture (much smaller scale)
        float paper = fbm(uv * 150.0 + time * 0.05) * 0.03 * intensity;
        bleeding += vec3(paper * 0.5);
        
        // Add water flow simulation with directional bleeding
        vec2 flowDir = normalize(vec2(sin(time * 0.1), cos(time * 0.08)));
        vec2 flowUV = uv + flowDir * intensity * 0.01;
        float flow = fbm(flowUV * 25.0 + time * 0.12);
        
        // Create flowing color variations
        vec3 flowColor = bleeding;
        flowColor = mix(flowColor, flowColor.gbr, (flow - 0.5) * intensity * 0.3); // Rotate RGB channels
        
        bleeding = mix(bleeding, flowColor, smoothstep(0.4, 0.9, flow) * intensity * 0.5);
        
        return bleeding;
    }
    
    // Fluted Glass effect - pure distortion with optional soft banding
    vec3 applyGlassStripes(vec3 color, vec2 uv) {
        // The real distortion happens in main() by modifying UV coordinates
        // Here we add optional soft banding and subtle frosting
        
        // Add very light frosting blur for glass effect
        vec3 frostedColor = color;
        vec3 blur = color * 0.5 + color * 0.5;
        frostedColor = mix(color, blur, 0.15); // Very subtle frosting
        
        // Optional soft banding effect
        if (glassStripesIntensity > 0.0) {
            float numSlices = glassStripesFrequency * 0.8;
            float sliceProgress;
            
            if (glassStripesDirection == 0) {
                // Vertical flutes - bands run vertically
                sliceProgress = fract(uv.x * numSlices);
            } else {
                // Horizontal flutes - bands run horizontally
                sliceProgress = fract(uv.y * numSlices);
            }
            
            // Create smooth gradient-like transitions instead of sine waves
            float distanceFromCenter = abs(sliceProgress - 0.5) * 2.0; // 0 at center, 1 at edges
            
            // Create smooth gradient falloff for thick bands
            float bandPattern = 1.0 - distanceFromCenter; // 1 at center, 0 at edges
            
            // Apply multiple smoothing layers for ultra-smooth transitions
            bandPattern = smoothstep(0.0, 1.0, bandPattern); // First smoothing
            bandPattern = smoothstep(0.1, 0.9, bandPattern); // Second smoothing for softer edges
            bandPattern = smoothstep(0.2, 0.8, bandPattern); // Third smoothing for gradient-like softness
            
            // Create very subtle brightness variation with smooth falloff
            float bandShading = (bandPattern - 0.5) * 0.06 * glassStripesIntensity; // Even gentler
            frostedColor *= (1.0 + bandShading);
            
            // Add soft gradient highlights that follow the same smooth pattern
            float gradientHighlight = bandPattern * 0.015 * glassStripesIntensity;
            gradientHighlight = smoothstep(0.3, 0.7, gradientHighlight); // Extra smooth
            frostedColor += vec3(gradientHighlight * 0.4);
        }
        
        return frostedColor;
    }
    
    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        
        // Apply fluted glass UV displacement first (like the real implementation)
        if (filmEffect == 9) {
            float numSlices = glassStripesFrequency * 0.8;
            float amplitude = 0.015 * glassStripesDistortion; // Make distortion amount controllable
            
            if (glassStripesDirection == 0) {
                // Vertical flutes (distort along X axis based on Y position)
                float sliceProgress = fract(uv.x * numSlices);
                uv.x += amplitude * sin(sliceProgress * 6.28318530718) * (1.0 - 0.5 * abs(sliceProgress - 0.5));
            } else {
                // Horizontal flutes (distort along Y axis based on X position)
                float sliceProgress = fract(uv.y * numSlices);
                uv.y += amplitude * sin(sliceProgress * 6.28318530718) * (1.0 - 0.5 * abs(sliceProgress - 0.5));
            }
        }
        
        // Apply lens distortion and pixelation effects to UV coordinates
        if (filmEffect == 5) {
            // Lens distortion - apply before any other coordinate transformations
            uv = applyLensDistortion(uv, lensDistortion);
            uv = clamp(uv, 0.0, 1.0); // Ensure UV stays in valid range
        } else if (filmEffect == 6) {
            // Pixelation - quantize UV coordinates
            uv = applyPixelation(uv, pixelationSize);
        }
        
        vec2 pos = uv * 2.0 - 1.0;
        
        float aspect = resolution.x / resolution.y;
        pos.x *= aspect;
        
        // Apply zoom scaling to position (overall scale)
        pos *= waveZoom;
        
        // Apply animated twirl effect - very subtle coordinate rotation
        if (waveTwirl > 0.0 && twirlSources > 0) {
            vec2 pos_twirled = pos;
            
            // Apply multiple twirl sources with different distribution modes
            for (int i = 0; i < 6; i++) {
                if (i >= twirlSources) break;
                
                float fi = float(i);
                vec2 center;
                
                if (twirlLocation == 0) {
                    // Center mode - sources orbit around the center
                    center = vec2(
                        sin(time * (0.08 + fi * 0.02) + fi * 2.0) * (0.4 + fi * 0.1),
                        cos(time * (0.06 + fi * 0.03) + fi * 1.5) * (0.5 + fi * 0.1)
                    );
                } else if (twirlLocation == 2) {
                    // Corners mode - place twirls at actual screen corners
                    int cornerIndex = i - (i / 4) * 4;
                    
                    if (twirlSources <= 3) {
                        // For 3 or fewer sources, distribute them around corners in a circle
                        float angleStep = 6.28318 / float(twirlSources); // 2*PI / sources
                        float angle = fi * angleStep + time * 0.02; // Slow rotation
                        
                        // Place on a large circle that reaches the corners
                        float radius = min(aspect * waveZoom, waveZoom) * 0.9;
                        center = vec2(cos(angle) * radius, sin(angle) * radius);
                    } else {
                        // For 4+ sources, use first 3 positions + add nearby companions
                        int baseIndex = i - (i / 3) * 3; // Modulo 3 for base positions
                        
                        // Calculate base position (same as the 3-source distribution)
                        float angleStep = 6.28318 / 3.0; // Always use 3 base positions
                        float baseAngle = float(baseIndex) * angleStep + time * 0.02;
                        float radius = min(aspect * waveZoom, waveZoom) * 0.9;
                        vec2 baseCenter = vec2(cos(baseAngle) * radius, sin(baseAngle) * radius);
                        
                        if (i < 3) {
                            // First 3 sources: use base positions
                            center = baseCenter;
                        } else {
                            // Additional sources: place near the base positions with offset
                            float companionOffset = 0.3; // Distance from base position
                            float companionAngle = baseAngle + 1.57 + fi * 0.5; // 90 degrees + variation
                            
                            center = baseCenter + vec2(
                                cos(companionAngle) * companionOffset,
                                sin(companionAngle) * companionOffset
                            );
                        }
                    }
                } else {
                    // Random mode - sources distributed across canvas using random seeds
                    vec2 basePos = vec2(
                        cos(fi * 2.4 + twirlSeedX + fi) * 1.5,  // Use twirlSeedX for randomization
                        sin(fi * 1.8 + twirlSeedY + fi) * 1.2   // Use twirlSeedY for randomization
                    );
                    
                    center = basePos + vec2(
                        sin(time * (0.06 + fi * 0.015) + fi * 3.14 + twirlSeedX) * (0.3 + fi * 0.1),
                        cos(time * (0.05 + fi * 0.02) + fi * 2.1 + twirlSeedY) * (0.25 + fi * 0.08)
                    );
                }
                
                float dist = length(pos_twirled - center);
                
                // Apply different strength calculations based on mode
                float strength;
                if (twirlLocation == 0) {
                    // Center mode - consistent global strength
                    strength = waveTwirl * (30.0 / (1.0 + fi * 0.5));
                } else if (twirlLocation == 2) {
                    // Corners mode - distance-based falloff from corners, zoom-independent
                    float falloff = 1.0 / (1.0 + dist * 1.5);
                    strength = waveTwirl * falloff * (25.0 / (1.0 + fi * 0.4));
                } else {
                    // Random mode - distance-based falloff for localized effects
                    float falloff = 1.0 / (1.0 + dist * (2.0 + fi * 0.5));
                    strength = waveTwirl * falloff * (20.0 / (1.0 + fi * 0.3));
                }
                
                // Calculate twirl angle
                float twirlAngle = dist * waveTwirl * (1.2 + fi * 0.2) + time * (0.03 + fi * 0.01);
                
                // Apply rotation
                float cosA = cos(twirlAngle * (0.7 - fi * 0.08));
                float sinA = sin(twirlAngle * (0.7 - fi * 0.08));
                
                vec2 rotated = vec2(
                    pos_twirled.x * cosA - pos_twirled.y * sinA,
                    pos_twirled.x * sinA + pos_twirled.y * cosA
                );
                
                // Blend the rotation effect
                pos_twirled = mix(pos_twirled, rotated, strength);
            }
            
            pos = pos_twirled;
        }
        
        // Apply turbulence/fractal noise displacement
        if (turbulenceIntensity > 0.0) {
            vec2 turbulencePos = pos * 1.5 + time * 0.05;
            float turbulenceX = fbm(turbulencePos) * turbulenceIntensity;
            float turbulenceY = fbm(turbulencePos + vec2(100.0, 50.0)) * turbulenceIntensity;
            pos += vec2(turbulenceX * 0.8, turbulenceY * 0.6);
        }
        
        // Apply noise displacement
        if (noiseDisplacement > 0.0) {
            vec2 noiseOffset = vec2(
                perlin(pos * 3.0 + time * 0.1) * noiseDisplacement,
                perlin(pos * 3.0 + time * 0.1 + 100.0) * noiseDisplacement
            );
            pos += noiseOffset;
        }
        
        // Create wave distortion
        float wave = 0.0;
        for (int i = 0; i < 12; i++) {
            if (i >= waveCount) break;
            
            float fi = float(i);
            // Keep the base angle constant per wave index so waves don't rotate over time
            float baseAngle = fi * 0.5 * waveFrequency; // frequency affects angle distribution
            
            // Add direction drift - slowly change wave directions over time
            float angleDrift = 0.0;
            if (directionDrift > 0.0) {
                angleDrift = sin(time * 0.1 + fi * 2.0) * directionDrift;
            }
            
            float angle = baseAngle + angleDrift;
            vec2 dir = vec2(cos(angle), sin(angle));
            
            // Add phase randomization
            float randomPhase = 0.0;
            if (phaseRandomness > 0.0) {
                randomPhase = fract(sin(fi * 12.9898) * 43758.5453) * phaseRandomness;
            }
            
            // Add amplitude variation per wave. Clamp to keep amplitudes non-negative.
            float waveAmpVariation = 1.0;
            if (amplitudeVariation > 0.0) {
                waveAmpVariation = 1.0 + (fract(sin(fi * 78.233) * 43758.5453) - 0.5) * amplitudeVariation;
                waveAmpVariation = max(0.1, waveAmpVariation); // prevent near-zero/negative amplitudes
            }
            
            // Simple distance calculation with phase randomization
            float dist = dot(pos, dir) + time + fi * 0.7 + randomPhase * 6.28;
            wave += sin(dist) * waveAmplitude * waveAmpVariation / (fi + 1.0);
        }
        
        // Apply wave to UV coordinates with amplitude-aware scaling
        // Use a more conservative scaling that prevents extreme distortion
        float uvScale = 0.08 * (1.0 / (1.0 + waveAmplitude * 0.3));
        vec2 waveUV = uv + wave * uvScale;
        
        // Soft clamping with edge smoothing to prevent artifacts
        waveUV = clamp(waveUV, vec2(0.01), vec2(0.99));
        
                // Enhanced bilinear interpolation with edge midpoint colors
                // Interpolate along edges using midpoint colors
                vec3 topColor, bottomColor;
                if (waveUV.x < 0.5) {
                    topColor = mix(color1, color5, waveUV.x * 2.0);
                    bottomColor = mix(color4, color7, waveUV.x * 2.0);
                } else {
                    topColor = mix(color5, color2, (waveUV.x - 0.5) * 2.0);
                    bottomColor = mix(color7, color3, (waveUV.x - 0.5) * 2.0);
                }
                
                // Add vertical edge influence
                vec3 leftColor, rightColor;
                if (waveUV.y < 0.5) {
                    leftColor = mix(color1, color8, waveUV.y * 2.0);
                    rightColor = mix(color2, color6, waveUV.y * 2.0);
                } else {
                    leftColor = mix(color8, color4, (waveUV.y - 0.5) * 2.0);
                    rightColor = mix(color6, color3, (waveUV.y - 0.5) * 2.0);
                }
                
                // Blend horizontal and vertical interpolations
                vec3 horizontal = mix(topColor, bottomColor, waveUV.y);
                vec3 vertical = mix(leftColor, rightColor, waveUV.x);
                vec3 gradient = mix(horizontal, vertical, 0.5);

                // apply blending mode between the palette anchors
                vec3 blended = blendModeFunc(topColor, bottomColor, blendMode);
                // combine blended result with the gradient; for smooth mode keep gradient
                vec3 finalColor = (blendMode == 0) ? gradient : mix(gradient, blended, 0.85);
        
    // Add some noise for texture (subtle base noise)
    float baseNoise = fract(sin(dot(waveUV, vec2(12.9898, 78.233))) * 43758.5453);
    finalColor += baseNoise * 0.02;
        
        // Apply wave-based color modulation using the base colors
        // Calculate average color from the palette for wave modulation
        vec3 avgColor = (color1 + color2 + color3 + color4 + color5 + color6 + color7 + color8) * 0.125;
        
        // Create subtle wave variations that stay within the color palette
        float waveVariation = sin(wave * 2.0) * 0.1;
        vec3 waveColor = avgColor + waveVariation;
        waveColor = clamp(waveColor, 0.0, 1.0);
        
        // Very subtle influence to preserve original colors
        float waveInfluence = 0.08;
        finalColor = mix(finalColor, waveColor, waveInfluence);
        
        // Apply filmic effects based on selection
        if (filmEffect == 1) {
            // Film noise - improved to prevent diagonal line artifacts
            vec2 baseCoord = uv * 1000.0; // scale to avoid small number precision issues
            float realTime = time / max(waveSpeed, 0.001); // Get real time independent of wave speed
            float timeOffset = floor(realTime * 24.0); // Constant 24fps film grain speed
            
            // Add stronger sub-pixel jitter to completely break any grid alignment
            float jitter1 = fract(sin(dot(baseCoord + timeOffset * 0.123, vec2(78.233, 127.1))) * 43758.5453);
            float jitter2 = fract(sin(dot(baseCoord + timeOffset * 0.456, vec2(183.3, 269.5))) * 43758.5453);
            vec2 jitteredCoord = baseCoord + vec2(jitter1, jitter2) * 2.0; // Increased jitter
            
            // Use completely different coordinate scaling for each noise sample to break patterns
            float r1 = fract(sin(dot(jitteredCoord * 1.0 + timeOffset * 1.0, vec2(127.1, 311.7))) * 43758.5453);
            float r2 = fract(sin(dot(jitteredCoord * 1.3 + timeOffset * 2.7, vec2(269.5, 183.3))) * 43758.5453);
            float r3 = fract(sin(dot(jitteredCoord * 0.7 + timeOffset * 4.3, vec2(419.2, 371.9))) * 43758.5453);
            float r4 = fract(sin(dot(jitteredCoord * 1.7 + timeOffset * 6.1, vec2(521.7, 241.3))) * 43758.5453);
            
            // Average four samples and convert to [-1,1] range
            float noise = (r1 + r2 + r3 + r4) * 0.25 - 0.5;
            
            // Apply additional randomization to break any remaining patterns
            noise *= (0.8 + jitter1 * 0.4); // Vary intensity per pixel
            
            // Use UI-controlled intensity (capped at 0.200)
            finalColor += vec3(noise * min(filmNoiseIntensity, 0.200));
        } else if (filmEffect == 2) {
            // Filmic tone mapping with LUT selection
            finalColor = applyToneMapping(finalColor, toneMappingLUT);
        } else if (filmEffect == 3) {
            // Chromatic aberration - simple RGB channel offset
            float a = caAmount;
            vec2 rOffset = vec2(-a, 0.0);
            vec2 bOffset = vec2(a, 0.0);
            
            // Apply offset to UV coordinates for red and blue channels
            vec2 rUV = clamp(uv + rOffset, 0.0, 1.0);
            vec2 bUV = clamp(uv + bOffset, 0.0, 1.0);
            
            // Simulate the color shift effect
            finalColor.r = mix(finalColor.r, finalColor.r * 0.9, a * 50.0);
            finalColor.b = mix(finalColor.b, finalColor.b * 0.9, a * 50.0);
        } else if (filmEffect == 4) {
            // Bloom - enhanced bright areas
            vec3 bloom = computeBloom(uv, finalColor);
            finalColor = mix(finalColor, bloom, bloomIntensity);
        } else if (filmEffect == 7) {
            // Trail/Motion Blur - ghosting of previous frames
            finalColor = applyTrailBlur(finalColor, uv, trailBlur);
        } else if (filmEffect == 8) {
            // Watercolor Bleeding - soft color bleeding effects
            finalColor = applyWatercolor(finalColor, uv, watercolor);
        } else if (filmEffect == 9) {
            // Glass Morphism - frosted glass effect
            finalColor = applyGlassStripes(finalColor, uv);
        }
        // Note: Lens distortion (5) and pixelation (6) are applied to UV coordinates at the start of main()
        
        // Apply basic image adjustments at the very end
        // Brightness adjustment
        finalColor += brightness;
        
        // Contrast adjustment
        finalColor = (finalColor - 0.5) * contrast + 0.5;
        
        // Saturation adjustment
        float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
        finalColor = mix(vec3(luminance), finalColor, saturation);
        
        // Clamp final color to valid range
        finalColor = clamp(finalColor, 0.0, 1.0);
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

// Presets based on color theory principles
// Presets are now loaded from presets.js

// Function to populate preset options from presets.js
function populatePresetOptions() {
    const presetSelect = document.getElementById('presetSelect');
    if (!presetSelect) {
        console.error('Preset select element not found');
        return;
    }
    
    if (typeof presets === 'undefined') {
        console.error('Presets object not found - make sure presets.js is loaded');
        return;
    }
    
    // Special display name mappings for better readability
    const specialNames = {
        'auroris-borealis': 'Aurora Borealis',
        'film-noir': 'Film Noir',
        'lavender-swirly-swirl': 'Lavender Swirl',
        'bluecurl-shimmer': 'Blue Curl Shimmer',
        'steel-kelp': 'Steel Kelp',
        'galaxy-whirl': 'Galaxy Whirl'
    };
    
    // Helper function to convert preset key to display name
    function formatPresetName(key) {
        // Check if we have a special name mapping
        if (specialNames[key]) {
            return specialNames[key];
        }
        
        // Default formatting: split on hyphens and title case each word
        return key
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    // Get all preset keys and sort them alphabetically by display name
    const presetEntries = Object.keys(presets).map(key => ({
        key: key,
        displayName: formatPresetName(key)
    })).sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    // Add options to the select element
    presetEntries.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.key;
        option.textContent = preset.displayName;
        presetSelect.appendChild(option);
    });
}

function init() {
    canvas = document.getElementById('canvas');
    gl = canvas.getContext('webgl');
    
    if (!gl) {
        alert('WebGL not supported');
        return;
    }
    
    setupShaders();
    setupGeometry();
    updateResolution();
    
    // Populate preset options from presets.js
    populatePresetOptions();
    
    // Start with a randomized palette and sensible parameters on page load
    randomize();
    animate();
    
    // Add window resize listener
    window.addEventListener('resize', handleWindowResize);
    
    // Add keyboard shortcuts for fullscreen
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F11' || (e.key === 'f' && e.ctrlKey)) {
            e.preventDefault();
            toggleFullscreenPreview();
        }
        if (e.key === 'Escape' && canvas.classList.contains('fullscreen-preview')) {
            toggleFullscreenPreview();
        }
    });
    
    // Initialize floating panel functionality
    initializeFloatingPanel();
    
    // Start in fullscreen preview mode by default
    toggleFullscreenPreview();

    // Ensure overlay contrast matches initial palette
    if (typeof updateOverlayContrast === 'function') updateOverlayContrast();
}

// Floating panel functionality
function initializeFloatingPanel() {
    const panel = document.getElementById('floatingPanel');
    const titlebar = document.getElementById('panelTitlebar');
    const resizeHandle = document.getElementById('resizeHandle');
    
    let isDragging = false;
    let isResizing = false;
    let dragStartX, dragStartY, initialPanelX, initialPanelY;
    let resizeStartX, resizeStartY, initialWidth, initialHeight;
    
    // Dragging functionality
    titlebar.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('panel-btn')) return; // Don't drag when clicking buttons
        
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        const rect = panel.getBoundingClientRect();
        initialPanelX = rect.left;
        initialPanelY = rect.top;
        
        e.preventDefault();
    });
    
    // Resizing functionality
    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        
        const rect = panel.getBoundingClientRect();
        initialWidth = rect.width;
        initialHeight = rect.height;
        
        e.preventDefault();
    });
    
    // Mouse move handler
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;
            
            const newX = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, initialPanelX + deltaX));
            const newY = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, initialPanelY + deltaY));
            
            panel.style.left = newX + 'px';
            panel.style.top = newY + 'px';
        }
        
        if (isResizing) {
            const deltaX = e.clientX - resizeStartX;
            const deltaY = e.clientY - resizeStartY;
            
            const newWidth = Math.max(380, Math.min(window.innerWidth * 0.9, initialWidth + deltaX));
            const newHeight = Math.max(200, Math.min(window.innerHeight * 0.95, initialHeight + deltaY));
            
            panel.style.width = newWidth + 'px';
            panel.style.height = newHeight + 'px';
            
            // Update panel layout classes based on width
            updatePanelLayoutClasses(panel, newWidth);
        }
    });
    
    // Mouse up handler
    document.addEventListener('mouseup', () => {
        isDragging = false;
        isResizing = false;
    });
    
    // Initialize panel layout classes
    const panelInitialWidth = panel.getBoundingClientRect().width;
    updatePanelLayoutClasses(panel, panelInitialWidth);
    console.log(`Initial panel setup: width=${panelInitialWidth}px`);
}

// Update panel layout classes based on width
function updatePanelLayoutClasses(panel, width) {
    // Remove all layout classes
    panel.classList.remove('panel-narrow', 'panel-wide');
    
    // Apply appropriate class based on width
    if (width <= 500) {
        panel.classList.add('panel-narrow');
        console.log(`Panel width: ${width}px - NARROW (stacking)`);
    } else {
        panel.classList.add('panel-wide');
        console.log(`Panel width: ${width}px - WIDE (masonry)`);
    }
}

// Toggle panel visibility
function togglePanel() {
    const panel = document.getElementById('floatingPanel');
    const titlebar = document.getElementById('panelTitlebar');
    const collapseBtn = document.getElementById('collapseBtn');
    const collapseIconUse = collapseBtn ? collapseBtn.querySelector('use') : null;
    const collapsing = !panel.classList.contains('panel-collapsed');

    if (collapsing) {
        // Measure exact titlebar height and lock the panel to that height
        const h = titlebar.offsetHeight; // includes borders
        panel.style.height = h + 'px';
        panel.style.overflow = 'hidden';
    panel.style.minHeight = '0px';
    panel.style.maxHeight = 'none';
        panel.classList.add('panel-collapsed');
        if (collapseBtn && collapseIconUse) {
            collapseIconUse.setAttribute('href', '#icon-plus');
            collapseIconUse.setAttribute('xlink:href', '#icon-plus');
            collapseBtn.setAttribute('aria-label','Expand');
        }
    } else {
        // Restore auto height and let CSS/JS manage layout again
        panel.classList.remove('panel-collapsed');
        panel.style.height = 'auto';
    panel.style.overflow = '';
    panel.style.minHeight = '';
    panel.style.maxHeight = '';
        if (collapseBtn && collapseIconUse) {
            collapseIconUse.setAttribute('href', '#icon-minus');
            collapseIconUse.setAttribute('xlink:href', '#icon-minus');
            collapseBtn.setAttribute('aria-label','Collapse');
        }
    }
}

function handleWindowResize() {
    // Immediate update for responsive feel
    updateResolution();
    
    // Debounce for performance during continuous resize
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        updateResolution(); // Final adjustment after resize stops
    }, 100);
}

function setupShaders() {
    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program linking error:', gl.getProgramInfoLog(program));
        return;
    }
    
    gl.useProgram(program);
    
    // Get uniform locations
    uniforms.resolution = gl.getUniformLocation(program, 'resolution');
    uniforms.time = gl.getUniformLocation(program, 'time');
    uniforms.waveSpeed = gl.getUniformLocation(program, 'waveSpeed');
    uniforms.waveCount = gl.getUniformLocation(program, 'waveCount');
    uniforms.waveAmplitude = gl.getUniformLocation(program, 'waveAmplitude');
    uniforms.waveFrequency = gl.getUniformLocation(program, 'waveFrequency');
    uniforms.waveZoom = gl.getUniformLocation(program, 'waveZoom');
    uniforms.waveTwirl = gl.getUniformLocation(program, 'waveTwirl');
    uniforms.twirlSources = gl.getUniformLocation(program, 'twirlSources');
    uniforms.twirlLocation = gl.getUniformLocation(program, 'twirlLocation');
    uniforms.twirlSeedX = gl.getUniformLocation(program, 'twirlSeedX');
    uniforms.twirlSeedY = gl.getUniformLocation(program, 'twirlSeedY');
    uniforms.turbulenceIntensity = gl.getUniformLocation(program, 'turbulenceIntensity');
    uniforms.noiseDisplacement = gl.getUniformLocation(program, 'noiseDisplacement');
    uniforms.phaseRandomness = gl.getUniformLocation(program, 'phaseRandomness');
    uniforms.amplitudeVariation = gl.getUniformLocation(program, 'amplitudeVariation');
    uniforms.directionDrift = gl.getUniformLocation(program, 'directionDrift');
    uniforms.color1 = gl.getUniformLocation(program, 'color1');
    uniforms.color2 = gl.getUniformLocation(program, 'color2');
    uniforms.color3 = gl.getUniformLocation(program, 'color3');
    uniforms.color4 = gl.getUniformLocation(program, 'color4');
    uniforms.color5 = gl.getUniformLocation(program, 'color5');
    uniforms.color6 = gl.getUniformLocation(program, 'color6');
    uniforms.color7 = gl.getUniformLocation(program, 'color7');
    uniforms.color8 = gl.getUniformLocation(program, 'color8');
    uniforms.blendMode = gl.getUniformLocation(program, 'blendMode');
    uniforms.filmEffect = gl.getUniformLocation(program, 'filmEffect');
    uniforms.filmNoiseIntensity = gl.getUniformLocation(program, 'filmNoiseIntensity');
    uniforms.bloomIntensity = gl.getUniformLocation(program, 'bloomIntensity');
    uniforms.caAmount = gl.getUniformLocation(program, 'caAmount');
    uniforms.lensDistortion = gl.getUniformLocation(program, 'lensDistortion');
    uniforms.pixelationSize = gl.getUniformLocation(program, 'pixelationSize');
    uniforms.trailBlur = gl.getUniformLocation(program, 'trailBlur');
    uniforms.watercolor = gl.getUniformLocation(program, 'watercolor');
    uniforms.glassStripesIntensity = gl.getUniformLocation(program, 'glassStripesIntensity');
    uniforms.glassStripesFrequency = gl.getUniformLocation(program, 'glassStripesFrequency');
    uniforms.glassStripesDirection = gl.getUniformLocation(program, 'glassStripesDirection');
    uniforms.glassStripesDistortion = gl.getUniformLocation(program, 'glassStripesDistortion');
    uniforms.toneMappingLUT = gl.getUniformLocation(program, 'toneMappingLUT');
    uniforms.brightness = gl.getUniformLocation(program, 'brightness');
    uniforms.contrast = gl.getUniformLocation(program, 'contrast');
    uniforms.saturation = gl.getUniformLocation(program, 'saturation');
}

function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program linking error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    
    return program;
}

function getUniformLocations(gl, program) {
    return {
        resolution: gl.getUniformLocation(program, 'resolution'),
        time: gl.getUniformLocation(program, 'time'),
        waveSpeed: gl.getUniformLocation(program, 'waveSpeed'),
        blendMode: gl.getUniformLocation(program, 'blendMode'),
        filmEffect: gl.getUniformLocation(program, 'filmEffect'),
        filmNoiseIntensity: gl.getUniformLocation(program, 'filmNoiseIntensity'),
        bloomIntensity: gl.getUniformLocation(program, 'bloomIntensity'),
        caAmount: gl.getUniformLocation(program, 'caAmount'),
        lensDistortion: gl.getUniformLocation(program, 'lensDistortion'),
        pixelationSize: gl.getUniformLocation(program, 'pixelationSize'),
        trailBlur: gl.getUniformLocation(program, 'trailBlur'),
        watercolor: gl.getUniformLocation(program, 'watercolor'),
        toneMappingLUT: gl.getUniformLocation(program, 'toneMappingLUT'),
        glassStripesIntensity: gl.getUniformLocation(program, 'glassStripesIntensity'),
        glassStripesFrequency: gl.getUniformLocation(program, 'glassStripesFrequency'),
        glassStripesDirection: gl.getUniformLocation(program, 'glassStripesDirection'),
        glassStripesDistortion: gl.getUniformLocation(program, 'glassStripesDistortion'),
        waveCount: gl.getUniformLocation(program, 'waveCount'),
        waveAmplitude: gl.getUniformLocation(program, 'waveAmplitude'),
        waveFrequency: gl.getUniformLocation(program, 'waveFrequency'),
        waveZoom: gl.getUniformLocation(program, 'waveZoom'),
        waveTwirl: gl.getUniformLocation(program, 'waveTwirl'),
        twirlSources: gl.getUniformLocation(program, 'twirlSources'),
        twirlLocation: gl.getUniformLocation(program, 'twirlLocation'),
        twirlSeedX: gl.getUniformLocation(program, 'twirlSeedX'),
        twirlSeedY: gl.getUniformLocation(program, 'twirlSeedY'),
        turbulenceIntensity: gl.getUniformLocation(program, 'turbulenceIntensity'),
        noiseDisplacement: gl.getUniformLocation(program, 'noiseDisplacement'),
        phaseRandomness: gl.getUniformLocation(program, 'phaseRandomness'),
        amplitudeVariation: gl.getUniformLocation(program, 'amplitudeVariation'),
        directionDrift: gl.getUniformLocation(program, 'directionDrift'),
        color1: gl.getUniformLocation(program, 'color1'),
        color2: gl.getUniformLocation(program, 'color2'),
        color3: gl.getUniformLocation(program, 'color3'),
        color4: gl.getUniformLocation(program, 'color4'),
        color5: gl.getUniformLocation(program, 'color5'),
        color6: gl.getUniformLocation(program, 'color6'),
        color7: gl.getUniformLocation(program, 'color7'),
        color8: gl.getUniformLocation(program, 'color8'),
        brightness: gl.getUniformLocation(program, 'brightness'),
        contrast: gl.getUniformLocation(program, 'contrast'),
        saturation: gl.getUniformLocation(program, 'saturation')
    };
}

function setupGeometry() {
    const vertices = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1
    ]);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
}

function updateResolution() {
    const resolution = document.getElementById('resolution').value.split(',');
    const width = parseInt(resolution[0]);
    const height = parseInt(resolution[1]);
    
    canvas.width = width;
    canvas.height = height;
    
    // Determine if resolution is mobile or desktop based on aspect ratio
    const isMobileResolution = height > width; // Portrait = mobile, Landscape = desktop
    
    // Switch wireframes based on resolution orientation
    const laptopWireframe = document.querySelector('.laptop-wireframe');
    const mobileWireframe = document.querySelector('.mobile-wireframe');
    
    if (isMobileResolution) {
        // Show mobile wireframe for portrait resolutions
        if (laptopWireframe) laptopWireframe.style.opacity = '0';
        if (mobileWireframe) mobileWireframe.style.opacity = '0.8';
        console.log('Switched to mobile wireframe for portrait resolution');
    } else {
        // Show laptop wireframe for landscape resolutions
        if (laptopWireframe) laptopWireframe.style.opacity = '0.8';
        if (mobileWireframe) mobileWireframe.style.opacity = '0';
        console.log('Switched to laptop wireframe for landscape resolution');
    }
    
    // Check if we're in fullscreen preview mode
    const isFullscreen = canvas.classList.contains('fullscreen-preview') || 
                        document.querySelector('.canvas-container').classList.contains('fullscreen-preview');
    
    // Debug: Check if wireframes exist
    console.log('Wireframes found:', {
        laptop: !!laptopWireframe,
        mobile: !!mobileWireframe,
        isMobileResolution: isMobileResolution,
        resolution: `${width}x${height}`
    });
    
    if (isFullscreen) {
        // Fullscreen mode: Hide wireframes immediately and reset canvas styling
        if (laptopWireframe) {
            laptopWireframe.style.transition = 'none'; // Disable transition for instant hide
            laptopWireframe.style.opacity = '0';
        }
        if (mobileWireframe) {
            mobileWireframe.style.transition = 'none'; // Disable transition for instant hide
            mobileWireframe.style.opacity = '0';
        }
        
        // Reset canvas styles for fullscreen
        canvas.style.borderRadius = '';
        canvas.style.overflow = '';
        canvas.style.transition = '';
        
        console.log('Fullscreen mode - letting CSS handle sizing');
    } else {
        // Non-fullscreen mode: Position canvas to align with wireframe screens
        console.log('Wireframe mode - calculating positioning');
        
        // Restore wireframe transitions for smooth fade-in
        if (laptopWireframe) laptopWireframe.style.transition = '';
        if (mobileWireframe) mobileWireframe.style.transition = '';
        
        // Use resolution orientation instead of screen width for wireframe detection
        const usingMobileWireframe = isMobileResolution;
        
        // Define screen areas within the wireframes based on actual SVG coordinates
        let screenArea;
        if (usingMobileWireframe) {
            // Mobile screen area within mobile.svg (viewBox: 0 0 387.341766 754.632935)
            // Screen area is roughly between the bezels at coordinates 33-354 x 69-686
            screenArea = {
                widthPercent: 1,    // (354-33)/387 ≈ 0.83
                heightPercent: 0.742,   // (686-69)/754 ≈ 0.82  
                offsetXPercent: 0, // 33/387 ≈ 0.085
                offsetYPercent: 0.131  // 69/754 ≈ 0.091
            };
        } else {
            // Laptop screen area within laptop.svg (viewBox: 0 0 1246.780029 754.630005)
            // Screen area is roughly between the bezels at coordinates 140-1106 x 40-653
            screenArea = {
                widthPercent: 0.775,   // (1106-140)/1246 ≈ 0.775
                heightPercent: 0.811,  // (653-40)/754 ≈ 0.813
                offsetXPercent: 0.113, // 140/1246 ≈ 0.112
                offsetYPercent: 0.045  // 40/754 ≈ 0.053
            };
        }
        
        // Calculate wireframe dimensions based on CSS constraints
        // The wireframe CSS uses: height: 90vh; width: auto; max-width: 95vw;
        // So it's either height-constrained (90vh) or width-constrained (95vw)
        
        // Calculate wireframe width based on aspect ratio and height constraint
        let wireframeAspectRatio;
        if (usingMobileWireframe) {
            // Mobile SVG aspect ratio: 387.341766 / 754.632935 ≈ 0.513
            wireframeAspectRatio = 0.513; 
        } else {
            // Laptop SVG aspect ratio: 1246.780029 / 754.630005 ≈ 1.652
            wireframeAspectRatio = 1.652; 
        }
        
        // Calculate potential wireframe dimensions
        const maxWireframeHeight = window.innerHeight * 0.9; // 90vh
        const maxWireframeWidthByHeight = maxWireframeHeight * wireframeAspectRatio;
        const maxWireframeWidthByViewport = window.innerWidth * 0.95; // 95vw
        
        // The actual wireframe size is limited by whichever constraint is smaller
        let actualWireframeWidth, actualWireframeHeight;
        
        if (maxWireframeWidthByHeight <= maxWireframeWidthByViewport) {
            // Height-constrained: wireframe fits within height, width scales proportionally
            actualWireframeWidth = maxWireframeWidthByHeight;
            actualWireframeHeight = maxWireframeHeight;
        } else {
            // Width-constrained: wireframe is limited by viewport width
            actualWireframeWidth = maxWireframeWidthByViewport;
            actualWireframeHeight = actualWireframeWidth / wireframeAspectRatio;
        }
        
        // Calculate available screen area within wireframe using actual dimensions
        const availableScreenWidth = actualWireframeWidth * screenArea.widthPercent;
        const availableScreenHeight = actualWireframeHeight * screenArea.heightPercent;
        
        // Calculate scale to fit canvas in available screen area
        const scaleX = availableScreenWidth / width;
        const scaleY = availableScreenHeight / height;
        const displayScale = Math.min(scaleX, scaleY);
        
        // Calculate final canvas size with device-specific adjustments
        let canvasDisplayWidth = width * displayScale;
        let canvasDisplayHeight = height * displayScale;
        
        // Device-specific styling adjustments
        if (!usingMobileWireframe) {
            // For laptop/desktop: make canvas taller and narrower
            canvasDisplayWidth *= 1; 
            canvasDisplayHeight *= 1.15; // Increase height by 15%
        } else {
            // For mobile: increase height and add fine-tuning for width
            canvasDisplayHeight *= 1.25; // Increase mobile canvas height by 25%
            canvasDisplayWidth += 4; // Add 4px total width (2px on each side)
        }
        
        // Calculate position to center canvas in wireframe screen area using actual dimensions
        const wireframeLeft = (window.innerWidth - actualWireframeWidth) / 2;
        const wireframeTop = (window.innerHeight - actualWireframeHeight) / 2;
        
        const screenLeft = wireframeLeft + (actualWireframeWidth * screenArea.offsetXPercent);
        const screenTop = wireframeTop + (actualWireframeHeight * screenArea.offsetYPercent);
        
        const canvasLeft = screenLeft + (availableScreenWidth - canvasDisplayWidth) / 2;
        const canvasTop = screenTop + (availableScreenHeight - canvasDisplayHeight) / 2;
        
        // Apply calculated positioning and styling
        canvas.style.width = canvasDisplayWidth + 'px';
        canvas.style.height = canvasDisplayHeight + 'px';
        canvas.style.position = 'absolute';
        canvas.style.left = canvasLeft + 'px';
        canvas.style.top = canvasTop + 'px';
        canvas.style.transform = 'none';
        canvas.style.zIndex = '3';
        canvas.style.transition = 'left 0.15s ease, top 0.15s ease, width 0.15s ease, height 0.15s ease'; // Faster transitions
        
        // Add desktop-specific border radius for laptop screen effect
        if (!usingMobileWireframe) {
            canvas.style.borderRadius = '16px 16px 0px 0px'; // Rounded top, slightly rounded bottom
            canvas.style.overflow = 'hidden'; // Ensure content respects border radius
        } else {
            canvas.style.borderRadius = '52px'; // Mobile gets uniform rounded corners
            canvas.style.overflow = 'hidden';
        }
        
        console.log('Canvas positioned:', {
            width: canvasDisplayWidth,
            height: canvasDisplayHeight,
            left: canvasLeft,
            top: canvasTop,
            wireframeWidth: actualWireframeWidth,
            wireframeHeight: actualWireframeHeight,
            constrainedBy: maxWireframeWidthByHeight <= maxWireframeWidthByViewport ? 'height' : 'width'
        });
    }
    
    gl.viewport(0, 0, width, height);
    gl.uniform2f(uniforms.resolution, width, height);
    
    // Update overlay position after canvas positioning completes
    // Use a longer delay to ensure wireframe transitions are complete
    setTimeout(() => {
        waitForCanvasPosition(updatePaletteNamePosition);
    }, 50);
}

function toggleFullscreenPreview() {
    const canvas = document.getElementById('canvas');
    const body = document.body;
    const container = document.querySelector('.canvas-container');
    const isFullscreen = body.classList.contains('fullscreen-mode');
    
    if (isFullscreen) {
        // Exit fullscreen preview
        body.classList.remove('fullscreen-mode');
        container.classList.remove('fullscreen-preview');
        canvas.classList.remove('fullscreen-preview');
        
        updateResolution(); // Return to wireframe positioning
        // Additional delay to ensure all transitions complete
        setTimeout(() => {
            waitForCanvasPosition(updatePaletteNamePosition);
        }, 100);
    } else {
        // Enter fullscreen preview
        body.classList.add('fullscreen-mode');
        container.classList.add('fullscreen-preview');
        canvas.classList.add('fullscreen-preview');
        
        // Clear any inline styles that might interfere
        canvas.style.position = '';
        canvas.style.left = '';
        canvas.style.top = '';
        canvas.style.transform = '';
        canvas.style.zIndex = '';
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.style.borderRadius = ''; // Clear border radius for fullscreen
        canvas.style.overflow = ''; // Clear overflow setting
        canvas.style.transition = ''; // Clear transitions for fullscreen
        
        // Update palette overlay position for fullscreen
        updatePaletteNamePosition(); // Immediate update
        setTimeout(updatePaletteNamePosition, 10); // Delayed update for DOM changes
    }
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
}

// ----- Color helpers (HSL <-> HEX) -----
function hslToRgb(h, s, l) {
    h = h / 360;
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r, g, b) {
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hslToHex(h, s, l) {
    const [r, g, b] = hslToRgb(h, s, l);
    return rgbToHex(r, g, b);
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/**
 * generateMidpointColor(color1, color2)
 * Returns a hex color that is the simple midpoint (average) between
 * two input hex colors. Used to populate the 4 edge midpoint color
 * controls automatically from the corner colors.
 */
function generateMidpointColor(color1, color2) {
    if (!color1 || !color2) return '#808080'; // fallback gray
    
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);
    
    const rMid = Math.round((r1 + r2) / 2);
    const gMid = Math.round((g1 + g2) / 2);
    const bMid = Math.round((b1 + b2) / 2);
    
    return rgbToHex(rMid, gMid, bMid);
}

// Expanded palette name generation with comprehensive color analysis
function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    
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
    
    return [h * 360, s, l];
}

function analyzeColors(colors) {
    const hslColors = colors.map(hexToHsl);
    const avgLightness = hslColors.reduce((sum, hsl) => sum + hsl[2], 0) / hslColors.length;
    const avgSaturation = hslColors.reduce((sum, hsl) => sum + hsl[1], 0) / hslColors.length;
    
    // More sophisticated hue analysis
    const hues = hslColors.map(hsl => hsl[0]);
    const dominantHue = hues.reduce((a, b) => a + b, 0) / hues.length;
    
    // Check for specific color families
    const redCount = hues.filter(h => h >= 345 || h < 15).length;
    const orangeCount = hues.filter(h => h >= 15 && h < 45).length;
    const yellowCount = hues.filter(h => h >= 45 && h < 75).length;
    const greenCount = hues.filter(h => h >= 75 && h < 165).length;
    const blueCount = hues.filter(h => h >= 165 && h < 285).length;
    const purpleCount = hues.filter(h => h >= 285 && h < 345).length;
    
    return {
        lightness: avgLightness,
        saturation: avgSaturation,
        dominantHue: dominantHue,
        isWarm: dominantHue < 60 || dominantHue > 300,
        isCool: dominantHue >= 120 && dominantHue <= 300,
        colorCounts: { red: redCount, orange: orangeCount, yellow: yellowCount, green: greenCount, blue: blueCount, purple: purpleCount }
    };
}

function updateBackgroundGradient(color1, color2, color3, color4) {
    const container = document.querySelector('.canvas-container');
    if (container) {
        // Create a more visible gradient using the current palette colors
        const gradient = `linear-gradient(135deg, ${color1}60, ${color2}60, ${color3}60, ${color4}60)`;
        container.style.background = gradient;
        container.style.backgroundSize = '400% 400%';
    }
}

function waitForCanvasPosition(callback, maxAttempts = 10) {
    let attempts = 0;
    let lastRect = null;
    
    function checkPosition() {
        const canvas = document.getElementById('canvas');
        if (!canvas) {
            if (callback) callback();
            return;
        }
        
        const currentRect = canvas.getBoundingClientRect();
        const rectString = `${currentRect.left},${currentRect.top},${currentRect.width},${currentRect.height}`;
        
        if (lastRect === rectString || attempts >= maxAttempts) {
            // Canvas position has stabilized or max attempts reached
            if (callback) callback();
            return;
        }
        
        lastRect = rectString;
        attempts++;
        
        // Check again in 20ms
        setTimeout(checkPosition, 20);
    }
    
    checkPosition();
}

// Track the current overlay layout state to avoid unnecessary transitions
let currentOverlayState = null;

function updatePaletteNamePosition() {
    const overlay = document.querySelector('.overlay-container');
    const creditsLinks = document.querySelector('.credits-links');
    const canvas = document.getElementById('canvas');
    const resolutionSelect = document.getElementById('resolution');
    
    if (overlay && canvas && resolutionSelect) {
        // Force a fresh read of the current resolution
        const resolution = resolutionSelect.value.split(',');
        const width = parseInt(resolution[0]);
        const height = parseInt(resolution[1]);
        const isMobileResolution = height > width;
        const isFullscreen = canvas.classList.contains('fullscreen-preview') || 
                            document.querySelector('.canvas-container').classList.contains('fullscreen-preview');
        
        // Create a state key to detect layout changes
        const newState = `${isFullscreen ? 'fullscreen' : 'wireframe'}-${isMobileResolution ? 'mobile' : 'desktop'}`;
        const isLayoutChange = currentOverlayState !== newState;
        currentOverlayState = newState;
        
        // Debug: Log current state
        console.log('Overlay positioning:', {
            isMobileResolution,
            isFullscreen,
            resolution: `${width}x${height}`,
            canvasRect: canvas.getBoundingClientRect(),
            isLayoutChange
        });
        
        if (isLayoutChange) {
            // Layout is changing - use fade transition
            // Faster fade for fullscreen transitions to match canvas speed
            const fadeDelay = isFullscreen ? 50 : 150; // Quick fade for fullscreen, normal for wireframe changes
            overlay.style.opacity = '0';
            
            setTimeout(() => {
                applyOverlayPositioning();
                overlay.style.opacity = '';
            }, fadeDelay);
        } else {
            // Same layout - just update position immediately
            applyOverlayPositioning();
        }
        
        function applyOverlayPositioning() {
            // Get fresh canvas position
            const rect = canvas.getBoundingClientRect();
            
            // Clear any previous inline styles to reset state
            overlay.style.transform = '';
            overlay.style.transformOrigin = '';
            if (creditsLinks) {
                creditsLinks.style.flexDirection = '';
                creditsLinks.style.gap = '';
                creditsLinks.style.alignItems = '';
            }
            
            // Apply positioning based on current state
            if (!isFullscreen && isMobileResolution) {
                // Mobile wireframe mode: rotate the entire overlay 90 degrees clockwise
                overlay.style.left = (rect.right - 65) + 'px';
                overlay.style.top = (rect.bottom - 15) + 'px';
                overlay.style.transform = 'translate(-100%, -100%) rotate(90deg)'; 
                overlay.style.transformOrigin = 'bottom right';
                overlay.style.gap = '10px';
                
                if (creditsLinks) {
                    creditsLinks.style.flexDirection = 'row';
                    creditsLinks.style.gap = '8px';
                    creditsLinks.style.alignItems = 'center';
                }
                console.log('Applied mobile wireframe positioning');
            } else {
                // Desktop wireframe mode or fullscreen: normal horizontal layout
                overlay.style.left = (rect.right - 20) + 'px';
                overlay.style.top = (rect.bottom - 20) + 'px';
                overlay.style.transform = 'translate(-100%, -100%)';
                overlay.style.transformOrigin = '';
                overlay.style.gap = '10px';
                
                if (creditsLinks) {
                    creditsLinks.style.flexDirection = 'row';
                    creditsLinks.style.gap = '8px';
                    creditsLinks.style.alignItems = 'center';
                }
                console.log('Applied desktop/fullscreen positioning');
            }
        }
    }
}

// Calculate perceptual color distance (Delta E approximation)
function getColorDistance(hex1, hex2) {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    
    // Convert to LAB-like perceptual space for better distance calculation
    const deltaR = rgb1[0] - rgb2[0];
    const deltaG = rgb1[1] - rgb2[1];
    const deltaB = rgb1[2] - rgb2[2];
    
    // Weighted distance that accounts for human perception
    return Math.sqrt(2 * deltaR * deltaR + 4 * deltaG * deltaG + 3 * deltaB * deltaB);
}

// Check if a color palette has sufficient contrast for visibility
function hasMinimumContrast(colors, minDistance = 0.15) {
    for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
            const distance = getColorDistance(colors[i], colors[j]);
            if (distance < minDistance) {
                return false;
            }
        }
    }
    return true;
}

function updatePaletteName(name) {
    const overlay = document.getElementById('paletteNameOverlay');
    if (overlay) {
        overlay.textContent = name;
        updatePaletteNamePosition();
    }
}

// Generate a 4-color palette using a color-theory scheme.
// scheme: 'analogous' or 'complementary'. dark boolean reduces lightness.
function generatePalette({ scheme = 'analogous', dark = false } = {}) {
    const baseHue = Math.floor(Math.random() * 360);
    const sat = clamp(0.55 + Math.random() * 0.25, 0.35, 0.85); // saturation
    const light = dark ? (0.12 + Math.random() * 0.18) : (0.40 + Math.random() * 0.25);
    
    // Check current zoom level and twirl intensity to determine minimum contrast needed
    const currentZoom = document.getElementById('waveZoom') ? parseFloat(document.getElementById('waveZoom').value) : 2.0;
    const currentTwirl = document.getElementById('waveTwirl') ? parseFloat(document.getElementById('waveTwirl').value) : 0.05;
    
    const isZoomedIn = currentZoom < 2.0;
    const isZoomedOut = currentZoom > 8.0;
    const isHighTwirl = currentTwirl > 0.12;
    const isExtremeSettings = (isZoomedOut && isHighTwirl) || (currentZoom > 10.0) || (currentTwirl > 0.15);
    
    // Higher contrast needed for extreme settings where effects obscure color differences
    let minContrast = 0.15; // default
    if (isZoomedIn) minContrast = 0.25; // zoomed in needs more contrast
    if (isExtremeSettings) minContrast = 0.35; // extreme zoom out + high twirl needs much more contrast
    else if (isZoomedOut || isHighTwirl) minContrast = 0.28; // moderate increase for one extreme
    
    let attempts = 0;
    let colors;
    
    // Try generating palettes until we get sufficient contrast
    do {
        let hues = [];
        
        if (scheme === 'complementary') {
            // Paired complementary with small offsets for variety
            hues = [baseHue, (baseHue + 180) % 360, (baseHue + 30) % 360, (baseHue + 210) % 360];
        } else {
            // analogous: create more interesting spreads that avoid monotony
            let spread = 25; // increased default spread
            if (isZoomedIn) spread = 50; // wider spread when zoomed in
            if (isExtremeSettings) spread = 70; // even wider for extreme settings
            else if (isZoomedOut || isHighTwirl) spread = 40; // moderate increase
            
            // Create a more varied spread pattern to avoid similar colors
            const spreadPattern = [0, spread * 0.7, spread * 1.3, spread * 0.4];
            hues = spreadPattern.map(offset => (baseHue + offset) % 360);
        }

        // Create more diverse saturation and lightness values for better color separation
        colors = hues.map((h, i) => {
            // Vary saturation more dramatically to avoid monotone results
            let sVariation = 0.2; // default saturation variation
            if (isExtremeSettings) sVariation = 0.35;
            else if (isZoomedOut || isHighTwirl) sVariation = 0.25;
            
            const s = clamp(sat + (Math.random() - 0.5) * sVariation, 0.15, 0.95);
            
            // Create intentional lightness spread - ensure we get light, medium, and dark variants
            let targetLight;
            if (dark) {
                // For dark palettes, create a range from very dark to medium-dark
                const lightLevels = [0.08, 0.18, 0.28, 0.35]; // very dark, dark, medium-dark, lighter-dark
                targetLight = lightLevels[i % 4];
            } else {
                // For normal palettes, create a wider spread from medium to bright
                const lightLevels = [0.25, 0.45, 0.65, 0.80]; // medium-dark, medium, bright, very bright
                targetLight = lightLevels[i % 4];
            }
            
            // Add some randomness but keep the intentional separation
            let lightVariation = 0.08; // default
            if (isZoomedIn) lightVariation = 0.12;
            if (isExtremeSettings) lightVariation = 0.15;
            else if (isZoomedOut || isHighTwirl) lightVariation = 0.10;
            
            const l = clamp(targetLight + (Math.random() - 0.5) * lightVariation, 0.05, 0.95);
            return hslToHex(h, s, l);
        });
        
        attempts++;
    } while (!hasMinimumContrast(colors, minContrast) && attempts < 10);
    
    return colors;
}

/**
 * updateUniforms()
 * Reads the current UI control values and uploads them to the shader
 * via uniform bindings. Also updates small UI value displays and
 * refreshes the background gradient preview.
 */
function updateUniforms() {
    // Update value displays
    document.getElementById('waveCountValue').textContent = document.getElementById('waveCount').value;
    document.getElementById('waveAmplitudeValue').textContent = parseFloat(document.getElementById('waveAmplitude').value).toFixed(2);
    document.getElementById('waveZoomValue').textContent = parseFloat(document.getElementById('waveZoom').value).toFixed(1);
    document.getElementById('waveFrequencyValue').textContent = parseFloat(document.getElementById('waveFrequency').value).toFixed(1);
    document.getElementById('waveTwirlValue').textContent = parseFloat(document.getElementById('waveTwirl').value).toFixed(3);
    document.getElementById('twirlSourcesValue').textContent = document.getElementById('twirlSources').value;
    document.getElementById('waveSpeedValue').textContent = parseFloat(document.getElementById('waveSpeed').value).toFixed(1);
    document.getElementById('turbulenceValue').textContent = parseFloat(document.getElementById('turbulence').value).toFixed(2);
    document.getElementById('noiseDisplacementValue').textContent = parseFloat(document.getElementById('noiseDisplacement').value).toFixed(2);
    document.getElementById('phaseRandomnessValue').textContent = parseFloat(document.getElementById('phaseRandomness').value).toFixed(1);
    document.getElementById('amplitudeVariationValue').textContent = parseFloat(document.getElementById('amplitudeVariation').value).toFixed(2);
    document.getElementById('directionDriftValue').textContent = parseFloat(document.getElementById('directionDrift').value).toFixed(1);
    document.getElementById('brightnessValue').textContent = parseFloat(document.getElementById('brightness').value).toFixed(2);
    document.getElementById('contrastValue').textContent = parseFloat(document.getElementById('contrast').value).toFixed(2);
    document.getElementById('saturationValue').textContent = parseFloat(document.getElementById('saturation').value).toFixed(2);
    
    // Get current colors
    const currentColor1 = document.getElementById('color1').value;
    const currentColor2 = document.getElementById('color2').value;
    const currentColor3 = document.getElementById('color3').value;
    const currentColor4 = document.getElementById('color4').value;
    
    // Update background gradient with current colors
    updateBackgroundGradient(currentColor1, currentColor2, currentColor3, currentColor4);
    
    // Film effect handling
    const filmEffectVal = parseInt(document.getElementById('filmEffect').value);
    
    // Update value displays for film effects
    const filmIntensityEl = document.getElementById('filmNoiseIntensity');
    if (filmIntensityEl) {
        document.getElementById('filmNoiseIntensityValue').textContent = parseFloat(filmIntensityEl.value).toFixed(3);
    }
    const bloomIntensityEl = document.getElementById('bloomIntensity');
    if (bloomIntensityEl) {
        document.getElementById('bloomIntensityValue').textContent = parseFloat(bloomIntensityEl.value).toFixed(2);
    }
    const caAmountEl = document.getElementById('caAmount');
    if (caAmountEl) {
        document.getElementById('caAmountValue').textContent = parseFloat(caAmountEl.value).toFixed(3);
    }
    const lensDistortionEl = document.getElementById('lensDistortion');
    if (lensDistortionEl) {
        document.getElementById('lensDistortionValue').textContent = parseFloat(lensDistortionEl.value).toFixed(2);
    }
    const pixelationSizeEl = document.getElementById('pixelationSize');
    if (pixelationSizeEl) {
        document.getElementById('pixelationSizeValue').textContent = parseFloat(pixelationSizeEl.value).toFixed(1);
    }
    const trailBlurEl = document.getElementById('trailBlur');
    if (trailBlurEl) {
        document.getElementById('trailBlurValue').textContent = parseFloat(trailBlurEl.value).toFixed(2);
    }
    const watercolorEl = document.getElementById('watercolor');
    if (watercolorEl) {
        document.getElementById('watercolorValue').textContent = parseFloat(watercolorEl.value).toFixed(2);
    }
    const glassStripesIntensityEl = document.getElementById('glassStripesIntensity');
    if (glassStripesIntensityEl) {
        document.getElementById('glassStripesIntensityValue').textContent = parseFloat(glassStripesIntensityEl.value).toFixed(1);
    }
    const glassStripesFrequencyEl = document.getElementById('glassStripesFrequency');
    if (glassStripesFrequencyEl) {
        document.getElementById('glassStripesFrequencyValue').textContent = parseInt(glassStripesFrequencyEl.value);
    }
    const glassStripesDistortionEl = document.getElementById('glassStripesDistortion');
    if (glassStripesDistortionEl) {
        document.getElementById('glassStripesDistortionValue').textContent = parseFloat(glassStripesDistortionEl.value).toFixed(1);
    }
    
    // Show/hide controls based on selected effect
    const filmNoiseControl = document.getElementById('filmNoiseControl');
    const bloomControl = document.getElementById('bloomControl');
    const caControl = document.getElementById('caControl');
    const lensDistortionControl = document.getElementById('lensDistortionControl');
    const pixelationControl = document.getElementById('pixelationControl');
    const trailBlurControl = document.getElementById('trailBlurControl');
    const watercolorControl = document.getElementById('watercolorControl');
    const glassStripesIntensityControl = document.getElementById('glassStripesIntensityControl');
    const glassStripesFrequencyControl = document.getElementById('glassStripesFrequencyControl');
    const glassStripesDirectionControl = document.getElementById('glassStripesDirectionControl');
    const glassStripesDistortionControl = document.getElementById('glassStripesDistortionControl');
    const toneMappingControl = document.getElementById('toneMappingControl');
    
    if (filmNoiseControl) filmNoiseControl.style.display = filmEffectVal === 1 ? 'block' : 'none';
    if (bloomControl) bloomControl.style.display = filmEffectVal === 4 ? 'block' : 'none';
    if (caControl) caControl.style.display = filmEffectVal === 3 ? 'block' : 'none';
    if (lensDistortionControl) lensDistortionControl.style.display = filmEffectVal === 5 ? 'block' : 'none';
    if (pixelationControl) pixelationControl.style.display = filmEffectVal === 6 ? 'block' : 'none';
    if (trailBlurControl) trailBlurControl.style.display = filmEffectVal === 7 ? 'block' : 'none';
    if (watercolorControl) watercolorControl.style.display = filmEffectVal === 8 ? 'block' : 'none';
    if (glassStripesIntensityControl) glassStripesIntensityControl.style.display = filmEffectVal === 9 ? 'block' : 'none';
    if (glassStripesFrequencyControl) glassStripesFrequencyControl.style.display = filmEffectVal === 9 ? 'block' : 'none';
    if (glassStripesDirectionControl) glassStripesDirectionControl.style.display = filmEffectVal === 9 ? 'block' : 'none';
    if (glassStripesDistortionControl) glassStripesDistortionControl.style.display = filmEffectVal === 9 ? 'block' : 'none';
    if (toneMappingControl) toneMappingControl.style.display = filmEffectVal === 2 ? 'block' : 'none';
    
    // Set shader uniforms
    const twirlLocationValue = parseInt(document.getElementById('twirlLocation').value);
    gl.uniform1i(uniforms.waveCount, parseInt(document.getElementById('waveCount').value));
    gl.uniform1f(uniforms.waveAmplitude, parseFloat(document.getElementById('waveAmplitude').value));
    gl.uniform1f(uniforms.waveZoom, parseFloat(document.getElementById('waveZoom').value));
    gl.uniform1f(uniforms.waveFrequency, parseFloat(document.getElementById('waveFrequency').value));
    gl.uniform1f(uniforms.waveTwirl, parseFloat(document.getElementById('waveTwirl').value));
    gl.uniform1i(uniforms.twirlSources, parseInt(document.getElementById('twirlSources').value));
    gl.uniform1i(uniforms.twirlLocation, parseInt(document.getElementById('twirlLocation').value));
    gl.uniform1f(uniforms.twirlSeedX, twirlSeedX);
    gl.uniform1f(uniforms.twirlSeedY, twirlSeedY);
    gl.uniform1f(uniforms.turbulenceIntensity, parseFloat(document.getElementById('turbulence').value));
    gl.uniform1f(uniforms.noiseDisplacement, parseFloat(document.getElementById('noiseDisplacement').value));
    gl.uniform1f(uniforms.phaseRandomness, parseFloat(document.getElementById('phaseRandomness').value));
    gl.uniform1f(uniforms.amplitudeVariation, parseFloat(document.getElementById('amplitudeVariation').value));
    gl.uniform1f(uniforms.directionDrift, parseFloat(document.getElementById('directionDrift').value));
    gl.uniform1i(uniforms.blendMode, parseInt(document.getElementById('blendMode').value));
    gl.uniform1i(uniforms.filmEffect, filmEffectVal);
    
    // Set effect-specific uniforms
    const intensity = parseFloat(document.getElementById('filmNoiseIntensity').value);
    gl.uniform1f(uniforms.filmNoiseIntensity, intensity);
    
    const bloomIntensity = parseFloat(document.getElementById('bloomIntensity').value);
    gl.uniform1f(uniforms.bloomIntensity, bloomIntensity);
    
    const caAmount = parseFloat(document.getElementById('caAmount').value);
    gl.uniform1f(uniforms.caAmount, caAmount);
    
    const lensDistortion = parseFloat(document.getElementById('lensDistortion').value);
    gl.uniform1f(uniforms.lensDistortion, lensDistortion);
    
    const pixelationSize = parseFloat(document.getElementById('pixelationSize').value);
    gl.uniform1f(uniforms.pixelationSize, pixelationSize);
    
    const trailBlur = parseFloat(document.getElementById('trailBlur').value);
    gl.uniform1f(uniforms.trailBlur, trailBlur);
    
    const watercolor = parseFloat(document.getElementById('watercolor').value);
    gl.uniform1f(uniforms.watercolor, watercolor);
    
    const glassStripesIntensity = parseFloat(document.getElementById('glassStripesIntensity').value);
    gl.uniform1f(uniforms.glassStripesIntensity, glassStripesIntensity);
    
    const glassStripesFrequency = parseFloat(document.getElementById('glassStripesFrequency').value);
    gl.uniform1f(uniforms.glassStripesFrequency, glassStripesFrequency);
    
    const glassStripesDirection = parseInt(document.getElementById('glassStripesDirection').value);
    gl.uniform1i(uniforms.glassStripesDirection, glassStripesDirection);
    
    const glassStripesDistortion = parseFloat(document.getElementById('glassStripesDistortion').value);
    gl.uniform1f(uniforms.glassStripesDistortion, glassStripesDistortion);
    
    const toneMappingLUT = parseInt(document.getElementById('toneMappingLUT').value);
    gl.uniform1i(uniforms.toneMappingLUT, toneMappingLUT);
    
    const color1 = hexToRgb(document.getElementById('color1').value);
    const color2 = hexToRgb(document.getElementById('color2').value);
    const color3 = hexToRgb(document.getElementById('color3').value);
    const color4 = hexToRgb(document.getElementById('color4').value);
    const color5 = hexToRgb(document.getElementById('color5').value);
    const color6 = hexToRgb(document.getElementById('color6').value);
    const color7 = hexToRgb(document.getElementById('color7').value);
    const color8 = hexToRgb(document.getElementById('color8').value);
    
    gl.uniform3fv(uniforms.color1, color1);
    gl.uniform3fv(uniforms.color2, color2);
    gl.uniform3fv(uniforms.color3, color3);
    gl.uniform3fv(uniforms.color4, color4);
    gl.uniform3fv(uniforms.color5, color5);
    gl.uniform3fv(uniforms.color6, color6);
    gl.uniform3fv(uniforms.color7, color7);
    gl.uniform3fv(uniforms.color8, color8);
    
    // Set basic adjustment uniforms
    gl.uniform1f(uniforms.brightness, parseFloat(document.getElementById('brightness').value));
    gl.uniform1f(uniforms.contrast, parseFloat(document.getElementById('contrast').value));
    gl.uniform1f(uniforms.saturation, parseFloat(document.getElementById('saturation').value));
    
    // Update preset code display
    updatePresetCode();
    // Update overlay contrast (palette name + credits) based on current colors
    if (typeof updateOverlayContrast === 'function') updateOverlayContrast();
}


function updatePresetCode() {
    // Generate preset code from current settings
    const presetCode = generateCurrentPresetCode();
    const presetCodeElement = document.getElementById('presetCode');
    if (presetCodeElement) {
        presetCodeElement.value = presetCode;
    }
}

function generateCurrentPresetCode() {
    // Get all current values
    const color1 = document.getElementById('color1').value;
    const color2 = document.getElementById('color2').value;
    const color3 = document.getElementById('color3').value;
    const color4 = document.getElementById('color4').value;
    const color5 = document.getElementById('color5').value;
    const color6 = document.getElementById('color6').value;
    const color7 = document.getElementById('color7').value;
    const color8 = document.getElementById('color8').value;
    
    const waveCount = parseInt(document.getElementById('waveCount').value);
    const waveAmplitude = parseFloat(document.getElementById('waveAmplitude').value);
    const waveZoom = parseFloat(document.getElementById('waveZoom').value);
    const waveFrequency = parseFloat(document.getElementById('waveFrequency').value);
    const waveTwirl = parseFloat(document.getElementById('waveTwirl').value);
    const twirlSources = parseInt(document.getElementById('twirlSources').value);
    const twirlLocation = parseInt(document.getElementById('twirlLocation').value);
    const waveSpeed = parseFloat(document.getElementById('waveSpeed').value);
    
    // Special effects
    const turbulence = parseFloat(document.getElementById('turbulence').value);
    const noiseDisplacement = parseFloat(document.getElementById('noiseDisplacement').value);
    const phaseRandomness = parseFloat(document.getElementById('phaseRandomness').value);
    const amplitudeVariation = parseFloat(document.getElementById('amplitudeVariation').value);
    const directionDrift = parseFloat(document.getElementById('directionDrift').value);
    
    // Post-processing
    const blendMode = parseInt(document.getElementById('blendMode').value);
    const filmEffect = parseInt(document.getElementById('filmEffect').value);
    const filmNoiseIntensity = parseFloat(document.getElementById('filmNoiseIntensity').value);
    const bloomIntensity = parseFloat(document.getElementById('bloomIntensity').value);
    const caAmount = parseFloat(document.getElementById('caAmount').value);
    const lensDistortion = parseFloat(document.getElementById('lensDistortion').value);
    const pixelationSize = parseFloat(document.getElementById('pixelationSize').value);
    const trailBlur = parseFloat(document.getElementById('trailBlur').value);
    const watercolor = parseFloat(document.getElementById('watercolor').value);
    const toneMappingLUT = parseInt(document.getElementById('toneMappingLUT').value);
    
    // Basic adjustments
    const brightness = parseFloat(document.getElementById('brightness').value);
    const contrast = parseFloat(document.getElementById('contrast').value);
    const saturation = parseFloat(document.getElementById('saturation').value);
    
    // Get the current palette name from the overlay or generate a default
    const paletteNameElement = document.getElementById('paletteNameOverlay');
    let paletteName = paletteNameElement ? paletteNameElement.textContent : 'Untitled';
    
    // Convert palette name to a valid preset key (lowercase, kebab-case)
    const presetName = paletteName.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    
    // Build the preset object string
    let preset = `"${presetName}": {\n`;
    preset += `        color1: '${color1}', color2: '${color2}', color3: '${color3}', color4: '${color4}',\n`;
    preset += `        color5: '${color5}', color6: '${color6}', color7: '${color7}', color8: '${color8}',\n`;
    preset += `        waveCount: ${waveCount}, waveAmplitude: ${waveAmplitude}, waveZoom: ${waveZoom}, waveFrequency: ${waveFrequency},\n`;
    preset += `        waveTwirl: ${waveTwirl.toFixed(3)}, twirlSources: ${twirlSources}, twirlLocation: ${twirlLocation}, waveSpeed: ${waveSpeed}`;
    
    // Add special effects if they're not default values
    if (turbulence > 0 || noiseDisplacement > 0 || phaseRandomness > 0 || amplitudeVariation > 0 || directionDrift > 0) {
        preset += `,\n        turbulence: ${turbulence}, noiseDisplacement: ${noiseDisplacement}, phaseRandomness: ${phaseRandomness}, amplitudeVariation: ${amplitudeVariation}, directionDrift: ${directionDrift}`;
    }
    
    
    // Add post-processing if not default values
    if (blendMode > 0 || filmEffect > 0 || filmNoiseIntensity > 0 || bloomIntensity > 0 || caAmount > 0 || lensDistortion !== 0 || pixelationSize > 1 || trailBlur > 0 || watercolor > 0 || toneMappingLUT > 0) {
        preset += `,\n        blendMode: ${blendMode}`;
        if (filmEffect > 0) {
            preset += `, filmEffect: ${filmEffect}`;
            // Add fluted glass effect parameters when fluted glass effect is active (filmEffect = 9)
            if (filmEffect === 9) {
                const glassStripesFrequency = parseFloat(document.getElementById('glassStripesFrequency').value);
                const glassStripesIntensity = parseFloat(document.getElementById('glassStripesIntensity').value);
                const glassStripesDirection = parseInt(document.getElementById('glassStripesDirection').value);
                const glassStripesDistortion = parseFloat(document.getElementById('glassStripesDistortion').value);
                preset += `, glassStripesFrequency: ${glassStripesFrequency}, glassStripesIntensity: ${glassStripesIntensity}, glassStripesDirection: ${glassStripesDirection}, glassStripesDistortion: ${glassStripesDistortion}`;
            }
        }
        if (filmNoiseIntensity > 0) preset += `, filmNoiseIntensity: ${filmNoiseIntensity.toFixed(3)}`;
        if (bloomIntensity > 0) preset += `, bloomIntensity: ${bloomIntensity}`;
        if (caAmount > 0) preset += `, caAmount: ${caAmount.toFixed(4)}`;
        if (lensDistortion !== 0) preset += `, lensDistortion: ${lensDistortion.toFixed(2)}`;
        if (pixelationSize > 1) preset += `, pixelationSize: ${pixelationSize.toFixed(1)}`;
        if (trailBlur > 0) preset += `, trailBlur: ${trailBlur.toFixed(2)}`;
        if (watercolor > 0) preset += `, watercolor: ${watercolor.toFixed(2)}`;
        if (toneMappingLUT > 0) preset += `, toneMappingLUT: ${toneMappingLUT}`;
    }
    
    // Add basic adjustments if not default values
    if (brightness !== 0 || contrast !== 1.5 || saturation !== 1.5) {
        preset += `,\n        brightness: ${brightness}, contrast: ${contrast}, saturation: ${saturation}`;
    }
    
    preset += `\n    }`;
    
    return preset;
}

function copyPresetCode() {
    const presetCodeElement = document.getElementById('presetCode');
    if (presetCodeElement) {
        presetCodeElement.select();
        presetCodeElement.setSelectionRange(0, 99999); // For mobile devices
        
        try {
            document.execCommand('copy');
            // Brief visual feedback matching panel button style
            const button = document.querySelector('.copy-preset-btn');
            if (button) {
                // Apply success state (inverted like hover but with green tint)
                button.style.background = '#ffffff';
                button.style.color = '#28a745';
                button.title = 'Copied!';
                
                setTimeout(() => {
                    // Reset to original state
                    button.style.background = '';
                    button.style.color = '';
                    button.title = 'Copy Preset Code';
                }, 1000);
            }
        } catch (err) {
            console.error('Failed to copy preset code:', err);
            alert('Failed to copy to clipboard. Please select the text manually and copy.');
        }
    }
}

function animate() {
    const waveSpeed = parseFloat(document.getElementById('waveSpeed').value);
    gl.uniform1f(uniforms.time, performance.now() * 0.001 * waveSpeed);
    gl.uniform1f(uniforms.waveSpeed, waveSpeed);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    animationId = requestAnimationFrame(animate);
}

function loadPreset(presetName) {
    const preset = presets[presetName];
    if (!preset) return;

    // Load colors
    document.getElementById('color1').value = preset.color1;
    document.getElementById('color2').value = preset.color2;
    document.getElementById('color3').value = preset.color3;
    document.getElementById('color4').value = preset.color4;
    
    // Load edge midpoint colors with automatic generation if not specified
    document.getElementById('color5').value = preset.color5 ?? generateMidpointColor(preset.color1, preset.color2);
    document.getElementById('color6').value = preset.color6 ?? generateMidpointColor(preset.color2, preset.color3);
    document.getElementById('color7').value = preset.color7 ?? generateMidpointColor(preset.color3, preset.color4);
    document.getElementById('color8').value = preset.color8 ?? generateMidpointColor(preset.color4, preset.color1);

    // Load wave pattern settings with defaults for missing values
    document.getElementById('waveCount').value = preset.waveCount ?? 5;
    document.getElementById('waveAmplitude').value = preset.waveAmplitude ?? 1.5;
    document.getElementById('waveZoom').value = preset.waveZoom ?? 4.5;
    document.getElementById('waveFrequency').value = preset.waveFrequency ?? 1.0;
    document.getElementById('waveTwirl').value = preset.waveTwirl ?? 0;
    document.getElementById('twirlSources').value = preset.twirlSources ?? 1;
    document.getElementById('twirlLocation').value = preset.twirlLocation ?? 0;
    document.getElementById('waveSpeed').value = preset.waveSpeed ?? 0;

    // Load distortion effects with defaults
    document.getElementById('turbulence').value = preset.turbulence ?? 0;
    document.getElementById('noiseDisplacement').value = preset.noiseDisplacement ?? 0;
    document.getElementById('phaseRandomness').value = preset.phaseRandomness ?? 0;
    document.getElementById('amplitudeVariation').value = preset.amplitudeVariation ?? 0;
    document.getElementById('directionDrift').value = preset.directionDrift ?? 0;

    // Load fluted glass effect with defaults
    document.getElementById('glassStripesFrequency').value = preset.glassStripesFrequency ?? 50;
    document.getElementById('glassStripesIntensity').value = preset.glassStripesIntensity ?? 0.0;
    document.getElementById('glassStripesDirection').value = preset.glassStripesDirection ?? 0;
    document.getElementById('glassStripesDistortion').value = preset.glassStripesDistortion ?? 1.0;

    // Load post-processing settings with defaults for missing values
    document.getElementById('blendMode').value = preset.blendMode ?? 0;
    document.getElementById('filmEffect').value = preset.filmEffect ?? 0;
    document.getElementById('filmNoiseIntensity').value = Math.min(preset.filmNoiseIntensity ?? 0, 0.200);
    document.getElementById('bloomIntensity').value = preset.bloomIntensity ?? 0;
    document.getElementById('caAmount').value = preset.caAmount ?? 0;
    document.getElementById('lensDistortion').value = preset.lensDistortion ?? 0;
    document.getElementById('pixelationSize').value = preset.pixelationSize ?? 1;
    document.getElementById('trailBlur').value = preset.trailBlur ?? 0;
    document.getElementById('watercolor').value = preset.watercolor ?? 0;
    document.getElementById('toneMappingLUT').value = preset.toneMappingLUT ?? 0;

    // Load basic adjustments with defaults (enhanced values)
    document.getElementById('brightness').value = preset.brightness ?? 0;
    document.getElementById('contrast').value = preset.contrast ?? 1.5;
    document.getElementById('saturation').value = preset.saturation ?? 1.5;

    const presetSelect = document.getElementById('presetSelect');
    const selectedOption = presetSelect ? presetSelect.querySelector(`option[value="${presetName}"]`) : null;
    const displayName = selectedOption ? selectedOption.textContent : presetName;

    updatePaletteName(displayName);
    updateUniforms();
    if (presetSelect) presetSelect.value = presetName; // Keep the preset selected in dropdown

    // Ensure overlay contrast updates to reflect loaded preset colors
    if (typeof updateOverlayContrast === 'function') updateOverlayContrast();
}

// Helper functions for randomization
function isLightColor(hex) {
    // Convert hex to RGB and calculate luminance
    const r = parseInt(hex.substr(1, 2), 16);
    const g = parseInt(hex.substr(3, 2), 16);
    const b = parseInt(hex.substr(5, 2), 16);
    // Calculate relative luminance (0.299*R + 0.587*G + 0.114*B)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6; // Consider light if luminance > 60%
}

function isDarkColor(hex) {
    // Convert hex to RGB and calculate luminance
    const r = parseInt(hex.substr(1, 2), 16);
    const g = parseInt(hex.substr(3, 2), 16);
    const b = parseInt(hex.substr(5, 2), 16);
    // Calculate relative luminance (0.299*R + 0.587*G + 0.114*B)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.3; // Consider dark if luminance < 30%
}

function hasLightColors() {
    const color1 = document.getElementById('color1').value;
    const color2 = document.getElementById('color2').value;
    const color3 = document.getElementById('color3').value;
    const color4 = document.getElementById('color4').value;
    const color5 = document.getElementById('color5').value;
    const color6 = document.getElementById('color6').value;
    const color7 = document.getElementById('color7').value;
    const color8 = document.getElementById('color8').value;
    
    return isLightColor(color1) || isLightColor(color2) || 
           isLightColor(color3) || isLightColor(color4) ||
           isLightColor(color5) || isLightColor(color6) ||
           isLightColor(color7) || isLightColor(color8);
}

function hasDarkColors() {
    const color1 = document.getElementById('color1').value;
    const color2 = document.getElementById('color2').value;
    const color3 = document.getElementById('color3').value;
    const color4 = document.getElementById('color4').value;
    const color5 = document.getElementById('color5').value;
    const color6 = document.getElementById('color6').value;
    const color7 = document.getElementById('color7').value;
    const color8 = document.getElementById('color8').value;
    
    // Count how many colors are dark
    const darkCount = [color1, color2, color3, color4, color5, color6, color7, color8]
        .filter(color => isDarkColor(color)).length;
    
    // Consider "dark colors" if more than half are dark
    return darkCount >= 4;
}

function regenerateTwirlPositions() {
    // Generate new random seeds for twirl positions
    twirlSeedX = Math.random() * 10.0;
    twirlSeedY = Math.random() * 10.0;
}

/**
 * updateOverlayContrast()
 * Computes average luminance of the current 8 colors and toggles a
 * class on the `.overlay-container` so the palette name and credit icons
 * switch between light/dark styles for legibility.
 */
function updateOverlayContrast() {
    const ids = ['color1','color2','color3','color4','color5','color6','color7','color8'];
    let totalLum = 0;
    let count = 0;
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el || !el.value) return;
        const hex = el.value;
        const r = parseInt(hex.substr(1,2),16);
        const g = parseInt(hex.substr(3,2),16);
        const b = parseInt(hex.substr(5,2),16);
        const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
        totalLum += lum;
        count++;
    });
    if (count === 0) return;
    const avgLum = totalLum / count;
    const overlay = document.querySelector('.overlay-container');
    if (!overlay) return;
    // If average luminance is low, use light overlay text/icons; otherwise keep dark
    if (avgLum < 0.45) {
        overlay.classList.add('overlay--dark-bg');
    } else {
        overlay.classList.remove('overlay--dark-bg');
    }
}

/**
 * randomizeColorsOnly()
 * Randomizes only the color pickers (corner colors + edge midpoints)
 * without affecting wave, distortion or film effect settings. Useful
 * when iterating on color while keeping the current animation/texture.
 */
function randomizeColorsOnly() {
    // Decide scheme and whether to produce a dark palette
    const scheme = Math.random() < 0.5 ? 'analogous' : 'complementary';
    const dark = Math.random() < 0.45; // ~45% chance to generate darker tones

    const [c1, c2, c3, c4] = generatePalette({ scheme, dark });

    document.getElementById('color1').value = c1;
    document.getElementById('color2').value = c2;
    document.getElementById('color3').value = c3;
    document.getElementById('color4').value = c4;
    
    // Generate edge midpoint colors as blends of adjacent corners
    document.getElementById('color5').value = generateMidpointColor(c1, c2); // top edge
    document.getElementById('color6').value = generateMidpointColor(c2, c3); // right edge
    document.getElementById('color7').value = generateMidpointColor(c3, c4); // bottom edge
    document.getElementById('color8').value = generateMidpointColor(c4, c1); // left edge

    // Generate and display new palette name with updated colors
    const waveParams = {
        waveAmplitude: parseFloat(document.getElementById('waveAmplitude').value),
        waveZoom: parseFloat(document.getElementById('waveZoom').value),
        waveFrequency: parseFloat(document.getElementById('waveFrequency').value),
        waveTwirl: parseFloat(document.getElementById('waveTwirl').value),
        twirlSources: parseInt(document.getElementById('twirlSources').value),
        waveSpeed: parseFloat(document.getElementById('waveSpeed').value)
    };
    const paletteName = generateEnhancedPaletteName(null, waveParams);
    updatePaletteName(paletteName);

    // Update preset code to reflect new colors
    updatePresetCode();

    updateUniforms();
}

/**
 * randomize()
 * Performs a full randomization of the whole visual state, including
 * colors, wave parameters, distortion variables and filmic effects.
 * This is tied to the main "Randomize" button.
 *
 */
function randomize() {
    // Decide scheme and whether to produce a dark palette
    const scheme = Math.random() < 0.5 ? 'analogous' : 'complementary';
    const dark = Math.random() < 0.45; // ~45% chance to generate darker tones

    const [c1, c2, c3, c4] = generatePalette({ scheme, dark });

    document.getElementById('color1').value = c1;
    document.getElementById('color2').value = c2;
    document.getElementById('color3').value = c3;
    document.getElementById('color4').value = c4;
    
    // Generate edge midpoint colors as blends of adjacent corners
    document.getElementById('color5').value = generateMidpointColor(c1, c2); // top edge
    document.getElementById('color6').value = generateMidpointColor(c2, c3); // right edge
    document.getElementById('color7').value = generateMidpointColor(c3, c4); // bottom edge
    document.getElementById('color8').value = generateMidpointColor(c4, c1); // left edge

    // Randomize wave parameters within sensible ranges (4-16)
    document.getElementById('waveCount').value = 4 + Math.floor(Math.random() * 13); // 4-16
    document.getElementById('waveAmplitude').value = (0.5 + Math.random() * 9.5).toFixed(2); // 0.5 to 10.0
    document.getElementById('waveZoom').value = (0.5 + Math.random() * 11.5).toFixed(1); // 0.5 to 12.0 (zoom)
    document.getElementById('waveFrequency').value = (0.1 + Math.random() * 2.9).toFixed(1); // 0.1 to 3.0 (frequency)
    document.getElementById('waveTwirl').value = (Math.random() * 0.200).toFixed(3); // 0.000 to 0.200 (twirl)
    document.getElementById('waveSpeed').value = (0.2 + Math.random() * 2.8).toFixed(1); // 0.2 to 3.0 (animation speed)
    
    // Randomize distortion effects (excluding Specials)
    document.getElementById('phaseRandomness').value = (Math.random() * 3.0).toFixed(1); // 0.0 to 3.0
    document.getElementById('directionDrift').value = (Math.random() * 2.0).toFixed(1); // 0.0 to 2.0
    
    // Randomize twirl source parameters
    document.getElementById('twirlSources').value = 1 + Math.floor(Math.random() * 6); // 1-6 sources
    document.getElementById('twirlLocation').value = Math.floor(Math.random() * 3); // 0 (center), 1 (random), or 2 (corners)
    
    // Generate new random seeds for twirl positions
    twirlSeedX = Math.random() * 10.0;
    twirlSeedY = Math.random() * 10.0;

    // Randomize blend mode with smart exclusions
    let blendMode = Math.floor(Math.random() * 4); // 0-3 (Smooth, Multiply, Screen, Overlay)
    
    // Exception: Avoid Multiply and Overlay blend modes with dark colors (would create very dark results)
    if ((blendMode === 1 || blendMode === 3) && hasDarkColors()) {
        // If multiply/overlay + dark colors, choose smooth or screen instead
        const alternativeBlendModes = [0, 2]; // Smooth or Screen only
        blendMode = alternativeBlendModes[Math.floor(Math.random() * alternativeBlendModes.length)];
    }
    
    document.getElementById('blendMode').value = blendMode;

    // Reset filmic effects to default (no effects) during randomization
    document.getElementById('filmEffect').value = 0; // No effect
    document.getElementById('filmNoiseIntensity').value = 0;
    document.getElementById('bloomIntensity').value = 0;
    document.getElementById('caAmount').value = 0;
    document.getElementById('lensDistortion').value = 0;
    document.getElementById('pixelationSize').value = 1;
    document.getElementById('trailBlur').value = 0;
    document.getElementById('watercolor').value = 0;
    document.getElementById('glassStripesIntensity').value = 0.0;
    document.getElementById('glassStripesFrequency').value = 50;
    document.getElementById('toneMappingLUT').value = 0;

    // Generate and display palette name
    const waveParams = {
        waveAmplitude: parseFloat(document.getElementById('waveAmplitude').value),
        waveZoom: parseFloat(document.getElementById('waveZoom').value),
        waveFrequency: parseFloat(document.getElementById('waveFrequency').value),
        waveTwirl: parseFloat(document.getElementById('waveTwirl').value),
        twirlSources: parseInt(document.getElementById('twirlSources').value),
        waveSpeed: parseFloat(document.getElementById('waveSpeed').value)
    };
    const paletteName = generateEnhancedPaletteName(null, waveParams);
    updatePaletteName(paletteName);

    updateUniforms();
}

function exportImage() {
    // Pause animation to get a clean frame
    const wasAnimating = animationId !== null;
    if (wasAnimating) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // Force a render
    const waveSpeed = parseFloat(document.getElementById('waveSpeed').value);
    gl.uniform1f(uniforms.time, performance.now() * 0.001 * waveSpeed);
    gl.uniform1f(uniforms.waveSpeed, waveSpeed);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    try {
        // Get the current palette name
        const paletteNameElement = document.getElementById('paletteNameOverlay');
        const paletteName = paletteNameElement ? paletteNameElement.textContent.toLowerCase().replace(/\s+/g, '-') : 'untitled';
        
        // Generate shorter random number (4 digits)
        const randomNum = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
        
        // Create download link
        const link = document.createElement('a');
        link.download = `rippl5-${paletteName}-${randomNum}.png`;
        
        // Convert canvas to blob for better browser support
        canvas.toBlob(function(blob) {
            if (blob) {
                const url = URL.createObjectURL(blob);
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Clean up the object URL
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } else {
                // Fallback to dataURL method
                link.href = canvas.toDataURL('image/png', 1.0);
                link.click();
            }
        }, 'image/png', 1.0);
        
    } catch (error) {
        console.error('Export failed:', error);
        
        // Alternative method - right-click save
        alert('Direct download failed. Please right-click on the canvas and select "Save image as..." to download your wallpaper.');
    }
    
    // Resume animation if it was running
    if (wasAnimating) {
        animate();
    }
}

// Video recording functionality
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let recordingStartTime;
let recordingInterval;

async function toggleVideoRecording() {
    if (!isRecording) {
        await startVideoRecording();
    } else {
        stopVideoRecording();
    }
}

async function startVideoRecording() {
    try {
        // Get recording parameters
        const duration = parseInt(document.getElementById('videoDuration').value);
        const quality = document.getElementById('videoQuality').value;
        const format = document.getElementById('videoFormat').value;
        
        // Parse quality settings
        const [width, height] = quality.split('x').map(Number);
        
        // Create a high-resolution canvas for recording
        const recordingCanvas = document.createElement('canvas');
        recordingCanvas.width = width;
        recordingCanvas.height = height;
        
        // Get WebGL context for recording canvas
        const recordingGL = recordingCanvas.getContext('webgl2') || recordingCanvas.getContext('webgl');
        if (!recordingGL) {
            throw new Error('WebGL not supported for recording');
        }
        
        // Set up recording canvas with same shader program
        setupRecordingCanvas(recordingGL, recordingCanvas);
        
        // Get media stream from recording canvas with higher frame rate
        const stream = recordingCanvas.captureStream(60); // 60 FPS
        
        // Configure MediaRecorder with better codec options
        let mimeType;
        let options;
        
        if (format === 'webm') {
            // Prefer VP9 for WebM, fallback to VP8
            if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                mimeType = 'video/webm;codecs=vp9';
            } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
                mimeType = 'video/webm;codecs=vp8';
            } else {
                mimeType = 'video/webm';
            }
            options = {
                mimeType: mimeType,
                videoBitsPerSecond: width >= 3840 ? 50000000 : width >= 2560 ? 20000000 : 8000000
            };
        } else {
            // For MP4, try different codec combinations
            if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264')) {
                mimeType = 'video/mp4;codecs=h264';
            } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')) {
                mimeType = 'video/mp4;codecs=avc1.42E01E';
            } else if (MediaRecorder.isTypeSupported('video/mp4')) {
                mimeType = 'video/mp4';
            } else {
                // Fallback to WebM if MP4 not supported
                mimeType = 'video/webm';
                console.warn('MP4 not supported, falling back to WebM');
            }
            options = {
                mimeType: mimeType,
                videoBitsPerSecond: width >= 3840 ? 40000000 : width >= 2560 ? 16000000 : 6000000
            };
        }
        
        console.log('Recording with:', mimeType, 'at', width + 'x' + height);
        
        mediaRecorder = new MediaRecorder(stream, options);
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
                console.log('Data chunk recorded:', event.data.size, 'bytes');
            }
        };
        
        mediaRecorder.onstop = () => {
            console.log('Recording stopped, total chunks:', recordedChunks.length);
            downloadRecording(format, mimeType);
            cleanupRecording();
        };
        
        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event.error);
            alert('Recording error: ' + event.error.message);
            cleanupRecording();
        };
        
        // Start recording with smaller time slices for better MP4 compatibility
        mediaRecorder.start(100); // Request data every 100ms
        isRecording = true;
        recordingStartTime = Date.now();
        
        // Update UI
        updateRecordingUI(true);
        
        // Start recording timer
        recordingInterval = setInterval(() => {
            updateRecordingTimer();
        }, 100);
        
        // Start high-quality rendering loop with consistent timing
        startRecordingRenderLoop(recordingGL, recordingCanvas);
        
        // Auto-stop after duration
        setTimeout(() => {
            if (isRecording) {
                stopVideoRecording();
            }
        }, duration * 1000);
        
    } catch (error) {
        console.error('Error starting video recording:', error);
        alert('Failed to start video recording: ' + error.message);
    }
}

function stopVideoRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Clear recording timer
        if (recordingInterval) {
            clearInterval(recordingInterval);
            recordingInterval = null;
        }
        
        // Update UI
        updateRecordingUI(false);
    }
}

function setupRecordingCanvas(recordingGL, recordingCanvas) {
    // Set up WebGL context for recording (same as main canvas)
    recordingGL.viewport(0, 0, recordingCanvas.width, recordingCanvas.height);
    
    // Create and compile shaders (reuse existing shader sources)
    const vertexShader = createRecordingShader(recordingGL, recordingGL.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createRecordingShader(recordingGL, recordingGL.FRAGMENT_SHADER, fragmentShaderSource);
    
    // Create program
    const recordingProgram = createProgram(recordingGL, vertexShader, fragmentShader);
    recordingGL.useProgram(recordingProgram);
    
    // Set up geometry (same as main canvas)
    const positionBuffer = recordingGL.createBuffer();
    recordingGL.bindBuffer(recordingGL.ARRAY_BUFFER, positionBuffer);
    recordingGL.bufferData(recordingGL.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1, 1, 1
    ]), recordingGL.STATIC_DRAW);
    
    const positionLocation = recordingGL.getAttribLocation(recordingProgram, 'position');
    recordingGL.enableVertexAttribArray(positionLocation);
    recordingGL.vertexAttribPointer(positionLocation, 2, recordingGL.FLOAT, false, 0, 0);
    
    // Store for rendering
    recordingCanvas.gl = recordingGL;
    recordingCanvas.program = recordingProgram;
    recordingCanvas.uniforms = getUniformLocations(recordingGL, recordingProgram);
}

function createRecordingShader(recordingGL, type, source) {
    const shader = recordingGL.createShader(type);
    recordingGL.shaderSource(shader, source);
    recordingGL.compileShader(shader);
    
    if (!recordingGL.getShaderParameter(shader, recordingGL.COMPILE_STATUS)) {
        console.error('Recording shader compilation error:', recordingGL.getShaderInfoLog(shader));
        recordingGL.deleteShader(shader);
        return null;
    }
    
    return shader;
}

function startRecordingRenderLoop(recordingGL, recordingCanvas) {
    let lastFrameTime = 0;
    const targetFrameTime = 1000 / 60; // 60 FPS = 16.67ms per frame
    
    function renderFrame(currentTime) {
        if (!isRecording) return;
        
        // Throttle to maintain consistent 60 FPS
        if (currentTime - lastFrameTime >= targetFrameTime) {
            // Update resolution uniform for recording canvas
            recordingGL.uniform2f(recordingCanvas.uniforms.resolution, recordingCanvas.width, recordingCanvas.height);
            
            // Copy all current uniform values to recording canvas
            copyUniformsToRecordingCanvas(recordingGL, recordingCanvas.uniforms);
            
            // Render frame
            recordingGL.clearColor(0, 0, 0, 1);
            recordingGL.clear(recordingGL.COLOR_BUFFER_BIT);
            recordingGL.drawArrays(recordingGL.TRIANGLE_STRIP, 0, 4);
            
            // Force the frame to be available for capture
            recordingGL.flush();
            recordingGL.finish();
            
            lastFrameTime = currentTime;
        }
        
        // Continue loop
        if (isRecording) {
            requestAnimationFrame(renderFrame);
        }
    }
    
    // Start the render loop
    requestAnimationFrame(renderFrame);
}

function copyUniformsToRecordingCanvas(recordingGL, recordingUniforms) {
    // Copy all uniform values from main canvas to recording canvas
    const waveSpeed = parseFloat(document.getElementById('waveSpeed').value);
    recordingGL.uniform1f(recordingUniforms.time, performance.now() * 0.001 * waveSpeed);
    recordingGL.uniform1f(recordingUniforms.waveSpeed, waveSpeed);
    
    // Wave parameters
    recordingGL.uniform1i(recordingUniforms.waveCount, parseInt(document.getElementById('waveCount').value));
    recordingGL.uniform1f(recordingUniforms.waveAmplitude, parseFloat(document.getElementById('waveAmplitude').value));
    recordingGL.uniform1f(recordingUniforms.waveFrequency, parseFloat(document.getElementById('waveFrequency').value));
    recordingGL.uniform1f(recordingUniforms.waveZoom, parseFloat(document.getElementById('waveZoom').value));
    recordingGL.uniform1f(recordingUniforms.waveTwirl, parseFloat(document.getElementById('waveTwirl').value));
    recordingGL.uniform1i(recordingUniforms.twirlSources, parseInt(document.getElementById('twirlSources').value));
    recordingGL.uniform1i(recordingUniforms.twirlLocation, parseInt(document.getElementById('twirlLocation').value));
    recordingGL.uniform1f(recordingUniforms.twirlSeedX, twirlSeedX);
    recordingGL.uniform1f(recordingUniforms.twirlSeedY, twirlSeedY);
    
    // Special effects
    recordingGL.uniform1f(recordingUniforms.turbulenceIntensity, parseFloat(document.getElementById('turbulence').value));
    recordingGL.uniform1f(recordingUniforms.noiseDisplacement, parseFloat(document.getElementById('noiseDisplacement').value));
    recordingGL.uniform1f(recordingUniforms.phaseRandomness, parseFloat(document.getElementById('phaseRandomness').value));
    recordingGL.uniform1f(recordingUniforms.amplitudeVariation, parseFloat(document.getElementById('amplitudeVariation').value));
    recordingGL.uniform1f(recordingUniforms.directionDrift, parseFloat(document.getElementById('directionDrift').value));
    
    // Blend mode and film effects
    recordingGL.uniform1i(recordingUniforms.blendMode, parseInt(document.getElementById('blendMode').value));
    recordingGL.uniform1i(recordingUniforms.filmEffect, parseInt(document.getElementById('filmEffect').value));
    recordingGL.uniform1f(recordingUniforms.filmNoiseIntensity, parseFloat(document.getElementById('filmNoiseIntensity').value));
    recordingGL.uniform1f(recordingUniforms.bloomIntensity, parseFloat(document.getElementById('bloomIntensity').value));
    recordingGL.uniform1f(recordingUniforms.caAmount, parseFloat(document.getElementById('caAmount').value));
    recordingGL.uniform1f(recordingUniforms.lensDistortion, parseFloat(document.getElementById('lensDistortion').value));
    recordingGL.uniform1f(recordingUniforms.pixelationSize, parseFloat(document.getElementById('pixelationSize').value));
    recordingGL.uniform1f(recordingUniforms.trailBlur, parseFloat(document.getElementById('trailBlur').value));
    recordingGL.uniform1f(recordingUniforms.watercolor, parseFloat(document.getElementById('watercolor').value));
    recordingGL.uniform1i(recordingUniforms.toneMappingLUT, parseInt(document.getElementById('toneMappingLUT').value));
    
    // Glass effect uniforms
    recordingGL.uniform1f(recordingUniforms.glassStripesIntensity, parseFloat(document.getElementById('glassStripesIntensity').value));
    recordingGL.uniform1f(recordingUniforms.glassStripesFrequency, parseFloat(document.getElementById('glassStripesFrequency').value));
    recordingGL.uniform1i(recordingUniforms.glassStripesDirection, parseInt(document.getElementById('glassStripesDirection').value));
    recordingGL.uniform1f(recordingUniforms.glassStripesDistortion, parseFloat(document.getElementById('glassStripesDistortion').value));
    
    // Colors
    recordingGL.uniform3fv(recordingUniforms.color1, hexToRgb(document.getElementById('color1').value));
    recordingGL.uniform3fv(recordingUniforms.color2, hexToRgb(document.getElementById('color2').value));
    recordingGL.uniform3fv(recordingUniforms.color3, hexToRgb(document.getElementById('color3').value));
    recordingGL.uniform3fv(recordingUniforms.color4, hexToRgb(document.getElementById('color4').value));
    recordingGL.uniform3fv(recordingUniforms.color5, hexToRgb(document.getElementById('color5').value));
    recordingGL.uniform3fv(recordingUniforms.color6, hexToRgb(document.getElementById('color6').value));
    recordingGL.uniform3fv(recordingUniforms.color7, hexToRgb(document.getElementById('color7').value));
    recordingGL.uniform3fv(recordingUniforms.color8, hexToRgb(document.getElementById('color8').value));
    
    // Basic adjustments
    recordingGL.uniform1f(recordingUniforms.brightness, parseFloat(document.getElementById('brightness').value));
    recordingGL.uniform1f(recordingUniforms.contrast, parseFloat(document.getElementById('contrast').value));
    recordingGL.uniform1f(recordingUniforms.saturation, parseFloat(document.getElementById('saturation').value));
}

function updateRecordingUI(recording) {
    const recordBtn = document.getElementById('videoRecordBtn');
    const recordBtnPanel = document.getElementById('btnVideoRecord');
    const recordingStatus = document.getElementById('recordingStatus');
    
    if (recording) {
        recordBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-stop"></use></svg> Stop Recording';
        recordBtn.classList.add('recording');
        recordBtnPanel.classList.add('recording');
        recordingStatus.style.display = 'flex';
    } else {
        recordBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-video"></use></svg> Start Recording';
        recordBtn.classList.remove('recording');
        recordBtnPanel.classList.remove('recording');
        recordingStatus.style.display = 'none';
    }
}

function updateRecordingTimer() {
    if (!recordingStartTime) return;
    
    const elapsed = (Date.now() - recordingStartTime) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.floor(elapsed % 60);
    
    const timeDisplay = document.querySelector('.recording-time');
    if (timeDisplay) {
        timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function downloadRecording(format, actualMimeType) {
    if (recordedChunks.length === 0) return;
    
    // Determine the actual format from MIME type if needed
    let fileExtension = format;
    if (actualMimeType) {
        if (actualMimeType.includes('webm')) {
            fileExtension = 'webm';
        } else if (actualMimeType.includes('mp4')) {
            fileExtension = 'mp4';
        }
    }
    
    const blob = new Blob(recordedChunks, {
        type: actualMimeType || (format === 'webm' ? 'video/webm' : 'video/mp4')
    });
    
    // Get the current palette name for filename
    const paletteNameElement = document.getElementById('paletteNameOverlay');
    const paletteName = paletteNameElement ? paletteNameElement.textContent.toLowerCase().replace(/\s+/g, '-') : 'untitled';
    
    const randomNum = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    const quality = document.getElementById('videoQuality').value;
    
    const filename = `rippl5-${paletteName}-${quality}-${randomNum}.${fileExtension}`;
    
    console.log('Downloading:', filename, 'Size:', blob.size, 'bytes', 'Type:', blob.type);
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cleanupRecording() {
    recordedChunks = [];
    recordingStartTime = null;
    
    if (recordingInterval) {
        clearInterval(recordingInterval);
        recordingInterval = null;
    }
}

// Initialize when page loads
window.addEventListener('load', init);
