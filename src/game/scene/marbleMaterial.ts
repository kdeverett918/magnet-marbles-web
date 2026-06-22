import * as THREE from "three";

/**
 * Custom "cat's-eye glass" marble material for the hero/player shooters.
 * Gives a glossy candy-glass look: internal swirl core, fresnel rim,
 * crisp specular highlight, subtle iridescence — matching the style anchors.
 */
export function makeMarbleMaterial(colorHex: string, accentHex = "#ffffff"): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uAccent: { value: new THREE.Color(accentHex) },
      uTime: { value: 0 },
      uSwirl: { value: Math.random() * 6.28 },
      uLightDir: { value: new THREE.Vector3(0.4, 0.9, 0.5).normalize() },
      uEnv: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uColor;
      uniform vec3 uAccent;
      uniform float uTime;
      uniform float uSwirl;
      uniform vec3 uLightDir;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vLocal;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vView);
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 2.5);

        // --- internal cat's-eye S-swirl (yin-yang style, 2 arms) ---
        vec3 p = normalize(vLocal);
        float ang = atan(p.z, p.x);
        float rad = length(vLocal.xz);
        float spiral = sin(2.0 * ang + 7.0 * rad + uSwirl + uTime * 0.35);
        float core = smoothstep(0.15, 0.95, 0.5 + 0.5 * spiral);
        // a brighter ribbon down the centre of each swirl arm
        float ribbon = smoothstep(0.78, 1.0, 0.5 + 0.5 * spiral);

        // translucent depth: darker toward the silhouette, glassy core
        float depth = mix(1.0, 0.45, smoothstep(0.2, 1.0, rad));
        vec3 deep = uColor * 0.28;
        vec3 mid  = uColor * 0.95;
        vec3 lite = mix(uAccent, vec3(1.0), 0.62);
        vec3 base = mix(deep, mid, core) * depth;
        base = mix(base, lite, ribbon * 0.78);

        // --- specular: tight hotspot + broad sheen ---
        vec3 H = normalize(uLightDir + V);
        float ndh = max(dot(N, H), 0.0);
        float hot = pow(ndh, 220.0);          // sharp white dot
        float sheen = pow(ndh, 18.0) * 0.35;  // soft sheen

        // --- iridescent fresnel rim ---
        vec3 irid = 0.5 + 0.5 * cos(6.2831 * (fres * 1.2 + vec3(0.0, 0.33, 0.66)));
        vec3 rimColor = mix(uColor, uAccent, 0.38);
        vec3 rim = mix(rimColor * 1.2, irid, 0.55) * fres * 1.5;

        // subtle inner sparkle
        float spk = pow(max(0.0, sin(rad * 60.0 + ang * 8.0 + uSwirl)), 30.0) * (1.0 - rad);

        vec3 col = base + rim + vec3(hot) * 1.4 + vec3(sheen) + uAccent * spk * 0.5;
        col += mix(uColor, uAccent, 0.18) * 0.06; // ambient lift
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
