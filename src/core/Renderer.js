// WebGL renderer + pmndrs postprocessing stack:
// RenderPass -> [Bloom (high threshold), ACES tone mapping, cinematic grade, vignette]
//            -> [SMAA] -> [speed FX: radial blur + chromatic aberration, only while boosting].
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, SMAAEffect, SMAAPreset, Effect, BlendFunction, EffectAttribute,
} from 'postprocessing';

const gradeFrag = /* glsl */ `
uniform float frost;
uniform float damage;
uniform float ghost;
uniform float flash;
uniform vec3 flashColor;
uniform float time;
uniform float saturation;
uniform float warmth;

float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Split toning (multiplicative): deep teal shadows, warm orange highlights.
  float hl = smoothstep(0.04, 0.55, l);
  c *= mix(vec3(0.86, 1.0, 1.1), mix(vec3(1.0), vec3(1.08, 1.0, 0.9), warmth), hl);
  c += vec3(0.0, 0.0025, 0.004) * (1.0 - hl);
  // Saturated neon accents.
  c = mix(vec3(l), c, saturation);
  // Ghost Mode: desaturated, cool, slightly darker.
  c = mix(c, vec3(l) * vec3(0.75, 0.9, 1.0), ghost * 0.55);
  vec2 d = uv - 0.5;
  float r = length(d * vec2(1.6, 1.0));
  float edge = smoothstep(0.35, 0.95, r);
  // Cold Snap frost tint with crystalline edges.
  float crystal = h21(floor(uv * vec2(160.0, 90.0)));
  c = mix(c, vec3(l) * vec3(0.72, 0.92, 1.3) + vec3(0.01, 0.04, 0.08), frost * 0.55);
  c += vec3(0.55, 0.8, 1.0) * edge * frost * (0.25 + 0.35 * crystal);
  // Damage: pulsing red edges.
  c += vec3(0.75, 0.02, 0.02) * edge * damage;
  // Screen flash for big moves and impacts.
  c = mix(c, flashColor, clamp(flash, 0.0, 1.0));
  outputColor = vec4(c, inputColor.a);
}
`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeFrag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['frost', new THREE.Uniform(0)],
        ['damage', new THREE.Uniform(0)],
        ['ghost', new THREE.Uniform(0)],
        ['flash', new THREE.Uniform(0)],
        ['flashColor', new THREE.Uniform(new THREE.Color(1, 1, 1))],
        ['time', new THREE.Uniform(0)],
        ['saturation', new THREE.Uniform(1.18)],
        ['warmth', new THREE.Uniform(1)],
      ]),
    });
  }
}

const speedFrag = /* glsl */ `
uniform float strength;
uniform float aberration;
uniform vec2 center;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (strength < 0.002 && aberration < 0.002) { outputColor = inputColor; return; }
  vec2 dir = uv - center;
  float dist = length(dir);
  float amt = strength * smoothstep(0.08, 0.7, dist);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 10; i++) {
    float t = float(i) / 9.0;
    float w = 1.0 - t * 0.6;
    acc += texture2D(inputBuffer, uv - dir * amt * t * 0.12).rgb * w;
    wsum += w;
  }
  vec3 col = acc / wsum;
  // Chromatic aberration at the screen edges.
  float ca = aberration * dist * dist * 0.02;
  col.r = mix(col.r, texture2D(inputBuffer, uv + dir * ca).r, step(0.0001, aberration));
  col.b = mix(col.b, texture2D(inputBuffer, uv - dir * ca).b, step(0.0001, aberration));
  outputColor = vec4(col, inputColor.a);
}
`;

class SpeedEffect extends Effect {
  constructor() {
    super('SpeedEffect', speedFrag, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['strength', new THREE.Uniform(0)],
        ['aberration', new THREE.Uniform(0)],
        ['center', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
      ]),
    });
  }
}

export class Renderer {
  constructor(canvas, settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true,
      preserveDrawingBuffer: false,
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.15, 4000);

    this.composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new BloomEffect({
      intensity: 1.15, luminanceThreshold: 0.92, luminanceSmoothing: 0.12, mipmapBlur: true, radius: 0.72, levels: 7,
    });
    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.grade = new GradeEffect();
    this.vignette = new VignetteEffect({ darkness: 0.52, offset: 0.32 });
    this.mainPass = new EffectPass(this.camera, this.bloom, this.toneMapping, this.grade, this.vignette);
    this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this.smaaPass = new EffectPass(this.camera, this.smaa);
    this.speed = new SpeedEffect();
    this.speedPass = new EffectPass(this.camera, this.speed);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.mainPass);
    this.composer.addPass(this.smaaPass);
    this.composer.addPass(this.speedPass);

    this.fx = { frost: 0, damage: 0, ghost: 0, flash: 0, speedBlur: 0, aberration: 0 };
    this.applyQuality();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get maxAnisotropy() {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  applyQuality() {
    const p = this.settings.preset;
    this.pixelRatio = Math.min(2, Math.min(window.devicePixelRatio || 1, 2) * p.pixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = p.shadows;
    this.smaaPass.enabled = p.smaa;
    this.bloom.resolution.scale = p.bloomResolution;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setFlash(amount, color = 0xffffff) {
    this.fx.flash = Math.max(this.fx.flash, amount);
    this.grade.uniforms.get('flashColor').value.set(color);
  }

  render(dt) {
    const fx = this.fx;
    fx.flash = Math.max(0, fx.flash - dt * 3.5);
    const u = this.grade.uniforms;
    u.get('frost').value = fx.frost;
    u.get('damage').value = fx.damage;
    u.get('ghost').value = fx.ghost;
    u.get('flash').value = fx.flash;
    u.get('time').value += dt;
    const blurOn = this.settings.get('motionBlur') && this.settings.preset.motionBlur;
    const s = blurOn ? fx.speedBlur : 0;
    this.speed.uniforms.get('strength').value = s;
    this.speed.uniforms.get('aberration').value = fx.aberration;
    this.renderer.info.reset();
    this.composer.render(dt);
  }
}
